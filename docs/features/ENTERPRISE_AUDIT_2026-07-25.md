# Enterprise-Reifegrad-Audit — Käufer-Portal & Assignment-Lifecycle

> Durchgeführt 2026-07-25 gegen `release/enterprise-premium-market-ready`, HEAD `7d6e7fe`.
> Prüfgegenstand: die Wellen P1–P3 aus [PLATFORM_LIVING_ROADMAP.md](PLATFORM_LIVING_ROADMAP.md)
> (18 Commits vom 2026-07-22), plus Regression gegen die Kernplattform.
> **Methodik:** kein Vertrauen in Doku-Aussagen — jeder Befund wurde am echten Code, gegen
> das echte Schema und mit Mutationstests verifiziert. Owner-Gates (Stripe-Keys, UG-Gründung)
> wurden auftragsgemäß **nicht** als Blocker gewertet.

## Ausgangslage

| Signal | Wert |
|---|---|
| Volle Suite vor dem Audit | 7298 Tests, 0 Failures, 13 skipped (160 s) |
| Volle Suite nach der Härtung | siehe unten — 17 neue Tests in `companyTimesheets.route.test.js` (16 → 33) |
| Migrationen | höchste = 150 |

**Was nachweislich hielt:** Org-Boundary in allen neuen Services (`org_id`-gebunden),
Limit-Klemmung (`Math.min(500, …)` — kein unbounded Read), CSRF global vor `v1`,
Audit über `res.locals.audit` inkl. `responsible_actor_user_id`, konsequentes `esc()` auf
allen `innerHTML`-Pfaden, Migrationen 148–150 mit FKs/UNIQUE/Indizes/Rollback-Notiz,
0 TODO/FIXME im neuen Code.

---

## Befunde und Behebung

### 1 — RBAC-Lücke im Käufer-Portal (HOCH) · behoben

`routes/companyTimesheets.js` lief auf `[requireAuth, requireFeature, requireCompanyOrg]` —
**ohne `requirePermission` und ohne `requireScope`**. Damit konnte *jedes* Mitglied einer
Käufer-Org — auch `viewer` — abrechnungsrelevante Stunden freigeben und Kräfte sperren.

**Der Legacy-Vergleich ist der eigentliche Befund:** das alte `routes/timesheets.js`, das
dieses Portal ablöst, macht es korrekt — `rperm("timesheet.approve")` + `requireScope("write:timesheets")`
auf jeder mutierenden Route. Die *neue* Implementierung war also **schwächer gehärtet als das
System, das sie ersetzt**. Genau diese Klasse von Regression fängt keine Testsuite, weil nichts
rot wird — es fehlt nur etwas.

**Behebung:** alle 10 Käufer-Routen mit Scope + Permission versehen, unter **Wiederverwendung
der bestehenden Permissions** aus `rbacService.js` (keine neuen erfunden — sonst zwei Wahrheiten):

| Route | Scope | Permission | Begründung |
|---|---|---|---|
| `GET /company/submissions`, `GET …/:id` | `read:timesheets` | `timesheet.view` | identisch zum Legacy-Pfad |
| `POST …/:id/confirm` | `write:timesheets` | `timesheet.approve` | Stundenfreigabe = Geldentscheidung |
| `POST …/:id/reject` | `write:timesheets` | `timesheet.reject` | dito |
| `GET /company/live-workforce`, `/blocklist`, `/complaints` | `read:workers` | `assignment.view` | lesende Käufer-Sichten |
| `POST`/`DELETE /company/blocklist` | `write:workers` | `assignment.edit` | greift in künftige Besetzung ein |
| `POST /company/complaints` | `write:workers` | `assignment.view` | bewusst breit: ein Schichtverantwortlicher (`member`) muss ein Problem melden können — es ist ein Hinweis, keine Zustandsänderung |

**Wirkung:** `member`, `viewer`, `recruiter`, `supplier_user` können keine Stunden mehr freigeben.
Durch Tests fixiert (Policy-Vertrag + strukturelle Kettenprüfung), damit die Zusicherung nicht
still erodiert.

### 2 — Statusfilter-Leak: Kunde sah Entwürfe (MITTEL-HOCH) · behoben

`listCompanySubmissions` whitelistete per Default 4 Freigabe-Status, aber ein
`?status=draft` **überschrieb die Whitelist komplett**. Da `org_id` bereits beim INSERT
gesetzt wird, gehören auch Entwürfe der Käufer-Org → der Kunde konnte noch nicht eingereichte
Stunden und den internen Prüfstand der Agentur lesen. Die Detail-Route hatte **gar kein**
Status-Gate, nur den Org-Check → volle Tageseinträge von Entwürfen über die ID.

**Behebung:** `COMPANY_VISIBLE_STATUSES` als exportierte Single Source of Truth; ein
nicht-whitelisteter Filter fällt auf den Default zurück (weitet nie auf). Derselbe Gate im
`requireCompanySubmission`-Guard — bewusst **404 statt 403**, weil schon die Existenz eines
nicht freigegebenen Zettels eine Information ist.

### 3 — Beschwerde-Feature war eine Einbahnstraße (MITTEL) · behoben

`worker_complaints` wurde ausschließlich von `companyComplaintService` berührt: kein
Agentur-Endpunkt, keine Agentur-UI, die `status`-Spalte wurde **nie** fortgeschrieben, und
`GET /company/complaints` war ein **toter Endpunkt** (das Frontend machte nur POST).
Der Kunde meldete — und sah seine Meldung nie wieder.

**Behebung, beide Richtungen:**
- **Käufer:** neuer Tab „Meine Meldungen" im Käufer-Portal (Dringlichkeit, Grund, Status,
  Datum, Statusfilter). Nach dem Absenden lädt der Rückkanal sofort neu (Ripple).
- **Agentur:** `listSupplierComplaints` (strikt `supplier_org_id`-gescoped, nutzt den bereits
  in Migration 150 angelegten Index `(supplier_org_id, status)`) + `updateComplaintStatus`
  (Org-Boundary **im UPDATE**, nicht nachgelagert) + Routen `GET/PATCH /workers/complaints`.
- **UI-Platzierung als Designentscheidung:** der Beschwerde-Eingang sitzt **im Einsätze-Panel**
  von `worker-submissions-review`, direkt über den Einsatzkarten — weil die Antwort auf eine
  Meldung der Ersatz-Flow (P1.1) ist. Jede Meldung trägt „⇄ Ersatz zuweisen" (springt per
  `assignment_link_id` in den bestehenden Modal), „Angenommen" und „Erledigt". Kein
  Kontextwechsel, keine Sackgasse.

**Schema-Fund dabei:** die erste UI-Fassung nutzte `in_progress`/`dismissed` — der CHECK in
Migration 150 kennt aber nur `open | acknowledged | resolved`. Gegen das echte Schema korrigiert.

### 4 — HEAD bestand seine eigene Suite nicht (MITTEL) · offen für Commit

Bewiesen durch Ausführen der committeten Fassung (`git show HEAD:api/test/paymentService.test.js`)
→ **fail 2**. Die grüne Suite hing an einer *uncommitteten* Fixture-Korrektur im Working Tree
(ein zusätzlicher `null`-Parameter). Ein Mutationstest bestätigte, dass die Assertion wirklich
läuft (kein toter Test). Es ist legitime Fixture-Pflege im Sinne von §0.9 — sie war nur nie
committet. **Behebung: mitcommitten.**

### 5 — Design-System-Verstoß im Käufer-Portal (NIEDRIG-MITTEL) · behoben

`company-timesheets.html` nutzte harte Hex-Werte (`#fef3c7`, `#16a34a`, `#dc2626`, …) für
Badges, Buttons, KPI-Zahlen und den Live-Punkt — während dieselbe Datei sonst sauber
`var(--ds-*, fallback)` verwendet. Das Design-System hat für genau diese Zustände Tokens
(`--ds-success/-muted`, `--ds-warning/-muted`, `--ds-danger/-muted`, `--ds-accent/-muted`),
die in **allen** Themes mitziehen — die harten Werte nicht.

**Behebung:** alle Status-Farben auf Tokens umgestellt (11 Stellen).

### 6 — `esc()` maskierte keine Apostrophe (NIEDRIG) · behoben

Werte landen u. a. in `onclick="fn('…')"`. `esc()` maskierte `& < > "`, aber nicht `'` —
ein Wert mit Apostroph hätte aus dem JS-String-Literal ausbrechen können. Heute nicht
ausnutzbar (nur server-generierte UUIDs), aber das Muster wird in Folgeprojekte kopiert.
**Behebung:** `'` → `&#39;`.

### 7 — Sperrliste/Beschwerde akzeptierten beliebige UUIDs (NIEDRIG) · behoben

Die Routen prüften nur das UUID-*Format*. Eine Käufer-Org konnte beliebige Worker auf ihre
Sperrliste schreiben oder über sie Beschwerde führen, ohne dass die Kraft je bei ihr im
Einsatz war — und `supplier_org_id` kam **ungeprüft aus dem Request-Body** (falsche
Zuordnung der Herkunfts-Agentur).

**Behebung:** Beziehungs-Nachweis über `worker_assignment_links` (org-gescoped) als Pflicht;
`NO_ASSIGNMENT_RELATION` sonst. Beim Sperren steckt die Prüfung **in derselben Anweisung**
wie der Insert (`INSERT … SELECT … FROM (…) rel`) — race-frei, ein Roundtrip, und die
Herkunfts-Agentur wird dabei server-seitig abgeleitet statt vom Client übernommen.

### Kein Befund (geprüft und verworfen)

`worker_complaint_filed` fehlt in `notificationSurfaceMap.js`. Die Datei dokumentiert dieses
Verhalten aber explizit als gewollt: nicht gemappte Typen bleiben in der Glocke sichtbar und
tragen nur kein Hub-Card-Badge („degrade gracefully"). Kein Defekt — allenfalls eine spätere
Produktentscheidung, ob Kundenmeldungen ein Badge verdienen.

---

## Verifikation

- **Unit/Route:** `api/test/companyTimesheets.route.test.js` 16 → **33 Tests** (+17):
  Freigabe-Grenze (Filter weitet nicht auf, Detail-Guard 404 bei `draft`), Beziehungs-Nachweis
  (mit/ohne Einsatz, Body-`supplier_org_id` wird ignoriert), RBAC-Policy-Vertrag
  (`member`/`viewer`/`recruiter` dürfen nicht freigeben) + strukturelle Kettenprüfung aller
  9 Käufer-Routen, Agentur-Rückkanal (Scoping, Status-Validierung, Org-Boundary im UPDATE).
- **Gegen echtes Schema:** transaktionaler DB-Smoke des neuen Sperr-Guards im api-Container —
  mit Einsatz-Beziehung sauberer Insert inkl. server-seitig abgeleiteter `supplier_org_id`,
  ohne Beziehung `NO_ASSIGNMENT_RELATION`. Vollständig zurückgerollt.
- **Live:** api neu geladen, `GET /api/workers/complaints`, `/api/company/complaints`,
  `/api/company/blocklist`, `/api/company/live-workforce` antworten **401 statt 404**
  (registriert), Container-Start ohne Fehler.
- **Syntax:** `node --check` für alle geänderten Server- und Frontend-Dateien.

## Bewertung

| Bereich | Vor dem Audit | Nach der Härtung |
|---|---|---|
| Kernplattform (RBAC, Org-Boundary, Audit, Tests) | ~93 % | ~93 % |
| Käufer-Portal P2.2–P3.3 | ~75 % | ~92 % |
| **Gesamt** | **~88 %** | **~93 %** |

Die jüngste Welle war die Schwachstelle: funktional vollständig und schnell gebaut, aber
RBAC, Datenfreigabe-Grenze und Feature-Abschluss lagen unter dem Niveau des Rests. Die
Lehre für die nächsten Wellen steht in [PLATFORM_LIVING_ROADMAP.md](PLATFORM_LIVING_ROADMAP.md)
unter „Definition of Done je Welle".
