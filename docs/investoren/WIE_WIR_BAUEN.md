# Wie wir bauen

> **Stand: 2026-08-14** · Bestandsaufnahme, keine Verkaufsunterlage.
> Jede Zahl in diesem Dokument nennt den Befehl, mit dem man sie nachrechnet.
> Was nicht nachprüfbar war, steht als *nicht belegt* drin — nicht geglättet.
>
> **Intern**, bis der Owner über eine Veröffentlichung entscheidet (DOK-E3 in
> [P11](../features/P11_DOKUMENTATION_ALS_SYSTEM.md)).

---

## Die eine Sache, die uns unterscheidet

Die meisten Teams behaupten ihre Zusagen. Wir **erzwingen** sie — auf der
tiefstmöglichen Ebene, auf der sie noch gelten.

Das ist kein Slogan, sondern eine Rangfolge, nach der hier jede Entscheidung
fällt:

| Ebene | Wirkt | Kann umgangen werden von |
|---|---|---|
| **Datenbank-Bedingung** (`CHECK`, `EXCLUDE`, Trigger) | bei jedem Schreibvorgang | **niemandem** — auch nicht von `psql` um drei Uhr nachts |
| **Laufzeit-Guard** (`requirePermission`, Org-Grenze) | bei jeder Anfrage | einem Codepfad, der ihn vergisst |
| **Wächter-Test** | beim Bauen | einem Test, den niemand schreibt |

Ein Beispiel aus dieser Woche. Die Anforderung lautete: *ein Mensch kann nicht
gleichzeitig krank und im Urlaub sein.* Der naheliegende Weg wäre eine Prüfung im
Anwendungscode gewesen — sie hätte bei zwei gleichzeitigen Eingaben versagt, weil
beide an derselben Prüfung vorbeilaufen. Gebaut ist stattdessen eine
`EXCLUDE`-Bedingung über Datumsbereiche in der Datenbank. Sie hält auch dann,
wenn jemand in fünf Jahren einen neuen Importweg baut und nichts von der Regel
weiß.

Dasselbe Muster beim Zustandsprotokoll der Belegschaft: Es entsteht nicht durch
Aufrufe im Code, sondern durch **Trigger an den Quelltabellen**. Der Beleg dafür
ist ein Test, der ausschließlich rohes SQL schreibt — ganz ohne Anwendungscode —
und prüft, dass der Eintrag trotzdem entsteht.

*Nachrechnen:* `sql/migrations/177_abwesenheit_gehoert_zum_menschen.sql` ·
`sql/migrations/179_zustandsprotokoll_an_der_quelle.sql` ·
`api/test/integration/zustandsprotokoll.flow.test.js` (13 Prüfungen)

---

## Was das in Zahlen heißt

| Größe | Wert | Herkunft |
|---|---|---|
| Testfälle im Standardlauf | **8455** (8441 bestanden) | `cd api && node scripts/run-tests.js` |
| Testdateien | 385, davon 356 im Standardlauf | `find api/test -name "*.test.js"` |
| Tests gegen eine **echte** PostgreSQL | **250** | 13 im Standardlauf + 237 in der Integrationssuite |
| Oberflächen-Tests (Playwright) | 17 Dateien, 102 Fälle | `ls e2e/tests/*.spec.js` |
| API-Endpunkte | 938, davon ~780 in der Kundenfläche | 104 Staff, 31 Owner, 17 Support sind intern |
| Datenbanktabellen · Migrationen | 180 · 184 | `information_schema` · `ls sql/migrations` |
| Nutzerflächen | 89 | `frontend/public` + `legal/` + `trust/` |

**Drei Ehrlichkeiten zu dieser Tabelle**, die ein Prüfer sonst selbst findet:

1. **„8455 Tests" sagt nichts über Qualität.** Es ist eine Mengenangabe. Die
   Qualitätsaussage steht im nächsten Abschnitt — und sie ist unbequemer.
2. **Die 250 DB-Tests laufen im Standardlauf nicht mit.** Ohne Datenbank melden
   sie sich ab. Wer nur den Standardbefehl sieht, hält 13 für die ganze Zahl.
3. **8455 und 102 dürfen nicht addiert werden.** Die Oberflächen-Tests brauchen
   eine laufende Umgebung und sind ein getrennter Lauf.

---

## Der Unterschied zwischen „getestet" und „geprüft"

Testabdeckung beweist, dass eine Zeile **gelaufen** ist. Sie beweist nicht, dass
eine **falsche Fassung** dieser Zeile aufgefallen wäre. Für Zugriffskontrolle,
Geld und Nachweise ist das der ganze Unterschied.

Deshalb bauen wir in die kritischen Dateien absichtlich Fehler ein und messen,
wie viele davon die Testsuite von allein fängt (*Mutation Testing*).

- **1292 eingebaute Fehler** in sechs Dateien der Zugriffskontrolle
  (reproduzierbar: `npx stryker run stryker.rbac.conf.json --dryRunOnly`)
- **Gate bei 86 %** — sinkt der Wert darunter, schlägt der Lauf fehl
  (`api/stryker.rbac.conf.json:29`)
- **29 zusätzliche Testfälle** entstanden dabei, jeder davon fängt einen realen
  Fehler, den vorher niemand bemerkt hätte
- **Null Produktionsfehler gefunden** — der Code war richtig, die *Tests* waren
  lückenhaft

**Der Beleg dazu, datiert und archiviert:** Der vollständige Lauf vom
2026-08-14 ergab **91,33 %** über alle sechs Dateien — 1180 von 1292 eingebauten
Fehlern wurden von der Testsuite bemerkt. Der Bericht liegt unter
[`docs/qualitaet/mutation/2026-08-14-rbac/`](../qualitaet/mutation/2026-08-14-rbac/README.md),
inklusive aller 112 Stellen, an denen noch ein Test fehlt. Nachrechenbar in rund
zwei Stunden mit dem dort genannten Befehl.

---

## Wir finden unsere eigenen Fehler — und zwar bevor Kunden sie finden

Das ist der Teil, den ein Prüfer wirklich bewertet. Eine Auswahl aus **zwei
Arbeitstagen**, jeder Fund von einem Mechanismus aufgedeckt, nicht von Glück:

| Gefunden | Was es war | Wodurch |
|---|---|---|
| Notdienst-Antwortpfad lieferte `500` | Zwei Spalten, die es nie gab | Schema-Abgleich · **behoben** (Mig 180) |
| DSGVO-Kontolöschung wirkungslos | Sechs Schema-Fehler, jede Löschung rollte still zurück | derselbe Abgleich · **behoben** |
| 13 Endpunkt-Familien undokumentiert | u. a. der gesamte operative Rechnungslauf | Doku-Wächter · **nachgetragen** |
| Zwei Migrationsnummern doppelt vergeben | seit Monaten, in keiner Liste | Doku-Wächter · **nachgetragen** |
| Abmelden im Kontrollzentrum meldet nicht ab | Aufruf ins Leere, Fehler verschluckt | Rollenanalyse · **offen** |

Die letzte Zeile steht bewusst hier. **Ein Dokument, das nur Erfolge zeigt, ist
kein Nachweis von Sorgfalt, sondern ein Verkaufsprospekt.**

Und der ehrlichste Fund kam von einem bestehenden Test gegen die eigene Arbeit:
Beim Schreiben dieser Dokumentation meldete ein Wächter zwei frisch erstellte
Dokumente als **verwaist** — Dateien, auf die nichts verwies. Genau der Zustand,
den dieses Dokument beschreibt: Doku, die niemand findet, ist keine.

---

## Die Wächter

Ein Wächter ist kein Test für eine Funktion, sondern gegen eine **Fehlerklasse**.
Jeder von ihnen existiert, weil derselbe Fehler mindestens einmal echt passiert
ist.

| Wächter | Verhindert | Wäre sonst passiert |
|---|---|---|
| `sqlSchemaWaechter` | SQL gegen Spalten, die es nicht gibt | die zwei Funde oben, monatelang unbemerkt |
| `dokuWaechter` | Doku und Code laufen auseinander | Karteileichen, die den Überblick kosten |
| `kalendertagDE` | Datumsfehler durch UTC in einem DACH-Produkt | Stundenzettel in der falschen Abrechnungswoche |
| `frontendVerdrahtung` | tote Knöpfe, fehlendes CSRF-Token | Nutzer klickt „Speichern", nichts passiert, keine Meldung |
| `flaechenZuordnung` | Funktionen in der falschen Oberfläche | Kundendaten im Team-Bereich |

Zwei Eigenschaften unterscheiden sie von gewöhnlichen Tests:

**Selbstprobe.** Der Schema-Wächter läuft bei *jedem* Lauf über einen Quelltext,
der die historischen Fehler nachbildet — samt einer auskommentierten Zeile, die
er **nicht** melden darf. Findet er sie nicht, wird er selbst rot. Ein Wächter,
der nur behauptet zu fangen, ist eine Beruhigungspille.

**Mindestschwellen.** Sinkt die Zahl geprüfter Dateien oder Spaltenbezüge unter
die Grundlinie, wird er rot — auch wenn er nichts gefunden hat. Das fängt den
Fall, der in diesem Repo dreimal auftrat: ein Pfad zeigt auf ein leeres
Verzeichnis, die Prüfung findet nichts, alles ist lautlos grün.

*Nachrechnen:* `api/test/sqlSchemaWaechter.test.js` prüft über **5000
Spaltenbezüge** aus **1200+ SQL-Anweisungen** gegen das echte Schema.

---

## Was noch nicht steht

Ohne diesen Abschnitt wäre der Rest weniger wert.

- **Zwei offene Blocker vor dem ersten Mitarbeiter:** Das Abmelden im
  Kontrollzentrum wirkt nicht, und der Zwei-Faktor-Schalter würde den Eigentümer
  aus seinen eigenen Freigaben aussperren. Beides Tagesarbeit, beides
  ungefährlich solange eine Person arbeitet — und genau ab der zweiten nicht mehr.
- **Bus-Faktor 1.** 381 von 381 Änderungen stammen von einer Person. Das ist die
  größte Abhängigkeit des Projekts, größer als jedes technische Risiko.
- **Fünf fertige Endpunkt-Familien ohne Oberfläche**, darunter der operative
  Rechnungslauf. Ob bewusst vorgebaut oder liegengeblieben, entscheidet der Owner
  — der Code sagt nur, dass keine Oberfläche darauf zugreift.
- **Zeilenschutz in der Datenbank auf 9 Tabellen**, bei dreien erzwungen. Die
  übrigen rund 170 verlassen sich auf die Anwendungsschicht. Ob der Schutz in der
  Produktionsdatenbank wirklich greift, ist **nicht verifiziert**.
- **Die Messung deckt sechs Dateien ab**, nicht die Plattform: Zugriffskontrolle
  und Mandantengrenze. Geld-Mathematik, Datenschutz-Pfade und Oberfläche sind
  noch nicht mutationsgeprüft.

---

## Wie man das prüft, ohne uns zu glauben

```bash
cd api && node scripts/run-tests.js        # ohne Pipe — sonst maskiert die Shell den Status
docker exec tempconnect_api sh -c "cd /app && node --test --test-force-exit test/integration/"
cd api && npx stryker run stryker.rbac.conf.json
```

Der Hinweis zur Pipe steht hier nicht aus Pedanterie: `… | tail` liefert den
Status von `tail`, nicht den der Testsuite. Ein Prüfbericht, der so entstanden
ist, zeigt grün bei roter Suite. Uns ist das in dieser Woche selbst passiert.
