# Multi-Skill Angebots-Management — Feature-Plan & USP

> **Status:** In Umsetzung · **Welle 1 (Fundament) erledigt** (2026-07-19)
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
- **Welle 2 — Premium-Onboarding-Wizard**
  Vollständiges, geführtes Aufnahme-Formular (Personendaten → Skills → Zertifikate →
  Verfügbarkeit), Pflichtfeld-Logik, Fortschrittsanzeige, „lange genug, damit alles
  Wichtige erfasst wird". Chef-Einladung → Worker füllt end-to-end.

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
- **Welle 6 — Live-Vorschlag im Angebotsformular**
  Suchleisten-Intelligenz: passende Mitarbeiter live vorschlagen, Anzahl gegen
  verfügbare/reservierte Kapazität prüfen, Konflikt bei bereits verplant.
- **Welle 7 — Unternehmens-Bedarfsangebote**
  Firmen fordern gezielt 1+/viele Skills bei 1+/vielen Mitarbeitern; Matching
  Bedarf ↔ Katalog ↔ verfügbare Kapazität.

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
