# TempConnect — Living-Platform Roadmap (Arbeitsanweisung für Claude Code)

> Erstellt 2026-07-22 aus Owner-Braindump. **Status: Plan — noch nichts geändert.**
> Jede Welle wird erst nach Owner-Freigabe gebaut. Landing-Redesign startet mit einem
> **Preview-Mockup** vor jeder echten Änderung.

## 0 — Leitprinzipien (gelten für ALLE Wellen)

1. **DACH-first Zeit.** Alle Datums-/Zeitwerte in `Europe/Berlin`, nie roher UTC-Slice
   (`new Date().toISOString().slice(0,10)` ist der Bug-Generator). Eine zentrale
   `dateDE()`/`todayDE()`-Utility (Server + Client), `TZ=Europe/Berlin` im Container.
2. **Voll verdrahtet (Ripple-Pflicht).** Jede Zustandsänderung eines Einsatzes/Arbeiters
   propagiert **überall gleichzeitig**: Marktplatz-Sichtbarkeit, Einsätze, Live-Belegschaft,
   Stundenzettel, Angebote (Skills), Benachrichtigungen — zeitlich korrekt sortiert nach dem
   mitgesendeten Wirk-Datum.
3. **Upload vs. KI-Bild strikt getrennt.** Upload-Bereiche = ausschließlich echte Fotos
   (B2B kümmert sich selbst). KI-Bilder nur dort, wo **kein** Upload möglich ist **und** es
   Sinn ergibt (Landing, Kategorie-Bildwelt). Nie mischen.
4. **Zukunftssicher + psychologischer Effekt.** Live-Monitoring, Echtzeit-Feedback,
   „immer sichtbar was gerade passiert" — als Standard, nicht als Extra (siehe CLAUDE.md).
5. **Bugs zuerst.** Phase 0 vor allen Features.
6. **Token-effizient bauen.** Gezielt lesen (Ranges/Diffs), Bestehendes wiederverwenden,
   `docker restart tempconnect_api` statt Rebuild, Docs bei jeder Welle mitziehen.

---

## Phase 0 — Bugs zuerst (Quick Wins, hohe Sichtbarkeit)

- **0.1 Zeitzone DACH (Datum +/-1 Tag).** *Systemisch.* Ursache: UTC-Datumsbildung + DB/Container UTC.
  **✅ Erledigt (2026-07-22):** DB-Timezone `Etc/UTC` → `Europe/Berlin` (`ALTER DATABASE`, persistent);
  `TZ=Europe/Berlin` im API-Container (Compose, greift beim nächsten Recreate); Einsatzportal-
  Stundenzettel 8× `toISOString().slice(0,10)` → TZ-sicherer `ymd()` (lokale Komponenten);
  zentrale `api/utils/dateDE.js` (`todayDE`/`dateOnlyDE`) angelegt + in `capacityOfferGeneratorService`
  als Referenz verdrahtet.
  **🔶 Offen (kontrollierte Per-Case-Triage — NICHT blind sweepen):** ~40 server-seitige
  `toISOString().slice(0,10)`-Stellen einzeln prüfen. **Nutzersichtbare date-only-Defaults**
  (start_date/work_date/Fristen) → `todayDE()/dateOnlyDE()`. **Technische UTC-Buckets**
  (Analytics-Tagesaggregation, Idempotenz-/Dedup-Keys wie `eventKey`, `activeDays`) → **bewusst UTC
  lassen** (sonst brechen Dedup/Reports). Frontend-`toLocaleDateString` ist für Berlin-Browser korrekt.
- **0.2 Stundenzettel-Cards klickbar.** Die Wochen-Cards (KW 30 …) in
  `einsatzportal-stundenzettel.html` müssen anklickbar sein → Weiterleitung zum Ausfüllen/Detail.
- **0.3 Stundenzettel im Einsatzportal bearbeitbar.** Aktuell nicht editierbar — Bearbeiten-Flow
  reparieren (`workerPortal.js` Submissions `PUT /worker/submissions/:id/entries`, Frontend-Binding).
- **0.4 CSV-Import ↔ Einladung (Brücke).** 🔶 *Kern erledigt (2026-07-22):* Worker-Liste liefert
  `is_verified`; neue `listInvitableWorkers` (nicht-registriert + keine offene Einladung = kollisionsfrei);
  Route `POST /worker-invites/bulk`; UI: „Einladen"-Button je nicht-registriertem Worker (E-Mail
  vorbefüllt → 1 Klick) + „Alle einladen"-Button in der Toolbar. Live bewiesen: 3 eingeladen,
  2. Aufruf 0 (idempotent, keine Doppel-Einladung). *Offen:* tieferer CSV-Wizard-Bug-Review
  (Wizard funktioniert; Detail-Politur).

## Phase 1 — Assignment-Lifecycle & Ersatz (Herzstück, voll verdrahtet)

- **1.1 Ersatz bei Krankheit/Abbruch.** ✅ **Erledigt (2026-07-22) — Backend + Chef-UI end-to-end.**
  Chef weist ab **Wirk-Datum X** einen Ersatz-Arbeiter zu; der ausfallende Arbeiter wird ab X
  freigestellt. Ripple: Marktplatz (Ersatz raus, Ausfallender ggf. wieder rein), Einsätze,
  Live-Belegschaft, Stundenzettel (ab X neuer Zettel-Owner), Benachrichtigung an alle Beteiligten.
  Zeitlich sauber sortiert.
  → **Service** `workerService.replaceAssignmentWorker` (transaktional, Row-Lock, Guards: NOT_FOUND /
  LINK_NOT_ACTIVE / SAME_WORKER / REPLACEMENT_NOT_IN_ORG): stellt A frei (`unavailable_from=X`,
  `is_active=FALSE`, `worker_unavailable`) + legt Ersatz-Link B ab X bis Original-Enddatum an
  (Defaults/Enddatum/Rolle geerbt). Nutzt die vorhandene 073-Infrastruktur (kein Schema-Change).
  → **Route** `POST /worker-assignment-links/:id/replace` (`worker.manage`, `effective_date`+`reason`
  Pflicht, Audit mit `responsible_actor_user_id`). **Ripple auf Route-Ebene:** `syncWorkerReservation`
  für B (Angebote sofort raus) + A (Angebote reaktiviert) + Notifications (B: neuer Einsatz,
  A: `notifyAssignmentRemoved`). **Stundenzettel-Owner ab X = automatisch B** (Link-Split trennt nach
  Worker+Datum; bereits geleistete Tage von A vor X bleiben abrechenbar — keine Datenmigration).
  → **Chef-UI** in `worker-submissions-review` (Einsätze-Tab): Button „⇄ Ersatz zuweisen" auf jeder
  aktiven Einsatz-Karte (nur mit `workerEdit`-Recht) + Modal (Wirk-Datum, Ersatz-Arbeiter aus aktiver
  Belegschaft ohne den Ausfallenden, Grund-Pflicht) → `POST …/replace` mit CSRF, spezifische
  Fehlermeldungen, danach `loadAsgn()`-Refresh. `workerSubmissionsReview.js`, Vanilla, Design-Tokens.
  Verifiziert: 5/5 Service-Tests (Happy-Path + 4 Guards), EXPLAIN beider Writes gegen echtes Schema,
  voller transaktionaler Dry-Run mit realen Daten (A freigestellt, B ab X bis Enddatum) grün, Route
  live 403 (nicht 404), Chef-UI-JS syntaxgeprüft + live über nginx ausgeliefert.
- **1.2 Auto-Reappear nach Einsatz-Ende.** ✅ **Kern erledigt (2026-07-22).** Ist das Auftragsdatum
  abgelaufen (Folgetag), erscheint der Arbeiter wieder in der Live-Belegschaft, ist wieder zuweisbar,
  seine Skills sind wieder als Angebote verzeichnet. *Nutzt meine Hard-Reserve-Sweep-Infrastruktur*
  (`workerOfferReservationService` + `valid_until`) — erweitert statt neu gebaut.
  → `BUSY_EXISTS_SQL` ist jetzt **datum-bewusst**: reserviert nur, solange `wal.is_active = TRUE AND
  (end_date IS NULL OR end_date >= CURRENT_DATE)` (DB = Europe/Berlin). Am Folgetag nach `end_date`
  fällt die Reservierung weg → Angebot reaktiviert. Wichtig, weil `is_active` beim Einsatzende **nicht**
  automatisch bereinigt wird (live 10 aktive Links mit abgelaufenem `end_date` verifiziert). Zusätzlich
  `assignmentLifecycleService.todayIsoDate()` von UTC auf `todayDE()` umgestellt (korrekte active/expired-
  Einstufung). DB-Smoke gegen echtes Schema grün; 3/3 Reservation-Tests grün.
- **1.3 Marktplatz-Sichtbarkeit an Assignment gekoppelt.** ✅ **Kern erledigt (2026-07-22).** Zugewiesen
  → aus Marktplatz raus; fertig → wieder rein **mit allen** Skill-Angeboten. Der periodische Sweep
  koppelt Sichtbarkeit an den echten Assignment-Zustand; zusätzlich **Echtzeit-Trigger**: `POST
  /worker-assignment-links` ruft nach erfolgreicher Zuweisung `syncWorkerReservation(pool, worker.id)`
  (fire-and-forget, `swallow`-geguardet) → Angebote verschwinden **sofort**, nicht erst beim nächsten
  Maintenance-Lauf. (Der Release-Fall bleibt bewusst beim Datums-Sweep, da ihn kein User-Klick auslöst.)
- **1.4 Monats-/Vorausplanung.** ✅ **Erledigt (2026-07-22): Kollisions-Guard + Planungs-Timeline.**
  Chef plant je Arbeiter blockweise voraus (2 Wochen hier, dann dort, monatsweise) — mit Kollisions-/
  Datums-Check gegen Live-Belegschaft + Stundenzettel.
  → **Fundament (zukunftssicher, ein Chokepoint):** `workerService.findWorkerScheduleConflicts(db, worker,
  start, end, {excludeAssignmentId})` — EINZIGE Wahrheit für Überlappungserkennung (aktive Links,
  `worker_declined`/`worker_unavailable` ausgenommen, Selbst-Auftrag ausschließbar). Jetzt erzwungen in
  **allen** Erstellungspfaden: `createAssignmentLink` (neu, `allowOverlap`-Override für Zukunft),
  `replaceAssignmentWorker` (Ersatz B), und die 2 bestehenden Inline-Checks (`assignCapacityToWorker` +
  Direkt-Assign) darauf **umgestellt (DRY)** — Doppelbuchung ist an der Datenschicht unmöglich, Routen
  liefern `409 {conflicts}`. Verifiziert: 220/220 betroffene Tests grün (+3 neue), EXPLAIN + realer
  Daten-Smoke (fremder Auftrag → Konflikt gefangen, eigener Auftrag → 0). Blocklist (P3.3) hängt sich
  später an **denselben** Chokepoint → kein Umbau.
  → **Planungs-Timeline** in `worker-submissions-review` (Einsätze-Tab, Toggle „Karten | Planung"):
  Monats-Timeline je Arbeiter aus `allLinks` (rein clientseitig, kein neuer Endpoint), Blöcke
  farbcodiert nach Lifecycle (aktiv/geplant/endet/vergangen/freigestellt), Monatsrand-Clamping mit
  ‹/›-Übergangsmarkern, Wochenend-Raster + Heute-Marker, Monats-Navigation. „+ Block" je Arbeiter
  öffnet den **bestehenden guarded Assign-Flow** (Vorausplanung mit Kollisionsschutz). Verifiziert:
  isolierter Render-Test im Browser (3 Zeilen, 6 Blöcke, alle 5 Farbzustände, Positions-Mathematik
  exakt: BMW 1.–10.=0%/32.26%, Monatsübergänge korrekt geklemmt) — Screenshot bestätigt.
- **1.5 Downloads (PDF).** ✅ **Monatsplanung-PDF erledigt (2026-07-22); Stundenzettel-Template folgt.**
  Monatsplanung-PDF (abrechnungsrelevant) + Stundenzettel-Planung-PDF.
  → **Service** `workforceSchedulePdfService.renderMonthlyPlanPdf` (pdf-lib, Muster von
  `invoicePdfService`): Kopf (Org/Monat/Datum/Zähler), je Mitarbeiter eine Tabelle
  (Kunde | Von | Bis | Tage | Std/Tag), WinAnsi-sicher, **multi-page** mit „(Forts.)"-Umbruch.
  **Gleiche Datenquelle wie die Timeline** (`getAssignmentLinksForSupplier`) → PDF und Bildschirm
  konsistent. → **Route** `GET /supplier/plan/monthly.pdf?year=&month=` (`worker.view`, streamt als
  Attachment). → **UI:** „⭳ PDF"-Button in der Planungs-Timeline (lädt den angezeigten Monat).
  Verifiziert: reale Generierung (32 Mitarbeiter → valides 3-seitiges PDF, Leer-Fall sauber),
  pdf-lib-Reload bestätigt Seitenzahl, Route live 401 (nicht 404), api sauber. *Wiederverwenden:*
  vorhandener pdf-lib-Renderer.
  **Offen:** Stundenzettel-Planung-PDF (leeres Monats-Zeitraster je Arbeiter) — gleiche Service-Basis.

## Phase 2 — Stundenzettel-Workflow Ende-zu-Ende

- **2.1 Einreichfrist + Lock.** ✅ **Erledigt (2026-07-22).** Frist zum Einreichen; nach Einreichen
  **keine** Worker-Edits mehr — nur wenn der Chef ablehnt und um Korrektur bittet, wird der Zettel
  wieder editierbar. (Status-Maschine: draft → submitted(lock) → correction_requested(unlock) → approved.)
  → **Lock war bereits vorhanden** (`upsertEntry`/`deleteEntry` → `SUBMISSION_NOT_EDITABLE`, nur bei
  draft/needs_correction editierbar) — verifiziert, nicht neu gebaut.
  → **Einreichfrist neu (weiche Frist, kein Hard-Block — geleistete Stunden dürfen nie blockiert werden):**
  Migration 148 (`submission_deadline` + `submitted_late`, Backfill = week_end+3, 5 Alt-Zettel korrekt als
  verspätet erkannt). `createSubmission` materialisiert die Frist (`TIMESHEET_DEADLINE_DAYS=3`, exportiert →
  später ohne Schema-Änderung auf Org-Setting umstellbar). `transition('submitted')` setzt `submitted_late`.
  Queries liefern `submission_deadline`/`submitted_late`/`is_overdue`. **UI:** Chef-Review-Liste zeigt
  „Überfällig"/„Verspätet"/„Frist DD.MM", Worker-Stundenzettel zeigt dasselbe. Verifiziert: 89/89 Tests
  grün (+1 neu), Migration + Backfill + Formel gegen echtes Schema, DB-Smoke der Queries.
- **2.2 Flow bis zum Unternehmen.** ✅ **Erledigt (2026-07-22): Käufer-Portal end-to-end (Option 1).**
  Einsatzportal → Zeitarbeitschef → **Unternehmen**: das Unternehmen empfängt + bestätigt/weist zurück
  selbst (Self-Service), statt dass die Agentur es stellvertretend erfasst.
  → **Backend** (auf dem echten `worker_time_submissions`-System): Router `companyTimesheets.js` mit
  `GET /company/submissions` (gescoped `wts.org_id = req.orgId` via `requireCompanyOrg`, Service
  `listCompanySubmissions`), `GET /:id`, `POST /:id/confirm|reject` (**wiederverwendet**
  `confirmByCustomer`/`rejectByCustomer`; Reject-Grund Pflicht; `requireCompanySubmission`-Guard gegen
  Cross-Org-IDOR; Audit). In `app.js` gemountet. → **Frontend** `company-timesheets.html` +
  `companyTimesheets.js`: **auto-gescopte** Käufer-Inbox (KEINE manuelle Org-ID mehr — behebt den
  gemeldeten „Zugang falsch"), KPIs, Status-Filter, Detail-Modal mit Tageseinträgen + Bestätigen/
  Zurückweisen (Grund-Prompt), vertrauensbildendes Banner. → **Legacy `timesheets.html`** bekam einen
  Wegweiser-Banner zum neuen Eingang; Nav-`match` in `pageShell.js` ergänzt.
  Verifiziert: 7/7 Route-Tests (Cross-Org=403, Zero-State, Scoping auf org_id NICHT supplier_org_id,
  Reject-Grund-Pflicht), DB-Smoke der Query, Routen live 401/403 (nicht 404), **Browser-Render im
  isolierten Harness bestätigt** (3 Zeilen, KPIs, Detail-Modal mit Einträgen + Aktionen) — Screenshot.
  **Offen:** Legacy-`timesheets.html`/`/timesheets`-Altsystem final ausmustern (eigener Task);
  Käufer-Notification bei „gesendet".
  → **Befund (wichtig):** Es gibt **zwei parallele Timesheet-Systeme.** (a) *Legacy* `timesheets.html` +
  `timesheets.js` → alter `/timesheets`-Endpoint (`timesheetService`, eigene Statusmaschine
  draft/submitted/approved) mit **manueller Eingabe von Org-ID + Supplier-Org-ID + Worker-Name (Freitext)**
  im Anlage-Modal — **das ist der „Zugang ist falsch"**: nicht auf die eingeloggte Org gescoped, Worker als
  Freitext statt echte Accounts. (b) *Echtes System* `worker_time_submissions` (`workerSubmissionService`,
  volle Käufer-Pipeline `approved_internal → sent_to_customer → customer_confirmed/rejected →
  posted_to_timesheet`), genutzt von Agentur (`worker-submissions-review`) + Worker (`einsatzportal-
  stundenzettel`). Die Kundenbestätigung erfasst heute die **Agentur** stellvertretend
  (`agencyPortal customer-confirm/-reject`, `requireOwnSubmission`).
  → **Bauplan Option 1 (auf dem echten System, Backend+Frontend zusammen — kein toter Endpoint):**
  (1) Käufer-gescopte Routen `GET /company/submissions` (Filter `sent_to_customer` + Historie, gescoped
  `wts.org_id = req.orgId` via `requireCompanyOrg`), `POST /company/submissions/:id/confirm|reject`
  (Guard `wts.org_id === req.orgId`, **wiederverwendet** `confirmByCustomer`/`rejectByCustomer`).
  (2) Service `listCompanySubmissions(pool, companyOrgId, filter)`. (3) Frontend: saubere, auto-gescopte
  Käufer-Inbox (KEINE manuelle Org-ID) mit Confirm/Reject + Detail. (4) Legacy `timesheets.html`
  retten/umleiten (nicht zwei Systeme nebeneinander). (5) Nav-Verdrahtung + Tests (fremde Org=403,
  Zero-State, valider Confirm/Reject). Verbindet sich mit **2.3/3.1** (Live-Belegschaft im selben Portal).
- **2.3 Live-Belegschaft für Unternehmen.** ✅ **Erledigt (2026-07-22) — deckt auch 3.1 ab.** Aktive
  Einsätze in Echtzeit überwachen: das Unternehmen sieht, wer gerade bei ihm arbeitet.
  → **Service** `workforceService.getCompanyLiveWorkforce(pool, companyOrgId)` — käufer-gescoped über
  `wal.org_id` (NICHT supplier_org_id), „aktuell" = aktiver Link + datum-gültig (start≤heute≤end) +
  Lifecycle active/ends_today (nutzt die geteilten Lifecycle-SQL-Helfer wie `getWorkerLiveBoard`),
  freigestellt/abgelehnt zählen nicht. KPIs (im Einsatz / endet bald / Zeitarbeitsfirmen). → **Route**
  `GET /company/live-workforce` (`requireCompanyOrg`, im Käufer-Portal-Router). → **UI:** neuer Tab
  „● Live-Belegschaft" im Käufer-Portal (`company-timesheets.html`): Tabelle (Mitarbeiter | Firma |
  Rolle | Schicht | Seit | Bis | Status), Live-KPIs, Suche.
  Verifiziert: **echte Funktion im api-Container gegen die DB** (6 im Einsatz, Agentur/Enddatum korrekt,
  Zero-State sauber), 8/8 Route-Tests (Scoping auf org_id), Route live 401, **Browser-Render im Harness
  bestätigt** (Tab-Umschaltung, 3 Zeilen, KPIs, Status-Badges), Konsole fehlerfrei.

## Phase 3 — Unternehmens-Seite (Monitoring, Beschwerden, Sperrliste)

- **3.1 Live-Verfolgung.** ✅ **Erledigt (2026-07-22) zusammen mit 2.3.** Gebuchtes Unternehmen sieht
  in Echtzeit, wer gerade bei ihm arbeitet (Live-Belegschaft aus Käufer-Sicht) → Tab „Live-Belegschaft"
  im Käufer-Portal, Service `getCompanyLiveWorkforce`. Siehe **2.3** für Details.
- **3.2 Beschwerde-Meldung.** ✅ **Erledigt (2026-07-22).** Unternehmen meldet Problem mit Arbeiter →
  Benachrichtigung an Zeitarbeitsfirma → Ersatz anfragen (verknüpft mit 1.1).
  → **Migration 150** `worker_complaints` {company, worker, supplier, assignment_link, severity, reason,
  status} + Notification-Typ `worker_complaint_filed`. → **Service** `companyComplaintService`
  (fileComplaint löst Agentur + Disponent aus dem aktuellen Einsatz auf; listCompanyComplaints).
  → **Route** `POST/GET /company/complaints` (`requireCompanyOrg`, org-gescoped, Grund+Severity-Validierung,
  Audit). Benachrichtigt den **Disponenten** (`notifyComplaintToDispatcher`) → dieser kann via P1.1
  Ersatz stellen. → **UI** im Käufer-Portal: „Melden"-Aktion je Live-Kraft + Modal (Dringlichkeit low/
  medium/high + Grund). Verifiziert: 16/16 Route-Tests (Validierung, Scoping auf company, Dispatcher-
  Benachrichtigung), Migration angewendet, **fileComplaint transaktional gegen echte Daten** (Kontext
  löst Agentur+Disponent korrekt auf, INSERT sauber), Routen live 401/403, **Browser-Render bestätigt**
  (Melden-Button + Modal + Submit schließt), Konsole fehlerfrei.
- **3.3 Sperrliste.** ✅ **Erledigt (2026-07-22).** Negativ aufgefallene Arbeiter je Unternehmen
  sperrbar. Chef kann gesperrten Arbeiter diesem Unternehmen **nicht** zuweisen. Unternehmen
  entscheidet: nie / wieder in 3 Monaten / wieder frei.
  → **Migration 149** `company_worker_blocklist` {company, worker, supplier, reason, blocked_until|null};
  aktiv = `blocked_until IS NULL OR >= CURRENT_DATE`. → **Service** `companyBlocklistService`
  (isWorkerBlockedForCompany / list / block(upsert) / unblock). → **Guard am selben Chokepoint wie der
  Kollisions-Schutz:** `createAssignmentLink` + `replaceAssignmentWorker` lehnen gesperrte Kräfte mit
  `BLOCKED_BY_COMPANY` ab (Routen liefern 409 + reason/blocked_until). → **UI** im Käufer-Portal: Tab
  „Sperrliste" (Freigeben) + „Sperren"-Aktion je Live-Kraft mit Modal (dauerhaft / 3 Monate / Datum +
  Grund). Verifiziert: 137/137 Tests grün (+3 neue BLOCKED-Tests, +4 Blocklist-Route-Tests, Fixtures
  aktualisiert), Migration angewendet, **Guard-Query transaktional gegen echtes Schema** (aktive Sperre
  gefunden, abgelaufene ignoriert), Routen live 401/403, **Browser-Render bestätigt** (Sperrliste-Tab
  2 Einträge + Freigeben, Block-Modal mit Dauer-Optionen), Konsole fehlerfrei.
  **Offen:** Chef-Hinweis „gesperrt bei X" in der Zuweisungs-UI (nice-to-have) + Benachrichtigung an Chef.
- **3.4 Arbeitsplatz-Aufträge perfektionieren.** Existiert bereits (`marketplace.js` demand_requests
  + `requisitions`) — Politur zur Perfektion.

## Phase 4 — Matching-Engine / KI + Activity Center

- **4.1 Bidirektionales Instant-Matching.** Bei Angebots- **und** Auftrags-Erstellung sofort gegen
  aktive Gegenseite matchen + beide Seiten benachrichtigen. Fast vorhanden (`matching.js`,
  `matchingEngine`, `match_alerts`) — Lücken schließen + zuverlässige Trigger.
- **4.2 KI-Augmentierung (Claude API).** Über den bestehenden Matching-Engine hinaus:
  semantisches Ranking der wahrscheinlichsten Treffer + kurze **Match-Erklärungen** („warum passt das").
  Umsetzung mit der Anthropic-API (Skill `claude-api` konsultieren), als optionale Ranking-Schicht
   vor den Benachrichtigungen — deterministischer Engine bleibt Fallback (Kosten/Latenz beachten).
- **4.3 Activity Center voll verdrahten.** Jede relevante Aktion erzeugt ein Activity-/
  Notification-Event (Ripple aus Phase 1–3 einspeisen). *Wiederverwenden:* `activityFeedService`,
  `notificationMatrix`, `notificationSurfaceMap`.

## Phase 5 — Session/Auth-Härtung (Sicherheit + zukunftssicher + wirtschaftlich)

- **5.1 Session-Modell definieren + härten.** Empfehlung (Details im Report): **Multi-Tab = eine
  geteilte Session** (Standard, gut), **Fenster schließen ≠ Logout** (Session-Cookie ohne
  Persistenz loggt nur bei komplettem Browser-Schließen aus; für „hart" optional Idle-Timeout).
  Hinzu: absolute Session-Lebensdauer, **Idle-Timeout** (z.B. 30–60 min), **Re-Auth** für sensible
  Aktionen (Auszahlung/Rollentausch), Session-Rotation bei Login, „Alle Geräte abmelden".
  *Betroffen:* `middleware/auth.js`, `connect-pg-simple`-Sessionstore, Cookie-Flags.

## Phase 6 — Internationalisierung (Deutsch/Englisch)

- **6.1 Sprach-Switch DE/EN.** i18n-Schicht (Key→Text, `de`/`en`), Umschalter im Header, Persistenz
  (User-Präferenz `preferred_locale` existiert bereits im Worker-Profil). Schrittweise Migration der
  UI-Strings; DE bleibt Default (DACH-Markt).

## Phase 7 — Visual/Media Layer (PREVIEW ZUERST)

- **7a Landing-Redesign.** KI-Bilder + Videos, **alternierendes Layout** (~½ Text/Beschreibung,
  ~½ KI-Bild, links/rechts abwechselnd). **Ablauf: erst Preview-Mockup, iterieren, dann bauen.**
- **7b Upload-Bereiche (echt, KI-frei):** Profilfoto (Upload im **Einsatzportal**), Firmenfoto-Upload,
  Angebotsfoto-Upload. Alle drei strikt getrennt von KI-Bildern.
- **7c KI-Bilder nur wo kein Upload + sinnvoll** (Landing, Kategorie-Bildwelt). Klare Trennung.

## Phase 7c-Bonus — CSV-Import ↔ Einladung (harmonisieren)

- CSV-Import härten + Bug-Sweep.
- Nach Import: E-Mail **vorbefüllt** in die „Einladung senden"-Funktion → 1 Klick pro Arbeiter.
- **„Alle einladen"-Button** (nur noch-nicht-registrierte) — **keine Kollision** mit bereits
  angelegten/registrierten Mitarbeitern (Dedup über E-Mail/User-Status).
- CSV-Import und Einladungs-Flow als ein durchgängiges, harmonisches Erlebnis.

---

## Empfohlene Reihenfolge (Owner entscheidet)

**P0 Bugs** → **P1 Lifecycle/Ersatz** (größter Produktwert, nutzt meine Reserve-Infra) →
**P2 Stundenzettel-Workflow** → **P3 Unternehmens-Seite** → **P4 Matching/KI + Activity Center** →
**P5 Session-Härtung** → **P6 i18n** → **P7 Visual (Preview zuerst)**.

Jede Welle: bauen → Tests grün → live gegen echte App verifizieren → Docs aktualisieren → committen.
