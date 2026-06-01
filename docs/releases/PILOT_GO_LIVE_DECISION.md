# TempConnect — Pilot Go-Live Entscheidung

> Formales Go/No-Go für den ersten Pilotkunden.
> WAVE 15 — Phase 2 — 2026-05-27

---

## Go-Kriterien (aus WAVES.md, aggregiert)

| Kriterium | Status | Beleg |
|---|---|---|
| Security Headers aktiv | ✅ | `api/app.js` + Helmet |
| CORS kein Wildcard | ✅ | `CORS_ORIGIN` ENV |
| Rate Limits aktiv | ✅ | `api/middleware/rateLimiter.js` |
| CSRF auf mutierenden Endpoints | ✅ | `api/middleware/csrf.js` |
| Session HttpOnly + Secure + SameSite=Strict | ✅ | `api/app.js` |
| RLS auf Kerntabellen | ✅ | Migration 116 |
| Org-Boundary auf allen Routen | ✅ | `assertOrgOwnership` |
| Audit-Log aktiv | ✅ | `api/middleware/auditWrite.js` |
| SSO Stub blockiert | ✅ | `api/routes/sso.js` |
| 0 High/Critical Vulnerabilities | ✅ | `npm audit` |
| Health/Ready/Live Endpoints | ✅ | `api/routes/health.js` |
| Backup funktioniert | ✅ | `scripts/backup.sh` |
| Restore getestet | ⏳ | **Manuell zu bestätigen** |
| Logs ohne Secrets | ✅ | Log-Format verifiziert |
| Production Compose ohne Dev-Mounts | ✅ | `docker-compose.prod.yml` |
| 3935 Tests, 0 Failures | ✅ | Node test runner |
| Pricing korrekt (kein Fake) | ✅ | `planCatalog.js` + `/api/public/catalog` |
| Staff kann Abo aktivieren | ✅ | SCC activate endpoint |
| INDIVIDUELL-Form vollständig | ✅ | `enterprise_anfrage.html` |
| Pilot-Runbook vorhanden | ✅ | `docs/enterprise-readiness/PILOT_CUSTOMER_RUNBOOK.md` |

---

## Offene Punkte (bekannt, akzeptiert für Pilot)

| ID | Beschreibung | Akzeptiert |
|---|---|---|
| ID-01 | MFA-Pflicht nicht erzwungen | Ja — MFA opt-in, Empfehlung kommuniziert |
| ID-03 | SSO nicht produktionsreif | Ja — Soft-Lock in Production, kein Fake |
| W11-01 | RLS auf ~60 weiteren Tabellen | Ja — App+Query sichern vollständig |
| W11-02 | Rate-Limit-Store Memory | Ja — Single-Instance für Pilot ausreichend |

---

## Freigabe

| | |
|---|---|
| **Pilot Go-Live Datum** | _______________ |
| **Pilot-Kunde** | _______________ |
| **Plan** | _______________ |
| **Tech-Freigabe** | _______________ |
| **Owner-Freigabe** | _______________ |
| **Restore Drill bestätigt** | ☐ Ja, Datum: ___________ |
| **Security Checklist abgehakt** | ☐ Ja |

---

**Status: BEREIT — Ausstehend: Owner-Freigabe + Restore-Drill-Bestätigung**

---

*WAVE 15 — Phase 2 — 2026-05-27*
