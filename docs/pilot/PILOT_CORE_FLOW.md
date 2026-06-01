# TempConnect — Pilot Core Flow

> Klickbarer, abnahmefähiger Kernflow für Pilot-Kunden.
> Alle Schritte sind manuell prüfbar und müssen 0 Sackgassen, 0 500-Fehler, 0 Fake-KPIs produzieren.
>
> WAVE 07 — Phase 2 — 2026-05-26

---

## Voraussetzungen

### Pflicht-Seed (Pilot-Datensatz)

Vor dem ersten Pilot-Test muss folgende Datenbasis vorhanden sein:

| Entität | Anzahl | Details |
|---|---|---|
| Company (Auftraggeber) | 1 | Org-Typ: company, Plan: INDIVIDUELL, pilot_status: active |
| Agency (Lieferant) | 2–3 | Org-Typ: agency, Plan: PRO oder INDIVIDUELL |
| Worker-Profile | 5–10 | Verknüpft mit Agency-Org |
| Requisitions | 3 | Status: open, 1× mit Match |
| Rate Cards | 2 | 1× company-seitig, 1× agency-seitig |
| Match | 1 | Requisition → Worker-Profil |
| Assignment | 1 | Status: active |
| Timesheet | 1 | Status: submitted oder approved |
| Spend-Datensatz | 1 | Via Timesheet oder Invoice |
| Compliance-Warnung | 1 | Abgelaufenes Dokument |

**Seed-Skript:** `sql/seeds/dev-data.sql` (vorhandenes Seed-Skript)  
**Anleitung:** `sql/seed.sh` ausführen

---

## Kernflow — 10 Schritte

### Schritt 1: Login

**URL:** `/public/login.html`  
**Aktion:** Mit Company-User einloggen (owner oder admin Rolle)  
**Erwartetes Ergebnis:**
- Weiterleitung auf `/public/enterprise.html` (Enterprise Hub)
- Session gesetzt, `req.session.userId` vorhanden
- `req.orgId` aufgelöst

**CTA-Prüfung:** "Anmelden"-Button → POST `/api/auth/login`  
**Empty State:** Keine Anzeige bei fehlgeschlagenen Zugangsdaten (klare Fehlermeldung, kein 500)

---

### Schritt 2: Organisation auswählen / Hub öffnen

**URL:** `/public/enterprise.html`  
**Aktion:** Hub öffnen, Org-Context prüfen  
**Erwartetes Ergebnis:**
- Korrekte Org-Name-Anzeige oben
- Hub-Cards entsprechend Rolle und Plan sichtbar (`hidden_plan_locked` für gesperrte Features)
- Keine leere Seite bei fehlendem Org-Context

**API:** `GET /api/me` → `{ orgId, orgName, orgRole, plan }`  
**Empty State:** Wenn kein Org-Kontext → Hinweis "Keine Organisation ausgewählt" (nicht 500)

---

### Schritt 3: Requisition erstellen

**URL:** `/public/enterprise.html` → Requisitions-Karte klicken  
**Aktion:** Neue Anforderung anlegen  
**Erwartetes Ergebnis:**
- Formular öffnet sich
- POST `/api/requisitions` erstellt Requisition
- Weiterleitung auf Requisition-Detail
- Audit-Eintrag in `audit_log`

**Rollen-Prüfung:** `requisition.create` Permission erforderlich (owner/admin/program_manager/hiring_manager/recruiter)  
**Plan-Prüfung:** `persistent_requisitions` Feature ab PLUS  
**Empty State:** Leere Requisitions-Liste → "Noch keine Anforderungen — Jetzt erstellen" Button

---

### Schritt 4: Vendor Pool nutzen

**URL:** `/public/vendor_pool.html`  
**Aktion:** Verfügbare Lieferanten im Vendor Pool ansehen  
**Erwartetes Ergebnis:**
- Lieferantenliste (oder Zero-State wenn leer)
- Lieferanten-Details öffnen
- Keine Daten anderer Orgs sichtbar (RLS)

**API:** `GET /api/vendor-pool` → `{ data: [...], scope: { orgId, ... } }`  
**Plan-Prüfung:** Feature `supplier_management` (INDIVIDUELL)  
**Empty State:** `{ data: [], available: true }` — "Noch keine Lieferanten im Pool"

---

### Schritt 5: Matching / Capacity prüfen

**URL:** `/public/capacity_exchange_feed.html`  
**Aktion:** Capacity Exchange durchsuchen  
**Erwartetes Ergebnis:**
- Verfügbare Kapazitäten anzeigen
- Filter nach Qualifikation/Region funktionieren

**API:** `GET /api/capacity-exchange/feed`  
**Plan-Prüfung:** `capacity_exchange_basic` ab DEMO  
**Empty State:** `{ data: [], message: "Keine passenden Kapazitäten" }` — kein Crash

---

### Schritt 6: Assignment / Deal aktivieren

**URL:** `/public/enterprise.html` → Assignments-Karte  
**Aktion:** Assignment aus einem Match aktivieren  
**Erwartetes Ergebnis:**
- Assignment in Status `active`
- Audit-Eintrag mit `actor_user_id`
- Kein `500` wenn Assignment leer

**API:** `POST /api/assignments` → `{ id, status: "active", ... }`  
**Plan-Prüfung:** Feature `assignments` (INDIVIDUELL oder Pilot)  
**Rollen-Prüfung:** `assignment.create` (owner/admin/program_manager/hiring_manager/dispatcher)  
**Empty State:** `{ data: [], available: true }` — "Noch keine Einsätze"

---

### Schritt 7: Timesheet / Leistung erfassen

**URL:** `/public/timesheets.html`  
**Aktion:** Zeiterfassung für aktiven Einsatz  
**Erwartetes Ergebnis:**
- Timesheet-Formular verfügbar
- POST `/api/timesheets` erstellt Eintrag
- Status: `draft` → `submitted`
- Genehmigung möglich (owner/admin)

**API:** `POST /api/timesheets`, `PUT /api/timesheets/:id/submit`  
**Plan-Prüfung:** Feature `timesheets` ab PLUS  
**Rollen-Prüfung:** Erstellen: owner/admin/supplier_user/dispatcher/recruiter; Genehmigen: owner/admin/program_manager/hiring_manager/finance  
**Empty State:** Leere Timesheet-Liste → "Noch keine Zeiterfassungen"

---

### Schritt 8: Spend auswerten

**URL:** `/public/spend-analytics.html`  
**Aktion:** Spend Analytics für letzten Monat öffnen  
**Erwartetes Ergebnis:**
- KPI-Karten mit Echtdaten (nicht Fake-Werten)
- Scope-Anzeige: Org | Standort | Zeitraum
- Drilldown auf Einzelpositionen möglich

**API:** `GET /api/spend-analytics?window_days=30`  
**Response-Shape:**
```json
{
  "success": true,
  "data": { "total_spend": 0, "trends": [] },
  "scope": { "org_id": "...", "date_from": "...", "date_to": "...", "window_days": 30 }
}
```
**Plan-Prüfung:** Feature `spend_analytics` (PRO/INDIVIDUELL)  
**Empty State:** `total_spend: 0, trends: []` — "Noch keine Ausgabendaten" (kein Crash)

---

### Schritt 9: Executive Dashboard prüfen

**URL:** `/public/executive_dashboard.html`  
**Aktion:** Management-Übersicht öffnen  
**Erwartetes Ergebnis:**
- KPIs aus echten DB-Daten
- Scope-Bar sichtbar (Org / Standort / Zeitraum / Datenstand)
- Drilldown-Links führen zu korrekten Seiten

**API:** `GET /api/workforce/kpis`, `GET /api/reports/executive`  
**Pflicht-KPIs:**
- Offene Requisitions (aus `requisitions` WHERE status = 'open')
- Aktive Vendoren (aus `vendor_pool_entries`)
- Spend 30 Tage (aus `timesheets`/`invoices`)
- Compliance-Warnungen (abgelaufene Dokumente)

**Empty State:** Alle KPIs = 0 mit "Keine Daten" Tooltip (kein Spinner-forever, kein 500)

---

### Schritt 10: Plan / Upgrade / Enterprise Request

**URL:** `/public/pricing.html` oder Hub Upgrade-CTA  
**Aktion:** Upgrade-Pfad testen  
**Erwartetes Ergebnis:**
- Aktueller Plan sichtbar
- Upgrade-CTA korrekt (kein falscher "bereits aktiviert")
- INDIVIDUELL-Anfrage-Formular funktioniert
- Keine Fake-Zahlung initiiert

**API:** `POST /api/subscription-requests` → Anfrage erstellt, Staff sieht sie  
**Empty State:** "Keine aktiven Pläne" → Sofort-Upgrade-CTA  

---

## Abnahme-Checkliste (manuell)

Vor Pilot-Go-Live einmalig durchführen:

```
□ Schritt 1:  Login funktioniert, Session gesetzt
□ Schritt 2:  Hub-Cards korrekt (Rolle + Plan beachtet)
□ Schritt 3:  Requisition anlegen → Detail → zurück
□ Schritt 4:  Vendor Pool öffnet → Liste oder Zero-State
□ Schritt 5:  Capacity Feed öffnet → kein 500 bei leer
□ Schritt 6:  Assignment erstellen → Status active
□ Schritt 7:  Timesheet erstellen → submit → genehmigen
□ Schritt 8:  Spend Analytics → Scope-Bar → kein 500
□ Schritt 9:  Executive Dashboard → Scope → Drilldowns
□ Schritt 10: Upgrade-CTA → Formular → Anfrage gesendet

Zusatz:
□ Login als Agency-User → korrekte Sicht
□ Login als Worker → kein Hub-Zugriff (Worker-Portal)
□ Keine 404 auf genutzten Seiten
□ Keine 500 bei leeren Daten
□ Keine Fake-KPIs in Production
□ Keine sichtbaren "TODO" / "Mock" Texte
□ Audit-Log hat Einträge für Mutations (Schritt 3, 6, 7)
```

---

## Seed-Verifikation (automatisiert)

Pilot-Seed-Konsistenz wird durch Pilot-Tests geprüft:

```bash
cd api
npm run test:pilot
# erwartet: 49 Tests, 0 Failures
```

Pilot-Tests prüfen:
- `pilotModel.test.js`: Pilot-Status-Übergänge
- `pilotPolicyService.test.js`: Aktivierung, Ausnahmen, Reason-Pflicht
- `pilotConversionTruthService.test.js`: Conversion-Funnel-Berechnung

---

## Zero-State-Garantien (Code-seitig)

| Route | Zero-State Response | Kein 500 bei leer |
|---|---|---|
| `GET /api/requisitions` | `{ data: [], total: 0 }` | ✓ |
| `GET /api/vendor-pool` | `{ data: [], scope: {...} }` | ✓ |
| `GET /api/capacity-exchange/feed` | `{ data: [] }` | ✓ |
| `GET /api/assignments` | `{ data: [], total: 0 }` | ✓ |
| `GET /api/timesheets` | `{ data: [], total: 0 }` | ✓ |
| `GET /api/spend-analytics` | `{ data: { total_spend: 0, trends: [] }, scope: {...} }` | ✓ |
| `GET /api/workforce/kpis` | `{ open_requisitions: 0, active_vendors: 0, ... }` | ✓ |
| `GET /api/reports/executive` | `{ available: false, ... }` (Soft-Fail) | ✓ |

---

## Sicherheitsregeln im Kernflow

1. **Org-Boundary:** Jede Query über `withOrgContext(pool, req.orgId, fn)` — kein Fremddaten-Leak
2. **Audit-Pflicht:** Schritt 3, 6, 7, 10 erzeugen `audit_log`-Einträge mit `actor_user_id`
3. **CSRF:** Alle POST/PUT/DELETE via `csrfProtection` Middleware gesichert
4. **Plan-Check:** Gesperrte Features → 403 `PLAN_REQUIRED`, nicht 200 mit falschen Daten
5. **Rollen-Check:** Verbotene Aktionen → 403 `PERMISSION_DENIED`, nicht 200 mit leerem Ergebnis

---

*Letzte Aktualisierung: WAVE 07 — Phase 2 — 2026-05-26*
*Abnahme-Zuständigkeit: Owner + Product*
