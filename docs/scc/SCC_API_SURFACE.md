# SCC API Surface

> Vollständige Endpunkt-Inventur. Eingefroren mit WAVE 00 — 2026-05-27.
> Mount-Punkt: `/staff/api` (eigene Express-Instanz, separate Session `tc.staff.sid`)

---

## Auth-Endpunkte (vor Access-Guard)

| Methode | Pfad | Guard | Risiko | Audit |
|---|---|---|---|---|
| POST | `/staff/api/auth/login` | — | medium | ✅ login ok/fail |

---

## Geschützte Endpunkte (hinter `requireStaff`)

### Bootstrap & Auth

| Methode | Pfad | Mutation | Step-up | Confirm+Reason | Risiko | Audit |
|---|---|---|---|---|---|---|
| GET | `/bootstrap` | nein | nein | nein | low | — |
| POST | `/auth/step-up` | nein | nein | nein | medium | ✅ |
| POST | `/auth/logout` | nein | nein | nein | low | ✅ |

### Read-only Aggregationen

| Methode | Pfad | Mutation | Step-up | Confirm+Reason | Risiko |
|---|---|---|---|---|---|
| GET | `/executive` | nein | nein | nein | low |
| GET | `/platform` | nein | nein | nein | low |
| GET | `/support` | nein | nein | nein | low |
| GET | `/operations` | nein | nein | nein | low |
| GET | `/hetzner` | nein | nein | nein | low |
| GET | `/revenue` | nein | nein | nein | low |
| GET | `/risk-trust` | nein | nein | nein | low |
| GET | `/audit` | nein | nein | nein | low |
| GET | `/audit-decisions` | nein | nein | nein | low |
| GET | `/data-explorer` | nein | nein | nein | low |
| GET | `/data-explorer/:key` | nein | nein | nein | low |
| GET | `/automation` | nein | nein | nein | low |
| GET | `/customer-requests-meta/statuses` | nein | nein | nein | low |
| GET | `/subscription-requests-meta` | nein | nein | nein | low |
| GET | `/inbox/meta` | nein | nein | nein | low |

### Customer Requests

| Methode | Pfad | Mutation | Step-up | Confirm+Reason | Risiko | Audit |
|---|---|---|---|---|---|---|
| GET | `/customer-requests` | nein | nein | nein | low | — |
| GET | `/customer-requests/:id` | nein | nein | nein | low | — |
| POST | `/customer-requests/:id/messages` | **ja** | ✅ | nein | low | ✅ |
| POST | `/customer-requests/:id/transition` | **ja** | ✅ | ✅ | medium | ✅ |
| POST | `/customer-requests/:id/assign` | **ja** | ✅ | ✅ | low | ✅ |
| POST | `/customer-requests/:id/release` | **ja** | ✅ | nein | low | ✅ |

### Combined Inbox

| Methode | Pfad | Mutation | Step-up | Confirm+Reason | Risiko | Audit |
|---|---|---|---|---|---|---|
| GET | `/inbox` | nein | nein | nein | low | — |
| POST | `/inbox/bulk` | **ja** | ✅ | ✅ | medium | ✅ |

### Subscription Requests

| Methode | Pfad | Mutation | Step-up | Confirm+Reason | Risiko | Audit |
|---|---|---|---|---|---|---|
| GET | `/subscription-requests` | nein | nein | nein | low | — |
| GET | `/subscription-requests/:id` | nein | nein | nein | low | — |
| POST | `/subscription-requests/:id/transition` | **ja** | ✅ | ✅ | medium | ✅ |
| POST | `/subscription-requests/:id/approve` | **ja** | ✅ | ✅ | **high** | ✅ |
| POST | `/subscription-requests/:id/reject` | **ja** | ✅ | ✅ | medium | ✅ |
| POST | `/subscription-requests/:id/activate` | **ja** | ✅ | ✅ | **high** | ✅ |
| POST | `/subscription-requests/:id/assign` | **ja** | ✅ | ✅ | low | ✅ |
| GET | `/subscription-requests/:id/documents` | nein | nein | nein | low | — |
| POST | `/subscription-requests/:id/documents` | **ja** | ✅ | ✅ | medium | ✅ |
| POST | `/subscription-requests/:id/offer` | **ja** | ✅ | ✅ | medium | ✅ |

### Subscription Documents

| Methode | Pfad | Mutation | Step-up | Confirm+Reason | Risiko | Audit |
|---|---|---|---|---|---|---|
| GET | `/subscription-documents/:id/download` | nein | nein | nein | low | ✅ |

### Strategic Requests

| Methode | Pfad | Mutation | Step-up | Confirm+Reason | Risiko | Audit |
|---|---|---|---|---|---|---|
| POST | `/strategic-requests/:id/convert-to-subscription` | **ja** | ✅ | ✅ | medium | ✅ |

### Platform (Mutations)

| Methode | Pfad | Mutation | Step-up | Confirm+Reason | Risiko | Audit |
|---|---|---|---|---|---|---|
| POST | `/platform/feature-flags` | **ja** | ✅ | ✅ | **critical** | ✅ |

### Hetzner (Mutations)

| Methode | Pfad | Mutation | Step-up | Confirm+Reason | Risiko | Audit |
|---|---|---|---|---|---|---|
| POST | `/hetzner/action` | **ja** | ✅ | ✅ | **high** | ✅ |

### Automation (Mutations)

| Methode | Pfad | Mutation | Step-up | Confirm+Reason | Risiko | Audit |
|---|---|---|---|---|---|---|
| POST | `/automation/run` | **ja** | ✅ | ✅ | **high** | ✅ |

### Audit/Decisions (Mutations)

| Methode | Pfad | Mutation | Step-up | Confirm+Reason | Risiko | Audit |
|---|---|---|---|---|---|---|
| POST | `/audit-decisions` | **ja** | ✅ | ✅ | medium | ✅ |

---

## Gesamtstatistik

| Kategorie | Anzahl |
|---|---|
| Gesamte Endpunkte | 38 |
| Mutierende Endpunkte | 17 |
| Mit Step-up geschützt | 17 |
| Mit Confirm+Reason | 15 |
| Mit Audit-Log | 25+ |
| High-Risk Endpunkte | 5 (approve, activate, feature-flag, hetzner/action, automation/run) |

---

## Offene Gaps (aus WAVE 00 Inventur)

| ID | Endpoint | Gap | Ziel-WAVE |
|---|---|---|---|
| G-01 | `POST /auth/login` | Kein Rate Limit | WAVE 03 |
| G-02 | `POST /auth/step-up` | `confirmed=true` allein — keine echte Reauth | WAVE 02 |
| G-03 | Alle Mutations | MFA `enforce: false` | WAVE 01/02 |
| G-04 | `POST /hetzner/action` | Stub gibt `stubbed-ok` in Production | **WAVE H1 — P0** |
| G-05 | `/staff/api/*` | Kein Origin/CSRF-Check | WAVE 03 |
| G-06 | Step-up Middleware | Feste 15min, nicht risk-basiert | WAVE 02 |
| G-07 | Alle Endpoints | Kein Staff-CSRF-Token | WAVE 03 |

---

*SCC WAVE 00 — Phase 3 — 2026-05-27*
