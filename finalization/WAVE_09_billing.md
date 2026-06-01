# WAVE_09 — Billing, Subscription und Enterprise Requests

> **Phase:** Commercial. **Prio:** P1. **Voraussetzung:** WAVE_02 (Commercial SSOT) + WAVE_07 (Staff Center).

---

## Ziel

Kunden können Pläne verstehen, buchen, upgraden, downgraden, kündigen und individuelle Tarife anfragen — ohne dass interne Prozesse brechen.

---

## Aufgaben

### 1. Upgrade-Flow finalisieren
- UI klar, ohne tote Buttons
- API validiert Plan-Wechsel-Logik
- Übergang sofort wirksam oder mit Stichtag
- Audit

### 2. Downgrade-Flow finalisieren
- Welche Features verschwinden
- Was passiert mit über-Plan-Daten (z. B. mehr User als neuer Plan erlaubt)
- Klare Kommunikation, keine Datenüberraschungen

### 3. Cancel-Flow finalisieren
- Bestätigungsschritt
- Grace Period definieren
- Datenexport-Möglichkeit dokumentieren
- Gekündigte Kunden: Datenzugriff/Export je nach Regel
- Audit

### 4. Trial-Ende finalisieren
- Wann wird Trial zu was
- Was passiert ohne Zahlungsmethode
- Soft-Lock vs. Hard-Lock

### 5. Custom- / Enterprise-Anfrage
- Vorausgefüllt mit bekannten Kontakt-/Organisationsdaten
- Staff-Freigabe und Aktivierung über Staff Center
- Keine sofortige Selbst-Buchung von INDIVIDUELL
- Anfrage erzeugt Staff-Ticket

### 6. Add-on Request und Aktivierung
- Add-ons separat buchbar oder anfragepflichtig (siehe `01_PRIORITIES.md` / WAVE_02)
- Coming-Soon-Add-ons können NICHT gebucht werden

### 7. Invoices / Billing-Status
- Übersicht aller Invoices
- Download als PDF
- Status: `draft`, `pending`, `paid`, `overdue`, `refunded`

### 8. Zahlungsstatus beeinflusst Zugriff
- Overdue → Grace Period → Soft-Lock → Hard-Lock
- Stufen klar dokumentiert
- Kein abrupter Ausschluss ohne Vorwarnung

---

## Akzeptanzkriterien

- [ ] Keine UI zeigt einen Plan als buchbar, wenn Backend ihn nicht aktivieren kann
- [ ] Individuelle Tarife laufen über Staff-Freigabe
- [ ] Formulare nutzen bekannte Kontakt-/Organisationsdaten (vorausgefüllt)
- [ ] Kündigung ist transparent und ungefährlich für Datenintegrität
- [ ] Grace Period und Lock-Mechanismus definiert
- [ ] Audit für alle kommerziellen Aktionen

---

## Stop-Regeln

- Plan-Buchung ohne Backend-Aktivierungslogik → STOP
- Coming-Soon-Plan in UI buchbar → STOP, P1
- Kündigung erzeugt Datenverlust ohne Warnung → STOP, P0

---

## Betroffene Dateien

- `frontend/public/pricing.html`, `enterprise.html`, `enterprise_anfrage.html`
- `frontend/public/sla_abo.html`
- `api/routes/...` (Subscription / Billing-Routes)
- `api/services/subscriptionLifecycleService.js`
