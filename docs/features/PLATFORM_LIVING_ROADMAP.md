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

- **0.1 Zeitzone DACH (Datum +1 Tag).** *Systemisch.* Ursache: UTC-Datumsbildung.
  Fix: zentrale `todayDE()` (Intl/`Europe/Berlin`), `TZ=Europe/Berlin` in Compose-Env,
  Client-Datumsanzeige lokalisieren. Betroffen u.a.: `capacityOfferGeneratorService.todayIso`,
  Stundenzettel/Wochenberichte, Einsatzportal-Anzeigen, alle date-only-Felder. *Verify:* alle
  `toISOString().slice(0,10)` + `new Date(...).toLocaleDateString` sweepen.
- **0.2 Stundenzettel-Cards klickbar.** Die Wochen-Cards (KW 30 …) in
  `einsatzportal-stundenzettel.html` müssen anklickbar sein → Weiterleitung zum Ausfüllen/Detail.
- **0.3 Stundenzettel im Einsatzportal bearbeitbar.** Aktuell nicht editierbar — Bearbeiten-Flow
  reparieren (`workerPortal.js` Submissions `PUT /worker/submissions/:id/entries`, Frontend-Binding).
- **0.4 CSV-Import härten + perfektionieren** (Detail siehe Phase 7c).

## Phase 1 — Assignment-Lifecycle & Ersatz (Herzstück, voll verdrahtet)

- **1.1 Ersatz bei Krankheit/Abbruch.** Chef weist ab **Wirk-Datum X** einen Ersatz-Arbeiter zu;
  der ausfallende Arbeiter wird ab X freigestellt. Ripple: Marktplatz (Ersatz raus, Ausfallender
  ggf. wieder rein), Einsätze, Live-Belegschaft, Stundenzettel (ab X neuer Zettel-Owner),
  Benachrichtigung an alle Beteiligten. Zeitlich sauber sortiert.
- **1.2 Auto-Reappear nach Einsatz-Ende.** Ist das Auftragsdatum abgelaufen (Folgetag), erscheint
  der Arbeiter wieder in der Live-Belegschaft, ist wieder zuweisbar, seine Skills sind wieder als
  Angebote verzeichnet. *Nutzt meine Hard-Reserve-Sweep-Infrastruktur* (`workerOfferReservationService`
  + `valid_until`) — erweitern statt neu bauen.
- **1.3 Marktplatz-Sichtbarkeit an Assignment gekoppelt.** Zugewiesen → aus Marktplatz raus;
  fertig → wieder rein **mit allen** Skill-Angeboten. (Erweitert `worker_reserved`-Sweep um den
  echten Assignment-Trigger, siehe „offener Punkt" aus [MULTI_SKILL_ANGEBOTSMANAGEMENT.md].)
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
