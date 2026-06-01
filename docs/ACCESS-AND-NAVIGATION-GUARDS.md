# Access and Navigation Guards

## Logout and Access Hardening

- Logout endpoint (`POST /api/auth/logout`) destroys the server session and clears `tc.sid`.
- Protected HTML pages under `/public/*.html` are now delivered with `Cache-Control: no-store` in nginx, reducing browser-back cache leakage after logout.
- Enterprise shell checks `/api/me` and redirects unauthenticated users to `/`.
- Protected APIs remain server-enforced (`401/403`) and are the hard security boundary.

## Marketplace Login Requirement

- Marketplace and Capacity Exchange APIs are login-protected.
- Additional hardening:
  - `GET /api/marketplace/demand-requests/:id/offers` now enforces requester ownership.
  - `GET /api/capacity-exchange/entries/:id/analytics` now enforces listing ownership.

## Topbar Logo Rule

Unified rule for brand click target:

- Not logged in: `/` (landing)
- Logged in `worker`: `/public/einsatzportal-dashboard.html`
- Logged in `company|agency|admin`: `/public/enterprise.html`

Implemented centrally in `frontend/public/js/pageShell.js` via dynamic brand target based on `/api/me`.
