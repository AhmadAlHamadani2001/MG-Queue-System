# MG Queue System — working prototype

A real, wired-together prototype of the MG after-sales queue system:
customer registration → live tracking → advisor dashboard → head office
overview → internal request management → staff logins and roles. All
synced in real time through Supabase.

| Route | Who | What it does |
|---|---|---|
| `/branch/JED-01` | Customer, no login | Registers (mobile, name, appointment/walk-in, service type + WIP number for appointments), gets a ticket |
| `/t/[ticketId]` | Customer, no login | Live position + "you're being called" screen — Supabase Realtime, no refresh |
| `/login` | Staff | Sign in with work email + password |
| `/advisor/JED-01` | Advisor / Manager (logged in) | Live queue, Serve now, Complete, No-show (recoverable), Transfer to Manager |
| `/advisor/JED-01/analytics` | Advisor / Manager (logged in) | Today's live counts: wait time, service time, walk-in vs appointment |
| `/advisor/JED-01/customers` | Advisor / Manager (logged in) | Searchable list of every ticket ever logged at that branch |
| `/hq` | Anyone | Live waiting counts across all seeded branches |
| `/team` | Any logged-in staff | Searchable directory of all 282 employees |
| `/admin` | Admins only | View/edit every login account, including passwords |
| `/requests/*` | Any logged-in staff | Request Management module — see section 4 |

---

## 1. Set up Supabase

Run these in **Supabase Studio → SQL Editor**, in this exact order —
several files reference tables the previous one creates:

1. **`supabase/schema.sql`** — `branches` + `queue_tickets`, ticket-number trigger, RLS, Realtime, seeds 3 demo branches (`JED-01`, `RUH-01`, `DMM-01`).
2. **`supabase/seed-demo-data.sql`** *(optional)* — ~35 dummy tickets across all statuses, so the dashboards aren't empty. Safe to re-run any time; it clears and regenerates.
3. **`supabase/schema-requests.sql`** — `employees`, `requests`, append-only `request_audit_log`.
4. **`supabase/seed-employees.sql`** — loads all 282 people from your `Employees.xlsx` into `employees`. Run this before creating any requests (it truncates `employees`, `requests`, and `request_audit_log` together, since requests reference employees).
5. **`supabase/schema-v2.sql`** — adds the login system (`app_users`), maps the 3 demo branches to their real-world equivalent (`employee_branch`), upgrades `requests` with an approval workflow (`approved`/`rejected`/`returned` statuses, a `locked` flag) and adds `request_payment_lines` (a request can have several payment lines — cash/warranty/internal — closed independently).
6. **`supabase/seed-app-users.sql`** — creates a login for all 282 employees. Passwords follow a simple `FirstName@123` pattern (see the security note below). Safe to re-run — it truncates and regenerates `app_users`.
7. **`supabase/schema-v3.sql`** — adds `request_type_lines` (so a request can run Approval and Delegation as two independent threads), adds an `assignee_id`/`assignee_name` to `request_payment_lines` (assign a different person per payment type), and tags `request_audit_log` rows to a specific thread via `type_line_id`.
8. **`supabase/schema-v4.sql`** — tags audit-log rows to a specific *payment* line too (`payment_line_id`), and widens payment-line status to `open → in_progress → closed` so they support the same Start process / Close request buttons as everything else.
9. **`supabase/schema-v5.sql`** — removes the one-per-type limit on payment lines, so a WIP can have multiple lines of the same type ("Cash 1", "Cash 2").
10. **`supabase/schema-v6.sql`** — adds `awaiting_approval` (so Approve/Reject/Return only appear after "Approval" is clicked) and `delegated_by` (so "Done" can automatically reassign a line back to whoever delegated it).
11. **`supabase/schema-v7.sql`** — adds `approval_requested_by` (so Return can hand a line back to whoever requested the approval, and so that person can also reassign it) and `branch` on `requests` (groundwork for a same-branch duplicate-WIP warning).
12. **`supabase/schema-v8.sql`** — adds the remaining 9 real branches from `Employees.xlsx` (previously only 3 existed), each with its own customer link and scoped queue.
13. **`supabase/schema-v9.sql`** — adds the missing `update` policy on `employees`, needed for the new admin team-editing feature.
14. **`supabase/schema-v10.sql`** — removes Head Office as a fake branch, clears its `demo_branch_code` mapping, and adds the missing insert/update/delete policies on `branches` and insert/delete policies on `app_users` (needed for the new admin add/edit/delete features).
15. **`supabase/schema-v11.sql`** — adds `inquiry`/`spare_parts` service types, `preassigned_advisor` on tickets, a new `parts_advisor` role, reclassifies anyone with a Parts-related title, and backfills branch routing for all 12 branches.
16. **`supabase/schema-v12.sql`** — adds `preassign_urgent`, so a manager assigning a customer to an advisor can choose "urgent" (jumps the queue) or "normal" (reserved for that advisor, but still served in turn).
17. **`supabase/schema-v13.sql`** — adds the Forms module (`form_templates`, `form_submissions`), seeded with the Customer Satisfaction Agreement digitized from your Word document.
18. **`supabase/schema-v14.sql`** — adds table support (`tables` column) and a `required` flag per field, and seeds three more digitized forms: Complaint Waiver, Repair Request Agreement, and Customer Satisfaction Discount Form.
19. **`supabase/schema-v15.sql`** — replaces the Complaint Waiver Form's layout with a clean, from-scratch design (plain field list + terms + signature) instead of mirroring the original Word document's grid cell-for-cell.
20. **`supabase/schema-v16.sql`** — collapses the Repair Request Agreement's 12 flat finding fields (a fixed 6-row layout) into one repeatable "findings" field — add as many rows as needed instead of exactly 6 optional slots.
21. **`supabase/schema-v17.sql`** — adds `branch_queue_settings`, so a manager or admin can adjust "Call Next Customer"'s priority order and fairness rules per branch instead of it being one fixed rule for everyone.
22. **`supabase/schema-v18.sql`** — adds a `held` ticket status with a 24-hour validity window (`held_at`, `was_held`), for customers who were called but hadn't shown up yet.
23. **`supabase/schema-v19.sql`** — adds `push_subscriptions`, for real Web Push notifications that work even when the customer's tab is closed or backgrounded (see "Setting up real push notifications" below — this one needs extra setup beyond just running the SQL).
11. **`supabase/schema-v7.sql`** — adds `approval_requested_by` (so "Return" can reassign back to whoever asked for approval, and so they're allowed to reassign the line even if they're not the current assignee) and `requests.branch` (reserved for a same-branch duplicate-WIP warning on the New Request form — not wired up in the UI yet).

Then go to **Project Settings → API** and copy:
- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- **anon public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

If you set this project up before this update and already ran the old
`schema.sql`, also run `supabase/migrations/001_add_wip_number.sql`
first — it adds the `wip_number` column the newer files assume exists.

## 2. Run it locally

```bash
cd mg-queue-app
cp .env.local.example .env.local
# paste your Project URL and anon key into .env.local

npm install
npm run dev
```

No `SUPABASE_SERVICE_ROLE_KEY` needed anywhere — logins are handled by
the app's own `app_users` table, not Supabase Auth, so the anon key is
the only credential this app ever uses. See the security note below
for what that trade-off means.

### Try the login system

Sign in at `http://localhost:3000/login`:

| Who | Email | Password | Lands on |
|---|---|---|---|
| Admin | `ahmad.hamdani@jiadmotors.com` | `Ahmad@123` | `/admin` |
| Admin | `Mostafa.Eldeeb@jiadmotors.com` | `Mostafa@123` | `/admin` |
| Service Advisor (Hiraa) | `mouid.maziad.alosman@jiadmotors.com` | `Mouid@123` | `/advisor/JED-01` |
| Service Manager (Hiraa) | `ahmed.gomaa@jiadmotors.com` | `Ahmed@123` | `/advisor/JED-01` |

Every one of the 282 rows in `app_users` works the same way — the full
list (with passwords, since admins are meant to see them) is at
`/admin` once you're signed in as one.

### Try the end-to-end queue flow

1. `http://localhost:3000/branch/JED-01` — register as a customer.
2. You land on `/t/<ticketId>` — the live tracking screen.
3. In another tab, log in as the Hiraa advisor above → `/advisor/JED-01`.
4. Click **Serve now** — the customer tab flips instantly to "you're being called." That's Supabase Realtime.
5. Click **Complete** (it'll prompt for an optional WIP number first).
6. Try **Transfer to Manager** on an active session — it looks up the Service Manager for that branch and reassigns the ticket to them (see section 5 for exactly how).

## 3. Deploy to Vercel

1. Push this folder to a GitHub repo.
2. [vercel.com/new](https://vercel.com/new) → import the repo.
3. Add the same two env vars from `.env.local` in Vercel's project settings.
4. Deploy — Next.js is auto-detected, no build config needed.

Point your branch QR codes at
`https://<your-app>.vercel.app/branch/<BRANCH_CODE>`.

---

## 4. Request Management module

Independent set of tables for tracking internal approval/delegation
requests against a WIP number.

- **New Request** (`/requests/new`) — WIP Number + Remarks required; Request Type (Approval/Delegation) and Payment Type (Cash/Warranty/Internal) optional; Assignee field appears once a Request Type is picked or Remarks has content, with a real debounced search (`AssigneeAutocomplete.tsx`) against the `employees` table — not a client-side filter of a preloaded list.
- **Payment lines** — a request can carry several payment lines (`request_payment_lines`), each closed independently by whoever handles that piece, rather than the whole request needing one payment type.
- **Approval workflow** — status now spans `open → in_progress → closed`, plus `approved` / `rejected` / `returned` for the approval/delegation path, and a `locked` flag once a request is finalized.
- **Audit trail** (`/requests/[id]`) — every status change, reassignment, and remark writes an append-only row to `request_audit_log`. That table has no update/delete RLS policy at all, so nothing — not even an admin — can edit history through the anon key.
- Other pages: `/requests/assigned-to-me`, `/requests/closed`, `/requests/search?wip=...`.

Now tied to real logins — `created_by` / `actor_name` / assignee
matching all come from the signed-in `app_users` session, not a
free-text name field.

## 5. Login, roles, and "Transfer to Manager" — how it actually works

### The login system is intentionally NOT Supabase Auth

`app_users` (in `schema-v2.sql`) is a plain table with a **plaintext**
`password` column. That's on purpose — the requirement was "admins
should see the passwords and change them," which plaintext-in-a-table
does trivially, where real Supabase Auth (bcrypt-hashed, no admin
readback) can't without a whole separate service-role-key-backed admin
API. Given this is still a pilot/demo build, the simpler table won.

**What this means concretely:**
- Every account's password is visible in plaintext to any admin at `/admin`, and — because the RLS policy on `app_users` is `for select using (true)` — to anyone with the app's public anon key, not just logged-in admins. The anon key ships in the browser bundle; it is not a secret.
- Passwords currently follow a predictable `FirstName@123` pattern.
- **Before this touches real customers or sits somewhere a curious employee could open dev tools:** tighten the `app_users` RLS `select`/`update` policies to admin-only (mirror the `is_admin()`-style pattern used elsewhere), and have people change their password on first login instead of relying on the generated one indefinitely. Neither is wired up yet — flag if you want that next.

### Roles

Four roles, stored on `app_users.role`: `admin`, `manager`,
`advisor`, `staff`. Ahmad Hamdani and Mostafa Eldeeb are hardcoded
`admin` regardless of their job title in the spreadsheet (Warranty
Officer and Workshop Controller, respectively). Everyone else's role
was inferred from their title — anyone with "Manager"/"Supervisor" in
their title → `manager`, "Service Advisor" → `advisor`, everyone else
→ `staff`. `RequireAuth` (`lib/RequireAuth.tsx`) gates pages by role;
`/admin` only accepts `admin`.

### "Transfer to Manager" — what it actually routes to

Your spreadsheet has no "Reception Manager" title anywhere. The
closest real equivalent — and what's implemented — is: **the Service
Manager at the advisor's own branch.** The function
(`transferToManager` in `app/advisor/[code]/page.tsx`) looks up
`employees` where `branch` matches the queue branch's mapped
`employee_branch` and `title` contains "manager," and reassigns the
active ticket to whoever it finds. If this isn't what you meant by
"reception manager," tell me what role should actually receive the
transfer and I'll repoint it.

**This currently only resolves for the 3 seeded demo branches**
(`JED-01` → Hiraa, `RUH-01` → North, `DMM-01` → Khaldiah — set in
`schema-v2.sql`), because those are the only queue branches that
exist. Your spreadsheet has 12 real branch locations across 7 cities;
only 3 have a matching queue branch right now. Say the word and I'll
generate queue branches (with customer QR links) for the other 9 too.

### The two "link for the team / link per branch" pieces

- **Team** — `/team`, a searchable directory of all 282 employees (name, title, branch, email), filterable by branch. Open to any logged-in user.
- **Per-branch customers link** — `/advisor/[code]/customers`, a searchable log of every ticket ever created at that branch (name, mobile, status, WIP number, timestamp). Linked from the advisor dashboard nav.

---

## Changelog (most recent first)

### Round 31 — real Web Push notifications (works with the tab closed)
Everything before this round only worked while the tracking page's JavaScript was actually running — which mobile OSes suspend the moment a customer switches to another app. This round adds genuine Web Push: a service worker, a push subscription saved per ticket, and a server-side function that fires the notification independent of whether any tab is open at all.

- **New service worker** (`public/sw.js`) — receives push events and shows a system notification even with the tab fully closed; tapping it opens the tracking page.
- **New `push_subscriptions` table** — when a customer taps "enable notifications," their device subscribes to push and that subscription is saved against their specific ticket.
- **New server function** (`app/api/send-call-push/route.ts`) — triggered by a Supabase Database Webhook the moment a ticket's status flips to "called," looks up subscriptions for that ticket, and sends the actual push via the `web-push` library. Dead subscriptions (permission revoked, browser data cleared) get cleaned up automatically.

**This needs real setup beyond running the SQL file — it will not work until you do these:**

1. Run `schema-v19.sql`.
2. In Vercel → your project → Settings → Environment Variables, add:
   - `VAPID_PUBLIC_KEY` = `BDBQiBGKSDkNM0y6nJSGn9AvawxsCGpwsNNrqmTQLngW6cuN1oLfliE6OUtiLHfUoC9zGWizWFzmwsQD867jaXI`
   - `VAPID_PRIVATE_KEY` = `ADFNb-a9Owpp-l2th8bpyyQqAtsy1iU27tl6JIAZeYQ`
   - `VAPID_SUBJECT` = `mailto:` followed by a real contact email (required by the Web Push spec, shown to push services, not to customers)
   - Redeploy after adding these (same as any env var change).
3. In Supabase → Database → Webhooks → Create a new webhook:
   - Table: `queue_tickets`, Event: `Update`
   - Type: HTTP Request, Method: `POST`
   - URL: `https://<your-vercel-domain>/api/send-call-push`
   - (Optional but recommended) add a custom header `x-webhook-secret` with any value you choose, and set that same value as `CALL_PUSH_WEBHOOK_SECRET` in Vercel — without this, the endpoint is open to anyone who finds the URL.
4. `npm install` locally to pick up the two new packages (`web-push`, `@types/web-push`) before your next `npm run build`.

**Real platform limits, unavoidable even with this in place:** a customer must tap "enable notifications" at least once per device for this to work at all (no way to skip that consent step — every push system on every platform requires it). iOS only supports this for a page added to the home screen as a PWA, not a normal Safari tab — regular iPhone Safari visitors will still only get what Round 29/30 already provide (audio + system notification while the tab is alive, catch-up check on returning to the tab). Android Chrome is where this round matters most — those customers now get a real notification whether the tab is open, closed, or the browser isn't even running.

### Round 30 — real browser popup notifications
- **The "enable sound" tap now also requests notification permission** and, once granted, a real system popup notification ("It's your turn! [Advisor] is ready for you — Ticket A-004") fires alongside the chime and spoken announcement whenever the customer is called.
- **This meaningfully helps on Android Chrome** — a popup notification can show up in the phone's notification tray even when the tab isn't focused, as long as the browser app itself is still running in the background.
- **Honest limitation: iOS Safari doesn't support this at all for a regular browser tab.** The function feature-detects and silently does nothing there — no error, no broken UI, just no popup. Real push notifications on iOS require the page to be installed as a home-screen PWA plus a full push backend (service worker, push subscription storage, a server that triggers the push) — a genuinely separate, larger build, not a small addition. Everything from Round 29 (the visibility catch-up check) still applies as the fallback for iOS.

### Round 29 — mobile audio reliability
- **Added an explicit "🔔 Tap to enable sound alerts" banner** on the tracking page — a real, deliberate tap is far more reliable than a passive listener for unlocking audio/speech on mobile, especially iOS Safari, which is picky about exactly when in a gesture the unlock has to happen.
- **Added a catch-up check for backgrounded tabs.** If a customer switches away to another app (to scroll social media, exactly the scenario this was built for), the phone's OS throttles or pauses JavaScript in that tab — the realtime push notifying "you've been called" may simply never run until they come back. The page now also re-checks the ticket the moment it becomes visible again, so the alert still fires as soon as they return, instead of being silently missed.
- **Simplified the announce logic** to key off `served_at` (each time a ticket is freshly called) instead of tracking the previous status — one function now handles the live realtime path, the visibility catch-up path, and a fresh page load landing directly on an already-called ticket, without three separate code paths to keep in sync.
- **Known platform limit, not fixable from a web page**: none of this can guarantee an alert while the tab is fully backgrounded and the screen is off — that requires either a native app or real push notifications (a service worker + push subscription + a backend to trigger them), which is a genuinely bigger build. What's here now is the most a plain web page can do — catch the customer the instant they glance back at the tab.

### Round 28 — spoken call announcement, duplicate-ticket guard, label/icon polish
- **The call alert now speaks**, not just chimes — "Please proceed now, `<advisor name>` is ready for you" in English, then Arabic, using the browser's built-in text-to-speech (no audio files, no external service). Falls back to a name-less phrase if the advisor's name isn't set for some reason.
- **Registering while already on hold (or already in the queue) now shows a choice instead of silently creating a duplicate** — before a new ticket is created, the registration form checks for an existing held or active ticket on that mobile number at that branch. If found, the customer sees "Rejoin the queue" (or "View my ticket") alongside "Create new ticket anyway," so accidental duplicates require a deliberate second step instead of happening automatically.
- **Walk-in icon changed** from 🚶 to 🎫 — reads as "take a queue ticket," a more formal fit for the other three service-type icons.
- **"Receive Vehicle" renamed to "Receive Vehicle after Repair/Quick Service"** everywhere it appears (registration, advisor dashboard, Queue Settings).

### Round 27 — audible call alert, Hold list with 24h reactivation
- **Audible alert when a customer's turn comes.** The live tracking page (`/t/[id]`) now plays a short synthesized chime plus a vibration the moment a ticket flips to "called" — built with the Web Audio API, no sound file to host. Mobile browsers block audio until a real tap has happened on the page, so the first touch/click anywhere on the tracking screen silently "unlocks" it in the background, ready for whenever the alert actually fires.
- **New "Hold" button** next to No Show on the active session panel — for a called customer who hasn't shown up yet but you don't want to write off as a no-show. Held customers appear in a new "On hold" list (with a rough "expires in ~Nh" countdown) and stay reactivatable for 24 hours.
- **Customers can reactivate themselves** — `/track` now also checks for a held ticket on that mobile number and, if found (and still within the 24-hour window), shows a "Welcome back" card with a "Rejoin the queue" button. Staff can also reactivate manually from the Hold list if the customer just walks up instead.
- **Reactivated customers get priority** — once rejoined, a held ticket jumps ahead of the branch's normal category order (Inquiry/Appointment/etc.) the next time any advisor clicks "Call Next Customer," since they already made it partway through once. This sits below only an explicit urgent manager pre-assignment.

### Round 26 — Appointment and General Repair are now visible, configurable tiers
- **Fixed a real gap in Queue Settings**: it only ever exposed Inquiry and Receive Vehicle as reorderable — Appointment and General Repair existed in the ranking logic but were silently hardcoded into an unconfigurable fallback bucket alongside Quick Service, with no way to see or adjust them. All five real categories (Inquiry, Appointment, Receive Vehicle, General Repair, Quick Service) are now individually listed and reorderable on `/advisor/[code]/queue-settings`.
- **Appointment is now its own category** in the ranking — a customer who booked an appointment is grouped there regardless of what service type they selected (so an appointment customer needing Quick Service still gets Appointment-tier priority, not Quick-Service-tier). Only walk-ins fall through to being sorted by their specific service type.
- **Backward compatible** — a branch that already customized settings under the old 2-tier system automatically gets Appointment/General Repair/Quick Service appended in the standard default order the moment they open the settings page again; nothing breaks for branches that haven't touched this page at all.

### Round 25 — configurable queue priority per branch
- **Managers and admins can now adjust the "Call Next Customer" algorithm per branch** at `/advisor/[code]/queue-settings` (linked from the sidebar, manager/admin only): reorder whether Inquiry or Receive Vehicle gets checked first (drag via up/down arrows), toggle Quick Service's fair distribution on or off entirely, and set how many minutes a Quick Service customer waits before fairness is overridden and they're served regardless. Each branch's settings are independent — adjusting one branch never affects another. Falls back to the original defaults (Inquiry first, then Receive Vehicle, Quick Service fairly distributed, 15-minute override) if a branch hasn't customized anything yet.

### Round 24 — customers can find their ticket again after closing the page
- **New `/track` page** — a customer who closed their tracking tab (or lost it) can enter the mobile number they registered with and get taken straight back to their live position in the queue. If that number has more than one active ticket (rare, but possible), they get a small picker instead of a hard error.
- Linked from three places so it's actually discoverable: a "Track it" link on step 1 of the registration form, a persistent reminder at the bottom of the live tracking screen itself (so customers know it exists *before* they need it), and the login page's footer for anyone who lands there by mistake.

### Round 23 — real logo, renamed, Forms marked as in-development
- **Real MG logo everywhere.** Every small "MG" octagon badge across the app (nav bars, login, sidebar, head office, parts queue, tracking screen, registration form) now uses your actual uploaded logo image (`public/mg-logo.jpg`) instead of a CSS-drawn approximation. The letterhead images on generated PDFs were already the real ones from earlier rounds — this was the last of the placeholder branding.
- **Renamed to "MG Queue System"** — page titles, the login/HQ headers, the report footer, and the browser tab title. (Historical changelog entries below keep their original wording since they're a record of what was actually said/built at the time — only current, forward-facing branding changed.)
- **Forms module now clearly marked as in-development** — an amber banner on both `/forms` and `/admin/forms` saying so, plus a translucent diagonal "DEVELOPING" watermark stamped directly onto every generated document (visible in the on-screen preview, the printed page, and the downloaded PDF) so nothing produced right now gets mistaken for a finished, final document.

### Round 22 — real analytics: charts, peak hours/days, branch busy status, exportable data
- **New charts on both branch analytics and the Head Office overview**, using `recharts` (new dependency — `npm install` needed): a daily lead-time line chart (avg wait + avg service, trailing 7/14/30 days, selectable), a daily throughput bar chart, a peak-hours bar chart (0–23), and a peak-days-of-week bar chart.
- **Role-scoped access, as specified:**
  - **Admin / Head Office** — full charts and data for every branch, plus the kingdom-wide versions on `/hq`.
  - **Branch manager/supervisor** — full charts and data for their own branch, plus a lightweight "busy / moderate / quiet" status badge for every *other* branch (status only — no numbers, no drill-down).
  - **Advisor** — full branch-level charts (throughput, lead times, peak hours/days are branch aggregates, not individual), but the per-advisor breakdown table only ever shows their own row, never a colleague's.
- **Exportable, sortable data table** under the charts on both pages — click any column header to sort, "Export CSV" downloads exactly what's shown for the selected date range.
- Branch "busy" status is now a shared, consistent rule (`branchBusyLevel` in `lib/analyticsUtils.ts`): >8 waiting = busy, >3 = moderate, else quiet — used identically on `/hq`'s branch cards and the new manager-only other-branches badges.

### Round 21 — real A4 sizing, print support, repeatable findings rows
- **Fixed A4 sizing for both download and print.** The form preview now renders at a literal `210mm` width (true A4) instead of a screen-comfortable but non-standard width — this is what both the PDF download and a new **Print** button (`window.print()`, with `@page { size: A4 }` CSS) now capture, so both outputs are properly A4-proportioned. Tables and rows also get `break-inside: avoid` so a print/PDF page break won't land in the middle of a row.
- **The Repair Request Agreement's findings log is now one repeatable field**, not 12 fixed optional ones ("ملاحظة 1", "تاريخ الكشف 1", "ملاحظة 2"...). The fill form now shows a single "سجل الملاحظات" section with an "Add row" button — add as many rows as the case needs, remove any row, and the generated document's table has exactly as many rows as you added. Introduced a new field type, `repeater`, with its own set of sub-columns, for this and any future form that needs a variable-length list.

### Round 20 — new approach: build forms from a plain spec instead of digitizing a Word grid
- **Replaced the letterhead images with the exact ones you provided** (`Header.png`/`Footer.png`), rather than crops I cut myself from the Word document — same branding, cleaner source.
- **Rebuilt the Complaint Waiver Form from scratch** using a plain spec (title, a flat field list, terms and conditions, signature lines) instead of mirroring the original document's merged-cell table layout — one field per row, much easier to read and maintain. This is the new pattern going forward: give a title, a field list, terms, and a signature block, and I build a clean form from that directly rather than reverse-engineering a Word grid.

### Round 19 — real letterhead, cleaner document format
- **Fixed the letterhead.** The generated PDFs were showing a placeholder "MG Kingdom Queue" header I'd invented — they now use the actual Jiad Modern Motors letterhead extracted directly from your uploaded Word documents (MG logo, "جياد الحديثة للسيارات / Jiad Modern Motors", "قيادة بشغف" tagline, and the real company footer with address/CR/VAT), pixel-identical to what's in your files. Two new image assets, `public/letterhead-header.png` and `public/letterhead-footer.png`, ship with the app.
- **Cleaner overall layout** — tighter, more consistent spacing, a lighter divider under the form title instead of a heavy black rule, softer table borders, and better line height on the body text so multi-page legal text (the Repair Request Agreement especially) reads more like a real document and less like a raw text dump.

### Round 18 — three more digitized forms, table support, optional fields
- **Every "Blank" in your three uploaded Word documents is now a fill-in field** — nothing else in the wording, labels, or table layout was changed. The three: Complaint Waiver Form (نموذج تنازل عن الشكوى), Repair Request Agreement under Customer Satisfaction (اتفاقية طلب للاصلاح على بند إرضاء العملاء — the long legal one, including its 6-row findings log), and the Customer Satisfaction Discount Form (استمارة خصم لإرضاء العملاء).
- **Forms can now contain real tables**, not just flowing paragraphs — added a `tables` column and a `[TABLE:0]`, `[TABLE:1]`... marker system so a form's body text can reference exactly where each grid appears, matching the original documents' layout.
- **Fields can be marked optional.** Signature lines and manager sign-off fields (filled at physical signing time, not by the advisor typing the form) are optional across all three new forms — required fields still block submission, optional ones don't.
- **Admin's form builder now has a Required checkbox per field** and a raw JSON textarea for defining tables when building a new form from scratch.

### Round 17 — Forms module (digitized your Word form)
- **New Forms module**, replacing the "create a new Word doc every time, save, print" workflow. Advisors go to `/forms` (linked from the sidebar), pick a form, fill in only the fields that actually change per case, and the rest of the wording is fixed — exactly as it should be for a repeatable document.
- **The Customer Satisfaction Agreement from your uploaded Word file is now the first digitized form** — wording preserved exactly as written; only the variable parts (discount %, card number, day count, date, VIN, mobile, vehicle type, customer name) became fill-in fields. Signature lines stay blank in the output, same as the original, for physical signing.
- **Every submission is saved to the database** (`form_submissions` — who filled it, which branch, all the field values, when) before the PDF is offered, so nothing depends on a local file surviving on someone's PC.
- **Real PDF download**, same `jspdf`/`html2canvas` technique as the request report — not a print dialog.
- **Admin can add entirely new forms** at `/admin/forms` — name (both languages), the body wording (with `{{field_key}}` placeholders), and a field list (key, English/Arabic label, type: text/number/date). Existing forms can be edited, deactivated, or deleted the same way.

### Round 16 — parts queue matches the service interface, urgent assignment, fixed overlap bug, advisor data export
- **Fixed a real layout bug**: the "⭐ Appointment" badge was absolutely positioned in the same corner as the "Serve now"/"Assign advisor" controls, causing them to render on top of each other. It's now inline next to the customer's name, where it can never collide with the action buttons.
- **Spare Parts queue now uses the same Live Queue + Active Session interface** as the service dashboard (same card layout, same Serve now/Assign advisor/Complete Session/No Show pattern), instead of the older two-column list.
- **Assigning an advisor now asks if it's urgent.** Urgent = that customer becomes the very next one that advisor serves, ahead of everything else. Not urgent = the customer is reserved for that specific advisor but stays in normal queue order — other advisors skip over them, and the assigned advisor gets them exactly when their turn comes up naturally.
- **New advisor/customer data page** (existing `/advisor/[code]/customers`, rebuilt) — every ticket with full detail, filterable by advisor/status/service type and free text, sortable by clicking any column header, and an "Export CSV" button that downloads exactly what's currently filtered and sorted.
- **New per-advisor KPI table** on the analytics page — served count, avg wait, avg service time, and Quick Service count per advisor, so the fairness of Quick Service distribution is actually visible, not just enforced silently.

### Round 15 — 4 service types, hidden queue with fair auto-selection, manager pre-assignment, separate Spare Parts queue
- **Service type is now 4 options**, not 2: Appointment, Walk-in, Inquiry, Spare Parts. "What do you need?" (General Repair/Quick Service/Receive Vehicle) still only applies to Appointment and Walk-in. "Receive Vehicle / Delivery" is now just "Receive Vehicle."
- **Regular advisors no longer see the waiting list at all** — just a "Call Next Customer" button. Clicking it auto-selects who's next using this ranking: (1) any waiting Inquiry, (2) any waiting Receive Vehicle, (3) Quick Service/General Repair, with Quick Service **distributed fairly** — an advisor who's already served more Quick Service tickets today than their peers gets a General Repair ticket instead, unless the customer has waited past 15 minutes, in which case they're served regardless of fairness so nobody waits forever.
- **Service Supervisor, Service Manager, Head of Service, Head Office, and Admin still see the full live queue**, and can now **pre-assign a specific waiting customer to a specific advisor** via a dropdown on each ticket — that advisor's next "Call Next Customer" click serves that customer first, ahead of the normal ranking.
- **Spare Parts is a fully separate queue** at `/parts/[code]`, run by a new `parts_advisor` role — Service Advisors never see it, and it's excluded from the service queue, the service customer log, and service analytics everywhere.

### Round 14 — Head Office isn't a branch, full admin CRUD, real analytics, branch scoping
- **Head Office is no longer a fake queue branch.** Removed the `JED-HQ` branch row; anyone whose employee record says "Head Office" now lands on the Kingdom overview (`/hq`) on login instead of a branch dashboard with no real customers.
- **`/hq` is now genuinely restricted** to admins and Head Office staff — everyone else is redirected to their own branch. It also now shows a kingdom-wide average wait time, and every branch card links straight to that branch's dashboard.
- **Branch-level pages (dashboard, analytics) now enforce "your branch only"** for regular staff — trying to open another branch's URL redirects you back to your own. Admin and Head Office bypass this, as before.
- **New Request Analytics page** (`/requests/analytics`, linked from the sidebar) — pending count broken down by assignee, average lead time for closed lines, average age of still-open lines. Regular staff see only their own branch's requests; admin/Head Office see everything, plus a pending-by-branch breakdown.
- **Admin can add, edit, and delete branches** at `/admin/branches` — name, code, and a Delete button, not just view links.
- **Admin can add and delete user accounts**, not just edit existing ones — a "New User" form and a Delete button per row on `/admin`.
- Fixed a real bug found while in this code: `/hq`'s language toggle called an undefined `setLang` function (would have thrown an error on click) — it now uses the shared `toggle()` like every other page. Also applied the same synchronous-localStorage-read fix from `useSession` to `useLang`, removing a similar possible flash on language-dependent pages.

### Round 13 — reassign-to-requester on all decisions, real PDF, admin access, direct login, all 12 branches
- **Approve and Reject now also reassign back to the requester**, not just Return — any decision on a payment line hands it back to whoever requested the approval.
- **PDF is now an actual downloaded file**, not the browser's print dialog — uses `jspdf` + `html2canvas` to render the report and trigger a real `.pdf` download (`npm install` will need to fetch these two new packages).
- **Admins can edit team/employee data** — `/team` now has an Edit button per person (admin-only) updating name, title, city, branch, phone, and email directly on the `employees` table. Needed a new RLS policy (`schema-v9.sql`) since `employees` only ever had a read policy.
- **Admins now bypass every page restriction automatically** — `RequireAuth` no longer needs `admin` explicitly listed in every page's `allow` array; an admin session always passes.
- **Homepage now goes straight to the login form** for anyone not signed in, instead of a tile-selection landing page — no more picking "Head Office" or anything else before entering credentials. Small links to the customer queue and HQ overview live at the bottom of the login page instead.
- **All 12 real branches from the spreadsheet now exist as queue branches** (`schema-v8.sql`), not just the 3 demo ones — each gets its own `/branch/<code>` customer link and `/advisor/<code>` dashboard, with `queue_tickets.branch_id` already keeping each branch's customers in that branch's queue only. `/admin/branches` lists every one with a copyable customer link.

### Round 12 — real bug fixes, not just claims
- **Found and fixed the actual "feels like a new website" cause**: `useSession` was only reading `localStorage` inside a `useEffect`, so every full page-tree remount (like navigating between `/advisor/[code]` and `/requests`) briefly rendered a stark, unbranded "Loading…"/"Redirecting…" screen before the real page appeared. It now reads `localStorage` synchronously on first render, so that flash is gone in the normal case. `RequireAuth`'s fallback screens are also now styled to match the app instead of being plain black-on-white text, as a backstop.
- **All request-line mutations now surface errors as a toast** instead of failing silently. If Return (or anything else) still doesn't visibly work after this, you'll now get a message telling you exactly why — most likely a not-yet-run migration.
- **New "Assign" button** beside Approval — a simpler one-click version of Delegate (no task field) for directly handing a line to someone; same reassign-on-Done/Delegate-again mechanics.
- **Every action button now opens its own small comment box** (Assign, Delegate, Approval, Approve, Reject, Return, Close request, Reopen, Done) — matching the pattern Delegate already had — instead of relying on one shared note box for actions. The big textarea is now labeled as a general note, separate from action-specific comments.
- **PDF is now a real formatted report**, not a screen-print of the interactive page — a new standalone `/reports/[id]` document with a proper header, a summary table, and each payment line as its own section with a clean history table. Opens in a new tab from the "Print report (PDF)" link on the request page; use "Save as PDF" in the browser's print dialog.
- Lines can now be claimed by anyone before they have an assignee (fixed a gap where Delegate/Assign were only visible to admins on a brand-new, unclaimed line).

### Round 11 — duplicate-WIP notification
- The New Request form now checks, when you leave the WIP Number field, whether a request for that WIP already exists in your branch (or anywhere, if your account has no branch mapped) — and shows an amber notice with a link to the existing request. It's informational, not blocking — you can still create the new request if that's genuinely what you need. This is the piece from `schema-v7.sql`'s `requests.branch` column that wasn't wired up yet last round.

### Round 10 — permissions, requester return, sidebar fix, spinners, print
- **Approve/Reject/Return are now restricted to the current assignee** (or an admin) — everyone else sees a note naming who can decide instead of the buttons. Delegate is available to the assignee, the original approval requester, or an admin, so the requester can hand it to someone else even without being the current assignee.
- **Return reassigns back to whoever requested the approval**, not just a generic "unassigned" — tracked via a new `approval_requested_by` field.
- **Fixed the missing sidebar.** `/requests/*` now has its own sidebar and top bar matching the advisor dashboard's exact visual style (same logo, same "Back to Dashboard" pattern) instead of a bare top-nav page that felt like a different site.
- **Loading spinners on every action button** — Serve Now, No Show, Return to Queue, Complete Session, admin Save, and all the request-detail buttons (Approve/Reject/Return/Delegate/Close/Reopen/Done/Add to audit trail) now show a spinner and disable themselves while their request is in flight.
- **Print / Save as PDF** — a button on the request detail page calling the browser's native print dialog, with all interactive controls hidden and the full chat history expanded (no scroll clipping) in the printed output.

### Round 9 — everything in one button row
- Delegate, Approval (or Approve/Reject/Return once triggered), Done, and Close request/Reopen now sit in the same row as "Add to audit trail" — one horizontal row of buttons under the note box, instead of Delegate living in its own section above and the rest in a separate side column. Clicking Delegate or Approval expands its picker (assignee search, optional task) directly below that row.

### Round 8 — reopen a closed line
- A closed payment line now shows "Reopen" in place of "Close request" — sets it back to `in_progress`, clears the closed-by/closed-at record, and logs it (with any typed comment riding along, same as other actions). If that was the request's last remaining closed line, the whole request flips back to `in_progress` too and drops off the Closed Requests list automatically.

### Round 7 — comment rides along with the action
- If you type a note and then click Approve, Reject, Return, Close request, or Done, the comment is folded into that single trail entry ("Approved. Comment: ...") instead of needing a separate "Add to audit trail" click first. The note box clears either way, and plain "Add to audit trail" (with no action) still works exactly as before for a standalone note.

### Round 6 — approval now asks who should approve
- Clicking "Approval" no longer fires immediately — it opens an assignee search asking who should approve, same pattern as Delegate. Confirming sets that person as the line's assignee and logs "Approval requested from &lt;name&gt;." No schema change needed for this one.

### Round 5 — progressive disclosure on actions, pending-count badge
- **Approve/Reject/Return are hidden by default.** Each payment line now starts showing just Delegate, Approval, Close request, and Add to audit trail. Clicking "Approval" is what reveals Approve/Reject/Return — one-way per line, not a toggle.
- **"Done" appears once a line has been delegated**, and clicking it automatically reassigns the line back to whoever did the delegating (tracked via a new `delegated_by` field) — closes the loop without the delegator having to manually reassign it back to themselves.
- **Pending-count badge in the advisor sidebar** — the "Request Management" link now shows a live red badge counting how many payment lines are currently assigned to the logged-in user and not yet closed, updating in real time via Realtime.

### Round 4 — payment-line-only model
- **Removed the General line entirely.** No more request-level status card — everything revolves around payment lines. Overall request status (shown at the top) is now *derived automatically*: once every payment line on a request is closed, the request closes itself; add a new line to a closed request and it reopens.
- **Approval/Delegation are actions inside each payment line, not separate threads.** Approve/Reject/Return buttons write straight into that line's own chat, same as the note box does. No more "add a request type" control.
- **Delegation now names the task.** The old plain "Assign" control is "Delegate" — pick a person and optionally describe what's being delegated; both go into that line's history together.
- **No "Start process" button.** A payment line is `in_progress` the moment it's created — automatically.
- **Multiple lines of the same payment type** — add Cash twice and get "Cash 1" and "Cash 2", each independent. The one-per-type database limit is gone.
- **"Add payment type" stays at the bottom of the page**, no longer filtered to hide already-used types, since duplicates are allowed.
- **Admins can see every request in the system** at `/admin/requests`, not just ones they created or were assigned.

### Round 3 — unification, then reverted General/overall-assignee (superseded by Round 4)
- Briefly unified Approval/Delegation and Payment Tracking into one section with an added "General" line and per-line assignee — this was replaced in Round 4 above by removing General entirely and folding Approval/Delegation into each payment line directly.

### Round 2 — separate threads per type, no more lock-until-unlock
- Two request types ran as two independent threads with their own chat, status, and assignee.
- Removed lock-until-unlock friction — every action box stayed open and clickable; every action still recorded regardless of how many times taken.
- Payment lines could each have their own assignee.
- Transfer to Manager escalates by who's transferring: Service Advisor → Service Supervisor, Service Supervisor → Service Manager.
- Request Management removed from the public homepage — advisor sidebar only.
- Loading spinners replace plain "Loading…" text everywhere.

### Round 1
- Request Management removed from the public homepage; confirmed/polished Approve/Reject/Return, independent payment-line tracking, swapped remarks/close-request layout, lock-after-action, success toasts, full bilingual coverage.

## What's intentionally simplified for this MVP

- **`app_users` passwords are plaintext and its RLS is wide open** (see section 5) — the single biggest thing to fix before this is used by more than your own team for testing.
- **Transfer to Manager only covers 3 of 12 real branches** — see section 5.
- **No Web Push.** The "you're being called" alert only fires while the customer's tab is open (via Realtime). A Supabase Edge Function sending Web Push on `status → called` would cover backgrounded tabs.
- **Simplified position/wait-time math.** Position is computed client-side from queue order; estimated wait is a flat placeholder, not the KPI-driven estimate from the full technical design doc.
- **No KPI history.** `/hq` and `/advisor/[code]/analytics` are live-only, no day-over-day rollups yet.
- **Advisor notes aren't saved** — the notes textarea on the Active Session panel is local React state only.
- **160 of 282 employees had no email in the spreadsheet** — `seed-app-users.sql` generated one (`firstname.lastname@jiadmotors.com`) so everyone could still get a login. These aren't real deliverable addresses; update them once the real ones are known.

## Project structure

```
app/
  branch/[code]/page.tsx              customer registration form (no login)
  t/[id]/page.tsx                     customer live tracking screen (no login)
  login/page.tsx                       staff sign-in
  advisor/[code]/page.tsx              advisor dashboard (login required)
  advisor/[code]/analytics/page.tsx    today's live stats
  advisor/[code]/customers/page.tsx    per-branch customer log
  admin/page.tsx                       admin-only: view/edit every account + password
  team/page.tsx                         employee directory
  hq/page.tsx                           head office overview
  requests/                             Request Management module (section 4)
  layout.tsx, globals.css
lib/
  supabaseClient.ts    Supabase client + shared types
  useSession.ts         app_users-based login/session (NOT Supabase Auth)
  useLang.ts             AR/EN + RTL/LTR, persisted
  useToast.tsx            small toast notification helper
  RequireAuth.tsx          page guard, optional role allow-list
supabase/
  schema.sql                          queue system — run 1st
  seed-demo-data.sql                   optional dummy tickets
  schema-requests.sql                  request management tables — run 3rd
  seed-employees.sql                    employee directory from Employees.xlsx — run 4th
  schema-v2.sql                          logins, branch mapping, approval workflow — run 5th
  seed-app-users.sql                      generates all 282 logins — run 6th
  schema-v3.sql                             per-type threads, per-payment-line assignee — run 7th
  schema-v4.sql                              per-payment-line chat, payment lines get in_progress — run 8th
  schema-v5.sql                               allows multiple lines of the same payment type — run 9th
  schema-v6.sql                                approval-mode flag + delegated_by for auto-reassign — run 10th
  schema-v7.sql                                 approval_requested_by + branch on requests — run 11th
  migrations/001_add_wip_number.sql        only if upgrading a pre-existing DB
```
