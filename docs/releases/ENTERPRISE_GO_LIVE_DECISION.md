# TempConnect — Enterprise Go-Live Entscheidung

> Formales Go/No-Go für den ersten Enterprise-Kunden (INDIVIDUELL-Tarif).
> WAVE 15 — Phase 2 — 2026-05-27

---

## Zusätzliche Kriterien gegenüber Pilot

Enterprise-Go-Live setzt alle Pilot-Go-Live-Kriterien voraus, plus:

| Kriterium | Status | Beleg |
|---|---|---|
| Pilot mindestens 4 Wochen stabil gelaufen | ⏳ Ausstehend | Pilot Go-Live zuerst |
| INDIVIDUELL-Tarif vollständig konfiguriert | ✅ | Konfigurator + Staff-Prozess |
| AVV (DSGVO) liegt vor | ⏳ Rechtlich prüfen | Legal-Prüfung |
| Enterprise Security Checklist abgehakt | ✅ | `docs/security/SECURITY_CHECKLIST_ENTERPRISE.md` |
| Enterprise Gap Register kommuniziert | ✅ | `docs/enterprise-readiness/ENTERPRISE_GAP_REGISTER.md` |
| SSO-Status korrekt kommuniziert (kein Verkauf als live) | ✅ | Sales-Briefing |
| MFA-Status korrekt kommuniziert (opt-in) | ✅ | Onboarding-Doku |
| Multi-Standort-Konfiguration getestet | ⏳ Ausstehend | Smoke Test |
| Vendor Pool + Rate Cards konfiguriert | ⏳ Ausstehend | Kundenseitig |
| Staff-Eskalationspfad für Enterprise definiert | ✅ | `docs/INCIDENT_RUNBOOK.md` |

---

## Offene Entscheidungen für Enterprise-Readiness

| ID | Entscheidung | Frist |
|---|---|---|
| ID-01 | MFA-Pflicht aktivieren? (Empfehlung: Ja, 30 Tage Frist) | Vor Enterprise Go-Live |
| W11-01 | Migration 117 (RLS auf ~60 Tabellen) terminieren | TBD |
| W11-02 | Redis für Rate-Limit-Store aktivieren (Multi-Instance) | TBD |

---

## Freigabe

| | |
|---|---|
| **Enterprise Go-Live Datum** | _______________ |
| **Kunde** | _______________ |
| **Tarif** | INDIVIDUELL — Tier: _______ |
| **Pilot-Vorlauf** | ⏳ Mindestens 4 Wochen Pilot |
| **Tech-Freigabe** | _______________ |
| **Owner-Freigabe** | _______________ |
| **AVV unterzeichnet** | ☐ Ja |
| **Enterprise Gap Register kommuniziert** | ☐ Ja |

---

**Status: NOCH NICHT BEREIT — Pilot muss zuerst**

---

*WAVE 15 — Phase 2 — 2026-05-27*
