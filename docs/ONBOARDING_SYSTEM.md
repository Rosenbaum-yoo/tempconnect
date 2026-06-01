# Onboarding System

## Übersicht

Das Onboarding-System führt neue Benutzer schrittweise durch die Plattform-Einrichtung. Es kombiniert **automatische Erkennung** (Probing realer Plattformaktivität) mit **manueller Bestätigung** und speichert den Fortschritt persistent in der Datenbank.

Das System erweitert das bestehende `users.onboarding_completed`-Flag um eine granulare, step-level Fortschrittserfassung.

## Architektur

```
STEP_CATALOG (7 Schritte, rollenbasiert)
       ↓
onboardingService.getOnboardingStatus()
  1. Katalog nach Rolle filtern
  2. Persisted Progress aus user_onboarding_progress laden
  3. Auto-Detection für fehlende Schritte ausführen
  4. Erkannte Schritte persistieren (UPSERT)
  5. Fortschritt berechnen + suggested_next
       ↓
GET /api/onboarding/status
       ↓
┌────────────────────────────────────────┐
│  Frontend:                              │
│  • Onboarding Checklist Widget          │
│  • Enterprise Hub Progress Bar          │
│  • Legacy onboardingWizard.js (3-Step)  │
└────────────────────────────────────────┘
```

## Onboarding-Schritte

### Step-Katalog

| # | Key | Label | Rollen | Auto-Detection |
|---|-----|-------|--------|----------------|
| 1 | `profile_complete` | Profil vervollständigen | Alle | `users.company_name`, `city`, `phone` nicht leer |
| 2 | `org_configured` | Organisation konfigurieren | company, agency, admin | Aktive `org_memberships` + `organizations.is_active` |
| 3 | `first_capacity` | Erstes Angebot einstellen | agency, company | Eintrag in `listings` oder `capacity_posts` |
| 4 | `first_request` | Erste Anfrage senden/erhalten | company, agency | Eintrag in `requests` (als requester oder receiver) |
| 5 | `first_deal` | Ersten Deal abschließen | company, agency | `requests.status` IN (accepted, completed, finalized) |
| 6 | `team_invited` | Teammitglied einladen | company, agency, admin | ≥ 2 aktive Mitglieder in `org_memberships` |
| 7 | `platform_explored` | Plattform erkunden | Alle | Nur manuell (Dismiss-Aktion) |

### Rollenbasierte Filterung

Nicht jede Rolle sieht alle Schritte:

- **company**: profile_complete, org_configured, first_capacity, first_request, first_deal, team_invited, platform_explored (7 Schritte)
- **agency**: Gleich wie company (7 Schritte)
- **worker**: profile_complete, platform_explored (2 Schritte)
- **admin**: profile_complete, org_configured, team_invited, platform_explored (4 Schritte)

Die Filterung erfolgt über das `roles`-Feld im `STEP_CATALOG`. `null` bedeutet: für alle Rollen sichtbar.

## Auto-Detection

Bei jedem Aufruf von `getOnboardingStatus()` werden noch nicht abgeschlossene Schritte automatisch geprüft:

1. Für jeden nicht-completed Schritt wird die `detect(pool, userId, orgId)`-Funktion aufgerufen
2. Erkennt die Probe-Funktion echte Plattformaktivität, wird der Schritt als `auto_detected: true` markiert
3. Erkannte Schritte werden sofort in `user_onboarding_progress` persistiert (UPSERT)
4. Fehlschläge einzelner Probes werden still ignoriert (non-critical)

Dies stellt sicher, dass Benutzer, die Aktionen vor dem Onboarding durchführen, automatisch als „erledigt" markiert werden.

## Fortschrittsspeicherung

### Datenbank-Tabelle: `user_onboarding_progress`

```
Migration: 048_onboarding_progress.sql
```

| Spalte | Typ | Beschreibung |
|--------|-----|--------------|
| `id` | UUID PK | Auto-generiert |
| `user_id` | UUID FK → users | Benutzer-Referenz |
| `org_id` | UUID FK → organizations | Organisations-Kontext (nullable) |
| `step_key` | TEXT | Schritt-Identifier aus STEP_CATALOG |
| `completed` | BOOLEAN | Abgeschlossen ja/nein |
| `completed_at` | TIMESTAMPTZ | Zeitpunkt der Fertigstellung |
| `auto_detected` | BOOLEAN | TRUE bei automatischer Erkennung |
| `created_at` | TIMESTAMPTZ | Erstellt am |
| `updated_at` | TIMESTAMPTZ | Zuletzt aktualisiert |

**Constraints:**
- `UNIQUE (user_id, step_key)` — Ein Schritt pro Benutzer
- `FK user_id → users(id) ON DELETE CASCADE`
- `FK org_id → organizations(id) ON DELETE SET NULL`

**Indexes:**
- `idx_onboarding_user_completed` — (user_id, completed) für schnelle Status-Abfragen
- `idx_onboarding_org` — (org_id) WHERE org_id IS NOT NULL für Org-Reports

### Backfill bei Migration

Migration 048 führt automatisch Backfill für bestehende Benutzer durch:

- `profile_complete` — Benutzer mit ausgefülltem company_name, city, phone
- `org_configured` — Benutzer mit aktiven Org-Mitgliedschaften
- `first_capacity` — Benutzer mit aktiven Listings
- `first_request` — Benutzer mit gesendeten Requests
- `first_deal` — Benutzer mit Deals im Status accepted/completed/finalized

## API-Endpoints

### GET /api/onboarding/status

Gibt den vollständigen Onboarding-Status mit Auto-Detection zurück.

**Auth:** `requireAuth`

**Response:**

```json
{
  "success": true,
  "data": {
    "onboarding_completed": false,
    "dismissed": false,
    "role": "company",
    "steps": [
      {
        "key": "profile_complete",
        "label": "Profil vervollständigen",
        "description": "Firmenname, Stadt und Telefon ausfüllen.",
        "icon": "👤",
        "link": "/public/sla_profil.html",
        "completed": true,
        "completed_at": "2026-03-16T10:00:00Z",
        "auto_detected": true
      },
      {
        "key": "org_configured",
        "label": "Organisation konfigurieren",
        "description": "Organisation erstellen oder beitreten.",
        "icon": "🏢",
        "link": "/public/sla_profil.html",
        "completed": false,
        "completed_at": null,
        "auto_detected": false
      }
    ],
    "completed_count": 3,
    "total_count": 7,
    "progress_pct": 43,
    "suggested_next": "org_configured",
    "suggested_next_link": "/public/sla_profil.html"
  }
}
```

### POST /api/onboarding/complete-step

Markiert einen Schritt manuell als abgeschlossen.

**Auth:** `requireAuth`
**Audit:** `onboarding.complete_step`

**Request:**
```json
{ "step": "platform_explored" }
```

**Response:**
```json
{ "success": true, "data": { "step": "platform_explored", "completed": true } }
```

**Fehler:**
- `400 MISSING_STEP` — Kein `step` im Body
- `400 INVALID_STEP` — Step-Key nicht im STEP_CATALOG

### POST /api/onboarding/dismiss

Blendet die Onboarding-Checkliste dauerhaft aus.

**Auth:** `requireAuth`
**Audit:** `onboarding.dismiss`

Setzt `users.onboarding_completed = TRUE` und markiert `platform_explored` als abgeschlossen.

**Response:**
```json
{ "success": true, "data": { "dismissed": true } }
```

## Portal-Trennung: Einsatzportal / Hauptplattform

Der Onboarding-Wizard wird **ausschließlich auf der Hauptplattform** angezeigt. Einsatzportal- und Worker-Seiten sind vollständig ausgeschlossen.

### Dreifache Absicherung

1. **Script-Entfernung**: Das `<script src="/public/js/onboardingWizard.js">` Tag wurde aus allen 11 Einsatzportal/Worker-HTML-Seiten entfernt (einsatzportal-dashboard, -profil, -benachrichtigungen, -einsaetze, -stundenzettel, -kontakt, -plan, worker-login, worker-portal, worker-timesheet, worker-submissions-review).
2. **URL-Guard** (Frontend): Die Wizard-IIFE prüft `window.location.pathname` gegen `/einsatzportal|worker-/` und bricht sofort ab.
3. **Rollen-Guard** (Frontend): Wenn `me.role === 'worker'`, wird der Wizard nicht angezeigt.

### Warum dreifach?

Worker registrieren sich über einen Einladungs-Link und durchlaufen einen separaten Registrierungsflow. Der Onboarding-Wizard der Hauptplattform wäre verwirrend und fehl am Platz.

## Session-Dismiss vs. Permanentes Dismiss

Der Wizard unterscheidet zwischen temporärem und permanentem Ausblenden:

### Session-Dismiss (Standard)

- **Auslöser**: Wizard schließen (X-Button, ESC, "Überspringen") **ohne** aktivierte Checkbox
- **Mechanismus**: `sessionStorage.setItem('tc_onboarding_seen', '1')`
- **Verhalten**: Wizard erscheint in der aktuellen Browser-Session nicht mehr. Bei neuem Tab/Login wird er erneut angezeigt.
- **Kein Server-Call**: Nur clientseitig, kein Netzwerk-Request.

### Permanentes Dismiss ("Nicht wieder anzeigen")

- **Auslöser**: Checkbox "Nicht wieder anzeigen" aktivieren + Wizard schließen, ODER "Fertig"/CTA klicken
- **Mechanismus**: `POST /me/onboarding-complete` → `users.onboarding_completed = TRUE`
- **Verhalten**: Wizard wird auf allen Geräten und in allen Sessions dauerhaft ausgeblendet.
- **Geräteübergreifend**: Da serverseitig gespeichert, greift die Einstellung auf allen Geräten.

### Zusammenfassung Dismiss-Logik

```
User schließt Wizard
  ├── Checkbox "Nicht wieder anzeigen" aktiv?
  │   ├── JA  → POST /me/onboarding-complete (permanent, server-side)
  │   └── NEIN → sessionStorage 'tc_onboarding_seen' = '1' (session only)
  └── "Fertig"/CTA geklickt?
      └── JA  → Immer POST /me/onboarding-complete (permanent)
```

## Legacy-Kompatibilität

Das bestehende `onboardingWizard.js`-Frontend erwartet ein 3-Schritt-Format. Die Funktion `toLegacyFormat()` in `onboardingService.js` mappt die 7 Schritte auf das Legacy-Schema:

| Legacy-Schritt | Mapping |
|----------------|---------|
| `profile_basics` | → `profile_complete` |
| `company_profile` | → `org_configured` |
| `first_action` | → `first_capacity` ODER `first_request` |

Neue Frontend-Implementierungen sollten das vollständige 7-Schritt-Format verwenden.

## Erweiterung

### Neuen Schritt hinzufügen

`api/services/onboardingService.js` → `STEP_CATALOG` Array erweitern:

```javascript
{
  key: "custom_step",
  label: "Neuer Schritt",
  description: "Beschreibung für den Benutzer.",
  icon: "🔔",
  link: "/public/target-page.html",
  roles: ["company", "agency"],  // null = alle Rollen
  order: 8,                       // Reihenfolge in der Anzeige
  detect: async (pool, userId, orgId) => {
    // Auto-Detection: true wenn Bedingung erfüllt
    const { rows } = await pool.query(
      "SELECT 1 FROM my_table WHERE user_id = $1 LIMIT 1",
      [userId]
    );
    return rows.length > 0;
  }
}
```

Keine Migration nötig — neue Step-Keys werden automatisch in `user_onboarding_progress` gespeichert (UPSERT).

### Planbasierte Erweiterung

Schritte können zukünftig planabhängig gemacht werden, indem das `roles`-Feld um ein `plans`-Feld ergänzt wird:

```javascript
{
  key: "advanced_feature",
  roles: ["company"],
  plans: ["pro", "enterprise"],  // Nur für Pro/Enterprise-Kunden
  // ...
}
```

Die Filterlogik in `getStepsForRole()` müsste dafür um einen Plan-Check erweitert werden.

### Org-weites Onboarding-Reporting

Für Admins, die den Onboarding-Fortschritt aller Org-Mitglieder sehen möchten:

```sql
SELECT u.email, u.role,
       COUNT(*) FILTER (WHERE uop.completed = TRUE) AS completed,
       COUNT(*) AS total
FROM users u
JOIN org_memberships om ON om.user_id = u.id AND om.org_id = $1
LEFT JOIN user_onboarding_progress uop ON uop.user_id = u.id
GROUP BY u.id, u.email, u.role;
```

## Dateien

- `api/services/onboardingService.js` — Step-Katalog, Auto-Detection, Status-Berechnung, Legacy-Mapping
- `api/routes/onboarding.js` — REST-Endpoints (status, complete-step, dismiss)
- `sql/migrations/048_onboarding_progress.sql` — Tabelle + Backfill
- `frontend/public/js/onboardingWizard.js` — 3-Step Wizard mit Portal-Guard, Session-Guard, "Nicht wieder anzeigen" Checkbox
- `api/test/onboarding.test.js` — Unit-Tests (Mock-Pool, kein DB-Zugriff)
