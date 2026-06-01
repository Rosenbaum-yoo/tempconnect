# Phase 3 — Staff Control Center auf Profi-Level

> **Zweck:** Diese Schicht setzt parallel zu Phase 1+2 an und finalisiert das **Staff Control Center (SCC)** auf professionelles Enterprise-Operations-Level. Anders als die anderen Phasen knüpft sie nicht an Konzepte an, sondern an **vorhandenen Code** im Repo.

---

## 1. Was Phase 3 ist

Der SCC-Strang existiert im Repo schon substanziell: Routes, Services, Tests, Migrations, React-App, eigene Session, Hetzner-Service mit Whitelist. Es ist **kein Konzept mehr** — es ist Code, der noch nicht Profi-/Enterprise-Niveau erreicht hat.

Phase 3 macht das SCC enterprise-tauglich:
- **Track A** — SCC Profi-Level (Identity, Step-up, UI, Audit, Access Management, Tests)
- **Track B** — SCC Hetzner + Claude Code Work Orders (Infrastruktur-Control-Plane, Claude-Code-gesteuerte Entwicklungsaufträge)

---

## 2. Verhältnis zu Phase 1 und Phase 2

| Phase | Ebene | Fokus |
|---|---|---|
| Phase 1 | Fachlich-architektonisch | Produkt korrekt bauen |
| Phase 2 | Release-operativ | Produkt auslieferbar machen |
| **Phase 3** | **SCC-spezifisch** | **Interne Steuerzentrale finalisieren** |

Phase 3 läuft **parallel**, nicht sequenziell. Während Phase 2 das Außenprodukt zur Release-Reife bringt, bringt Phase 3 das interne Tooling zur Operations-Reife.

**Anknüpfungspunkte zu Phase 1/2:**

| Phase-3-Welle | Greift in Phase-1/2 |
|---|---|
| Track A WAVE 00 (Scope) | `WAVE_07_admin_centers` Surface-Trennung wird konkretisiert |
| Track A WAVE 01-03 (Security) | `WAVE_06_security` + Phase-2 WAVE 11 — SCC-spezifische Schicht |
| Track A WAVE 05 (Commercial Inbox) | `WAVE_09_billing` + Phase-2 WAVE 13 — Staff-Workflow |
| Track A WAVE 06 (Subscription) | `WAVE_02_commercial` + `WAVE_09_billing` |
| Track A WAVE 10 (Audit) | `WAVE_13_observability` + `SPECIAL_enterprise_pack` |
| Track A WAVE 12 (Tests/CI) | Phase-2 WAVE 04 |
| Track A WAVE 13 (Release) | Phase-2 WAVE 01 + WAVE 15 |
| Track B (gesamt) | NEU — war in Phase 1/2 nicht angelegt |

---

## 3. Inhalt dieser Schicht

| Datei | Zweck |
|---|---|
| `TRACK_A_PROFI.md` | 13 SCC-Wellen (00-13): Identity, Step-up, UI, Audit, Tests |
| `TRACK_B_HETZNER.md` | 9 H-Wellen (H0-H8): Hetzner-Hardening + Claude Work Orders |
| `GATES.md` | SCC Gates A-E + H8 Final Gate |
| `CLAUDE_HOOKS.md` | Claude-Code-Schutz-Hooks (PreToolUse, Secret-Read, Required-Test) |
| `WORK_ORDERS.md` | Claude Code Work Order Modell + Hetzner Action Matrix |
| `MANUAL_TASKS.md` | SCC-spezifische Owner-Aufgaben |
| `MASTERPROMPT.md` | Kombinierter Start-Prompt für die SCC-Finalisierung |

---

## 4. Aktueller Code-Stand (Wahrheitspunkt)

Im Repo existieren bereits:

```text
api/routes/staffControlCenter.js
api/services/staffControlService.js
api/services/staffAuditService.js
api/services/staffCombinedInboxService.js
api/services/staffCustomerRequestsService.js
api/services/staffSubscriptionRequestsService.js
api/services/staffHetznerService.js
api/services/staffRunbookService.js
api/middleware/staffControlAccess.js
frontend/src/staff/*
frontend/staff.html
frontend/vite.config.staff.ts
frontend/public/staff/staff.html
sql/migrations/095_staff_control_center.sql
sql/migrations/096_staff_customer_requests.sql
docs/STAFF_CONTROL_CENTER.md
api/test/staffControlCenter.test.js
api/test/staffCombinedInbox.test.js
api/test/staffSubscriptionRequests.routes.test.js
api/test/security/support-occ-boundaries.test.js
```

Aktuelle Test-Lage: **55 PASS / 0 FAIL** in den SCC-/Security-Tests. Build:scc grün. HTMLHint grün.

**SCC ist reifer als der Rest** — braucht keine Breite mehr, sondern Schärfe (Security-Hardening, Profi-UI, Audit-Evidence).

---

## 5. Zielwerte SCC

Nach Umsetzung beider Tracks:

```
SCC technische Basis:          9,5 / 10
SCC Buildfähigkeit:            10  / 10
SCC Security Boundary:         10  / 10
SCC UX/Profi-Level:            9,3+/ 10
SCC Enterprise Operations:     9,0+/ 10
SCC Hetzner Control Plane:     9,3+/ 10
SCC Claude Work Orders:        9,0+/ 10
```

---

## 6. Rollenabgrenzung (verbindlich)

| Bereich | Pfad | Zweck | Wer hat Zugriff |
|---|---|---|---|
| **OCC** | `/owner-control/` | Owner-/Eigentümer-Ebene | nur Eigentümer |
| **SCC** | `/staff/` | TempConnect-Team-Steuerung | `tempconnect_staff` Allowlist + MFA |
| **SOC** | `/support-ops/` | Supportnahe Bearbeitung, Tickets | Support-Agents |
| **OrgCC** | `/public/organization.html`, `/api/org/*` | Kunden-Org-Verwaltung | Org-Owner |
| **Admin** | `/admin_panel.html` | Internal Admin | TBD |

**Pflicht:**
- Keine Navigation zwischen Kunden-App und SCC
- Kein Kunden-/Org-Admin erreicht SCC
- Support-Agent erhält **nicht automatisch** SCC
- OCC-Owner erhält **nicht automatisch** SCC
- Staff erhält **nicht automatisch** Kundendaten ohne Zweckbindung

---

## 7. Sicherheitsprinzip Phase 3

```text
Kein freies Kommando.
Kein freier API-Pfad.
Kein SSH aus dem Browser.
Kein Delete.
Kein Rebuild.
Kein Rescue.
Kein Reset Root Password.
Kein Secret-Reveal ohne Audit.
Keine Live-Aktion ohne Staff-Allowlist, MFA/Step-up, Begründung und Audit.
Production ohne HETZNER_CLOUD_TOKEN darf niemals stubbed-ok für Mutationen liefern.
```

---

## 8. Wie Claude Code mit Phase 3 arbeitet

**Pro SCC-Session:**

1. `CLAUDE.md` (Repo-Root, Phase 1)
2. `finalization/00_RULES.md` (Phase 1)
3. `finalization/phase3_scc/README.md` (diese Datei)
4. Die spezifische Track-Datei (`TRACK_A_PROFI.md` ODER `TRACK_B_HETZNER.md`)
5. Bei Hooks-Themen: `CLAUDE_HOOKS.md`
6. Bei Work-Order-Themen: `WORK_ORDERS.md`

**Reihenfolge:** Track A WAVE 00 → 01 → 02 ... → 13, dann Track B H0 → H1 ... → H8. ODER bei vorhandener Kapazität: Track A und B alternierend, mit Track A 00-04 als Voraussetzung für Track B Start.

---

## 9. Was Claude Code NICHT tun darf (kritisch)

- Direkt Live-Hetzner-Server löschen
- Direkt SSH-Kommandos auf Production ausführen
- Secrets lesen oder ausgeben
- Freie Shell-Runbooks in SCC einbauen
- Unreviewte Production-Aktionen ausführen
- Staff-Mitglieder hinzufügen (Owner-Aufgabe)
- `STAFF_USER_IDS` oder `STAFF_SESSION_SECRET` mit echten Werten füllen

Siehe `CLAUDE_HOOKS.md` für technische Durchsetzung.

---

## 10. Verbindlicher Branch

Wie Phase 2: alle Phase-3-Commits auf `release/enterprise-premium-market-ready`. ODER eigener Sub-Branch `release/scc-profi-level`, der später in den Main-Release-Branch mergt — Entscheidung im Track A WAVE 00.
