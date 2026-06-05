# Einsatzportal — Track-B Go-Live Decision

> Gate-Dokument laut `finalization/phase4_vertical/GATES.md` (Track-B-Gate, 20 Kriterien).
> Datum: 2026-06-05 | Commit: `52b8a10` | Branch: `release/enterprise-premium-market-ready`
> Verantwortlich: Claude (verifiziert) — **Owner-Unterschrift ausstehend** (Pflicht vor Live-Schaltung).

---

## 1. Verdikt

**CONDITIONAL GO — Worker-Self-Service-Portal ist abnahmebereit.**

Das Einsatzportal selbst (alle worker-zugewandten Flows, `/api/worker/*`) ist verifiziert grün:
**17 von 20 Gate-Kriterien automatisiert nachgewiesen**, der KERN-Blocker (native Stundenzettel-
Erfassung) ist geschlossen, der Cross-Org-Härtungspunkt ist geschlossen, der Browser-Smoke ist neu
und grün (8/8).

Vor unilateralem 20/20-„GO" verbleiben **drei nicht-portalseitige Punkte** (siehe §4), von denen
zwei eine Owner-Entscheidung bzw. -Abnahme erfordern. Gemäß Gate-Disziplin („Kein fast grün
durchwinken", „Owner-Unterschrift vor Live-Schaltung") wird hier **kein** unilaterales GO erklärt.

| Klassifikation | Anzahl | Punkte |
|---|---|---|
| Grün — automatisiert verifiziert | 17 | 1–12, 15, 17, 18, 19 |
| Grün im Portal-Scope, Hinweis | 1 | 13 (Kontakt-Kontext, manuelle Bestätigung empfohlen) |
| Bedingt — 2 nicht-portalseitige Testfehler | 1 | 16 (siehe §4) |
| Owner-Manuell — nicht automatisierbar | 1 | 20 (Mobile-Abnahme) |

---

## 2. Gate-Matrix (20 Kriterien)

| # | Kriterium | Status | Nachweis |
|---|---|---|---|
| 1 | Worker-Login funktioniert + erzwingt Worker-Rolle | [x] | Browser-Smoke: Login → 200; `requireAuth + requireWorkerRole` auf allen Routen; Guard-Test: unauth → Redirect `worker-login.html` |
| 2 | Alle Portal-Seiten nutzen Worker-only APIs | [x] | 7 Seiten booten via `GET /worker/me`; `PortalApi`-Prefix `/api`; Backend §2-Inventar: 30 Routen alle `requireWorkerRole` |
| 3 | Worker sieht ausschließlich eigene Daten | [x] | `workerPortalSmoke.ep09` XORG-1/2/3 grün; `workerSubmissionOrgHardening.security` grün |
| 4 | Dashboard zeigt echte operative Handlungen | [x] | `GET /worker/dashboard` → 200 mit `document_hub` (SMOKE-7) |
| 5 | Einsätze bestätigen/ablehnen/unavailable | [x] | `/worker/assignments/:id/{confirm,decline,report-unavailable}` + `workerAssignmentLifecycle` Tests |
| 6 | Einsatzplan wochenbasiert | [x] | `GET /worker/schedule?from&to` → 200 items[] (SMOKE-5) |
| 7 | **Stundenzettel nativ erstellt/bearbeitet/eingereicht (KERN)** | [x] | `einsatzportal-stundenzettel.html` inline-UI: `POST /worker/submissions` (Z. 760), `edSubmitFlow()`/`#ed-btn-submit` (Z. 324/973), Entry-/Prefill-/Korrektur-Handler. **Keine** Weiterleitung mehr |
| 8 | Status-Lifecycle verständlich | [x] | `portalStatus.js` + State-Machine (`workerSubmissionService`) + Stepper-UI (Z. 563 ff.) |
| 9 | **Worker kann keine fremden `org_id` einschleusen** | [x] | EP-03: `org_id`/`supplier_org_id` serverseitig aus `worker_assignment_link_id` abgeleitet; Client-Felder aus POST-Body entfernt (Z. 753-757); `workerSubmissionOrgHardening.security` grün |
| 10 | Nachweise hochladbar/prüfbar/herunterladbar | [x] | `/worker/documents` (multer, MIME-Check, 10 MB), `/download`, DELETE (verified-lock); `workerProfileHub.flow` grün |
| 11 | Notifications + Staffing Requests handlungsfähig | [x] | `/worker/notifications*`, `/worker/staffing-requests/:id/{respond,question,remind}`; Browser-Smoke SMOKE-6 |
| 12 | Choice Sets je Modus | [x] | `/worker/staffing-choice-sets/:id/respond` (alle 4 Modi) |
| 13 | Kontaktinformationen aus Assignment-Kontext | [x]* | EP-07 umgesetzt; *manuelle Sicht-Bestätigung empfohlen |
| 14 | Statische Hilfe-Texte nicht hart falsch | [x] | Hardcodierte Frist „Freitag 18:00" in `einsatzportal-kontakt.html` entfernt (kein Treffer mehr) |
| 15 | CSRF/401/403/409/422/500 sichtbar behandelt | [x] | `portalShell.showError()` + `portalApi`-Error-Mapping; Guard-Redirect-Test grün |
| 16 | Backend-Integrationstests bestehen | [~] | Worker-Self-Service: **37/39 grün**. 2 Fehler liegen in der **Agency-seitigen Review-Contract** (`/api/me`-Caps + `/api/agency/submissions`-Gate), nicht im Worker-Portal → §4 |
| 17 | Neue Cross-Org-Negativtests bestehen | [x] | `workerPortalSmoke.ep09` XORG-Set + `workerSubmissionOrgHardening.security` grün |
| 18 | **Browser-Smoke besteht** | [x] | `e2e/tests/einsatzportal-worker-flow.spec.js` — **8/8 grün** (`npx playwright test einsatzportal`), NEU 2026-06-05 |
| 19 | Keine neuen Links zu Legacy-`worker-timesheet.html` | [x] | `grep worker-timesheet.html frontend/public/einsatzportal-*.html` → **0 Treffer** |
| 20 | Mobile Worker-Nutzung realistisch | [ ]M | Bottom-Nav + Responsive vorhanden (EP-10); Gate verlangt **manuelle Mobile-Abnahme** (Owner) — nicht automatisierbar |

Legende: `[x]` verifiziert grün · `[x]*` grün mit Hinweis · `[~]` bedingt (siehe §4) · `[ ]M` Owner-Manuell.

---

## 3. Verifikationsbefehle (reproduzierbar)

```bash
# Browser-Smoke (Gate 18) — gegen laufenden Stack :8080
cd e2e && npx playwright test einsatzportal          # → 8 passed

# Worker-Integration + Cross-Org (Gate 3, 9, 16, 17) — im Container (DB erforderlich)
docker exec tempconnect_api sh -c "cd /app && node --test --test-force-exit \
  test/integration/workerPortalSmoke.ep09.test.js \
  test/integration/workerProfileHub.flow.test.js \
  test/integration/workerTimesheetPortal.flow.test.js \
  test/integration/workerSubmissionOrgHardening.security.test.js \
  test/integration/workerSubmissionsReview.access.flow.test.js \
  test/integration/workerOpenDealAssignments.flow.test.js"
# → tests 39 | pass 37 | fail 2 | cancelled 0   (2 Fehler = §4, nicht Worker-Portal)

# Legacy-Link-Check (Gate 19)
grep -rn "worker-timesheet.html" frontend/public/einsatzportal-*.html   # → leer
```

---

## 4. Verbleibende Punkte vor 20/20-GO

### 4.1 Gate 16 — 2 Integrationstest-Fehler (NICHT im Worker-Portal)

Beide Fehler liegen in `test/integration/workerSubmissionsReview.access.flow.test.js` und betreffen
die **Agency-seitige** Review-/Feature-Gate-Schicht, nicht die worker-zugewandten `/api/worker/*`-Routen.

**Fehler A — `GET /api/me` `worker_view`-Capability (Z. 78-90):**
- Erwartet `worker_view: true` für einen auf `member` herabgestuften Nutzer in einer ENTERPRISE-Org; Code liefert `worker_view: false`. Nur dieses eine Flag weicht ab (`worker_module/worker_review/worker_create` stimmen).
- **Ursache:** In-Flight org-zentrische Entitlement-/Capability-Refaktorierung. `git status` zeigt `api/services/entitlementService.js` als **uncommitted/modified** → laufende Owner-Arbeit.
- **Klassifikation:** Commercial/Entitlement (Kategorie 5), gehört zu Item-3 / Task #30. **Kein Worker-Portal-Defekt.**

**Fehler B — `GET /api/agency/submissions` `worker_module`-Feature-Gate (Z. 102-108):**
- Erwartet `403 FEATURE_NOT_ALLOWED` für eine DEMO-Agency; Endpoint liefert `200`.
- **Ursache:** `FEATURE_GATE_BYPASS=true` ist im Container gesetzt (verifiziert via `printenv`). Der Feature-Gate wird im Docker-Dev/Test-Env bewusst umgangen → 200 statt 403. **Environment-Artefakt**, in einer Nicht-Bypass-Umgebung (CI) würde der Test grün sein. Vgl. CLAUDE.md P1-B („FEATURE_GATE_BYPASS=true Docker-Verhalten").
- **Klassifikation:** Test-/Env-Drift, kein Code-Defekt. Empfehlung: Test um Bypass-Awareness ergänzen (wie P1-B-Fixes) — gehört zum Item-3-Cleanup.

> **Beide Punkte sind owner-gated** (laufende Entitlement-Refaktorierung) und werden NICHT autonom
> umgeschrieben. Routing: Task #30 / Item-3. Sie blockieren den Worker-Self-Service-Scope nicht.

### 4.2 Gate 20 — Mobile-Abnahme (Owner-Manuell)
Responsive Layout + Bottom-Nav sind vorhanden (EP-10). Der Gate verlangt explizit eine manuelle
Mobile-Abnahme. → Owner-Sichtprüfung auf realem Gerät.

### 4.3 Gate 13 — Kontakt-Kontext (Hinweis)
EP-07 umgesetzt (statische Falsch-Frist entfernt). Eine manuelle Bestätigung, dass Kontaktdaten aus
dem Assignment-Kontext gezogen werden, wird vor Sign-off empfohlen.

---

## 5. Änderungen dieser Session mit Gate-Bezug

| Änderung | Datei | Gate-Bezug |
|---|---|---|
| Registrierungs-Blocker behoben: `createSubscription`/`createOrgWithMembership` normalisieren Plan über `normalizePlanKey()` (DEMO statt FREE → `subscriptions_plan_check` nicht mehr verletzt) | `api/services/authService.js` | Voraussetzung für 16/17 (Worker-Provisionierung lief sonst in NO_ORG_MEMBERSHIP-Kaskade) |
| Migration 127 `org_access_suspension` angewandt (additiv, nullable, idempotent, Rollback dokumentiert) | `sql/migrations/127_org_access_suspension.sql` | Behebt `column access_suspended_at does not exist` (500) im Entitlement-Pfad |
| Browser-Smoke-Spec (7 Portal-Seiten + Unauth-Guard) | `e2e/tests/einsatzportal-worker-flow.spec.js` | **Gate 18 (neu grün)** |
| Org-Felder aus Submission-POST-Body entfernt | `frontend/public/einsatzportal-stundenzettel.html` | Gate 9 (Cross-Org-Härtung, Frontend-Seite) |

---

## 6. Owner-Sign-off

```
[ ] Gate 13 manuell bestätigt (Kontakt-Kontext)
[ ] Gate 16 entkoppelt: 2 Agency-Review-Tests via Item-3/#30 geklärt ODER bewusst als Post-Launch markiert
[ ] Gate 20 manuelle Mobile-Abnahme durchgeführt
[ ] Owner-Freigabe Worker-Self-Service-Portal:  ______________________  Datum: __________
```

Marktstart-Kopplung (GATES.md §„Marktstart-GO"): Track-B ist **Pflicht** für den Marktstart.
Der Worker-Self-Service-Scope ist abnahmebereit; die drei Restpunkte sind owner-/manuell-gated.

---

## 7. Referenzen

| Zweck | Pfad |
|---|---|
| Gate-Kriterien (Quelle) | `finalization/phase4_vertical/GATES.md` (Track-B-Gate) |
| Baseline-Audit (EP-00) | `docs/einsatzportal/EP_BASELINE.md` |
| Wave-Spezifikationen | `finalization/phase4_vertical/TRACK_B_EINSATZPORTAL.md` |
| Backend-Router | `api/routes/workerPortal.js` |
| Browser-Smoke | `e2e/tests/einsatzportal-worker-flow.spec.js` |
| Offene Blocker (Commercial/Entitlement) | Task #30 / Item-3 |
| Volltriage der 8 commercial/entitlement-Integrationsfehler | `docs/finalization/finalization_worklog.md` → „Item-3 / Task #30: Triage" (2026-06-05) |
