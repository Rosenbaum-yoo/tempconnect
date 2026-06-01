-- =============================================================================
-- Migration 120: Marketplace Visibility Center (Phase 4 Track A — M-02)
--
-- Erstellt 8 neue Tabellen fuer das Marketplace Visibility Center.
-- Alle Aenderungen sind add-only, vollstaendig rueckwaertskompatibel.
--
-- Tabellen:
--   1. profile_visibility_settings  — Sichtbarkeitssteuerung (OPT-IN, default OFF)
--   2. profile_view_events          — Anonymisiertes View-Tracking (IP/UA nur als Hash)
--   3. profile_likes                — Like-System (kein Self-Like, idempotent)
--   4. profile_favorites            — Private Merkliste (per User)
--   5. profile_ranking_snapshots    — Zeitreihe von Ranking-Scores
--   6. profile_review_moderation    — Moderationsstatus fuer Bewertungen (extends ratings)
--   7. profile_bounties             — Staff-gesteuerte Profil-Promotions (Staff-Freigabe Pflicht)
--   8. profile_abuse_reports        — Missbrauchsmeldungen auf oeffentlichen Profilen
--
-- Nicht-verhandelbare Sicherheitsregeln (aus MARKETPLACE_VISIBILITY_CENTER.md §6):
--   - profile_view_events: IP/UA ausschliesslich als SHA-256-Hash gespeichert, nie Klartext
--   - profile_likes: DB-UNIQUE + CHECK(no self-like) — doppelte Like-Sperre zweistufig
--   - Sichtbar nur wenn: is_public=true AND status='approved' AND Plan OK AND NOT suspended
--   - Bounties: NIEMALS automatisch aktiviert — immer Staff-Freigabe (approved_by Pflicht)
--
-- Verweis auf Service-Logik (wird in M-03 gebaut):
--   api/services/profileVisibilityService.js
--   api/services/profileAnalyticsService.js
--   api/services/profileRankingService.js   (baut auf reputationService.js auf)
--   api/services/profileBountyService.js
-- =============================================================================

BEGIN;

SET client_min_messages TO WARNING;

-- ---------------------------------------------------------------------------
-- 1) profile_visibility_settings
--    Steuert ob ein Organisationsprofil oeffentlich sichtbar ist.
--    OPT-IN, default OFF (is_public = false, status = 'draft').
--    Zustandsmaschine: draft -> submitted -> approved | rejected
--                      approved -> suspended | paused -> approved (resume)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS profile_visibility_settings (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id           UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  is_public        BOOLEAN     NOT NULL DEFAULT false,
  status           TEXT        NOT NULL DEFAULT 'draft'
                               CHECK (status IN ('draft','submitted','approved','rejected','suspended','paused')),
  submitted_at     TIMESTAMPTZ,
  approved_at      TIMESTAMPTZ,
  reviewed_at      TIMESTAMPTZ,
  reviewed_by      UUID        REFERENCES users(id) ON DELETE SET NULL,
  rejection_reason TEXT,
  suspended_at     TIMESTAMPTZ,
  suspended_reason TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pvs_org_unique UNIQUE (org_id)
);

COMMENT ON COLUMN profile_visibility_settings.is_public
  IS 'OPT-IN: TRUE = Org hat aktiv entschieden, oeffentlich sichtbar zu sein. Default FALSE.';
COMMENT ON COLUMN profile_visibility_settings.status
  IS 'Moderationsstatus: draft|submitted|approved|rejected|suspended|paused. Sichtbar nur wenn approved UND is_public=true.';
COMMENT ON COLUMN profile_visibility_settings.reviewed_by
  IS 'Staff-User-ID der Person, die approve/reject/suspend ausgefuehrt hat.';

CREATE INDEX IF NOT EXISTS idx_pvs_org_id
  ON profile_visibility_settings(org_id);
CREATE INDEX IF NOT EXISTS idx_pvs_approved_public
  ON profile_visibility_settings(org_id)
  WHERE is_public = true AND status = 'approved';

-- ---------------------------------------------------------------------------
-- 2) profile_view_events
--    Anonymisiertes View-Tracking fuer oeffentliche Profile.
--    SICHERHEITSPFLICHT: IP und User-Agent werden ausschliesslich als
--    SHA-256-Hash gespeichert (hex-String). Niemals Klartext.
--    Hoher Schreibdurchsatz erwartet — Index bewusst minimal gehalten.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS profile_view_events (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  viewed_org_id    UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  viewer_org_id    UUID        REFERENCES organizations(id) ON DELETE SET NULL,
  viewer_user_id   UUID        REFERENCES users(id) ON DELETE SET NULL,
  ip_hash          TEXT        NOT NULL,
  ua_hash          TEXT        NOT NULL,
  referrer_section TEXT,
  viewed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN profile_view_events.viewer_org_id
  IS 'NULL = unauthentifizierter Besucher. Nie mit IP verknuepfen.';
COMMENT ON COLUMN profile_view_events.ip_hash
  IS 'SHA-256-Hash der Client-IP. Niemals Klartext speichern. Dient nur zur Deduplizierung innerhalb eines Tages.';
COMMENT ON COLUMN profile_view_events.ua_hash
  IS 'SHA-256-Hash des User-Agent-Strings. Niemals Klartext speichern.';
COMMENT ON COLUMN profile_view_events.referrer_section
  IS 'Optionaler Kontext: welcher Profilbereich wurde aufgerufen (z.B. capabilities, rankings, contact).';

CREATE INDEX IF NOT EXISTS idx_pve_viewed_org_at
  ON profile_view_events(viewed_org_id, viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_pve_viewer_org
  ON profile_view_events(viewer_org_id)
  WHERE viewer_org_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3) profile_likes
--    Like-System fuer oeffentliche Organisationsprofile.
--    Idempotent (UNIQUE-Constraint), rate-limited im Backend.
--    Kein Self-Like: CHECK stellt sicher, dass liked_org_id != liker_org_id.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS profile_likes (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  liked_org_id   UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  liker_user_id  UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  liker_org_id   UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pl_unique UNIQUE (liked_org_id, liker_user_id),
  CONSTRAINT pl_no_self_like CHECK (liked_org_id <> liker_org_id)
);

COMMENT ON COLUMN profile_likes.liker_org_id
  IS 'Org des likenden Users. Ermoeglicht CHECK fuer Self-Like-Sperre auf DB-Ebene.';
COMMENT ON CONSTRAINT pl_no_self_like ON profile_likes
  IS 'Self-Like-Sperre: Eine Org darf ihr eigenes Profil nicht liken. Wird zusaetzlich im Backend geprueft.';

CREATE INDEX IF NOT EXISTS idx_pl_liked_org
  ON profile_likes(liked_org_id);
CREATE INDEX IF NOT EXISTS idx_pl_liker_user
  ON profile_likes(liker_user_id);

-- ---------------------------------------------------------------------------
-- 4) profile_favorites
--    Private Merkliste — nur fuer den jeweiligen User sichtbar, nie oeffentlich.
--    Optional: persoenliche Notiz (z.B. "Anfragen Q3").
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS profile_favorites (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  favorited_org_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  note             TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pf_unique UNIQUE (owner_user_id, favorited_org_id)
);

COMMENT ON TABLE profile_favorites
  IS 'Private Merkliste. Niemals oeffentlich sichtbar — immer owner_user_id-gebunden lesen.';

CREATE INDEX IF NOT EXISTS idx_pf_owner_user
  ON profile_favorites(owner_user_id);

-- ---------------------------------------------------------------------------
-- 5) profile_ranking_snapshots
--    Tagessnapshots des Ranking-Scores fuer oeffentliche Profile.
--    Baut auf reputationService.js-Scoring auf (computeRankingScore,
--    computePremiumBoost, computeEffectiveRankScore — bereits implementiert).
--    Dient als Zeitreihe fuer Trending-Berechnung und oeffentliches Ranking-Display.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS profile_ranking_snapshots (
  id                   UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id               UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  snapshot_date        DATE        NOT NULL,
  ranking_score        NUMERIC(6,2) NOT NULL DEFAULT 0,
  reputation_score     NUMERIC(6,2),
  activity_score       NUMERIC(6,2),
  premium_boost        NUMERIC(6,2),
  effective_rank_score NUMERIC(6,2),
  rank_position        INT,
  rank_segment         TEXT
                       CHECK (rank_segment IN ('UNRATED','BRONZE','SILVER','GOLD','PLATINUM')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT prs_org_date_unique UNIQUE (org_id, snapshot_date)
);

COMMENT ON COLUMN profile_ranking_snapshots.effective_rank_score
  IS 'Ergebnis von reputationService.computeEffectiveRankScore(). Boost gedeckelt auf +10% des Basis-Scores.';
COMMENT ON COLUMN profile_ranking_snapshots.rank_position
  IS 'Absoluter Rang unter allen oeffentlichen Profilen zum Snapshot-Datum. NULL vor erstem Ranking-Run.';

CREATE INDEX IF NOT EXISTS idx_prs_org_date
  ON profile_ranking_snapshots(org_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_prs_date_score
  ON profile_ranking_snapshots(snapshot_date DESC, effective_rank_score DESC NULLS LAST)
  WHERE effective_rank_score IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 6) profile_review_moderation
--    Moderationsstatus fuer Bewertungen (extends ratings).
--    Neue Bewertungen sind pending — erst nach Staff-Approval oeffentlich sichtbar.
--    Ratings ohne Eintrag hier gelten als legacy (vor M-05) und folgen altem Verhalten.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS profile_review_moderation (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  rating_id        UUID        NOT NULL REFERENCES ratings(id) ON DELETE CASCADE,
  status           TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','approved','rejected','flagged')),
  moderated_by     UUID        REFERENCES users(id) ON DELETE SET NULL,
  moderated_at     TIMESTAMPTZ,
  rejection_reason TEXT,
  flag_reason      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT prm_rating_unique UNIQUE (rating_id)
);

COMMENT ON COLUMN profile_review_moderation.status
  IS 'pending = wartet auf Staff-Moderation; approved = oeffentlich sichtbar; rejected = nicht sichtbar; flagged = unter Pruefung.';
COMMENT ON COLUMN profile_review_moderation.moderated_by
  IS 'Staff-User-ID. Pflichtfeld fuer approved/rejected/flagged — wird im Service validiert.';

CREATE INDEX IF NOT EXISTS idx_prm_rating
  ON profile_review_moderation(rating_id);
CREATE INDEX IF NOT EXISTS idx_prm_pending
  ON profile_review_moderation(status, created_at ASC)
  WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- 7) profile_bounties
--    Staff-gesteuerte Profil-Promotions (Featured-Badge, Boost, Category-Top).
--    NIEMALS automatisch aktiviert — approved_by + Staff-Step-up Pflicht.
--    Lifecycle: draft -> pending -> approved -> active -> expired | rejected | cancelled
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS profile_bounties (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  requested_by    UUID        NOT NULL REFERENCES users(id),
  bounty_type     TEXT        NOT NULL
                              CHECK (bounty_type IN ('featured_badge','search_boost','category_top')),
  status          TEXT        NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft','pending','approved','active','expired','rejected','cancelled')),
  approved_by     UUID        REFERENCES users(id),
  approved_at     TIMESTAMPTZ,
  activated_at    TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  rejected_by     UUID        REFERENCES users(id),
  rejected_at     TIMESTAMPTZ,
  rejection_reason TEXT,
  staff_note      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE profile_bounties
  IS 'Staff-kontrollierte Profil-Promotions. Status active setzt IMMER approved_by voraus — niemals automatisch aktivieren.';
COMMENT ON COLUMN profile_bounties.approved_by
  IS 'Staff-User-ID. Pflichtfeld wenn status=active. Wird im Service (profileBountyService.js) serverseitig validiert.';
COMMENT ON COLUMN profile_bounties.expires_at
  IS 'Ablaufzeitpunkt der aktiven Promotion. Cron setzt status=expired wenn expires_at <= NOW().';

CREATE INDEX IF NOT EXISTS idx_pb_org
  ON profile_bounties(org_id);
CREATE INDEX IF NOT EXISTS idx_pb_active
  ON profile_bounties(org_id, status)
  WHERE status IN ('pending','active');
CREATE INDEX IF NOT EXISTS idx_pb_expiry
  ON profile_bounties(expires_at)
  WHERE status = 'active' AND expires_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 8) profile_abuse_reports
--    Missbrauchsmeldungen auf oeffentlichen Profilen.
--    reporter_user_id / reporter_org_id koennen NULL sein (anonyme Meldungen).
--    resolved_dismissed = kein Handlungsbedarf; resolved_action_taken = Massnahme ergriffen.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS profile_abuse_reports (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  reported_org_id  UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  reporter_user_id UUID        REFERENCES users(id) ON DELETE SET NULL,
  reporter_org_id  UUID        REFERENCES organizations(id) ON DELETE SET NULL,
  reason           TEXT        NOT NULL
                               CHECK (reason IN ('spam','misleading','inappropriate','fake','other')),
  details          TEXT,
  status           TEXT        NOT NULL DEFAULT 'open'
                               CHECK (status IN ('open','under_review','resolved_dismissed','resolved_action_taken')),
  reviewed_by      UUID        REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at      TIMESTAMPTZ,
  resolution_note  TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN profile_abuse_reports.reporter_user_id
  IS 'NULL = anonyme Meldung (kein Login erforderlich). Nie oeffentlich zeigen.';
COMMENT ON COLUMN profile_abuse_reports.status
  IS 'open = neu; under_review = Staff bearbeitet; resolved_dismissed = kein Handlungsbedarf; resolved_action_taken = Profil gesperrt/bearbeitet.';

CREATE INDEX IF NOT EXISTS idx_par_reported_org
  ON profile_abuse_reports(reported_org_id);
CREATE INDEX IF NOT EXISTS idx_par_open
  ON profile_abuse_reports(status, created_at ASC)
  WHERE status = 'open';

COMMIT;
