# Go-Live Gap-Analyse – Stand 04.03.2026

## Ziel-Setup: Hetzner (2 Server + Managed DB + LB)

```
                    +---------------+
     Internet ------+  Hetzner LB   +------+
                    |  (80/443)     |      |
                    +---------------+      |
                          |                |
                +---------+------+  +------+---------+
                |   VM 1         |  |   VM 2         |
                |   Caddy/TLS    |  |   Caddy/TLS    |
                |   Docker       |  |   Docker       |
                |   API+Frontend |  |   API+Frontend  |
                |   Redis        |  |   Redis        |
                +-------+--------+  +--------+-------+
                        |                    |
                    +---+--------------------+---+
                    |   Hetzner Managed DB        |
                    |   PostgreSQL 16             |
                    +----------------------------+
```

---

## Was bereits fertig ist (Code + Config)

| Bereich | Status | Details |
|---------|--------|---------|
| API (Express, modulare Routes/Services) | fertig | Routen, Services, Middleware sauber getrennt |
| Model B (Capacities, Reservierungen) | fertig | Race-Condition-Schutz, TTL, Expiry-Job |
| Enterprise (SLA, Scorecard, Compliance) | fertig | 3 Features + 6 UI-Seiten |
| Two-Sided Marketplace | fertig | capacity_posts, demand_requests, matches, offers + Matching-Engine + Offers-CRUD |
| Marketplace Frontend (3 Seiten) | fertig | Kapazitaet einstellen, Nachfrage erstellen, Nachfrage Detail |
| Idempotency (Scope per User, TTL, Cleanup) | fertig | Migration 012, Middleware, Cron-Endpoint |
| State Machine + Audit Log | fertig | assertTransition() ueberall, Tests vorhanden |
| Redis Rate-Limiting | fertig | 3 Stores mit Prefixes, Fallback auf Memory |
| Secret-Rotation + Fail-Fast | fertig | Production-Validation aktiv |
| Pino Logging (kein console.error) | fertig | Strukturiert, JSON in Prod |
| Sessions in PostgreSQL | fertig | connect-pg-simple, kein Sticky Session noetig |
| Health-Endpoints | fertig | /health, /api/health, /api/admin/status |
| Helmet + CORS + CSRF + Body-Limit | fertig | Security-Headers aktiv |
| docker-compose.managed.yml | fertig | Deaktiviert lokalen DB-Container |
| docker-compose.ports-internal.yml | fertig | Ports nur 127.0.0.1 |
| Caddy/Nginx-Vorlagen | fertig | deploy/Caddyfile.example, nginx-ssl.example.conf |
| Migrations (001-014) | fertig | init.sql + 14 Migrationen (inkl. Marketplace-Tabellen) |
| SendGrid E-Mail | fertig | Neuer API-Key aktiv |
| XSS-Schutz (Frontend) | fertig | esc() Helper in allen Enterprise-Seiten |
| SQL nur in Services (nicht in Routes) | fertig | Verifiziert |
| .gitignore (.env, node_modules) | fertig | Korrekt konfiguriert |
| Legal Pages (5 Templates) | fertig | AGB, Datenschutz, Impressum, Kontakt, TempConnect Pulse SLA-Anlage (Platzhalter fuer Firmendaten) |
| Einheitlicher Footer (DRY) | fertig | footer.js auf allen 21+ Seiten inkl. index.html |
| Public Landing Page | fertig | landing.html mit Auto-Redirect fuer eingeloggte User |
| 3-Landing-Routing | fertig | / -> Landing, /app -> SPA, /sla -> Enterprise, /legal/* -> Clean-URLs |
| SLA in AGB integriert | fertig | AGB Paragraph 7+8 verweisen auf TempConnect Pulse SLA-Anlage (Anlage 1), Prozessnachweis |

---

## Was noch fehlt (Blocker -> Empfohlen -> Nice-to-have)

### BLOCKER (ohne das kein Go-Live)

| # | Was | Aufwand | Wer |
|---|-----|---------|-----|
| 1 | **Domain registrieren** (z.B. tempconnect.de) + DNS A-Record auf LB-IP | 10 Min | Dennis |
| 2 | **Hetzner Managed PostgreSQL** anlegen, Connection-URL notieren | 5 Min | Dennis |
| 3 | **2x Hetzner VM** anlegen (z.B. CX21/CX31, Ubuntu 22.04), SSH-Keys hinterlegen | 10 Min | Dennis |
| 4 | **Hetzner Load Balancer** anlegen, Health-Check `/health`, Ziele = beide VMs | 10 Min | Dennis |
| 5 | **Docker + Docker Compose** auf beiden VMs installieren | 10 Min/VM | Dennis |
| 6 | **Projekt auf Server** bringen (git clone oder ZIP ohne node_modules) | 5 Min/VM | Dennis |
| 7 | **.env.prod** auf beiden VMs anlegen: DATABASE_URL, SESSION_SECRET, JWT_SECRET, INTERNAL_CRON_SECRET, ADMIN_SECRET, SMTP, BASE_URL, CORS_ORIGIN, RATE_LIMIT_STORE=redis, REDIS_URL | 15 Min | Dennis |
| 8 | **Migrations** einmal ausfuehren: `docker compose -f docker-compose.yml -f docker-compose.managed.yml run --rm migrate` | 2 Min | Dennis |
| 9 | **App starten** auf beiden VMs: `docker compose -f docker-compose.yml -f docker-compose.managed.yml -f docker-compose.ports-internal.yml up -d --build` | 5 Min/VM | Dennis |
| 10 | **Caddy** auf beiden VMs installieren + Caddyfile (Domain -> 127.0.0.1:8080) | 10 Min/VM | Dennis |
| 11 | **UFW Firewall** auf beiden VMs: nur 22, 80, 443 | 2 Min/VM | Dennis |
| 12 | **Managed DB Firewall**: nur die beiden VM-IPs erlauben | 5 Min | Dennis |
| 13 | **Smoke-Test**: https://domain/health -> 200, Registrierung -> E-Mail kommt an | 10 Min | Dennis |
| 14 | **Legal Pages Platzhalter ersetzen** -- Templates vorhanden (`/public/legal/`), `[Firmenname]`, `[Adresse]` etc. mit echten Daten fuellen | 30-60 Min | Dennis + ggf. Anwalt |

**Geschaetzter Gesamtaufwand Blocker: ~2-3 Stunden** (ohne Rechtliches)

### EMPFOHLEN (sollte zeitnah nach Go-Live)

| # | Was | Aufwand |
|---|-----|---------|
| 15 | **Cron-Jobs** einrichten: expire-reservations (2 Min), sla-scan (5 Min), demand-sla-scan (5 Min), demand-notdienst-escalate (2 Min), cleanup-idempotency (taeglich) -- mit X-Internal-Secret Header | 30 Min |
| 16 | **DB-Backup**: Cron mit pg_dump auf beide VMs oder separaten Storage (+ Managed-DB-Backups aktivieren) | 20 Min |
| 17 | **Uptime-Monitoring**: Externer Check auf https://domain/health (Uptime Kuma, Hetzner Monitoring, BetterUptime o.ae.) | 15 Min |
| 18 | **Redis**: Entscheidung ob lokaler Redis-Container pro VM reicht oder shared Redis. Bei kleiner Last: lokal pro VM reicht. | 15 Min |
| 19 | **Log-Rotation**: Docker-Logging mit max-size/max-file pruefen | 10 Min |
| 20 | **Stripe Live-Keys** eintragen + Webhook-URL auf https://domain/api/payment/webhook/stripe setzen | 15 Min |

### NICE-TO-HAVE (Phase 2)

| # | Was |
|---|-----|
| 21 | Staging-Umgebung (kleine dritte VM oder lokaler Docker-Stack) |
| 22 | Load-Test mit k6 (10-50 gleichzeitige User) |
| 23 | Zentrales Logging (Grafana Loki / Datadog) |
| 24 | Hetzner Managed Redis (statt lokaler Container) |
| 25 | CI/CD Pipeline (GitHub Actions -> Deploy auf VMs) |
| 26 | Automatisierte Tests im CI (stateMachine.test.js + Integration) |

---

## Hetzner-Kosten (geschaetzt, Stand Maerz 2026)

| Ressource | Typ | ca. Preis/Monat |
|-----------|-----|-----------------|
| 2x VM | CX21 (2 vCPU, 4 GB RAM) | 2 x ~6 EUR = 12 EUR |
| Managed PostgreSQL | Basic (2 GB RAM) | ~15 EUR |
| Load Balancer | LB11 | ~6 EUR |
| Domain (.de) | Registrar | ~1 EUR/Monat |
| **Gesamt** | | **~34 EUR/Monat** |

Alternativ sparsamer: **1x VM (CX31, 4 vCPU/8 GB)** statt 2 VMs + LB -> ~12 EUR/Monat + DB = ~27 EUR/Monat. Kein HA, aber fuer den Start ausreichend.

---

## Zusammenfassung

**Code-seitig ist alles fertig.** Es gibt keinen fehlenden Code oder fehlende Features fuer einen Go-Live.

Was fehlt, sind ausschliesslich **Infrastruktur- und Ops-Schritte**:
- Hetzner-Ressourcen anlegen (VM, DB, LB, Domain)
- .env.prod mit echten Werten
- Caddy + Firewall auf den VMs
- Platzhalter in Legal Pages (`[Firmenname]`, `[Adresse]` etc.) mit echten Firmendaten ersetzen

**Realistischer Zeitrahmen bis Go-Live: 1 Nachmittag** (ohne Anwalts-Pruefung fuer AGB/Impressum).
