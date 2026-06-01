# TempConnect – Quick-Start Guide

## Voraussetzungen
- Docker & Docker Compose installiert
- Port 8080 (Frontend), 3000 (API), 5432 (Postgres), 6379 (Redis) frei

## 1. Starten
```bash
docker compose up -d --build
```
Alle 4 Container (api, frontend, db, redis) sollten als „healthy" erscheinen:
```bash
docker compose ps
```

## 2. Registrierung & Login
1. Öffne `http://localhost:8080/public/login.html`
2. Klicke auf „Registrieren", fülle E-Mail, Passwort und Firmenname aus.
3. Nach dem Login landest du auf dem **Enterprise Hub** (`/public/enterprise.html`).

## 3. Erste Schritte

### Organisation erstellen
- Gehe zu **Enterprise Hub → Organisation erstellen**
- Vergib einen Namen – alle Mitglieder teilen sich Requisitions, SLAs und Compliance-Dokumente.

### Firmenprofil ausfüllen
- **Enterprise Hub → Firmenprofil**
- Branche, Standort, Beschreibung und Zertifizierungen eintragen.

### Requisition anlegen
- **Requisitions → Neue Requisition**
- Titel, Beschreibung, Priorität und Deadline setzen.
- Status-Workflow: `draft → pending_approval → open → in_review → shortlisted → filled/closed`.

### Vendor Pool
- **Vendor Pool → Neuen Vendor anlegen**
- Kontaktdaten und Kategorien eintragen.
- Vendors bewerten und in Tier-Listen einordnen.

### SLA-Management
- **SLA → Definition erstellen** (z. B. „Time-to-Fill ≤ 48h").
- SLA-Tracking wird automatisch mit Requisitions verknüpft.

### Capacity Exchange
- **Capacity Exchange → Kapazität anbieten**: Verfügbare Mitarbeiter als Post einstellen.
- **Such-Aufträge**: Bedarf definieren, Matching-Engine findet passende Kapazitäten.
- **Angebote**: Über die Matching-Ergebnisse direkt Angebote senden und verwalten.

### Compliance
- **Compliance → Dokument hochladen** (z. B. AÜG-Lizenz, Zertifikate).
- Admin kann Dokumente verifizieren; abgelaufene Dokumente werden gewarnt.

## 4. Executive Dashboard
- `http://localhost:8080/public/executive_dashboard.html`
- KPIs, SLA-Compliance, Capacity Exchange Stats, Aktivitäts-Timeline, Platform Health.

## 5. Admin Panel
- `http://localhost:8080/public/admin_panel.html` (nur für Benutzer mit Rolle `admin`)
- Benutzer verwalten (Rolle/Plan ändern, verifizieren, deaktivieren)
- Organisationen, Audit-Log und Plattform-Metriken einsehen.

## 6. API-Dokumentation
- `http://localhost:8080/public/api-docs.html`
- Alle REST-Endpunkte mit Methode, Pfad und Auth-Anforderung.

## Architektur-Überblick
```
┌─────────────┐     ┌──────────┐     ┌────────────┐
│  Nginx      │────▶│  Node.js │────▶│ PostgreSQL │
│  (Frontend) │     │  Express │     │  (DB)      │
│  :8080      │     │  :3000   │     │  :5432     │
└─────────────┘     └────┬─────┘     └────────────┘
                         │
                    ┌────▼─────┐
                    │  Redis   │
                    │  :6379   │
                    └──────────┘
```

## Hilfe
- API-Docs: `/public/api-docs.html`
- Admin Panel: `/public/admin_panel.html`
- Enterprise Hub: `/public/enterprise.html`
