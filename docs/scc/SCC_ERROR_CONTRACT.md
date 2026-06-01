# SCC Error Contract

> Verbindliche Fehler-Shapes für alle `/staff/api`-Endpunkte.
> SCC WAVE 03 — 2026-05-27

---

## Allgemeines Format

Alle SCC-Responses (Fehler und Erfolg) folgen diesem Envelope:

```json
{
  "success": false,
  "error": {
    "code":    "SCC_ERROR_CODE",
    "message": "Lesbarer Text (immer auf Deutsch)"
  }
}
```

Erfolgs-Responses:
```json
{
  "success": true,
  "data": { ... }
}
```

---

## Fehler-Codes nach HTTP-Status

### 400 Bad Request

| Code | Auslöser |
|---|---|
| `SCC_CONFIRM_REQUIRED` | `confirmed` fehlt oder ist nicht `true` |
| `SCC_REASON_REQUIRED` | `reason` zu kurz (< 10 Zeichen) |
| `SCC_TYPED_CONFIRMATION_REQUIRED` | `typed_confirmation` fehlt oder stimmt nicht |
| `STEP_UP_METHOD_UNSUPPORTED` | Nur `method: "password"` erlaubt |
| `STEP_UP_PASSWORD_REQUIRED` | Password-Feld leer |
| `RUNBOOK_INVALID` | Runbook mit unbekanntem Step-Typ oder fehlerhafter Konfiguration |
| `EMPTY_BODY` | Message-Body leer oder nur Whitespace |
| `BODY_TOO_LONG` | Message-Body > 10.000 Zeichen |
| `INVALID_TRANSITION` | Status-Übergang nicht whitelisted |

**Shape mit zusätzlichen Feldern (typed confirmation):**
```json
{
  "success": false,
  "error": {
    "code": "SCC_TYPED_CONFIRMATION_REQUIRED",
    "message": "Tippe zur Bestätigung genau ein: \"READ ONLY ON\"",
    "expected_hint": "READ ONLY ON"
  }
}
```

---

### 401 Unauthorized

| Code | Auslöser |
|---|---|
| `SCC_NOT_AUTHENTICATED` | Kein `staffUserId` in der Staff-Session |
| `SCC_STEP_UP_FAILED` | Passwort-Reauth fehlgeschlagen |

---

### 403 Forbidden

| Code | Auslöser |
|---|---|
| `SCC_NOT_AUTHORIZED` | User nicht in `tempconnect_staff` mit `is_active=true` |
| `SCC_ORIGIN_FORBIDDEN` | Origin/Referer fehlt oder nicht in der Allowlist (Production) |
| `ASSIGNEE_NOT_STAFF` | Zugewiesener Benutzer ist kein aktiver Staff |

---

### 428 Precondition Required

| Code | Auslöser |
|---|---|
| `SCC_STEP_UP_REQUIRED` | Kein `staffStepUpAt` in Session vorhanden |
| `SCC_STEP_UP_EXPIRED` | Step-up TTL abgelaufen (risk-level-abhängig) |

**Shape 428 (Expired):**
```json
{
  "success": false,
  "error": {
    "code": "SCC_STEP_UP_EXPIRED",
    "message": "Re-Authentifizierung abgelaufen (critical: 5 Min). Bitte erneut bestätigen.",
    "risk_level": "critical",
    "max_age_min": 5
  }
}
```

**Shape 428 (Required):**
```json
{
  "success": false,
  "error": {
    "code": "SCC_STEP_UP_REQUIRED",
    "message": "Re-Authentifizierung erforderlich.",
    "risk_level": "high"
  }
}
```

---

### 429 Too Many Requests

| Code | Auslöser | Limiter |
|---|---|---|
| `SCC_RATE_LIMIT` | Zu viele Login-Versuche | `staffLoginLimiter` (5/15min pro IP) |
| `SCC_MUTATION_RATE_LIMIT` | Zu viele mutierende Requests | `staffMutationLimiter` (30/5min pro User) |

---

### 500 Internal Server Error

| Code | Auslöser |
|---|---|
| `SCC_GUARD_ERROR` | Unerwarteter Fehler in der Access-Middleware |
| `SCC_INTERNAL_ERROR` | Unerwarteter Fehler in einem Route-Handler |

---

## Step-up TTL nach Risk Level

| `risk_level` | TTL | Endpunkte |
|---|---|---|
| `critical` | 5 Minuten | Feature Flags, Hetzner-Aktionen |
| `high` | 10 Minuten | Subscription Approve/Activate, Automation |
| `medium` | 15 Minuten | (default) |

---

## Origin Guard Verhalten

| Umgebung | Fehlender Origin | Falscher Origin | Localhost |
|---|---|---|---|
| Development | Erlaubt (Warnung) | Erlaubt (Warnung) | Erlaubt |
| Production | 403 `SCC_ORIGIN_FORBIDDEN` | 403 `SCC_ORIGIN_FORBIDDEN` | — |

---

## Hinweise für Frontend-Clients

- Auf `428` → Step-up-Modal öffnen und POST `/staff/api/auth/step-up` auslösen
- Auf `403 SCC_ORIGIN_FORBIDDEN` → Bug im Client-Code; Origin-Header fehlt
- Auf `429` → Retry-After-Header auswerten; Benutzer informieren
- Auf `401 SCC_NOT_AUTHENTICATED` → Zum Staff-Login weiterleiten
- Auf `500 SCC_GUARD_ERROR` → Fehler loggen, Sentry-Alert

---

*SCC WAVE 03 — 2026-05-27*
