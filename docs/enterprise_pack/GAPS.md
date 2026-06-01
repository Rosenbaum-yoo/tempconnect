# TempConnect — Enterprise Pack Lücken-Register

> Erstellt: 2026-05-28 | Enterprise Pack
> Zweck: Ehrliche Dokumentation aller bekannten Lücken im Enterprise Readiness Pack.
> Grundsatz: Offen kommunizierte Lücken sind besser als entdeckte Täuschungen.

---

## Legende

| Symbol | Bedeutung |
|---|---|
| 🔴 | Kritisch — muss vor Enterprise-Deal geschlossen werden |
| 🟠 | P1 — sollte vor erstem Pilotkunden geschlossen werden |
| 🟡 | P2 — Nice-to-have vor öffentlichem Launch |
| ✅ | Lücke geschlossen |

---

## 1. Security

### G-SEC-01 🟠 Externer Pentest fehlt
- **Was fehlt:** Unabhängiger, externer Penetrationstest
- **Warum:** Interne Tests + Code-Review sind kein Ersatz für professionelle externe Prüfung
- **Risiko:** Enterprise-Kunden fragen nach Pentest-Berichten; ohne Bericht = potenzielles Dealbreaker
- **Mitigation:** Alle kritischen Flows intern getestet (Cross-Tenant, CSRF, Auth, RBAC). Kein bekanntes offenes Sicherheitsproblem.
- **Geplant:** Nach erstem signifikantem ARR / vor Series-A-Vorbereitung
- **Datei wenn fertig:** `docs/enterprise_pack/PENTEST_SUMMARY.md`

### G-SEC-02 🟡 Dependency Audit (npm audit) nicht als Artefakt
- **Was fehlt:** Datierter `npm audit`-Report als Pack-Datei
- **Mitigation:** `npm audit` läuft in CI; aktuelle Critical/High werden blockiert
- **Geplant:** Automatisch als CI-Artefakt nach Release
- **Datei wenn fertig:** `docs/enterprise_pack/DEPENDENCY_AUDIT.md`

### G-SEC-03 🟠 SSO nicht produktionsreif
- **Status:** SSO-Service im Stub-Modus (`SSO_MODE="stub"`). `@node-saml/node-saml` fehlt in package.json.
- **Risiko:** Enterprise-Kunden mit SAML/OIDC-Anforderung können nicht produktiv gehen
- **Kommunikation:** Offen kommunizieren: "SSO in Entwicklung, geplant für Q3 2026"
- **Abhängigkeit:** OE-03 (Owner: Okta-Dev oder Azure AD als Testlauf)
- **DECISION_BOARD:** F-01

---

## 2. Operations

### G-OPS-01 🔴 Backup/Restore Dry-Run nicht durchgeführt
- **Was fehlt:** Echter Testlauf mit Produktions-ähnlichen Daten
- **Template:** `docs/enterprise_pack/BACKUP_RESTORE_TEST.md` bereit
- **Scripts:** `scripts/backup.sh`, `backup-verify.sh`, `restore.sh`, `restore-test.sh` vorhanden
- **RPO/RTO:** RPO 24h (täglich), RTO < 2h (geschätzt — nicht gemessen)
- **Owner-Task:** I-01 — 2 Stunden Aufwand
- **Akzeptanzkriterium:** Checkliste in BACKUP_RESTORE_TEST.md vollständig abgehakt, RTO gemessen

### G-OPS-02 🟠 Prometheus-Metriken ohne echtes Secret
- **Status:** Mechanismus implementiert (`start-prometheus.sh` substituiert `PROMETHEUS_METRICS_SECRET_PLACEHOLDER`)
- **Offen:** `PROMETHEUS_METRICS_SECRET` in Produktions-`.env` noch nicht gesetzt
- **Owner-Task:** B-03 — 5 Minuten Aufwand

### G-OPS-03 🟠 Nginx VHost `staff.tempconnect.de` nicht konfiguriert
- **Status:** SCC-Code fertig (WAVE_03–06, 11–13). VHost-Setup = Ops-Aufgabe
- **Offen:** DNS, Nginx-Config, TLS auf Hetzner-Server
- **Owner-Task:** G-01 — 0,5–1 Tag Aufwand

---

## 3. Commercial / Legal

### G-COM-01 🟡 Plan-Feature-Matrix als eigenständige Pack-Datei fehlt
- **Was fehlt:** Übersichtliche Tabelle Plan × Feature als Pack-Datei
- **Mitigation:** `docs/COMMERCIAL_SOURCE_OF_TRUTH.md` enthält alle Plan-Definitionen
- **Geplant:** Extrakt aus COMMERCIAL_SOURCE_OF_TRUTH für Enterprise-Demos
- **Datei wenn fertig:** `docs/enterprise_pack/PLAN_FEATURE_MATRIX.md`

### G-COM-02 🟡 Legal-Übersichtsdatei fehlt
- **Was fehlt:** Kompakte Legal-Overview mit Status aller Legal-Dokumente
- **Vorhandene Einzeldokumente:** `TOMS.md`, `SUBPROCESSORS.md`, `AVV_TEMPLATE.md`, `DATA_GOVERNANCE.md`
- **Geplant:** Nach erstem Enterprise-Deal
- **Datei wenn fertig:** `docs/enterprise_pack/LEGAL_OVERVIEW.md`

### G-COM-03 🔴 AVV nicht juristisch geprüft
- **Status:** `docs/AVV_TEMPLATE.md` als Template erstellt
- **Risiko:** Juristisch ungeprüftes AVV darf nicht an Enterprise-Kunden ausgehändigt werden
- **Mitigation:** Klar als "Template — vor Verwendung durch Rechtsanwalt/DSB prüfen lassen" markiert
- **Geplant:** Vor erstem Enterprise-Vertragsabschluss

### G-COM-04 🟡 Data Retention Policy als eigenständiges Dokument fehlt
- **Was fehlt:** Formales Aufbewahrungskonzept (Art. 17 DSGVO)
- **Mitigation:** `docs/DATA_GOVERNANCE.md` enthält Retention-Grundsätze
- **Geplant:** Vor erster DSGVO-Anfrage
- **Datei wenn fertig:** `docs/DATA_RETENTION.md`

### G-COM-05 🟡 Self-Service-Datenexport-Format nicht dokumentiert
- **Was fehlt:** Dokumentiertes Export-Format für Kundendaten (Art. 20 DSGVO — Portabilität)
- **Geplant:** Vor erster Enterprise-Anfrage
- **Datei wenn fertig:** `docs/DATA_EXPORT_FORMAT.md`

---

## 4. QA / Evidence

### G-QA-01 🟡 Test-Coverage-Summary als Pack-Datei fehlt
- **Was fehlt:** Formale Coverage-Auswertung (Istanbul/c8)
- **Mitigation:** Test-Suite zählt 3.754+ Tests; alle Kernpfade abgedeckt (RBAC, Tenant-Isolation, Plan-Gates, Billing-Lifecycle)
- **Bekannt:** OpenAPI-Spec hat < 4% Abdeckung (dokumentiert in `docs/OPENAPI_DRIFT_REPORT.md`)
- **Geplant:** Nach E2E-Smoketests (E-01)
- **Datei wenn fertig:** `docs/enterprise_pack/TEST_COVERAGE_SUMMARY.md`

### G-QA-02 🟡 CI-Gates-Übersicht als Pack-Datei fehlt
- **Was fehlt:** Kompakte Übersicht welche Gates in CI laufen
- **Mitigation:** `.github/workflows/ci.yml` dokumentiert alle Gates (unit-tests, audit-coverage, lint, scc-build, occ-build, docker-build, verify-release-dir)
- **Geplant:** Extrakt für Enterprise-Pack
- **Datei wenn fertig:** `docs/enterprise_pack/CI_GATES.md`

### G-QA-03 🟡 Release-Artifact-Verification-Dokument fehlt
- **Mitigation:** `scripts/verify_release_dir.sh` (CI-Script) prüft bereits: .env, .git, node_modules, .claude, .agents, coverage, _zip_analysis, FEATURE_GATE_BYPASS
- **Geplant:** Automatisch als CI-Artefakt
- **Datei wenn fertig:** `docs/enterprise_pack/RELEASE_ARTIFACT_VERIFICATION.md`

### G-QA-04 🔴 E2E-Smoketests nicht vorhanden
- **Was fehlt:** Playwright-E2E-Tests für kritische Flows (Login, Requisition, Deal, Timesheet)
- **Risiko:** Kernflow-Bruch vor Go-Live ohne automatischen Nachweis erkennbar
- **DECISION_BOARD:** E-01 — 1–1,5 Tage Aufwand
- **Abhängigkeit:** Staging-Umgebung, Playwright-Setup

---

## 5. SLA

### G-SLA-01 ✅ SLA-Operative-Coverage dokumentiert — 2026-05-28
- **Datei:** `docs/enterprise_pack/SLA_OPERATIONAL_COVERAGE.md`
- **Befund:** Basis-SLA (99,5 %) kommunizierbar mit Hinweis auf fehlende Uptime-Historie. `sla99` Add-on (99,9 %) darf erst angeboten werden wenn 24/7 On-Call operativ aufgesetzt ist (PagerDuty/Alertmanager).
- **Staff-Guard:** `requires_staff_approval: true` auf `sla99` Add-on — keine Selbstaktivierung möglich.

---

## Prioritäts-Zusammenfassung

| Priorität | Anzahl | Kritischste Lücke |
|---|---|---|
| 🔴 Kritisch | 3 | Backup Dry-Run, AVV-Prüfung, E2E-Smoketests |
| 🟠 P1 | 4 | Pentest, SSO, Prometheus-Secret, Nginx VHost |
| 🟡 P2 | 7 | Plan-Feature-Matrix, Legal-Overview, Data Retention, Export-Format, Coverage, CI-Gates, Release-Artifact |

---

## Nachträgliche Schließung

Sobald eine Lücke geschlossen wird:
1. Diese Datei aktualisieren (Symbol → ✅, Datum + Lösung eintragen)
2. `VERSION.md` Pack-Version erhöhen
3. `README.md` in enterprise_pack aktualisieren
