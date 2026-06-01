# Track A — Marketplace Visibility Center

> Premium-Feature für Individuell-/PRO-/Enterprise-Kunden: kontrolliertes öffentliches Anbieterprofil, anonymisierte Profil-Analytics, verifizierte Deal-basierte Bewertungen, kuratierte Rankings, staff-gesteuerte Bountys.

---

## Leitprinzipien (nicht verhandelbar)

```text
Kein Social-Media-Gimmick. Professionelles B2B-Marketplace-System.
Public Visibility ist OPT-IN, default OFF.
Bewertungen NUR nach FINALIZED Deal.
Rankings nicht nur auf Likes basieren.
Bountys NIE automatisch aktiv — immer Staff-Freigabe.
Keine personenbezogenen Trackingdaten öffentlich.
Kein Review-Farming, kein Like-Kauf, kein pay-to-win.
Feature-Gating im BACKEND, nicht nur Frontend.
Inkrementell, nicht Big-Bang.
```

---

## Begriffswelt (professionell)

| Verboten | Verwenden |
|---|---|
| Highscore | Marketplace Visibility Center |
| Likes-Spiel | Sichtbarkeitsstatus |
| Follower | Profilreichweite |
| Bewertungen ohne Deal | Verifizierte Bewertungen |
| Ranking ohne Erklärung | Trust Score + Score-Erklärung |
| Bezahlte Sichtbarkeit | Featured Profile (staff-freigegeben) |

---

## Plan-Gates (verbindlich)

| Feature Key | Zugriff |
|---|---|
| `public_profile_basic` | PLUS, NOTDIENST, PRO, INDIVIDUELL |
| `public_profile_visibility` | PRO, INDIVIDUELL |
| `profile_analytics_basic` | PRO, INDIVIDUELL |
| `profile_analytics_advanced` | INDIVIDUELL |
| `marketplace_ranking_participation` | PRO, INDIVIDUELL |
| `marketplace_featured_profile` | INDIVIDUELL ODER staff-freigegebenes Add-on |
| `verified_deal_reviews` | PRO, INDIVIDUELL |
| `profile_bounties` | INDIVIDUELL ODER individuell freigegebene Abos |

**Hinweis:** Plan-Begriffe folgen Phase-1 WAVE_02 (DEMO/BASIS/PLUS/PRO/INDIVIDUELL). `NOTDIENST` ist Legacy-Alias → via `normalizePlanKey(...)` mappen.

---

## WAVE M-00 — Read-only Audit & Scope

**Ziel:** Stand prüfen, keine Codeänderung.

**Aufgaben:**
1. Inventar erstellen aller bestehenden Dateien:
   - `api/config/planFeatures.js`
   - `api/routes/companyProfile.js`, `ratings.js`, `staff.js`, `analytics.js`
   - `api/services/companyProfileService.js`, `ratingService.js`, `reputationService.js`
   - `sql/migrations/001_ratings.sql`, `024_company_profiles.sql`, `026_org_id_backfill.sql`, `111_staff_control_center.sql`
   - `frontend/public/company_profile_public.html`, `sla_profil.html`
   - `frontend/src/staff/App.tsx`, Module-Struktur
2. Auflisten was schon existiert, was fehlt
3. `docs/MARKETPLACE_VISIBILITY_CENTER.md` Skelett anlegen mit Status-Sektionen

**Acceptance:**
- `docs/MARKETPLACE_VISIBILITY_CENTER.md` existiert
- Keine Codeänderung
- Mapping-Tabelle zwischen vorhandenen und neu zu bauenden Dateien

---

## WAVE M-01 — Feature-Gating erweitern

**Ziel:** Plan-Feature-Keys eingeführt, Backend-Gate aktiv.

**Aufgaben:**
1. `api/config/planFeatures.js` um die 8 neuen Feature-Keys erweitern
2. `normalizePlanKey(...)` für Legacy-Plans (`FREE`, `TRIAL`, `STARTER`, `NOTDIENST`, `ENTERPRISE`) sicherstellen
3. Tests: pro Plan welche Features aktiv sind
4. **Backend ist Wahrheit** — Frontend zeigt Locked-States, aber API blockt

**Acceptance:**
- Feature-Gates greifen serverseitig (Tests bestehen)
- Legacy-Plan-Aliase funktionieren
- Coming-Soon-Features (`marketplace_featured_profile`) sind klar markiert

---

## WAVE M-02 — Datenmodell-Migration

**Ziel:** Neue Tabellen additiv, rückwärtskompatibel, idempotent.

**Aufgaben:**
- Migration `sql/migrations/027_marketplace_visibility_center.sql` anlegen mit:
  - `profile_visibility_settings` (Sichtbarkeitseinstellungen pro User)
  - `profile_view_events` (anonymisiert, Hashing mit Server-Salt)
  - `profile_likes` (unique, keine Selbst-Likes)
  - `profile_favorites` (private Merkliste)
  - `profile_ranking_snapshots` (periodisch berechnet)
  - `profile_review_moderation` (Status: pending, visible, hidden, flagged, removed)
  - `profile_bounties` (mit Status-Lifecycle)
  - `profile_abuse_reports` (entity_type, entity_id, reason, status)
- Indizes: `(ranking_category, rank_position)`, `(profile_user_id)`, `(calculated_at)`
- Constraints: unique (user_id) für settings, unique (profile_user_id, liked_by_user_id) für likes, CHECKs für Statuswerte

**Acceptance:**
- Migration läuft fresh + upgrade ohne Fehler
- Keine bestehenden Tabellen verändert (additiv)
- Schema dokumentiert in `docs/MARKETPLACE_VISIBILITY_CENTER.md`

---

## WAVE M-03 — Backend Services

**Ziel:** Service-Layer sauber getrennt.

**Aufgaben:**
1. `api/services/profileVisibilityService.js`:
   - `getVisibilitySettings`, `upsertVisibilitySettings`
   - `submitProfileForReview`, `approveProfileVisibility`, `rejectProfileVisibility`
   - `pauseProfileVisibility`, `suspendProfileVisibility`
   - `getPublicVisibleProfile(pool, profileUserId, viewerContext)`
   - **Regel:** Public Profile nur ausliefern wenn `is_public=true`, `visibility_status=approved`, Plan-Feature erlaubt, nicht suspended/rejected. Sensible Daten verborgen.

2. `api/services/profileAnalyticsService.js`:
   - `trackProfileEvent`, `getOwnProfileAnalytics`, `getProfileSectionBreakdown`, `getConversionFunnel`
   - **Datenschutz:** IP/User-Agent nur gehasht, niemals klartext, niemals ausliefern. Bot-Filter.

3. `api/services/profileRankingService.js`:
   - `calculateProfileScore`, `rebuildRankingSnapshots`, `getPublicRankings`, `explainRanking`
   - **Ranking-Gewichtung:** 25% Profilqualität, 25% Trust/Compliance, 20% Deal-Signale, 15% Engagement, 10% Aktualität, 5% Likes, Featured/Bounty-Boost MAX +10%

4. `api/services/profileBountyService.js`:
   - `createBountyRequest`, `listOwnBounties`, `listStaffBounties`, `getBountyDetail`
   - `approveBounty`, `rejectBounty`, `activateBounty`, `pauseBounty`, `completeBounty`, `cancelBounty`
   - **Regel:** Aktivierung nur mit Staff-Step-Up. Keine Bounty kauft Likes/Reviews.

5. Optional `api/services/profileModerationService.js`

**Acceptance:**
- Alle Services existieren mit definierten Funktionen
- Unit-Tests pro Service
- Public Profile leakt keine internen Commercial-/Abo-Daten

---

## WAVE M-04 — Backend Routes

**Ziel:** REST-API für Kunden-/Public-Zugriff.

**Aufgaben:**

**Public/Profile:**
- `GET /api/profile-visibility/public/:userId` — öffentlich, nur approved Profile, trackt anonym
- `POST /api/profile-visibility/settings` — requireAuth + Feature-Gate
- `GET /api/profile-visibility/settings` — requireAuth
- `POST /api/profile-visibility/submit-review` — setzt status `pending_review`, erzeugt Staff-Aufgabe

**Analytics:**
- `POST /api/profile-analytics/events` — rate-limited, bot-/spam-resistent
- `GET /api/profile-analytics/me?range=30` — requireAuth + Feature-Gate
- `GET /api/profile-analytics/me/sections?range=30`
- `GET /api/profile-analytics/me/funnel?range=30`

**Rankings:**
- `GET /api/profile-rankings?category=overall&region=&industry=&limit=100` — max 100/Request, Top 1000 paginiert
- `GET /api/profile-rankings/:userId` — eigene Position + Score-Erklärung

**Like/Favorite:**
- `POST /api/profile-visibility/:userId/like` — idempotent, rate-limited, keine Selbstlikes
- `DELETE /api/profile-visibility/:userId/like`
- `POST /api/profile-visibility/:userId/favorite`
- `DELETE /api/profile-visibility/:userId/favorite`

**Bounty (Kunde):**
- `GET /api/profile-bounties/me`
- `POST /api/profile-bounties` — Feature-Gate, status `pending_approval`, keine direkte Aktivierung

In `api/app.js` sauber mounten. Zod-Validation an Eingangsgrenzen.

**Acceptance:**
- Alle Endpoints existieren mit Guards
- Public Routes liefern nur approved Profile
- Rate-Limits aktiv
- Cross-Org-Negativtests bestehen

---

## WAVE M-05 — Bewertungssystem härten

**Ziel:** Reviews enterprise-tauglich.

**Aufgaben:**
1. Bewertungsregel: sichtbar NUR wenn:
   - Request/Deal `FINALIZED`
   - Rater + Rated waren Teilnehmer
   - Rating-Fenster gültig
   - Keine offene Dispute-/Abuse-Markierung
   - Nicht verborgen/entfernt
   - Optional: Staff Moderation nicht pending
2. Verhindern:
   - Selbstbewertung
   - Mehrfachbewertung pro Deal/Rater
   - Bewertungen ohne Deal
   - Bewertung gegen Bounty/Belohnung
   - Verdächtige Bewertungscluster (Detektor)
3. Anzeige im Public Profile:
   - Durchschnitt, Anzahl verifizierter Bewertungen
   - Einzelbewertungen mit begrenztem Kommentar
   - Rater anonymisiert ODER als verifizierter Geschäftspartner

**Acceptance:**
- Tests: rating requires FINALIZED, non-participant blocked, duplicate blocked, expired window blocked
- Public Profile zeigt nur visible Reviews
- Audit bei Hide/Restore

---

## WAVE M-06 — Staff Control Center Integration

**Ziel:** SCC-Modul `marketplace-visibility` für Staff-Steuerung.

**Aufgaben:**
1. React-Modul `frontend/src/staff/modules/marketplace-visibility/index.tsx` anlegen
2. Komponenten (optional in Unterkomponenten aufteilen):
   - `ProfileReviewQueue.tsx`
   - `ProfileVisibilityDrawer.tsx`
   - `BountyApprovalQueue.tsx`
   - `BountyDetailDrawer.tsx`
   - `RankingControlPanel.tsx`
   - `ProfileAbuseReports.tsx`
   - `VisibilityAuditTimeline.tsx`
3. Sidebar-Eintrag in `frontend/src/staff/components/shell/Sidebar.tsx`
4. SCC-API-Client erweitern: `frontend/src/staff/api/client.ts`
5. Tabs:
   1. Übersicht (KPIs)
   2. Profil-Freigaben
   3. Bounty-Freigaben
   4. Rankings
   5. Bewertungen/Moderation
   6. Missbrauchsmeldungen
   7. Audit

**Acceptance:**
- `npm run build:scc` grün
- Modul lädt mit leerer Datenbasis ohne 500
- Tabs navigierbar, Deep Links

> **Knüpft an Phase 3 SCC** — folgt SCC-UI-Standards aus Phase 3 Track A WAVE 04 (Profi-UI, kein `window.confirm`).

---

## WAVE M-07 — Staff Backend Routes

**Ziel:** SCC-Endpoints für Marketplace-Operations.

**Aufgaben (alle unter `/staff/api/marketplace-visibility/*`):**
- `GET /overview` — KPIs
- `GET /profiles?status=pending_review`
- `GET /profiles/:userId`
- `POST /profiles/:userId/approve|reject|pause|suspend` — alle mit Step-up + Reason + Audit
- `GET /bounties` + `GET /bounties/:id`
- `POST /bounties/:id/approve|reject|activate|pause|complete` — alle mit Step-up
- `GET /rankings`, `POST /rankings/rebuild` (Step-up!)
- `GET /abuse-reports`, `POST /abuse-reports/:id/transition`

**Pflicht für alle mutierenden POSTs:**
- `requireStaffAuth`
- `requireStepUp` (echte Reauth, siehe Phase 3 Track A WAVE 02)
- Staff Audit schreiben
- Klare Fehlercodes (siehe Phase 1 WAVE_03)
- Zod-Validation

**Acceptance:**
- Alle Endpoints geschützt
- Tests bestehen
- Audit-Events für jede Aktion

---

## WAVE M-08 — Public Profil aufwerten

**Ziel:** `frontend/public/company_profile_public.html` enterprise-tauglich.

**Aufgaben:**
- Kurzfristig: HTML weiter nutzen, enterprise-tauglich erweitern (kein erzwungener Refactor)
- Header: Firmenname, Logo, Verifiziert-Badge, Sichtbarkeitsstatus, Branche, Standort, CTA (Anfrage senden, Merken, Teilen)
- Sektionen: Überblick, Kompetenzen, Regionen, Zertifikate, verifizierte Deal-Signale, Bewertungssummary, öffentliche Bewertungen, ähnliche Anbieter, Kontakt
- Analytics-Tracking:
  - `profile_view` beim Laden
  - `section_view` per Intersection Observer
  - `contact_click`, `request_click`, `favorite`, `share_click`
- **Tracking robust und non-blocking** — Ausfall darf Profil nicht zerstören
- Kein Drittanbieter-Analytics-Pixel

**Acceptance:**
- Profil lädt schnell, mobil sauber
- Tracking-Ausfall macht Profil nicht kaputt
- Keine personenbezogenen Daten im UI sichtbar

---

## WAVE M-09 — Kunden-Dashboard "Profilreichweite"

**Ziel:** Kunde sieht eigene Profilreichweite (ImmoScout-Stil).

**Aufgaben:**
- Erweitere `frontend/public/sla_profil.html` oder bestehenden Profilbereich
- Neue Funktion "Profilreichweite":
  - Sichtbarkeit-Status, Profilqualität %, Profilaufrufe 7/30/90 Tage
  - Eindeutige Besucher (anonymisiert), Kontaktklicks, Anfrageklicks, Favoriten, Likes
  - Conversion Rate, meist angesehene Sektionen
  - Ranking-Position falls freigegeben
  - Empfehlungen zur Profilverbesserung
  - CTAs: Sichtbarkeit beantragen, Profil zur Prüfung einreichen, Bounty beantragen (wenn Feature)
- **Keine Anzeige:** konkrete Besucheridentität, IPs, Firmennamen der Besucher

**Acceptance:**
- Dashboard zeigt nur aggregierte Daten
- Empty States professionell
- Feature-Gating greift in UI + API

---

## WAVE M-10 — Bounty/Promotion-System fertigstellen

**Ziel:** Staff-kontrollierte Promotions.

**Bounty bedeutet:** kontrollierte, staff-freigegebene Promotion. NICHT Glücksspiel. NICHT Like-Kauf. NICHT Review-Kauf.

**Erlaubte Bounty-Typen:**
- Profil-Promotion
- regionale Sichtbarkeitskampagne
- Profilvervollständigungs-Kampagne
- Branchenaktion
- Deal-/Qualitätssignal-Kampagne
- manuelle Promotion für Enterprise

**Lifecycle:** `draft → pending_approval → approved → active → paused/completed/rejected/cancelled`

**Reward-Typen:** `platform_credit`, `visibility_boost` (gedeckelt!), `manual_reward`, `invoice_credit`, `none`

**Bounty darf NIE:**
- Likes kaufen
- Bewertungen kaufen
- Ranking direkt erzwingen
- Ohne Staff aktiv werden
- Ohne Audit verändert werden

**Acceptance:**
- Lifecycle vollständig
- Staff-Aktivierung mit Step-up
- Audit pro Übergang
- Visibility-Boost ist deckelt

---

## WAVE M-11 — Missbrauchsschutz

**Ziel:** Schutzlogik gegen Manipulation.

**Aufgaben:**

**Likes:** nur eingeloggte User, keine Selbst-Likes, unique pro User/Profile, rate-limited, auffälliges Wachstum markieren.

**Views:** Hashing, Rate-Limit, Bot-Heuristik, keine Mehrfachzählung derselben Session als Unique.

**Rankings:** Ausreißer-Erkennung, Boosts gedeckelt, suspended Profile ausschließen, Profile mit Abuse-Fällen markieren.

**Bountys:** Staff-Freigabe, Step-up, Audit, Compliance-Regeln.

**Bewertungen:** nur nach Deal, Moderation, Abuse Report, keine gekauften Bewertungen.

**Acceptance:**
- Verdächtige Patterns werden markiert
- Tests: self-like blocked, duplicate idempotent, suspended ausgeschlossen
- Rate-Limits aktiv

---

## WAVE M-12 — Audit, Observability, Tests

**Ziel:** Operations-Reife.

**Audit Events (Pflicht):**

Normal:
- `profile_visibility.updated|submitted`
- `profile_view.tracked`
- `profile_like.created|deleted`
- `profile_favorite.created`
- `profile_bounty.requested`
- `rating.flagged`

Staff:
- `marketplace_profile.approved|rejected|paused|suspended`
- `marketplace_bounty.approved|rejected|activated|paused|completed`
- `marketplace_ranking.rebuilt`
- `profile_review.hidden|restored`
- `abuse_report.transitioned`

**Monitoring:** Ranking rebuild failures, Tracking endpoint error rate, Profile analytics query latency, Bounty approval latency, Suspicious engagement spikes.

**Tests-Mindestabdeckung:**

15.1 **Profil-Sichtbarkeit:** hidden by default, visible only when approved, rejected/suspended not visible, feature gate, settings validation, submit review pending

15.2 **Analytics:** events anonymized, invalid rejected, aggregate only, no visitor identity, ranges 7/30/90, empty returns zeros not 500

15.3 **Likes/Favorites:** requires auth, self-like blocked, duplicate idempotent, unlike works, favorite private

15.4 **Rankings:** excludes non-public, excludes suspended, not only on likes, pagination, top 1000 no overload, score explanation

15.5 **Ratings:** requires FINALIZED, non-participant blocked, duplicate blocked, expired window blocked, public display hides moderated

15.6 **Bountys:** customer can request with feature, invalid reward rejected, staff approve requires step-up, bounty cannot reward likes/reviews, activation writes audit

15.7 **SCC:** overview loads empty, queues load, action endpoints validate transitions, audit written

**Acceptance:**
- Alle Tests grün
- Monitoring-Dashboard zeigt Marketplace-Metriken
- Audit-Pflicht erfüllt

---

## WAVE M-13 — Dokumentation & Go-Live

**Ziel:** Feature ist dokumentiert und freigabefähig.

**Dokumente:**
- `docs/MARKETPLACE_VISIBILITY_CENTER.md` (final)
- `docs/PROFILE_ANALYTICS_PRIVACY.md`
- `docs/PROFILE_RANKING_MODEL.md` (mit Gewichtung + Boost-Caps)
- `docs/PROFILE_BOUNTY_GOVERNANCE.md`
- `docs/SCC_MARKETPLACE_VISIBILITY_RUNBOOK.md`

**Inhalt jeder Doku:**
- Produktziel, Feature-Gating, Datenmodell, Datenschutzmodell
- Rankinglogik, Bewertungsregeln, Bounty-Regeln
- Staff-Prozesse, Abuse-Prozesse
- Tests, offene Risiken, Go-Live-Checkliste

**Final-Check (siehe `GATES.md` Track A):**
- 18 Akzeptanzkriterien aus dem Quelldokument abgehakt
- Bestehende Profile, Ratings, SCC, Plans und Public Profile nicht gebrochen
- Build + Tests grün

**Abschlussbericht:**
1. Geänderte Dateien
2. Neue Migrationen
3. Neue API-Endpunkte
4. Neue SCC-Module
5. Neue Kunden-/Profilfunktionen
6. Ranking-Modell mit Gewichtung
7. Datenschutzmaßnahmen
8. Bounty-Governance
9. Bewertungs-Härtung
10. Tests und Testergebnisse
11. Bekannte Restpunkte
12. Go-Live-Einschätzung
13. Sicherheits-/Compliance-Hinweise

---

## Übergang

Track A ist nach M-13 fertig. Marketplace-Gate (siehe `GATES.md`) muss grün sein, bevor Feature für Kunden freigeschaltet wird.

**Reihenfolge-Empfehlung:** M-00 → M-01 → M-02 → M-03 → M-04 → M-05 → M-06 + M-07 (SCC-Frontend + Backend gehören zusammen) → M-08 → M-09 → M-10 → M-11 → M-12 → M-13.
