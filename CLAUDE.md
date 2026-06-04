# CLAUDE.md - Verbindliche Arbeitsanweisung fuer TempConnect
Diese Datei ist vor jeder Coding-Aktion zu lesen. Ohne diese Regeln wird nicht gearbeitet.
Sie ist kontrolliert wachsend: Erkenntnisse werden nur nach Owner-Bestaetigung ergaenzt (→ Abschnitt Erkenntnisse).

## Pflicht-Lesereihenfolge vor dem ersten Edit
1. `AGENTS.md`
2. `.agents/skills/tempconnect-project/SKILL.md`
3. diese `CLAUDE.md`
4. `.claude/CLAUDE_RECS.md` — Claude's persistente Empfehlungsliste (immer lesen!)

Bei Widerspruch gilt: User-Anweisung > `AGENTS.md` > Skill > `CLAUDE.md`.

---

## Mission & Strategischer Kontext

- TempConnect ist **Blueprint fuer 20+ Folgeprojekte**. Jede Entscheidung wird bewertet unter: "Funktioniert dieses Pattern auch in 20 anderen Projekten?"
- Wirtschaftlichkeit und Wiederverwendbarkeit sind oberste Prioritaet. Lieber zwei einfache wiederverwendbare Bausteine als eine elegante Spezialloesung.
- **Aktuelle Phase: Finalisierung.** Kein Greenfield. Bestehender Code wird gehaertet, nicht neu geschrieben.
- Vor neuem Code immer pruefen: Existiert das Pattern schon? Wenn ja, wiederverwenden statt neu bauen.
- Keine spekulativen Features. Was nicht im Ticket steht, wird nicht gebaut.
- Token-Budget pro Ticket beachten: lieber zwei kleine Tickets als eins, das auf halber Strecke abbricht.

### Wirtschaftlichkeits-Lernfeld (Phase 5)

Claude Code achtet aktiv auf die Projekt-Ökonomie und erfasst wirtschaftlich
relevante Erkenntnisse über die Lernschleife (Abschnitt 8.2):

- **Ressourcenkosten pro Kunde:** Welche Features verursachen bei Skalierung
  (10 → 300 Kunden) hohe Hetzner-/DB-/Mail-Kosten? Erfassen.
- **Teure Pfade:** Welche Queries/Jobs sind die teuersten? Caching/Index prüfen.
- **Verschwendung vermeiden:** Kein Code für Auto-Billing, solange manuelle
  Rechnung Default ist. Keine Features bauen, die kein Kunde nutzt.
- **Token-Ökonomie:** Eigene Arbeitsweise effizient halten (gezielt lesen,
  Diffs statt Volldateien, Arbeitsdateien als Gedächtnis).
- **Skalierungs-Schwellen:** Was bei 10 Kunden ok ist, kann bei 300 brechen.
  Bei jeder Änderung die Gate-Stufe (10/50/100/300) mitdenken.

Wirtschaftliche Erkenntnisse → Kategorie WIRTSCHAFTLICHKEIT in der Lernschleife.
Brauchen Owner-Bestätigung vor CLAUDE.md-Übernahme.

---

## Rollenaufteilung (Owner-Vorgabe, Stand: 2026-06-01)
- **Claude** ist der einzige KI-Agent im Stack und uebernimmt den gesamten Stack: Frontend, Backend, DB, Security, APIs, Tests, React, UX, API-Client, E2E — inkl. Prompt-/Task-Design, Scope-Definition, Akzeptanzkriterien und Testfall-Formulierung.
- Architektur- und Sicherheitsentscheidungen mit grosser Tragweite: immer Owner-Freigabe einholen.

### Arbeitsweise mit dem Owner
- Owner = Entscheidungsinstanz. Claude = Ausfuehrung mit Eigenverantwortung im definierten Rahmen.
- **Sicherheitsentscheidungen**: Immer Owner fragen, nie autonom.
- **Architekturentscheidungen mit Auswirkung auf Folgeprojekte**: Immer Owner fragen.
- **Routinepatches im definierten Bereich**: Selbststaendig ausfuehren, mit Output-Block dokumentieren.
- **Bei Unsicherheit**: Im Zweifel fragen — eine Frage ist guenstiger als ein falscher Patch + Revert.

---

## Arbeitsmodus (verbindlich)
- Inkrementell arbeiten: immer zuerst bestehende Strukturen suchen und erweitern.
- Keine Parallelstrukturen bauen, wenn ein bestehender Pfad vorhanden ist.
- Keine Quick-and-dirty-Workarounds; production-ready auf Enterprise-Niveau.
- Keine verdeckten Architekturwechsel ohne explizite Freigabe.
- Bei Unklarheit zu Zielbild/Scope: kurz rueckfragen, nicht raten.
- **Retrofit-bewusst**: Vor jedem Patch — Was kann brechen? Gibt es Feature-Flags? Rollback-Strategie?
- **Repo-genau**: Vor jedem Ticket — echte Dateien, Routen, Modelle pruefen. Keine Annahmen.

---

## Triage vor jedem Ticket (kritisch)
Bevor irgendetwas gefixt wird, klassifiziere das Problem:

1. **Echter Bug** — Code funktioniert nicht wie beabsichtigt
2. **Rollen-/Sichtbarkeitslogik** — Code funktioniert, aber Sichtbarkeitsregel ist falsch oder fehlt (haeufiger als gedacht!)
3. **UX-Problem** — Logik korrekt, aber Nutzer wird in die Irre gefuehrt
4. **Produktausbau** — Funktion fehlt schlicht
5. **Commercial** — Pricing/Plan/Entitlement greift nicht wie definiert

Jede Kategorie hat einen anderen Fix und andere Tests. Vermischen kostet Wochen.

---

## Output-Block (situationsabhaengig skalieren)
Proportional zur Ticketgroesse — kein Overhead fuer kleine Aenderungen:

**Kleiner Patch** (1-5 Zeilen, 1 Datei, kein Security/RBAC-Einfluss):
```
Bereich: | Geaenderte Datei: | Risiko: | Naechster Schritt:
```

**Mittleres Ticket** (mehrere Dateien, Service-/UI-Logik):
```
Bereich: | Ticket: | Kategorie: | Geaenderte Dateien: | Betroffene APIs/Rollen: | Risiko: | Tests: | Naechster Schritt:
```

**Kritisches Ticket** (RBAC, Security, DB-Migration, Org-Scope, CSRF, Audit, Multi-Org):
```
Bereich:
Ticket:
Kategorie (Bug / Rollen-Logik / UX / Ausbau / Commercial):
Geaenderte Dateien:
Gelesene Dateien:
Betroffene APIs:
Betroffene Rollen:
Betroffene Org-/Mandantenlogik:
Feature-/Planbezug:
CSRF-Auswirkung:
Audit-Auswirkung:
Frontend-Auswirkung:
Backend-Auswirkung:
Datenmodell-Auswirkung:
Retrofit-Risiko (was kann brechen):
Feature-Flag (ja/nein):
Rollback-Strategie:
Tests (Unit/API/E2E/Cross-Org/Rollen-Gating):
Manuelle Pruefschritte:
Offene Risiken:
Wiederverwendbarkeit fuer andere Projekte:
Naechster Schritt:
```

---

## Kritische Produkt-Abgrenzung (nicht verletzen)
- **OCC ist ein eigener Bereich unter `/owner-control/`**.
- OCC darf **nie** als Redirect auf Admin-/Staff-/Legacy-Seiten gebaut werden.
- OCC-Frontend und OCC-APIs (`/api/owner-control/*`) sind strikt getrennt von:
  - Admin Panel (`/public/admin_panel.html`, `/api/admin/*`)
  - Staff Control Center (`/staff/*`, `/staff/api/*`)
  - Support-Ops (`/support-ops/`)
- Keine Vermischung von Session-/Berechtigungswelten.

## Backend-Regeln
- Routen nur fuer HTTP/Validation; Business-Logik in `api/services/*`.
- Zod-Validation an Eingangsgrenzen.
- RBAC nur ueber zentrale Guards (`requirePermission(...)` etc.), keine Inline-Rollenchecks.
- Bei Multi-Statement-Writes: `withTransaction(pool, fn)`.
- Idempotency-Key bei schreibenden Endpunkten respektieren.
- Berechtigungsentscheidung kommt immer aus dem Backend; Frontend zeigt nur an.

## Frontend-Regeln
- User-supplied Werte in `innerHTML` immer escapen (`esc()`).
- Keine hardcodierten Farbwerte auf Workforce-/Enterprise-Seiten; Token aus dem Design-System nutzen.
- Keine Emojis/Raketen in produktiver UI.
- Bestehende Page-Shell-/Visibility-/Surface-Patterns einhalten statt umgehen.

## Datenbank- und Planregeln
- SQL-Aenderungen ausschliesslich als neue Migration unter `sql/migrations/`.
- Kanonische Plaene: `DEMO`, `BASIS`, `PLUS`, `PRO`, `INDIVIDUELL`.
- `ENTERPRISE` ist kein oeffentlicher Plan, sondern Funktions-/Tarifniveau innerhalb `INDIVIDUELL`.
- Planwerte immer ueber `normalizePlanKey(...)` (`api/config/planCatalog.js`) normalisieren.

## Sicherheits- und Betriebsregeln
- Secrets niemals in Code/Dateien committen; nur Umgebungsvariablen.
- Kein Commit ohne ausdrueckliche User-Freigabe.
- Wenn commitet wird: Co-Author-Zeile anhaengen:
  - `Co-Authored-By: Claude <noreply@anthropic.com>`

## Verifikation vor Abschluss
- Mindestens Syntax-/Build-Check fuer geaenderte Artefakte (z. B. `node --check`, Build, zielgerichtete Tests).
- Keine irrelevanten Full-Suite-Runs erzwingen, aber betroffene Pfade testen.
- Bei RBAC-/Surface-Aenderungen: Boundary-Tests (z. B. OCC vs Support vs Staff) mitpruefen.

## Dokumentationspflicht bei relevanten Aenderungen
- `docs/PILOT_GO_LIVE_TODOS.md` aktualisieren, wenn neue reale Blocker/Erledigungen entstehen.
- `.agents/skills/tempconnect-project/SKILL.md` aktualisieren, wenn neue dauerhafte Projektwahrheiten eingefuehrt wurden (Routes, Services, RBAC, UI-Entscheidungen, Infra-Entscheidungen).
- Keine separaten Parallel-Dokus anlegen, wenn bestehende Dateien den richtigen Ort bereits abdecken.

---

## Stop-Regeln (sofort anhalten, Befund melden)
Nicht weiterpatchen, sondern minimalen sicheren Fix vorschlagen und auf Bestaetigung warten, wenn:

1. Eine betroffene API nicht gefunden wird
2. Unklar ist, welche Rolle schreiben darf
3. Org-Scope nicht serverseitig pruefbar ist
4. CSRF-Middleware unklar ist
5. Statusuebergaenge nicht definiert sind
6. Datenmodell fuer Zielzustand fehlt
7. Ein Public-Profile-Flow ohne Einwilligung existiert
8. SSO-Enforce ohne Recovery / Break-Glass moeglich ist
9. Finance Export ohne Audit moeglich ist
10. Worker/Staff/Admin-Session nicht trennbar ist

---

## Enterprise Readiness Ziel: >= 85% (verbindlich)

Jede Aenderung muss diesen Standard einhalten. Kein Feature ist "fertig" wenn eines dieser Kriterien fehlt.

### Die 7 Produktionspfeiler

**1. Org-Boundary (Datenisolation)**
- Jede DB-Query muss org_id-gebunden sein — keine plattformweiten Reads ohne explizite Freigabe
- location_id immer via `assertLocationBelongsToOrg` validieren bevor sie in SQL einfliessen
- Fremde Org-Daten = 403, niemals 200 mit falschen Daten

**2. Zero-State statt Error**
- Kein Endpoint darf 500 zurueckgeben wenn Daten leer sind
- Immer `available: false` + leere Arrays/Nullwerte (Soft-Fail-Muster)
- Frontend zeigt "Noch keine Daten" statt Spinner-forever oder Crash

**3. Scope-Transparenz**
- Jede Reporting-Response enthaelt `scope: { org_id, location_id, date_from, date_to, window_days }`
- Frontend zeigt immer: Org | Standort (oder "Alle Standorte") | Zeitraum | Datenstand
- KPI-Tooltips: Bezeichnung + Bedeutung + Datenquelle + Einschraenkung

**4. RBAC ohne Luecken**
- Hub-Cards: worker = hidden_worker, falsche org_type = hidden_wrong_side, fehlende Rolle = hidden_role
- Location-Scope: orgWideOnly-Surfaces sind hidden_location_scope wenn Standort aktiv
- Plan-Locks: hidden_plan_locked zeigt konkreten Upgrade-Pfad, kein generisches "Nicht verfuegbar"

**5. Audit & Verantwortlichkeit**
- Jede mutierende Aktion: `action`, `entity_type`, `entity_id`, `details.responsible_actor_user_id`
- Kein "wurde geaendert" ohne Wer + Was + Warum (reason Pflichtfeld bei kritischen Aktionen)
- Audit-Events koennen nicht abgeschaltet werden — sie sind Pflicht, kein Log-Spam

**6. Testpflicht pro Feature**
- Neue Route: immer Test fuer (a) fremde Org = 403, (b) leere Daten = Zero-State, (c) valider Aufruf = erwartetetes Shape
- Neue Service-Funktion: SQL-Parameter-Test (params.includes(...)), nicht nur Return-Value
- Neue Frontend-Logik: vm-Sandbox-Test wenn isolierbar, sonst HTML-Strukturtest

**7. Drilldown-Integritaet**
- Jeder Drilldown-Link in Reporting/Dashboard muss location_id uebergeben wenn Standortkontext aktiv
- Kein "deep link baut org-fremde URL" — locParam-Spread-Muster ist Pflicht
- Rate-Card-Links nur wenn rateCardAccess.canRead — nie blind verlinken

### Nicht-verhandelbare Verbote
- Kein Fake-Data / Mock-KPIs in Produktions-UI (auch nicht als Platzhalter)
- Kein `innerHTML` ohne `esc()` — XSS ist kein akzeptables Risiko
- Kein `if (!orgId) return null` ohne 400/403-Response (stille Fehler sind Sicherheitsluecken)
- Keine hardcodierten Farb-/Schwellwerte ausserhalb des Design-Systems
- Keine sensiblen Daten in Logs
- Keine Migrations ohne Rollback-Plan
- Keine Mutations ohne CSRF
- Keine sensiblen Routen ohne Org-Scope-Check serverseitig
- Keine "schnellen Fixes", die spaeter nachgepflegt werden muessen — wenn keine Zeit fuer richtigen Fix: Ticket dokumentieren, nicht patchen

---

## Claude — Gespeicherte Empfehlungen (Stand: 2026-05-23)
### Fuer Abruf am Session-Ende: /empfehlungen

**PRIO 1 — Produktionsblocker (sofort)**

~~P1-A: Frontend Scope-Display Executive Dashboard~~ ✅ ERLEDIGT (2026-05-23)
- `renderScopeBar(scope, generatedAt)` in `executiveDashboard.js` eingebaut
- Zeigt: Org-Name | Standort/"Alle Standorte" | Zeitraum (N Tage) | Datenstand
- Scope kommt aus `data.scope` (backend liefert org_id, location_id, date_from, date_to, window_days)

~~P1-B: Pre-existing Testfehler bereinigen~~ ✅ ERLEDIGT (2026-05-23)
- 14 → 0 Failures: Mock-Pool-Sequenzen an freezeQuoteSnapshot + syncOrgActiveAddons angepasst
- /subscription-requests/:id/history Route hinzugefuegt (fehlte, Test erwartete sie)
- FEATURE_GATE_BYPASS=true Docker-Verhalten in Assertion korrekt abgebildet
- 3754 Tests, 0 Failures

P1-C: Docker-Verifikation (Pflicht vor jedem Release)
- `docker exec tempconnect_api sh -c "cd /app && npm run test:unit"`
- hubVisibility-Tests pruefen (Volume-Mount erforderlich)
- Aufwand: 0.5 Stunden | Nutzen: Hoch — Produktions-Konfidenz

**PRIO 2 — Enterprise-Qualitaet (diese Woche)**

~~P2-A: Frontend Spend Analytics Scope-Display~~ ✅ ERLEDIGT (2026-05-30)
- `renderScopeBar(scope, generatedAt)` bereits implementiert (Zeilen 162-191 spend-analytics.html)
- Backend `/spend-analytics/summary` liefert `scope` + `generated_at` (spendAnalytics.js Zeilen 64-70)
- 3 neue Scope-Assertions in `test/spendAnalytics.route.test.js` — 7/7 Tests gruen

~~P2-B: Frontend Vendor Pool + Rate Cards Scope-Hinweise~~ ✅ ERLEDIGT (2026-05-30)
- Vendor Pool: `renderPoolContext` zeigt Standort-Badge wenn `getLocHeader()` gesetzt (org-weite Liste + Standort als Metadaten-Kontext)
- Rate Cards: `renderContextBadge` zeigt "Konditionsrahmen gelten org-weit – Standort hat keinen Einfluss" wenn Location aktiv (badge bleibt auch ohne andere Filter sichtbar)
- Backend-Verifikation: Rate Cards liest `req.query.location_id` (nicht Header), Vendor Pool ignoriert Location-Header ebenfalls → beide sind org-weit

~~P2-C: OCC Phase 2 Backend + React Shell~~ ✅ ERLEDIGT (2026-05-30)
- Backend war bereits vollstaendig (requireOwnerControlAccess + 13 Sub-Router + Migration 107/108)
- Neu gebaut: React Shell (BootstrapContext, ToastContext, AppShell, Sidebar, Topbar)
- 11 Module: Executive (echte Daten aus Bootstrap) + 10 korrekte Stubs
- TypeScript: 0 Errors, Vite Build: 51 Module OK
- 8 neue Tests (occAccess.test.js) — 8/8 gruen

~~P2-D: Worker-Portal Abgrenzung~~ ✅ ERLEDIGT (2026-05-30)
- hidden_worker fuer alle Surfaces (dynamisch via listSurfaces()) — org_role, surface_access, active_location_id aendern nichts
- Legacy-Format (role=worker, kein org_type) ebenfalls abgesichert
- Alle Enterprise-Nav-Eintraege aus _navRules gesperrt, help bleibt offen
- requireCompanyOrg sperrt Worker (org_type=worker) explizit mit 403
- 8 neue Tests in hubVisibility.test.js + 2 in orgAccess.test.js — 42/42 gruen

**PRIO 3 — Differenzierung (naechste 2 Wochen)**

~~P3-A: Quarterly granularity in Spend Analytics~~ ✅ VERIFIZIERT (2026-05-30)
- Service `spendAnalyticsService.js` Zeile 254: `filters.granularity === "quarterly"` → `"quarter"` — war bereits implementiert
- Route `spendAnalytics.js` Zeile 33: `granularity: query.granularity || null` — korrekt
- Test `spendAnalytics.route.test.js` Zeile 232: `DATE_TRUNC($N)` + `"quarter"` als Param — 7/7 gruen

~~P3-B: OCC Module ausbauen~~ ✅ ERLEDIGT (2026-05-30)
- Revenue: KPI-Grid (MRR/ARR/Subscriptions/Payments), Plan-Breakdown-Tabelle mit MRR-Anteil-Balken
- Operations: System-Metriken (Uptime/RAM/DB-Pool), Service-Status-Tabelle, Queue-Tabelle (waiting/active/failed/delayed)
- Decisions & Requests: paginierte Liste + Inline-DecideForm (Modal) mit CSRF (POST /decide, reason>=10 Zeichen, confirmed:true)
- client.ts: lazy CSRF-Token-Fetch fuer alle non-GET Requests
- types/index.ts: OccRevenueSummary, OccOperationsHealth, OccDecisionsList, OccAuditFeed ergaenzt
- TS 0 Errors, Vite Build OK

~~P3-C: E2E-Tests kritische Flows~~ ✅ ERLEDIGT (2026-05-30)
- `e2e/tests/occ-access-guards.spec.js`: 20 Tests — OCC 401/403 fuer Unangemeldete, Non-Owner, Agency; React-Shell Forbidden/Unauth-State
- `e2e/tests/executive-dashboard-flow.spec.js`: Hub-Lade-Test, Executive Dashboard KPI-Check, Location-Switch Scope-Isolation, Org-Boundary (Company A cannot read Company B Org-Daten/Requisitions/Spend Analytics)
- Syntax OK (node --check)

~~P3-D: SLA-Eskalations-Alerts~~ ✅ ERLEDIGT (2026-05-30)
- Backend `reportingService.js`: `alerts[]` im executiveDashboard()-Response — SLA_COMPLIANCE_LOW (warning <80%, critical <60%) + CRITICAL_STAFFING_PRESSURE
- Frontend `executiveDashboard.js`: `renderAlertBanner(alerts)` — farbiger Banner, renderSla() mit Farbkodierung der Compliance-Tile (rot/gelb/gruen)
- HTML `executive_dashboard.html`: `#slaAlertBanner`-Div hinzugefuegt
- 6 neue Tests in `reportingService.test.js` — 31/31 gruen

### Enterprise Readiness Score aktuell
| Bereich                  | Status                        | Score |
|--------------------------|-------------------------------|-------|
| RBAC / Org-Boundary      | vollstaendig                  |  95%  |
| Hub Visibility Matrix    | Tests + Impl komplett         |  95%  |
| Reporting Scope-Haertung | abgeschlossen                 |  85%  |
| Audit Trail              | vorhanden                     |  80%  |
| Soft-Fail / Zero-State   | implementiert                 |  85%  |
| Frontend Scope-Display   | ✅ P2-A + P2-B abgeschlossen  |  90%  |
| Test-Suite sauber        | 0 Failures (3979+ Tests gruen)|  95%  |
| OCC                      | ✅ Alle 11/11 Module real implementiert           |  90%  |
| **Gesamt**               |                               | ~95%  |

~~Ziel 85%~~: ✅ Erreicht (2026-05-30). Alle PRIO-2 + PRIO-3 abgeschlossen. OCC vollständig.

Naechste Sessions (Empfehlungsreihenfolge):
1. ~~P2-A: Spend Analytics Scope-Display~~ ✅ ERLEDIGT
2. ~~P2-B: Vendor Pool + Rate Cards Scope-Hinweise~~ ✅ ERLEDIGT
3. ~~P2-C: OCC Phase 2 Backend + React Shell~~ ✅ ERLEDIGT
4. ~~P2-D: Worker-Portal Abgrenzung + hidden_worker-Suite~~ ✅ ERLEDIGT
5. ~~P3-B: OCC Module ausbauen (Revenue/Ops/Decisions)~~ ✅ ERLEDIGT
6. ~~P3-C: E2E-Tests kritische Flows~~ ✅ ERLEDIGT
7. ~~P3-D: SLA-Eskalations-Alerts~~ ✅ ERLEDIGT
8. ~~P3-B Fortsetzung: OCC 5 verbleibende Stub-Module~~ ✅ ERLEDIGT (2026-05-30)
   - Platform: KPIs (Users/Orgs/Listings/Deals/Active7d/New30d) aus /platform/summary
   - Infrastructure: Status-Bar + Hosts + Docker-Services + Deployment + Backups aus /infrastructure/hetzner + /status
   - Risk: Signals + Drift-Checks + Compliance-Checks aus /risk/signals + /drift + /compliance
   - Data Explorer: Tab-Interface (Nutzer/Orgs/Subscriptions/Integrity) mit Suche + Pagination
   - Automation-Runbooks: Jobs + Trigger-Modal (confirmed+reason, CSRF) + History + Schedules

Neu erstellt / geaendert (2026-05-30):
- `frontend/public/js/pages/vendorPool.js` — Standort-Badge in renderPoolContext wenn getLocHeader() gesetzt
- `frontend/public/rate-cards.html` — renderContextBadge: org-weiter Hinweis wenn Location aktiv, early return angepasst, reset-Link nur bei echten Filterteilen
- `api/test/spendAnalytics.route.test.js` — 3 neue Scope-Tests (scope.org_id, scope.date_from/to, generated_at ISO-Timestamp, scope.location_id bei Standortfilter) — 7/7 gruen
- `frontend/src/owner-control/api/client.ts` — lazy CSRF-Token-Fetch fuer alle non-GET Requests
- `frontend/src/owner-control/types/index.ts` — OccRevenueSummary, OccOperationsHealth, OccDecisionsList, OccAuditFeed hinzugefuegt
- `frontend/src/owner-control/modules/revenue/index.tsx` — KPI-Grid + Plan-Breakdown-Tabelle mit MRR-Balken (echte Daten aus /revenue/summary)
- `frontend/src/owner-control/modules/operations/index.tsx` — System-Metriken + Service-Status-Tabelle + Queue-Tabelle (echte Daten aus /operations/health)
- `frontend/src/owner-control/modules/decisions-requests/index.tsx` — Liste + DecideForm-Modal mit CSRF-POST + Begruendungspflicht (echte Daten aus /decisions-requests)
- `docs/releases/PHASE_STATUS.md` — P2-A/B als abgeschlossen markiert, Frontend-Scope-Display 85%→90%, Gesamt ~94%; P3-B abgeschlossen, OCC 35%→55%→70%
- `e2e/tests/occ-access-guards.spec.js` — 20 OCC-Zugangstests (401/403 Guards + React-Shell-States), Syntax OK
- `e2e/tests/executive-dashboard-flow.spec.js` — Hub+Executive Dashboard+Location-Switch+4 Org-Boundary Tests, Syntax OK
- `api/services/reportingService.js` — `alerts[]` im executiveDashboard()-Response (P3-D)
- `frontend/public/executive_dashboard.html` — `#slaAlertBanner` Div
- `frontend/public/js/pages/executiveDashboard.js` — renderAlertBanner() + renderSla() Farbkodierung
- `api/test/reportingService.test.js` — 6 neue P3-D Tests — 31/31 gruen
- `frontend/src/owner-control/types/index.ts` — OccSupportMetrics, OccSupportEscalations ergaenzt
- `frontend/src/owner-control/modules/support-oversight/index.tsx` — echte Daten aus /support/metrics + /support/escalations
- `frontend/src/owner-control/modules/audit/index.tsx` — Audit-Feed mit Filterbar (Area/Risk/DecisionsOnly/Suche), expandierbare Details-Zeilen
- `frontend/src/owner-control/types/index.ts` — OccPlatformSummary, OccInfraHetzner, OccInfraStatus, OccRiskSignals, OccRiskDrift, OccRiskCompliance, OccDataUserList, OccDataOrgList, OccDataSubscriptionList, OccIntegrityChecks, OccAutomationJobs, OccAutomationHistory, OccAutomationSchedules ergaenzt
- `frontend/src/owner-control/modules/platform/index.tsx` — KPI-Grid + Ratio-Panel (echte Daten aus /platform/summary)
- `frontend/src/owner-control/modules/infrastructure/index.tsx` — Status-Bar + Hosts + Docker + Deployment + Backups (/infrastructure/hetzner + /status)
- `frontend/src/owner-control/modules/risk/index.tsx` — Risk-Signals-Tabelle + Drift-Cards + Compliance-Cards (/risk/signals + /drift + /compliance)
- `frontend/src/owner-control/modules/data-explorer/index.tsx` — 4-Tab-Interface mit lazy-mount, Suche, Pagination (Users/Orgs/Subscriptions/Integrity)
- `frontend/src/owner-control/modules/automation-runbooks/index.tsx` — Jobs + Trigger-Modal (confirmed+reason+CSRF) + History + Schedules

Neu erstellt / geaendert (2026-05-23):
- `api/config/visibilityMatrix.js` — 17 Seiten, vollstaendige Matrix-Wahrheit
- `api/services/visibilityAuditService.js` — buildAuditReport, 0 Errors
- `api/services/enterpriseSurfaceAccessService.js` — resolveEnterpriseSurfaceAccess
- `api/test/visibilityMatrix.test.js` — 27/27 Tests pass (10 Pflicht + 17 Bonus)
- `api/routes/subscriptionRequests.js` — GET /:id/history Route ergaenzt
- `api/test/qaHardening.flow.test.js` — 5 Mock-Pool-Sequenzen korrigiert
- `api/test/subscriptionLifecycle.test.js` — Handler-Regex + Freeze-Handler korrigiert
- `api/test/subscriptionSecurity.test.js` — Downgrade-Pool (7→12 Responses) korrigiert
- `api/test/staffSubscriptionRequests.routes.test.js` — activate (9→10 Responses) korrigiert

---

## Erkenntnisse (kontrolliert wachsend)
Dieser Abschnitt wird **ausschliesslich nach expliziter Owner-Bestaetigung** erweitert.
Format pro Eintrag: `[YYYY-MM-DD] [Kategorie] Erkenntnis in 1-3 Saetzen.`
Kategorien: Bug-Pattern | Architektur | Security | Test | Performance | Wiederverwendbarkeit | Process

[2026-06-03] [Architektur] Config-Taxonomie 3-Tier (Owner-approved): jedes Flag/jeder Provider/jede Per-Kunde-Fähigkeit gehört in genau eine Schicht — Tier-1 Provider-Wahl (BILLING_PROVIDER/EMAIL_PROVIDER, manual/console-first), Tier-2 Env-Kill-Switch (THEME_SWITCHER_ENABLED, default-AN), Tier-3 Entitlement (Plan/Org). Provider-Services rein funktional (resolve/describe), KEINE neue Dependency wenn Relay reicht (SendGrid via SMTP). (Quelle: Phase D/E, billing/emailProviderService)
[2026-06-03] [Performance] Skalierungs-Defekt-Diskriminator „läuft bei 10, bricht bei 300": NUR Mengen, die unbegrenzt mit Kunden-/Datenwachstum skalieren, sind Defekte. Bounded (slice/festes Array), false-positive (Loop baut JS-State, Query danach), already-batched (ANY($n)), cron/customer-cardinality und email/IO-dominiert NICHT anfassen. (Quelle: N+1-Read/Write-Sweep, support.js/slaSearchService)
[2026-06-03] [Wiederverwendbarkeit] N+1 → set-based: Read-Loop → EINE windowed Query (ROW_NUMBER PARTITION BY + WHERE = ANY($1::uuid[])); Write-Loop → Bulk-INSERT … UNNEST + UPDATE … RETURNING. Triage: INPUT-skaliert (User wählt N) ODER withTransaction/RETURNING/per-Row-Audit-verflochten → owner-gated, nicht autonom batchen. (Quelle: loadRecentOpenCasesByOrg, createStaffingCampaignInternal)
[2026-06-03] [Test] Zwei-Schicht-Disziplin für Query-Helfer: (1) DB-freier Mock-Pool-Test zählt Query-ANZAHL (Anti-N+1) + SQL-Form, (2) billiger DB-gated Smoke (skip:!hasDb) führt Helfer mit nicht-existenter UUID aus → 0 Treffer, aber Postgres parst/plant die VOLLE Query → fängt Spalten-/Alias-Tippfehler, die der Mock durchlässt. (Quelle: support.recentCasesByOrg + integration/*.flow.test.js)
[2026-06-03] [Performance] Cron-Sweep-Indizes: jede gescannte Menge gegen „wächst unbegrenzt?" prüfen, Lücke DIREKT gegen die Quell-Migration verifizieren (Sub-Agent-Audit war unzuverlässig). BRIN statt btree für append-only/zeitkorrelierte Spalten auf heißem Insert-Pfad (keine Write-Amplification). (Quelle: Mig 122/123)
[2026-06-03] [Process] Reifes Repo = Verifikation, nicht Neubau. „Fertig" entscheidet laut 99_GOLIVE_GATE.md Teil 4 der Owner, nicht Claude. Phase-5-Diffs bleiben uncommitted bis explizite Owner-Freigabe; verbleibende Punkte sind ausschließlich owner-gated/extern (Keys/Preise/Rechtstexte/Infra-Drill). (Quelle: finalization/ Master-Spec)

---

## 8. Self-Update- und Lern-Mechanik

Claude Code verbessert dieses Dokument kontrolliert und kontinuierlich. Es gibt zwei Wege:

### 8.1 Manuelle Ergänzung (wie bisher)
Wenn Claude Code während der Arbeit eine wiederverwendbare Erkenntnis gewinnt:
1. Update-Vorschlag formulieren (max 3 Sätze)
2. Owner fragen: "Soll ich folgenden Eintrag in CLAUDE.md übernehmen?"
3. Nur nach expliziter Bestätigung schreiben
4. Bei Ablehnung verwerfen, nicht zweimal vorschlagen

### 8.2 Lernschleife (Phase 5, getaktet)
Claude Code betreibt eine kontrollierte Lernschleife für Wirtschaftlichkeit und Effizienz:

**Während der Arbeit:**
- Erkennt Claude Code eine wiederverwendbare Lektion, fügt es EINE Zeile zu
  `.claude/learning/insights_inbox.md` hinzu (billig, kein CLAUDE.md-Write).
- Drei Kategorien: EFFIZIENZ (Token/Zeit), WIRTSCHAFTLICHKEIT (Projekt-Ökonomie), TECHNIK.
- Nur wiederverwendbare Lektionen. Keine Einzelbugs, kein Triviales, keine Spekulation.

**Am Session-Ende:**
- `/scc-learn-distill` destilliert die Inbox zu Vorschlägen in `.claude/learning/proposals.md`.

**Review:**
- `/scc-learn-apply` übernimmt bestätigte Vorschläge in Abschnitt 10 + 11.
- Auto-Approve nur für Kategorie EFFIZIENZ (siehe `.claude/learning/config.md`).
- WIRTSCHAFTLICHKEIT und TECHNIK brauchen Owner-Bestätigung.

**Konsolidierung:**
- `/scc-learn-consolidate` hält Abschnitt 10 + 11 unter Token-Budget (100/60 Zeilen).

### 8.3 Eiserne Regeln der Lernschleife
- KEIN Auto-Write bei jeder Nachricht. CLAUDE.md aktualisiert sich nur getaktet.
- KEINE Erkenntnis ohne Quelle (Datei/Welle).
- KEINE Erkenntnis, die einer bestehenden Regel widerspricht, ohne Owner-Entscheidung.
- CLAUDE.md bleibt schlank. Wachstum nur gegen Konsolidierung.
- Jede Übernahme wird in `.claude/learning/applied_log.md` auditiert.
- `.claude/` gehört NIE ins externe Release-Artefakt.

Vollständige Spezifikation: `finalization/phase5_scale/SELF_UPDATING_CLAUDE_MD.md`.
