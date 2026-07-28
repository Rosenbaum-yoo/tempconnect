# TempConnect – Dokumentations-Übersicht
Produktkern: TempConnect fokussiert Zeitarbeits-Bedarfe, Angebotsabwicklung, Dealabschluss, Lieferantensteuerung sowie digitale Einsatz- und Stundenzettelprozesse.
Dominanter Einstiegs-ICP: groessere Einsatzunternehmen mit wiederkehrenden Zeitarbeitsbedarfen, Vendor-Steuerung sowie Freigabe- und Spend-Druck; Personaldienstleister sind der Ausbau-ICP.

**Einstieg für KI und Menschen:** [ENTERPRISE-FEATURES-FOR-KI.md](ENTERPRISE-FEATURES-FOR-KI.md) – beschreibt, was gebaut wurde und wo es liegt (Backend, Frontend, Enterprise-Features, Navigation, Sicherheit).

---

## Wichtige Dokumente

| Dokument | Inhalt |
|----------|--------|
| [ENTERPRISE-FEATURES-FOR-KI.md](ENTERPRISE-FEATURES-FOR-KI.md) | **KI-Infodatei:** Kontext, 3 Enterprise-Features, Backend/Frontend-Pfade, Schnellzugriff-Navigation, Referenzen, Schnell-Check. |
| [FEATURE-SUMMARY.md](FEATURE-SUMMARY.md) | Kompakte Feature-Übersicht (Model B + Enterprise + Navigation + Infrastruktur-Readiness). |
| [GO_LIVE_FINAL.md](GO_LIVE_FINAL.md) | Versionierte Go-Live-Checkliste mit Blockern, Betriebsreife und Smoke-Gates. |
| [ENTERPRISE_GO_LIVE_GATE.md](ENTERPRISE_GO_LIVE_GATE.md) | Verbindlicher Enterprise-Go-Live-Entscheidungsvertrag (Hard-Gates G0-G7 + Evidenzsatz). |
| [../DEPLOYMENT.md](../DEPLOYMENT.md) | Versionierter Release-, Artefakt-, Deployment-, Monitoring-, Rollback- und Backup/Restore-Pfad. |
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
| [THEME-SYSTEM.md](THEME-SYSTEM.md) | Dark/Light-Theming: Tokens (`--ds-*`, `--tc-*`), `theme.js`, Toggle, Speicherung, Erweiterungshinweise. |
| [ACCESS-AND-NAVIGATION-GUARDS.md](ACCESS-AND-NAVIGATION-GUARDS.md) | Harte Guards nach Logout, Marktplatz-Access-Absicherung, einheitliche Logo-Zielregel je Login/Rolle. |
| **API-Docs (unter api/docs/)** | |
| [api/docs/ENDPOINTS.md](../api/docs/ENDPOINTS.md) | Vollständige API-Endpoint-Liste (nach Refactoring). |
| [api/docs/IDEMPOTENCY-CURL.md](../api/docs/IDEMPOTENCY-CURL.md) | Idempotency: Scope pro User, Ablauf 24h, Cleanup-Job, curl-Beispiele. |

---

## Betrieb, Architektur, Markt

> Diese Dokumente gab es längst — sie standen nur in keinem Index und waren damit
> praktisch nicht auffindbar. `api/test/docsConsistency.test.js` hält die Liste ab
> jetzt ehrlich: tote Links werden sofort rot, und die Zahl unverlinkter Dokumente
> darf nur noch sinken.

**Betrieb & Notfall**

| Dokument | Inhalt |
|----------|--------|
| [RELEASE_RUNBOOK.md](RELEASE_RUNBOOK.md) | Ablauf eines Releases von Freigabe bis Rollback. |
| [engineering/OPERATIONS_RUNBOOK.md](engineering/OPERATIONS_RUNBOOK.md) | Laufender Betrieb: Wartung, Jobs, wiederkehrende Handgriffe. |
| [HETZNER_HA_RUNBOOK.md](HETZNER_HA_RUNBOOK.md) | Hochverfügbarkeit auf Hetzner: Aufbau und Umschaltung. |
| [BACKUP_DISASTER_RECOVERY.md](BACKUP_DISASTER_RECOVERY.md) | Sicherung und Wiederanlauf — inklusive Wiederherstellungsprobe. |
| [SECURITY_INCIDENTS.md](SECURITY_INCIDENTS.md) | Vorgehen bei Sicherheitsvorfällen: melden, eindämmen, aufarbeiten. |

**Architektur**

| Dokument | Inhalt |
|----------|--------|
| [ARCHITEKTUR.md](ARCHITEKTUR.md) | Gesamtaufbau der Plattform auf Deutsch. |
| [ENTERPRISE_ARCHITECTURE.md](ENTERPRISE_ARCHITECTURE.md) | Enterprise-Schicht: Mandanten, Standorte, Freigaben. |
| [PRODUCT_ANALYTICS_ARCHITECTURE.md](PRODUCT_ANALYTICS_ARCHITECTURE.md) | Produktdaten: Ereignisse, Trichter, Auswertung. |

**Markt & Pilot**

| Dokument | Inhalt |
|----------|--------|
| [MARKTSTART_PLAN.md](MARKTSTART_PLAN.md) | Go-to-Market: Zielkunden, Reihenfolge, Botschaften. |
| [PILOT_GO_LIVE_TODOS.md](PILOT_GO_LIVE_TODOS.md) | Offene Punkte bis zum Pilotstart (laut CLAUDE.md pflegepflichtig). |
| [releases/PILOT_GO_LIVE_DECISION.md](releases/PILOT_GO_LIVE_DECISION.md) | Entscheidungsvorlage für den Pilot-Start. |
| [releases/PHASE_STATUS.md](releases/PHASE_STATUS.md) | Stand der Ausbaustufen. |
| [enterprise-readiness/PILOT_CUSTOMER_RUNBOOK.md](enterprise-readiness/PILOT_CUSTOMER_RUNBOOK.md) | Betreuung eines Pilotkunden von Aufnahme bis Abnahme. |

**Produkt**

| Dokument | Inhalt |
|----------|--------|
| [ONBOARDING_SYSTEM.md](ONBOARDING_SYSTEM.md) | Einführung neuer Organisationen und Nutzer. |
| [RATE_CARDS.md](RATE_CARDS.md) | Konditionsrahmen: Aufbau, Geltung, Sichtbarkeit. |
| [features/MULTI_SKILL_ANGEBOTSMANAGEMENT.md](features/MULTI_SKILL_ANGEBOTSMANAGEMENT.md) | Multi-Skill-Angebote — Alleinstellungsmerkmal, Wellenplan. |

**Support-Ops**

| Dokument | Inhalt |
|----------|--------|
| [support/api-contract.md](support/api-contract.md) | Schnittstellenvertrag des Support-Bereichs. |
| [support/implementation-state.md](support/implementation-state.md) | Umsetzungsstand. |
| [support/security-review.md](support/security-review.md) | Sicherheitsbetrachtung des Support-Zugangs. |
| [support/handoff-and-go-live.md](support/handoff-and-go-live.md) | Übergabe und Inbetriebnahme. |

**Recht**

| Dokument | Inhalt |
|----------|--------|
| [AVV_TEMPLATE.md](AVV_TEMPLATE.md) | Auftragsverarbeitungsvertrag — Vorlage. |

---

**Regel:** Bei größeren Änderungen am Projekt die **KI-Infodatei** ([ENTERPRISE-FEATURES-FOR-KI.md](ENTERPRISE-FEATURES-FOR-KI.md)) und ggf. diese Übersicht anpassen, damit andere KIs und Menschen den Überblick behalten.
