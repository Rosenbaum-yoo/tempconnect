# WAVE_12 — QA, Tests und Release Gates

> **Phase:** Infra. **Prio:** P1. **Voraussetzung:** WAVE_04+ (es muss etwas zu testen geben).

---

## Ziel

Ein frischer Clone wird reproduzierbar grün ODER alle verbliebenen Fehler sind klar klassifiziert (nicht P0/P1).

---

## Pflichtchecks

Vorhandene Skripte nutzen, nicht neu erfinden. Zielabdeckung:

- `install`
- `lint`
- `typecheck`
- Unit Tests
- Service Tests
- Route Tests
- Integration Tests
- Migration Tests
- Frontend Smoke Tests
- Security/Permission Tests
- Release Artifact Verification (aus WAVE_01)
- Docker Build
- Docker Compose Smoke
- Basic Performance Sanity

---

## Testbereiche (Mindestabdeckung)

1. **Auth / Sessions / MFA / Staff / Owner** — siehe WAVE_06
2. **Tenant Isolation** — Cross-Org-Negativtests pro Domäne
3. **Plans / Features / Add-ons** — siehe WAVE_02
4. **Requisitions** — Statusübergänge, Mengenlogik (WAVE_04A)
5. **Vendor Pool** — Scorecard-Berechnung, Tier-Wechsel (WAVE_04C)
6. **Capacity Search** — Match-Logik, Empty States (WAVE_04B)
7. **Assignments** — Statusmaschine, Storno-Wirkung (WAVE_04D)
8. **Timesheets** — Statusübergänge, Customer Bundle (WAVE_04E)
9. **Rate Cards** — Gültigkeitsprüfung, Buchungs-Voraussetzung (WAVE_04F)
10. **Spend Analytics** — KPI-Konsistenz mit Dashboard (WAVE_04E + WAVE_05)
11. **Compliance Documents** — Warnungslogik (WAVE_04G)
12. **Contracts / Rahmenvertrag** — Versionierung, Audit (WAVE_04H)
13. **Billing / Subscription** — Upgrade/Downgrade/Cancel (WAVE_09)
14. **Referral / Bounty / Credits** — Caps, Audit (WAVE_08)
15. **Executive Dashboard KPIs** — Drilldown-Konsistenz (WAVE_05)
16. **Empty States** — alle Kernseiten ohne 500 bei leerer DB
17. **Critical Staffing Pressure** — Notdienst-/Pulse-KPI
18. **Cancel / Upgrade / Downgrade** — End-to-End

---

## Triage-Tests (kritisch)

**Cross-Org-Negativtests** für jede sensible Domäne:
```
Org A (User X) → versucht Org-B-Daten zu lesen → NOT_FOUND
Org A (User X) → versucht Org-B-Daten zu schreiben → PERMISSION_DENIED
```

**Plan-Gate-Tests:**
```
Plan DEMO → versucht PRO-Feature → PLAN_REQUIRED
Plan BASIS → versucht Add-on ohne Aktivierung → FEATURE_NOT_ENABLED
```

**Rolle-Gate-Tests:**
```
Worker → versucht Admin-Route → PERMISSION_DENIED
Vendor → versucht Customer-Route → PERMISSION_DENIED
```

---

## Akzeptanzkriterien

- [ ] Keine bekannten P0/P1-Testfehler
- [ ] Fehlercodes sind stabil (siehe WAVE_03 Liste)
- [ ] Tests prüfen nicht nur Happy Path
- [ ] CI ist auf frischem Clone reproduzierbar
- [ ] Cross-Org-Negativtests für alle sensiblen Domänen
- [ ] Plan-Gate-Tests für alle Plans
- [ ] Release-Artefakt-Verification grün (WAVE_01)

---

## Stop-Regeln

- Tests werden grün durch Mocking statt durch Fix → STOP, ehrlich fixen
- Test-Coverage geht zurück → Begründung dokumentieren oder ablehnen
- Open Handles in Test-Run → fixen vor Merge

---

## Betroffene Dateien

- `package.json` (npm scripts)
- `*.test.js`, `*.spec.js`
- `.github/workflows/ci.yml`
- Test-Konfigurationen (jest.config, vitest.config, playwright.config etc.)
