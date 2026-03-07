# Abo-Gating (FREE/BASIS/PLUS/NOTDIENST) – How to Test

## Übersicht

- **Legacy-Bereich** (index.html: Suche, Anbieten, Anfragen): nur **FREE** und **BASIS**.
- **Pulse-Bereich** (enterprise, Kapazitätssuche, Anfragen-SLA, Nachweise, etc.): nur **PLUS** und **NOTDIENST**.
- Unbekannter User/Plan gilt als **FREE**.
- Backend liefert bei Verstoß **403** mit `code: "FEATURE_NOT_ALLOWED"`.

---

## 1) Plan simulieren

- **Option A:** In der Datenbank `subscriptions` für den User einen Eintrag mit `plan = 'FREE' | 'BASIS' | 'PLUS' | 'NOTDIENST'` setzen (neuester Eintrag zählt).
- **Option B:** In der App eingeloggt unter „Abo-Modelle“ (index.html #subscription oder `/public/sla_abo.html`) den Plan wechseln (falls `POST /api/me/plan` freigegeben ist).
- **Option C:** Nach Login `POST /api/me/plan` mit Body `{ "plan": "PLUS" }` (oder BASIS, NOTDIENST) aufrufen.

---

## 2) URLs zum Testen

| URL | FREE/BASIS | PLUS/NOTDIENST |
|-----|------------|----------------|
| `/` (index.html, eingeloggt) | Legacy-Menü aktiv (Suche, Anbieten, Anfragen) | Legacy-Menü gesperrt, Hinweis „Zum Pulse-Dashboard“, Klick auf Suche/Anbieten/Anfragen zeigt Legacy-Locked-View |
| `/#dashboard`, `/#profile`, `/#requests` | Normale Seite | Legacy-Locked-View mit CTA „Zum Pulse-Dashboard“ |
| `/public/enterprise.html` | Paywall „Bereich nicht verfügbar“ + CTA Abo | SLA-Übersicht mit allen Karten |
| `/public/capacity_search.html` | Paywall | Kapazitätssuche |
| `/public/company_requests.html` | Paywall | Meine Anfragen |
| `/public/agency_inbox.html` | Paywall | Eingang |
| `/public/supplier_scorecard.html` | Paywall | Lieferanten-Bewertung |
| `/public/sla_abo.html` | Paywall (sla_subscriptions) | 4 Plan-Karten, aktueller Plan markiert |
| `/public/sla_profil.html` | Paywall (sla_profile) | Profil read-only |
| `/public/sla_nachweise.html` | Paywall (sla_proofs) | Upload-Bereich + „Kommt in Kürze“ |
| `/public/sla_hilfe.html` | Paywall (sla_help) | FAQ, Kontakt, Pulse-safe-Erklärung |
| `/public/sla_angebote.html` | Paywall (sla_offers_create) | Annahmen/Entwurf/Bitte prüfen + Disclaimer |
| `/api/sla/search-jobs` (POST) | 403 FEATURE_NOT_ALLOWED (sla_access) | 201, legt permanenten Suchauftrag an |
| `/api/sla/search-jobs` (GET) | 401/403 wenn nicht eingeloggt, sonst nur eigene Jobs sofern vorhanden (auch FREE/BASIS lesbar, aber ohne SLA-Felder relevant) | Eigene Jobs, inkl. SLA-Feldern |
| `/api/sla/search-jobs/:id/*` (close/pause/resume) | 403 FEATURE_NOT_ALLOWED (sla_access) | 200, Statuswechsel des Suchauftrags |

---

## 3) Backend-API prüfen

- **Legacy (nur FREE/BASIS):**
  - Als User mit Plan **PLUS** oder **NOTDIENST**: `GET /api/listings` → **403** mit `code: "FEATURE_NOT_ALLOWED"`, `feature: "legacy_access"`, `plan: "PLUS"` (oder NOTDIENST).
- **SLA (nur PLUS/NOTDIENST):**
  - Als User mit Plan **FREE** oder **BASIS**: `GET /api/capacities` → **403** mit `code: "FEATURE_NOT_ALLOWED"`, `feature: "sla_access"`.
  - `POST /api/requests` mit `capacity_id` und Plan FREE/BASIS → **403** `FEATURE_NOT_ALLOWED`, `feature: "sla_access"`.
- **Nachweise:** `GET /api/proofs` bzw. `POST /api/proofs` ohne Berechtigung → **403**; mit PLUS/NOTDIENST → **501** NOT_IMPLEMENTED (Stub).

---

## 4) Frontend-Checks

- **FREE/BASIS:** Auf `/public/enterprise.html` → Paywall sichtbar, kein stiller Redirect, keine leere Seite. CTA „Abo ansehen“ → `/public/sla_abo.html`.
- **PLUS/NOTDIENST:** Auf `/` → Legacy-Menüpunkte Suche/Anbieten/Anfragen als „locked“ (Hinweis + „Zum Pulse-Dashboard“). Direkt `/#dashboard` → Legacy-Locked-View mit CTA.
- **Locked Cards im Pulse-Dashboard:** Mit FREE/BASIS auf enterprise: alle SLA-Karten sichtbar; Karten wie „Angebote erstellen“, „Hilfe“, „Abo“, „Profil“, „Nachweise“ als **locked** (Schloss, „Verfügbar ab PLUS“, CTA „Upgrade ansehen“).

---

## 5) Zentrale Konfiguration

- Feature-Map: `api/config/planFeatures.js` (`planFeatures`, `hasFeature`, `getAllowedPlans`).
- Frontend lädt Konfiguration über `GET /api/plan-features` (öffentlich).
- Keine Hardcodings: alle Berechtigungen über `planFeatures`.

---

## 6) Kurz-Checkliste

- [ ] FREE: Legacy (Suche/Anbieten/Anfragen) nutzbar; SLA-URLs zeigen Paywall.
- [ ] BASIS: wie FREE.
- [ ] PLUS: SLA-URLs nutzbar; Legacy-Menü locked, Direktaufruf #dashboard/#profile/#requests zeigt Legacy-Locked-View.
- [ ] NOTDIENST: wie PLUS.
- [ ] Backend: 403 `FEATURE_NOT_ALLOWED` für geschützte APIs bei falschem Plan.
- [ ] Default: Unbekannter Plan = FREE.

---

## 7) Technische Details (Middleware & Frontend-Guard)

- **Backend-Middleware `requireFeature` (`api/middleware/featureGate.js`)**
  - Verwendet `hasFeature(plan, featureKey)` aus `api/config/planFeatures.js`.
  - Holt Plan über `getUserAndPlan(userId)`; unbekannter/fehlender Plan → **FREE**.
  - Bei Verstoß: **403** mit `code: "FEATURE_NOT_ALLOWED"`, `feature: "<key>"`, `plan: "<PLAN>"` + Server-Log `Feature gate violation`.
  - Ohne Session (`req.session.userId` fehlt): **401** `NOT_AUTHENTICATED`.

- **Konfig-API (`api/routes/plans.js`)**
  - `GET /api/plans` → `PLAN_LIMITS` (Limits wie `requests_send`, `notdienst`, etc. je Plan).
  - `GET /api/plan-features` → `{ PLAN, planFeatures }` (Quelle für Frontend-Guard).
  - Zum Testen im Browser/Insomnia aufrufen und prüfen, ob neue Features in `planFeatures` sichtbar sind.

- **Frontend-Guard (`frontend/public/js/planFeatures.js` + `frontend/public/js/slaGuard.js`)**
  - `planFeatures.js` lädt einmalig `GET /api/plan-features` und stellt `PlanFeatures.PLAN`, `PlanFeatures.planFeatures`, `PlanFeatures.hasFeature(plan, key)` und `PlanFeatures.getAllowedPlans(key)` bereit.
  - `slaGuard.js` aktiviert sich auf Seiten mit `data-sla-guard="sla_access"` (oder anderem Feature-Key) am `<body>`.
  - Wenn User **keinen** Zugriff hat:
    - `#paywall` wird eingeblendet, `#main-content` ausgeblendet.
    - `#paywall-feature-name` zeigt bei `sla_access` „Pulse-Bereich“, sonst den Feature-Key.
    - `#paywall-current-plan` zeigt den aktuellen Plan.
    - `#paywall-cta` verlinkt auf `/public/sla_abo.html`.
  - Wenn Zugriff besteht: `#paywall` wird versteckt, Inhalt bleibt sichtbar.

- **Requests & NOTDIENST (`api/routes/requests.js`)**
  - `POST /api/requests` mit `capacity_id`:
    - Prüft zuerst Limits (`me.limits.requests_send`, `me.usage.sent_count`) → ggf. **403** `LIMIT_REACHED`.
    - Prüft dann Plan: ohne `sla_access` → **403** mit `code: "FEATURE_NOT_ALLOWED"`, `feature: "sla_access"`, `plan`.
    - `priority: "NOTDIENST"` ohne entsprechendes Recht (`me.limits.notdienst === false`) → **403** `PLAN_REQUIRED_NOTDIENST`.
  - `POST /api/requests/broadcast`:
    - Ebenfalls durch `requests_send`-Limit begrenzt, Anzahl der erzeugten Requests in Response (`created`, `limited`).

