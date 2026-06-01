# TempConnect — Release Notes: Marktstart

> Offizielle Release Notes für den Marktstart von TempConnect.
> WAVE 15 — Phase 2 — 2026-05-27

---

## Version

**Version:** 1.0 — Marktstart  
**Datum:** _______________ (ausstehend — nach WAVE 16 Burn-in)  
**Branch:** `release/enterprise-premium-market-ready`  
**Commit:** _______________

---

## Was ist TempConnect?

TempConnect ist eine **Buyer-first B2B-SaaS-Plattform für Zeitarbeitssteuerung**.

Für Einsatzunternehmen mit wiederkehrenden Zeitarbeitsbedarfen bietet TempConnect:
- Strukturierte Bedarfsplanung (Requisitions)
- Digitale Stundenzettel mit Genehmigungsworkflow
- Lieferantensteuerung (Vendor Pool, Rate Cards, Preferred Vendors)
- Spend Analytics & Executive Reporting
- Compliance-Management

---

## Verfügbare Pläne

| Plan | Preis | Kernfunktionen |
|---|---|---|
| **DEMO** | €0 | Plattform kennenlernen, Marktplatz |
| **BASIS** | €150/Monat | Bedarfe, Deals, Marktplatz |
| **PLUS** | €499/Monat | + Timesheets, Freigaben, Notdienst |
| **PRO** | €799/Monat | + Spend Analytics, Rate Cards, Advanced Reporting |
| **INDIVIDUELL** | Auf Anfrage | + Vendor Pool, Compliance, Multi-Standort, Enterprise-Governance |

---

## WAVE-Zusammenfassung (Phase 2)

| WAVE | Bereich | Status |
|---|---|---|
| WAVE 00–04 | Baseline, Hygiene, Secrets, Frontend, Business Logic | ✅ |
| WAVE 05 | KPI Dashboard, RLS-Härtung | ✅ |
| WAVE 06 | Docs: Pläne, Rollen, Features | ✅ |
| WAVE 07 | Pilot Core Flow | ✅ |
| WAVE 08 | KPI-Definitionen | ✅ |
| WAVE 09 | SSO Soft-Lock, MFA-Middleware | ✅ |
| WAVE 10 | API Surface + Versioning Docs | ✅ |
| WAVE 11 | Security-Hardening + Checklisten | ✅ |
| WAVE 12 | Operations, Monitoring, Backup (/live endpoint) | ✅ |
| WAVE 13 | Commercial Readiness (SSO/MFA/API Form-Felder) | ✅ |
| WAVE 14 | Premium UI/UX (Skip-Link, aria-label, role=main) | ✅ |
| WAVE 15 | Enterprise Evidence Pack | ✅ |
| WAVE 16 | Pre-Production Burn-in | ⏳ Ausstehend |

---

## Bekannte Einschränkungen (V1.0)

| Einschränkung | Details |
|---|---|
| **SSO/SAML** | Soft-locked. Nicht im Marktstart enthalten. Roadmap: Option A. |
| **MFA** | Opt-in, nicht verpflichtend. Empfohlen für Admins. |
| **OCC** | Owner Control Center Phase 1 (Shell vorhanden, Module in Entwicklung). |
| **RLS** | 10 Kerntabellen. ~60 weitere geplant (Migration 117). |

---

## Support

- **E-Mail:** _______________
- **Dokumentation:** `docs/` (intern)
- **Status-Page:** `https://<domain>/api/public/system-status`
- **Incident Response:** `docs/INCIDENT_RUNBOOK.md`

---

*WAVE 15 — Phase 2 — 2026-05-27*
*Freigabe: Owner*
