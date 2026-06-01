# TempConnect — Enterprise Pack

> Erstellt: 2026-05-28 | Für Enterprise-Kunden-Gespräche und Sicherheits-Reviews

Dieses Verzeichnis enthält strukturierte Nachweise für Enterprise-Kunden, Revisoren und Sicherheits-Teams.

---

## Enthaltene Dokumente

| Dokument | Inhalt |
|---|---|
| [`SECURITY_OVERVIEW.md`](./SECURITY_OVERVIEW.md) | HTTP-Security-Headers, CSRF, Session, RBAC, Audit-Trail, Secrets |
| [`TENANT_ISOLATION_TESTS.md`](./TENANT_ISOLATION_TESTS.md) | Cross-Tenant-Test-Suite (12 Tests, parametrisierter SQL-Nachweis) |
| [`OBSERVABILITY_OVERVIEW.md`](./OBSERVABILITY_OVERVIEW.md) | Sentry, Prometheus, Structured Logging, Health-Checks, Audit-Log |
| [`CSRF_RATE_LIMIT_COVERAGE.md`](./CSRF_RATE_LIMIT_COVERAGE.md) | CSRF-Abdeckung aller `/api/*` Routen, Rate-Limit-Konfiguration |
| [`BACKUP_RESTORE_TEST.md`](./BACKUP_RESTORE_TEST.md) | Backup/Restore-Checkliste (Dry-Run Template — Owner-Task ausstehend) |
| [`VERSION.md`](./VERSION.md) | Pack-Version, abgedeckte Wellen, Dateistatus, nächste Updates |
| [`GAPS.md`](./GAPS.md) | Ehrliches Lücken-Register (3 kritisch, 4 P1, 7 P2) |
| [`SLA_OPERATIONAL_COVERAGE.md`](./SLA_OPERATIONAL_COVERAGE.md) | SLA-Stufen vs. operative Deckung — was darf versprochen werden |

---

## Ergänzende Dokumente

| Dokument | Pfad |
|---|---|
| DSGVO TOMS | `docs/TOMS.md` |
| Subprozessoren | `docs/SUBPROCESSORS.md` |
| AVV-Vorlage | `docs/AVV_TEMPLATE.md` |
| KPI Source of Truth | `docs/KPI_SOURCE_OF_TRUTH.md` |
| OpenAPI Drift Report | `docs/OPENAPI_DRIFT_REPORT.md` |
| Security Model | `docs/SECURITY_MODEL.md` |
| Incident Runbook | `docs/INCIDENT_RUNBOOK.md` |
| Secret Rotation | `docs/SECRET_ROTATION.md` |

---

## Enterprise Readiness Score (Stand 2026-05-28)

| Bereich | Score |
|---|---|
| RBAC / Org-Boundary | 95 % |
| Hub Visibility Matrix | 95 % |
| Reporting Scope-Transparenz | 90 % |
| Audit Trail | 80 % |
| Soft-Fail / Zero-State | 85 % |
| Frontend Scope-Display | 90 % |
| Test-Suite | 95 % |
| OCC | 15 % |
| **Gesamt** | **~86 %** |

Ziel: ≥ 85 % — **erreicht** (vor Secret-Rotation und Backup-Dry-Run als vollständig betrachtet).
