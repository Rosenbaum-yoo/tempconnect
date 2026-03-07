# Security Model

## Authentication
- **Sessions**: `express-session` with `connect-pg-simple` (Postgres-backed store). Cookie is `HttpOnly`, `SameSite=Lax`, `Secure` in production.
- **Password hashing**: `bcryptjs` (cost factor 10).
- **Email verification**: UUID token sent on registration; account is `is_verified = FALSE` until confirmed.

## Authorization
- **Roles**: `company` (buyer) and `agency` (supplier). Checked via `req.session.user.role`.
- **Route guards**: Middleware functions like `requireAuth`, `requireRole('company')`, `requireRole('agency')` protect endpoints.
- **Admin endpoints**: Protected by `x-admin-secret` header (compared against `ADMIN_SECRET` env var). Returns 404 (not 403) on mismatch to avoid leaking endpoint existence.

## CSRF Protection
- All state-changing forms include a CSRF token.
- Token validated server-side before processing mutations.

## Rate Limiting
- `express-rate-limit` with configurable windows and max counts.
- Supports Redis-backed store (`rate-limit-redis`) for distributed deployments.
- Separate limits for auth endpoints, request creation, and general API calls.

## Input Validation
- `zod` schemas validate request bodies on all mutation endpoints.
- SQL queries use parameterized `$1, $2, ...` placeholders — no string concatenation.

## HTTP Security Headers
- `helmet` middleware sets `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`, etc.
- CORS restricted to `CORS_ORIGIN` (default `http://localhost:8080`).

## Secrets Management
- All secrets loaded from environment variables (via `dotenv` in development).
- `runProductionValidation()` in `config/index.js` enforces that critical secrets (SESSION_SECRET, JWT_SECRET, ADMIN_SECRET, INTERNAL_CRON_SECRET) are set and not placeholders before the server starts in production.
- Stripe keys, SMTP credentials, and PayPal secrets also loaded from env.

## Audit Trail
- `audit_log` table records all significant actions (state transitions, admin operations, cron executions).
- Each entry includes: action, entity_type, entity_id, actor_id, IP address, timestamp, and a JSON details payload.

## Idempotency
- State-changing requests support idempotency keys to prevent duplicate processing.
- `idempotency_keys` table tracks recently seen keys with automatic cleanup via cron.

## Internal Cron Security
- Cron endpoints (`/api/internal/*`) require `x-cron-secret` header matching `INTERNAL_CRON_SECRET`.
- IP allow-list (`INTERNAL_CRON_ALLOWED_IPS`) restricts access to known scheduler IPs.
