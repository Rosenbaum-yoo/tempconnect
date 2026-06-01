# TempConnect Finalisierungswelle — Master-Index

> Konsolidiert aus den vier Quelldokumenten (Masterprompt, V4 Promptwelle, Weltklasse, Pilot Enterprise Readiness) in eine modulare Struktur, mit der Claude Code kontrolliert pro Welle arbeiten kann.

---

## 1. Wie du diese Struktur nutzt

**Pro Arbeitssession:**
1. Claude Code liest immer zuerst `CLAUDE.md` (im Projekt-Root) für Grundregeln.
2. Dann liest Claude Code `finalization/00_RULES.md` für das aktuelle Regelwerk dieser Welle.
3. Dann öffnet Claude Code **genau eine** Welle-Datei (`WAVE_XX_*.md`) und arbeitet diese ab.
4. Bei Triage-Unsicherheit konsultiert Claude Code `SPECIAL_bugboard_triage.md`.
5. Bei Datei-/Routen-Fragen konsultiert Claude Code `SPECIAL_file_inventory.md`.
6. Am Ende jeder Welle: Abschlussbericht nach Format in `99_GOLIVE_GATE.md`.

**Niemals:** alle Wellen gleichzeitig öffnen. Token-Budget und Fokus leiden.

---

## 2. Abarbeitungsreihenfolge (verbindlich)

| Reihenfolge | Datei | Phase | Status |
|---:|---|---|---|
| 0 | `WAVE_00_baseline.md` | Foundation: Repo-Audit, Decision Board | offen |
| 1 | `WAVE_01_release_hygiene.md` | Foundation: Secrets, Release-Artefakt | offen |
| 2 | `WAVE_02_commercial.md` | Foundation: Commercial Source of Truth | offen |
| 3 | `WAVE_03_roles_visibility.md` | Foundation: Rollen-/Sichtbarkeitsmatrix | offen |
| 4 | `WAVE_04_core_business.md` | Core: Kernfachlichkeit (Requisitions → Spend) | offen |
| 5 | `WAVE_05_kpi_dashboard.md` | Core: Executive Dashboard + KPI-Wahrheit | offen |
| 6 | `WAVE_06_security.md` | Enterprise: Auth, Tenant, API Keys, SSO | offen |
| 7 | `WAVE_07_admin_centers.md` | Enterprise: Staff / Owner / Admin / OCC | offen |
| 8 | `WAVE_08_bonus_credits.md` | Commercial: Referral / Bounty / Credits | offen |
| 9 | `WAVE_09_billing.md` | Commercial: Subscription / Custom / Enterprise Requests | offen |
| 10 | `WAVE_10_premium_ux.md` | Polish: UI / Empty States / Copy / A11y | offen |
| 11 | `WAVE_11_database.md` | Infra: DB / Migrationen / Datenqualität | offen |
| 12 | `WAVE_12_qa_tests.md` | Infra: QA / Tests / Release Gates | offen |
| 13 | `WAVE_13_observability.md` | Infra: Logging / Monitoring / Healthchecks | offen |
| 14 | `WAVE_14_legal_dataprotection.md` | Enterprise: Datenschutz / AVV / TOMs / SLA | offen |
| 15 | `WAVE_15_demo_onboarding.md` | Polish: Demo-Daten / Onboarding / Sales | offen |
| Final | `99_GOLIVE_GATE.md` | Go-Live: Gesamt-Gate + Definition of Done | offen |

**Spezial-Dokumente (jederzeit referenzierbar):**

| Datei | Zweck |
|---|---|
| `00_RULES.md` | Arbeitsregeln, Triage, Output-Format, Stop-Regeln |
| `01_PRIORITIES.md` | P0/P1/P2/P3-Definitionen |
| `SPECIAL_bugboard_triage.md` | 31-Punkte-Triage: Bug vs. Sichtbarkeit vs. Ausbau |
| `SPECIAL_file_inventory.md` | Aktive HTML-Dateien, API-Routen, Middleware, Services |
| `SPECIAL_enterprise_pack.md` | Enterprise Readiness Pack (Evidenzpaket) |

---

## 3. Dependency-Gates

Wellen können nicht beliebig parallel laufen. Es gibt harte Abhängigkeiten:

```
Gate 1: WAVE_00..03 (Foundation) MUSS abgeschlossen sein, bevor WAVE_04+ startet.
Gate 2: WAVE_06 (Security/Auth) MUSS abgeschlossen sein, bevor Einsatzportal/Worker-Flows in WAVE_04 finalisiert werden.
Gate 3: WAVE_04 Assignments MUSS stehen, bevor Timesheets finalisiert werden.
Gate 4: WAVE_04 Timesheets MUSS stehen, bevor Kundenfreigabe/Customer Bundle finalisiert werden.
Gate 5: WAVE_04 vollständig MUSS stehen, bevor WAVE_05 KPI-Wahrheit Sinn ergibt.
Gate 6: WAVE_14 (Public Profiles) MUSS abgeschlossen sein, bevor Public Launch.
Gate 7: WAVE_06 SSO MUSS produktiv ODER ehrlich Coming Soon sein, bevor Enterprise Rollout.
```

---

## 4. Kernprodukt-Fluss (verbindlich)

Alles, was diesen Fluss blockiert, hat Vorrang vor UI-Polish:

```
Bedarf / Nachfrage (Requisition)
  → Angebot / Deal / Capacity Matching
    → Einsatz / Assignment
      → Worker-Zuweisung
        → Worker-Stundenzettel (Timesheet)
          → interne Prüfung
            → Kundenfreigabe
              → Abrechnungsvorbereitung
                → Spend / Reporting / Executive Dashboard
```

---

## 5. Quellenverweis (für tieferes Detail)

Diese konsolidierte Struktur ist die Arbeitsbasis. Originaldokumente bleiben als Referenz erhalten:

- `docs/sources/TempConnect_Claude_Code_Finalisierungswelle_Masterprompt.md` (1157 Zeilen, 23 Abschnitte)
- `docs/sources/TempConnect_Finalisierungskonzept_Promptwelle_V4.md` (3245 Zeilen, 26 Bereiche)
- `docs/sources/TempConnect_Finalisierungswelle_Weltklasse.md` (1257 Zeilen, 15 Wellen)
- `docs/sources/TempConnect_Prompt_Welle_Pilot_Enterprise_Readiness_2026-05-23.md` (2750 Zeilen, 28 Prompts)

Bei inhaltlichen Konflikten zwischen Quelle und konsolidierter Datei: **konsolidierte Datei gilt**. Quellen sind Referenz, nicht Arbeitsdokument.

---

## 6. Selbstaktualisierung dieser Struktur

Wenn Claude Code während der Arbeit feststellt, dass eine Welle eine Lücke hat oder neue Erkenntnisse für andere Wellen relevant sind:

1. Update-Vorschlag formulieren (max. 3 Sätze)
2. Owner fragen: "Soll ich folgenden Eintrag in WAVE_XX ergänzen / nach CLAUDE.md übernehmen?"
3. Nur nach expliziter Bestätigung schreiben
4. Bei Ablehnung verwerfen, nicht zweimal vorschlagen

Siehe Self-Update-Mechanik in `CLAUDE.md` Abschnitt 8.
