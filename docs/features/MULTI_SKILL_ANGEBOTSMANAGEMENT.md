# Multi-Skill Angebots-Management — Feature-Plan & USP

> **Status:** In Umsetzung · Welle 1–5 erledigt · **Welle 6: Deckungsvorschau erledigt** (2026-07-31)
> **Owner-Direktive:** Fester Bestandteil der Plattform und zentrale USP.
> **Leitprinzip:** Wenige Zeitarbeitsfirmen sollen sich für suchende Unternehmen
> anfühlen wie **tausende** — **ohne eine einzige Fake-Zeile**, allein durch echten
> Multi-Skill-Fan-out (1 Arbeiter mit N echten Skills = N+1 eigenständige Angebote).

Dieses Dokument ist die verbindliche Wahrheit für das Feature. Es wird bei jeder
Welle fortgeschrieben. Detail-Wahrheiten (Routen/Tabellen/Regeln) zusätzlich in
`.agents/skills/tempconnect-project/SKILL.md` verankert.

---

## 1. Vision & strategisches Ziel

TempConnect gewinnt mit wenigen Personaldienstleistern eine **massive Angebotsfülle**,
indem jeder reale Mitarbeiter über seine strukturierten Skills mehrfach — aber sauber
entdupliziert und anonymisiert — im Marktplatz erscheint. Zeitarbeitsfirmen können
einen Mitarbeiter gezielt auf **einzelne Skills**, als **Gesamtpaket** oder in
**Sammelangeboten** (viele Arbeiter) vermitteln und ihn dadurch schneller platzieren.

**Keine neue Kachel.** Die bestehenden Bereiche (Einsatzportal, Kapazitätsbörse,
Marktplatz, Mitarbeiterverwaltung, Suche) werden premium erweitert — psychologisch
ansprechend, verkaufsstark, auf dem bestehenden Design-System.

---

## 2. Kernprinzipien (verbindlich)

1. **Echte Multiplikation statt Fake.** Angebotsfülle entsteht ausschließlich aus
   realen, vom Arbeiter/Chef gepflegten Skills — nie aus erfundenen Daten.
2. **Anonym bis Deal.** Suchende Unternehmen sehen nur Skill(s) + Anzahl + anonymes
   Profil. Die Identität wird erst bei Zustandekommen des Deals freigegeben.
   (AGG-/DSGVO-konform, kein Diskriminierungs-Vektor.)
3. **Dedup-Regel.** Kein zweites **aktives** Einzelskill-Angebot pro Arbeiter+Skill.
   Gesamt-/Sammelangebote (`bundle`, `pool_*`) sind bewusst ausgenommen — ein
   Arbeiter darf gezielt einzeln **und** im Bündel angeboten werden.
   Durchgesetzt per partiellem Unique-Index (`capacity_posts_single_skill_unique_idx`).
4. **Hard-Reserve mit Ablauf.** Wird ein Arbeiter über ein Angebot eingestellt,
   werden konkurrierende Angebote gesperrt, bis der Einsatz endet (`valid_until`),
   danach automatische Reaktivierung. Keine Doppelbuchung.
5. **Erweitern statt neu bauen.** Wir nutzen vorhandene, teils schlafende
   Infrastruktur (siehe §4) — keine Parallelstrukturen.

---

## 3. Angebots-Typen-Matrix

| Verzeichnis-Typ (`offer_kind`) | Bedeutung |
|---|---|
| `single_skill` | 1 Arbeiter, 1 Skill (Einzelskillverzeichnis, anonym) |
| `bundle` | 1 Arbeiter, alle/mehrere Skills (Gesamtangebot, anonym) |
| `pool_single_skill` | viele Arbeiter mit **einem** gemeinsamen Skill (Sammelangebot) |
| `pool_multi_skill` | viele Arbeiter mit **mehreren** gemeinsamen Skills (Sammelangebot) |

Jeweils in vier Ausprägungen: **Standard / Notdienst** × **Normal / Premium**
(Premium = mehr Sichtbarkeit, wie bereits in Mig 133 `premium_listing` angelegt;
Notdienst in Mig 132 `capacity_notdienst`).

**Unternehmens-Seite (Nachfrage):** Firmen erstellen Bedarfsangebote (`demand`/
`requisitions`), die gezielt 1 oder mehrere Mitarbeiter mit 1 oder mehreren Skills
fordern — gematcht gegen den Skill-Katalog.

---

## 4. Datenmodell

### 4.1 Vorhandene Anker (wiederverwendet)
- `platform_skills` (Mig 023) — Skill-Katalog `name / category / aliases`; war bis
  Welle 1 **schlafend** (0 Verwendung). Jetzt befüllt + angebunden.
- `capacity_posts` (Mig 014/021) — Angebots-Tabelle mit `status` (inkl. `filled`),
  `priority_level` (normal/elevated/urgent → Premium/Notdienst), `valid_until`
  (→ Reservierungs-Ablauf), `visibility_status`, `placement_boost_level` (Mig 133).
- `worker_profiles` (Mig 029/074) — Arbeiter-Stammdaten + `skill_tags[]` (Freitext-Spiegel).
- `worker_invites` (Mig 029) — Einladungs-Token-System (Chef lädt Arbeiter ein).
- `staffing_reservations` u.a. (Mig 087/097) — Fundament der Reservierungs-Engine.

### 4.2 Neu in Welle 1 (Mig 145 `multi_skill_catalog`)
- **`worker_profile_skills`** — Join-Tabelle Arbeiter ↔ Katalog-Skill (Quelle der
  Wahrheit: `proficiency`, `years_experience`, `is_primary`, `certified`, `source`).
- **`capacity_posts`** add-only: `worker_profile_id`, `primary_skill_id`,
  `offer_kind`, `is_anonymous` (nullable = firmenweite „pauschal N Helfer"-Angebote
  bleiben gültig).
- **Dedup-Index** `capacity_posts_single_skill_unique_idx` (siehe §2.3).
- **Katalog-Seed:** 162 Skills über 14 Branchen.

---

## 5. Phasen & Wellen (der Fahrplan)

### Phase A — Fundament & Datenbasis
- **Welle 1 — Skill-Fundament** ✅ *erledigt (2026-07-19)*
  Skill-Katalog aktiviert + befüllt, `worker_profile_skills`, `GET /api/skills/catalog`,
  `GET/PUT /api/worker/me/skills`, Onboarding-Skill-UI im Einsatzportal, Tests grün.
- **Welle 2 — Premium-Onboarding-Wizard** ✅ *erledigt (2026-07-31)*
  Vollständiges, geführtes Aufnahme-Formular (Personendaten → Skills → Zertifikate →
  Verfügbarkeit), Pflichtfeld-Logik, Fortschrittsanzeige, „lange genug, damit alles
  Wichtige erfasst wird". Chef-Einladung → Worker füllt end-to-end.

  **Owner-Vorgabe (2026-07-31):** *„alles erfassen, aber die manuelle Eingabe auf das
  Minimum reduzieren"*. Das ist kein Widerspruch, sondern eine Rangfolge — **ableiten
  statt fragen**.

  **Der Befund, der den Zuschnitt bestimmt hat:** `worker_profiles` kannte für
  Verfügbarkeit nur `availability_note`, ein **Freitextfeld**. Daraus kann der
  Angebotsgenerator aus Welle 3 nicht rechnen — er erzeugte Angebote für Kräfte, von denen
  das System nicht wusste, ab wann sie können. Für eine USP, die auf Angebotsqualität
  beruht, ist das die Wurzel und nicht das Beiwerk.

  **Erledigt — die Ableitungsschicht (`api/services/workerAvailabilityService.js`):**
  drei Quellen in fester Rangfolge, jeder Wert kommt **mit seiner Herkunft** zurück:

  | Quelle | Bedeutung | Beispiel |
  |---|---|---|
  | `ausdruecklich` | jemand hat es hingeschrieben | Kraft sagt „ab 01.12." |
  | `abgeleitet` | aus den Einsatzverknüpfungen berechnet | letzter Einsatz endet 15.09. → ab 16.09. |
  | `geerbt` | Betriebseinstellung | `org_settings.default_radius_km` |
  | `unbekannt` | ehrliches Nichtwissen → wird zur **einen** Frage | neue Kraft ohne Historie |

  Die Herkunft ist kein Beiwerk: nur so zeigt der Assistent *„abgeleitet aus dem Einsatz
  bis 15.09."* statt eines leeren Feldes, und nur so sieht ein Disponent, ob „40 Stunden"
  eine Aussage oder eine Annahme ist.

  **Das messbare Ergebnis** (gegen die echte Datenbank geprüft):
  - **Bestandskraft: null Eingaben.** `ab 2027-09-12 (abgeleitet) · 40 Std (abgeleitet) ·
    25 km (geerbt) · offene Fragen: []`
  - **Neue Kraft: genau zwei Fragen** (ab wann, wie viel) — der Radius wird vom Betrieb
    geerbt und muss nie getippt werden.

  **Bewusst NICHT geraten:** bei einem laufenden Einsatz *ohne* Enddatum bleibt „verfügbar
  ab" unbekannt und wird zur Frage. Ein erfundenes „ab morgen" erzeugt Angebote, die die
  Agentur nicht halten kann — schädlicher als ein ehrliches Nichtwissen.

  **Bewusst NICHT gebaut:** ein Schichtmuster. Die Spalten `default_shift_start`/`_end`
  existieren, sind aber in **allen 21** Bestandszeilen leer. Eine Herleitung ohne
  Datenbasis wäre geraten, nicht gewusst. Sobald die Felder befüllt werden, gehört sie in
  denselben Dienst.

  Migration 157 (`available_from`, `weekly_hours`, `travel_radius_km` — alle **NULL-bar**,
  denn NULL heißt „nichts gesagt → ableiten"; ein Default-Wert würde die Herleitung stumm
  überschreiben). Endpunkte `GET/PATCH /api/worker/me/availability`. 24 Tests plus
  Schema-Smoke gegen die echte Datenbank.

  **Ebenfalls erledigt (2026-07-31): Fortschritt + Oberfläche.**
  `api/services/workerOnboardingService.js` ist die **eine** Antwort auf „wie weit ist
  dieses Profil" — gebraucht an drei Stellen (Assistent, Dashboard-Hinweis, Disposition).
  Vier Schritte: Person, Fähigkeiten, Verfügbarkeit, Nachweise.

  Unterschieden wird bewusst **vollständig** von **einsatzbereit**: Nachweise zählen in
  den Fortschritt, blockieren die Vermittlung aber nicht — welche Papiere nötig sind,
  hängt an Branche und Einsatz. Sonst zeigte der Balken 100 %, während Nachweise fehlen,
  oder er bliebe bei 75 % stehen, obwohl die Kraft längst disponierbar ist.

  In der Oberfläche ein **Fortschrittsbanner über den vorhandenen Karten** statt eines
  mehrseitigen Assistenten: die Karten *sind* bereits die Schritte. Ein Umbau hätte
  dieselbe Führung gebracht, aber die ganze Seite neu getestet werden müssen. Die neue
  Verfügbarkeits-Karte ist mit dem Hergeleiteten vorbelegt und nennt darunter die
  Herkunft im Klartext; ein Knopf schaltet zurück auf Herleitung.

  Endpunkt `GET /api/worker/me/onboarding`, 10 Tests.

  **Zwei Fehler, die erst der Browser-Test zeigte:** `--ep-accent` und
  `--ep-surface-raised` existieren nicht (richtig: `--ep-brand`, `--ep-raised`) — der
  Fortschrittsbalken war dadurch durchsichtig. Derselbe Fehler steckte im Bestand
  (kontakt, plan, stundenzettel, 11 Stellen) und ist mitkorrigiert. Und der Emoji-Wächter
  aus dem Audit-Backlog hat einen Unicode-Haken abgefangen; `ICON_PATHS` in
  `portalShell.js` hat jetzt `erledigt`/`offen`, und `iconSvg` ist exportiert, damit
  Seiten Zustandssymbole aus demselben Satz nehmen.

  **Zuletzt erledigt — die Einladungsstrecke (2026-07-31, Commit `7367e48`).** Nach Annahme
  einer Einladung landete eine brandneue Kraft auf dem Dashboard: leeres Profil, leere Listen,
  kein Weg nach vorn. Jetzt führt der Einladungspfad ins Profil, und das Fortschrittsbanner
  begrüßt („Willkommen — noch ein paar Angaben"), statt zu ermahnen. Der **normale** Login
  führt weiterhin aufs Dashboard: eine Bestandskraft will ihre Einsätze sehen, nicht ihr
  Profil. Offene Schritte im Banner sind Sprungziele (Anker `person` / `skills` / `availCard`
  / `documents`) — ein Hinweis, der nicht hinführt, ist eine Sackgasse.

  Damit ist Welle 2 abgeschlossen.

### Phase B — Angebots-Engine (Herzstück der USP)
- **Welle 3 — Multi-Skill-Angebotsgenerator** ✅ *erledigt (2026-07-20)*
  Aus einem Arbeiter automatisch N+1 Angebotsvorschläge (je Skill + Gesamt),
  `capacity_posts` mit `offer_kind`/`primary_skill_id`, Dedup live, Ein-Klick-Erzeugung.
  Erzeugung als Entwurf (Aktivierung bleibt plan-gated = Upsell-Hebel).
  Backend: `api/services/capacityOfferGeneratorService.js`, Endpoints
  `GET/POST /api/capacity-exchange/workers/:workerProfileId/offer-suggestions|generate-offers`,
  `createCapacityEntry` um `worker_profile_id/primary_skill_id/offer_kind/is_anonymous` erweitert.
  UI: „Angebote"-Button + Generator-Modal (Chip-Vorschau, bereits vorhandene markiert) in
  `frontend/public/mitarbeiter.html` + `js/pages/mitarbeiter.js`. Dedup gegen echtes Schema
  per DB-Smoke bestätigt (zweites Einzelangebot abgelehnt, Bündel erlaubt).
- **Welle 4 — Sammelangebote + Reservierungs-/Konflikt-Engine**
  - **4a (Sammelangebote) erledigt (2026-07-21):** Mig 146 `capacity_post_pool_members`;
    `buildPoolSuggestion` (freie Arbeiter mit gleichem Skill) + `createPoolOffer` (EIN
    `pool_single_skill`-Angebot, headcount=Mitgliederzahl, dominante Stadt, org-/skill-validiert);
    Endpoints `GET /capacity-exchange/pool/suggestion`, `POST /capacity-exchange/pool/generate`;
    UI „+ Sammelangebot"-Button + Modal (Skill wählen → freie Mitarbeiter → bündeln) in
    `mitarbeiter.html`. Standard/Notdienst + Premium unterstützt. Tests grün.
  - **4b Hard-Reserve erledigt (2026-07-22):** Mig 147 (`capacity_posts.worker_reserved`);
    `workerOfferReservationService.sweepReservations` — set-basiert + idempotent, getrieben vom
    „im Einsatz"-Signal (`worker_assignment_links.is_active`): aktive Einzel-/Bündelangebote
    belegter Arbeiter werden auto-pausiert (`worker_reserved`), frei gewordene reaktiviert.
    Eingehängt in den Cron `POST /internal/staffing-maintenance`. Greift NICHT in den
    Deal-/Einstell-Flow ein (sicher). Live bewiesen (Reservieren + Freigeben), Tests grün.
  - **`pool_multi_skill` erledigt (2026-07-22):** Pool-Funktionen auf `skill_ids` generalisiert
    (Arbeiter, die ALLE gewählten Skills haben — `COUNT(DISTINCT skill_id) = N`); `offer_kind` aus
    Skill-Anzahl (1 → pool_single_skill, >1 → pool_multi_skill); UI-Modal mit Mehrfach-Skill-Auswahl
    (Chips). Live bewiesen (Max+Anna teilen Altenpflege+Grundpflege → ein pool_multi_skill-Angebot).
  - **Offen (optional):** Echtzeit-Reservierungs-Trigger direkt am Hire-Event (statt periodischem
    Sweep) + Pool-Feinlogik (ein belegter Pool-Member reduziert nur die verfügbare Anzahl, statt
    das ganze Sammelangebot zu sperren).
- **Welle 5 — Premium & Notdienst** 🔶 *Notdienst-Stufe im Generator erledigt (2026-07-20)*
  Generator bietet eine Angebotsstufe (Standard/Notdienst → `priority_level`); der Chef
  erzeugt damit direkt höher priorisierte Notdienst-Angebote (die USP „Notfall-Personal in
  Stunden"). UI: Stufen-Umschalter im Generator-Modal; Service reicht `priority_level` an alle
  erzeugten Angebote durch (Test abgesichert).
  **Premium-Sichtbarkeit (5b-Teil-1) erledigt (2026-07-21):** Generator-Checkbox „Premium" setzt
  `placement_boost_level` (Stufe 2, unter dem bezahlten Max 3 via `premiumListingService`) → höheres
  Feed-Ranking, **ohne Gebühr**. `createCapacityEntry` um `placement_boost_level` erweitert; UI-Checkbox
  im Generator-Modal; Test abgesichert. Live gegen echtes Schema bestätigt.
  **5b-Teil-2 (Premium-Abrechnung) erledigt (2026-07-21):** Mechanismus war bereits vorhanden
  (`POST /marketplace/premium/feature` → `premiumListingService` → `premium_listing_charges` → nächste
  Monatsrechnung, manual-first). Preis auf **9,99 €/Angebot** gesetzt (`PREMIUM_LISTING.price_cents`,
  war 49,00 €; fan-out-freundlicher Micro-Preis, trivial anpassbar, z. B. 14,99 €).
  Offen: optionales Notdienst-/Top-Preis-Tier + Angebots-Styling (Dringlichkeit/Knappheit/Trust).

### Phase C — Nachfrage & Matching
- **Welle 6 — Deckungsvorschau im Angebotsformular** ✅ *erledigt (2026-07-31)*

  **Die Lücke, die den Zuschnitt bestimmt hat:** das Angebotsformular war reiner Freitext.
  Der Disponent tippt eine Rolle, ein paar Fähigkeiten und eine Kopfzahl — und **niemand
  prüfte, ob die Firma diese Leute überhaupt hat**. Wer „6 Pflegekräfte ab 01.09." einstellt
  und dann vier liefert, verliert den Kunden beim ersten Mal. Genau davor warnt Welle 2:
  ein Angebot, das die Agentur nicht halten kann, ist schädlicher als keins. Die Vorschau
  beantwortet das **vor** dem Absenden — mit Namen, nicht mit einer Zahl.

  **Zeitraum-Bezug ist der Kern.** `buildPoolSuggestion` (Welle 4a) kennt nur „hat gerade
  einen Einsatz". Für ein Angebot, das erst in sechs Wochen beginnt, ist das die falsche
  Frage: eine Kraft, deren Einsatz nächste Woche endet, ist dafür frei. Geprüft wird deshalb
  gegen den **angebotenen** Zeitraum — mit exakt derselben Überlappungsregel wie
  `findWorkerScheduleConflicts`. Liefen die auseinander, zeigte das Formular „frei" und die
  spätere Zuweisung antwortete 409.

  | Zustand | Bedeutung |
  |---|---|
  | `frei` | im gewählten Zeitraum verfügbar — zählt in die Deckung |
  | `verplant` | überlappender Einsatz; nennt Kunde + Tag der Rückkehr |
  | `spaeter_frei` | ausdrückliche Angabe der Kraft liegt nach dem Beginn |
  | `abwesend` | gemeldete Abwesenheit (Grund wird angezeigt) |

  **Bewusst nicht geraten:** bei einem Einsatz **ohne Enddatum** bleibt die Rückkehr
  unbekannt statt geschätzt — dieselbe Regel wie im Verfügbarkeits-Dienst.

  **Ein Designfehler, den erst der Test gegen echte Daten zeigte:** ein einziges getipptes
  „stapler" löst **vier** Katalog-Einträge auf (Staplerfahrer:in, Staplerschein, …). Die
  naheliegende Regel „die Kraft muss alle aufgelösten Skills haben" fand deshalb *niemanden*.
  Gefordert ist jetzt je **Suchbegriff** ein Treffer — das ist, was der Disponent meint, wenn
  er zwei Fähigkeiten nebeneinander tippt.

  Backend: `api/services/capacityOfferMatchService.js`, Endpunkt
  `GET /api/capacity-exchange/offer-coverage` (`read:capacity`, agency-only, org-gebunden,
  kein Audit — eine Formularvorschau ist keine Handlung). **Eine** Abfrage für die gesamte
  Belegschaft, nicht eine pro Kraft: die Belegschaft wächst mit jedem Kunden.
  UI: Panel unter dem Zeitraum in `capacity_exchange_form.html` +
  `js/pages/capacityExchangeForm.js` (400 ms entprellt, veraltete Antworten verworfen).
  Die Rolle wird mitgeschickt — viele Disponenten tippen „Staplerfahrer" dorthin und lassen
  das Skill-Feld leer; ohne sie bliebe die Vorschau bei ihnen stumm.

  Verifiziert: 12 Service-Tests, **transaktionaler Dry-Run gegen die echte Datenbank**
  (Anna im September frei → Lücke 2→1, am Endtag selbst noch belegt, zurückgerollt),
  Route live 401 statt 404, Browser-Harness mit echtem Markup + echtem Seiten-JS
  (ein entprellter Aufruf statt vier, alle vier Zustände mit echten Design-Tokens
  eingefärbt, `<script>` im Namen erscheint als Text).
- **Welle 7 — Unternehmens-Bedarfsangebote**
  Firmen fordern gezielt 1+/viele Skills bei 1+/vielen Mitarbeitern; Matching
  Bedarf ↔ Katalog ↔ verfügbare Kapazität.
  **Prüfung (2026-07-22): existiert bereits weitgehend.** `marketplace.js` hat den
  zweiseitigen Marktplatz (`demand_requests` company-only + `requisitions`, `offers`
  mit Accept/Counter/Withdraw, `capacity-posts/:id/accept-deal`); der Feed
  (`/capacity-exchange/feed`, `marketplaceFeed.js`) zeigt Agenturen die Bedarfe und
  Unternehmen die Angebote, inkl. „N verfügbar/gesucht", Notdienst, Reserviert.
  **Gegenseiten-Anschluss (erledigt 2026-07-22):** Angebotstyp-Badge im Käufer-Feed
  (Einzelprofil / Komplettprofil / Sammelangebot / Sammelangebot·Multi-Skill +
  „Hervorgehoben" bei placement_boost) — Supply-Query ist `cp.*`, also kam `offer_kind`
  schon mit; nur das Frontend-Badge fehlte. Buchen bleibt company-only (Owner-Entscheidung);
  `interAgencyEnabled`-Infrastruktur existiert für eine spätere Agentur→Agentur-Freigabe.
  **Offen:** Sofort-Trigger der Hard-Reserve am Capacity-Deal (heute zweistufig: Deal →
  Angebot `reserved`; Worker-Level-Reserve erst beim echten `worker_assignment_link`).

### Phase D — Visual Trust Layer (Fotos/Videos)
> Bilder/Videos **nur wo sie Wert + Vertrauen schaffen** und die Anonymität +
> AGG/DSGVO respektieren. **Keine Bewerberfotos in anonymen Angeboten.**
- **Welle 8 — Kategorie-Bildwelt + Firmen-Branding**
  Professionelle Kategorie-Illustrationen im Skill-Katalog; Firmen/Agenturen
  hinterlegen Logo, Team- und Standortfotos (opt-in, moderiert).
- **Welle 9 — Einsatzort-Fotos + Verifizierungs-Badges**
  Unternehmen hängen Fotos des Einsatzortes an Bedarfsangebote; visuelle
  Verifizierungs-Marken (verifizierte Agentur, zertifizierter Skill).
- **Welle 10 — Onboarding-Erklärvideo + Marketing**
  Kurzes Erklärvideo/animierter Guide senkt die Abbruchquote im Onboarding;
  Hero-/Testimonial-Videos auf Landing/Marketing.

### Phase E — Skalierung & Politur
- **Welle 11 — Suche plattformweit auf `skill_id`**
  Suche/Matching von Freitext auf strukturierte Skills heben (nutzt Fuzzy/Trgm
  Mig 135–137), `usage_count`-Analytics für Auto-Vorschläge.
- **Welle 12 — Performance, Kosten, Moderation, E2E**
  Skalierung 10→300 (Indizes, Caching), Bild-/Video-Kostenkontrolle (CDN, Lazy-Load),
  Moderation, E2E-Tests, Doku-Konsistenz.

---

## 6. Media-Strategie (Fotos/Videos) — Leitplanken

**JA (echter Wert):** Firmen-/Agentur-Branding · Kategorie-Bildwelt im Katalog ·
Einsatzort-Fotos an Bedarfsangeboten · Onboarding-Erklärvideo · Verifizierungs-Badges ·
Marketing/Landing-Videos.

**NEIN (Risiko):** Bewerber-/Arbeiter-Gesichtsfotos in anonymen Angeboten
(kollidiert mit „anonym bis Deal" + AGG/DSGVO-Diskriminierungsrisiko). Optionale
Skill-Demo-Clips nur opt-in und erst **nach** Deal-Freigabe.

**Technik-Guardrails:** Upload + Moderation, CDN + Bildoptimierung + Lazy-Load,
verpflichtender Alt-Text (Barrierefreiheit), Speicher-/Traffic-Kosten aktiv im Blick
(Skalierung 10→300), DSGVO-Einwilligung, keine Stock-Bilder als reale Daten.

---

## 7. Verdrahtungskarte (End-to-End)

```
Chef-Einladung (worker_invites)
        ↓
Einsatzportal-Onboarding  →  worker_profile_skills (Quelle der Wahrheit)
        ↓                         ↘ Spiegel: worker_profiles.skill_tags[]
Multi-Skill-Angebotsgenerator  →  capacity_posts (offer_kind, primary_skill_id)
        ↓                         ↘ Dedup-Index verhindert Doppel-Einzelangebote
Marktplatz / Suche (anonym)  →  Deal  →  Hard-Reserve (valid_until / staffing_reservations)
        ↓
Einsatzende  →  Auto-Reaktivierung der gesperrten Angebote
```

---

## 8. Status & offene Owner-Entscheidungen

**Erledigt (Welle 1):** siehe §9 Dateiliste. Migration 145 ist **bereit zum Anwenden**
(`docker compose run --rm migrate`) — additive, idempotente, rückwärtskompatible DDL.

**Offen / künftig:** Premium-/Notdienst-Preislogik (Welle 5), Reservierungs-Feinregeln
(Teil-Kapazität vs. Voll-Sperre, Welle 4), Bild-/Video-Speicherziel + Kostenrahmen (Phase D).

---

## 9. Welle-1 Dateiliste (Traceability)

**Neu:**
- `sql/migrations/145_multi_skill_catalog.sql`
- `api/services/skillCatalogService.js`
- `api/routes/skills.js`
- `api/test/skillCatalog.service.test.js`
- `api/test/workerSkills.service.test.js`

**Geändert:**
- `api/app.js` — Skill-Katalog-Router gemountet
- `api/services/workerService.js` — `getWorkerSkills` / `setWorkerSkills`
- `api/routes/workerPortal.js` — `GET/PUT /worker/me/skills`
- `frontend/public/einsatzportal-profil.html` — Fähigkeiten-Katalog-UI (Checkbox-Chips)

---

## 10. Sicherheit & Compliance

Org-Boundary auf allen schreibenden Pfaden (`supplier_org_id`-gebundener Spiegel),
CSRF (globaler `/api/`-Guard), Audit (`worker.update_skills`), Anonymität bis Deal,
DSGVO/AGG bei Media. Katalog = plattformweite Referenzdaten (kein Org-Scope).
