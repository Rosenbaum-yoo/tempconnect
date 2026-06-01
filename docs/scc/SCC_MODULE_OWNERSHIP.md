# SCC Module Ownership — Rollen, Permissions, Verantwortlichkeiten

> Eingefroren mit WAVE 00 — Phase 3 — 2026-05-27.

---

## 1. Access-Modell (aktuell)

SCC verwendet kein granulares RBAC innerhalb der Staff-Schicht.
**Alle `tempconnect_staff`-Mitglieder haben Zugriff auf alle SCC-Module.**

Ziel nach WAVE 11: Rollen innerhalb Staff (`role/scope`-Feld in `tempconnect_staff`).

---

## 2. `tempconnect_staff` — Tabellenstruktur (Migration 095)

| Spalte | Typ | Bedeutung |
|---|---|---|
| `user_id` | UUID | FK → users.id |
| `email` | TEXT | Anzeige-E-Mail |
| `display_name` | TEXT | Anzeigename |
| `is_active` | BOOLEAN | Aktiv-Flag — false = kein Zugang |
| `requires_step_up` | BOOLEAN | Step-up erforderlich bei Mutationen |
| `last_access_at` | TIMESTAMPTZ | Letzter Zugriff (auto-update) |
| `notes` | TEXT | Interne Notizen (Bootstrap-Info etc.) |
| `revoked_at` | TIMESTAMPTZ | Revocation-Zeitpunkt |
| `created_at` | TIMESTAMPTZ | Erstellungszeitpunkt |

**Fehlende Spalten (WAVE 01-Ziel):**
- `role` / `scope` — Granulare Rolle innerhalb Staff
- `last_mfa_at` — Letzter MFA-Zeitpunkt
- `last_reviewed_at` + `reviewed_by` — Access-Review-Tracking
- `access_reason` — Warum diese Person Staff ist
- `expires_at` — Optional: zeitlich begrenzter Zugang

---

## 3. Module + Ownership-Matrix

| Modul | Daten-Owner | Lesen | Mutieren | Risiko | Notes |
|---|---|---|---|---|---|
| Executive Summary | Platform-DB | Alle Staff | — | low | Read-only Aggregation |
| Platform / Feature Flags | Platform-DB | Alle Staff | Alle Staff + Step-up | **critical** | Flag-Änderung wirkt sofort |
| Support Snapshot | Support-DB | Alle Staff | — | low | Nur Übersicht |
| Operations Snapshot | Platform-DB | Alle Staff | — | low | Health + Metriken |
| Hetzner Infra | Hetzner Cloud API | Alle Staff | Alle Staff + Step-up | **high** | Safe-Actions-Whitelist |
| Revenue Snapshot | Billing-DB | Alle Staff | — | low | Finanzübersicht |
| Risk/Trust | Platform-DB | Alle Staff | — | low | |
| Audit Log | `staff_control_audit_log` | Alle Staff | Alle Staff (create decision) | medium | Nicht löschbar |
| Data Explorer | Platform-DB | Alle Staff | — | medium | Vordefinierte Views |
| Automation / Runbooks | Platform-DB + Hetzner | Alle Staff | Alle Staff + Step-up | **high** | Nur whitelisted Steps |
| Customer Requests | `staff_customer_requests` | Alle Staff | Alle Staff + Step-up | medium | Kundenkontakt-Workflow |
| Combined Inbox | Customer + Subscription | Alle Staff | Alle Staff + Step-up | medium | Kein Bulk-Activate |
| Subscription Requests | `subscription_requests` | Alle Staff | Alle Staff + Step-up | **high** | Approve/Activate |
| Subscription Documents | `subscription_documents` | Alle Staff | Alle Staff + Step-up | medium | Dokument-Generierung |
| Strategic Requests | `strategic_collaboration_requests` | Alle Staff | Alle Staff + Step-up | medium | Konvertierung |

---

## 4. Kritische Aktionen (High/Critical) — besondere Kontrolle

| Aktion | Risiko | Besonderheit |
|---|---|---|
| `platform/feature-flags` setzen | critical | Wirkt sofort auf alle Nutzer |
| `subscription-requests/:id/activate` | high | Vertragsaktivierung, irreversibel ohne Rollback |
| `subscription-requests/:id/approve` | high | Genehmigung, Dokument wird erzeugt |
| `hetzner/action` (reboot etc.) | high | Infrastruktur-Mutation |
| `automation/run` | high | Runbook-Ausführung |

**Ziel WAVE 02:** Typed Confirmation für critical-Aktionen.
**Ziel WAVE 03:** 2-Person-Approval optional für critical-Aktionen.

---

## 5. Bootstrap-Prozess

1. Owner setzt `STAFF_USER_IDS=<uuid1>,<uuid2>` in `.env`
2. Erster Request durch User → `createStaffControlAccessMiddleware` trägt User in `tempconnect_staff` ein
3. Nach Bootstrap: `STAFF_USER_IDS` auf Minimum reduzieren (nur für neue Initialisierungen)
4. Neue Staff-Mitglieder: über DB-Migration oder Owner-Prozess, nicht mehr über ENV

**Warning:** `STAFF_USER_IDS` dauerhaft in Production ist ein Sicherheitsrisiko (WAVE 11-Ziel).

---

## 6. Session-Modell

| Parameter | Wert |
|---|---|
| Cookie-Name | `tc.staff.sid` |
| Cookie-Path | `/staff` |
| Session-Key | `staffUserId` |
| Step-up-Key | `staffStepUpAt` |
| Auth-Timestamp | `sccAuthorizedAt` |
| Session-Secret | `STAFF_SESSION_SECRET` (ENV) |
| Fallback | `SESSION_SECRET + ':staff'` — in **Production verboten** (WAVE 01-Ziel) |

---

## 7. Ziel-RBAC nach WAVE 11

| Rolle | Bereich | Module |
|---|---|---|
| `staff_commercial` | Commercial | Customer Requests, Subscription Requests, Combined Inbox, Documents |
| `staff_ops` | Operations | Hetzner, Automation, Platform Flags, Operations |
| `staff_support` | Support | Support Snapshot, Customer Requests (read) |
| `staff_audit` | Audit | Audit Log, Data Explorer |
| `staff_admin` | Alle | Alle Module + Staff Access Management |

**Bis WAVE 11:** Alle Staff = voller Zugriff (akzeptierter Interim-Zustand für kleine Teams).

---

*SCC WAVE 00 — Phase 3 — 2026-05-27*
