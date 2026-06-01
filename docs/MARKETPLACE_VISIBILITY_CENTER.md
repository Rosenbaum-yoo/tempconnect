# Marketplace Visibility Center — Inventar & Implementierungsplan

> Erstellt: 2026-05-30 — Wave M-00 (Read-only Audit)
> Track: Phase 4 Track A — Keine Codeänderung in dieser Wave.

---

## 1. Produktvision

Professionelles B2B-Marketplace-System für TempConnect. Kontrollierte öffentliche Sichtbarkeit
für Anbieter (PRO/INDIVIDUELL), verifizierte Deal-Bewertungen, kuratierte Rankings und
staff-gesteuerte Promotions (Bounties).

**Nicht-verhandelbare Prinzipien:**
- Public Visibility ist OPT-IN, default OFF
- Bewertungen NUR nach FINALIZED-Deal
- Rankings nicht nur auf Likes basieren
- Bountys NIE automatisch aktiv — immer Staff-Freigabe
- Feature-Gating im BACKEND, nicht nur Frontend

---

## 2. Inventar — Was existiert heute

### 2.1 Datenbank-Migrationen (vorhanden)

| Migration | Tabellen / Felder | Vollständigkeit |
|---|---|---|
| `001_ratings.sql` | `ratings` (id, request_id, rater_id, rated_id, stars 1-5, reliability 1-5, communication 1-5, quality 1-5, comment, UNIQUE(request_id, rater_id)) | ✅ Vollständig |
| `024_company_profiles.sql` | `company_profiles`, `company_capabilities`, `company_locations`, `company_certifications`, `company_contacts` | ✅ Vollständig |
| `026_org_id_backfill.sql` | org_id-Backfill für bestehende Datensätze | ✅ Vollständig |
| `044_reputation_ranking.sql` | Erweitert `supplier_reputation`: `reputation_score` (0-100), `deal_success_rate`, `total_deals`, `activity_score`, `ranking_score` | ✅ Vollständig |
| `045b_reputation_visibility.sql` | Erweitert `supplier_reputation`: `timesheet_reliability_score` | ✅ Vollständig |

**Fehlend (zu bauen in M-02):**
- `027_marketplace_visibility_center.sql` mit 8 neuen Tabellen

---

### 2.2 Backend-Services (vorhanden)

| Service | Vorhandene Funktionen | Status |
|---|---|---|
| `companyProfileService.js` | `getProfile`, `upsertProfile`, `getCapabilities`, `upsertCapabilities`, `getLocations`, `getPublicProfile`, `computeCompleteness` | ✅ CRUD komplett |
| `ratingService.js` | `getRequestForRating`, `checkExistingRating`, `submitRating`, `getUserRatings`, `getRatingStats`, `getPendingRatings` | ✅ Basis vorhanden — Moderation fehlt |
| `reputationService.js` | `computeGrade` (UNRATED→PLATINUM), `computeResponseTimeScore`, `computeReputationScore`, `computeDealSuccessRate`, `computeActivityScore`, `computeScoreGrade`, `computeRankingScore`, `computePremiumBoost`, `computeEffectiveRankScore` | ✅ Scoring-Logik KOMPLETT |
| `analyticsService.js` | Allgemeine Plattform-Analytics (Workforce, Conversion Funnel, Event Tracking) | ⚠️ Existiert aber nicht Profile-spezifisch |

**Fehlend (zu bauen in M-03):**
- `profileVisibilityService.js` — Sichtbarkeits-CRUD, Review-Einreichung, Approve/Reject/Pause/Suspend
- `profileAnalyticsService.js` — Profile-View-Tracking (anonymisiert), Aggregation, Sections, Funnel
- `profileRankingService.js` — Aufbau auf vorhandenem `reputationService.js` (Scoring bereits da!), Snapshots, Public Rankings
- `profileBountyService.js` — Lifecycle (draft→pending→approved→active→...)
- `profileModerationService.js` (optional, kann in ratingService integriert werden)

---

### 2.3 Backend-Routes (vorhanden)

| Route-Datei | Endpoints | Status |
|---|---|---|
| `companyProfile.js` | `GET /company-profile`, `GET /company-profile/public/:userId`, `GET /company-profile/completeness`, `PUT /company-profile/overview`, `PUT /company-profile/capabilities`, weitere | ✅ Profil-CRUD vorhanden |
| `ratings.js` | `POST /ratings` (FINALIZED-gated ✅), `GET /users/:id/ratings`, `GET /ratings/pending`, `GET /users/:id/reputation` | ✅ Basis — Moderation fehlt |
| `analytics.js` | `POST /analytics/events`, `GET /analytics/...` (allgemeine Plattform-Analytics) | ⚠️ Existiert aber nicht für Profil-Views |

**Fehlend (zu bauen in M-04):**
- `GET /api/profile-visibility/public/:userId` — nur approved Profile
- `POST/GET /api/profile-visibility/settings` — Sichtbarkeits-Einstellungen
- `POST /api/profile-visibility/submit-review` — Einreichung zur Staff-Prüfung
- `POST /api/profile-analytics/events` — anonymisiertes View-Tracking
- `GET /api/profile-analytics/me` — eigene Profilreichweite
- `GET /api/profile-rankings` — kuratiertes Ranking (Top 1000)
- `POST/DELETE /api/profile-visibility/:id/like` — idempotent, rate-limited
- `POST/DELETE /api/profile-visibility/:id/favorite` — private Merkliste
- `GET/POST /api/profile-bounties/me` — Bounty-Anfragen

---

### 2.4 Frontend (vorhanden)

| Datei | Inhalt | Zustand | Fehlend |
|---|---|---|---|
| `company_profile_public.html` | 521 Zeilen — Hero (Name/Logo/Industrie), Capabilities, Locations, Certs, Bewertungsanzeige (loadProfileRatings) | ✅ Fundament gut | Sichtbarkeits-Badge, Analytics-Tracking, Featured-Badge, Profilbereich-Fortschrittsanzeige |
| `sla_profil.html` | 294 Zeilen — "Mein Unternehmen" Profilverwaltung | ✅ Fundament | "Profilreichweite"-Sektion (KPIs: Views, Kontaktklicks, Ranking) |
| `frontend/src/staff/modules/` | 15 SCC-Module vorhanden | ✅ 15/16 | `marketplace-visibility/index.tsx` fehlt komplett |

---

### 2.5 Plan-Feature-Gates (vorhanden vs. fehlend)

| Feature Key (planFeatures.js) | Status | Geplant für Plan(e) |
|---|---|---|
| `supplier_ratings` | ✅ vorhanden | PRO, INDIVIDUELL |
| `premium_visibility` | ✅ vorhanden | PRO, INDIVIDUELL |
| `basic_analytics` | ✅ vorhanden | PLUS, PRO, INDIVIDUELL |
| `enterprise_analytics` | ✅ vorhanden | INDIVIDUELL |
| **`public_profile_basic`** | ❌ fehlt (M-01) | PLUS, PRO, INDIVIDUELL |
| **`public_profile_visibility`** | ❌ fehlt (M-01) | PRO, INDIVIDUELL |
| **`profile_analytics_basic`** | ❌ fehlt (M-01) | PRO, INDIVIDUELL |
| **`profile_analytics_advanced`** | ❌ fehlt (M-01) | INDIVIDUELL |
| **`marketplace_ranking_participation`** | ❌ fehlt (M-01) | PRO, INDIVIDUELL |
| **`marketplace_featured_profile`** | ❌ fehlt (M-01) | INDIVIDUELL + Staff-Add-on |
| **`verified_deal_reviews`** | ❌ fehlt (M-01) | PRO, INDIVIDUELL |
| **`profile_bounties`** | ❌ fehlt (M-01) | INDIVIDUELL + individuell freigegebene Abos |

---

## 3. Mapping: Vorhandenes → Neu zu bauen

| Komponente | Vorhandene Basis | Ergänzung notwendig | Wave |
|---|---|---|---|
| Feature-Gates | `planFeatures.js` (4 verwandte Keys) | 8 neue Marketplace-Keys ergänzen | M-01 |
| DB: Bewertungen | `ratings`-Tabelle ✅ | Moderation-Felder (status, moderator_id) | M-02 |
| DB: Profile | `company_profiles` ✅ | `profile_visibility_settings` separat | M-02 |
| DB: Reputation | `supplier_reputation` + Scoring ✅ | `profile_ranking_snapshots` für Snapshots | M-02 |
| DB: Neu | — | `profile_view_events`, `profile_likes`, `profile_favorites`, `profile_bounties`, `profile_abuse_reports` | M-02 |
| Service: Profil-CRUD | `companyProfileService.js` ✅ | `profileVisibilityService.js` separat | M-03 |
| Service: Scoring | `reputationService.js` (komplett!) ✅ | `profileRankingService.js` (wraps + Snapshot-Write) | M-03 |
| Service: Analytics | `analyticsService.js` (Plattform) | `profileAnalyticsService.js` (Profile-Views, anonymisiert) | M-03 |
| Service: Bountys | — | `profileBountyService.js` (komplett neu) | M-03 |
| Route: Profil-öffentlich | `GET /company-profile/public/:userId` ✅ | Visibility-Status-Check verpflichtend machen | M-04 |
| Route: Bewertungen | `POST /ratings` (FINALIZED-gated ✅) | Moderation-Endpoints ergänzen | M-04/M-05 |
| Route: Analytics | `analytics.js` (allgemein) | Profil-View-Endpoints (`/profile-analytics/*`) | M-04 |
| Route: Rankings | — | `/profile-rankings` komplett neu | M-04 |
| Route: Like/Fav | — | `/profile-visibility/:id/like`, `/favorite` neu | M-04 |
| Route: Bountys | — | `/profile-bounties/me` neu | M-04 |
| SCC-Modul | 15 Module vorhanden | `marketplace-visibility/index.tsx` (komplett neu) | M-06 |
| SCC-Routes | Staff-API-Routes | `/staff/api/marketplace-visibility/*` neu | M-07 |
| Public HTML | `company_profile_public.html` (521 Zeilen) | Sichtbarkeits-Badge, Tracking, Featured-Badge | M-08 |
| Kunden-Dashboard | `sla_profil.html` (294 Zeilen) | "Profilreichweite"-Sektion einfügen | M-09 |

---

## 4. Schnellbewertung: Aufwand pro Wave

| Wave | Beschreibung | Aufwand | Abhängigkeit |
|---|---|---|---|
| **M-00** | Read-only Audit ← jetzt | Gering | — |
| **M-01** | Feature-Keys in planFeatures.js | Gering (1 Datei) | M-00 |
| **M-02** | DB-Migration (8 neue Tabellen) | Mittel (1 Migration) | M-01 |
| **M-03** | 4 neue Services | Hoch (viel Logic) | M-02 |
| **M-04** | API-Endpoints (10+) | Hoch | M-03 |
| **M-05** | Ratings-Härtung (Moderation) | Mittel | M-04 |
| **M-06** | SCC React-Modul | Hoch (6 Tabs) | M-04, Phase 3 SCC |
| **M-07** | SCC Backend-Routes | Mittel | M-06 |
| **M-08** | Public HTML erweitern | Mittel | M-04 |
| **M-09** | Kunden-Dashboard "Profilreichweite" | Mittel | M-04 |
| **M-10** | Bounty-UI (Kunde) | Mittel | M-07 |
| **M-11** | Missbrauchsschutz | Mittel | M-04 |
| **M-12** | Tests + Audit-Events | Hoch | Alle |
| **M-13** | Dokumentation + Go-Live | Mittel | Alle |

---

## 5. Besonderheit: reputationService.js ist weiter als erwartet

`api/services/reputationService.js` hat bereits:
- `computeRankingScore()` — composite 0-100
- `computePremiumBoost()` — boost für Premium-Profile
- `computeEffectiveRankScore()` — Ranking mit Boost-Cap

Das bedeutet M-03 `profileRankingService.js` kann sich **direkt auf reputationService.js stützen**
und muss nur noch Persistenz (Snapshots schreiben) + Public-Read-API ergänzen.

---

## 6. Sicherheits-/Datenschutz-Anforderungen (non-negotiable)

| Anforderung | Wo umgesetzt |
|---|---|
| profile_view_events: IP/UA nur gehasht, nie Klartext | M-02 Schema + M-03 analyticsService |
| Selbst-Like blockiert (DB UNIQUE + Backend-Check) | M-02 Constraint + M-04 Route |
| Sichtbar nur wenn is_public=true AND status=approved AND Plan OK AND nicht suspended | M-03 Service + M-04 Route |
| Bewertung nur nach FINALIZED-Deal — bereits implementiert in ratings.js ✅ | M-05 härten |
| Staff-Step-up für alle Bounty-Aktivierungen | M-07 Route |
| Audit für jede mutierende Aktion | M-04 + M-07 |
| Visibility-Boost MAX +10% (gedeckelt) | M-03 `computePremiumBoost` Bestehend! |

---

## 7. Status der Waves

| Wave | Status | Datum |
|---|---|---|
| M-00 | ✅ abgeschlossen | 2026-05-30 |
| M-01 | ✅ abgeschlossen | 2026-05-30 |
| M-02 | ✅ abgeschlossen | 2026-05-30 |
| M-03 | ✅ abgeschlossen | 2026-05-30 |
| M-04 | ✅ abgeschlossen | 2026-05-30 |
| M-05 | ✅ abgeschlossen | 2026-05-30 |
| M-06 | ✅ abgeschlossen | 2026-05-30 |
| M-07 | ✅ abgeschlossen | 2026-05-30 |
| M-08 | ✅ abgeschlossen | 2026-05-30 |
| M-09 | ✅ abgeschlossen | 2026-05-30 |
| M-10 | ✅ abgeschlossen | 2026-05-30 |
| M-11 | ✅ abgeschlossen | 2026-05-30 |
| M-12 | ✅ abgeschlossen | 2026-05-30 |
| M-13 | ✅ abgeschlossen | 2026-05-30 |

---

## 8. Nächster Schritt (M-01)

`api/config/planFeatures.js` um 8 Feature-Keys erweitern:
- `public_profile_basic` — PLUS, PRO, INDIVIDUELL
- `public_profile_visibility` — PRO, INDIVIDUELL
- `profile_analytics_basic` — PRO, INDIVIDUELL
- `profile_analytics_advanced` — INDIVIDUELL
- `marketplace_ranking_participation` — PRO, INDIVIDUELL
- `marketplace_featured_profile` — INDIVIDUELL (+ Staff-Add-on, coming_soon für jetzt)
- `verified_deal_reviews` — PRO, INDIVIDUELL
- `profile_bounties` — INDIVIDUELL (coming_soon für jetzt)

Dann Tests: pro Plan welche Keys aktiv sind.
