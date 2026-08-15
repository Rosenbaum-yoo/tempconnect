# Mutation Testing — Zugriffskontrolle · Lauf vom 2026-08-15 (nach den Wellen M1–M5)

> Der Gegenbeleg zum [Lauf vom 2026-08-14](../2026-08-14-rbac/README.md): dieselben
> sechs Dateien, dieselben 1292 Mutanten, **ein** Lauf — gemessen, nachdem die
> Aufräum-Wellen M1–M5 ihre 39 Testfälle geliefert haben.
> Dauer: **2 h 40 min 34 s**. Auszug: [`ergebnis.json`](ergebnis.json).

---

## Die Zahl

| | 2026-08-14 | **2026-08-15** |
|---|---|---|
| Mutanten | 1292 | 1292 |
| getötet | 1179 (+1 Zeitüberschreitung) | **1219 (+1)** |
| überlebt | 112 | **72** |
| **Score** | 91,33 % | **94,43 %** |

Je Datei:

| Datei | 2026-08-14 | **2026-08-15** | überlebt |
|---|---|---|---|
| `services/rbacService.js` | 95,87 % | **99,01 %** | 6 |
| `utils/orgContext.js` | 93,94 % | 93,94 % | 2 |
| `services/enterpriseSurfaceAccessService.js` | 89,29 % | **93,88 %** | 12 |
| `middleware/orgContext.js` | 86,96 % | **90,22 %** | 18 |
| `middleware/rbac.js` | 87,82 % | **88,46 %** | 18 |
| `utils/orgBoundary.js` | 82,20 % | **86,44 %** | 16 |

---

## Was diese Zahl beweist — und was nicht

**Sie beweist: alle 39 A-Fälle sind tot.** Maschinell gegengeprüft gegen
[`triage.json`](../2026-08-14-rbac/triage.json): *null* A-Fälle leben wieder,
*null* Überlebende, die die Einstufung nicht kennt. Die 72 Übriggebliebenen sind
ausnahmslos Fälle der Kategorien B und C — Anzeigetexte, Protokollmeldungen und
gleichwertige Mutanten, die man gar nicht töten kann.

**Sie beweist nicht, dass 94,43 % „besser" sind als 91,33 %.** Der Prozentwert
ist hier das Nebenprodukt, nicht das Ziel. Das Ziel war *null A-Fälle*, und
genau deshalb steht der Wert nicht in einem Gate: der CI-Job wird rot, wenn ein
A-Fall wieder überlebt, nicht wenn eine Zahl sinkt.

---

## Drei Mutanten leben wieder — mit Absicht

Die Summe der fünf Einzel-Wellenläufe ergab 69 Überlebende, dieser Lauf zählt 72.
Die drei Rückkehrer sind:

| Stelle | Fall | was er verändert |
|---|---|---|
| `rbacService.js:300` | nr 78 (B) | die `message` des `LAST_OWNER`-Fehlers |
| `orgBoundary.js:116` | nr 106 (B) | der Text „Standort gehoert nicht zu Ihrer Organisation" |
| `orgBoundary.js:131` | nr 109 (B) | der Text „Abteilung gehoert nicht zu Ihrer Organisation" |

Alle drei sind **Kategorie B: bewusst ohne Test.** Die Wellen-Tests hatten sie
zunächst als *Nebenwirkung* erschlagen, weil sie mit `assert.rejects(…, /TEXT/)`
gegen den Wortlaut prüften — genau den Wortlaut, den `triage.json` als „nicht
tragend, kein Verbraucher vergleicht ihn" einstuft. Ein Test, der ihn festnagelt,
widerspricht der eigenen Einstufung und wird bei reiner Textpflege rot.

Nach der Umstellung auf `err.code` und `err.status` leben sie wieder. **Das ist
kein Rückschritt, sondern die Einstufung, die sich durchsetzt** — und es kostet
0,23 Prozentpunkte, die niemandem fehlen.

---

## Neu erzeugen

```bash
cd api && node scripts/mutation-welle.js --alle
cd api && node scripts/mutation-archivieren.js --datum <YYYY-MM-DD> --name <name>
```

**Nicht** `npx stryker run stryker.rbac.conf.json` von Hand: diese Konfiguration
schreibt nach `reports/mutation/rbac/` — dort liegt der Rohbericht des Laufs vom
2026-08-14. Genau so ist am 2026-08-14 schon einmal ein Beleg verloren gegangen.
`mutation-welle.js` leitet die Konfiguration ab und schreibt daneben.

Und **nie mit einer Pipe messen**: `… | tail` liefert den Status von `tail`.
