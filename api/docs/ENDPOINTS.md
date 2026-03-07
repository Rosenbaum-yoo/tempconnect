# API Endpoints (after refactor)

All paths unchanged from original `server.js`. Base for API routes: `/api`.

## Health & Admin

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | LB health, 200 OK, no DB |
| GET | `/api/health` | Deep health + DB check |
| GET | `/api/admin/status` | DB + migrations (x-admin-secret) |

## CSRF & Auth

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/csrf` | Get CSRF token |
| POST | `/api/auth/register` | Register (authLimiter) |
| GET | `/api/auth/verify/:token` | E-mail verification |
| POST | `/api/auth/resend-verification` | Resend verification (requireAuth) |
| POST | `/api/auth/login` | Login (authLimiter) |
| POST | `/api/auth/logout` | Logout |
| POST | `/api/auth/forgot-password` | Forgot password (authLimiter) |
| GET | `/api/auth/reset-password/:token` | Validate reset token |
| POST | `/api/auth/reset-password` | Set new password (authLimiter) |

## Me & Profile

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/me/change-password` | Change password (requireAuth) |
| GET | `/api/me` | Current user + plan (requireAuth) |
| GET | `/api/me/export` | DSGVO export (requireAuth) |
| POST | `/api/me/plan` | Change plan (requireAuth) |
| POST | `/api/me/plan/cancel` | Cancel to FREE (requireAuth) |
| DELETE | `/api/me` | Delete account (requireAuth) |
| PUT | `/api/me/profile` | Update profile (requireAuth) |

## Plans & Geo

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/plans` | Plan limits (public) |
| GET | `/api/geo/coordinates` | Geocode (requireAuth) |

## Listings

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/listings` | Search listings (requireAuth) |
| GET | `/api/my/listings` | My listings (requireAuth) |
| POST | `/api/listings` | Create listing (requireAuth) |
| PUT | `/api/listings/:id` | Update listing (requireAuth) |
| DELETE | `/api/listings/:id` | Soft-delete listing (requireAuth) |

## Capacities

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/capacities` | Search capacities (requireAuth) |
| GET | `/api/capacities/:id` | Get capacity (requireAuth) |
| POST | `/api/capacities` | Create capacity, agency only (requireAuth) |
| PATCH | `/api/capacities/:id` | Update capacity (requireAuth) |
| POST | `/api/capacities/:capacityId/reserve` | Reserve (requireAuth) |

## Internal (Cron)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/internal/expire-reservations` | cronRateLimit + secret/IP |
| POST | `/api/internal/sla-scan` | cronRateLimit + secret/IP |
| POST | `/api/internal/recompute-supplier-metrics` | cronRateLimit + secret/IP |
| POST | `/api/internal/recompute-compliance` | cronRateLimit + secret/IP |
| POST | `/api/internal/cleanup-idempotency` | Delete expired idempotency rows (cronRateLimit + secret) |

## Requests & Policies

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/requests` | Create request (requireAuth, requestLimiter) |
| POST | `/api/requests/broadcast` | Broadcast requests (requireAuth, requestLimiter) |
| GET | `/api/requests/:id` | Get request (requireAuth) |
| POST | `/api/requests/:id/sla` | Set SLA (requireAuth) |
| GET | `/api/suppliers/:agencyId/scorecard` | Supplier scorecard (requireAuth) |
| POST | `/api/policies/compliance` | Compliance policy (requireAuth) |
| GET | `/api/my/requests/sent` | Sent requests (requireAuth) |
| GET | `/api/my/requests/received` | Received requests (requireAuth) |
| PATCH | `/api/requests/:id/status` | Update status (requireAuth) |

## Ratings & Reports

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/ratings` | Submit rating (requireAuth) |
| GET | `/api/users/:id/ratings` | Ratings for user |
| GET | `/api/ratings/pending` | Pending ratings (requireAuth) |
| POST | `/api/reports` | Report user (requireAuth) |

## Payment

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/payment/config` | Payment config + plans |
| POST | `/api/payment/checkout` | Start checkout (requireAuth) |
| POST | `/api/payment/confirm` | Confirm payment (requireAuth) |
| POST | `/api/payment/webhook/stripe` | Stripe webhook (raw body) |
| POST | `/api/payment/webhook/paypal` | PayPal webhook |
| GET | `/api/payment/history` | Payment history (requireAuth) |

## 404

Any other `/api/*` returns `404` with `{ error: "NOT_FOUND", message: "API-Route nicht gefunden." }`.
