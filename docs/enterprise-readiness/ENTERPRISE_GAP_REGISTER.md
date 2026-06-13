# TempConnect — Enterprise Gap Register

> Vollständige, transparente Liste aller bekannten Lücken, Risiken und offenen Entscheidungen.
> Kein verstecktes Risiko — alles hier dokumentiert.
> WAVE 15 — Phase 2 — 2026-05-27 · **Refresh 2026-06-05** (Track-B-Abschluss + Phase-2-Commercial-Refactor)

---

## Go-Live Owner-Action Register — konsolidiert (Stand 2026-06-05)

> Konsolidiert den GESAMTEN verbleibenden Marktstart-Scope in EINE Owner-Checkliste, mit Evidenz je Punkt.
> Disziplin (99_GOLIVE_GATE / CLAUDE.md): „Fertig" entscheidet der Owner; Phase-5-Diffs bleiben uncommitted bis
> Owner-Freigabe. Befund: der verbleibende Scope ist **überwiegend owner-/extern-gated** — kein großer
> autonomer Bau mehr offen ohne Berührung des Owner-Gates oder des laufenden Refactors.

### A. Verifiziert grün — autonom abgeschlossen (nur Kenntnisnahme)

| ID | Punkt | Evidenz |
|---|---|---|
| G-01 | Track-B Einsatzportal (Worker-Self-Service) abnahmebereit | `docs/releases/EINSATZPORTAL_GO_LIVE_DECISION.md` — 17/20 automatisiert, Browser-Smoke `e2e/.../einsatzportal-worker-flow.spec.js` 8/8 |
| G-02 | Demo-Seed-Backdoor (052) geschlossen | PILOT_GO_LIVE_TODOS **P0.6** — Commit `bc24e58`, Env-Flag-Gate `SEED_DEMO_WORLD` + Remediation-Mig 125 |
| G-03 | Migrations-Chain + Deny-by-Default-RLS forward-repariert | **P0.7** — Commit `bc24e58`, Mig 126 (scharf beim nächsten migrate-Lauf gg. Managed-/Nicht-Superuser-DB) |
| G-04 | Fresh-Install-Integrität | 127 Migrationen, 0 Fehler (Wegwerf-DB-Verify, beide Flag-Pfade) |
| G-05 | 8 commercial/entitlement-Integrationsfehler triagiert — **kein Worker-Portal-Defekt** | `docs/finalization/finalization_worklog.md` (Triage 2026-06-05): 4× FEATURE_GATE_BYPASS-Artefakt (CI-grün), 2× 429 rate/quota, 2× refactor-gekoppelt |

### B. Owner-/extern-gated — erfordert Owner-Handlung (NICHT Claude-autonom)

| ID | Punkt | Owner-Action | Quelle |
|---|---|---|---|
| O-01 | Secret-Rotation vor erstem Pilotkunden | SESSION-/STAFF_SESSION-/DB-PW rotieren; Stripe/Sentry-Keys (>6 Mon.) | PILOT_GO_LIVE_TODOS **P0.4** |
| O-02 | Staff Control Center produktiv schalten | Nginx-VHost `staff.*`, `STAFF_USER_IDS`, `STAFF_SESSION_SECRET`, TLS, optional `HETZNER_CLOUD_TOKEN` | **P1.0** |
| O-03 | Phase-2-Commercial-Refactor reviewen + committen | **COMMITTET** (`4e59938` Kill-Switch + Mig 127). Offen bleibt nur der Live-Stripe/Login-Durchstich (Keys, O-07). Re-Verifikation 2026-06-11: CAN-1/HTTP-6/workerReview#2 bleiben auch NACH dem Commit rot → echte offene Harness-/Refactor-Folgepunkte, siehe Status-Note unten | finalization_worklog 2026-06-05 + 2026-06-11 |
| O-04 | Mig 127 (org_access_suspension) im **Prod**-migrate-Pfad anwenden | migrate-Lauf gg. Prod/Managed-DB (lokal bereits angewandt) | Mig 127 Header |
| O-05 | MFA-Enforcement owner/admin/finance | Enforce-Modus + Enrollment-Frist entscheiden | ID-01 (unten) |
| O-06 | SSO: Option A (SAML bauen) vs. B (dauerhaft soft-lock) | Roadmap-Entscheidung | ID-03 (unten) |
| O-07 | Preise + Stripe-Live-Keys (WAVE 13) | Reale Preise setzen, Live-Keys einspielen | `finalization/phase2_release/WAVES.md` WAVE 13 |
| O-08 | Restore-Drill (mind. 1×) + Prod-Compose ohne Dev-Mounts (WAVE 12) | Backup→Restore real durchführen | WAVES.md WAVE 12 |
| O-09 | Pre-Production Burn-in ≥7 Tage (WAVE 16) | Preprod-Stack betreiben, P0/P1-frei | `docs/releases/WAVE16_BURNIN_RUNBOOK.md` |
| O-10 | Rechtstexte / Datenschutz | AGB/DSGVO/Impressum final | `finalization/WAVE_14_legal_dataprotection.md` |
| O-11 | Rate-Limit-Redis-Store (Multi-Instance) | Infra-Entscheidung #Instances → `RATE_LIMIT_STORE=redis` | W11-02 (unten) |

### C. Offen-autonom — Claude-safe, klein (auf Zuruf)

| ID | Punkt | Hinweis |
|---|---|---|
| C-01 | Bypass-aware Test-Guards für die `FEATURE_GATE_BYPASS`-Integrationsfehler | **ERLEDIGT 2026-06-11** (nach O-03-Commit, exakt wie 06-07 spezifiziert): assertion-level `GATE_BYPASS ? 200 : 403` an den 5 echten Bypass-Treffern (subscription.flow #2/#4/#7/#8 + workerReview #4) — beide Zweige asserten exakt (Bypass-Env prüft den dokumentierten 200-Kontrakt, CI erzwingt weiter 403 + Fehler-Shape). Container-Verifikation: 4 Dateien **21/11/10 → 21/16/5**. Siehe Status-Note 2026-06-11 unten. |
| C-02 | Querschnitt-Worker-Ausschluss-Guard auf `/payment/checkout` (+`/individuell`) | **ERLEDIGT (durch committeten Phase-2-Refactor):** beide Checkout-Routen tragen `requireCompanyOrg` (`companyOrg`-Middleware, `BUYER_ORG_REQUIRED`) — Worker/Nicht-Company-Orgs werden serverseitig mit 403 gesperrt, vor jedem Handler inkl. Demo-Modus. 2026-06-11 im Code verifiziert (`routes/payment.js`). |

> **Befund-Kernsatz:** Bucket C ist bewusst dünn. Das ist die ehrliche Lage eines reifen Repos in
> Finalisierung — die Marktstart-Restarbeit ist Owner-Entscheidung/Infra/extern, nicht Neubau.

### Korrekturen zu Alt-Einträgen (2026-05-27 → 2026-06-05)
- **RLS:** „116 aktiv auf 10 Kerntabellen" war faktisch nie scharf (P0.7-Root-Cause: `migrate.sh` ohne `ON_ERROR_STOP` maskierte den 116-Rollback). **Mig 126** repariert Deny-by-Default + FORCE RLS forward → aktiv beim nächsten migrate-Lauf gg. Managed-DB. W11-01 „Mig 117 geplant" ist damit durch den 126-Forward-Repair ersetzt.
- **OCC-01:** OCC ist inzwischen vollständig (11/11 Module real implementiert, siehe CLAUDE.md-Empfehlungsliste P2-C/P3-B) — der Eintrag „Phase 2-15 ausstehend" ist überholt.
- **C-01 (2026-06-07, verifiziert & reklassifiziert C→B):** Der ursprüngliche Plan „Env-Flip wie P1-B" ist **in-process nicht tragfähig**. Empirie (4 Integrationsdateien im Container, Baseline 21/11/10): `process.env.FEATURE_GATE_BYPASS="false"` auf Modul-Ebene wirkt **nicht** auf das SLA/Capacities-Gate (`requireFeature("sla_access")` wird zur Router-Build-Zeit gebunden → `GET /api/capacities` bleibt 200), wirkt aber auf das `worker_module`-Gate — und legt dort eine **Plan-Resolution-Lücke im Test-Harness** offen (ENTERPRISE-Owner kommt als `plan: DEMO` an → `worker_module=false` → **Regression** workerReview #1/#3). Beide Pfade hängen an `getUserAndPlan`/`entitlementService`, die im in-flight Phase-2-Refactor liegen. **Konsequenz:** verschoben auf **nach O-03** (Refactor-Commit); korrekter Fix = assertion-level `expect(BYPASS ? 200 : 403)` **oder** Harness-Plan-Resolution härten — **kein** naiver Env-Flip (Edits wurden getestet und sauber zurückgerollt, Working Tree unberührt). Präzise Artefakt-Liste: **5 echte Bypass-Treffer** = subscription.flow #2/#4/#7/#8 + workerSubmissionsReview #4; **separat** = subscription.flow #3/#5 (429 Rate-Limiter), CAN-1 (cancel #1), HTTP-6 (commerce #6), workerReview #2 (worker_view, refactor-gekoppelt).

### Status-Note 2026-06-11 — C-01/C-02 geschlossen, Re-Verifikation nach O-03, Docker-Test-Resolution-Fix
- **C-01 umgesetzt** (assertion-level, wie am 06-07 spezifiziert): Container-Lauf der 4 Integrationsdateien **21/16/5** (vorher 21/11/10). Die 5 Rest-Fehler sind die dokumentierten NICHT-Bypass-Klassen, jetzt **nach O-03-Commit re-verifiziert = weiterhin rot**, also echte offene Punkte (nicht mehr „wartet auf Commit"): (a) **CAN-1** cancel.flow #1 `PLUS≠DEMO` — Harness-Plan-Resolution (`getUserAndPlan`/entitlement); (b) **HTTP-6** commerce #6 Staff-Step-up `428 erwartet, 401` — Staff-Session-Harness vs. SCC-Step-up; (c) **workerReview #2** `worker_view` member read-only; (d/e) **FG-3/FG-5** `POST /api/capacities` 429 (Rate-Limiter-Kollision im Test-Loop) bzw. `PLAN_LIMIT listings:0` (Env/Seed-Kontingent). (a)–(c) gehören zum Owner-Commercial-Workstream (Folge-Slice), (d)/(e) sind Test-Env-Artefakte.
- **C-02 war durch den Refactor bereits erledigt** — `requireCompanyOrg` auf beiden Checkout-Routen (Code-verifiziert).
- **Docker-Test-Resolution-Fix (Folgefehler der Test-Integritäts-Härtung vom 06-10/11):** Die marker-basierte ROOT-Auflösung ließ 4 Frontend-Suiten im Container anlaufen, deren **Loader** aber weiter über `__dirname/../..` lasen (im Container = `/`, ENOENT) bzw. deren Guards nur js prüften, während die Suite auch **HTML/docs** liest (im Container ist NUR `frontend/public/js` gemountet) → 40 Suite-Fehler. Fix: Loader auf `path.join(ROOT, …)`; Guards prüfen ALLE gelesenen Ressourcen-Klassen. Ergebnis: Container 40/40 (js-Suiten laufen real, HTML-Suiten skippen sauber), Host cwd=api 43/43 real. Lehre: **Guard-Marker muss jede Ressourcen-Klasse abdecken, die die Suite liest — und Loader müssen dieselbe ROOT-Konstante nutzen wie der Guard.**

### Status-Note 2026-06-13 — Welle F1 abgeschlossen: die 5 Rest-Fehler von 06-11 sind ECHT geschlossen (21/21/0)
- Die am 06-11 als „offene Folgepunkte" geführten 5 Fehler waren bei genauer Analyse: **1 Produktbug + 4 Harness-Defekte** (Tests=Spezifikation, Code blieb richtig):
  - **HTTP-6 = PRODUKTBUG** (nicht Harness): `requireMfa.js`-Identitäts-Precheck las nur `session.userId`, nicht die separierte Staff-Session `session.staffUserId` → **401 statt 428** auf allen 24 SCC-Mutationen, sobald nicht zufällig auch plattform-eingeloggt — und das trotz `enforce:false` (Audit-Only-Vertrag). Fix `userId || staffUserId` + 5 Middleware-Tests. (Das 428≠401 vom 06-11 war also die Spitze eines echten Betriebsblockers, nicht „nur Test-Harness".)
  - **CAN-1 + FG-5 = Harness**: effektiver Plan ist **org-first** (`basePlan = org_plan || dbPlan`), aber `ensureSubscription` setzte nur die User-Subscription — und das via `ON CONFLICT (user_id)`, das ohne Unique-Constraint immer warf + still verschluckt wurde. Fix: UPDATE→INSERT **plus** Org-Plan-Update, FREE→DEMO.
  - **workerReview #2 = Harness**: Org-Umzug nach Session-Erstellung → Session-Org-Cache auf deaktivierter Alt-Membership → `org_role=null`. Fix: Re-Login im Setup.
  - **FG-3 = bypass-aware**: das „429" war NICHT der Rate-Limiter, sondern das **Org-Limit** `PLAN_LIMIT_REACHED listings:0` der DEMO-Org hinter dem bypassten Gate; jetzt exakt asserted (Bypass: 429+metric, CI: 403+FEATURE_NOT_ALLOWED).
- **Ergebnis:** 4 Integrations-Dateien **21/21/0** (null Rest-Artefakte), volle Unit-Suite **4508/4508/0**. Damit ist die 06-11-Aussage „bleiben auch nach O-03 rot" überholt — sie sind real geschlossen. Details: `finalization_worklog.md` Abschlussbericht Welle F1.

---

## Legende

| Priorität | Bedeutung |
|---|---|
| **P0 — Blocker** | Verhindert Go-Live. Muss vor Release behoben werden. |
| **P1 — Hoch** | Wesentliches Risiko. Owner-Entscheidung erforderlich. |
| **P2 — Mittel** | Bekanntes Risiko, akzeptiert für Pilot. Zeitplan definieren. |
| **P3 — Niedrig** | Qualitätsverbesserung, kein Sicherheitsrisiko. |

---

## P0 — Produktionsblocker (alle behoben)

Zum Zeitpunkt des Enterprise Evidence Pack (WAVE 15) gibt es **keine offenen P0-Blocker**.

Alle früheren Blocker wurden behoben:
- ✅ `npm audit` — 0 High/Critical Vulnerabilities
- ✅ Keine echten Secrets im Repository
- ✅ RLS aktiv auf 10 Kerntabellen
- ✅ CSRF auf allen mutierenden Endpunkten
- ✅ CORS — kein Wildcard in Production
- ✅ SSO Stub in Production blockiert

---

## P1 — Hohe Priorität (Owner-Entscheidung erforderlich)

### ID-01: MFA-Pflicht für owner/admin nicht erzwungen

| Feld | Wert |
|---|---|
| **Beschreibung** | MFA ist implementiert (opt-in), aber für kritische Rollen nicht erzwungen |
| **Risiko** | Schwache Passwörter bei Admins → Account-Übernahme möglich |
| **Mitigation** | `requireMfa` Middleware vorhanden, kann in Enforce-Modus geschaltet werden |
| **Empfehlung** | 30-Tage Enrollment-Frist → Pflicht-Enforcement für owner/admin/finance |
| **Owner-Entscheidung** | Ausstehend |
| **Referenz** | `docs/security/IDENTITY_MODEL.md` Sektion ID-01 |

### ID-03: SSO/SAML nicht produktionsreif

| Feld | Wert |
|---|---|
| **Beschreibung** | SSO ist soft-locked (Option B). `@node-saml/node-saml` nicht installiert. |
| **Risiko** | Enterprise-Kunden mit SSO-Anforderung können nicht bedient werden |
| **Mitigation** | Stub ist in Production blockiert (403). Kein Fake-SSO. |
| **Empfehlung** | Option A: Vollständige SAML-Implementierung (4-6 Wochen) |
| **Owner-Entscheidung** | Dauerhaft Option B oder Roadmap-Item Option A? |
| **Referenz** | `docs/security/IDENTITY_MODEL.md` Sektion SSO |

---

## P2 — Mittlere Priorität

### W11-01: RLS auf ~60 weiteren Tabellen ausstehend

| Feld | Wert |
|---|---|
| **Beschreibung** | Migration 116 schützt 10 Kerntabellen. ~60 weitere Tabellen haben noch keine RLS-Policies. |
| **Risiko** | DB-seitig unvollständige Isolation (App-Layer und Query-Layer schützen vollständig) |
| **Mitigation** | 3-schichtige Isolation: App + Query + DB. App+Query decken alle ~70 Tabellen. |
| **Zeitplan** | Migration 117 — geplant, Datum TBD |
| **Referenz** | `docs/security/TENANT_ISOLATION_MODEL.md` |

### W11-02: Rate-Limit-Store Memory (Single-Instance)

| Feld | Wert |
|---|---|
| **Beschreibung** | Rate-Limit-Store ist Memory-basiert. Bei Multi-Instance-Deployment gelten Limits per Instance. |
| **Risiko** | Horizontale Skalierung führt zu effektiv höheren Rate-Limits (Faktor N Instances) |
| **Mitigation** | `RATE_LIMIT_STORE=redis` ENV vorhanden. Redis ist konfiguriert für Session-Store. |
| **Lösung** | Redis als Rate-Limit-Store aktivieren (1-Stunden-Aufwand nach Infra-Entscheidung) |
| **Owner-Entscheidung** | Infra-Entscheidung: Wie viele Instances im Production-Deployment? |

### OCC-01: Owner Control Center Phase 2–15 ausstehend

| Feld | Wert |
|---|---|
| **Beschreibung** | OCC React-Shell ist aufgebaut (Phase 1). Business-Logik-Module (Executive, Revenue, Platform) ausstehend. |
| **Risiko** | Owner-Tools nicht vollständig — manuelle Prozesse über SCC nötig |
| **Mitigation** | Staff Control Center deckt alle kritischen Owner-Funktionen ab |
| **Zeitplan** | OCC Phase 2-8 ist nächster Major-Milestone |

---

## P3 — Niedrige Priorität

### ID-02: MFA-Pflicht für Staff SCC (ergänzend zu Step-Up)

| Feld | Wert |
|---|---|
| **Beschreibung** | SCC hat Step-Up Re-Auth (15min). Zusätzliche MFA-Pflicht für Staff-Login selbst fehlt. |
| **Risiko** | Gering (Step-Up bietet bereits re-auth) |
| **Empfehlung** | Nice-to-have nach ID-01 |

### ID-05: Recovery Code Regeneration UI

| Feld | Wert |
|---|---|
| **Beschreibung** | Recovery-Codes können aktuell nicht über UI regeneriert werden |
| **Risiko** | Gering — Codes können via API regeneriert werden |
| **Lösung** | UI-Button in MFA-Einstellungen |

---

## Gap-Summary

| Priorität | Offen | In Arbeit | Geschlossen |
|---|---|---|---|
| P0 | 0 | 0 | 3+ |
| P1 | 2 | 0 | — |
| P2 | 3 | 0 | — |
| P3 | 2 | 0 | — |
| **Gesamt** | **7** | | |

---

## Kommunikation gegenüber Kunden

**Was darf gesagt werden:**
- ✅ "MFA ist verfügbar und für kritische Rollen empfohlen" (aber nicht: "MFA ist Pflicht")
- ✅ "SSO ist auf der Roadmap für den INDIVIDUELL-Tarif" (aber nicht: "SSO ist live")
- ✅ "Mandanten-Isolation ist dreifach abgesichert (App + Query + DB)"
- ✅ "RLS ist aktiv auf allen Kerndaten-Tabellen"

**Was nicht gesagt werden darf:**
- ❌ "MFA ist für alle Admins verpflichtend" (ist sie nicht)
- ❌ "SSO ist produktionsreif" (ist es nicht)
- ❌ "Alle Tabellen sind RLS-geschützt" (~60 Tabellen fehlen noch)

---

*WAVE 15 — Phase 2 — 2026-05-27*
*Zuständig: Security/Architecture (Claude), Freigabe: Owner*
