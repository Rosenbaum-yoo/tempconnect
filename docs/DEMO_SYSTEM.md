# Demo-Modus & Guided Experience

## Übersicht
Marketing-grade Demo-System für TempConnect. Ermöglicht Interessenten, die Plattform ohne Registrierung aus verschiedenen Rollen-Perspektiven zu erkunden — mit realistischen NRW-Zeitarbeitsdaten.

## Architektur

```
demo.html (Frontend)
  ├── 3 Rollen-Karten (Buyer / Agency / Admin)
  ├── Plan-Toggle (BASIS / PLUS / PRO / ENTERPRISE)
  └── Demo.start({ role }) / Demo.start({ plan })
          │
          ▼
POST /api/auth/demo-login  (api/routes/demo.js)
  ├── Pfad 1: { role: "buyer"|"agency"|"admin" }  → ROLE_ACCOUNTS
  └── Pfad 2: { plan: "ENTERPRISE"|"PLUS"|... }   → PLAN_ACCOUNTS (Legacy)
          │
          ▼
Session: { userId, userRole, isDemo: true }
          │
          ▼
demoGuard.js (Middleware) → blockiert DELETE /me, Passwort, Plan-Änderungen
demoBanner.js → persistenter "Demo-Modus" Banner
contextHints.js → seitenspezifische Guidance-Banner (nur Demo)
```

## Demo-Accounts

Alle Accounts verwenden das Passwort `DemoPass2026!`.

**Primär (Rollen-basiert):**
- `demo-buyer@tempconnect.de` — Nordbau Industrie GmbH, company, ENTERPRISE
- `demo-agency@tempconnect.de` — ElektroStaff GmbH, agency, ENTERPRISE  
- `demo-admin@tempconnect.de` — Nordbau Industrie GmbH, company/admin, ENTERPRISE

**Sekundär (Plan-basiert):**
- `demo-buyer2@tempconnect.de` — BauWest AG, company, PLUS
- `demo-agency2@tempconnect.de` — StahlPro Personal, agency, PRO
- `demo-agency3@tempconnect.de` — RheinWorker Solutions, agency, BASIS

## Seed-Daten (Migration 052)

NRW-Zeitarbeitsszenario mit konsistenten Beziehungen:

- **5 Organisationen** — 2 Buyer (Nordbau, BauWest), 3 Agenturen (ElektroStaff, StahlPro, RheinWorker)
- **6 Org-Memberships** — Owner/Admin-Zuordnungen
- **6 Subscriptions** — ENTERPRISE, PLUS, PRO, BASIS
- **4 Listings** — Marktplatz-Einträge (3 supply, 1 demand)
- **8 Capacity Posts** — Elektro, IT, Schweißer, CNC, Lager, Bau, Pflege, Mechanik
- **5 Demand Requests** — Verschiedene Dringlichkeitsstufen
- **3 Contracts** — MSA (active), Framework (draft), Framework (expired)
- **4 Assignments** — active, active, completed, planned
- **4 Rate Cards** — Elektriker, Schweißer, Lager, Pflege (NRW)
- **5 Compliance-Dokumente** — AÜG, Versicherung, Arbeitssicherheit, ISO, DSGVO
- **8 Notifications** — Angebote, Compliance-Warnungen, SLA, Admin-Hinweise
- **3 Timesheets** + 15 Entries — approved, submitted, approved
- **4 Ratings** — 3–5 Sterne mit detaillierten Kommentaren
- **3 Requests** — ACCEPTED, FINALIZED, SENT

Alle Seed-Daten verwenden UUIDs mit `d0`-Prefix (z.B. `d0a00000-...`). `ON CONFLICT DO NOTHING` macht die Migration idempotent.

## API-Endpunkte

### POST /api/auth/demo-login
Passwortloser Login. Akzeptiert `{ role }` (primär) oder `{ plan }` (Legacy).

**Request:**
```json
{ "role": "buyer" }
// oder
{ "plan": "ENTERPRISE" }
```

**Response:** Vollständiges User-Objekt mit `is_demo: true`

### POST /api/demo/reset
Löscht Session-erstellte Daten (nicht-Seed), behält Seed-Daten.  
Nur für `isDemo`-Sessions (403 sonst).

### GET /api/demo/accounts
Öffentlich. Liefert verfügbare Rollen, Pläne und Account-Metadaten.

## Context Hints (Guidance)

`frontend/public/js/contextHints.js` — IIFE mit:
- **Pathname-Map**: 13 Seiten (12 Enterprise + Marktplatz)
- **Aktivierung**: Nur wenn `body[data-demo="true"]` oder `.demo-banner` vorhanden
- **UI**: Fixed-Position Banner (rechts unten), collapsible, animiert
- **Dismiss**: Per ✕-Button, gespeichert in `localStorage` (`contextHint:/path`)
- **Inhalt**: Titel, Beschreibungstext, kontextueller Tipp pro Seite

Eingebunden in: enterprise, rate-cards, spend-analytics, timesheets, capacity_exchange, company_requests, vendor_pool, compliance_overview, notifications, organization, requisitions, matching_results, index.html

## Demo-Guard (Middleware)

`api/middleware/demoGuard.js` blockiert für `isDemo`-Sessions:
- `DELETE /api/me` (Account-Löschung)
- `POST /api/me/change-password`
- `POST /api/me/plan` / `POST /api/me/plan/cancel`

## Tests

```bash
node --test --test-force-exit api/test/demo.test.js       # 22 Tests
node --test --test-force-exit api/test/demoGuard.test.js   # 15 Tests
```

## Erweiterung

**Neue Seite mit Context Hint:**
1. Hint-Eintrag in `contextHints.js` HINTS-Map ergänzen
2. `<script src="/public/js/contextHints.js"></script>` vor `</body>` einfügen

**Neuer Demo-Account:**
1. INSERT in Migration 052 (users, org_memberships, subscriptions)
2. Email in `ROLE_ACCOUNTS` oder `PLAN_ACCOUNTS` in `demo.js` registrieren

**Seed-Daten erweitern:**
1. Neue INSERTs in Migration 052 mit `d0`-Prefix-UUIDs und `ON CONFLICT DO NOTHING`
