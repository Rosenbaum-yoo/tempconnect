# TempConnect – Feature-Übersicht (Model B + Enterprise + Marketplace)

Stand: 04.03.2026

## Was TempConnect ist
Digitaler Marktplatz für Zeitarbeit: Unternehmen finden Agenturen, fragen Kapazitäten an, schließen Deals ab – alles online, mit Echtzeit-Verfügbarkeit und Qualitätstransparenz.

---

## Model B: Live-Kapazitäten + Reservierungen

**Vorher:** Statische Karteikarten, keine Echtzeit-Verfügbarkeit, Doppelbuchungen möglich.

**Jetzt:**
- **Live-Verfügbarkeit**: Agenturen pflegen verfügbare Mitarbeiter (Rolle, Region, Anzahl, Stundensatz). Unternehmen sehen in Echtzeit, was frei ist.
- **Reservierungen mit Zeitlimit** (30 Min): Wer anfragt, reserviert automatisch – kein anderer kann dieselbe Kapazität doppelt buchen. Läuft die Frist ab, wird die Kapazität wieder freigegeben.
- **Granulare Anfragen**: „3 Schweißer, Stuttgart, ab 15.03., 2-Schicht, max. 45€/h" statt nur „ich will dieses Inserat".
- **Automatische Kapazitätsanpassung**: Accept reduziert verfügbare Mitarbeiter, Decline/Cancel gibt frei.
- **Race-Condition-Schutz**: Datenbank-Locks (`SELECT FOR UPDATE`) verhindern Überbuchung bei gleichzeitigen Anfragen.

**Nutzen für Kunden:**
- Agenturen: Kapazitäten einmal pflegen → Anfragen kommen automatisch
- Unternehmen: Sofort sehen was verfügbar ist → keine Telefonate, kein „leider schon vergeben"

---

## Enterprise Features

### 1. Pulse-Timer + Eskalation
- Jede Anfrage hat eine Antwortfrist (konfigurierbar, z.B. 60 Min)
- Live-Countdown im Dashboard (grün → gelb → rot)
- Keine Reaktion → automatisch „BREACHED", protokolliert mit Zeitstempel
- Eskalation wird in der Aktivitätshistorie dokumentiert

**Nutzen:** Verbindlichkeit – Anfragen versanden nicht mehr. Unternehmen sehen, wer zuverlässig antwortet.

### 2. Supplier Scorecard (A/B/C-Note)
- Pro Agentur automatisch berechnet (30 oder 90 Tage):
  - **Fill Rate**: Wie viele Anfragen wurden angenommen?
  - **Pünktlichkeit**: Wie schnell wird reagiert?
  - **Pulse-Bruchrate**: Wie oft wird die Frist gerissen?
  - **Bewertungsdurchschnitt**: Was sagen die Unternehmen?
- Daraus eine Note: **A** (top), **B** (ok), **C** (Nachholbedarf)

**Nutzen:** Transparenz – Unternehmen können Agenturen vergleichen, bevor sie anfragen. Gute Agenturen profitieren.

### 3. Compliance-Ampel (GREEN / YELLOW / RED)
- Jede Anfrage wird automatisch geprüft:
  - Ort, Startdatum, Menge, Schichtplan angegeben? → GREEN
  - Zertifikate fehlen? → YELLOW
  - Kritische Felder fehlen? → RED
- Aufklappbare Begründung: „Warum gelb?"

**Nutzen:** Weniger Rückfragen, schnellerer Prozess. Unvollständige Anfragen fallen sofort auf.

---

## Schnellzugriff-Navigation

- **Enterprise als Hauptnavigation:** „Kapazitätssuche" ist der **erste Button** in der index.html-Sidebar (primary, verlinkt auf enterprise.html).
- **Schnellzugriff-Karten auf enterprise.html:** 8 Karten unterhalb der Enterprise-Hub-Cards, die alle Bereiche der App verlinken (Suche, Anbieten, Anfragen, Nachweise, Profil, Abo, Kapazitätssuche, Hilfe).
- **Shared Config:** Navigation definiert in `frontend/public/js/navConfig.js` (NAV_ITEMS Array), gerendert durch `frontend/public/js/enterpriseDashboard.js` (IIFE, XSS-safe mit textContent).
- **Hash-Deep-Links:** SPA-Seiten nutzen `/#dashboard`, `/#profile` etc. – index.html liest den Hash und ruft `UI.showPage()` auf.
- **Active State:** „Kapazitätssuche"-Karte wird automatisch als aktiv markiert, wenn man auf enterprise.html ist.
- **Styles:** `.nav-card`, `.nav-grid` in `frontend/public/css/enterprise.css` – konsistent mit bestehendem Enterprise-Design (gleiche CSS-Variablen, Radius, Hover-Effekte).

---

## Two-Sided Marketplace (Migration 014)

**Neu:** Neben dem bestehenden Legacy-Flow (Kapazitaeten + Anfragen) gibt es jetzt einen vollstaendigen Two-Sided Marketplace:

### Tabellen
- `capacity_posts` – Zeitarbeitsfirmen stellen Kapazitaeten ein (Rolle, Skills, Standort, Preis, Verfuegbarkeit)
- `demand_requests` – Unternehmen erstellen Nachfragen (Rolle, Skills, Headcount, Dringlichkeit, Budget)
- `matches` – Deterministisches Matching (Haversine-Distanz, Rollen-Match, Skill-Overlap, Verfuegbarkeit, Verified-Bonus)
- `offers` – Angebote von Anbietern auf Nachfragen (draft -> sent -> accepted/rejected)
- `proofs` – Nachweise fuer Verified-Status
- `demand_sla_events` – Pulse-Prozessnachweis fuer Marketplace-Demands

### Matching-Engine
- Deterministisch, testbar (scoreMatch-Funktion)
- Faktoren: Rolle (30 Pkt), Skills (5 Pkt/Match), Verfuegbarkeit (20 Pkt), Distanz via Haversine (bis 25 Pkt), Verified (10 Pkt)
- Top-25-Matches werden gespeichert, Top-15 per E-Mail benachrichtigt

### Offers-CRUD
- Supplier erstellt Offer (draft), sendet an Requester (sent)
- Requester nimmt an (accepted) oder lehnt ab (rejected)
- Bei Accept: Demand-Status automatisch auf "fulfilled"

### Plan-Gating
- **FREE/BASIS**: Koennen Marketplace browsen (Public-Read-Endpoints), aber keine Aktionen ausfuehren (Upgrade-CTA)
- **PLUS/NOTDIENST**: Vollzugriff auf Erstellen, Offers, Matching
- Public-Endpoints: `GET /api/marketplace/public/capacity-posts`, `GET /api/marketplace/public/demand-requests` (nur Basisinfos, keine Kontaktdaten)

### Marketplace Frontend (3 Seiten)
- `marketplace_capacity_create.html` – Agency stellt Kapazitaet ein (Formular + slaGuard Paywall)
- `marketplace_demand_create.html` – Company erstellt Nachfrage (zeigt Matches nach Erstellung)
- `marketplace_demand_detail.html` – Detailseite mit SLA-Timeline, Matches, Offers (Accept/Reject), Pulse-Report-Export

---

## Legal Pages & Einheitlicher Footer

### Footer (DRY)
- `footer.js` als Shared-Komponente: einmal definiert, ueberall identisch
- Links: Impressum, Datenschutz, AGB, SLA, Kontakt
- Eingebunden auf ALLEN Seiten (Public Landing, SPA, Enterprise, Legal Pages selbst)

### Legal Pages (MVP-Templates)
- `/public/legal/agb.html` – AGB mit TempConnect Pulse SLA-Anlage (Anlage 1) als integraler Bestandteil
- `/public/legal/datenschutz.html` – DSGVO-konforme Muster-Datenschutzerklaerung
- `/public/legal/impressum.html` – TMG/DDG-konformes Impressum-Template
- `/public/legal/kontakt.html` – Kontakt mit Best-Effort Supportzeiten
- `/public/legal/sla.html` – TempConnect Pulse SLA-Anlage (Prozessnachweis, keine Erfolgsgarantie)
- Nginx Clean-URLs: `/legal/agb` -> `agb.html`
- Alle mit Platzhaltern `[...]` fuer Firmendaten (TODO vor Go-Live ersetzen)

### SLA in AGB integriert
- AGB §7 Verfuegbarkeit + §8 TempConnect Pulse SLA-Anlage verweisen auf Anlage 1
- TempConnect Pulse SLA-Anlage beschreibt Messpunkte deckungsgleich mit technischer Implementierung
- Formulierungen: "Prozessnachweis", "Best-Effort", "kein Vermittlungserfolg garantiert"

---

## 3-Landing-Logik (Routing)

- `GET /` – Public Landing Page (Marketing, Tarif-Teaser, Login/Register CTA)
  - Eingeloggte User werden automatisch weitergeleitet (PLUS/NOTDIENST -> /sla, andere -> /app)
- `GET /app` – SPA (index.html, Legacy-Suche + Dashboard)
- `GET /search` – Redirect zu SPA Dashboard
- `GET /sla` – Redirect zu Enterprise-Uebersicht (/public/enterprise.html)
- `GET /legal/*` – Clean-URLs fuer Legal Pages

---

## Technisches Fundament

- **Idempotency**: Doppel-Submits bei schlechter Verbindung werden automatisch erkannt (pro User, 24h TTL)
- **State Machine**: Illegale Statuswechsel (z.B. DECLINED → FINALIZED) sind technisch unmöglich
- **Audit Log**: Jede Statusänderung und Reservierung wird protokolliert
- **Redis Rate-Limiting**: Schutz vor Brute-Force und API-Missbrauch, skaliert über mehrere Server
- **Strukturiertes Logging** (Pino): JSON-Logs für Produktion, lesbar in Entwicklung. pino-pretty wird nur geladen wenn installiert (resilient, kein Crash in Prod-Image).
- **Secret-Rotation + Fail-Fast**: App startet nicht mit Platzhalter-Secrets in Produktion. Geprüft: SESSION_SECRET, JWT_SECRET, INTERNAL_CRON_SECRET, ADMIN_SECRET.
- **Sessions in PostgreSQL**: Kein Memory-Store, überlebt Neustarts, funktioniert mit Load Balancer
- **Health-Endpoint durchgereicht**: nginx `/health` proxied zur API (kein statisches "OK" mehr) – erkennt echte API-Ausfälle

---

## Infrastruktur-Readiness

- Docker Compose für Entwicklung und Produktion
- Managed-DB-Support (Hetzner PostgreSQL) vorbereitet
- Load-Balancer-ready: Sessions in DB, kein Sticky Session nötig
- SSL/HTTPS-ready: Secure Cookies, HSTS, trust proxy
- Compose-Dateien für interne Ports (Produktion) und Managed DB vorhanden
- INTERNAL_CRON_SECRET, ADMIN_SECRET, LOG_LEVEL explizit in docker-compose.yml api environment
- Caddy/Nginx-Vorlagen für Reverse Proxy + Let's Encrypt im Repo
- Health-Endpoints für Monitoring (`/health` → API, `/api/health`, `/api/admin/status`)
- Go-Live-Anleitung: `docs/GO-LIVE-HETZNER.md` (UFW, Caddy, 10-Punkte-Checklist, HA-Architektur)

---

## Frontend-Seiten (Gesamt)

### Enterprise UI (6 Seiten + Schnellzugriff)
1. **Enterprise Hub** – Einstieg mit Kapazitaets-Hub-Cards + Schnellzugriff
2. **Kapazitaetssuche** – Filter + Live-Ergebnisse + Anfrage-Modal
3. **Meine Anfragen** – Gesendete Anfragen mit SLA- und Compliance-Badge
4. **Eingang** – Empfangene Anfragen mit Countdown + Annehmen/Ablehnen
5. **Anfrage-Detail** – Pulse-Timer, Compliance-Gruende, Scorecard, Aktivitaetshistorie
6. **Lieferanten-Bewertung** – Scorecard-Abfrage nach Agentur und Zeitraum
7. **Schnellzugriff** – 8 Navigations-Karten (navConfig.js + enterpriseDashboard.js)

### Marketplace UI (3 Seiten)
8. **Kapazitaet einstellen** – Agency-Formular mit Such-Agent Toggle
9. **Nachfrage erstellen** – Company-Formular mit Urgency-Auswahl, zeigt Matches
10. **Nachfrage Detail** – SLA-Timeline, Matches, Offers mit Accept/Reject, Pulse-Report-Export

### Legal Pages (5 Seiten)
11. **AGB** – inkl. TempConnect Pulse SLA-Anlage Verweis
12. **Datenschutz** – DSGVO-MVP
13. **Impressum** – TMG/DDG Template
14. **Kontakt** – Best-Effort Support
15. **TempConnect Pulse SLA-Anlage** – Prozessnachweis-Dokument

### Landing + SLA-Seiten
16. **Public Landing** – Marketing-Seite mit Auto-Redirect
17. **Abo-Uebersicht** – Tarife FREE/BASIS/PLUS/NOTDIENST
18. **SLA Angebote** – Pulse-sichere Vorlagen
19. **SLA Hilfe** – FAQ + Kontakt
20. **SLA Profil** – Firmenprofil
21. **SLA Nachweise** – Upload + Verwaltung
