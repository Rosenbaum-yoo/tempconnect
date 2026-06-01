# TempConnect — Marktstart Go-Live Entscheidung

> Formales Go/No-Go für den offiziellen Marktstart (breite Öffentlichkeit).
> WAVE 15 — Phase 2 — 2026-05-27

---

## Voraussetzungen

Marktstart setzt voraus:

1. ✅ Pilot Go-Live (erste Pilotkunden)
2. ✅ Enterprise Go-Live (erster INDIVIDUELL-Kunde)
3. ✅ WAVE 16 Burn-in (≥ 7 Tage stabiler Preprod-Betrieb)

---

## Marktstart-Kriterien

| Kriterium | Status | Beleg |
|---|---|---|
| ≥ 7 Tage stabiler Preprod-Betrieb | ⏳ WAVE 16 | Burn-in ausstehend |
| Keine P0/P1-Fehler in Preprod | ⏳ WAVE 16 | Fehlerlogs |
| Keine wiederkehrenden 500er | ⏳ WAVE 16 | Monitoring |
| Keine Auth-/Tenant-/Permission-Fehler | ⏳ WAVE 16 | Audit-Log |
| Backup/Restore nachgewiesen | ⏳ Restore-Drill | Drill-Log |
| Last-/Abuse-Minicheck bestanden | ⏳ WAVE 16 | Test-Report |
| Security Smoke Test bestanden | ⏳ WAVE 16 | Checklist |
| Pricing-Seite korrekt | ✅ | Katalog-Verifikation |
| Legal (AGB, Datenschutz, Impressum) | ✅ | `frontend/public/legal/` |
| Support-Prozess definiert | ✅ | Runbooks |
| Monitoring aktiv | ✅ | Prometheus + Sentry |
| Pilot-Feedback verarbeitet | ⏳ | Post-Pilot-Review |

---

## Marktstart-Scope

**Enthaltene Pläne:** DEMO, BASIS, PLUS, PRO  
**INDIVIDUELL:** Nur auf direkte Anfrage (enterprise_anfrage.html)  
**SSO:** Nicht im Marktstart enthalten (Soft-Lock, Option B)  
**MFA:** Verfügbar, opt-in

---

## Release Notes Verweis

`docs/releases/RELEASE_NOTES_MARKET_START.md`

---

## Freigabe

| | |
|---|---|
| **Marktstart Datum** | _______________ |
| **Release-Version** | _______________ |
| **Git-Commit** | _______________ |
| **Tech-Freigabe** | _______________ |
| **Owner-Freigabe** | _______________ |
| **WAVE 16 Burn-in bestätigt** | ☐ Ja, Datum: ___________ |
| **Restore-Drill bestätigt** | ☐ Ja, Datum: ___________ |
| **Security Smoke Test** | ☐ Bestanden |

---

**Status: NOCH NICHT BEREIT — WAVE 16 Burn-in erforderlich**

---

*WAVE 15 — Phase 2 — 2026-05-27*
