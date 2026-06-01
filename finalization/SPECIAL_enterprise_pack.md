# SPECIAL — Enterprise Readiness Pack

> Jederzeit referenzierbar. Wird relevant, sobald Pilot- oder Enterprise-Demos / Due-Diligence anstehen.

---

## Zweck

Ein **Evidenzpaket**, das Claude Code zusammenstellt und versioniert ablegt — damit bei Enterprise-Käufer-Prüfungen, Pilot-Reviews oder ARR-/Bewertungs-Diskussionen nicht improvisiert werden muss.

Dieses Pack ist NICHT Marketing. Es ist **Beweis**, dass die Aussagen aus WAVE_06 (Security), WAVE_13 (Observability), WAVE_14 (Legal) und dem globalen Go-Live-Gate (`99_GOLIVE_GATE.md`) operativ gedeckt sind.

---

## Voraussetzung

- WAVE_06 (Security) abgeschlossen
- WAVE_13 (Observability) abgeschlossen
- WAVE_14 (Legal) abgeschlossen
- WAVE_12 (Tests) grün

---

## Inhalt des Packs

Das Pack liegt unter `docs/enterprise_pack/` und enthält:

### 1. Security Evidence

- `SECURITY_OVERVIEW.md`
  - Auth-Modell (Session, MFA, Step-up — siehe WAVE_06)
  - Tenant-Isolation-Architektur (App + RLS-Backstop)
  - API-Key-Scopes und Rotation
  - SSO-Status (produktiv ODER ehrlich Coming Soon)
  - Owner-/Operations-Bereich-Schutz
- `PENTEST_SUMMARY.md` (falls Pentest durchgeführt)
- `DEPENDENCY_AUDIT.md` (Output `npm audit`, datiert)
- `CSRF_RATE_LIMIT_COVERAGE.md` (welche Routen sind geschützt)

### 2. Tenant Isolation Evidence

- `TENANT_ISOLATION_TESTS.md`
  - Liste aller Cross-Org-Negativtests (aus WAVE_03 / WAVE_12)
  - Letztes Test-Run-Ergebnis
  - RLS-Policies (falls vorhanden)
- Test-Output als Artefakt anhängen

### 3. Observability & Operations

- `OBSERVABILITY_OVERVIEW.md`
  - Structured Logging Schema
  - Request-ID-Propagation
  - Metrics-Endpunkte
  - Alert-Regeln
- `HEALTHCHECKS.md` (Liste + Status)
- `INCIDENT_RUNBOOK.md` (P0/P1-Incident-Prozess)
- `BACKUP_RESTORE_TEST.md` (Datum letzter erfolgreicher Restore-Test, RPO/RTO)

### 4. Commercial Source of Truth

Aus WAVE_02 (`docs/COMMERCIAL_SOURCE_OF_TRUTH.md`) — bereits vorhanden, hier nur referenzieren.

Zusätzlich:
- `PLAN_FEATURE_MATRIX.md` — übersichtliche Tabelle: Plan × Feature
- `ADDON_CATALOG.md` — alle Add-ons, Aktivierungs-Logik

### 5. Legal & Compliance

Aus WAVE_14:
- `docs/AVV_TEMPLATE.md` (AVV/DPA-Template)
- `docs/SUBPROCESSORS.md`
- `docs/TOMS.md`
- `docs/DATA_RETENTION.md` (Aufbewahrung, Löschung)
- `docs/DATA_EXPORT_FORMAT.md` (Self-Service-Export für Kunden)

Plus Konsolidierung:
- `LEGAL_OVERVIEW.md` — Übersicht über alle Legal-Dokumente mit Status und letztem Prüfdatum

### 6. SLA-Evidenz

- `SLA_OPERATIONAL_COVERAGE.md`
  - Welche SLA-Stufe wird angeboten
  - Operative Deckung (Monitoring + Incident-Prozess + Personal)
  - Historische Uptime (falls Daten vorhanden)
  - **Wenn keine Deckung:** SLA nicht anbieten ODER niedrigere Stufe ehrlich kommunizieren

### 7. Quality Evidence

- `TEST_COVERAGE_SUMMARY.md` (aus WAVE_12)
- `CI_GATES.md` (welche Gates laufen, Reproduzierbarkeit)
- `RELEASE_ARTIFACT_VERIFICATION.md` (Hygiene-Checks aus WAVE_01)

### 8. Pilot- / ARR-Evidence (separat)

- `PILOT_TRACKING.md`
  - Aktive Pilot-Kunden (anonymisiert oder mit Einwilligung)
  - Pilot-Status (in Onboarding, aktiv, in Eskalation, abgeschlossen)
  - Pilot-Feedback-Themen
- `ARR_SNAPSHOT.md`
  - MRR / ARR (mit Quelle: Subscription-Service, nicht geschätzt)
  - Aktive Pläne
  - Add-on-Verteilung
  - Credits NICHT in MRR enthalten (siehe WAVE_08)

---

## Aufgaben

### 1. Inventur

Aktueller Stand pro Bereich aus den abgeschlossenen Wellen extrahieren. Nichts neu erfinden — bestehende Doku-Dateien referenzieren.

### 2. Konsolidierung

Pro Bereich eine kompakte Overview-Datei (5-15 Zeilen) mit Links zu Detail-Dokus.

### 3. Versionierung

`docs/enterprise_pack/VERSION.md`:
- Pack-Version (Datum)
- Welche Welle hat zuletzt Inhalt aktualisiert
- Bekannte Lücken (ehrlich)
- Nächste geplante Aktualisierung

### 4. Lücken-Register

`docs/enterprise_pack/GAPS.md`:
- Was fehlt noch (z. B. Pentest-Report, externe Zertifizierungen)
- Begründung, warum es fehlt
- Geplanter Termin / Bedingung für Ergänzung

Lücken offen kommunizieren ist besser als Lücken kaschieren — Enterprise-Käufer fragen ohnehin.

---

## Akzeptanzkriterien

- [ ] `docs/enterprise_pack/` existiert mit allen Pflicht-Bereichen
- [ ] Jede Aussage hat Quelle (Welle / Dokument / Test-Output)
- [ ] Keine Behauptung ohne operative Deckung (besonders SLA, SSO, Multi-Tenant)
- [ ] Lücken-Register ist gepflegt und ehrlich
- [ ] Pack ist demo-fähig (kann einem Enterprise-Käufer in 20 Minuten gezeigt werden)
- [ ] Versionsstand ist sichtbar

---

## Stop-Regeln

- SLA-Aussage ohne operative Deckung → STOP, ehrlich kommunizieren
- Behauptungen über Zertifizierungen, die nicht existieren → STOP, entfernen
- Pentest-Claim ohne durchgeführten Pentest → STOP, als geplant markieren

---

## Triage-Hinweis

Der Druck, dieses Pack "vollständig" wirken zu lassen, ist hoch — besonders bei wichtigen Pilot-Verhandlungen. **Widerstehe.** Eine ehrliche Lücken-Liste ist Verkaufsvorteil, eine entdeckte Lüge ist Verkaufsende.

---

## Übergang

Dieses Pack ist **nicht** ein einmaliges Artefakt. Es wird mit jedem neuen Pilot / Enterprise-Deal aktualisiert. In `docs/enterprise_pack/VERSION.md` Update-Zyklen dokumentieren.
