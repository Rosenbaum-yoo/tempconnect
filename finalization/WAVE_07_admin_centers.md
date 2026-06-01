# WAVE_07 — Adminzentrale, Staff Center, Owner Control Center

> **Phase:** Enterprise. **Prio:** P1. **Voraussetzung:** WAVE_03 + WAVE_06.

---

## Ziel

Interne Steuerung ist professionell, sicher und operativ brauchbar. **Surface-Trennung ist kritisch** — diese Bereiche dürfen NIE für Kundenrollen sichtbar werden.

---

## Surface-Abgrenzung (verbindlich)

| Surface | Pfad | Zweck |
|---|---|---|
| **OCC** (Owner Control Center) | `/owner-control/` | Owner: Systemstatus, Deployment, Migrationen |
| **Staff Control Center** | `/staff/`, `/staff/api/*` | Staff: Kundenbearbeitung, Freigaben |
| **Support-Ops** | `/support-ops/` | Support: Tickets, Incidents |
| **Organization Control Center** | `/public/organization.html`, `/api/org/*` | Kunden-Org-Verwaltung |
| **Admin Panel** | `admin_panel.html` | Internal Admin |

**Keine Redirect-Hacks zwischen diesen Surfaces.**

---

## 1. Staff Center (`/staff/`)

### Aufgaben

- Kundensuche
- Organisationsübersicht
- Plan- und Add-on-Freigaben
- Custom-Plan-Anfragen bearbeiten
- Enterprise Requests bearbeiten
- SLA- / Support-Anfragen
- Contract- / Rahmenvertragsprüfung
- Audit-Einsicht
- Impersonation NUR falls zwingend nötig → streng auditieren und sichtbar markieren

---

## 2. Owner Center (`/owner-control/`)

### Aufgaben

- Systemstatus (DB, Redis/Queue, Storage, App)
- Deployment- / Operationssicht
- Migrationsstatus
- Queue-/Job-Status
- Alerts
- Kritische Operationen NUR mit Step-up-Auth
- Keine Owner-Funktionen für Kundenrollen

---

## 3. Adminzentrale für Projektbetrieb

### Aufgaben

- Produktstatus
- Offene P0/P1-Themen
- Kunden-/Pilotstatus
- Offene Freigaben
- Billing-Ausnahmen
- Vertragsausnahmen
- Security-/Compliance-Aufgaben
- Release-Readiness

---

## Akzeptanzkriterien

- [ ] Staff kann Enterprise- und Custom-Anfragen bearbeiten
- [ ] Owner kann Betrieb sehen, aber nicht unkontrolliert zerstören
- [ ] Jede interne Aktion ist auditierbar
- [ ] Interne Bereiche sind nicht versehentlich öffentlich (URL-Test als Kundenrolle: 404 oder 403)
- [ ] Impersonation (falls genutzt) ist auditiert und im UI sichtbar markiert
- [ ] Surface-Verstöße bereinigt (keine Vermischung)

---

## Stop-Regeln

- Interne Bereiche für Kundenrollen erreichbar → P0, SOFORT
- Impersonation ohne Audit-Log → STOP
- Owner-Aktion ohne Step-up → STOP

---

## Betroffene Dateien

- `frontend/owner-control/index.html` und Sub-Seiten
- `frontend/public/staff/staff.html`, `staff_vanilla_backup_20260521/*`
- `frontend/public/admin_panel.html`, `internal_control_center.html`, `activity.html`
- `frontend/public/organization.html`
- `api/routes/admin.js`, `staffControlCenter.js`, `ownerControlCenter.js`, `orgControlCenter.js`
- `api/services/organizationService.js`, `api/utils/orgBoundary.js`
