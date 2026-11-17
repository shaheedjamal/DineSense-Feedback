# Security, Privacy & Responsible AI Architecture

## 1. Security Controls
- **Password Hashing**: Bcrypt (`bcryptjs` / `passlib`) with per-user salts; plaintext passwords are never stored.
- **JWT Authentication**: Short-lived signed tokens via environment variable `JWT_SECRET_KEY`.
- **RBAC & Tenant Isolation**: Every protected route verifies role (`super_admin`, `restaurant_admin`, `restaurant_manager`) and enforces strict `venue_id` tenant scoping so managers cannot inspect other restaurants or escalate privileges.
- **HTTP Hardening & Rate Limiting**: Helmet security headers and per-IP rate limiting on authentication and feedback endpoints.
- **Audit Logging**: Login attempts, account changes, venue modifications, retention purges, and aggregate report exports are recorded in `audit_logs`.

## 2. Privacy-by-Design Prohibitions
DineSense Feedback explicitly prohibits:
- Face recognition or guest identity matching.
- Persistent facial embeddings or cross-visit tracking.
- Covert camera capture or continuous emotion surveillance.
- Employee scoring or automated access decisions.

## 3. Data Minimization & Retention
- **Raw Image Disposal**: Camera frames are analyzed in memory and discarded immediately. Zero photos or video clips are persisted to disk or database.
- **k-Anonymity Suppression ($n < 5$)**: Small expression-cue groups and small report periods are suppressed to prevent re-identification.
- **Configurable Retention**: Venue administrators configure retention windows (7–365 days) and can trigger immediate retention purges (`POST /api/admin/retention/purge`).

## 4. Regional Regulatory Review (India DPDP Act, 2023)
Organizations deploying DineSense Feedback in India must conduct an independent legal and compliance review against the Digital Personal Data Protection Act, 2023 and applicable rules in force at deployment time (covering notice language, consent logs, grievance redressal contact details, and retention schedules). Software architecture alone does not constitute legal certification.
