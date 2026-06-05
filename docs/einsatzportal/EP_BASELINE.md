# Einsatzportal — EP-00 Baseline Audit
> Track B WAVE EP-00 | Erstellt: 2026-05-29 | Read-only — keine Codeänderungen
> Ausgangspunkt für alle nachfolgenden EP-Wellen

> **STATUS-UPDATE (2026-06-05):** Dieser EP-00-Audit ist historisch (Ausgangszustand).
> Die EP-Wellen sind umgesetzt — Track-B-Gate ist zu 17/20 automatisiert verifiziert grün:
> KERN-Blocker B-01/EP-02 (native Stundenzettel) geschlossen, B-02/EP-03 (Cross-Org `org_id`)
> geschlossen, Browser-Smoke 8/8 grün. Aktueller Gate-Stand + 3 owner-/manuell-gated Restpunkte:
> **`docs/releases/EINSATZPORTAL_GO_LIVE_DECISION.md`**.

---

## 1. Inventar — Frontend-Dateien

| Datei | Zeilen | Status | Inline-JS | Primäres Problem |
|---|---|---|---|---|
| `einsatzportal-dashboard.html` | 738 | Weitgehend funktional | ✅ ja | 3× stille catch-Blöcke; kein gemeinsamer Shell-Helper |
| `einsatzportal-einsaetze.html` | 391 | Funktional | ✅ ja | Einige stille catch `{}`; fehlende Error-UI |
| `einsatzportal-plan.html` | 292 | Funktional | ✅ ja | `catch(e){ console.error(e); }` statt User-sichtbarem Fehler |
| `einsatzportal-stundenzettel.html` | 444 | **KERN-BLOCKER** | ✅ ja | Listet Submissions, leitet für Edit/Create aber zu `worker-timesheet.html` weiter — kein natives UI |
| `einsatzportal-benachrichtigungen.html` | 1062 | Weitgehend funktional | ✅ ja | 1× stille catch; 9× Fehler-catch mit toast (gut) |
| `einsatzportal-profil.html` | 623 | Funktional | ✅ ja | `catch(e){ console.error(e); }` statt User-sichtbarem Fehler |
| `einsatzportal-kontakt.html` | 339 | Statisch | ✅ ja | Hardcodierte Frist "bis Freitag 18:00 Uhr" (falsch für alle Kunden) |

**Gemeinsame Module (noch nicht existent):**

| Datei | Status | Zweck |
|---|---|---|
| `js/workerPortal/portalApi.js` | ❌ fehlt | Zentraler API-Client, CSRF, Error-Mapping |
| `js/workerPortal/portalShell.js` | ❌ fehlt | Worker-Me laden, Sidebar, Toast, Logout |
| `js/workerPortal/portalStatus.js` | ❌ fehlt | Status-Label-Maps für Submissions/Assignments/Dokumente |
| `js/workerPortal/timesheets.js` | ❌ fehlt | Native Stundenzettel-UI (EP-02 Kernblock) |

**Existierende Legacy-Datei:**

| Datei | Status | Notiz |
|---|---|---|
| `worker-timesheet.html` | Meta-Redirect → `einsatzportal-stundenzettel.html` | Korrekt. Keine neuen Links dorthin. |
| `js/pages/workerTimesheet.js` | 603 Zeilen — volle Timesheet-UI | Kann als Referenz für EP-02 Migration genutzt werden |

---

## 2. Inventar — Backend-Routen (`/api/worker/*`)

Alle Routen in `api/routes/workerPortal.js` (862 Zeilen).
Guard: `requireAuth + requireWorkerRole` auf allen Routen. ✅

| Route | Methode | Zweck | Status |
|---|---|---|---|
| `/worker/me` | GET | Eigenes Profil | ✅ |
| `/worker/me` | PATCH | Profil aktualisieren | ✅ |
| `/worker/documents` | GET | Dokument-Liste | ✅ |
| `/worker/documents` | POST | Dokument hochladen | ✅ (multer, MIME-Check, 10 MB) |
| `/worker/documents/:id/download` | GET | Download (nur eigene) | ✅ |
| `/worker/documents/:id` | DELETE | Löschen (verified locked) | ✅ |
| `/worker/assignments` | GET | Einsatz-Liste | ✅ |
| `/worker/assignments/:id` | GET | Einsatz-Detail | ✅ |
| `/worker/assignments/:id/confirm` | POST | Einsatz bestätigen | ✅ |
| `/worker/assignments/:id/decline` | POST | Einsatz ablehnen + Grund | ✅ |
| `/worker/assignments/:id/report-unavailable` | POST | Abwesenheit melden | ✅ |
| `/worker/schedule` | GET | Einsatzplan | ✅ |
| `/worker/submissions` | GET | Submission-Liste | ✅ |
| `/worker/submissions/:id` | GET | Submission + Einträge | ✅ |
| `/worker/submissions` | POST | Submission erstellen | ⚠️ **Cross-Org-Risiko** (s. u.) |
| `/worker/submissions/:id/entries` | PUT | Tageseintrag upsert | ✅ |
| `/worker/submissions/:id/entries/:entryId` | DELETE | Eintrag löschen | ✅ |
| `/worker/submissions/:id/submit` | POST | Einreichen | ✅ |
| `/worker/submissions/:id/correct` | POST | Korrektur einreichen | ✅ |
| `/worker/submissions/:id/comment` | POST | Kommentar hinzufügen | ✅ |
| `/worker/submissions/:id/prefill` | GET | Schicht-Standardwerte | ✅ |
| `/worker/staffing-requests` | GET | Einladungs-Liste | ✅ |
| `/worker/staffing-requests/:id/respond` | POST | accept/decline | ✅ |
| `/worker/staffing-requests/:id/question` | POST | Frage stellen | ✅ |
| `/worker/staffing-requests/:id/remind` | POST | Erinnerung | ✅ |
| `/worker/staffing-choice-sets` | GET | Choice-Sets | ✅ |
| `/worker/staffing-choice-sets/:id/respond` | POST | Alle 4 Modi | ✅ |
| `/worker/notifications` | GET | Notifications | ✅ |
| `/worker/notifications/:id/read` | PATCH | Als gelesen markieren | ✅ |
| `/worker/notifications/read-all` | PATCH | Alle gelesen | ✅ |
| `/worker/dashboard` | GET | Dashboard-KPIs | ✅ |

**Gesamt: 30 Routen, alle gesichert. Backend-Basis stark (78–82%).**

---

## 3. Inventar — Services

| Service | Datei | Kernfunktionen |
|---|---|---|
| `workerService.js` | `api/services/workerService.js` | getWorkerProfile, updateWorkerProfile, getWorkerAssignments, getWorkerAssignmentDetail, getWorkerSchedule, confirmAssignment, declineAssignment, reportUnavailable, listWorkerDocuments, createWorkerDocument, getWorkerDocumentById, deleteWorkerDocument |
| `workerSubmissionService.js` | `api/services/workerSubmissionService.js` | createSubmission, getSubmission, getSubmissionWithEntries, listSubmissions, upsertEntry, deleteEntry, submitSubmission, submitCorrected |
| `workerNotificationService.js` | `api/services/workerNotificationService.js` | notifyAssignmentConfirmedToDispatcher, notifyAssignmentDeclinedToDispatcher, notifyUnavailableReported |
| `assignmentStaffingService.js` | `api/services/assignmentStaffingService.js` | listWorkerStaffingRequests, listWorkerStaffingChoiceSets, respondToStaffingInvite, askStaffingInviteQuestion, requestStaffingInviteReminder, submitStaffingChoicePreferences, submitStaffingChoiceRanking, selectStaffingChoiceOption, declineStaffingChoiceSet |

**Statusmaschine Submissions (workerSubmissionService.js):**
```
draft → submitted → under_review →
  needs_correction / approved_internal / rejected →
  sent_to_customer →
  customer_confirmed / customer_rejected →
  posted_to_timesheet
```

---

## 4. Inventar — Tests

| Testdatei | Test-Stmts | Abdeckung |
|---|---|---|
| `workerSubmissionService.test.js` | 19 | Submission CRUD, Status-Maschine |
| `workerAssignmentLifecycle.test.js` | 11 | Assignment confirm/decline/unavailable |
| `workerLifecycleCompletion.test.js` | 49 | Vollständiger Lifecycle-Durchlauf |
| `workerNotificationService.test.js` | — | Notifications |
| `workerProfileHub.test.js` | — | Profil + Dokumente |
| `workerSubmissionWeeklyRules.test.js` | — | 7-Tage / 24h-Grenzen |
| `assignmentStaffingSuggestions.workerFilter.test.js` | — | Worker-Filter-Logik |

**Browser-E2E-Tests:** ❌ keine — EP-09 Blocker.
**Cross-Org Negative Tests (API):** teilweise vorhanden, nicht vollständig systematisch.

---

## 5. Aktuelle Defekte / Blocker (priorisiert)

### 🔴 KERN-BLOCKER (EP-02)

**B-01 — Stundenzettel-Erfassung nicht im Einsatzportal:**
`einsatzportal-stundenzettel.html` enthält eine Submissions-Liste, leitet aber für jede Aktion (Entwurf fortsetzen, Korrektur einreichen, neu anlegen) auf `worker-timesheet.html` weiter:
```
Zeile 325: href="worker-timesheet.html?id=${s.id}"          ← Entwurf fortsetzen
Zeile 326: href="worker-timesheet.html?id=${s.id}"          ← Korrektur
Zeile 327: href="worker-timesheet.html?link_id=${s.link_id}" ← Neu anlegen
Zeile 397: location.href=`worker-timesheet.html?link_id=...` ← Quick-CTA
Zeile 404: location.href=`worker-timesheet.html?link_id=...` ← Auswahl-Dialog
```
`worker-timesheet.html` ist heute bereits ein Meta-Redirect zurück zu `einsatzportal-stundenzettel.html` — was eine Redirect-Schleife erzeugt. Die `workerTimesheet.js`-Logik (603 Zeilen) muss als natives Modul in das Einsatzportal integriert werden.

### 🟠 SICHERHEITS-RISIKO (EP-03)

**B-02 — `POST /worker/submissions` akzeptiert `org_id`/`supplier_org_id` vom Client:**
`createSubmissionSchema` (Zeile 23–31, workerPortal.js) verlangt `org_id` und `supplier_org_id` als Pflichtfelder vom Worker. Zwar wird `worker_assignment_link_id` auf Worker-Ownership geprüft, aber `org_id`/`supplier_org_id` kommen ungeprüft aus dem Client-Body. Ein Worker könnte fremde Org-IDs einschleusen.
**Fix:** Diese Felder serverseitig aus `worker_assignment_link_id` ableiten. Compatibility Mode nur temporär.

### 🟡 FEHLERBEHANDLUNG (EP-01 / alle Wellen)

**B-03 — 5 stille Fehler (`console.error` statt User-Feedback):**
| Datei | Zeile | Code |
|---|---|---|
| `einsatzportal-stundenzettel.html` | 191 | `catch(e){ console.error(e); }` |
| `einsatzportal-plan.html` | 168 | `catch(e) { console.error(e); }` |
| `einsatzportal-profil.html` | 330 | `catch(e) { console.error(e); }` |
| `einsatzportal-kontakt.html` | 244 | `catch(e){ console.error(e); }` |
| `einsatzportal-benachrichtigungen.html` | 286 | `catch(e){ console.error(e); }` |

Zusätzlich: mehrere leere `catch {}` Blöcke in dashboard.html, einsaetze.html, plan.html.

**B-04 — CSRF-Token pro Seite dupliziert:**
Jede HTML-Seite enthält eigene `getCsrf()`-Funktion. Kein gemeinsamer Cache.

### 🟡 UX-PROBLEM (EP-07)

**B-05 — Hardcodierte Stundenzettel-Frist in Kontakt:**
`einsatzportal-kontakt.html` Zeile 180: "Reichen Sie Ihre Stundenzettel **bis Freitag 18:00 Uhr** (...)"
Diese Frist ist nicht für alle Kundenverträge gültig. Soll aus Assignment-Kontext kommen oder entschärft werden.

---

## 6. Quick Wins (ohne Breaking Change)

| # | Win | Aufwand | Wave |
|---|---|---|---|
| QW-1 | `portalApi.js` erstellen (CSRF zentralisiert, fetch-Wrapper) | 0.5h | EP-01 |
| QW-2 | `console.error` in 5 Dateien durch `toast(..., 'error')` ersetzen | 0.25h | EP-01 |
| QW-3 | Leere `catch {}` in dashboard + plan durch Minimum-Fehler-Log ersetzen | 0.25h | EP-01 |
| QW-4 | `portalShell.js` extrahieren (loadWorkerMe, Sidebar, Logout) | 1h | EP-01 |
| QW-5 | Stundenzettel-Frist in Kontakt als "je nach Vereinbarung" weichen | 0.25h | EP-07 |

---

## 7. Risiken

| Risiko | Schwere | Mitigation |
|---|---|---|
| Cross-Org `org_id` Injection via `POST /worker/submissions` | 🔴 Hoch | EP-03: Server leitet aus `worker_assignment_link_id` ab |
| Redirect-Schleife `stundenzettel.html` ↔ `worker-timesheet.html` | 🔴 Hoch | EP-02: Native UI in stundenzettel.html |
| Stille Fehler führen zu Daten-Inkonsistenz ohne Worker-Feedback | 🟠 Mittel | EP-01: Gemeinsamer Error-Handler |
| Statische Fristen in kontakt.html falsch für Kunden-Verträge | 🟡 Niedrig | EP-07: Aus Assignment-Kontext oder generisch |
| Kein E2E-Test fängt Browser-Regressions | 🟠 Mittel | EP-09: Playwright Smoke-Tests |

---

## 8. Reife-Einschätzung (Ist-Zustand)

| Bereich | Ist | Ziel |
|---|---|---|
| Backend-Basis | **80%** (alle Routen implementiert, 1 Sicherheitslücke) | 95% |
| Frontend-Verdrahtung | **45%** (Listen: ok, Edit/Create: nicht im Portal) | 90% |
| Fehlerbehandlung | **50%** (5 stille Fehler, teils toast vorhanden) | 95% |
| Security (Cross-Org) | **72%** (Guard vorhanden, org_id still client-trusted) | 98% |
| Gemeinsame Module | **0%** (alles inline) | 80% |
| Tests Backend | **75%** (7 Testdateien, kein Cross-Org Negativ-Set) | 90% |
| Tests E2E | **0%** | 70% |
| **Gesamt** | **~60%** | **90%** |

> Hinweis: TRACK_B_EINSATZPORTAL.md schätzte 68-72% — diese Baseline schätzt nach direkter Inspektion konservativer wegen fehlender nativer Stundenzettel-Erfassung.

---

## 9. Empfohlene Wave-Reihenfolge

```
EP-01  →  Gemeinsame Basis (portalApi, portalShell, portalStatus, Error-Handling)
EP-02  →  Native Stundenzettel-UI (KERN-BLOCKER, größter Einzelblock)
EP-03  →  Backend Hardening: org_id aus Session statt Client-Body
EP-04  →  Einsätze + Plan auf gemeinsame Helper migrieren
EP-05  →  Notifications + Staffing Requests + Choice Sets
EP-06  →  Profil + Dokumente
EP-07  →  Kontakt & Hilfe (Assignment-Kontakt, statische Texte entschärfen)
EP-08  →  Dashboard finalisieren (KPIs, Hero-Karte, Document-Hub)
EP-09  →  E2E / Smoke / Cross-Org-Negative-Tests
EP-10  →  Accessibility / Mobile / Final Cleanup
```

---

## 10. Referenz-Dateien

| Zweck | Pfad |
|---|---|
| Wave-Spezifikationen | `finalization/phase 4/TRACK_B_EINSATZPORTAL.md` |
| Gate-Kriterien (20 Punkte) | `finalization/phase 4/GATES.md` — Track-B-Gate |
| Backend-Router | `api/routes/workerPortal.js` |
| Services | `api/services/workerService.js`, `workerSubmissionService.js`, `workerNotificationService.js`, `assignmentStaffingService.js` |
| Timesheet-Logik (Referenz EP-02) | `frontend/public/js/pages/workerTimesheet.js` |
| CSS | `frontend/public/einsatzportal.css` |

---

*EP-00 abgeschlossen. Keine Codeänderungen. Nächster Schritt: EP-01 — gemeinsame Portal-Basis.*
