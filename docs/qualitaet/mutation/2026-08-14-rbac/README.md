# Mutation Testing — Zugriffskontrolle · Lauf vom 2026-08-14

> **Das ist der Prüfbericht, den es vorher nicht mehr gab.** Der zuvor zitierte
> Wert stand nur in einer Commit-Nachricht; sein Bericht war von einem kleinen
> Einzellauf überschrieben worden. Dieser Lauf ist vollständig, datiert abgelegt
> und nachrechenbar.

**Vollständiger Lauf**, kein inkrementeller: der Inkrementalstand wurde vorher
entfernt, das Protokoll bestätigt es (*„No incremental result file found, a full
mutation testing run will be performed"*). Dauer: 1 h 47 min.

---

## Was hier gemessen wurde — in einem Satz

Wir haben in die sechs Dateien, die über **Zugriff und Mandantengrenze**
entscheiden, **1292 künstliche Fehler** eingebaut und gezählt, wie viele davon
die Testsuite von allein bemerkt.

**1180 von 1292 wurden bemerkt — 91,33 %.**

Die 112 übrigen sind Stellen, an denen eine veränderte Codezeile *keinen* Test
rot gemacht hätte. Sie stehen einzeln in `ergebnis.json`, mit Datei, Zeile und
der Art der Veränderung.

---

## Die Zahlen

| Datei | Score | getötet | überlebt |
|---|---|---|---|
| `services/rbacService.js` | **95,87 %** | 580 | 25 |
| `utils/orgContext.js` | **93,94 %** | 31 | 2 |
| `services/enterpriseSurfaceAccessService.js` | **89,29 %** | 175 | 21 |
| `middleware/rbac.js` | **87,82 %** | 137 | 19 |
| `middleware/orgContext.js` | **86,96 %** | 159 | 24 |
| `utils/orgBoundary.js` | **82,20 %** | 97 | 21 |
| **Gesamt** | **91,33 %** | 1179 (+1 Timeout) | 112 |

Gate: **86 %**. Der Lauf endete mit *„Final mutation score of 91.33 is greater
than or equal to break threshold 86"* und Status 0.

---

## Wie sich das zum früher genannten Wert verhält

| | früher zitiert | dieser Lauf |
|---|---|---|
| Gesamt | 91,49 % | **91,33 %** |
| `rbacService.js` | 95,04 % | **95,87 %** |
| `middleware/rbac.js` | 87,82 % | 87,82 % |

Die alte Gesamtzahl war **nicht falsch, aber nicht belegbar** — und die
Einzelwerte stammten teils aus getrennten Einzelläufen, teils aus dem Aggregat.
Wer beide Reihen nebeneinander liest, hält sie für Widersprüche. **Ab jetzt gilt
nur noch eine Quelle: dieser Bericht.**

Der leichte Rückgang um 0,16 Punkte ist kein Qualitätsverlust, sondern normale
Streuung: Timeouts zählen als „getötet", und wie viele Mutanten in eine
Zeitüberschreitung laufen, hängt von der Maschinenlast ab (damals 5, jetzt 1).

---

## Was nicht im Repository liegt

Der Rohbericht ist **79 MB** pro Datei (`mutation.json` und `index.html`) — er
enthält den vollständigen Quelltext samt jeder einzelnen Mutation. Das gehört
nicht in die Versionsverwaltung; 160 MB blieben dort für immer.

Archiviert ist deshalb `ergebnis.json`: alle Scores und **alle 112 überlebenden
Mutanten** mit Datei, Zeile und Ersetzung — der Teil, den eine Prüfung braucht.

**Neu erzeugen** (rund zwei Stunden):

```bash
cd api && rm -rf .stryker-tmp reports/mutation/rbac/stryker-incremental.json
cd api && npx stryker run stryker.rbac.conf.json
```

Der erste Befehl ist nicht optional: `incremental: true` steht in der
Konfiguration, und ein alter Inkrementalstand ließe den Lauf gegen einen anderen
Testumfang gaten. Und **nie mit einer Pipe messen** — `… | tail` liefert den
Status von `tail`, nicht den des Laufs.

---

## Was diese Zahl nicht sagt

- Sie gilt für **sechs Dateien**, nicht für die Plattform. Gemessen wurde dort,
  wo ein stiller Logikfehler zu unbefugtem Zugriff führen würde.
- Sie sagt nichts über die Oberfläche, über Geld-Mathematik oder über
  Datenschutz-Pfade. Für diese Bereiche steht die Messung in
  [P11](../../../features/P11_DOKUMENTATION_ALS_SYSTEM.md) noch aus.
- **112 überlebende Mutanten sind keine Fehler im Produktivcode.** Sie sind
  Stellen ohne Test. Alle bisherigen Wellen haben null Produktionsfehler
  ergeben — der Code war richtig, die Tests waren lückenhaft.
