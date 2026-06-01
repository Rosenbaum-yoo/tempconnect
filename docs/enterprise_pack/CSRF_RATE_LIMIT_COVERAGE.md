# TempConnect — CSRF & Rate Limit Coverage

> Erstellt: 2026-05-28 | Enterprise Pack | WAVE_13
> Nachweis: Jede mutierende Aktion ist gegen CSRF und Brute-Force geschützt.

---

## CSRF-Schutz

**Implementierung:** `csrfProtect` in `api/middleware/auth.js`
**Mounting:** `app.use("/api/", csrfProtect)` — gilt für ALLE `/api/*` Routen

**Flow:**
1. Client holt CSRF-Token: `GET /api/csrf` → Response: `{ token: "..." }`
2. Client sendet bei POST/PATCH/DELETE: Header `X-CSRF-Token: <token>`
3. Server validiert Token; fehlt er oder ist falsch → 403

**Ausnahmen (kein CSRF erforderlich):**
- `GET`, `HEAD`, `OPTIONS` (read-only)
- `/api/csrf` selbst (Token-Endpoint)
- Rate-Limit-Skip gilt nur für Read-Requests, nicht für CSRF-Validation

**Separate CSRF-Tokens:**
- Platform API: `tc.sid` Cookie + `X-CSRF-Token`
- Staff CC: `X-SCC-CSRF-Token` (eigene CSRF-Middleware in `staffSecurity.js`)
- OCC: Eigene Rate-Limit-Middleware (`occRateLimit`)

---

## Rate Limits (Produktionskonfiguration)

**Service:** `api/middleware/rateLimit.js`
**Store:** Memory (Standard) oder Redis (`RATE_LIMIT_STORE=redis` ENV)
**Standard-Header:** `RateLimit-*` (RFC 6585)

### Limiter-Übersicht

| Limiter | Fenster | Max (Prod) | Gilt für |
|---|---|---|---|
| `authLimiter` | 15 Min | 5 | `POST /api/auth/login`, Register, Password-Reset |
| `requestLimiter` | 10 Min | 30 | Requests (Listings, Deals) |
| `apiLimiter` | 5 Min | 600 | Alle schreibenden API-Calls (POST/PUT/PATCH/DELETE) |
| `analyticsIngestLimiter` | 1 Min | 120 | Analytics-Tracking-Endpunkte |
| `occRateLimit` | 1 Min | 60 | Owner Control Center |
| `supportRateLimit` | 1 Min | 90 | Support-Endpunkte |
| `warpExecutionRateLimit` | 1 Std | 10 | WARP-Ausführungen (OCC) |
| `staffLoginLimiter` | 15 Min | 5 | Staff CC Login |
| `staffMutationLimiter` | 5 Min | 30 | Staff CC Mutationen |
| `cronRateLimit` | 1 Min | 30 | Cron-Endpunkte |
| `exportLimiter` | Admin-Export | (config) | Finance Truth Export |

### Plan-aware Rate Limits

| Plan | Anfragen / 5 Min |
|---|---|
| DEMO | 10 |
| BASIS | 60 |
| PLUS | 120 |
| PRO | 300 |
| INDIVIDUELL | 600 |

**Implementierung:** Plan-aware-Limiter wird via `featureGate` + `orgContext` angewendet.

### Read-Request-Ausnahme

```js
skip: (req) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return true;
  if ((req.path || "").replace(/^\/api(\/v\d+)?/, "") === "/csrf") return true;
  if (p.startsWith("/analytics/track")) return true; // eigener Limiter
  return false;
}
```
→ GET/HEAD/OPTIONS werden nie rate-limited — nur mutierende Requests zählen.

---

## Key-Generator-Strategien

| Limiter | Key-Strategie | Schutz gegen |
|---|---|---|
| `authLimiter` | `ip:path` | IP-basiertes Brute-Force |
| `analyticsIngestLimiter` | `ip:session_id` | Session-basiertes Spam |
| `supportRateLimit` | `userId:path` | User-basiertes Spam |
| `warpExecutionRateLimit` | `occUser:path` | OCC-Missbrauch |
| `staffLoginLimiter` | `ip:scc-login` | Staff-Brute-Force |
| `staffMutationLimiter` | `staffUserId:path` | Staff-Mutationsflut |

---

## Redis-Store

```
RATE_LIMIT_STORE=redis
REDIS_URL=redis://redis:6379
```

Wenn Redis konfiguriert: Limits gelten instanzübergreifend (wichtig bei horizontaler Skalierung).
Fehlt Redis: Soft-Fail → Memory-Store (pro-Instanz).

---

## Abdeckungsnachweis

- Audit-Gate (B-02): 335/335 Endpunkte mit Audit-Middleware ✅
- CSRF: alle `/api/*` Routen ✅ (`app.use("/api/", csrfProtect)`)
- Rate-Limit: Login (5 Versuche/15 Min), API-Writes (600/5 Min), Staff (5/15 Min) ✅
- Separate Sessions: Platform (`tc.sid`) vs. Staff (`staff-cc.sid`) ✅
