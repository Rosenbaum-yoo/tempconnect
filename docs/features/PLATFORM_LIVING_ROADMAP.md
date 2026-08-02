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
7. **Definition of Done je Welle** (aus dem Audit vom 2026-07-25, siehe
   [ENTERPRISE_AUDIT_2026-07-25.md](ENTERPRISE_AUDIT_2026-07-25.md) — diese vier Punkte
   waren in P2.2–P3.3 die tatsächlichen Lücken, obwohl die Suite grün war):
   - **RBAC explizit.** Org-Mitgliedschaft ist keine Berechtigung. Jede mutierende Route trägt
     `requirePermission(...)` + `requireScope(...)`. **Gegenprobe:** löst die neue Route etwas ab,
     muss sie mindestens so streng sein wie der alte Pfad — ein fehlender Guard macht keinen Test rot.
   - **Freigabe-Grenzen sind serverseitig, nicht per Default-Klausel.** Ein Query-Parameter darf
     eine Sichtbarkeits-Whitelist nie aufweiten. Whitelist als exportierte Konstante, in Liste
     **und** Detail-Guard verwendet.
   - **Beziehungs-Nachweis statt Formatprüfung.** Eine gültige UUID ist kein Zugriffsrecht:
     Aktionen über fremde Entitäten brauchen eine belegte Beziehung (z. B. echter Einsatz),
     und abgeleitete Fremdschlüssel kommen aus der DB, nie aus dem Request-Body.
   - **Beide Richtungen fertig.** Ein Feature, das etwas meldet/anstößt, braucht den Rückkanal
     (Empfänger-Sicht + Statusfortschritt), sonst ist es eine Einbahnstraße mit totem Endpunkt.

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
- **0.2 Stundenzettel-Cards klickbar.** ✅ **Als bereits erledigt verifiziert (2026-07-25) — kein Bau nötig.**
  Die Wochen-Cards tragen `onclick="selSub(...)"` (`einsatzportal-stundenzettel.html:459`), die
  Detail-Ansicht öffnet den Editor über „Weiter ausfüllen"/„Korrektur einreichen". Der Eintrag
  stammte aus dem Owner-Braindump und war zum Zeitpunkt der Aufnahme bereits überholt.
- **0.3 Stundenzettel im Einsatzportal bearbeitbar.** ✅ **Als bereits erledigt verifiziert (2026-07-25).**
  Editor vorhanden (`edSaveDraft()` → `PUT /worker/submissions/:id/entries`), und die
  Frontend-Freigabe deckt sich **exakt** mit dem Backend-Guard:
  `EDITABLE = ['draft','needs_correction']` ↔ `SUBMISSION_NOT_EDITABLE` im Service.
  Keine Drift zwischen Anzeige und Regel. *(Lehre: Braindump-Bugs vor dem Bau gegen den
  echten Code prüfen — hier hätte „Fix" doppelte Logik erzeugt.)*
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
  → **Nachgehärtet (2026-07-25, Audit-Befunde 1+2):** RBAC ergänzt (`timesheet.view/approve/reject`
  + Scopes — das Portal war schwächer geschützt als das Legacy-System, das es ablöst) und die
  **Freigabe-Grenze serverseitig geschlossen**: `?status=draft` konnte die Status-Whitelist
  aufweiten, die Detail-Route hatte gar kein Status-Gate → der Kunde konnte den internen
  Prüfstand der Agentur lesen. Jetzt `COMPANY_VISIBLE_STATUSES` als Single Source of Truth
  für Liste **und** Guard (404 statt 403 bei nicht freigegebenen Zetteln).
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
  → **Rückkanal ergänzt (2026-07-25, Audit-Befund 3):** die Meldung war eine Einbahnstraße —
  `GET /company/complaints` war ein toter Endpunkt, `status` wurde nie fortgeschrieben, die
  Agentur hatte keine Sicht. Jetzt beidseitig: **Käufer** sieht Tab „Meine Meldungen"
  (Dringlichkeit/Grund/Status/Datum + Filter, lädt nach dem Absenden sofort neu);
  **Agentur** sieht den Beschwerde-Eingang im Einsätze-Panel von `worker-submissions-review`
  — bewusst dort, weil die Antwort auf eine Meldung der Ersatz-Flow (1.1) ist: je Meldung
  „⇄ Ersatz zuweisen" (springt via `assignment_link_id` in den bestehenden Modal),
  „Angenommen", „Erledigt". Service `listSupplierComplaints` (strikt `supplier_org_id`,
  nutzt den Index aus Mig 150) + `updateComplaintStatus` (Org-Boundary IM UPDATE);
  Routen `GET/PATCH /workers/complaints` (`worker.view` / `worker.manage`).
  Status-Werte exakt wie der CHECK: `open | acknowledged | resolved`.
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
  → **Chef-Hinweis „gesperrt bei X" ergänzt (2026-07-25) — P3.3 damit abgeschlossen.** Bisher lief der
  Disponent erst beim Absenden in den 409-Guard. Jetzt sieht er die Sperre **vor** der Zuweisung:
  Service `listBlocksForSupplier` (aktive Sperren gegen die eigene Belegschaft, gescoped über
  `worker_profiles.supplier_org_id` — **nicht** über `blocklist.supplier_org_id`, das nur
  abgeleiteter Kontext und ggf. NULL ist; nutzt den in Mig 149 dafür angelegten
  `(worker_user_id)`-Index), Route `GET /workers/blocks` (`worker.view`).
  `listAssignableSourcesForDispatcher` liefert zusätzlich `client_org_id`, damit die UI die
  Sperren des **konkret gewählten Kunden** auflösen kann. Im Zuweisungs-Drawer werden gesperrte
  Kräfte bewusst **sichtbar deaktiviert** („— gesperrt bei diesem Kunden bis TT.MM.JJJJ") statt
  still ausgeblendet, plus Sammel-Hinweis mit Grund in der Info-Box — der Disponent soll den
  Grund sehen, nicht rätseln, warum jemand fehlt. Verifiziert: 2 neue Tests (Scoping-Form,
  Zero-State ohne Query) + transaktionaler DB-Smoke gegen echte Daten (Sperre angelegt →
  Hinweis mit Kundenname + Grund sichtbar → fremde Agentur sieht 0 → zurückgerollt),
  Route live 401.
  **Offen:** aktive Benachrichtigung an den Chef beim Sperren (heute Pull statt Push).
- **3.4 Arbeitsplatz-Aufträge perfektionieren.** Existiert bereits (`marketplace.js` demand_requests
  + `requisitions`) — Politur zur Perfektion.

## Phase 4 — Matching-Engine / KI + Activity Center ✅ **komplett (26.–27.07.2026)**

- **4.1 Bidirektionales Instant-Matching.** ✅ *Erledigt (Commit `994c77d`).* `matchTriggerService`
  ist der EINE Chokepoint: bidirektional (beide Seiten, nie nur die erstellende), Dedup über
  kanonischen `pair_key` + UNIQUE-Index (Mig 151), Empfänger aus der Rechte-Matrix
  (`findOrgMembersWithPermission` — benachrichtigt wird, wer handeln *darf*), fire-and-forget
  (ein Matching-Fehler darf nie ein Angebot scheitern lassen). Verdrahtet in **allen fünf**
  Erstellungspfaden: `capacityExchange` (Anlage + Aktivierung), `marketplace` (capacity_post +
  demand_request), `requisitions` (approve). Entwürfe lösen bewusst erst beim Aktivieren aus.
- **4.2 Match-Qualität erklärbar machen.** ✅ *Erledigt (Commit `c1494ea`)* — deterministische
  Baseline mit Begründungen als Grundlage für die KI-Schicht.
- **4.3 KI-Ranking (Claude API).** ✅ *Gebaut, per Flag AUS (Commit `9faba7b`, Messbarkeit in
  `1807fc3`).* Optionale Schicht über der Baseline; der deterministische Engine bleibt Fallback.
  **Owner-Gate zum Einschalten:** `ANTHROPIC_API_KEY` + Kosten-/Latenzrahmen.
- **4.4 Activity Center voll verdrahtet.** ✅ *Erledigt (Commit `aff8c55`)* — echte Ereignisse
  mit Sprungzielen statt Sackgassen.

> **Nachtrag zur Skill-Ebene (2026-08-01, Multi-Skill Welle 11):** Matching *und* Marktplatz-Filter
> verglichen Fähigkeiten als exakte Zeichenketten — „Seniorenpflege" traf „Altenpflege" nicht,
> obwohl im Katalog als Synonym hinterlegt (115 von 162 Einträgen betroffen). Behoben über
> `skillNormalizationService`; Details in
> [MULTI_SKILL_ANGEBOTSMANAGEMENT.md](MULTI_SKILL_ANGEBOTSMANAGEMENT.md).

## Phase 5 — Session/Auth-Härtung (Sicherheit + zukunftssicher + wirtschaftlich)

- **5.1 Session-Modell definieren + härten.** ✅ *Erledigt (2026-08-01).*

  **Was bereits gut war** (geprüft, bewusst nicht angefasst): Session-Rotation bei jedem
  Login (`req.session.regenerate` in `auth.js` 3× und `sso.js` 2× — verhindert
  Session-Fixation), Cookie-Flags (`httpOnly`, `sameSite` strict/lax, `secure`, getrennte
  Pfade für Plattform und Staff), Re-Authentifizierung mit Risikostufen (`requireMfa`,
  `staffControlAccess`), Staff-Session bereits auf 4 Stunden.

  **Die Lücke:** die Plattform-Session lief **14 Tage „rollend" ohne absolute Obergrenze** —
  wer alle 13 Tage einmal klickte, blieb unbegrenzt angemeldet. Eine einmal entwendete
  Sitzung wurde nie von allein ungültig. `express-session` kann das nicht: `maxAge` +
  `rolling` ergibt eine Leerlauf-Frist, kein Höchstalter.

  **Owner-Entscheidung (2026-08-01): Leerlauf 8 Stunden, absolut 7 Tage.** Ein Arbeitstag am
  Stück ist gedeckt — der Disponent wird nicht mitten in der Disposition abgemeldet —, aber
  eine gestohlene Sitzung ist spätestens nach einer Woche wertlos.

  Umgesetzt in `api/services/sessionSecurityService.js`: `IDLE_TIMEOUT_MS` (als `maxAge` in
  `app.js`), `enforceAbsoluteLifetime` als Middleware direkt hinter der Session,
  `stampSession` an **allen fünf** Login-Pfaden (nach `regenerate`, sonst wird der Stempel
  mitverworfen). Bestandssitzungen ohne Stempel werden beim ersten Zugriff **nachgestempelt
  statt hinausgeworfen** — ein Deploy, der alle Angemeldeten aussperrt, ist ein Ausfall, kein
  Sicherheitsgewinn.

  **Neu: Fernabmeldung.** `GET /api/auth/sessions` (Anzahl offener Sitzungen — ohne sie wäre
  der Knopf einer ins Leere) und `POST /api/auth/logout-all`. Die **aktuelle** Sitzung bleibt
  standardmäßig bestehen: der Normalfall ist ein verlorenes Gerät, und wer sich selbst
  aussperrt, kann nicht nachsehen, ob es geklappt hat (`include_current: true` beendet auch
  sie). Gefiltert wird über `sess->>'userId'` — ein gezielter Feldvergleich statt
  `sess::text LIKE '%<id>%'`, das auch Sitzungen trifft, in denen die Kennung nur *erwähnt*
  wird (etwa während einer Staff-Stellvertretung) und damit Unbeteiligte abmeldet.

  Verifiziert: 15 Tests; **live gegen die laufende Instanz** — Cookie-Laufzeit 336 h → 8,00 h,
  `createdAt` wird beim Login gesetzt, eine künstlich auf 8 Tage gealterte Sitzung antwortet
  `401 SESSION_EXPIRED` (dieselbe Sitzung war eine Sekunde vorher noch 200), und
  `logout-all` beendete 11 Fremdsitzungen, während die eigene weiterlief.

  **Offen:** dasselbe `LIKE`-Muster steckt noch in `dataGovernanceService.js` (DSGVO-Löschung)
  — eigener Task, weil es dort um Löschpfade geht. Oberfläche für die Fernabmeldung
  (Endpunkte stehen, Konto-Einstellungen noch nicht verdrahtet).

## Phase 6 — Internationalisierung (Deutsch/Englisch)

- **6.1 Sprach-Switch DE/EN.** i18n-Schicht (Key→Text, `de`/`en`), Umschalter im Header, Persistenz
  (User-Präferenz `preferred_locale` existiert bereits im Worker-Profil). Schrittweise Migration der
  UI-Strings; DE bleibt Default (DACH-Markt).

## Phase 7 — Visual/Media Layer (PREVIEW ZUERST)

- **7a Landing-Redesign.** KI-Bilder + Videos, **alternierendes Layout** (~½ Text/Beschreibung,
  ~½ KI-Bild, links/rechts abwechselnd). **Ablauf: erst Preview-Mockup, iterieren, dann bauen.**
  - **Preview-Mockup v1 erstellt (2026-08-02):** `docs/mockups/landing_preview_v1.html` —
    selbst-enthalten, Produktions-Token-Farbwelt, Hero + 4 alternierende Sektionen
    (Notdienst / Multi-Skill-Fan-out / Workflow / Vertrauen) + Pilot-CTA. Jedes Bild-Panel
    beschreibt das geplante KI-Motiv (inkl. Hero-Video „Der Anruf um 4:12 Uhr"), damit Layout
    UND Motive gemeinsam freigegeben werden. Trust-Leiste bewusst qualitativ — keine erfundenen
    Zahlen. **Status: Iteration mit Owner offen; erst nach Freigabe wird die echte
    `frontend/landing.html` angefasst.**
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

## Stand P0–P4 (Stand 2026-08-01)

| Welle | Status |
|---|---|
| P0 Bugs | ✅ 0.1 Kern / 0.2 + 0.3 **als bereits erledigt verifiziert** / 0.4 Kern — offen: TZ-Per-Case-Triage, CSV-Wizard-Politur |
| P1 Lifecycle & Ersatz | ✅ 1.1–1.4 komplett, 1.5 Monatsplan-PDF — offen: Stundenzettel-Planung-PDF (leeres Monatsraster) |
| P2 Stundenzettel-Workflow | ✅ 2.1–2.3 komplett + audit-gehärtet — offen: Legacy-`/timesheets` ausmustern, Käufer-Notification bei „gesendet" |
| P3 Unternehmens-Seite | ✅ 3.1–3.3 **komplett** (inkl. Beschwerde-Rückkanal + Chef-Hinweis) — offen: 3.4 Politur, Push-Benachrichtigung beim Sperren |
| P4 Matching / KI / Activity | ✅ **4.1–4.4 komplett** (26.–27.07.) — 4.3 per Flag AUS, Einschalten ist Owner-Gate (API-Key + Kostenrahmen) |
| P5 Session-/Auth-Härtung | ✅ **5.1 komplett** (01.08., Owner-Entscheidung: Leerlauf 8 h, absolut 7 Tage) — offen: Oberfläche für die Fernabmeldung, `LIKE`-Muster in `dataGovernanceService` |

Die verbleibenden Punkte sind bewusst klein geschnitten und einzeln lieferbar; keiner davon
blockiert die Nutzbarkeit der jeweiligen Welle. **Nächster substanzieller Block ist P6**
(i18n DE/EN) oder **P7** (Visual/Media) — P7 startet laut Leitprinzip 3 mit einem
**Preview-Mockup**, bevor irgendetwas an der Landing verändert wird.

> **Warum dieser Abschnitt jetzt anders aussieht (2026-08-01):** die Tabelle stand auf dem
> Stand vom 25.07. und nannte P4 als „nächsten Block" — obwohl P4 am 26./27.07. vollständig
> gebaut wurde. Die Lücke hat eine Sitzung zu einer falschen Empfehlung geführt, bevor sie
> auffiel. Eine Roadmap, die den eigenen Fortschritt nicht mitschreibt, ist schlimmer als
> keine: sie wirkt verbindlich und ist es nicht. Nach jedem abgeschlossenen Block gehört der
> Stand hier nachgezogen — dieselbe Regel wie in §0.12.

## Empfohlene Reihenfolge (Owner entscheidet)

**P0 Bugs** → **P1 Lifecycle/Ersatz** (größter Produktwert, nutzt meine Reserve-Infra) →
**P2 Stundenzettel-Workflow** → **P3 Unternehmens-Seite** → **P4 Matching/KI + Activity Center** →
**P5 Session-Härtung** → **P6 i18n** → **P7 Visual (Preview zuerst)**.

Jede Welle: bauen → Tests grün → live gegen echte App verifizieren → Docs aktualisieren → committen.
