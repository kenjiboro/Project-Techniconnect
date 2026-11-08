# TechniConnect — Website UI Implementation Plan

**Project:** TechniConnect — CIT-U (Cebu Institute of Technology – University) alumni platform
**Plan file:** `.kilo/plans/1794124800000-techiconnect-ui-plan.md`
**Goal:** Build the R1 (walking skeleton) website UI for TechniConnect: alumni registration/verification, profile management, announcements, and staff alumni-record management — with no public exposure of alumni data.

---

## Source context (parsed from `context/`)

- `techniconnect_survey.docx` — stakeholder survey: target users are Technologian alumni, graduating seniors, OAR/Registrar/MIS/Accounting staff. Core features: lifetime alumni email registration w/ document upload, ID verification (upload gov't ID or in-person), duplicate detection, request status tracking, announcements, private alumni records. Public searchable directory was dropped due to data privacy.
- `Needs-Assessment-Workbook.xlsx` — R1 MoSCoW prioritization and 8 user stories. Must-R1: US-01 alumni update own profile, US-02 view announcements, US-03 access services portal, US-04 staff verify alumni identity (approve/reject), US-05 staff view/maintain private alumni records, US-06 staff-only authenticated access, US-07 block public access to alumni records. Should-R1: US-08 campus ID-scan visit notification (depends on existing ID-scanner integration — an open assumption, NOT in this plan). Out of scope: public directory, service requests, events, engagement tracking, payments, SSO.
- `Software Development 1 - Week 1 Activity.docx` — assignment scope: two roles (alumni + administrator), one main data entity (alumni profiles), self-submitted info, manually managed records, administrator approval, simple web interface + database.
- `TECHNICONNECT-PITCH.pptx` — binary, unreadable; contents covered by the two files above.

---

## Decisions

| Decision | Value | Rationale |
|---|---|---|
| Stack | Vanilla HTML/CSS/JS frontend + Node/Express REST API + Supabase (PostgreSQL) | Supabase replaces SQLite per colleague request; same API endpoints, frontend unchanged |
| Auth | Session-based (express-session), two roles: `alumni` and `staff` | Fits two-role scope; staff routes guarded; alumni only access own record |
| Data entity | `alumni_profiles` (one main entity) + `announcements` + `registration_requests` | One main entity per assignment scope; announcements and registration requests support US-02/US-04 |
| Privacy rule | No public alumni search/directory; alumni data never visible to unauthenticated users; alumni CRUD limited to own profile; staff-only search/maintain | N-09/N-10, US-06, US-07 |
| Public pages | Landing page + registration form (public); everything else authenticated | Registration is the public entry point |
| File storage | Supabase Storage bucket `id-documents` for ID documents; public URL stored in `registration_requests.id_document_path` | Replaces local `uploads/` folder; staff view IDs via Supabase public URL |

---

## Out of scope (explicitly)

- Publicly searchable alumni directory (removed — privacy)
- Lifetime email provisioning / Google Workspace API integration (outside integration scope)
- Campus ID-scan visit notification (US-08 — depends on existing scanner, assumption A-01 open)
- Alumni service requests (N-03), events/opportunities (N-05), engagement tracking (N-08)
- Online payments, SSO, social-media integration
- Automated duplicate detection (manual staff review for R1)

---

## Pages & UI components

**Public**
1. Landing page — TechniConnect branding, purpose, role-based entry links (Alumni register/login, Staff login)
2. Registration form — personal/contact info, graduation year, college, gov't ID upload, email preference; submit creates `registration_request` (status: pending); shows status tracking after submission

**Authenticated — Alumni** (session role `alumni`, own record only)
3. Login page
4. Dashboard — announcements list, quick links (view/update profile, request status)
5. Profile view/edit — view own alumni record; editable fields defined with Alumni Affairs (name, contact info, college, batch year); change confirmation
6. Request status — view status of their registration/verification request

**Authenticated — Staff** (session role `staff`)
7. Staff login page
8. Verification queue — list of pending registration requests with ID document links; approve/reject actions (creates/updates alumni profile)
9. Alumni records — search staff-side (by name/batch/ID), view private record, update record

**Shared**
- Nav bar, flash messages, 401/404 handling, "no public alumni data" notice where relevant

---

## Data model (Supabase PostgreSQL)

See `supabase-schema.sql` for the full DDL. Tables:
- `users(id, email, password_hash, role, created_at)` — alumni + staff accounts
- `alumni_profiles(id, user_id, student_id, first_name, last_name, middle_name, batch_year, college, email, contact_number, address, is_verified, created_at, updated_at)`
- `registration_requests(id, user_id, status, id_document_path, admin_notes, reviewed_by, reviewed_at, created_at)`
- `announcements(id, title, content, published, created_at, created_by)`
- Storage bucket: `id-documents` (public) for ID document uploads

## Supabase setup

1. Create a project at https://app.supabase.com
2. Run `supabase-schema.sql` in the SQL Editor
3. Create Storage bucket `id-documents` (Public: true, 5 MB limit, MIME types: pdf/jpg/jpeg/png)
4. Copy `.env.example` to `.env` and fill in `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from Project Settings > API
5. Start server: `$env:SUPABASE_URL="..."; $env:SUPABASE_SERVICE_ROLE_KEY="..."; node server.js`

## Risks

- Privacy regression: a public search feature could creep back in — enforce route guards and data-access rules in the plan tasks.
- ID document uploads: stored in Supabase Storage `id-documents` bucket; public URLs are only returned to authenticated staff via the verification queue.
- Service role key must be kept secret (server-side only); never expose it to the frontend.

---

## Validation plan

1. `node --check` on all server files; open each HTML file in browser to confirm no console errors.
2. Register as alumni → verify pending request appears in staff queue → staff approves → alumni can log in and edit own profile.
3. Attempt to access alumni routes while unauthenticated → redirected to login; attempt as staff → 403/redirect.
4. Attempt to view another alumni's profile → access denied (own record only).
5. Confirm no alumni data appears on the public landing page.
6. Run `npm test` if a test script exists; otherwise manual smoke test of all flows above.

---

## Tasks (implementation order)

1. Scaffold project: `package.json`, Express server, Supabase client config, folder structure (`public/`, `routes/`, `public/uploads/`).
2. Set up Supabase project: run `supabase-schema.sql`, create `id-documents` storage bucket, configure `.env`.
3. Implement auth middleware (session, role guards, login/logout, password hashing).
4. Build public pages: landing page, registration form with file upload.
5. Build registration request flow + status tracking page.
6. Build staff pages: login, verification queue (approve/reject), alumni records search/view/maintain.
7. Build alumni pages: login, dashboard, announcements, profile view/edit, own-request status.
8. Wire API routes + Supabase queries; enforce privacy rules (staff-only record access, alumni own-record only).
9. Manual smoke test of full R1 flow (register → staff approve → alumni login → edit profile → view announcements).
10. Review against needs-assessment acceptance criteria (US-01..US-07).

---

## Open questions (defer, non-blocking for UI plan)

- Which fields may alumni edit themselves vs. staff only (Q-03 in workbook) — plan assumes contact info editable by alumni; confirm with Alumni Affairs during implementation.
- Existing ID-scanning system integration for US-08 — out of R1 scope.
- Deployment target (hosting platform) — to be confirmed before deploy.

---

When you're ready, an implementation-capable agent can execute this plan starting with Task 1.