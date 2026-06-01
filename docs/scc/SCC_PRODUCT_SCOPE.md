# SCC Product Scope — Staff Control Center

> Eingefroren mit SCC WAVE 00 — Phase 3 — 2026-05-27

---

## Was ist das SCC?

Das **Staff Control Center (SCC)** ist die interne Operations-Konsole des TempConnect-Teams.
Es ist **kein Kundenprodukt** — es ist das Werkzeug, mit dem das TempConnect-Team
Abonnements verwaltet, Plattformoperationen durchführt und Infrastrukturschritte kontrolliert.

**Zielbenutzer:** Nur explizit eingetragene Mitglieder der `tempconnect_staff`-Allowlist.

---

## Abgrenzung: SCC vs. OCC vs. SOC vs. OrgCC

| Bereich | Pfad | Zweck | Zugang |
|---|---|---|---|
| **SCC** (Staff Control Center) | `/staff/` + `/staff/api/*` | TempConnect-Team-Steuerung: Commercial, Subscription, Hetzner, Platform | `tempconnect_staff` Allowlist + MFA |
| **OCC** (Owner Control Center) | `/owner-control/` + `/api/owner-control/*` | Eigentümer-Ebene: Executive KPIs, Systemsteuerung, Plattform-Governance | Nur Eigentümer |
| **SOC** (Support Operations Center) | `/support-ops/` | Operative Ticketbearbeitung, Kundensupport | Support-Agents |
| **OrgCC** (Organization Control Center) | `/public/organization.html`, `/api/org/*` | Kunden-Org-Verwaltung | Org-Owner / Org-Admin |
| **Admin Panel** | `/public/admin_panel.html`, `/api/admin/*` | Interne Admin-Aktionen | TBD / Owner |

### Nicht-verhandelbare Grenzen

- **Kein SCC-Zugang für Kunden, Org-Owner, normale Admins.**
- **Support-Agent erhält NICHT automatisch SCC.**
- **OCC-Owner erhält NICHT automatisch SCC.**
- **Keine Navigation zwischen Kunden-App und SCC.**
- **Kein Impersonation ohne separates Freigabekonzept.**
- **Staff erhält NICHT automatisch alle Kundendaten ohne Zweckbindung.**

---

## SCC-Module (aktuell)

| Modul | Endpunkt | Beschreibung |
|---|---|---|
| Bootstrap | `GET /bootstrap` | Staff-Identity, Platform-Summary, Executive-Snapshot, Hetzner-Mode |
| Auth | `POST /auth/login`, `/auth/step-up`, `/auth/logout` | Separate Staff-Session |
| Executive | `GET /executive` | KPI-Snapshot |
| Platform | `GET /platform`, `POST /platform/feature-flags` | Platform-Status, Feature-Flags |
| Support | `GET /support` | Support-Snapshot |
| Operations | `GET /operations` | Operations-Snapshot |
| Hetzner | `GET /hetzner`, `POST /hetzner/action` | Infra-Overview + Safe Actions |
| Revenue | `GET /revenue` | Umsatz-Snapshot |
| Risk/Trust | `GET /risk-trust` | Risiko-Snapshot |
| Audit | `GET /audit`, `GET /audit-decisions`, `POST /audit-decisions` | Audit-Log + Entscheidungen |
| Data Explorer | `GET /data-explorer`, `GET /data-explorer/:key` | Vordefinierte Views |
| Automation | `GET /automation`, `POST /automation/run` | Runbooks |
| Customer Requests | `GET/POST /customer-requests/*` | Kundananfragen-Inbox |
| Combined Inbox | `GET /inbox`, `POST /inbox/bulk`, `GET /inbox/meta` | Unified Queue |
| Subscription Requests | `GET/POST /subscription-requests/*` | Abonnement-Anfragen-Workflow |
| Subscription Documents | `GET/POST /subscription-documents/*` | Dokument-Download |
| Strategic Requests | `POST /strategic-requests/:id/convert-to-subscription` | Konvertierung |

---

## SCC-Sicherheitsarchitektur (aktuell)

```text
Request → /staff/api/*
  → SCC-Session (tc.staff.sid) — GETRENNT von Kundensession
  → createStaffControlAccessMiddleware (staffControlAccess.js)
      → tempconnect_staff Allowlist Check
  → [Mutierende Endpoints] requireMfa (enforce: false)
  → [Mutierende Endpoints] createStaffStepUpMiddleware (15min fix)
  → [Mutierende Endpoints] requireConfirmAndReason
  → Handler → Service → writeStaffAudit
```

**Bekannte WAVE-00-Gaps (für nachfolgende WAVEs):**
- Step-up: `confirmed=true` allein reicht aktuell (WAVE 02)
- Kein Rate Limit auf `/auth/login` (WAVE 03)
- MFA: `enforce: false` (WAVE 01/02)
- Step-up TTL fix 15min, nicht risk-basiert (WAVE 02)
- **P0: Hetzner `stubbed-ok` für Mutationen ohne Token (WAVE H1 — sofort)**

---

## Branch-Entscheidung

**Branch:** `release/enterprise-premium-market-ready`

Begründung: SCC ist integraler Teil des Release. Kein separater Branch nötig —
die Phase-3-Wellen laufen auf demselben Release-Branch wie Phase 1 + 2.

---

*SCC WAVE 00 — Phase 3 — 2026-05-27*
