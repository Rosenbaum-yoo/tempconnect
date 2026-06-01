# Phase 2 — Release-Operativ-Schicht

> **Zweck:** Diese Schicht setzt NACH den 16 Phase-1-Wellen an. Sie übersetzt fachliche Reife in **echte Releasefähigkeit**: Build, Test, Audit, Burn-in, GO/NO-GO-Entscheidung.

---

## 1. Verhältnis zu Phase 1

| Phase 1 (`finalization/WAVE_*`) | Phase 2 (`finalization/phase2_release/`) |
|---|---|
| Fachlich-architektonisch | Release-operativ |
| "Ist das richtig gebaut?" | "Ist das auslieferbar?" |
| Triage, Rollen, Core Flow | Build, Audit, Burn-in, Go-Live |
| Doku in `docs/` | Doku in `docs/releases/` und `docs/enterprise-readiness/` |
| Kein verbindlicher Branch | Branch `release/enterprise-premium-market-ready` |
| Output: korrektes Produkt | Output: signiertes Release-Artefakt |

**Phase 2 startet erst, wenn Phase 1 mindestens P0/P1-grün ist.**

---

## 2. Inhalt dieser Schicht

| Datei | Zweck |
|---|---|
| `WAVES.md` | Alle 16 Release-Wellen kompakt mit Abnahmebefehlen |
| `GATES.md` | Die 6 harten Marktstart-Gates A–F |
| `SCORING.md` | SaaS Professional Score + Enterprise Premium Score |
| `MANUAL_TASKS.md` | Manuelle Aufgaben (Recht, Infra, E-Mail, Commercial, Security, Marktstart) |
| `MASTERPROMPT.md` | Finaler Claude-Code-Masterprompt für die Release-Phase |

---

## 3. Mapping Phase 1 ↔ Phase 2

| Phase 2 Welle | Knüpft an Phase 1 Welle |
|---|---|
| WAVE 00 Freeze | erweitert `WAVE_00_baseline` (Branch + Wahrheitspunkt) |
| WAVE 01 Release-Hygiene | erweitert `WAVE_01_release_hygiene` (Release-Verifier konkret) |
| WAVE 02 Secrets/Env | erweitert `WAVE_01` + Production-Safety |
| WAVE 03 Frontend Build | erweitert `WAVE_10_premium_ux` (Build statt Polish) |
| WAVE 04 API/Tests/Audit | erweitert `WAVE_12_qa_tests` (npm audit, offene Handles) |
| WAVE 05 Tenant/RLS | erweitert `WAVE_06_security` (RLS deny-by-default konkret) |
| WAVE 06 Rollen/Plan-Gates | erweitert `WAVE_03_roles_visibility` + `WAVE_02_commercial` |
| WAVE 07 Pilot-Core | erweitert `WAVE_04_core_business` (Pilot-Seed konkret) |
| WAVE 08 Dashboard KPIs | erweitert `WAVE_05_kpi_dashboard` (Tests + Drilldown-Pflicht) |
| WAVE 09 SSO/MFA | erweitert `WAVE_06_security` (Entscheidung A/B verbindlich) |
| **WAVE 10 OpenAPI** | **NEU** — war in Phase 1 nicht verankert |
| WAVE 11 Security Hardening | erweitert `WAVE_06_security` (Headers, CORS, Rate Limits) |
| WAVE 12 Ops/Backup | erweitert `WAVE_13_observability` (Restore Drill verbindlich) |
| WAVE 13 Commercial | erweitert `WAVE_02_commercial` + `WAVE_09_billing` |
| WAVE 14 Premium UX | erweitert `WAVE_10_premium_ux` (Marktstart-Sicht) |
| WAVE 15 Evidence Pack | erweitert `SPECIAL_enterprise_pack` (`docs/enterprise-readiness/`) |
| **WAVE 16 Burn-in** | **NEU** — 7 Tage Preprod, fehlte in Phase 1 |

---

## 4. Verbindlicher Arbeitsbranch

Phase 2 läuft auf:
```
release/enterprise-premium-market-ready
```

**Regel:** Kein Cherry-Picking aus losen ZIPs. Kein paralleler Arbeitsstand. Alle Phase-2-Commits gehen auf diesen Branch.

---

## 5. Zielwerte (verbindlich)

```
SaaS Professional Readiness   ≥ 9,5 / 10
Enterprise Premium Readiness  ≥ 9,0 / 10
Pilot Readiness               ≥ 9,5 / 10
Release-Hygiene              =  10 / 10
Marktstart                   =  GO (kein Conditional GO)
```

Details in `SCORING.md`.

---

## 6. Definition vollständiger Releasefähigkeit

TempConnect gilt nur dann als vollständig releasefähig, wenn ALLE Punkte erfüllt sind:

1. Release-Artefakt enthält nur notwendige Source-/Config-Template-/Build-/Migrations-/Doku-/Betriebsdateien
2. Keine echten Secrets im Artefakt
3. Keine lokalen Entwicklungsartefakte (`.env`, `.git`, `node_modules`, `.claude`, `.agents`, `.vercel`, `_zip_analysis`, Coverage)
4. API-Build, Frontend-Build, Tests, Lint, Security-Audit, Release-Verifier laufen grün
5. Pilot-Core-Flow vollständig klickbar und testbar
6. Tenant-Isolation technisch bewiesen (Cross-Tenant-Tests grün)
7. Enterprise-Funktionen entweder produktionsreif ODER sauber soft-locked
8. Operations, Monitoring, Backup, Restore, Runbooks vorhanden
9. Rechtliche und manuelle Marktstartpunkte separat erledigt (siehe `MANUAL_TASKS.md`)
10. Burn-in mindestens 7 Tage stabil

---

## 7. Wie Claude Code damit arbeitet

**Pro Session in der Release-Phase:**

1. Liest `CLAUDE.md` (im Repo-Root, Phase 1)
2. Liest `finalization/00_RULES.md` (Phase 1)
3. Liest `finalization/phase2_release/WAVES.md` UND die spezifische Welle, die gerade dran ist
4. Bei Gate-Checks: `GATES.md`
5. Bei manuellen Themen: `MANUAL_TASKS.md`
6. Nach jeder Welle: Score-Auswirkung in `SCORING.md`-Logik bewerten

**Niemals:** alle Dateien gleichzeitig öffnen — selbe Effizienz-Regel wie Phase 1.

---

## 8. Was Claude Code NICHT kann

Klar abgegrenzt in `MANUAL_TASKS.md`:
- Domain kaufen, DNS einrichten
- Hosting-Konten anlegen
- AGB / Datenschutz juristisch finalisieren
- Tatsächliche Secret-Rotation durchführen (kann nur Anleitung geben)
- Externen Pentest durchführen
- Pilotvertrag verhandeln

Claude Code liefert für all das **Vorlagen + Anleitung**. Die Durchführung machst du.
