# WAVE_02 — Commercial Source of Truth

> **Phase:** Foundation. **Prio:** P0/P1. **Voraussetzung:** WAVE_00 + WAVE_01 abgeschlossen.
> **Ausführungsagent:** Backend-/Frontend-Mix — Owner-Freigabe für Backend-Teile

---

## Ziel

Plans, Add-ons, Trial, Custom/Enterprise, Limits, Feature-Gates und Staff-Freigaben sind heute potenziell mehrfach definiert (UI, Backend, Doku, Tests). Ziel: **eine kanonische Quelle**, aus der UI, API, Billing, Subscription Admin und Staff Center lesen.

---

## Kanonisches Planmodell (verbindlich)

**Öffentlich gültig sind nur:**

- `DEMO`
- `BASIS`
- `PLUS`
- `PRO`
- `INDIVIDUELL`

**`ENTERPRISE` ist KEIN öffentlicher Plan** — sondern ein Funktionsniveau/Tier innerhalb `INDIVIDUELL` (z. B. `individuell_enterprise`).

**Legacy-Aliase:** `FREE`, `TRIAL`, `STARTER`, `NOTDIENST`, `ENTERPRISE`, `PROFESSIONAL`. Müssen via `normalizePlanKey(...)` auf kanonische Keys gemappt werden.

---

## Aufgaben

### 1. Inventur der Commercial-Wahrheiten

Finde ALLE Stellen im Repo mit Plan-/Pricing-/Feature-Definitionen:

- Backend-Konstanten / Konfigurationen
- Datenbank-Tabellen / Migrationen
- Frontend-Pricing-Seiten (`pricing.html`, ggf. weitere)
- Subscription-Service
- Billing-Service
- Tests
- Doku
- Marketing-Texte

Erstelle Liste in `docs/COMMERCIAL_SOURCE_OF_TRUTH.md` mit allen Fundorten und Widersprüchen.

### 2. Kanonische Quelle definieren

**Eine** kanonische Quelle festlegen. Empfohlen:
- Backend-Konfiguration (z. B. `api/config/plans.js` oder Datenbank-Seed)
- Frontend liest via API, schreibt nicht selbst Pricing

### 3. Pro Plan definieren

Je Plan (`DEMO`, `BASIS`, `PLUS`, `PRO`, `INDIVIDUELL`):

- Preis ODER Anfragepflicht (`INDIVIDUELL` ist Anfrage)
- Trial-Dauer (falls relevant)
- Nutzerlimits
- Organisations-/Standortlimits
- Vendor-/Pool-/Requisition-Limits
- API-Zugriff
- SSO (nur wenn produktiv lieferbar)
- Spend Analytics
- Rate Cards
- Multi-Mandant
- Data Governance
- SLA
- Support-Level
- Staff-Freigabepflicht (für Custom-Tarife: ja)
- Coming-Soon-Status (falls Feature nicht produktiv ist)

### 4. Add-ons definieren

- API & Webhooks
- Spend Analytics Premium
- Rate Card Management
- SLA 99,9 % (nur wenn operativ haltbar)
- Pulse-/Notdienst-Taktung
- Multi-Mandanten Konzern
- Data Governance & Compliance
- SSO/SAML (nur produktiv ODER Coming Soon)
- Dediziertes Onboarding
- Premium Support / Customer Success

### 5. Widersprüchliche Wahrheiten bereinigen

- Alte FREE-/NOTDIENST-Definitionen → falls strategisch überholt, deprecate
- Abweichende Service-Limits → auf kanonische Wahrheit angleichen
- Abweichende UI-Preise → von API holen statt hartcodieren
- Veraltete Pricing-Doku → aktualisieren oder als Legacy markieren

### 6. Tests erstellen

- Plan-Gate-Tests (jeder Plan: was darf, was nicht)
- Add-on-Aktivierungs-Tests
- Coming-Soon-Sperren-Tests (Coming-Soon kann NICHT gebucht werden)
- Legacy-Alias-Mapping-Tests (`normalizePlanKey('FREE') === 'DEMO'`, etc.)

---

## Akzeptanzkriterien

- [ ] UI, API, Billing, Subscription Admin und Staff Center verwenden dieselbe Wahrheit
- [ ] Coming-Soon-Features können nicht gebucht oder aktiviert werden (UI + API)
- [ ] Custom/Enterprise-Anfragen laufen über Staff-Freigabe
- [ ] Keine Plan-Karte verspricht etwas, was Backend/Operations nicht liefert
- [ ] `normalizePlanKey(...)` existiert und mappt alle Legacy-Aliase
- [ ] Pricing-Seite (`pricing.html`) zeigt nur die 5 kanonischen Pläne
- [ ] `docs/COMMERCIAL_SOURCE_OF_TRUTH.md` ist die maßgebliche Doku
- [ ] Tests laufen für alle Plan-Gates und Add-on-Aktivierungen

---

## Stop-Regeln

- Wenn die "kanonische Quelle" nicht eindeutig wählbar ist (z. B. Backend und Datenbank widersprechen sich) → STOP, Owner-Entscheidung einholen
- Wenn die Migration von Legacy-Plans zu kanonischen Plans Kundendaten betreffen würde → STOP, Migrations-Strategie mit Owner abstimmen

---

## Triage-Hinweis

Viele "Bugs" in Plan-/Feature-Sichtbarkeit sind in Wahrheit **Commercial-Widersprüche** (Plan A sagt X, Plan B sagt Y, UI zeigt Z). Triage in `00_RULES.md` Abschnitt 2 anwenden.

---

## Output

Standard-Output plus:

```
## Commercial-Konsolidierung
- Gefundene Fundorte mit Plan-Definitionen (Liste):
- Widersprüche zwischen Fundorten (Liste):
- Kanonische Quelle festgelegt auf:
- Legacy-Aliase, die nicht mehr aktiv sein dürfen:
- Coming-Soon-Features (Liste mit Begründung):
```

---

## Übergang

→ WAVE_03 startet, sobald Commercial-Wahrheit kanonisch ist.
