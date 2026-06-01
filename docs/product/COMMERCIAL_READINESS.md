# TempConnect — Commercial Readiness

> Zustand der kommerziellen Prozesse: Pricing, Pläne, Upgrade/Downgrade, Kündigung, INDIVIDUELL-Tarif.
> WAVE 13 — Phase 2 — 2026-05-27

---

## 1. Pläne & Pricing

### Kanonische Pläne (5)

| Plan | Preis | Zielgruppe | Pilot-relevant |
|---|---|---|---|
| **DEMO** | €0 | Evaluierung, Erstkontakt | Ja (Story-Test) |
| **BASIS** | €150/Monat | Kleinere Volumina, Einstieg | Ja (Bedarfe & Deals) |
| **PLUS** | €499/Monat | Pilot-Standard, Kernprozess | **Ja (Standard-Pilotpfad)** |
| **PRO** | €799/Monat | Skalierung zwischen PLUS & Enterprise | Nein (Ausbaustufe) |
| **INDIVIDUELL** | Auf Anfrage | Enterprise, Multi-Standort, Governance | Ja (Direct-/Enterprise-Pfad) |

**ENTERPRISE ist kein eigener Plan** — es ist ein Funktions-/Tarifniveau innerhalb von INDIVIDUELL.

### Datenquelle

Alle Preise und Plan-Details kommen aus `api/config/planCatalog.js`.
**Keine hartcodierten Preise in Frontend-Seiten** — die Pricing-Seite lädt via `/api/public/catalog`.

### INDIVIDUELL-Größenklassen

| Tier | Mitarbeiter | Basispreis |
|---|---|---|
| S | bis 50 | €1.499/Monat |
| M | 51–150 | €2.499/Monat |
| L | 151–350 | €3.999/Monat |
| Enterprise | > 350 | Individuell |

---

## 2. Upgrade-Flow

### Ablauf (Customer-facing)

```
Customer: POST /api/subscription-requests/upgrade
  → { desired_plan, desired_individual_tier, employee_count, user_count, site_count, message }
  → Status: PENDING
  → E-Mail-Bestätigung an Kunde
  → Audit-Event: subscription_request.upgrade.create

Staff SCC: POST /staff/api/subscription-requests/:id/approve
  → Staff sieht Anfrage, setzt Status: APPROVED
  → Audit-Event: staff_control.subscription_request.approve

Staff SCC: POST /staff/api/subscription-requests/:id/activate
  → Plan in DB aktivieren (organizations.plan_key aktualisieren)
  → Audit-Event: staff_control.subscription_request.activate
  → E-Mail-Bestätigung an Kunde
```

**Kein Self-Service-Override für INDIVIDUELL** — alle INDIVIDUELL-Upgrades laufen immer über Staff.

---

## 3. Downgrade-Flow

### Ablauf

```
Customer: GET /api/subscription-requests/downgrade/preview?desired_plan=PLUS
  → Liefert Impact-Snapshot: welche Features gehen verloren

Customer: POST /api/subscription-requests/downgrade
  → { desired_plan, acknowledge_impact: true, message }
  → Status: PENDING
  → Audit-Event: subscription_request.downgrade.create

Staff SCC: Approve + Activate (analog zum Upgrade)
```

**Pflicht:** `acknowledge_impact: true` muss explizit gesetzt sein.

---

## 4. Kündigung

### Ablauf

```
Customer: POST /api/subscription-requests/cancellation
  → { cancellation_effective_at: "YYYY-MM-DD", reason }
  → Status: PENDING
  → Audit-Event: subscription_request.cancellation.create

Staff SCC: Bestätigung + Umsetzung
  → Effective at-Datum in DB setzen
  → E-Mail-Bestätigung
```

**Kein sofortiger Datenverlust** — Daten bleiben bis `cancellation_effective_at` erhalten.

---

## 5. INDIVIDUELL-Tarif-Anfrage (Enterprise Form)

### Felder (enterprise_anfrage.html)

| Feld | Pflicht | Quelle |
|---|---|---|
| Firma | Ja | Pre-fill aus `/api/me` + `/api/organizations/:id` |
| Ansprechpartner | Ja | Pre-fill aus `/api/me` |
| E-Mail | Ja | Pre-fill aus `/api/me` |
| Kontaktrolle | Nein | Manuell |
| Telefon, Adresse, USt-IdNr | Nein | Manuell |
| Nutzeranzahl (Seats) | Nein | Konfigurator-Slider |
| Anzahl Standorte | Nein | Strategic Collaboration Block |
| Erwarteter Start | Nein | Datepicker |
| **SSO/SAML** (Checkbox) | Nein | Technische Anforderungen |
| **MFA-Pflicht** (Checkbox) | Nein | Technische Anforderungen |
| **REST-API/Integration** (Checkbox) | Nein | Technische Anforderungen |
| **Compliance/Audit** (Checkbox) | Nein | Technische Anforderungen |
| Anmerkungen / Anforderungen | Nein | Freitext |

**Integration der Checkboxen:** Werden beim Submit als "Technische Anforderungen: ..." in das `notes`-Feld des Backend-Schemas eingebettet. Kein DB-Schema-Change erforderlich.

### Backend

`POST /api/enterprise-request` → `api/routes/strategicCollaboration.js`

- Validierung: Zod-Schema (alle Felder)
- Plan-Normalisierung: `normalizePlanKey()` — ENTERPRISE → INDIVIDUELL
- Audit-Event: `enterprise.request_submit` (immer, auch anonym)
- Burst + Duplikat-Schutz im Service
- E-Mail-Bestätigung an Interessenten

---

## 6. Staff-Prozess (SCC)

| Aktion | Endpoint | Auth | Audit |
|---|---|---|---|
| Abo-Anfragen sehen | `GET /staff/api/subscription-requests` | Staff + StepUp | — |
| Anfrage detail | `GET /staff/api/subscription-requests/:id` | Staff | — |
| Anfrage genehmigen | `POST /staff/api/subscription-requests/:id/approve` | Staff + StepUp + ConfirmReason | ✅ |
| Plan aktivieren | `POST /staff/api/subscription-requests/:id/activate` | Staff + StepUp + ConfirmReason | ✅ |
| Enterprise-Anfragen sehen | `GET /staff/api/customer-requests` | Staff | — |
| Enterprise-Anfrage status | `POST /staff/api/customer-requests/:id/transition` | Staff + StepUp + ConfirmReason | ✅ |

**Alle mutierenden Staff-Aktionen erfordern:**
1. Staff-Session (`staffUserId`)
2. Step-Up Re-Auth (15 Minuten Fenster)
3. Bestätigung + Reason (Pflichtfeld)

---

## 7. GO-Kriterien WAVE 13

| Kriterium | Status |
|---|---|
| Keine Fake-Zahlung, keine falschen Preise | ✅ Keine Stripe-Transaktion ohne Approval |
| Upgrade funktioniert ehrlich | ✅ Staff-Approval-Pflicht, kein Self-Override |
| Kündigung/Downgrade klar | ✅ Impact-Preview + acknowledge_impact |
| Individuell-Anfrage funktioniert | ✅ enterprise_anfrage.html + /api/enterprise-request |
| Staff kann Anfrage bearbeiten | ✅ SCC mit approve + activate + audit |

---

*Letzte Aktualisierung: WAVE 13 — Phase 2 — 2026-05-27*
*Zuständig: Commercial (Claude), Freigabe: Owner*
