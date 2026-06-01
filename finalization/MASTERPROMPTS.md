# Phase 4 — Masterprompts pro Track

> Drei Start-Prompts. Einer pro Track. Niemals zwei Tracks in derselben Session.

---

## Track A — Marketplace Visibility Center (Voller Prompt)

```text
Du arbeitest im Repository TempConnect auf dem Branch release/enterprise-premium-market-ready (oder feature/marketplace-visibility-center).

Lies ZUERST in dieser Reihenfolge:
1. CLAUDE.md (Repo-Root)
2. finalization/00_RULES.md (Phase 1 Regeln)
3. finalization/phase4_vertical/README.md (Übersicht Phase 4)
4. finalization/phase4_vertical/TRACK_A_MARKETPLACE.md (13 Wellen M-00 bis M-13)
5. finalization/phase4_vertical/CROSS_CUTTING.md (Kollisionen mit anderen Tracks)
6. finalization/phase4_vertical/MANUAL_TASKS.md (was du NICHT entscheiden kannst)
7. finalization/phase4_vertical/GATES.md Track-A-Gate

Ziel:
Baue das Marketplace Visibility Center als premium B2B-Feature für Individuell-/PRO-/Enterprise-Kunden.

Leitprinzipien (nicht verhandelbar):
- Kein Social-Media-Gimmick. Professionelles B2B-System.
- Public Visibility ist OPT-IN, default OFF.
- Bewertungen NUR nach FINALIZED Deal.
- Rankings nicht nur auf Likes basieren (max 5% Like-Gewicht).
- Bountys NIE automatisch aktiv — immer Staff-Freigabe mit Step-up.
- Keine personenbezogenen Trackingdaten öffentlich.
- Kein Review-Farming, kein Like-Kauf, kein pay-to-win.
- Feature-Gating im BACKEND, nicht nur Frontend.
- Inkrementell, nicht Big-Bang.

Plan-Modell (verbindlich):
DEMO / BASIS / PLUS / PRO / INDIVIDUELL.
NOTDIENST ist Legacy-Alias → via normalizePlanKey() mappen.

Datenschutz:
- IP/User-Agent NUR gehasht (Server-Salt), niemals klartext, niemals ausliefern
- Aggregationen im Kunden-Dashboard, keine fremden Klaridentitäten
- DSGVO-konform

Arbeite Wave für Wave:
M-00 Audit (read-only)
M-01 Feature-Gates erweitern
M-02 Datenmodell-Migration (8 Tabellen)
M-03 Backend Services (5 Services)
M-04 Backend Routes (5 Bereiche)
M-05 Bewertungssystem härten
M-06 SCC-Modul marketplace-visibility
M-07 Staff Backend Routes
M-08 Public Profil aufwerten
M-09 Kunden-Dashboard "Profilreichweite"
M-10 Bounty/Promotion-System
M-11 Missbrauchsschutz
M-12 Audit / Observability / Tests
M-13 Dokumentation + Go-Live

Nach jeder Wave liefere:
- Geänderte Dateien
- Neue Migrationen
- Neue API-Endpunkte
- Tests (Befehl + Ergebnis)
- Audit-Auswirkung
- Datenschutz-Auswirkung
- Manuelle Aufgaben für Owner
- Score-Auswirkung
- Nächste Wave

Pflichtchecks:
cd api && npm run test
cd api && npm run lint
cd frontend && npm run build:scc
cd frontend && npm run typecheck

Endzustand: Track-A-Gate aus GATES.md grün (alle 18 Kriterien).

Beginne mit M-00.
```

---

## Track B — Einsatzportal Enterprise-Reife (Voller Prompt)

```text
Du arbeitest im Repository TempConnect auf dem Branch release/enterprise-premium-market-ready.

Du finalisierst AUSSCHLIESSLICH das Einsatzportal auf Enterprise-Reife von ca. 90 Prozent.

Lies ZUERST:
1. CLAUDE.md
2. finalization/00_RULES.md
3. finalization/phase4_vertical/README.md
4. finalization/phase4_vertical/TRACK_B_EINSATZPORTAL.md (11 Wellen EP-00 bis EP-10)
5. finalization/phase4_vertical/CROSS_CUTTING.md
6. finalization/phase4_vertical/GATES.md Track-B-Gate

Aktuelle Reife: 68-72%. Ziel: 90%.

Arbeite NICHT am gesamten Produkt — nur am Einsatzportal.

Betroffene Frontend-Dateien:
- frontend/public/einsatzportal-dashboard.html
- frontend/public/einsatzportal-einsaetze.html
- frontend/public/einsatzportal-plan.html
- frontend/public/einsatzportal-stundenzettel.html  ← KERN
- frontend/public/einsatzportal-benachrichtigungen.html
- frontend/public/einsatzportal-kontakt.html
- frontend/public/einsatzportal-profil.html
- frontend/public/einsatzportal.css
- frontend/public/worker-login.html
- frontend/public/worker-timesheet.html  ← Legacy, KEIN neuer Link dorthin
- frontend/public/worker-portal.html

Betroffene Backend-Dateien:
- api/routes/workerPortal.js
- api/services/workerService.js
- api/services/workerSubmissionService.js
- api/services/workerNotificationService.js
- api/services/assignmentStaffingService.js
- api/middleware/auth.js
- api/middleware/auditWrite.js
- api/app.js

Arbeitsregeln (nicht verhandelbar):
1. Frontend ist UX, Backend ist Sicherheit.
2. Worker darf NUR eigene Daten sehen.
3. Keine Mutation ohne CSRF.
4. KEINE Cross-Org-Manipulation über org_id, supplier_org_id, assignment_id oder documentId.
5. Stundenzettel müssen aus echten worker_assignment_links / assignments entstehen.
6. worker-timesheet.html ist Redirect/Legacy und darf NICHT mehr als aktives Erfassungsziel genutzt werden.
7. Keine großen Refactors ohne Tests.
8. Bestehende Integrationstests dürfen NICHT brechen.
9. Jede Welle braucht Abschlussbericht.

Wichtigster erster Umsetzungsblock (EP-02 + EP-03):
- Native Stundenzettel-Erfassung in einsatzportal-stundenzettel.html
- Keine Links mehr zu worker-timesheet.html
- POST/PUT/DELETE/submit/correct/prefill vollständig im Frontend nutzen
- Backend-Härtung: Worker liefert KEINE org_id/supplier_org_id
- Backend leitet ab aus worker_assignment_link_id
- Negative Cross-Org-Tests

Arbeite Wave für Wave:
EP-00 Read-only Audit
EP-01 Portal API / Shell / Error Handling
EP-02 Stundenzettel Native UI (KERN-Blocker!)
EP-03 Backend Hardening Submission Create
EP-04 Einsätze / Plan
EP-05 Notifications / Staffing / Choice Sets
EP-06 Profil / Dokumente / Nachweise
EP-07 Kontakt & Hilfe
EP-08 Dashboard
EP-09 E2E / Smoke / Negative Tests
EP-10 Accessibility / Mobile / Final Cleanup

Abschlussbericht pro Wave:
- Gelesene Dateien
- Geänderte Dateien
- Betroffene APIs
- Rollen-/Org-Scope-Auswirkung
- CSRF-Auswirkung
- Audit-Auswirkung
- Tests (Befehl + Ergebnis)
- Manuelle Prüfschritte
- Offene Risiken
- Nächste Wave

Endzustand: Track-B-Gate aus GATES.md grün (alle 20 Kriterien).

Beginne mit EP-00.
```

---

## Track C — Terminologie-Umbenennung (Voller Prompt)

```text
Du arbeitest im Repository TempConnect auf dem Branch feature/terminology-rename (eigener Branch wegen Cross-Cutting).

Ziel:
Die Plattform sprachlich deutlich verständlicher, kundenfreundlicher und rollenlogisch sauberer machen.

Lies ZUERST:
1. CLAUDE.md
2. finalization/00_RULES.md
3. finalization/phase4_vertical/README.md
4. finalization/phase4_vertical/TRACK_C_TERMINOLOGY.md (13 Phasen 0-12)
5. finalization/phase4_vertical/CROSS_CUTTING.md
6. finalization/phase4_vertical/GATES.md Track-C-Gate
7. finalization/phase4_vertical/MANUAL_TASKS.md Track-C-Abschnitt

WICHTIG:
Es geht primär um UI-/UX-Texte, Navigation, Labels, Buttons, Tooltips, Empty States, Hilfetexte, Dashboard-Karten, Page-Titles, Breadcrumbs, rollenabhängige Begriffe.

Es geht NICHT um:
- DB-Felder, API-Routen, interne Enums, Migrationen, Service-Namen
- Globale Find-and-Replace-Aktionen ohne Kontextprüfung

Regeln (nicht verhandelbar):
- Keine technischen Begriffe im UI lassen, wenn sie für Kunden missverständlich sind
- Keine Fachlogik zerstören
- Keine API-Kompatibilität brechen
- Keine Datenbankmigration nur wegen UI-Sprache
- Jede Änderung ist UI-Text-Änderung, NICHT technische Änderung
- Im Zweifel: nicht ändern, dokumentieren

Rollen-Glossar (verbindlich):
- Unternehmen / Company: "Personal finden" / "Arbeitsplatz anbieten"
- Zeitarbeitsfirma / Agency: "Arbeitsplatz finden" / "Personal einstellen"
- Worker / Mitarbeiter: "Einsätze" / "Arbeitsplatz" / "Verfügbarkeit"
- Staff / SCC / OCC / SOC: "Vermittlungsbereich" (intern kann technisch bleiben)

Begriffsmatrix:
| Alt | Company-UI | Agency-UI | Bleibt intern |
| Marktplatz | Personal finden | Arbeitsplatz finden | marketplace.html |
| Bedarf einstellen | Arbeitsplatz anbieten | n/a | requisitions.html |
| Bedarfe | Arbeitsplatzangebote | Arbeitsplatzangebote | requisitions table |
| Kapazität einstellen | n/a | Personal einstellen | capacity_search.html |
| Kapazitäten | Verfügbares Personal | Verfügbares Personal | capacity table |
| Requisition | Arbeitsplatzangebot | Arbeitsplatzangebot | API /api/requisitions |

Arbeite Phase für Phase:
Phase 0  Read-only Inventar (TERMINOLOGY_RENAME_AUDIT.md)
Phase 1  Begriffsleitfaden (TERMINOLOGY_GUIDE.md)
Phase 2  Rollenabhängige UI-Labels implementieren
Phase 3  Unternehmensansicht überarbeiten
Phase 4  Personaldienstleister-Ansicht überarbeiten
Phase 5  "Marktplatz"-Begriff plattformweit entschärfen
Phase 6  "Bedarf"-Begriff kontextualisieren
Phase 7  "Kapazität"-Begriff kontextualisieren
Phase 8  Dashboards, KPI-Karten, Navigation
Phase 9  E-Mails, Notifications, Audit, Support-Texte
Phase 10 Routen / Dateinamen / technische Kompatibilität
Phase 11 Tests und Regression
Phase 12 Dokumentation

Nach jeder Phase liefere:
- Geprüfte Dateien (Liste)
- Geänderte UI-Strings (Vorher/Nachher)
- Bewusst NICHT geänderte technische Stellen
- Rollenmatrix-Auswirkung
- Tests/Checks (Befehl + Ergebnis)
- Offene Risiken
- Nächste Phase

Pflichtchecks:
cd frontend && npm run lint
cd frontend && npm run typecheck
cd frontend && npm run build
cd api && npm run test

Wenn ein Build vorher rot war:
"vorher rot / nachher nicht verschlechtert" dokumentieren.

Endzustand: Track-C-Gate aus GATES.md grün (alle 10 Kriterien).

Beginne mit Phase 0.
```

---

## Track D — Notification Experience (Voller Prompt)

```text
Du arbeitest im Repository TempConnect auf dem Branch release/enterprise-premium-market-ready.

Lies ZUERST:
1. CLAUDE.md
2. finalization/00_RULES.md
3. finalization/phase4_vertical/README.md
4. finalization/phase4_vertical/TRACK_D_NOTIFICATIONS.md (11 Wellen N-00 bis N-10)
5. finalization/phase4_vertical/CROSS_CUTTING.md
6. finalization/phase4_vertical/GATES.md Track-D-Gate

Ziel:
Dreistufiges Benachrichtigungsmodell: Glocke = Quick-Preview, Cards = primäre Arbeitsführung, Activity Center = Historie.

Leitprinzipien (nicht verhandelbar):
- Bestehende Glocke ERHALTEN, zur Quick-Preview präzisieren. Kein neues Glockensystem.
- Glocke + Cards aus EINER kanonischen Summary-Quelle. Kein doppeltes Zählen.
- Bei 0 Notifications: Default UNVERÄNDERT (keine sichtbare 0, kein Dot, kein Layoutsprung).
- Jede relevante Notification braucht card_target ODER dokumentierten Fallback.
- Activity Center bleibt erhalten, wird NICHT ersetzt.
- Status synchronisiert (gelesen in Glocke = gelesen auf Card).
- Card-Labels Track-C-konform (Terminologie).
- Keine riesige Architekturänderung. Bestehende Logik zuerst nutzen.
- Badge-Zahlen können sensibel sein → Tenant-/Rollen-Scope.

Arbeite Wave für Wave:
N-00 Audit → N-01 Routing Layer → N-02 Datenmodell (additiv) → N-03 Summary Service →
N-04 APIs → N-05 Glocke Quick-Preview → N-06 Card-Badges → N-07 Navigation/Deep Links →
N-08 Card-Zuordnung pro Rolle → N-09 Activity Center "Zur Quelle" → N-10 Performance/Tests

Nach jeder Wave: Gelesene/Geänderte Dateien, APIs, Tenant-Auswirkung, Performance, Tests, Risiken, nächste Wave.

Pflichtchecks:
cd api && npm run test -- notification
cd frontend && npm run build

Endzustand: Track-D-Gate grün (9 Kriterien). Beginne mit N-00.
```

---

## Track E — Database / Migration / Hetzner (Voller Prompt)

```text
Du arbeitest im Repository TempConnect auf dem Branch release/enterprise-premium-market-ready.

Du bringst Datenbank-, Migrations-, Hetzner- und SCC-Betriebsreife auf 99% Enterprise Readiness.

Lies ZUERST:
1. CLAUDE.md
2. finalization/00_RULES.md
3. finalization/phase4_vertical/README.md
4. finalization/phase4_vertical/TRACK_E_DATABASE.md (13 Phasen DB-A bis DB-M)
5. finalization/phase4_vertical/CROSS_CUTTING.md
6. finalization/phase4_vertical/GATES.md Track-E-Gate
7. finalization/phase4_vertical/MANUAL_TASKS.md Track-E-Abschnitt

Oberste Direktive:
TempConnect soll mit zahlenden Kunden auf Hetzner oder Managed PostgreSQL professionell,
kontrolliert, auditierbar und wiederherstellbar betrieben werden.

Nicht verhandelbare Regeln:
- Kein produktiver Blindflug: keine Production-DB ohne bewiesenen Fresh-DB-Proof + Backup + Restore-Test.
- Keine gefährliche DB-Konsole im SCC: keine freie SQL, kein DROP/TRUNCATE/DELETE als Schnellaktion, keine Secrets im Frontend, keine Root-Shell.
- Bestehende Strukturen schützen: Migrationen NICHT blind löschen oder umsortieren.
- Keine blinde Idempotenz: IF NOT EXISTS nur wo fachlich korrekt.
- Keine Fake-Fertigmeldung: keine grünen SCC-Anzeigen ohne echten Check.

Das härteste Gate:
empty database → run all migrations → app starts → smoke tests pass

Arbeite in dieser Reihenfolge:
DB-A Migrationsinventur → DB-B Fresh-Database-Proof → DB-C Migration-Hardening →
Hosting-Entscheidung (Self-managed Hetzner vs Managed) → DB-E Hetzner Setup →
DB-F Managed-Bewertung → DB-I Backup/Restore/RPO/RTO → DB-G SCC Database Operations →
DB-H Migration Control im SCC → DB-K Monitoring/Performance → DB-J Security →
DB-L Tests → DB-M Dokumentation

Nach jeder Phase: Gelesene/Geänderte Dateien, Migrationen, Tests (Befehl+Ergebnis), Sicherheit, manuelle Aufgaben, Risiken, nächste Phase.

Pflichtchecks:
npm run db:reset:fresh && npm run db:migrate && npm run db:verify && npm run smoke
(falls Commands anders heißen: vorhandene nutzen + dokumentieren)

Frage nur bei: Hosting-Entscheidung-Bestätigung, fehlendem Hetzner-Token, Production-Migration-Freigabe.

Endzustand: kundenstufige Gates grün (Kleine/Mittlere/Große/Enterprise). Beginne mit DB-A.
Keine Fake-Fertigmeldung. Keine produktive DB ohne Backup. Keine Migration ohne Proof.
```

---

## Pro-Welle-Session-Start (kürzer)

Wenn du nur an einer spezifischen Welle/Phase arbeiten willst:

```text
Arbeite an [WAVE-NAME] aus finalization/phase4_vertical/[TRACK_A | TRACK_B | TRACK_C].md.

Lies vorher:
- CLAUDE.md
- finalization/00_RULES.md
- finalization/phase4_vertical/README.md
- Die spezifische Track-Datei (nur Abschnitt der Welle/Phase)

Liefere am Ende:
- Status pro Aufgabe (PASS / FAIL)
- Ausgeführte Befehle und Output
- Offene Blocker
- Empfehlung: weiter zu nächster Welle oder Blocker zuerst

Branch: [richtigen Branch nennen]
```

---

## Was diese Prompts bewirken

1. **Klare Track-Trennung** — keine versehentliche Vermischung
2. **Pflicht-Cross-Cutting-Lektüre** — Kollisionen werden gesehen, nicht ignoriert
3. **Plan-Modell verbindlich** (Track A) — keine Legacy-Plan-Halluzinationen
4. **Worker-only-Härtung** verbindlich (Track B) — Cross-Org-Risiken bewusst
5. **UI-Only-Disziplin** (Track C) — keine Breaking Changes durch versehentliche Find-Replace
6. **Owner-Entscheidungen ausgegliedert** — keine halluzinierten Pricing-Beschlüsse
