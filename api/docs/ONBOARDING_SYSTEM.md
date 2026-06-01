# Enterprise Onboarding System

Persistent, role-aware onboarding checklist with auto-detection, dashboard integration, and granular step tracking.

## Architecture

### Database
- **`user_onboarding_progress`** (migration 048) — per-user, per-step tracking with `completed`, `completed_at`, `auto_detected` flags
- UNIQUE constraint on `(user_id, step_key)` — upsert-safe
- Back-fill from existing platform activity on migration

### Service Layer
- **`services/onboardingService.js`** — STEP_CATALOG (7 steps), auto-detection probes, role filtering, legacy compatibility

### API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/onboarding/status` | Full checklist with auto-detection |
| POST | `/api/onboarding/complete-step` | Manually complete a step (`{ step: "step_key" }`) |
| POST | `/api/onboarding/dismiss` | Dismiss checklist (marks onboarding_completed) |
| GET | `/api/me/onboarding-status` | Legacy endpoint (delegates to new service, returns 3-step format) |

All endpoints require authentication (`requireAuth`).

## Step Catalog

| Order | Key | Label | Roles | Auto-Detected |
|-------|-----|-------|-------|---------------|
| 1 | `profile_complete` | Profil vervollständigen | all | ✅ users table |
| 2 | `org_configured` | Organisation konfigurieren | company, agency, admin | ✅ org_memberships |
| 3 | `first_capacity` | Erstes Angebot einstellen | agency, company | ✅ listings / capacity_posts |
| 4 | `first_request` | Erste Anfrage senden | company, agency | ✅ requests table |
| 5 | `first_deal` | Ersten Deal abschließen | company, agency | ✅ requests (accepted/completed) |
| 6 | `team_invited` | Teammitglied einladen | company, agency, admin | ✅ org_memberships count ≥ 2 |
| 7 | `platform_explored` | Plattform erkunden | all | ❌ manual only |

## Auto-Detection

Each step has a `detect(pool, userId, orgId)` async function that queries real platform data. Auto-detection runs on every `GET /api/onboarding/status` call for incomplete steps. Detected completions are persisted with `auto_detected = TRUE`.

## Dashboard Integration

The enterprise hub (`enterprise.html`) renders a dynamic onboarding checklist card:
- Progress bar with percentage
- Step-by-step list with completion icons and CTA links
- Dismiss button (calls `/api/onboarding/dismiss`)
- Hidden when dismissed or 100% complete

## Legacy Compatibility

The existing `GET /api/me/onboarding-status` endpoint now delegates to `onboardingService.getOnboardingStatus()` and converts the result via `toLegacyFormat()`, preserving the 3-step response shape (`profile_basics`, `company_profile`, `first_action`) expected by `onboardingWizard.js`.

## Extending

Add new steps by appending to `STEP_CATALOG` in `onboardingService.js`:
```js
{
  key: "new_step_key",
  label: "German Label",
  description: "Guidance text",
  icon: "🆕",
  link: "/public/page.html",
  roles: ["company", "agency"],  // or null for all
  order: 8,
  detect: async (pool, userId, orgId) => { /* probe */ return false; }
}
```

## Tests

68 tests in `test/onboarding.test.js` covering:
- STEP_CATALOG structure and uniqueness
- Role filtering (company, agency, worker, admin)
- getOnboardingStatus (progress, DB state, auto-detection, worker filtering)
- completeStep (valid/invalid keys, SQL params)
- dismissChecklist (markOnboardingComplete + platform_explored)
- toLegacyFormat (backward compatibility, progress calc, suggested_next)
- Auto-detection probes per step
- Legacy tests (getUserAndPlan, profile derivation, edge cases)
