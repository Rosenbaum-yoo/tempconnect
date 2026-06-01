# OpenAPI Spec Drift Report — TempConnect

> Erstellt: 2026-05-28 | C-02 / WAVE_02
> Zweck: Dokumentierter Vergleich zwischen `api/openapi/spec.json` und den tatsächlich registrierten API-Routen.

---

## Zusammenfassung

| Metrik | Wert |
|---|---|
| Pfade in `spec.json` | **27** |
| Tatsächlich registrierte Route-Pfade (non-v1) | **747** |
| Abdeckung der spec.json | **< 4 %** |
| Stand des spec.json | Erstellungsdatum der Plattform (Pilot-Phase) — nie aktualisiert |
| Kanonische Referenz (OE-01 Entscheidung 2026-05-27) | `openapi/spec.json` ist kanonisch; `api-reference.md` bleibt als human-readable Ergänzung |

**Bewertung:** Das `spec.json` deckt nur die initiale Pilot-Launch-API ab. Es ist kein aktuelles API-Dokument, sondern ein veralteter Snapshot. Vor Enterprise-Kunden-Onboarding muss entweder (a) spec.json vollständig regeneriert oder (b) klar kommuniziert werden, dass `api-reference.md` die aktuelle Dokumentation ist.

---

## Was spec.json abdeckt (vollständig)

Die 27 Pfade aus `spec.json` decken folgende Route-Familien ab:

| Pfad-Familie | Pfade in spec.json | Status |
|---|---|---|
| `/health`, `/service-status` | 2 | Aktuell ✅ |
| `/csrf-token` ← kanonisch ist `/csrf` | 1 | **Veraltet** — Route heißt jetzt `/api/csrf` |
| `/auth/*` (register, login, logout, forgot/reset password) | 5 | Aktuell ✅ |
| `/me` | 1 | Aktuell (PATCH/GET fehlt) |
| `/payment/*` (config, checkout, confirm) | 3 | Aktuell ✅ (Stripe-Flow) |
| `/organizations` + `/{id}` + `/{id}/members` | 3 | Aktuell, erweitert durch 17+ weitere Org-Routen |
| `/requisitions` + `/{id}` + `/{id}/transition` + `/{id}/approve` | 4 | Aktuell, 12 weitere Req-Routen fehlen |
| `/capacities` | 1 | Aktuell, 5 weitere fehlen |
| `/timesheets` + Unterpfade (entries/submit/approve/reject) | 5 | Aktuell, 19 weitere fehlen |
| `/public/system-status` | 1 | Aktuell ✅ |
| `/listings` | 1 | Aktuell, 4 weitere fehlen |

---

## Was spec.json NICHT abdeckt (Route-Familien-Übersicht)

Folgende 85+ Route-Familien mit ~720 Pfaden sind **nicht in spec.json dokumentiert**:

| Route-Familie | Geschätzte Pfade | Priorität für Dokumentation |
|---|---|---|
| `/admin/*` | 33 | P1 (Integrations-Partner, Support) |
| `/marketplace/*` | 36 | P1 (Kernfunktion) |
| `/worker/*` | 31 | P1 (Worker-Portal) |
| `/internal-control/*` | 15 | P1 (Ops-API) |
| `/org/*` | 25 | P1 (Org-Verwaltung) |
| `/me/*` | 20 | P2 (Profil/Einstellungen) |
| `/spend-analytics/*` | 8 | P1 (Enterprise-Feature) |
| `/reporting/*` | 8 | P1 (Executive-Dashboard) |
| `/suppliers/*` | 13 | P1 (Vendor-Pool) |
| `/rate-cards/*` | 9 | P1 (Preisrahmen) |
| `/support/*` | 17 | P1 (SOC-Schnittstelle) |
| `/analytics/*` | 14 | P2 |
| `/sla/*` | 14 | P2 |
| `/company-profile/*` | 17 | P2 |
| `/invoices/*` | 15 | P1 (Finance) |
| `/subscription-requests/*` | 7 | P1 (Commercial Flow) |
| `/timesheets/*` (Erweiterungen) | 19 | P2 |
| `/requisitions/*` (Erweiterungen) | 12 | P2 |
| `/agency/submissions/*` | 17 | P2 |
| `/sso/*` | 9 | P1 (Enterprise SSO) |
| `/mfa/*` | 5 | P1 (Security) |
| `/compliance-documents/*` | 9 | P2 |
| `/workers/*` | 16 | P2 |
| `/referral/*` | 6 | P3 |
| `/credits/*` | 4 | P3 |
| `/capacity-exchange/*` | 20 | P3 |
| Weitere ~60 Familien | ~350 | P3 |

---

## Bekannte Einzeldifferenz: `/csrf-token` vs. `/csrf`

spec.json nennt `/csrf-token`. Die tatsächliche Route ist `GET /api/csrf` (seit WAVE_01 Audit 2026-05-27 bestätigt).
→ **spec.json muss für diesen Pfad korrigiert werden, wenn er als kanonisch gilt.**

---

## Empfohlene Strategie

### Option A — Auto-Generierung (empfohlen, 3–4 Stunden)
1. `express-openapi-gen` oder `swagger-autogen` als Dev-Dependency einbauen
2. Alle Route-Dateien annotieren mit JSDoc `@swagger` Kommentaren
3. `npm run generate:openapi` → `api/openapi/spec.json` wird überschrieben
4. CI: `spec.json` muss mit Output von `generate:openapi` identisch sein

### Option B — Manuelle Aktualisierung (P1-Pfade, 8–12 Stunden)
Nur die P1-Route-Familien dokumentieren (admin, marketplace, spend, reporting, invoices, sso).
Realistischer Scope: 80–100 Pfade.

### Option C — Freeze (aktueller Zustand)
spec.json bleibt als "historischer Pilot-Snapshot". API-Dokumentation läuft über:
- `docs/API_DOCUMENTATION.md` (manuell)
- `docs/api-reference.md` (per OE-01 Entscheidung)
Kein Integrationspartner darf spec.json als aktuelle Referenz nutzen.

**Empfehlung für Go-Live:** Option C mit klarem Hinweis + Option A als Post-Launch-Aufgabe.
Kein Enterprise-Kunde darf spec.json ohne diesen Hinweis erhalten.

---

## Sofortmaßnahmen (vor Go-Live)

1. **[Pflicht]** Hinweis in spec.json einfügen, dass es veraltet ist:
   `"x-deprecated": "Dieser Snapshot entspricht dem Pilot-Launch. Aktuelle API: docs/API_DOCUMENTATION.md"`
2. **[Pflicht]** `/csrf-token` → `/csrf` korrigieren
3. **[Empfohlen]** README-Verweis von spec.json auf api-reference.md anpassen
4. **[Post-Launch]** Auto-Generierung implementieren (Option A)

---

## Änderungshistorie

| Datum | Änderung |
|---|---|
| 2026-05-28 | Initial erstellt (C-02 / WAVE_02) — Gap-Assessment 27 vs. 747 Pfade |
