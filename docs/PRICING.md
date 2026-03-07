# TempConnect – Preismodell & SLA-Zuordnung

Stand: 03.03.2026

---

## 1. Tarifübersicht

### FREE – 0€/Monat
- **SLA-Level:** Keins (Best-Effort)
- **Enterprise-Zugang:** Nein
- **Suche:** Alte Marketplace-Suche (nur Ansicht, keine Aktionen)
- **Anfragen senden:** 0 (nicht verfügbar)
- **Anfragen empfangen:** 0 (nicht verfügbar)
- **Angebote:** 0 (nicht verfügbar)
- **Matching:** Kein garantierter Matchingversuch
- **Support:** Community / E-Mail (keine Antwortgarantie)

### BASIS – 150€/Monat
- **SLA-Level:** Keins (Best-Effort)
- **Enterprise-Zugang:** Nein
- **Suche:** Alte Marketplace-Suche (Kapazitätsliste, keine Details)
- **Anfragen senden:** Bis zu 5 pro Monat
- **Anfragen empfangen:** Bis zu 5 pro Monat
- **Angebote:** Bis zu 5 aktive Angebote
- **Matching:** Kein garantierter Matchingversuch
- **Support:** E-Mail (Antwort innerhalb 48h, Werktags)

### PLUS – 499€/Monat
- **SLA-Level:** PRO
- **Enterprise-Zugang:** Ja (Vollzugriff)
- **Suche:** Enterprise-Kapazitätssuche mit Detailansicht, Filterung, Verfügbarkeitskalender
- **Anfragen senden:** Bis zu 20 pro Monat
- **Anfragen empfangen:** Bis zu 20 pro Monat
- **Angebote:** Bis zu 20 aktive Angebote
- **Matching:** Garantierter Matchingversuch innerhalb 120 Minuten
- **Verfügbarkeit:** 99,0% Plattformverfügbarkeit
- **Support:** Antwort innerhalb 24 Stunden (Werktags)
- **Enterprise-Features:** Pulse-Timer, Compliance-Ampel, Supplier Scorecard, Kapazitätssuche
- **Service-Gutschrift:** 10% bei SLA-Verstoß (max. 49,90€/Monat)

### NOTDIENST – 999€/Monat
- **SLA-Level:** EMERGENCY
- **Enterprise-Zugang:** Ja (Vollzugriff + Priorisierung)
- **Suche:** Enterprise-Kapazitätssuche mit Detailansicht + Notdienst-Schnellsuche
- **Anfragen senden:** Unbegrenzt
- **Anfragen empfangen:** Unbegrenzt
- **Angebote:** Unbegrenzt
- **Matching:** Garantierter Matchingversuch innerhalb 30 Minuten
- **Eskalation:** Automatische Radius-Erweiterung + Premium-Partner-Push nach 60 Min
- **Verfügbarkeit:** 99,5% Plattformverfügbarkeit
- **Support:** Antwort innerhalb 4 Stunden (Werktags), 24/7 Eingangsbestätigung (15 Min)
- **Enterprise-Features:** Alle PRO-Features + priorisierte Bearbeitung + Notdienst-Badge
- **Service-Gutschrift:** 20% bei SLA-Verstoß (max. 199,80€/Monat)

---

## 2. Zuordnung Tarif → SLA-Level

```
Tarif        │ Preis      │ SLA-Level   │ Enterprise │ Suche
─────────────┼────────────┼─────────────┼────────────┼──────────────────
FREE         │ 0€/Mon     │ –           │ Nein       │ Marketplace (alt)
BASIS        │ 150€/Mon   │ –           │ Nein       │ Marketplace (alt)
PLUS         │ 499€/Mon   │ PRO         │ Ja         │ Enterprise (SLA)
NOTDIENST    │ 999€/Mon   │ EMERGENCY   │ Ja         │ Enterprise (SLA)
```

---

## 3. Feature-Matrix

### 3.1 Suchfunktion

```
Feature                          │ FREE/BASIS        │ PLUS/NOTDIENST
─────────────────────────────────┼───────────────────┼──────────────────
Kapazitätsliste (alt)            │ ✓                 │ ✓
Detailansicht Agentur            │ ✗                 │ ✓
Verfügbarkeitskalender           │ ✗                 │ ✓
Filter nach Region/Rolle/Datum   │ Einfach           │ Erweitert
Direkte Anfrage aus Suche        │ ✗                 │ ✓
Notdienst-Schnellsuche           │ ✗                 │ Nur NOTDIENST
```

### 3.2 Enterprise-Dashboard

```
Feature                          │ FREE/BASIS        │ PLUS/NOTDIENST
─────────────────────────────────┼───────────────────┼──────────────────
Enterprise-Navigation            │ ✗                 │ ✓
Pulse-Timer (grün/gelb/rot)        │ ✗                 │ ✓
Compliance-Ampel                 │ ✗                 │ ✓
Supplier Scorecard               │ ✗                 │ ✓
Pulse-Reports / Auswertungen       │ ✗                 │ ✓
Kapazitätssuche (Enterprise)     │ ✗                 │ ✓
```

### 3.3 Anfragen & Matching

```
Feature                          │ FREE  │ BASIS │ PLUS     │ NOTDIENST
─────────────────────────────────┼───────┼───────┼──────────┼──────────
Anfragen senden/Monat            │ 0     │ 5     │ 20       │ Unbegrenzt
Anfragen empfangen/Monat         │ 0     │ 5     │ 20       │ Unbegrenzt
Angebote (Listings)              │ 0     │ 5     │ 20       │ Unbegrenzt
Matchingversuch-Garantie         │ ✗     │ ✗     │ 120 Min  │ 30 Min
Eskalation bei Nicht-Match       │ ✗     │ ✗     │ ✗        │ ✓ (60 Min)
Notfall-Anfragen                 │ ✗     │ ✗     │ ✗        │ ✓
Priorität in Matching-Queue      │ –     │ Normal│ Standard │ Höchste
```

---

## 4. Zwei Suchsysteme

### 4.1 Alte Marketplace-Suche (FREE / BASIS)

- Einfache Kapazitätsliste mit Basisinformationen
- Suchfilter: Rolle, Region
- Keine Detailansicht, kein Verfügbarkeitskalender
- Kein Pulse-Schutz für Matchingversuche
- Zugriff über die Standard-Suchseite (`/index.html`)

### 4.2 Enterprise-Kapazitätssuche (PLUS / NOTDIENST)

- Erweiterte Suche mit Detailansicht, Filterung nach Rolle, Region, Datum, Verfügbarkeit
- Verfügbarkeitskalender je Agentur
- Direkte Anfrage aus der Suche heraus
- SLA-geschützter Matchingversuch (120 Min bzw. 30 Min)
- Zugriff über das Enterprise-Dashboard (`/enterprise.html`)
- Nur für Kunden mit `enterprise_access: true` (Tarif PLUS oder NOTDIENST)

---

## 5. Tarifwechsel

- **Upgrade:** Sofort wirksam. Die Differenz wird anteilig berechnet. Pulse-Schutz beginnt sofort.
- **Downgrade:** Wirksam zum Ende des aktuellen Abrechnungszeitraums. Enterprise-Features und Pulse-Schutz enden zum selben Zeitpunkt.
- **Kündigung:** Zum Ende des aktuellen Abrechnungszeitraums. Offene Gutschriften verfallen.

---

## 6. Technische Umsetzung (PLAN_LIMITS)

Die Zuordnung ist in `api/services/userService.js` als `PLAN_LIMITS` implementiert:

```javascript
const PLAN_LIMITS = {
  FREE:      { price: 0,   requests_send: 0,  requests_receive: 0,  listings: 0,  notdienst: false, sla_level: 'none',      enterprise_access: false },
  BASIS:     { price: 150, requests_send: 5,  requests_receive: 5,  listings: 5,  notdienst: false, sla_level: 'none',      enterprise_access: false },
  PLUS:      { price: 499, requests_send: 20, requests_receive: 20, listings: 20, notdienst: false, sla_level: 'PRO',       enterprise_access: true  },
  NOTDIENST: { price: 999, requests_send: -1, requests_receive: -1, listings: -1, notdienst: true,  sla_level: 'EMERGENCY', enterprise_access: true  },
};
```

`-1` bedeutet unbegrenzt.
