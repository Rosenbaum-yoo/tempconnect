# TempConnect — Pilot Customer Runbook

> Schritt-für-Schritt-Anleitung für das Onboarding eines Pilot-Kunden.
> WAVE 15 — Phase 2 — 2026-05-27

---

## Voraussetzungen

Vor dem Pilot-Onboarding müssen folgende Punkte erfüllt sein:

- [ ] `docs/security/SECURITY_CHECKLIST_PILOT.md` vollständig abgehakt
- [ ] Production-Umgebung deployedt und gesund (`GET /api/health` → `{"ok":true}`)
- [ ] Backup läuft (letztes Backup < 24h)
- [ ] Restore-Drill mindestens einmal durchgeführt
- [ ] Support-Kontakt definiert und erreichbar

---

## Schritt 1: Pilot-Org anlegen

```
Staff Control Center → Kunden → Neue Org anlegen
```

**Felder:**
- Firmenname: exakt wie Vertrag
- Org-Typ: `buyer` (Einsatzunternehmen) oder `supplier` (Personaldienstleister)
- Plan: `PLUS` (Standard-Pilot) oder `INDIVIDUELL` (Enterprise-Pilot)
- Notizen: Pilot-Kontext, Kontaktperson, Laufzeit

**DB-Verifikation:**
```sql
SELECT id, name, plan_key, org_type, created_at FROM organizations WHERE name LIKE '%<Kundenname>%';
```

---

## Schritt 2: Owner-User anlegen

```
Staff SCC → Kunden → [Org] → Mitglieder → Nutzer einladen
```

- E-Mail: Ansprechpartner des Kunden
- Rolle: `owner`
- Plan-Kontext: wird automatisch aus Org-Plan übernommen

**E-Mail-Verifikation:** User erhält Bestätigungs-E-Mail → Link klicken → Account aktiv.

---

## Schritt 3: Subscription aktivieren

```
Staff SCC → Abonnements → Anfragen → [Org] → Aktivieren
```

- Step-Up Re-Auth erforderlich (15-Minuten-Fenster)
- Bestätigung + Reason: "Pilot-Aktivierung [Kundenname] [Datum]"
- Audit-Event: `staff_control.subscription_request.activate`

---

## Schritt 4: Zugangsdaten übermitteln

**Pflicht:**
- Zugangsdaten NIEMALS per E-Mail im Klartext
- Empfohlen: 1Password, Signal, persönliche Übergabe
- Initialpasswort soll beim ersten Login geändert werden

**Login-URL:** `https://<domain>/public/login.html`

---

## Schritt 5: Demo-Walkthrough

Empfohlener 30-Minuten-Walkthrough mit dem Kunden:

1. **Login & Hub** — Übersicht der verfügbaren Features
2. **Marketplace / Kapazitäten** — Marktplatz kennenlernen
3. **Erste Anforderung** — Requisition erstellen
4. **Vendor Pool** (falls INDIVIDUELL) — Lieferanten einladen
5. **Timesheet Demo** — Digitaler Stundenzettel
6. **Executive Dashboard** — KPIs und Reporting

---

## Schritt 6: Support-Kanal einrichten

- Direkte Kontaktmöglichkeit für Pilot-Kunden (E-Mail / Slack / Signal)
- SLA: < 4h Reaktionszeit während Geschäftszeiten
- Eskalationspfad: Pilot-Kontakt → Tech Lead → Owner

---

## Schritt 7: Pilot-Monitoring

**Wöchentliche Checks während Pilot:**

```bash
# Gesundheit
curl -sf https://<domain>/api/service-status | jq .

# Fehler-Rate (letzte 24h)
docker logs tempconnect_api --since 24h 2>&1 | grep '"level":50' | wc -l

# Audit-Events des Kunden (via Staff SCC)
GET /staff/api/audit-log?org_id=<pilot-org-id>&limit=50
```

---

## Häufige Pilot-Probleme

| Problem | Diagnose | Lösung |
|---|---|---|
| User kann nicht einloggen | Passwort-Reset senden | `POST /api/auth/reset-password` |
| Feature nicht sichtbar | Plan-Gate prüfen | Staff SCC → Subscription |
| Leere Daten | Zero-State normal | Erste Daten gemeinsam anlegen |
| 403 bei Aktion | Rolle prüfen | Staff SCC → Mitglieder → Rolle anpassen |
| E-Mail kommt nicht an | SMTP-Log prüfen | `docker logs tempconnect_api | grep smtp` |

---

## Pilot-Abschluss

Nach dem Pilot:

1. **Feedback-Call** — Was hat funktioniert, was nicht?
2. **Upgrade-Entscheidung** — PLUS → INDIVIDUELL? Oder kein Upgrade?
3. **Daten-Bereinigung** — Demo-Daten löschen falls nötig
4. **Lessons Learned** — In `docs/pilot/PILOT_CORE_FLOW.md` dokumentieren

---

## Anhang: Lifecycle & Billing — technische Referenz (2026-06-20)

> Nachgetragen, damit klar ist, **was der Code real tut** und **welche Entscheidung noch beim Owner liegt** (verifiziert gegen den Code, nicht spekulativ).

### customer_stage — Lebenszyklus
`organizations.customer_stage`: `demo` → `pilot` → `live`.
- **demo → pilot:** `activatePilotForOrganization()` (`pilotPolicyService.js:97`) setzt `customer_stage='pilot'`, `pilot_status='active'`, `plan='INDIVIDUELL'`, `billing_mode='pilot_contract'` (kostenlos), `pilot_started_at=NOW()`. Wird real ausgelöst über den Auth-/Onboarding-Flow (`auth.js:134`, `me.js:381`) bzw. eine Pilot-`subscription_request`.
- **pilot → live (Auto-Expire):** nach `PILOT_MAX_MONTHS = 3` (`pilotPolicyService.js:246`). Cron `POST /api/internal/pilot-expiry` (`internal.js:298` → `expireStalePilots`) setzt `pilot_status='ended'`, `customer_stage='live'`. **Scheduler muss diesen Endpoint regelmäßig aufrufen** (cron-secret/IP-gated).
- **pilot → live (Konversion, bezahlt):** Staff-Aktivierung einer `subscription_request` (`POST /staff/api/subscription-requests/:id/activate` → `applyApprovedChange`, `subscriptionRequestService.js:745`) setzt `plan`, `billing_mode='individual_contract'|'standard_catalog'`, Entitlements.
- **`contract_requested`** ist als Stage-Wert vorgesehen, aber **nicht aktiv verdrahtet** — der Flow springt demo→pilot bzw. demo→live. (Bewusst; kein Blocker.)

### Billing-Modi
| Modus | Bedingung | Preis |
|---|---|---|
| `pilot_contract` | aktiver Pilot | €0 (kostenlos während Pilot) |
| `standard_catalog` | BASIS/PLUS/PRO | Katalogpreis (`planCatalog.js`) |
| `individual_contract` | INDIVIDUELL | Custom-Quote (`individual_contract_price_cents`) |

### Rechnung
`createInvoice()` (`invoiceService.js:42`) erzeugt TC-YYYY-NNNNNN, 19% USt, Net-14. Während des Pilots wird **keine** Rechnung erzeugt (`pilot_contract`).

### ⚠️ Offene Owner-Entscheidung (vor erstem zahlenden Kunden festlegen)
**Wann genau wird die erste bezahlte Rechnung erzeugt?** Aktuell ist `createInvoice()` nicht automatisch an den Aktivierungs-/Zahlungs-Trigger gekoppelt (`PAYMENT_MODE=demo` bis Gründung). Vor dem ersten zahlenden Kunden ist zu entscheiden + zu verdrahten:
1. Auslöser: bei Konversion (Aktivierung) / zum Monatsersten / Net-14 nach Vertragsstart?
2. Manuell durch Staff (heute möglich) vs. automatisch nach Zahlungs-Webhook (Stripe, nach Gründung).
3. Pilot-Sonderpreis (`pilot_price_cents`, falls vereinbart) → eigener Line-Item-Pfad in `invoiceService`.

Bis zur Entscheidung gilt: **Rechnung manuell durch Staff** nach Konversion (dokumentieren in der Org-Notiz + Audit).

---

*WAVE 15 — Phase 2 — 2026-05-27 · Anhang 2026-06-20 (Lifecycle/Billing-Referenz, verifiziert gegen Code)*
