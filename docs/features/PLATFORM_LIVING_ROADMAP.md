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

- **1.1 Ersatz bei Krankheit/Abbruch.** Chef weist ab **Wirk-Datum X** einen Ersatz-Arbeiter zu;
  der ausfallende Arbeiter wird ab X freigestellt. Ripple: Marktplatz (Ersatz raus, Ausfallender
  ggf. wieder rein), Einsätze, Live-Belegschaft, Stundenzettel (ab X neuer Zettel-Owner),
  Benachrichtigung an alle Beteiligten. Zeitlich sauber sortiert.
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
- **1.4 Monats-/Vorausplanung.** Chef plant je Arbeiter blockweise voraus (2 Wochen hier, dann
  dort, monatsweise) — mit Kollisions-/Datums-Check gegen Live-Belegschaft + Stundenzettel.
- **1.5 Downloads (PDF).** Monatsplanung-PDF (abrechnungsrelevant) + Stundenzettel-Planung-PDF.
  *Wiederverwenden:* vorhandener PDF-Renderer (`agreementDocumentService`-Muster).

## Phase 2 — Stundenzettel-Workflow Ende-zu-Ende

- **2.1 Einreichfrist + Lock.** Frist zum Einreichen; nach Einreichen **keine** Worker-Edits mehr —
  nur wenn der Chef ablehnt und um Korrektur bittet, wird der Zettel wieder editierbar.
  (Status-Maschine: draft → submitted(lock) → correction_requested(unlock) → approved.)
- **2.2 Flow bis zum Unternehmen.** Einsatzportal → Zeitarbeitschef → **Unternehmen**: definieren,
  wo/wie das Unternehmen Stundenzettel entgegennimmt (Freigabe/Prüfung aus Käufer-Sicht) — inkl.
  klarer, vertrauensbildender Unternehmens-Ansicht.
- **2.3 Live-Belegschaft für Unternehmen.** Aktive Einsätze überwachen (siehe Phase 3.1).

## Phase 3 — Unternehmens-Seite (Monitoring, Beschwerden, Sperrliste)

- **3.1 Live-Verfolgung.** Gebuchtes Unternehmen sieht in Echtzeit, wer gerade bei ihm arbeitet
  (Live-Belegschaft aus Käufer-Sicht). *Wiederverwenden:* Worker-Live-Dispositionsboard (`workforce`).
- **3.2 Beschwerde-Meldung.** Unternehmen meldet Problem mit Arbeiter → Benachrichtigung an
  Zeitarbeitsfirma → Ersatz anfragen (verknüpft mit 1.1).
- **3.3 Sperrliste.** Negativ aufgefallene Arbeiter je Unternehmen sperrbar. Chef kann gesperrten
  Arbeiter diesem Unternehmen **nicht** zuweisen (+ Benachrichtigung). Unternehmen entscheidet:
  nie / wieder in 3 Monaten / wieder frei. (Neue Tabelle `company_worker_blocklist`
  {company, worker, reason, blocked_until|null}, Guard in der Zuweisung.)
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
