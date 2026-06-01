# TempConnect – Enterprise Go-Live-Gate
Dieses Dokument definiert das verbindliche Abnahmegate vor produktiven Releases auf Enterprise-Niveau. Es ergänzt die operative Checkliste in `GO_LIVE_FINAL.md` um harte, nachweisbare Entscheidungskriterien.

## Ziel
Ein Release wird nur dann freigegeben, wenn Release-Wahrheit, Betriebsfähigkeit, Qualitätsnachweis, KPI-Semantik, Fail-soft-Verhalten, Governance und Pilot-Onboarding konsistent belegt sind.

## Gate-Modell
Die Gates G0 bis G7 sind Hard-Gates. Ein einzelnes rotes Hard-Gate bedeutet `NO-GO`.

### G0 – Release-Wahrheit und Artefakt-Disziplin
Kriterium:
- Release stammt aus einem versionierten Git-Ref und dem CI-Job `release-artifact`.
- Artefakt enthält die Produktionspflichtdateien und keine verbotenen Build-/Secret-Artefakte.
Evidenz:
- CI-Run-Link + Commit-SHA.
- Artefakt-SHA aus Manifest.
- Verifikation gemäß `.github/workflows/ci.yml` und `DEPLOYMENT.md`.

### G1 – Restore-Nachweis und Disaster-Recovery
Kriterium:
- Letztes Backup wurde erfolgreich erstellt und verifiziert.
- Restore-Test wurde gegen ein verifiziertes Backup erfolgreich durchgeführt.
Evidenz:
- Ausgaben von `scripts/backup.sh`, `scripts/backup-verify.sh`, `scripts/restore-test.sh`.
- Dokumentiertes Backup-Ziel, Retention, RPO/RTO-Verantwortung.

### G2 – Kritische QA-Tiefe und Coverage-Wahrheit
Kriterium:
- Backend-Lint, Frontend-Lint, Unit- und Integrationstests sind grün.
- Coverage-Thresholds gemäß `api/.c8rc.json` werden eingehalten.
Evidenz:
- CI-Ergebnis der Jobs `lint-typecheck`, `frontend-lint`, `unit-tests`, `integration-tests`.
- Coverage-Artefakte aus CI.

### G3 – KPI-Wahrheit und kanonische Datenquellen
Kriterium:
- Executive- und Procurement-KPIs folgen dem Reporting-Vertrag.
- Drilldowns und Verfügbarkeitssemantik sind fachlich konsistent.
Evidenz:
- `docs/EXECUTIVE_REPORTING.md`, `docs/RATE_CARDS.md`, `docs/SPEND_ANALYTICS.md`.
- Grüne Tests für `reportingService`, `rateCardService`, `spendAnalyticsService`.

### G4 – Systemweites Fail-soft- und Empty-State-Verhalten
Kriterium:
- Leere Daten werden als gültiger Zustand angezeigt.
- Teilfehler degradieren abschnittsweise statt global.
- Technische Nichtverfügbarkeit wird explizit markiert.
Evidenz:
- Smoke-Checks auf `executive_dashboard.html`, `requisitions.html`, `vendor_pool.html`, `rate-cards.html`, `spend-analytics.html`.
- Regressionsnachweise für Deep-Links und Seitenverdrahtung.

### G5 – Governance, RBAC und Admin-Operabilität
Kriterium:
- RBAC-/Org-Grenzen greifen durchgehend auf API-Ebene.
- Admin-/Control-Center-Eingriffe sind nachvollziehbar und auditierbar.
- SSO/SAML wirkt nur im gültigen Runtime-/Plan-/Org-Kontext.
Evidenz:
- Grüne RBAC-/Security-Integrationstests.
- Aktuelle Doku: `ADMIN_CONTROL_CENTER.md`, `ORGANIZATION_CONTROL_CENTER.md`, `INTERNAL_CONTROL_CENTER.md`.

### G6 – Operativer Goldkern Ende-zu-Ende
Kriterium:
- Die Kette Bedarf → Deal → Assignment → Timesheet ist regressionssicher.
- Übergaben zwischen Beschaffung, Besetzung und Abrechnungsnähe bleiben konsistent.
Evidenz:
- Grüne Flows in `api/test/integration/requisition.flow.test.js`, `deal.flow.test.js`, `timesheet.flow.test.js`.
- Keine offenen kritischen Defekte in den Kernübergängen.

### G7 – Pilotkunden-Onboarding und Planmodell-Konsistenz
Kriterium:
- Pilotkunden laufen als echte `individuell`-Konten mit gültigem Feature-Bundle.
- Keine Vermischung mit Demo-Gates.
- Planbezeichnungen und Feature-Gates sind systemweit konsistent.
Evidenz:
- `api/config/planFeatures.js`, `api/services/userService.js`, `api/middleware/featureGate.js`.
- Doku: `PLAN_TERMINOLOGY.md`, `api/docs/PILOT_POLICY.md`.

## Entscheidungslogik
- `GO`: Alle Hard-Gates G0 bis G7 grün und evidenzbasiert dokumentiert.
- `NO-GO`: Mindestens ein Hard-Gate rot oder Evidenz unvollständig.
- `CONDITIONAL GO` ist nur für nicht-kritische Nacharbeiten nach Release zulässig und darf Hard-Gates nicht verletzen.

## Minimaler Evidenz-Satz pro Release
- Commit/Tag + CI-Run.
- Artefakt-SHA.
- Test-/Coverage-Status.
- Backup-Verify + Restore-Test-Nachweis.
- Kurzprotokoll der Gate-Entscheidung mit Verantwortlichen.

## Verknüpfte Runbooks
- `GO_LIVE_FINAL.md` – operative Go-Live-Checkliste.
- `../DEPLOYMENT.md` – technischer Release-, Rollback- und Restore-Pfad.
- `GO_LIVE_TEST_MATRIX.md` – Test-Matrix für wiederkehrende Verifikation.
