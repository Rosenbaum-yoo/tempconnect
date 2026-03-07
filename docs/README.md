# TempConnect – Dokumentations-Übersicht

**Einstieg für KI und Menschen:** [ENTERPRISE-FEATURES-FOR-KI.md](ENTERPRISE-FEATURES-FOR-KI.md) – beschreibt, was gebaut wurde und wo es liegt (Backend, Frontend, Enterprise-Features, Navigation, Sicherheit).

---

## Wichtige Dokumente

| Dokument | Inhalt |
|----------|--------|
| [ENTERPRISE-FEATURES-FOR-KI.md](ENTERPRISE-FEATURES-FOR-KI.md) | **KI-Infodatei:** Kontext, 3 Enterprise-Features, Backend/Frontend-Pfade, Schnellzugriff-Navigation, Referenzen, Schnell-Check. |
| [FEATURE-SUMMARY.md](FEATURE-SUMMARY.md) | Kompakte Feature-Übersicht (Model B + Enterprise + Navigation + Infrastruktur-Readiness). |
| [GO-LIVE-HETZNER.md](GO-LIVE-HETZNER.md) | **Go-Live Anleitung Hetzner:** PROD-Start (ohne override), UFW, Caddy, Deployment, Health/Monitoring, Repo-Hygiene, HA-Check, 10-Punkte-Checklist. |
| [GO-LIVE-GAP-ANALYSE.md](GO-LIVE-GAP-ANALYSE.md) | Gap-Analyse: Was fertig ist (Code/Config), was noch fehlt (Blocker/Empfohlen/Nice-to-have) + Kosten. |
| [DEVOPS-ZUSAMMENFASSUNG.md](DEVOPS-ZUSAMMENFASSUNG.md) | DevOps/Hardening-Log + Start-Befehle + ENV-Checkliste. |
| [PROD_HETZNER.md](PROD_HETZNER.md) | Produktion: Firewall, Reverse Proxy, Pooling/SSL, Backups, Monitoring, Log-Rotation. |
| [SECURITY-CONFIG.md](SECURITY-CONFIG.md) | Sichere Konfiguration + Key Rotation; Fail-Fast in Prod (SESSION/JWT/CRON/ADMIN). |
| [SECURITY-VERIFICATION.md](SECURITY-VERIFICATION.md) | Prüfbefehle (grep/PowerShell), damit keine Secrets in getrackten Dateien stehen. |
| [VOR-HETZNER-GO-LIVE.md](VOR-HETZNER-GO-LIVE.md) | Go-Live-Checkliste (Phase 0–2), .env, Migrations, Cron-Jobs, SSL, Backup. |
| [MODEL-B-IMPLEMENTATION.md](MODEL-B-IMPLEMENTATION.md) | Model B: Capacities, Reservierungen, Request-Flow, API, Frontend-Hinweis. |
| [ENTERPRISE-UI-DELIVERABLES.md](ENTERPRISE-UI-DELIVERABLES.md) | Enterprise-UI: Dateiliste, Screens, URLs, Verifikation. Einstieg: Sidebar „Kapazitätssuche" (1. Button) → `/public/enterprise.html`. |
| [ENTERPRISE-SALES-STORY-VERIFICATION.md](ENTERPRISE-SALES-STORY-VERIFICATION.md) | Backend-Verifikation: SLA-Breach, Scorecard, Cron, curl. |
| [MODEL-B-LIVE-CAPACITY-FEED.md](MODEL-B-LIVE-CAPACITY-FEED.md) | Architektur, Transaktionen, Sicherheit (Capacity-Feed). |
| [SENDGRID-EINRICHTEN.md](SENDGRID-EINRICHTEN.md) | SendGrid einrichten, API-Key, Sender, Domain (DNS). |
| [SENDGRID-KURZ-ERKLAERT.md](SENDGRID-KURZ-ERKLAERT.md) | SendGrid kurz erklärt, .env-Beispiel (nur Platzhalter). |
| [ENTERPRISE-HARDENING-PATCH.md](ENTERPRISE-HARDENING-PATCH.md) | Idempotency, Audit, Reserve-Lockdown, Status-Maschine, Cron; Idempotency Enterprise (Migration 012). |
| **API-Docs (unter api/docs/)** | |
| [api/docs/ENDPOINTS.md](api/docs/ENDPOINTS.md) | Vollständige API-Endpoint-Liste (nach Refactoring). |
| [api/docs/IDEMPOTENCY-CURL.md](api/docs/IDEMPOTENCY-CURL.md) | Idempotency: Scope pro User, Ablauf 24h, Cleanup-Job, curl-Beispiele. |

---

**Regel:** Bei größeren Änderungen am Projekt die **KI-Infodatei** ([ENTERPRISE-FEATURES-FOR-KI.md](ENTERPRISE-FEATURES-FOR-KI.md)) und ggf. diese Übersicht anpassen, damit andere KIs und Menschen den Überblick behalten.
