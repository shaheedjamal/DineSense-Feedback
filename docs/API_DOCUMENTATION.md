# DineSense Feedback — REST API Documentation

Base URL: `/api` (Port `3000` in full-stack Express mode; Port `8000` in FastAPI mode).

## Authentication
- `POST /api/auth/register` — Register a new user and optional restaurant venue (`restaurant_admin`).
- `POST /api/auth/login` — Authenticate with email + password; returns JWT Bearer token.
- `POST /api/auth/logout` — Authenticated sign-out and audit log entry.
- `GET /api/auth/me` — Retrieve authenticated profile and assigned venue.
- `POST /api/auth/forgot-password` — Generate single-use password reset token.
- `POST /api/auth/reset-password` — Complete password reset using token.

## Restaurant Venues
- `GET /api/venues/public` — Unauthenticated active venue directory for guest feedback.
- `GET /api/venues` — Authenticated venue list (tenant-isolated for venue admins/managers).
- `POST /api/venues` — Create venue (`super_admin` only).
- `PUT /api/venues/{id}` — Update venue settings (`super_admin` or assigned `restaurant_admin`).
- `DELETE /api/venues/{id}` — Delete venue (`super_admin` only).

## User Management
- `GET /api/users` — List staff accounts within authorized tenant scope.
- `POST /api/users` — Create manager/admin account (prevents role escalation).
- `PUT /api/users/{id}` — Update user status or details.
- `DELETE /api/users/{id}` — Remove staff account.

## Consent & Ephemeral AI Inference
- `POST /api/consents` — Record guest's explicit `accepted` or `declined` camera consent.
- `GET /api/consents/status?consent_id=...` — Verify consent record state.
- `POST /api/inference-events` — Requires valid `accepted` single-use `consent_id`. Performs quality checks and returns calibrated cue or abstention (`"Unable to assess – Please use another feedback method."`). Never stores images.

## Customer Feedback & Analytics
- `POST /api/survey-responses` — Unauthenticated direct guest rating submission (1–5 stars + optional comment).
- `GET /api/survey-responses` — De-identified survey history (tenant-isolated).
- `GET /api/dashboard/summary` — KPI summary + $k$-anonymized ($n \ge 5$) expression-cue distribution.
- `GET /api/dashboard/trends` — Daily, weekly, or monthly trend series.
- `GET /api/dashboard/ratings` — Average dimension ratings and star breakdown.
- `GET /api/dashboard/categories` — Positive / neutral / negative direct counts.

## Service Actions, Reports & Administration
- `GET /api/actions`, `POST /api/actions`, `PUT /api/actions/{id}` — Track corrective service actions.
- `GET /api/reports/daily|weekly|monthly` — Aggregate period tables.
- `GET /api/reports/export` — CSV export (enforces minimum sample size $n \ge 5$).
- `GET /api/admin/system-health`, `GET /api/admin/audit-logs`, `GET|PUT /api/admin/retention`, `POST /api/admin/retention/purge`.
