# Scoring-Modell

> Nach jeder Welle bewertet Claude Code die Auswirkung auf beide Scores. Owner sieht numerischen Fortschritt.

---

## SaaS Professional Score (Ziel ≥ 9,5 / 10)

| Bereich | Gewicht | Ziel | Phase-1-Welle | Phase-2-Welle |
|---|---:|---:|---|---|
| Release-Hygiene | 15 % | 10 / 10 | `WAVE_01` | WAVE 01, 02 |
| Frontend Build / UX | 15 % | 9,5 / 10 | `WAVE_10` | WAVE 03, 14 |
| API / Teststabilität | 15 % | 9,5 / 10 | `WAVE_12` | WAVE 04 |
| Produktkern / Pilotflow | 15 % | 9,5 / 10 | `WAVE_04` | WAVE 07 |
| Security-Basics | 10 % | 9,5 / 10 | `WAVE_06` | WAVE 11 |
| Ops / Monitoring / Backup | 10 % | 9 / 10 | `WAVE_13` | WAVE 12 |
| Commercial / Plans | 10 % | 9,5 / 10 | `WAVE_02`, `WAVE_09` | WAVE 13 |
| Dokumentation / Runbooks | 10 % | 9,5 / 10 | — | WAVE 15 |

**Berechnung:** Gewichteter Durchschnitt. Beispiel:
```
0.15 × 10 + 0.15 × 9.5 + 0.15 × 9.5 + 0.15 × 9.5 + 0.10 × 9.5 + 0.10 × 9 + 0.10 × 9.5 + 0.10 × 9.5
= 1.50 + 1.425 + 1.425 + 1.425 + 0.95 + 0.90 + 0.95 + 0.95
= 9.525  →  GO
```

---

## Enterprise Premium Score (Ziel ≥ 9,0 / 10)

| Bereich | Gewicht | Ziel | Phase-1-Welle | Phase-2-Welle |
|---|---:|---:|---|---|
| Tenant-Isolation / RLS | 20 % | 9,5 / 10 | `WAVE_06` | WAVE 05 |
| Security Hardening | 20 % | 9 / 10 | `WAVE_06` | WAVE 11 |
| Identity / SSO / MFA | 15 % | 9 / 10 | `WAVE_06` | WAVE 09 |
| API / OpenAPI / Versioning | 10 % | 9 / 10 | — | WAVE 10 |
| Audit / Compliance Evidence | 10 % | 9 / 10 | `SPECIAL_enterprise_pack` | WAVE 15 |
| Ops / Backup / Incident | 10 % | 9 / 10 | `WAVE_13` | WAVE 12 |
| Role / Plan Governance | 10 % | 9 / 10 | `WAVE_03` | WAVE 06 |
| Legal / Manual Readiness | 5 % | 9 / 10 | `WAVE_14` | MANUAL_TASKS |

---

## Score-Reporting nach jeder Welle

Claude Code liefert nach jeder Phase-2-Welle:

```
## Score-Auswirkung WAVE XX

### Vor dieser Welle
SaaS Professional:   X.X / 10
Enterprise Premium:  Y.Y / 10

### Nach dieser Welle
SaaS Professional:   X.X / 10  (Δ +0.x in Bereich Z)
Enterprise Premium:  Y.Y / 10  (Δ +0.x in Bereich Z)

### Verbleibende Lücke zu GO-Schwelle
SaaS Professional:   0.x bis 9.5
Enterprise Premium:  0.x bis 9.0

### Welle(n) mit größtem verbleibendem Hebel
- ...
- ...
```

---

## Bewertungsregeln

**Wann ist ein Bereich 10/10?**
- Alle Aufgaben der zugehörigen Wellen abgeschlossen
- Tests grün
- Doku vollständig
- Beweis-Artefakte vorhanden (Test-Output, Restore-Drill-Protokoll, etc.)
- Keine bekannten Lücken

**Wann ist ein Bereich 9/10?**
- Wie 10/10, aber 1-2 nicht-kritische Lücken (dokumentiert im Gap Register)

**Wann ist ein Bereich 8/10?**
- Grundfunktion da, aber Doku oder Tests unvollständig

**Unter 8/10 = nicht launchbar.** Dann zurück zur Welle.

---

## Scoring-Disziplin

- **Keine Selbst-Aufrundung.** 9.4 ist nicht 9.5.
- **Keine "fast fertig" Scores.** Entweder Beweis vorhanden oder nicht.
- **Score sinkt, wenn neue Lücken entdeckt werden** — ehrlich nach unten korrigieren.
- **Owner kann Score überschreiben** — mit dokumentierter Begründung im Score-Protokoll.

---

## Score-Protokoll

`docs/releases/SCORE_HISTORY.md`:

```
Datum | Welle abgeschlossen | SaaS Score | Enterprise Score | Bemerkung
------|---------------------|------------|------------------|----------
YYYY-MM-DD | WAVE 00 | 6.2 | 5.0 | Baseline
YYYY-MM-DD | WAVE 01 | 7.5 | 6.0 | Release-Hygiene fertig
...
```

Wenn beide Scores ≥ Ziel-Schwelle UND alle Gates grün UND Burn-in ≥ 7 Tage → MARKTSTART GO.
