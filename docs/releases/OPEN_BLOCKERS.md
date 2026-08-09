# OPEN_BLOCKERS — Offene Blocker für Marktstart
> Erstellt: 2026-05-26 | Branch: release/enterprise-premium-market-ready
> Quellen: FINALIZATION_DECISION_BOARD.md, PILOT_GO_LIVE_TODOS.md, FINALIZATION_BASELINE.md
> Pflege: Append-only. Erledigte auf ✅ + Datum setzen.

---

## Realitätsabgleich 2026-08-08 — Zwischenstand, NICHT vollständig

> Diese Liste stammt vom 2026-05-26 und war seither ungepflegt. Der Abgleich gegen den
> heutigen Code lief mit einer bewussten Asymmetrie: Jedes „erledigt" musste einen
> Dateibeleg tragen und wurde anschließend von einem Skeptiker angegriffen — denn ein
> fälschlich abgehakter Blocker verschwindet von der Startliste, „noch offen" ist der
> harmlose Irrtum.
>
> **Das Ergebnis rechtfertigt den Aufwand: von 7 „erledigt"-Urteilen haben nur 2 gehalten.**

### Geprüft und bestätigt erledigt

| # | Beleg |
|---|---|
| **P1-06** Worker-Portal Abgrenzung | `api/test/hubVisibility.test.js:345-405`, 36/36 grün, Skip-Guard griff nicht. Die Suite iteriert dynamisch über `listSurfaces()` (12 Surfaces) statt gegen eine Kurzliste — Umgehungsversuche über `org_role=owner`, `surface_access`-Override und Legacy-Format sind mitgeprüft. |
| **P2-05** `app_notdienst.html` Plan-Gate | Seite ist ein 14-Zeilen-Redirect-Stub; `frontendCanonicalPages.test.js` 16/16 grün. Kein ungegatetes Notdienst-UI mehr vorhanden. Plan-Gate der Fähigkeit selbst: `planFeatures.js:109`. |

### Zurückgestuft — als „erledigt" gemeldet, hält aber nicht

**Diese fünf dürfen NICHT von der Startliste gestrichen werden.**

| # | Was wirklich fehlt |
|---|---|
| **P1-07** API-Key-Scopes auf Finance-Routen | `requireScope` ist echt und auf 6 Invoice-Routen verdrahtet — aber `requireAuth` weist API-Key-Requests schon vorher mit 401 ab, das Gate wird nie erreicht. Der grüne Test benutzt einen **gefälschten** Auth-Guard (`alwaysPassAuth`) und beweist deshalb nicht, was das Verify-Kriterium verlangt. Zusätzlich: 11 Routen unter `/invoices/operational/*` (u. a. `generate`, `issue`, `paid`, `void`, CSV-Export) haben **gar kein** Scope-Gate. |
| **P2-01** INDIVIDUELL Tier-Schwellen | Config-Ebene fertig, Frontend nicht: `pageShell.js:594` zeigt weiter die alten Klassen. |
| **P2-02** Spend Analytics Scope-Display | Scope-Leiste existiert und ist verdrahtet, **kann aber eine falsche Standort-Aussage anzeigen**. |
| **P2-03** Vendor Pool + Rate Cards Scope-Hinweise | Code vorhanden, **nie erreichbar**: `TC.api` ist auf beiden Seiten nicht geladen, der Hinweis kann nicht rendern. Kleiner Fix, aber heute wirkungslos. |
| **P2-04** Migrations-Lücke 111 | Zweiteilig; der Entscheidungsteil (OE-05) ist im Entscheidungsboard bis heute **unbeantwortet**. |

### Bestätigt offen

| # | Rest |
|---|---|
| **P1-05** OpenAPI-Drift | Entweder die Abgrenzung festschreiben (spec.json = externer Integrationsvertrag) oder die Lücke schließen. |
| **P1-08** Cross-Tenant RLS Deny-by-Default | Org-Kontext hängt nicht im Query-Pfad. |

### Nachgeholt am 2026-08-08 — die restlichen 10 Punkte

Der erste Lauf hatte drei Prüfer an Netzfehler verloren. Der zweite Lauf ist vollständig
durchgelaufen (10/10) und hat die Verify-Kommandos **tatsächlich ausgeführt**, statt nur
Code zu lesen — `release-verify.sh` gegen ein echtes `git archive`-Staging, und der
Produktions-Boot mit `FEATURE_GATE_BYPASS=true`.

#### Erledigt

| # | Nachweis |
|---|---|
| **P0-06** `.env` nicht im Release-Artefakt | Vierfach abgesichert und nachgestellt: `release-verify.sh` zählt jede Nicht-`.example`-Datei als Verstoß; die Dateien sind gar nicht getrackt; `git archive` kann Ungetracktes nicht aufnehmen; CI spiegelt die Regel. Lauf gegen Staging: 3× „Beispiel-Datei erlaubt", 0 Treffer. |
| **P0-08** `FEATURE_GATE_BYPASS` in Produktion | Verify-Kommando wörtlich ausgeführt: `NODE_ENV=production FEATURE_GATE_BYPASS=true node server.js` → **Exit 1** mit „ist in Produktion verboten", vor `createApp`. Die Tests dazu benutzen den echten Validator, keine Attrappe. |
| **P2-06** `meine(agb).html` | Alt-Datei existiert nicht mehr, Redirect-Stub steht, kein Verweis mehr im Code. 16/16 grün, Skip-Guard griff nicht. |
| **P2-07** `api_docs.html`-Duplikat | 14-Zeilen-Redirect-Stub, keine `href`-Verweise mehr auf die Alt-Schreibweise. |

#### Bestätigt offen

| # | Was fehlt |
|---|---|
| **P0-07** Release-Artefakt | **`.claude/` liegt im Artefakt.** Selbst nachgezählt: **8 Dateien sind versioniert**, obwohl `.gitignore` sie listet — Ignore greift nicht für bereits getrackte Dateien. Sie landen über `git archive` im Kundenpaket, und genau daran ist der Gesamtlauf von `release-verify.sh` **rot**. Inhalt selbst geprüft: **keine Geheimnisse**, nur internes Agenten-Werkzeug (Slash-Kommandos, Hooks, Lern-Konfiguration). Also kein Leck, aber der dokumentierte Release-Weg ist blockiert. Fix: `git rm -r --cached .claude` oder ein `rm -rf` nach dem `git archive` — **Owner-Entscheidung**, weil es die lokale Werkzeugkette berührt. |
| **P1-02** SSO-Abhängigkeit | Owner muss OE-03 formal entscheiden. Bei „nicht ausliefern": SSO-Zeilen in `pricing.html`/`sla_abo.html` von Haken auf „auf Anfrage" umstellen. |
| **P1-03** E2E Pilot-Core | Der CI-Job ist rot; Logs vom 2026-07-30 sind abgelaufen, Lauf muss neu ausgelöst werden. |

#### Owner-gated — kein Code-Defekt, nur du kannst es tun

| # | Aufwand |
|---|---|
| **P0-04** Secret-Rotation | 20–30 Min am Prod-Server. **Ein Punkt daraus ist dringlicher als der Rest:** In der Git-Historie liegt ein Web3Forms-Key (historische Fundstellen bestätigt; es gibt bereits einen Commit „Secret-Scan über die Historie"). Da das Repo öffentlich ist, hilft Löschen im HEAD nicht — **nur Rotation beim Anbieter**. |
| **P1-01** Staff-CC-Ops | DNS, TLS, Nginx-VHost, `STAFF_USER_IDS` + `STAFF_SESSION_SECRET`. 0,5–1 Tag. |
| **P1-04** Backup/Restore-Drill | 2 h Drill + Run-Log. Parallel reparierbar: der CI-Job „Backup & Restore Drill" ist rot. |

#### Nebenbefund, der nicht auf der Liste stand

`docker-compose.demo.yml` setzt `NODE_ENV: production` **und** `FEATURE_GATE_BYPASS: "true"`.
Seit P0-08 scharf ist, **kann dieser Stack nicht mehr starten** — die API bricht beim Boot ab.
Entweder `NODE_ENV` auf `demo`/`development` setzen oder den Bypass durch ein
Demo-Entitlement ersetzen.

### Stand nach beiden Läufen

**19 Punkte, alle beurteilt.** 6 erledigt · 5 offen · 5 zurückgestuft (waren als „erledigt"
gemeldet, halten aber nicht) · 3 owner-gated.

> **Die Lehre aus dem ersten Lauf gilt weiter:** Von 7 „erledigt"-Urteilen hielten nur 2 der
> Gegenprüfung stand. Ein grüner Test beweist nichts, wenn er die echte Middleware durch eine
> Attrappe ersetzt — bei P1-07 stand `alwaysPassAuth` statt `requireAuth` im Test, und das
> Gate wurde nie erreicht.

### Nachtrag 2026-08-09 — ein Punkt aus P9/A3

**P1-15 🟠 Der Notdienst-Antwortpfad ist tot (500 in Produktion).**
`api/services/emergencyStaffingService.js` liest und schreibt an vier Stellen
(`:265-267`, `:322-326`, `:431`, `:451-452`) die Spalten
`demand_requests.supplier_response_count` und `.first_supplier_response_at`.
**Beide existieren nicht** — kein Treffer in `sql/`, live bestätigt mit
`ERROR: column "supplier_response_count" does not exist`. Folge:
`POST /api/emergency/:id/respond` (`routes/emergency.js:141`) und
`GET /api/emergency/dashboard` (`:129`) laufen in den `catch` und liefern **500**.
Der einzige Endpunkt, der eine Notdienst-Reaktion erfassen soll, funktioniert nicht.

Die zugehörigen Tests sind grün, weil ihre Mock-Pools die Spalten erfinden
(`emergencyStaffing.test.js:187`, `emergencyStaffingService.coverage.test.js:424/442`,
`emergency.route.coverage.test.js:336`) — dieselbe Blindstelle, die in der
Pre-Launch-Review schon einmal einen Webhook-Defekt durchgelassen hat.

Zwei Wege: entweder die Spalten per Migration nachziehen, oder auf das bereits
vorhandene `demand_requests.latest_response_at` umstellen (Mig 070, gesetzt in
`emergencyCommitmentService.js:127-132`, heute 0 von 38 Zeilen belegt). Der zweite
Weg ist der ehrlichere — die Spalte existiert und wird bereits gepflegt.
Nicht in P9/A3 behoben: A3 macht Bounty-Beschreibungen ehrlich, es repariert nicht
den Notdienst-Fluss. Der Fund stammt aus derselben Prüfung.

### Nachtrag 2026-08-08 — zwei neue Punkte aus P9/A1

**P1-14 🟠 `reputationService` hat keinen Aufrufer.** `recomputeReputation` wird nur von
`batchRecompute` gerufen, und `batchRecompute` von nichts außer Tests — keine Route, kein Cron,
kein Job. Folge: `supplier_reputation.reputation_score` und `activity_score` sind leer, `grade`
steht überall auf `UNRATED`. Betroffen ist alles, was aus dieser Tabelle liest; das Bounty
`top_supplier` war dadurch für jeden Nutzer unerreichbar und ist bis auf Weiteres abgeschaltet
(Migration 166). Zu klären ist nicht *ob*, sondern *wann* neu gerechnet wird: Cron wie bei
`deal_reliability` (täglich) oder ereignisgesteuert nach Bewertung/Deal-Abschluss.
Zusatz: `assignmentService.js:277` schreibt in `supplier_reputation` in Spalten, die es dort
nicht gibt (`supplier_org_id`/`score`) — im stummen `try/catch`, also seit jeher wirkungslos.
Diese Leiche gehört mit weg.

**P0-14 ✅ Referral-Gutschrift konnte sich vervielfachen** *(am 2026-08-08 geschlossen)*.
`qualifyReferralReward` buchte die Gutschrift und setzte **danach** `reward_applied = TRUE` —
ohne Transaktion und mit einem Status (`'qualified'`), den `referrals_status_check` verbietet.
Der zweite Schritt brach also immer ab, die Sperre wurde nie gesetzt, und derselbe geworbene
Kunde hätte bis zu 6 Gutschriften statt einer ausgelöst (Grenze: 1/Monat, 6 gesamt). Der Pfad
hängt live im Zahlungsfluss (`routes/payment.js:632`) und war dort in ein stummes `catch {}`
gewickelt. Behoben: Status `'active'`, beide Schreibvorgänge in `withTransaction`, Fehler wird
geloggt. Wirksam geworden wäre der Defekt beim ersten geworbenen zahlenden Kunden — also nach
Marktstart.

---

## Legende

| Symbol | Priorität | Bedeutung |
|---|---|---|
| 🔴 | P0 | Launch-Blocker — muss vor Marktstart geschlossen sein |
| 🟠 | P1 | Enterprise-kritisch — vor erstem Pilotkunden |
| 🟡 | P2 | Premium-Polish — erste Pilotwochen |
| ✅ | — | Erledigt |

---

## P0 — Launch-Blocker

### P0-01 ✅ Lint-Errors `enterpriseFormReuse.test.js`
- **Status:** ERLEDIGT (2026-05-24)
- **Ergebnis:** `npm run lint` exit 0, 0 Errors

### P0-02 ✅ Audit-Gate: POST /analytics/track-public
- **Status:** ERLEDIGT (2026-05-24)
- **Ergebnis:** 329/329 Endpunkte mit Audit-Coverage

### P0-03 ✅ Prometheus-Platzhalter-Secret
- **Status:** ERLEDIGT (2026-05-24)
- **Ergebnis:** `PROMETHEUS_METRICS_SECRET` via ENV injiziert

### P0-04 🔴 Secret-Rotation vor Go-Live
- **Status:** OFFEN (Owner-Aufgabe)
- **Kategorie:** Security / Infra
- **Problem:** SESSION_SECRET, STAFF_SESSION_SECRET, DB-Password, Stripe, Sentry müssen vor Prod-Betrieb rotiert werden
- **Aktion:** Anleitung in `PILOT_GO_LIVE_TODOS.md#P0.4` — Owner muss ausführen
- **Aufwand:** 20–30 Min
- **Wave:** WAVE 02
- **Verify:** App läuft, `curl .../api/health` → 200 OK

### P0-05 ✅ `staff_vanilla_backup_20260521/` öffentlich erreichbar
- **Status:** ERLEDIGT (2026-05-24) — Verzeichnis gelöscht

### P0-06 🔴 `.env` + `.env.local` im Repo prüfen (Release-Artefakt)
- **Status:** OFFEN
- **Kategorie:** Security / Hygiene
- **Problem:** `.env` und `.env.local` existieren im Repo-Root. Müssen zwingend außerhalb des Release-Artefakts bleiben.
- **Aktion:** `release-verify.sh` muss `.env` und `.env.local` als Blocker markieren
- **Wave:** WAVE 01 / WAVE 02
- **Verify:** `./scripts/release-verify.sh` → 0 env-Dateien im Artefakt

### P0-07 🔴 `release-package.sh` + `release-verify.sh` — CRLF + Ausschlussliste
- **Status:** OFFEN — Skripte existieren, aber nicht auf Phase-2-Standard geprüft
- **Kategorie:** QA / Release-Hygiene
- **Problem:** Release-Skripte müssen alle Ausschlüsse aus WAVE 01 Allowlist korrekt umsetzen
- **Wave:** WAVE 01
- **Verify:** `./scripts/release-verify.sh dist/*.zip` → grüner Report

### P0-08 🔴 `FEATURE_GATE_BYPASS=true` in Production verhindern
- **Status:** `.env.example` korrigiert (2026-05-24), aber Prod-Enforcement fehlt
- **Kategorie:** Commercial / Security
- **Problem:** Server muss beim Start mit `FEATURE_GATE_BYPASS=true` in Production eine Fehlermeldung ausgeben und stoppen
- **Wave:** WAVE 02
- **Verify:** `NODE_ENV=production FEATURE_GATE_BYPASS=true node api/server.js` → exit 1 mit Fehlermeldung

---

## P1 — Enterprise-kritisch (vor Pilotkunde)

### P1-01 🟠 Staff CC Ops-Setup
- **Status:** OFFEN (Owner-Aufgabe)
- **Kategorie:** Core Flow / Infra
- **Problem:** Code fertig (Migrationen 095/096, Router, Frontend), Nginx-VHost, ENV (`STAFF_USER_IDS`, `STAFF_SESSION_SECRET`), TLS fehlen
- **Aktion:** Nginx-VHost `staff.tempconnect.de`, TLS, ENV in Prod-Compose, optional IP-Allowlist
- **Aufwand:** 0,5–1 Tag (Ops)
- **Wave:** WAVE 12
- **Verify:** Login nur für Allowlist-User; Org-User → 403

### P1-02 🟠 SSO: `@node-saml/node-saml` nicht in package.json
- **Status:** OFFEN
- **Kategorie:** Security / Core Flow
- **Problem:** Dynamischer Import fällt auf `SSO_MODE="stub"` zurück wenn Paket fehlt. Enterprise-Kunden erwarten echtes SSO.
- **Entscheidung erforderlich (OE-03):** Produktionsreif machen ODER vollständig soft-locken
- **Aktion A (produktionsreif):** Dependency aufnehmen, echten IdP-Testlauf, ACS/Metadata/Signatur validieren
- **Aktion B (soft-lock):** Kein Stub in Production, UI zeigt "SSO anfragen", Endpunkte geben kein Fake-OK
- **Aufwand:** 0,5 Tag (A) oder 2 Stunden (B)
- **Wave:** WAVE 09
- **Verify:** `getSSOMode()` liefert weder Fake-OK noch crasht; Vertrieb darf SSO nicht als live verkaufen wenn B

### P1-03 🟠 E2E-Smoketests Pilot-Core-Flow
- **Status:** TEILWEISE ERLEDIGT — 4 Playwright-Specs für Kernflow erstellt (2026-05-24)
- **Kategorie:** QA
- **Problem:** `kernflow-*.spec.js` existieren syntaktisch korrekt, aber vollständiger CI-Lauf nicht nachgewiesen
- **Aktion:** `npx playwright test e2e/tests/kernflow-*.spec.js` in CI grün
- **Aufwand:** 1–1,5 Tage gesamt; Folge-Aufwand prüfen
- **Wave:** WAVE 04

### P1-04 🟠 Backup/Restore Dry-Run
- **Status:** OFFEN (Owner-Aufgabe)
- **Kategorie:** Infra / QA
- **Problem:** `scripts/backup.sh`, `backup-verify.sh`, `restore.sh`, `restore-test.sh` existieren aber kein nachweisbarer Live-Lauf
- **Aktion:** Einmal gegen Staging durchführen; Run-Log in `docs/releases/BACKUP_RESTORE_DRILL.md` ablegen
- **Aufwand:** 2 Stunden
- **Wave:** WAVE 12
- **Verify:** Run-Log zeigt erfolgreichen Restore in frische DB

### P1-05 🟠 OpenAPI `spec.json` Drift
- **Status:** OFFEN
- **Kategorie:** Doku / QA
- **Problem:** `api/openapi/spec.json` listet veraltete Pfade. Nach 85 Routen-Dateien ist Drift hoch.
- **Aktion:** `scripts/list-routes.js` gegen spec.json abgleichen; Diff bereinigen
- **Aufwand:** 2–3 Stunden
- **Wave:** WAVE 10
- **Verify:** Script-Diff zwischen list-routes und spec leer (oder Abweichungen dokumentiert)

### P1-06 🟠 Worker-Portal Abgrenzung (hidden_worker Suite)
- **Status:** OFFEN — hubVisibility.test.js hat Tests, aber hidden_worker-Suite vollständig?
- **Kategorie:** Rollen-Sichtbarkeit
- **Problem:** Zeitarbeiter (org_type: worker) dürfen ausschließlich Einsatzportal sehen. Alle Hub-Surfaces müssen hidden_worker enforzen.
- **Aktion:** hubVisibility.test.js hidden_worker-Suite komplett; kein worker-User sieht Company-Seiten
- **Wave:** WAVE 06
- **Verify:** `npm run test:unit` → hidden_worker-Suite vollständig grün

### P1-07 🟠 API-Key Scope-Enforcement (Finance-Routen)
- **Status:** OFFEN — `requireScope()` exportiert aber nirgendwo verwendet (toter Code)
- **Kategorie:** Security
- **Problem:** API-Key-Scopes sind dekorativ; Finance-Routen haben kein Scope-Gate
- **Aktion:** `requireScope('finance:read')` und `requireScope('finance:write')` auf relevante Routen wired
- **Wave:** WAVE 11
- **Verify:** API-Key ohne finance-Scope → 403 auf `/invoices/*`

### P1-08 🟠 Cross-Tenant RLS Deny-by-Default
- **Status:** ZU PRÜFEN — Tests existieren (coreFlowCrossTenant.test.js 19/19), aber DB-RLS-Policy?
- **Kategorie:** Security / Tenant-Isolation
- **Problem:** App-Level-Guards existieren, aber PostgreSQL RLS Policy muss deny-by-default sein
- **Aktion:** `TENANT_ISOLATION_MODEL.md` + RLS-Policy für alle tenant-scoped Tabellen
- **Wave:** WAVE 05
- **Verify:** `npm run test:tenant` grün; direkter DB-Zugriff ohne app.current_org_id → kein Datenzugriff

---

## P2 — Erste Pilotwochen

### P2-01 🟡 INDIVIDUELL Tier-Schwellen migrieren
- **Status:** GEPLANT
- **Problem:** `planFeatures.js` (30/250/999) vs `planCatalog.js` (50/150/350) — zwei Funktionen
- **Wave:** WAVE 06 / WAVE 13

### P2-02 🟡 Spend Analytics Scope-Display
- **Status:** OFFEN (P2-A in CLAUDE.md)
- **Problem:** `spend-analytics.html` zeigt keinen Scope-Bar
- **Wave:** WAVE 08

### P2-03 🟡 Vendor Pool + Rate Cards Scope-Hinweise
- **Status:** OFFEN (P2-B in CLAUDE.md)
- **Wave:** WAVE 08

### P2-04 🟡 Migration-Lücke 111 dokumentieren
- **Status:** OFFEN
- **Problem:** sql/migrations/ hat 110 und 112 aber keine 111
- **Wave:** WAVE 04 (DB)
- **Verify:** Owner-Entscheidung OE-05 vorher klären

### P2-05 🟡 `app_notdienst.html` Plan-Gate
- **Status:** OFFEN — Owner-Entscheidung OE-06 required
- **Wave:** WAVE 06

### P2-06 🟡 `meine(agb).html` Dateiname (Sonderzeichen)
- **Status:** OFFEN — Owner-Entscheidung OE-02 required
- **Wave:** WAVE 01

### P2-07 🟡 `api-docs.html` vs `api_docs.html` — Duplikat
- **Status:** OFFEN — Owner-Entscheidung OE-01 required
- **Wave:** WAVE 01

---

## Owner-Aufgaben (Claude Code kann diese NICHT selbst erledigen)

| # | Aufgabe | Priorität | Wave |
|---|---|---|---|
| M-01 | Secret-Rotation (SESSION_SECRET, DB-PW, Stripe, Sentry) | P0 | WAVE 02 |
| M-02 | Staff CC Nginx-VHost + TLS + STAFF_USER_IDS | P1 | WAVE 12 |
| M-03 | Backup/Restore Dry-Run gegen Staging | P1 | WAVE 12 |
| M-04 | SSO-Entscheidung (Okta-Dev ODER vollständig soft-locken) | P1 | WAVE 09 |
| M-05 | AGB / Datenschutz juristisch finalisieren | P1 | WAVE 15 |
| M-06 | Domain kaufen, DNS einrichten | Infra | WAVE 16 |
| M-07 | Tatsächliche Secret-Rotation durchführen (nach Anleitung) | P0 | WAVE 02 |
| M-08 | OCC-Entscheidung: React-Build in CI? | P2 | WAVE 03 |
| M-09 | Migration 111: Bewusst oder Fehler? | P2 | WAVE 04 |

---

## Entscheidungen ausstehend (Owner-Freigabe erforderlich)

| # | Frage | Impact |
|---|---|---|
| OE-01 | `api-docs.html` vs `api_docs.html` — welche kanonisch? | WAVE 01 |
| OE-02 | `meine(agb).html` umbenennen? Externe Links vorhanden? | WAVE 01 |
| OE-03 | SSO: produktionsreif (Okta/Azure) oder vollständig soft-locken? | WAVE 09 — KRITISCH |
| OE-04 | OCC React-Build in CI? | WAVE 03 |
| OE-05 | Migration 111: bewusst übersprungen oder Fehler? | WAVE 04 |
| OE-06 | `app_notdienst.html` — aktiv oder Coming Soon? | WAVE 06 |

---

## Gate-Status (Phase-2 Gates A–F)

| Gate | Titel | Status |
|---|---|---|
| A | Technical Readiness | 🔴 OFFEN (WAVE 01–05 ausstehend) |
| B | Security | 🔴 OFFEN (P0-04, P1-02, P1-07, P1-08) |
| C | Tenant Isolation | 🔴 OFFEN (P1-08 RLS-Status unklar) |
| D | Product Readiness | 🔴 OFFEN (Pilot-Core teilweise, OCC Phase 1) |
| E | Operations | 🔴 OFFEN (P1-01, P1-04 Backup/Restore) |
| F | Commercial / Legal | 🔴 OFFEN (AGB, Datenschutz, Secret-Rotation) |
