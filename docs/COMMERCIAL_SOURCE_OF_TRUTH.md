# COMMERCIAL_SOURCE_OF_TRUTH — Plan-, Feature- und Preis-Wahrheit
> Aktualisiert: 2026-05-27 | WAVE_02 Delta | Verifiziert gegen Code-Stand
> Kanonische Code-Quellen: `api/config/planCatalog.js`, `api/config/planFeatures.js`
> **Nur eine Quelle der Wahrheit. Keine Doppelwahrheiten.**

---

## 1. Kanonische Plannamen (verbindlich)

| Planname | Alias (Legacy) | Preis/Monat | Öffentlicher Plan? |
|---|---|---|---|
| `DEMO` | `FREE`, `TRIAL`, `""` | 0 EUR (14 Tage) | Nein (System-Default) |
| `BASIS` | `STARTER` | 150,00 EUR | ✅ Ja |
| `PLUS` | `NOTDIENST` | 499,00 EUR | ✅ Ja |
| `PRO` | `PROFESSIONAL` *(defensiv, 2026-05-27)* | 799,00 EUR | ✅ Ja |
| `INDIVIDUELL` | `ENTERPRISE`, `INDIVIDUAL` | auf Anfrage | ✅ Ja (Vertragskunde) |

**Regel:** Alle Eingaben via `normalizePlanKey()` in `api/config/planCatalog.js` normalisieren. Kein direkter String-Vergleich mit Legacy-Bezeichnungen.

**Preise in Cents (planCatalog.js PLAN_CATALOG):**
- DEMO: `monthly_price_cents: 0`, interval: `"trial14d"`
- BASIS: `monthly_price_cents: 15000`
- PLUS: `monthly_price_cents: 49900`
- PRO: `monthly_price_cents: 79900`
- INDIVIDUELL: `monthly_price_cents: null` (Custom)

**Jahrespreise:** Aktuell `annual_price_status: "not_offered"` für alle Pläne — kein Jahresrabatt aktiv.

---

## 2. INDIVIDUELL-Unterklassen

### Neue Schwellen (planCatalog.js — ANZEIGE & NEUE TARIF-KLASSIFIKATION)
| Tier-Key | Beschäftigte | Label |
|---|---|---|
| `individuell_s` | 1–50 | Individuell S |
| `individuell_m` | 51–150 | Individuell M |
| `individuell_l` | 151–350 | Individuell L |
| `individuell_enterprise` | 351+ | Individuell Enterprise |

Bestimmung via: `getIndividualTierByEmployeeCountV2(n)` in `api/config/planCatalog.js`

### Alte Schwellen (planFeatures.js — LEGACY, noch aktiv für Backward-Compat)
| Tier-Key | Beschäftigte |
|---|---|
| `individuell_s` | 1–30 |
| `individuell_m` | 31–250 |
| `individuell_l` | 251–999 |
| `individuell_enterprise` | 1000+ |

Bestimmung via: `getIndividualTierByEmployeeCount(n)` in `api/config/planFeatures.js`

> ⚠️ **WIDERSPRUCH W-01:** Beide Funktionen existieren parallel mit unterschiedlichen Schwellen.
> planCatalog.js dokumentiert: "Migration auf neue Schwellen erfolgt in separater Welle mit Backfill."
> **Bis zur Migration:** `planFeatures.js`-Funktion für Runtime-Klassifizierung, `planCatalog.js`-Funktion für Anzeige/Pricing.

---

## 3. Plan-Limits (Quelle: api/services/userService.js → PLAN_LIMITS)

| Limit | DEMO | BASIS | PLUS | PRO | INDIVIDUELL |
|---|---|---|---|---|---|
| Preis (EUR/Monat) | 0 | 150 | 499 | 799 | individuell |
| Anfragen senden | 0 | 5 | 20 | -1 (∞) | -1 (∞) |
| Anfragen empfangen | 0 | 5 | 20 | -1 (∞) | -1 (∞) |
| Listings | 0 | 5 | 20 | -1 (∞) | -1 (∞) |
| Notdienst | ❌ | ✅ (1/Monat) | ✅ (1/Monat) | ✅ (1/Monat) | ✅ (-1 = ∞) |
| Max. Worker/Bedarf | 0 | 3 | 10 | 20 | -1 (∞) |
| SLA-Level | none | none | PRO | EMERGENCY | ENTERPRISE |
| Enterprise-Zugang | ❌ | ✅ | ✅ | ✅ | ✅ |

> ⚠️ **WIDERSPRUCH W-02:** `PLAN_LIMITS.price` in userService.js sind ganzzahlige EUR-Werte (150, 499, 799).
> `planCatalog.js` führt `monthly_price_cents` in Cents (15000, 49900, 79900).
> Werte stimmen inhaltlich überein (150 EUR = 15000 Cents). Einheit nicht einheitlich.
> `planCatalog.js` ist kanonisch für Checkout/Payment. `PLAN_LIMITS.price` ist Legacy-Feld.

---

## 4. INDIVIDUELL Baseline (Konfigurator-Sockel)

Quelle: `api/config/planCatalog.js` → `INDIVIDUELL_BASELINE`

| Wert | Betrag |
|---|---|
| Basis-Preis / Monat | 2.499,00 EUR (249.900 Cents) |
| Inkludierte User-Seats | 50 |
| Zusatz-Seat / User / Monat | 29,00 EUR (2.900 Cents) |

---

## 5. Add-ons (Quelle: api/config/planCatalog.js → ADDON_CATALOG)

Alle Add-ons sind **nur für INDIVIDUELL** buchbar.

| Key | Name | Preis | Interval | Staff-Freigabe | Coming Soon |
|---|---|---|---|---|---|
| `api` | API-Zugang & Webhooks | 399,00 EUR | monatlich | Nein | ❌ |
| `spend` | Spend Analytics Premium | 349,00 EUR | monatlich | Nein | ❌ |
| `ratecards` | Rate Card Management | 299,00 EUR | monatlich | Nein | ❌ |
| `sla99` | Erweiterter SLA (99,9 %) | 449,00 EUR | monatlich | **Ja** | ❌ |
| `pulse15` | Pulse-Timer 15 Minuten | 349,00 EUR | monatlich | Nein | ❌ |
| `multitenant` | Multi-Mandanten (Konzern) | 799,00 EUR | monatlich | **Ja** | ❌ |
| `governance` | Data Governance & Compliance | 299,00 EUR | monatlich | Nein | ❌ |
| `sso` | SSO / SAML-Integration | 449,00 EUR | monatlich | **Ja** | ✅ **Coming Soon** |
| `onboarding` | Dediziertes Onboarding-Paket | 2.499,00 EUR | einmalig | **Ja** | ❌ |

---

## 6. Feature-to-Plan-Matrix (Quelle: api/config/planFeatures.js → planFeatures)

| Feature-Key | DEMO | BASIS | PLUS | PRO | INDIVIDUELL |
|---|---|---|---|---|---|
| legacy_access | ✅ | ✅ | ❌ | ❌ | ❌ |
| sla_access | ✅ | ✅ | ✅ | ✅ | ✅ |
| sla_offers_create | ❌ | ❌ | ✅ | ✅ | ✅ |
| sla_help | ❌ | ❌ | ✅ | ✅ | ✅ |
| sla_subscriptions | ❌ | ❌ | ✅ | ✅ | ✅ |
| sla_profile | ❌ | ❌ | ✅ | ✅ | ✅ |
| sla_proofs | ❌ | ❌ | ✅ | ✅ | ✅ |
| timesheets | ❌ | ❌ | ✅ | ✅ | ✅ |
| worker_module | ❌ | ❌ | ✅ | ✅ | ✅ |
| emergency_staffing | ❌ | ❌ | ✅ | ✅ | ✅ |
| smart_pricing | ❌ | ❌ | ✅ | ✅ | ✅ |
| basic_analytics | ❌ | ❌ | ✅ | ✅ | ✅ |
| persistent_requisitions | ❌ | ❌ | ✅ | ✅ | ✅ |
| alerts | ❌ | ❌ | ✅ | ✅ | ✅ |
| advanced_matching | ❌ | ❌ | ❌ | ✅ | ✅ |
| supplier_ratings | ❌ | ❌ | ❌ | ✅ | ✅ |
| deal_workflow | ❌ | ❌ | ❌ | ✅ | ✅ |
| premium_visibility | ❌ | ❌ | ❌ | ✅ | ✅ |
| rate_card_management | ❌ | ❌ | ❌ | ✅ | ✅ |
| spend_analytics | ❌ | ❌ | ❌ | ✅ | ✅ |
| data_governance | ❌ | ❌ | ❌ | ✅ | ✅ |
| capacity_exchange_basic | ✅ | ✅ | ✅ | ✅ | ✅ |
| capacity_exchange_matching | ❌ | ❌ | ✅ | ✅ | ✅ |
| capacity_exchange_priority | ❌ | ❌ | ❌ | ✅ | ✅ |
| capacity_exchange_multi | ❌ | ❌ | ❌ | ❌ | ✅ |
| inter_agency_matching | ❌ | ❌ | ❌ | ❌ | ✅ |
| approval_workflows | ❌ | ❌ | ❌ | ❌ | ✅ |
| departments | ❌ | ❌ | ❌ | ❌ | ✅ |
| multi_location | ❌ | ❌ | ❌ | ❌ | ✅ |
| supplier_management | ❌ | ❌ | ❌ | ❌ | ✅ |
| compliance | ❌ | ❌ | ❌ | ❌ | ✅ |
| contracts | ❌ | ❌ | ❌ | ❌ | ✅ |
| enterprise_analytics | ❌ | ❌ | ❌ | ❌ | ✅ |
| audit_traceability | ❌ | ❌ | ❌ | ❌ | ✅ |
| org_settings | ❌ | ❌ | ❌ | ❌ | ✅ |
| assignments | ❌ | ❌ | ❌ | ❌ | ✅ |
| integrations | ❌ | ❌ | ❌ | ❌ | ✅ |

---

## 7. Subscription-Request-Lifecycle

Quelle: `api/services/subscriptionRequestService.js`, `api/services/subscriptionLifecycleService.js`

```
submitted
  → under_review
    → offered        (mit proposed_price_cents + term)
      → accepted
        → active     (via applyApprovedChange → Update org.plan + subscriptions)
  → rejected
submitted/offered/accepted → expired  (via Expiry-Cron)
active → cancellation_pending → canceled  (via Cancellation-Cron)
```

### Approval-Pfade
- **Self-Service** (BASIS→PLUS, PLUS→PRO ohne INDIVIDUELL): kann ohne Staff-Freigabe aktiviert werden (`can_bypass_staff: true`)
- **Staff-Freigabe** (INDIVIDUELL, Custom, Enterprise-Request): requires `under_review → offered → accepted → active`

---

## 8. Document-Typen (Quelle: api/services/subscriptionDocumentService.js)

| Typ | Trigger | Beschreibung |
|---|---|---|
| `cost_preview` | Enterprise-Anfrage | Kostenvorschau ohne Unterschrift (KV) |
| `offer` | Staff setzt Angebot | Formales Angebot (ANG) |
| `order_confirmation` | Upgrade/Aktivierung abgeschlossen | Auftragsbestätigung (AB) |
| `change_confirmation` | Upgrade/Downgrade aktiv | Änderungsbestätigung (AE) |
| `cancellation_confirmation` | Kündigung aktiv | Kündigungsbestätigung (KB) |

---

## 9. Plan-Variants (Quelle: planCatalog.js → PLAN_VARIANTS)

| Key | Wert | Beschreibung |
|---|---|---|
| `STANDARD` | `"standard"` | Normaler Self-Service-Kauf |
| `PILOT_INDIVIDUAL` | `"pilot_individual"` | Pilot mit individuellen Konditionen |
| `INDIVIDUAL` | `"individual"` | Individuell ausgehandelter Tarif |
| `ENTERPRISE_INDIVIDUAL` | `"enterprise_individual"` | Enterprise mit Sonderkonditionen |

---

## 10. Fundorte aller Plan-Definitionen

| Datei | Was steht dort | Kanonisch? |
|---|---|---|
| `api/config/planCatalog.js` | Preise (Cents), Feature-Katalog, Add-on-Katalog, Tier-Katalog, Subscription-Lifecycle-Metadaten | ✅ JA — Single Source of Truth |
| `api/config/planFeatures.js` | Feature-to-Plan-Matrix (`planFeatures`), `hasFeature()`, `MATURITY_GATES`, Tier-Schwellen (alt) | ✅ JA (Runtime-Gates) |
| `api/services/userService.js` PLAN_LIMITS | Operational Limits: requests, listings, workers (ganzzahlige EUR-Preise als Legacy) | ⚠️ Legacy — wird von planCatalog.js gespiegelt |
| `frontend/public/pricing.html` | Lädt via `/api/public/catalog` — keine hartcodierten Preise | ✅ Korrekt |
| `frontend/public/js/catalogRenderer.js` | Rendert Katalog-Response — keine eigene Preis-Logik | ✅ Korrekt |
| DB: `subscriptions.plan`, `organizations.plan` | CHECK-Constraint aus Migration 102 | ✅ Konsistent mit CANONICAL_PLAN_KEYS |
| `frontend/public/enterprise_anfrage.html` | Enterprise-Anfrage-Konfigurator — liest planCatalog via API | ✅ Korrekt |

---

## 11. Bekannte Widersprüche (Stand WAVE_02)

| ID | Widerspruch | Ort | Risiko | Aktion |
|---|---|---|---|---|
| **W-01** | Tier-Schwellen: planFeatures.js (30/250/999) vs planCatalog.js (50/150/350) | Beide Config-Dateien | Mittel — falsche Tier-Klassifizierung bei Neukunden | Migration auf neue Schwellen in separater Welle mit DB-Backfill |
| **W-02** | PLAN_LIMITS.price in EUR vs planCatalog.js monthly_price_cents in Cents | userService.js vs planCatalog.js | Niedrig — nur Einheit, Werte stimmen überein | Legacy-Feld deprecaten, Aufräumen wenn PLAN_LIMITS refactored wird |
| **W-03** ✅ | `PLAN_LIMITS.BASIS.notdienst: true` vs `planFeatures.emergency_staffing` | userService.js vs planFeatures.js | **Gelöst 2026-05-27** — BASIS zu `emergency_staffing` hinzugefügt. Beide Systeme konsistent. | OE-08 entschieden: BASIS darf Notdienst 1x/Monat. |

---

## 12. FEATURE_GATE_BYPASS — Status nach WAVE_02

**Vorher:** `.env.example` setzte `FEATURE_GATE_BYPASS=true` als Default → alle DEMO-User hatten alle Features.
**Nach WAVE_02 (P1.3):** `.env.example` setzt `FEATURE_GATE_BYPASS=false` → Plan-Gates aktiv.
**Lokal entwickeln:** Eigene `.env` mit `FEATURE_GATE_BYPASS=true` überschreiben (nicht committen).

---

## 13. Pricing-Seite vs. Code — Konsolidierungsstatus

**Problem gelöst:** `pricing.html` lädt alle Preise und Features dynamisch aus `/api/public/catalog`.
Keine hardcodierten Preise im HTML mehr (Legacy-Block entfernt in Welle 8 Schritt 6).

**Einzige verbleibende Pflege:** `planCatalog.js` ändern → Pricing-Seite aktualisiert sich automatisch.
