# Onboarding – 3-Minuten-Flow

## Übersicht

TempConnect führt neue Nutzer in drei Schritten zur ersten wertvollen Aktion:

1. **Willkommen & Plattform verstehen** – Rollenspezifische Begrüßung mit Kernfeatures
2. **Profil vervollständigen** – Firmenname, Ansprechpartner, Stadt, PLZ, Telefon
3. **Erste Aktion** – Personalanfrage erstellen (Unternehmen) oder Kapazität einstellen (Agentur)

Der Onboarding-Wizard erscheint als Modal-Overlay beim ersten Login. Demo-Nutzer und bereits ongeboardete Nutzer sehen den Wizard nicht.

## Architektur

```
Frontend (onboardingWizard.js)
  ├── GET /api/me                → prüft onboarding_completed + is_demo
  ├── GET /api/me/onboarding-status → strukturierter Fortschritt
  ├── PUT /api/me/profile        → Profildaten speichern (users-Tabelle)
  ├── PUT /api/company-profile   → Erweiterte Profildaten (company_profiles)
  └── POST /api/me/onboarding-complete → Onboarding abschließen
```

## API-Endpunkte

### GET /me/onboarding-status

Gibt den strukturierten Onboarding-Fortschritt zurück. Keine neuen DB-Spalten – leitet den Status aus vorhandenen Daten ab.

**Response:**
```json
{
  "onboarding_completed": false,
  "role": "company",
  "steps": {
    "profile_basics": { "done": true, "fields_filled": 3, "fields_total": 5 },
    "company_profile": { "done": false, "completeness_pct": 20 },
    "first_action": { "done": false, "type": "demand" }
  },
  "suggested_next": "company_profile",
  "progress_pct": 33
}
```

### POST /me/onboarding-complete

Setzt `onboarding_completed = TRUE` in der users-Tabelle.

### POST /me/onboarding-reset

Setzt `onboarding_completed = FALSE` zurück (z.B. für Support/Testing).

## Rollenspezifische Pfade

| Rolle | Step 2 Labels | Step 3 CTA | first_action.type |
|-------|---------------|------------|-------------------|
| **company** | Firmenname, Firma | „Erste Anfrage erstellen" → demand_create.html | demand |
| **agency** | Agenturname, Agentur, Hauptsitz | „Erstes Angebot erstellen" → capacity_exchange_form.html | capacity |
| **worker** | (Step 2 übersprungen) | „Meine Einsätze ansehen" → einsatzportal-einsaetze.html | assignment |

## Step-Completion-Logik

### profile_basics
- Prüft 5 Felder: `company_name`, `city`, `phone`, `contact_person`, `postal_code`
- **Done** wenn ≥ 3 Felder ausgefüllt (nicht leer, nicht nur Whitespace)

### company_profile
- Nutzt `companyProfileService.computeCompleteness()` (5 Sektionen: Übersicht, Kompetenzen, Standorte, Zertifizierungen, Kontakte)
- **Done** wenn Completeness ≥ 40%
- **Workers**: Immer done (kein Firmenprofil nötig)

### first_action
- **Company/Agency**: Prüft ob `listings` oder `requests` vorhanden
- **Worker**: Prüft ob `assignments` vorhanden

## Dashboard-Integration

Das Executive Dashboard zeigt einen „Onboarding fortsetzen"-Banner wenn:
- `onboarding_completed === false`
- Nutzer kein Demo-Account ist
- Banner zeigt Fortschritts-% und kontextbezogene Nachricht

## Datenbank

Migration `040_onboarding_wizard.sql`:
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE;
```

Back-fill: Bestehende aktive Nutzer (mit Requests/Listings oder Demo) werden als onboarded markiert.

## Frontend-Dateien

- `frontend/public/js/onboardingWizard.js` – 3-Step Modal-Wizard (IIFE)
- `frontend/public/onboarding.html` – Statische Landingpage (Pre-Login)
- `frontend/public/executive_dashboard.html` – Dashboard mit Onboarding-Banner

## Tests

```bash
node --test --test-force-exit test/onboarding.test.js
```

Testet: getUserAndPlan-Felder, Step-Derivation, Progress-Berechnung, Complete/Reset, Auth-Guard, Edge-Cases.
