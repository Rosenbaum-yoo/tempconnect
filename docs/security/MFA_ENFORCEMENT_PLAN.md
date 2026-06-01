# MFA Enforcement Plan — TempConnect

> WAVE 09 — 2026-05-26
> Status: **PHASE 1 AKTIV** — Audit-Only (`enforce: false`) deployed am 2026-05-27. Phase 2 (Enforce) nach Ablauf der Enrollmentfrist.

Dieses Dokument beschreibt exakt, welche Routen die `requireMfa`-Middleware erhalten,
in welcher Reihenfolge, und mit welchem Rollout-Modus.

---

## Voraussetzungen (bereits erfüllt)

| Bedingung | Status |
|---|---|
| `api/middleware/requireMfa.js` implementiert | ✅ |
| `POST /api/mfa/verify` Endpunkt aktiv | ✅ |
| `users.mfa_enabled` Spalte in DB | ✅ |
| `req.session.mfaVerifiedAt` wird gesetzt | ✅ |
| Recovery Codes implementiert | ✅ |

---

## Middleware-Signatur (zur Erinnerung)

```js
import { requireMfa } from "../middleware/requireMfa.js";

// Enforce-Modus (blockiert): Standard für Phase 2
router.post("/route", requireAuth, requireMfa({ pool }), handler);

// Audit-Only-Modus (loggt, blockiert nicht): für Phase 1 / weiche Einführung
router.post("/route", requireAuth, requireMfa({ pool, enforce: false }), handler);
```

Fehlerverhalten:
- MFA nicht eingerichtet → `428 MFA_REQUIRED` + Setup-URL
- MFA eingerichtet, aber Session-Verifikation fehlt/abgelaufen → `428 MFA_VERIFY_REQUIRED` + Verify-URL
- Session gültig (< 8 h seit letztem Verify) → `next()`

---

## Rollout-Sequenz

### Phase 1 — Audit-Only (Enrollmentfrist, empfohlen: 30 Tage)

Ziel: Sichtbarkeit gewinnen, wie viele aktive Nutzer noch kein MFA haben,
ohne Betrieb zu stören. Alle Routen erhalten `enforce: false`.

**Kein Owner-Approval für einzelne Routen nötig** — nur für den Startschuss.
Dauer: Owner bestimmt (Empfehlung: 30 Tage, Minimum: 14 Tage).

### Phase 2 — Enforce (nach Ablauf der Enrollmentfrist)

`enforce: false` wird entfernt (oder weggelassen), Standard ist `enforce: true`.
Nutzer ohne MFA werden ab diesem Zeitpunkt blockiert und zur Einrichtung weitergeleitet.

---

## Welche Routen — in welcher Datei

### 1. OCC — Owner Control Center (`api/routes/occ/`)

Alle OCC-Mutations sind die sensibelste Stufe. Enforcement ab Phase 1 (sofort, aber audit-only).

**Datei: `api/routes/occ/decisionsRequests.js`**
| Methode | Pfad | Aktion |
|---|---|---|
| `POST` | `/api/owner-control/decisions-requests/decide` | Owner-Entscheidung fällen |
| `POST` | `/api/owner-control/decisions-requests/triage` | Anfrage priorisieren |

Middleware-Position: nach `requireOwnerControlAccess`, vor Handler.

**Datei: `api/routes/occ/automation.js`**
| Methode | Pfad | Aktion |
|---|---|---|
| `POST` | `/api/owner-control/automation/trigger` | Automation manuell auslösen |

**Datei: `api/routes/occ/warp.js`**
| Methode | Pfad | Aktion |
|---|---|---|
| `POST` | `/api/owner-control/warp/execute` | Warp-Aktion ausführen |
| `POST` | `/api/owner-control/warp/dry-run` | Warp-Probe (schreibt nicht, aber ist sensitiv) |

> `warp/dry-run` erhält MFA ebenfalls — ein Dry-Run liest interne Systemzustände,
> die nicht unbegrenzt abrufbar sein sollen.

**Import-Zeile (alle vier OCC-Dateien):**
```js
import { requireMfa } from "../../middleware/requireMfa.js";
```

---

### 2. Staff Control Center (`api/routes/staffControlCenter.js`)

SCC hat bereits `requireStepUp` (15-min Re-Auth). `requireMfa` kommt als **ergänzende Schicht**
davor — Step-Up allein schützt nicht gegen gestohlene Sessions ohne MFA.

Betroffene Routen: alle, die bereits `requireStepUp` haben (Zeilen 148–858).

| Zeile | Pfad | Bestehende Guards |
|---|---|---|
| 148 | `POST /staff/customer-requests/:id/messages` | requireStaff, requireStepUp |
| 165 | `POST /staff/customer-requests/:id/transition` | requireStaff, requireStepUp, requireConfirmAndReason |
| 184 | `POST /staff/customer-requests/:id/assign` | requireStaff, requireStepUp, requireConfirmAndReason |
| 201 | `POST /staff/customer-requests/:id/release` | requireStaff, requireStepUp |
| 233 | `POST /staff/inbox/bulk` | requireStaff, requireStepUp, requireConfirmAndReason |
| 370 | `POST /staff/subscription-requests/:id/transition` | requireStaff, requireStepUp, requireConfirmAndReason |
| 416 | `POST /staff/subscription-requests/:id/approve` | requireStaff, requireStepUp, requireConfirmAndReason |
| 453 | `POST /staff/subscription-requests/:id/reject` | requireStaff, requireStepUp, requireConfirmAndReason |
| 478 | `POST /staff/subscription-requests/:id/activate` | requireStaff, requireStepUp, requireConfirmAndReason |
| 548 | `POST /staff/subscription-requests/:id/assign` | requireStaff, requireStepUp, requireConfirmAndReason |
| 576 | `POST /staff/subscription-requests/:id/documents` | requireStaff, requireStepUp, requireConfirmAndReason |
| 618 | `POST /staff/subscription-requests/:id/offer` | requireStaff, requireStepUp, requireConfirmAndReason |
| 700 | `POST /staff/strategic-requests/:id/convert-to-subscription` | requireStaff, requireStepUp, requireConfirmAndReason |
| 796 | `POST /staff/platform/feature-flags` | requireStaff, requireStepUp, requireConfirmAndReason |
| 822 | `POST /staff/hetzner/action` | requireStaff, requireStepUp, requireConfirmAndReason |
| 839 | `POST /staff/automation/run` | requireStaff, requireStepUp, requireConfirmAndReason |
| 858 | `POST /staff/audit-decisions` | requireStaff, requireStepUp, requireConfirmAndReason |

**Nicht enthalten:** `POST /staff/auth/step-up` (Zeile 105), `POST /staff/auth/logout` (Zeile 118),
`POST /staff/auth/login` (Zeile 890) — Auth-Endpunkte selbst dürfen kein MFA-Gate haben.

Middleware-Position: `requireStaff, requireMfa({ pool }), requireStepUp, ...`
(MFA vor Step-Up — Step-Up setzt eine valide Session voraus, MFA prüft deren Vertrauenslevel.)

**Import-Zeile:**
```js
import { requireMfa } from "../middleware/requireMfa.js";
```

---

### 3. Settings & Billing (`api/routes/settings.js`, `api/routes/payment.js`)

**Datei: `api/routes/settings.js`**
| Zeile | Methode | Pfad | Permission |
|---|---|---|---|
| 35 | `PATCH` | `/api/settings` | org.settings (owner/admin) |

Middleware-Position: `requireAuth, requireMfa({ pool }), orgSettingsGate, requirePermission(...)`.

**Datei: `api/routes/payment.js`** (org.billing)
| Zeile | Methode | Pfad | Aktion |
|---|---|---|---|
| 56 | `POST` | `/api/payment/customer-portal` | Stripe Portal öffnen |
| 92 | `POST` | `/api/payment/checkout` | Checkout starten |
| 143 | `POST` | `/api/payment/confirm` | Zahlung bestätigen |

**Nicht enthalten:** `POST /api/payment/webhook/stripe` (Zeile 194) und
`POST /api/payment/webhook/paypal` (Zeile 288) — Webhook-Endpunkte sind server-to-server,
niemals sessionbasiert.

**Import-Zeile (beide Dateien):**
```js
import { requireMfa } from "../middleware/requireMfa.js";
```

---

## Gesamtübersicht

| Phase | Modus | Dateien | Routen gesamt |
|---|---|---|---|
| Phase 1 | Audit-Only (`enforce: false`) | occ/*, staffControlCenter.js, settings.js, payment.js | 26 |
| Phase 2 | Enforce (Standard) | dieselben | 26 |

---

## Empfohlene Enrollmentfrist

| Zeitraum | Maßnahme |
|---|---|
| Tag 0 | Owner genehmigt Plan, Phase 1 wird deployed |
| Tag 1–30 | Nutzer sehen Banner "MFA-Pflicht ab [Datum]" (Frontend-Aufgabe) |
| Tag 30 | Phase 2 deployed — Enforcement aktiv |

> Die 30-Tage-Frist ist eine Empfehlung. Owner kann kürzen (Minimum: 7 Tage für interne Teams)
> oder verlängern. Bei reinen Pilot-Kunden ist 14 Tage realistisch.

---

## Offene Entscheidungen für Owner (aus IDENTITY_MODEL.md)

| ID | Frage |
|---|---|
| ID-01 | MFA-Pflicht für owner/admin: Wann? (Phase 2 Startdatum) |
| ID-02 | MFA-Pflicht für Staff SCC als Ergänzung zu Step-Up: Ja/Nein? |
| ID-04 | Enrollmentfrist: 30 Tage, 14 Tage, oder anderes Datum? |

**Dieses Dokument kann erst umgesetzt werden, wenn ID-01 und ID-04 entschieden sind.**
ID-02 ist optional — SCC-Routen werden nur hinzugefügt wenn Owner zustimmt.

---

## Was dieser Plan NICHT abdeckt

- Frontend-Banner für Enrollmentfrist (separates Ticket)
- MFA für Vendor-Pool-Mutations (im IDENTITY_MODEL erwähnt, hier bewusst nicht enthalten — separates Review erforderlich)
- Änderungen an `requireMfa.js` selbst — die Middleware ist final

---

*Erstellt: 2026-05-26 | Zuständig: Claude | Freigabe ausstehend: Owner*
*Referenz: `api/middleware/requireMfa.js`, `docs/security/IDENTITY_MODEL.md` (ID-01, ID-02, ID-04)*
