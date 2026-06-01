# Track B — Einsatzportal Enterprise-Finalisierung auf 90% Reife

> Worker-Portal (`einsatzportal-*`) auf belastbare Enterprise-Reife heben. Aktuell ca. 68-72%. Ziel: 90%.

---

## Aktuelle Reife (Baseline)

```text
Backend-Basis:             78–82 %
Frontend-Verdrahtung:      55–65 %
Security-Basis:            75–82 %
Worker-UX:                 60–70 %
Enterprise-Abnahme:        65–72 %
```

**Gesamt:** ca. 68–72% Enterprise-Reife.

**Ziel:** 90%.

Der größte Engpass ist NICHT fehlende Grundarchitektur, sondern **Frontend-Verdrahtung, Stundenzettel-Erfassung, robuste Fehlerzustände, E2E-Abnahme**.

---

## Zentraler Kernflow

```text
Worker Login
→ Einsatzportal Dashboard
→ Meine Einsätze
→ Einsatzplan
→ Stundenzettel erfassen / korrigieren / einreichen
→ Benachrichtigungen / Staffing-Optionen
→ Profil / Nachweise
→ Kontakt & Hilfe
→ Agency Review
→ Kundenfreigabe
→ Abrechnung / Spend
```

---

## Was bereits stark ist (nicht antasten)

- `workerPortal.js` hat `requireWorkerRole`-Pattern (korrekt)
- Worker-Daten über `req.session.userId` gescoped (korrekt)
- `csrfProtect` global für `/api/`
- `workerSubmissionService.js` hat saubere Statusmaschine:
  ```
  draft → submitted → under_review →
    needs_correction / approved_internal / rejected → sent_to_customer →
    customer_confirmed / customer_rejected → posted_to_timesheet
  ```
- Validierung serverseitig (7-Tage-Woche, 24h-Limit, Schichtzeiten, Submit sperrt Einträge)
- Dokumenten-Hub mit autorisiertem Download
- Staffing Requests + Choice Sets

---

## 10 Kritische Lücken (Enterprise-Blocker)

1. **Stundenzettel-Erfassung ist frontendseitig nicht verdrahtet** — `einsatzportal-stundenzettel.html` verlinkt auf `worker-timesheet.html`, das nur ein Meta-Refresh ist. Kritischer Blocker.
2. **API für Timesheet existiert, Frontend nutzt sie nicht vollständig** (POST/PUT/DELETE/submit/correct/prefill fehlen im UI)
3. **Create Submission erlaubt freie `org_id`/`supplier_org_id`** — Cross-Org-Risiko, Worker sollte das nicht senden müssen
4. **Fehlerzustände werden verschluckt** (`catch(e) { console.error(e); }`)
5. **Einsatzportal-JS ist vollständig inline** — Wartbarkeitsproblem
6. **CSRF-Helper ist pro Seite dupliziert**
7. **Frontend-Statusmodell weicht teils von Backend ab** (Legacy `accepted_into_timesheet` vs. neue Status)
8. **Worker-Dokumente Public-/Review-Verknüpfung muss final geprüft werden**
9. **Kontakt & Hilfe enthält harte statische Regeln** ("Stundenzettel bis Freitag 18:00 Uhr" — kann je Kunde variieren)
10. **Keine browsernahen E2E-Tests** für Einsatzportal-UI

---

## Zielarchitektur Frontend

```text
frontend/public/einsatzportal-dashboard.html
frontend/public/einsatzportal-einsaetze.html
frontend/public/einsatzportal-plan.html
frontend/public/einsatzportal-stundenzettel.html   ← echte Erfassung
frontend/public/einsatzportal-benachrichtigungen.html
frontend/public/einsatzportal-kontakt.html
frontend/public/einsatzportal-profil.html
frontend/public/einsatzportal.css

frontend/public/js/workerPortal/portalApi.js       ← NEU
frontend/public/js/workerPortal/portalShell.js     ← NEU
frontend/public/js/workerPortal/portalStatus.js    ← NEU
frontend/public/js/workerPortal/dashboard.js       ← NEU
frontend/public/js/workerPortal/assignments.js     ← NEU
frontend/public/js/workerPortal/schedule.js        ← NEU
frontend/public/js/workerPortal/timesheets.js      ← NEU
frontend/public/js/workerPortal/notifications.js   ← NEU
frontend/public/js/workerPortal/profile.js         ← NEU
frontend/public/js/workerPortal/contact.js         ← NEU
```

---

## Zentrale Enterprise-Regel

```text
Worker liefert KEINE Organisationen als Wahrheit.
Backend leitet org_id, supplier_org_id, assignment_id aus Session + worker_assignment_link_id ab.
```

---

## WAVE EP-00 — Read-only Audit / Baseline

**Ziel:** Endgültige Baseline vor Patches.

**Aufgaben:**
1. Inventar aller Einsatzportal-Dateien
2. Inventar aller `/api/worker/*`-Routen (siehe Quelldokument Abschnitt 2.2)
3. Worker-Services inventarisieren (`workerService.js`, `workerSubmissionService.js`, `workerNotificationService.js`, `assignmentStaffingService.js`)
4. Relevante Tests inventarisieren
5. Aktuelle Defekte dokumentieren
6. **Keine Codeänderungen**

**Acceptance:** `docs/einsatzportal/EP_BASELINE.md` existiert. Geprüfte Dateien, APIs, Services, Tests, Blocker, Quick Wins, Risiken aufgelistet.

---

## WAVE EP-01 — Portal API / Shell / Error Handling

**Ziel:** Gemeinsame Einsatzportal-Basis schaffen.

**Aufgaben:**

1. `portalApi.js`:
   - `apiJson()` mit klarem Error-Mapping
   - `getCsrf()` (zentral, nicht pro Seite)
   - 401/403/404/409/422/429/500 Handling
   - CSRF-Retry-Mechanismus ODER klare CSRF-Fehlermeldung

2. `portalShell.js`:
   - `loadWorkerMe()`
   - Sidebar-User setzen
   - Unread Count laden
   - Logout
   - Gemeinsamer Toast
   - Gemeinsamer Error-State

3. `portalStatus.js`:
   - Submission Status Mapping (alle Status aus Statusmaschine)
   - Assignment Status Mapping
   - Document Status Mapping
   - Notification Type Mapping

4. Erste Seite migrieren: `einsatzportal-dashboard.html`

**Acceptance:**
- Dashboard nutzt gemeinsame Helper
- 401 leitet zu `worker-login.html`
- 403 zeigt Worker-Portal-Fehler oder leitet sauber
- Keine stillen Fehler

---

## WAVE EP-02 — Stundenzettel Native UI (Kern-Blocker!)

**Ziel:** `einsatzportal-stundenzettel.html` wird die echte Worker-Stundenzettel-Seite. `worker-timesheet.html` bleibt Redirect/Legacy, KEIN neuer Link dorthin.

**Aufgaben:**

1. **Alle Links zu `worker-timesheet.html` entfernen** (im neuen Portal)
2. Native Timesheet-Erfassungs-UI bauen:
   - Assignment auswählen
   - Woche wählen
   - Entwurf erstellen
   - 7 Tageszeilen anzeigen
   - Stunden / Überstunden / Pause / Schichtzeit / Notiz erfassen
   - Speichern, Löschen
   - Vollständigkeit prüfen
   - Submitten, Korrektur submitten
3. API vollständig verdrahten:
   ```
   POST /api/worker/submissions
   GET /api/worker/submissions/:id
   GET /api/worker/submissions/:id/prefill
   PUT /api/worker/submissions/:id/entries
   DELETE /api/worker/submissions/:id/entries/:entryId
   POST /api/worker/submissions/:id/submit
   POST /api/worker/submissions/:id/correct
   ```
4. Backend anpassen: `POST /worker/submissions` leitet `org_id`/`supplier_org_id`/`assignment_id` serverseitig aus `worker_assignment_link_id` ab. Compatibility Mode nur temporär.
5. Frontend-Validierung — aber Backend bleibt Wahrheit
6. Deep Links: `?id=...` öffnet Detail/Edit, `?link_id=...` öffnet Create

**Acceptance:**
- Worker kann Stundenzettel vollständig im Einsatzportal anlegen
- Entwurf fortsetzen funktioniert
- Korrektur einreichen funktioniert
- Unvollständige Woche zeigt konkrete fehlende Tage
- Nach Submit ist Bearbeitung gesperrt
- Bei `needs_correction` ist Bearbeitung wieder möglich

> **Das ist der wichtigste Block dieser ganzen Welle.**

---

## WAVE EP-03 — Backend Hardening Submission Create

**Ziel:** Cross-Org-Risiko entfernen.

**Aufgaben:**
1. `createSubmissionSchema` ändern:
   - `org_id` und `supplier_org_id` NICHT mehr als normale Worker-Eingabe verlangen
   - `worker_assignment_link_id` wird Hauptanker
2. Server liest aus Link:
   - Worker, Assignment
   - `org_id`, `supplier_org_id`, `assignment_id`
3. Prüfen:
   - Link gehört zu Worker
   - Link aktiv
   - Assignment aktiv oder zulässig
   - Woche liegt im Assignment-Zeitraum (oder bewusst erlaubt)
4. Duplicate Week pro Worker/Assignment/Woche absichern
5. Tests aktualisieren

**Acceptance:**
- Worker kann keine fremde `org_id` einschleusen
- Negative Cross-Org-Tests bestehen

---

## WAVE EP-04 — Einsätze / Plan finalisieren

**Ziel:** Assignments und Schedule konsistent.

**Aufgaben:**
1. `einsatzportal-einsaetze.html` auf gemeinsame Helper migrieren
2. `einsatzportal-plan.html` auf gemeinsame Helper migrieren
3. Assignment-Status einheitlich: `pending confirmation`, `confirmed`, `declined`, `unavailable`, `active`, `completed`, `cancelled`
4. Aktionen: bestätigen, ablehnen mit Grund, unavailable melden
5. Schedule: Wochenansicht, aktive Einsätze, Schichtzeiten, leere Tage
6. Konflikte und leere Daten sauber anzeigen

**Acceptance:**
- Worker sieht nur eigene Einsätze
- Bestätigen/Ablehnen funktioniert
- Unavailable benachrichtigt Dispatcher
- Plan konsistent mit Assignment

---

## WAVE EP-05 — Notifications / Staffing Requests / Choice Sets

**Ziel:** Benachrichtigungen als Handlungshub.

**Aufgaben:**
1. `einsatzportal-benachrichtigungen.html` auf Helper migrieren
2. Mark read / read all robust
3. Staffing Requests: akzeptieren, ablehnen, Frage stellen, später erinnern
4. Choice Sets: Präferenz, Ranking, Option wählen, alles ablehnen
5. Alle Aktionen mit klaren 409/403/404-Fehlern
6. Notification wird nach Aktion konsistent aktualisiert

**Acceptance:**
- Worker bearbeitet Staffing Requests vollständig
- Choice Set Mode korrekt respektiert
- Keine doppelte Aktion nach Statuswechsel

---

## WAVE EP-06 — Profil / Dokumente / Nachweise

**Ziel:** Worker-Profil und Dokumente enterprise-fähig.

**Aufgaben:**
1. `einsatzportal-profil.html` auf Helper migrieren
2. Profil speichern robust
3. Dokumentupload robust: CSRF, Dateityp, Größe, Fehleranzeige
4. Dokumentliste: Status, Ablaufdatum, Ablehnungsgrund, Download, Löschen nur wenn erlaubt
5. Public Worker Profile-Verknüpfung prüfen
6. Backend prüfen:
   - Download autorisiert
   - Verifizierte Dokumente gegen Worker-Self-Delete gesperrt
   - Keine direkten Public-File-Links

**Acceptance:**
- Worker kann Nachweise hochladen
- Worker sieht Review-Status
- Worker kann verifizierte Dokumente nicht selbst löschen
- Download nur für eigene Dokumente

> **Querverweis:** Bei Public-Profile-Verknüpfung beachte Track A WAVE M-08 (Marketplace Public Profile).

---

## WAVE EP-07 — Kontakt & Hilfe

**Ziel:** Kontaktseite ist assignment-/org-basiert, nicht statischer FAQ-Text.

**Aufgaben:**
1. `einsatzportal-kontakt.html` auf Helper migrieren
2. Kontakte aus Assignments anzeigen: Dispatcher, Ansprechpartner vor Ort, Kunde optional
3. Statische Hinweise entschärfen oder konfigurierbar machen:
   - Stundenzettel-Frist
   - Krankmeldung
   - AU-Regel
   - Notfallhinweise
4. FAQ in Worker-Sprache finalisieren
5. Optional: Support-Ticket an Disponent vorbereiten

**Acceptance:**
- Kontaktinformationen kommen aus echtem Assignment-Kontext
- Keine hart falschen Vertrags-/Fristregeln

---

## WAVE EP-08 — Dashboard finalisieren

**Ziel:** Dashboard ist echte operative Worker-Startseite.

**Aufgaben:**
1. Gemeinsame Helper vollständig nutzen
2. KPIs fachlich korrigieren:
   - aktive Einsätze, offene Bestätigungen, Korrekturen, Entwürfe, Dokumentaktionen
3. Hero-Karte: nächster/aktiver Einsatz, Start, Ort, Schichtzeit, CTA
4. Diese Woche: Stundenzettelstatus, Entwurf fortsetzen, Korrektur, neu anlegen
5. Dokument-Hub: verifiziert, in Prüfung, fristkritisch, Aktion nötig

**Acceptance:**
- Dashboard führt zu richtigen Handlungen
- Keine Sackgassen
- Keine Phantom-KPIs

---

## WAVE EP-09 — E2E / Smoke / Negative Tests

**Ziel:** Reife beweisen.

**Pflicht-Tests:**
1. Worker Login → Dashboard
2. Worker sieht nur eigene Assignments
3. Worker erstellt Stundenzettel aus Assignment
4. Worker füllt 7 Tage
5. Unvollständige Woche blockiert
6. Complete Week Submit
7. Editing after submit blockiert
8. Correction flow
9. Document upload/download/delete
10. Staffing request accept/decline
11. Choice Set respond
12. **Cross-Org negative:** fremde Submission, fremdes Assignment, fremdes Dokument, fremde Notification

**Befehle:**
```bash
cd api && npm run test:integration -- worker
npx playwright test einsatzportal
```

**Acceptance:**
- API-Tests bestehen
- Browser-Smoke besteht
- Keine kritischen Console Errors

---

## WAVE EP-10 — Accessibility / Mobile / Final Cleanup

**Ziel:** Worker-taugliche Mobile- und A11y-Reife.

**Aufgaben:**
1. Modale/Drawer tastaturfähig
2. Formfehler feldnah
3. Buttons min. 44px Touch-Ziel
4. Loading/Disabled States
5. Keine Browser-Alerts in Kernaktionen
6. Inline-JS reduzieren (Migration auf neue JS-Module abschließen)
7. Redirect-only Dateien kommentieren
8. `worker-timesheet.html` als Legacy belassen, aber keine neuen Links dorthin

**Acceptance:**
- Worker kann Portal mobil bedienen
- Stundenzettel-Erfassung mobil realistisch
- Keine Legacy-Sackgassen

---

## Definition of Done (90% Reife)

Aus Quelldokument Abschnitt 9 — 20 Akzeptanzkriterien:

1. Worker Login funktioniert und erzwingt Worker-Rolle
2. Alle Einsatzportal-Seiten nutzen Worker-only APIs
3. Worker sieht ausschließlich eigene Daten
4. Dashboard zeigt echte operative Handlungen
5. Einsätze können bestätigt/abgelehnt/unavailable gemeldet werden
6. Einsatzplan zeigt eigene Schichten wochenbasiert
7. **Stundenzettel im Einsatzportal nativ erstellt/bearbeitet/eingereicht**
8. Entwurf/Submit/Korrektur/Kundenstatus/Abrechnungstatus verständlich
9. **Worker kann keine fremden org_id einschleusen**
10. Nachweise sicher hochladbar/prüfbar/herunterladbar
11. Notifications und Staffing Requests handlungsfähig
12. Choice Sets funktionieren je Modus
13. Kontaktinformationen aus Assignment-Kontext
14. Statische Hilfe-Texte nicht hart falsch
15. CSRF-Fehler/401/403/409/422/500 sichtbar behandelt
16. Backend-Integrationstests bestehen
17. Neue Cross-Org-Negativtests bestehen
18. Browser-Smoke besteht
19. **Keine neuen Links zu Legacy-`worker-timesheet.html`**
20. Mobile Worker-Nutzung realistisch möglich

---

## Abschlussbericht-Format pro Welle

```
Wave: EP-XX
Geprüfte Dateien:
Geänderte Dateien:
Betroffene APIs:
Rollen-/Org-Scope-Auswirkung:
CSRF-Auswirkung:
Audit-Auswirkung:
Tests (Befehl + Ergebnis):
Manuelle Prüfschritte:
Offene Risiken:
Nächste Wave:
```

---

## Wichtigster erster Block

```text
1. Native Stundenzettel-Erfassung in einsatzportal-stundenzettel.html (EP-02)
2. Keine Links mehr zu worker-timesheet.html
3. Backend-Härtung: org_id ableiten statt Worker-Eingabe (EP-03)
4. Negative Cross-Org-Tests
```

Wenn nur diese vier Schritte erledigt werden, ist das Einsatzportal schon bei ca. 82-85% Reife.
