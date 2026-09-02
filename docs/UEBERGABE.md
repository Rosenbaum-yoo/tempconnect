# Übergabe — was eine neue Sitzung wissen muss

> **Diese Datei wird geprüft, nicht gepflegt.** `api/test/uebergabe.test.js` wird rot,
> sobald in einem Arbeitsplan eine offene Owner-Entscheidung auftaucht, die hier fehlt.
> Eine Übergabe, die man vergessen kann, ist keine.

**Stand: 2026-08-29** · Arbeitslinie `claude/brave-sanderson-9e9148`
(die Release-Linie `release/enterprise-premium-market-ready` ist am 2026-08-27
hierher zusammengeführt — `297554c`, 13 Commits, sechs Konflikte).

---

## In 30 Sekunden

TempConnect ist eine B2B-Plattform für Zeitarbeit (Vermittlung zwischen
Zeitarbeitsfirmen und Unternehmen). Reifes Repo, **Finalisierungsphase** — es wird
gehärtet, nicht neu gebaut. Der Owner ist kein Entwickler; Arbeit läuft in
Abschnitten, die ich in Spuren mit **Wellen und Gates** schneide.

**Arbeitsrhythmus:** Owner sagt „weiter mit X" → ich liefere eine Welle → Output-Block
→ Owner sagt „ja committen und weiter". **Commit sofort nach grüner Suite, ohne Nachfrage** (Owner 2026-08-13). Nur der **Push** wartet auf eine ausdrückliche Zusage.

> **Das Team ist eine Person.** Es gibt keine zweite Staff-Rolle — der Owner *ist*
> das Staff, und dieser Agent faktisch auch. Das ist keine Randnotiz, sondern eine
> **Bauvorgabe**: kein Vier-Augen-Prinzip, keine Freigabe durch eine zweite Person,
> kein „an Kollegen zuweisen" — solche Wege wären dauerhaft blockiert.
> Missbrauchsschutz entsteht durch **Struktur**, nicht durch Kontrolle, und das
> eigentliche Risiko ist das **Versehen**, nicht der Vorsatz.
> Vollständig in [`CLAUDE.md`](../CLAUDE.md), Abschnitt *„Das Team ist eine Person"*.

---

## Wo wir gerade stehen *(2026-08-29)*

| Spur | Gegenstand | Stand |
|---|---|---|
| **I** | Audit-Trennung, Fristen, Support-Weg | gebaut; **I3 Stufe 1** (E-Mail im Arbeiter-Weg) gebaut, Stufen 2–4 offen |
| **J** | Live-Belegschaft ↔ Marktplatz, E-Rechnung | gebaut und zusammengeführt (J1–J10, ZUGFeRD/PDF-A-3u, Schematron-Gate) |
| **K0** | Vorlauf: Merge, Gegenprüfung, Feed-Fehler | ✅ durch — Gate grün, Feed-Fehler (`e845c2d`) bestätigt behoben |
| **K4** | Der Feed fällt nie auf leer zurück | ✅ **gebaut** `eb46707` (Mig 204, `feedKopieService`, 18 Proben, 4 Rückmutationen) |
| **K1** | Rabatt sichtbar + Eingriffspunkt | ✅ **gebaut** — Mig 206, drei Dienste, Staff-CC-Modul `rabatt-faelle`, 75 Proben, **14 Rückmutationen** |
| **K2** | Werbe-Cashback (100 %, nächste Rechnung frei) | ✅ **vollständig gebaut** — Mig 208 + 209, `werbepraemieService`, 26 Proben, **16 Rückmutationen** |
| **K3** | Monatsplanung | **✅ ABGESCHLOSSEN** — zwei Achsen (Einsätze / Mitarbeiter), Konfliktvorschau vor dem Schreiben, in der Navigation, gehärtet (Indizes, Zeitzone, Mutation Testing) |
| **L** | Tragfähigkeit / Hochverfügbarkeit | dokumentiert, **nicht gebaut** (eigener Abschnitt, Owner-Vorgabe) |
| **M** | Marktplatz-Flow Ende zu Ende (19 Schritte) | **gemessen und geplant** (2026-09-01), noch nicht gebaut — zwölf Wellen M0–M11 |

> **Der wichtigste Befund der M-Messung, weil er alles andere betrifft:**
> **Die Marktplatz-Automatik läuft nicht.** Der Mechanismus ist vollständig gebaut
> (Mig 200/201, „Verfügbarkeit ist das Angebot"), aber `sweepMarktpraesenz` hat genau
> einen Aufrufer — `POST /internal/staffing-maintenance` —, und **den ruft nichts**: kein
> Crontab im Repo, kein Scheduler-Container, kein BullMQ-Takt. An derselben nie
> eingerichteten Zeile hängen außerdem der Hard-Lock bei Zahlungsausfall, das automatische
> Nachrücken und der Verfall von Einladungen. Die eigene Betriebsakte hält es seit dem
> 2026-08-24 fest: *„der Weg ist jetzt offen, aber es ruft ihn noch niemand."*
> **Deshalb ist M1.1 ein Takt-Herzschlag** — eine Tabelle, die sagt, wann jede Aufgabe
> zuletzt lief, plus ein Wächter, der bei Schweigen rot wird. Blueprint-fähig.

**Der nächste Griff: die Antwort des Owners auf E-K3-1 bis E-K3-3.** Der Entwurf
der Monatsplanung liegt vor (K3.1) und die Datenlage ist gemessen (K3.2), beides
in [features/K_BOUNTY_AUSZAHLUNG_MONATSPLANUNG.md](features/K_BOUNTY_AUSZAHLUNG_MONATSPLANUNG.md).
**Gebaut wird erst nach der Freigabe** — anders als bei K1 und K2 ist das kein
Gate, das man messen kann, sondern eine Produktentscheidung. Reihenfolge laut
Plan: **K0 → K4 → K1 → K2 → K3** — die ersten vier sind durch.

### Die vier Owner-Entscheidungen sind beantwortet *(2026-08-31)*

| | Frage | Entscheid | Stand |
|---|---|---|---|
| **E-K3-1** | AÜG-Höchstdauer prüfen? | **ja — prüfen und darstellen** | ✅ Mig 211, `auegService` |
| **E-K3-2** | in vergangene Monate planen? | **ja**, *„alleine wegen fehlenden Stundenzetteln"* | ⏭ gilt für K3.5 |
| **E-K3-3** | offene Einsätze am Rand? | **bis Monatsrand, Vermerk „läuft noch"** | ✅ `randvermerk` |
| **E-K3-4** | Zuordnungen aufräumen? | **ja, mehrfach prüfen** | ✅ Mig 210, acht Wege |

**Der nächste Griff: `K3.5`** — beide Spuren schreibend. E-K3-2 ist beantwortet,
also darf in einen vergangenen Monat geplant werden. **Die lesende Fläche steht**
(`monatsplan.html`, `GET /workforce/monatsplan`) und ist im Browser belegt —
Raster, Leerzustand, Fehlerzustand, Konsole sauber.

**Die Vorarbeit für K3.5 ist erledigt, die Schreibwege selbst stehen aus.** Beim
Nachsehen, wie sie an die bestehende Domäne andocken, sind drei Befunde
herausgefallen (vollständig im Arbeitsplan, Abschnitt „K3.5 — die Vorarbeit"):

1. **Echter Ausfall:** die Bedarfsliste der Kundenspur filterte mit der
   Org-Kennung gegen `demand_requests.requester_company_id`, die eine
   **Nutzer**kennung trägt. Gemessen: **0 Treffer im gesamten Bestand**. Damit
   konnte auch die fünfte Konfliktart (unbesetzter Bedarf) nie feuern. Behoben.
2. **Latent:** die vier Abfragen über Zuordnungen prüften deren Zustand nicht —
   9 von 24 sind archiviert. Wirkung heute null, mit K3.5 scharf. Behoben.
3. **Fehlalarm aus dem eigenen Prüfstand:** ein Messskript ohne
   `db/typeParsers.js` ließ Datumswerte wie Zeitstempel aussehen. Kein
   Produktfehler — der echte Pool lädt den Parser. Der voreilig eingebaute
   `TO_CHAR`-Riegel wurde wieder entfernt.

> **Was daraus dauerhaft bleibt:** jeder Kalendertag der Plattform hängt an der
> einen Zeile `import "./typeParsers.js";` in `api/db/pool.js`. Sie sieht aus wie
> ein unbenutzter Import; wer sie entfernt, dreht jedes Datum auf den Vortag.
> **Nichts hielt sie fest** — jetzt tut es `api/test/kalendertagDE.test.js`.

**K3.5 ist im Backend fertig — und war kleiner als gedacht, weil beide
Schreibwege längst existierten:**

| Spur | Weg |
|---|---|
| Kunde · Bedarf | `POST /marketplace/demand-requests` (`requesterId` ist eine **Nutzer**kennung, nicht die Org) |
| Agentur · Besetzung | `POST /workers/staffing-assignments/:id/quick-assign` |

**Nicht** direkt in `worker_assignment_links` schreiben: dort hängt die ganze
Besetzungsmaschinerie (Einladung, Zusage, Reservierung, `recalcAssignmentStaffing`).
Ein zweiter Schreibweg daneben wäre eine Schattenwahrheit.

**Neu gebaut ist das eine Stück, das fehlte:** `GET /workforce/monatsplan/vorschau`
— was bricht, **wenn** ich diese Kraft auf diesen Einsatz setze. Beide Endpunkte
oben antworten erst *nach* dem Schreiben; 3b verspricht das Gegenteil. Die
Vorschau **schreibt nichts** (per Test belegt), gilt **nur für die Agenturspur**,
und hat zwei Riegel: der Einsatz muss der Firma gehören **und die Kraft auch** —
sonst wäre sie ein Auskunftsdienst über fremde Einsatzpläne. Beide antworten 403
ohne Zusatzangabe.

**E-K3-2 brauchte keine Änderung:** gemessen kennt keines der beiden Schemata eine
Vergangenheitssperre. Es wurde auch keine eingebaut, um sie danach zu entfernen.

**K3.7 kam dazu, weil das Raster die Minderheit zeigte.** Gemessen: von 31
Mitarbeitern der Zeitarbeitsfirmen erschienen im April-Raster **vier** — Zeilen
waren Einsätze, und wer gerade keinen hat, kam nicht vor. Das sind genau die
verplanbaren. `GET /workforce/monatsplan/mitarbeiter` dreht die Achse: Zeilen
sind Menschen, die **freie Spanne** ist der Inhalt, und wer kein Konto hat
(Migration 175) steht trotzdem da.

**Die Fläche ist jetzt vollständig verdrahtet:** Umschalter Einsätze/Mitarbeiter,
*Besetzung prüfen* je Einsatz mit nach freien Tagen sortierten Kandidaten, und der
Befund mit Hebel. Im Browser gegen echte Datenbank-Antworten belegt, inklusive
Leer- und Fehlerzustand.

> **Und sie ist auffindbar.** `monatsplan.html` war vorher über KEINE Navigation
> erreichbar — die einzige lebende Seite von 80, auf die das zutraf. Sie steht
> jetzt unter *Deals & Einsätze*, und `api/test/erreichbarkeit.test.js` erzwingt
> es dauerhaft: was das Register `aktiv` nennt, muss erreichbar sein. Ausnahmen
> gehören ins Register, nicht in eine Testdatei.

**K3.6 (Härtung) ist abgeschlossen** — und hat drei Dinge ergeben:

* **Skalierung:** Indizes für alle sieben neuen Abfragen vorhanden, auch für den
  kritischen Weg `users(org_id)` (die Tabelle wächst mit *allen* Plattformnutzern).
  `EXPLAIN` bestätigt den Indexzugriff. **Keine Migration nötig.**
* **Europe/Berlin:** `TZ` ist im Container gesetzt, aber `date` meldet UTC — dem
  Abbild fehlt die tzdata. Node rechnet über ICU (77.1) trotzdem richtig. **Nichts
  hielt das fest**; jetzt tut es `kalendertagDE.test.js`, mit einem Kindprozess
  unter `TZ=UTC`, weil sich „ausdrücklich Berlin" von „zufällig Berlin" sonst
  nicht unterscheiden lässt.
* **Mutation Testing:** 957 Mutanten, `npm run test:mutation:monatsplan`. Gesamt
  65,83 → **70,44 %**, der AÜG-Kern 78,04 → **80,95 %**. Die Schwelle steht als
  Ratsche auf dem gemessenen Stand. Geschlossen wurden die drei Klassen, die
  wirklich zählen: welche Spalte die Mandantengrenze zieht, was die Kundenspur
  nicht erfahren darf, und die Grenzen der AÜG-Kettenbildung.

> **Zwei Lehren daraus, die über dieses Projekt hinausgehen.** Erstens: der
> Stryker-Bericht ist ein Hinweis, kein Urteil — von sechs „überlebten"
> Entscheidungspunkten waren nach Prüfung von Hand fünf längst gefangen.
> Zweitens: eine DB-freie Suite kann Mutanten in SQL-Text nicht töten. Die
> Punktzahl einer Datei, die zur Hälfte aus SQL besteht, ist dadurch gedeckelt —
> und das ist kein Testmangel, sondern die Bauart der Schicht.

**Mutation Testing: alle drei Bereiche halten die Latte** (Owner-Vorgabe
2026-09-01, 90 % je Bereich, fest vorgeschrieben auch für künftige):

| Bereich | vorher | nachher |
|---|---:|---:|
| `monatsplan` | 65,83 % | **90,57 %** |
| `rbac` | 95,94 % gemittelt, zwei Dateien darunter | **97,47 %**, jede Datei ≥ 91,5 % |
| `subscription` | 41,03 % | **94,85 %** |

> **Zwei Dinge, die man wissen muss, bevor man wieder misst.**
>
> 1. **Nie inkrementell.** Der Zwischenspeicher ist auf Änderungen am *Quelltext*
>    geschlüsselt, nicht auf die der *Tests*. Wer Proben ergänzt und danach misst,
>    bekommt sonst die alte Zahl — das hat hier eine Stunde gekostet. Steht jetzt
>    in der Konfiguration (`incremental: false`) und wird von
>    `api/test/mutationsSchwelle.test.js` erzwungen, lokal wie im
>    projektübergreifenden Playbook.
> 2. **„Je Bereich" heißt je Datei.** `rbac` hielt im Mittel 95,94 %, während zwei
>    Middleware-Dateien bei 88,5 und 89,8 % lagen. Ein Mittelwert versteckt jede
>    Lücke.

## Welle M — M0 ist gemessen, der Rest wartet auf Entscheidungen

**[`M0_BESTANDSPRUEFUNG.md`](features/M0_BESTANDSPRUEFUNG.md)** — der Ist-Stand des
Marktplatz-Flows, selbst nachgemessen gegen den Vorbefund in
[`M_MARKTPLATZ_FLOW.md`](features/M_MARKTPLATZ_FLOW.md).

Sieben Prüfer, sieben Skeptiker, **48 Urteile mit Beleg**. Ergebnis in einem Satz:
**der Vorbefund hält im Kern** — kein Urteil geht von `fehlt` auf `fertig`, ein
Doppelbau droht aus dieser Messung also nicht. Drei Urteile gehen aber von `fehlt`
auf `unerreichbar`, und das ist die teuerste Verwechslung des Plans: wer `fehlt`
liest, baut einen Vorgang; wer `unerreichbar` liest, hängt einen Knopf an einen
fertigen.

**Drei Befunde habe ich zusätzlich selbst nachgemessen**, weil M1 und M2 auf ihnen
aufsetzen:

* `acceptInvite` überschreibt per `ON CONFLICT (email)` das Passwort eines
  bestehenden Plattform-Kontos (`workerService.js:941`) — und hängt es der
  einladenden Firma als Mitglied an, wobei eine höhere Rolle still auf `worker`
  **herabgestuft** wird (`:949`). Der Riegel `EMAIL_EXISTS_OTHER_ROLE` existiert
  im Import-Weg und fehlt hier ersatzlos.
* Die Marktplatz-Automatik hat **einen** Aufrufer (`internal.js:559`), der ist ein
  HTTP-Endpunkt, und **kein Dienst im Stack ruft ihn**: `docker-compose.yml` führt
  db, mailpit, redis, migrate, api, frontend — keinen Takt.
* Ein Einsatz kann über das Produkt **nie** abgeschlossen werden: die Route
  `POST /assignments/:id/complete` existiert, der einzige `/complete`-Aufruf im
  Frontend gilt Datenschutz-Anfragen. Damit ist die Bewertung strukturell tot.

**M0 endete mit einem Bericht, nicht mit einem Bauauftrag.** Der Plan sagt: *fehlt
etwas wirklich, wird gefragt, nicht erfunden.* Es wurden **33 Fragen** gestellt; die
vier blockierenden hat der Owner am 2026-09-01 beantwortet:

| | Frage | Entscheid |
|---|---|---|
| **M-E7** ✅ entschieden | Wer schließt einen Einsatz ab? | **Beide Seiten**, beidseitig und gegenseitenorientiert |
| **M-E8** ✅ entschieden | Takt einrichten? | **Ja** |
| **M-E9** ✅ entschieden | Eigene Sitzungswelt fürs Portal? | **Ja**, nach dem `/staff`-Muster |
| **M-E3** ✅ entschieden (bestätigt) | PRO-Angebotslimit? | **Unbegrenzt** — war bereits entschieden; offen ist nur, dass der CODE noch 50 sagt |

Ausführlich mit den Folgen: `M_MARKTPLATZ_FLOW.md`, Abschnitte 8.4 und 8.5.

**Die übrigen 29 Fragen** stehen in Abschnitt 5 des M0-Berichts. Sie blockieren M1
und M2 nicht.

### M1.1 und M1.2 sind gebaut *(2026-09-02)*

**Der Betriebstakt** — Migration `212_betriebs_takt.sql`, eine Zeile **je Aufgabe**
(`aufgabe TEXT PRIMARY KEY`), kein Laufprotokoll. Ein Protokoll wächst unbegrenzt und
beantwortet die eigentliche Frage schlechter.

Drei Entscheidungen daran sind wichtiger als der Code:

* **Der Herzschlag hängt VOR den Routen, nicht in ihnen.** Ein `router.use` vor allen
  28 `/internal/*`-Endpunkten statt 28 einzelner Einbauten — der 29. Endpunkt trägt ihn
  dann automatisch. Dasselbe bei BullMQ: alle vier Arbeiter gehen durch dieselbe Naht
  (`instrumentWorker`), also genügte dort ein Griff.
* **Der Stand geht von der ERWARTUNG aus, nicht von der Tabelle.** `TAKTE` ist eine
  eingefrorene Registratur von zehn Aufgaben. Eine Aufgabe, die nie lief, hat keine
  Zeile — wer Zeilen zählt, zählt sie nicht. Genau so ist die Marktplatz-Automatik ein
  Jahr lang durchgerutscht. `still` ist deshalb der Zustand mit dem lautesten Ton, und
  `taktStand` iteriert die Registratur, nicht die Tabelle.
* **Der Takt ruft die Dienste direkt** (`staffingWorker.js`), nicht den eigenen
  HTTP-Endpunkt. Ein Dienst, der sich selbst über das Netz aufruft, braucht ein
  Geheimnis, eine erreichbare Adresse und einen zweiten Fehlerpfad.

**Die Kachel steht im Staff CC unter Operations** — dort und nicht in einem eigenen
Modul, weil „läuft das noch?" genau die Frage ist, wegen der jemand Operations
aufschlägt. Abgefragt wird der Takt **zuletzt** in `loadOperationsSnapshot`: eine neue
Abfrage vorne verschiebt jede bestehende Muster-Pool-Sequenz um eins. Beim ersten
Anlauf stand sie oben — der Fehler, vor dem die Bemerkung über `service_health` seit
Monaten warnt.

**Ein neuer Wächter kam dabei heraus, und er hat sofort etwas gefunden.** Die Kachel
benutzte sieben CSS-Klassen (`scc-kpi-grid`, `scc-card__title`, `scc-badge--danger` …),
die in **keiner** Datei des Staff CC stehen. `tsc --noEmit` war grün und musste es
sein: `className` ist ein freier String. Die Kachel wäre als unformatierter Textblock
erschienen — kein Fehler, keine Meldung, nur falsch.
[`sccKlassen.test.js`](../api/test/sccKlassen.test.js) schließt die Lücke: jede feste
Klasse braucht eine Regel, jede zusammengesetzte (`scc-status--${ton}`) ihre Familie.
Er liest eng — nur `className`, nicht `id`, nicht `var(--scc-danger)` —, weil ein
Wächter mit Fehlalarmen abgeschaltet wird. Ein erster, gröberer Anlauf meldete 25
Verletzungen, von denen 25 keine waren.

> **Blueprint-fähig:** Herzschlag und Klassen-Wächter gehören unverändert in jedes
> Folgeprojekt. Beide kosten nichts, brauchen keine Datenbank und fangen eine
> Fehlerklasse, die kein Übersetzer sehen kann.

Belegt durch `betriebsTakt.test.js` (32), `betriebsTaktKachel.test.js` (6) und
`sccKlassen.test.js` (7) — jeweils mit Rückmutation: die Aufgabe aussetzen, die Kachel
in den Kopfbereich zurückschieben, die tote Klasse wieder einsetzen. Alle drei werden
rot.

### M1.3 ist gebaut *(2026-09-02)* — drei ineinandergreifende stille Ausfälle

Gemessen, nicht vermutet:

1. `app.js`s `sendMail` endete ohne Transport mit `return true`.
2. `emailService.sendMail` gab `{ accepted: [to], rejected: [] }` zurück — von einem
   echten Versand nicht zu unterscheiden.
3. **Der schlimmste:** die Masseneinladung umschloss den Versand mit `try/catch` und
   führte eine Liste `failed`. Nur **wirft `sendMail` nie** — es fängt selbst und gibt
   `false` zurück. Der `catch` war toter Code, `failed` blieb **immer leer**, und der
   Disponent las „alle eingeladen", auch wenn keine einzige Mail hinausging.

Von 42 Aufrufern prüfen 6 die Rückgabe. Der schlimmste Fall war damit nicht „eine Mail
geht verloren", sondern „hundert Einladungen melden Zustellung, und niemand erfährt es".

**Die Antwort hat zwei Hälften, und sie greifen ineinander:**

* **Der Riegel** (`versandwegPflicht` in `emailProviderService.js`): in Produktion ohne
  Versandweg wird hart abgelehnt (503, `MAIL_NO_TRANSPORT`) statt still Erfolg zu
  melden. In Entwicklung bleibt es beim Loggen — Mailpit ist dort der Normalzustand.
  Dazu die Startprüfung: **`runProductionValidation` beendet den Prozess**, wie bei
  jeder anderen Pflichtangabe. Vorher stand dort eine Warnung, und die war folgenlos.
  Wer bewusst ohne Mail betreiben will, setzt `EMAIL_PROVIDER=disabled` — eine
  Entscheidung, kein Versehen.
* **Die Sicht** (`mail_versand`, Migration 213): jeder Versuch zählt je Zweck und
  Kalendertag. Damit bleibt auch der Fehlschlag sichtbar, den einer der 36 ungeprüften
  Aufrufer ignoriert.

Drei Entscheidungen daran, die beim Nachbauen zählen:

* **Aggregiert, nicht eine Zeile je Mail.** Eine Zeile je Mail wächst unbegrenzt **und**
  trägt die Empfängeradresse — also eine Löschpflicht. Die Tabelle trägt weder Adresse
  noch Betreff. Gefragt wird ohnehin nicht „ging Mail 4711 raus?", sondern „kommen
  Einladungen überhaupt an?".
* **`ohne_versandweg` zählt getrennt von `fehlgeschlagen`.** Das erste ist ein
  Konfigurationsfehler, das zweite ein Betriebsvorfall. Sie brauchen verschiedene
  Antworten, also stehen sie in verschiedenen Spalten.
* **Der Stand geht von der ERWARTUNG aus**, wie beim Betriebstakt: ein Zweck ohne jede
  Zeile erscheint trotzdem und fällt auf. Wer Zeilen zählt, zählt ihn nicht.

**Die Masseneinladung** reicht den Versand jetzt in **einem** `addBulk` an die vorhandene
`email`-Queue — 200 Einladungen waren vorher 200 SMTP-Gespräche in der Anfrage. Fällt
Redis aus, wird direkt gesendet statt still nichts zu tun. Die Antwort trennt
`queued_count` von `invited_count`: über die Warteschlange ist die Mail **eingereiht**,
nicht zugestellt, und das steht auch so in der Meldung an den Disponenten.

**Die Kachel** steht neben dem Betriebstakt unter Operations. Beide beantworten dieselbe
Sorge, und zwei Anlaufstellen dafür wären eine zu viel.

Belegt durch `mailEhrlich.test.js` (37) und `operationsKacheln.test.js` (11, aus
`betriebsTaktKachel.test.js` hervorgegangen). **Rückmutation für fünf Struktur-Proben** —
Riegel ausbauen, Rückgabeprüfung entfernen, Fehlerstart zur Warnung machen, den Stand
aus der Tabelle statt der Erwartung bilden, den Zweck nicht durchreichen: alle fünf
werden rot.

> **Zwei Fallen, beide schon einmal teuer gewesen und hier wieder aufgetreten:**
> die Migrations-Probe schlug erst an der eigenen `--`-Begründung an, dann am Wort
> „Empfängeradresse" in einem `COMMENT ON`-Text — also in echtem SQL, das kein
> Kommentar-Strippen entfernt. Wer die Datei liest, prüft Prosa. Jetzt wird die
> **Spaltenliste** gelesen. Und der Betriebstakt landete zuerst ganz oben in
> `loadOperationsSnapshot`, wo er jede bestehende Muster-Pool-Sequenz um eins verschoben
> hätte — genau davor warnt die Bemerkung über `service_health` seit Monaten.

### M1.4 ist gebaut *(2026-09-02)* — HTTP 200 ist die schlimmere Sackgasse

`worker-login.html` ist die Seite, auf der ein eingeladener Mitarbeiter landet. Sie liegt
unter `frontend/public/`, wird aber über einen nginx-Alias an der **Wurzel** ausgeliefert,
damit der Link in der Einladungsmail hübsch ist. Ihre Verweise waren relativ — und an der
Wurzel lösen die nicht nach `/public/…` auf, sondern nach `/…`, wo der Catch-all greift.

Am laufenden Stapel gemessen, nicht vermutet:

```
GET /worker-login.html             200  text/html  22034 B   richtig
GET /worker.css                    200  text/html  71681 B   Landeseite
GET /einsatzportal-dashboard.html  200  text/html  71681 B   Landeseite
```

Beide liefern `<title>TempConnect – Personal in Stunden…</title>`. **Kein 404.** Ein 404
wäre sichtbar; ein 200 mit der falschen Seite ist es nicht. Folge: das Stylesheet wird als
MIME-Fehler verworfen — die Seite erschien ungestaltet —, und wer sein Passwort gesetzt
hatte, landete auf der **Verkaufsseite** statt im Portal.

Der Rest der Anwendung macht es an vier Stellen richtig (`pageShell.js`,
`worker-portal.html` verweisen absolut auf `/public/einsatzportal-dashboard.html`). Genau
diese eine Seite fiel heraus, **weil sie als einzige nicht unter `/public/` ausgeliefert
wird** — die Ausnahme, die den Alias nötig macht, ist dieselbe, die den Fehler erzeugt.

Nach der Umstellung auf absolute Pfade, gegen denselben Stapel gemessen:

```
GET /public/worker.css                   200  text/css   15325 B
GET /public/einsatzportal-dashboard.html 200  text/html  41869 B
GET /public/einsatzportal-profil.html    200  text/html  94636 B
```

> **Hinweis für die nächste Sitzung:** der Container bedient das **Haupt-Repo**
> (`docker inspect tempconnect_frontend`: `…\frontend -> /usr/share/nginx/html`), nicht den
> Worktree. Ein `curl` beweist hier also die Zieladressen, nicht die geänderte Datei. Die
> Datei selbst ist per Wächter und Rückmutation belegt.

**Der Wächter liest die nginx-Konfiguration, nicht eine Liste.**
[`wurzelSeiten.test.js`](../api/test/wurzelSeiten.test.js) findet jede Seite, die an der
Wurzel aus `/public/` bedient wird, und verlangt von ihr absolute Verweise — `href`, `src`
**und** `location.href/replace/assign`. Kommt morgen ein zweiter Alias dazu, ist die neue
Seite sofort bewacht. Eine Namensliste wäre in vier Wochen falsch und brächte denselben
Fehler zurück. Rückmutation für beide Sorten (Stylesheet und Sprungziel): beide werden rot.

### M1.5 ist gebaut *(2026-09-02)* — die Paywall kann zum ersten Mal erscheinen

20 von 23 bewachten Seiten trugen `data-sla-guard="sla_access"`, und dieser Schlüssel ist
für **jeden** Plan wahr. `slaGuard.js` fragt `hasFeature(plan, feature)` — die Antwort war
also immer ja, und der fertige Paywall-Block konnte nie wegen des Plans erscheinen, nur im
Störfall (dem `.catch`-Zweig).

**Zur Einordnung, damit das nicht überspitzt gelesen wird: kein Sicherheitsloch.** Beide
Erstellen-Wege halten. Ein DEMO-Konto füllte aber das ganze Formular aus und bekam beim
Absenden:

| Fläche | Antwort für DEMO | warum |
|---|---|---|
| Kapazitätsbörse | `429 PLAN_LIMIT_REACHED` | `listings`-Limit ist 0 |
| Marktplatz-Bedarf | `403 WORKER_LIMIT_EXCEEDED` | `max_workers_per_request` ist 0 |

Falsch war der **Zeitpunkt** (nach der Arbeit statt davor) und die **Botschaft** (eine
Quoten- bzw. Kopfzahl-Meldung, wo eine Planaussage gehört).

**Die Planlisten sind abgeleitet, nicht erfunden.** Die beiden neuen Schlüssel
(`capacity_exchange_create`, `marketplace_demand_create`) enthalten genau die Pläne, deren
zugehöriges Limit in `PLAN_LIMITS` nicht null ist — also die, die es ohnehin schon dürfen.
**M1.5 trifft damit keine neue Preisentscheidung**; der Schlüssel sagt nur vorher, was das
Backend hinterher ohnehin entscheidet. `paywallSchluessel.test.js` rechnet beide
Ableitungen nach und wird rot, sobald ein Limit sich ändert und die Liste nicht.

> **Eine Abkürzung, die teuer gewesen wäre:** „Erstellen ist PLUS und aufwärts" liegt nahe
> — `sla_offers_create` ist so definiert. Sie hätte einen zahlenden **BASIS**-Kunden
> ausgesperrt, dem `PLAN_LIMITS.BASIS.listings = 5` seit jeher fünf Anzeigen zusagt. Zwei
> Wahrheiten über dieselbe Frage; die Ableitung löst das an der Wurzel.

Der Schlüssel hängt an **Seite und Route** — und in der Route **vor** dem Mengen-Limit,
sonst käme weiterhin die Quotenmeldung. Dazu je ein Eintrag im Plan-Katalog, sonst sähe der
Kunde eine Paywall für etwas, das die Abo-Übersicht gar nicht nennt. Rückmutation für alle
vier Zusagen (Schlüssel wieder plan-blind, Seite zurück auf `sla_access`, Route ohne
Schlüssel, Limit vor Schlüssel): alle vier werden rot.

**Zwei Befunde, bewusst NICHT mitgebaut** — sie brauchen eine Owner-Entscheidung:

* **`POST /capacities` hat null Frontend-Aufrufer.** Die Route ist mit
  `sla_offers_create` (PLUS+) bewacht, aber niemand ruft sie; die Kapazitätsbörse schreibt
  über `POST /capacity-exchange/entries`. Entfernen oder verdrahten? Ein bewachter Weg, den
  niemand geht, ist dieselbe Karteileiche wie ein toter Knopf.
* **Sechs Seiten tragen einen plan-blinden Schlüssel und haben ein Formular mit POST**
  (`capacity_search`, `deal_management`, `sla_search_job_detail`, `supplier_scorecard`,
  plus die zwei jetzt behobenen). Bei den vier verbliebenen ist der POST eine **Suche oder
  Aktion**, keine Erstellung — deshalb wurde hier nichts geändert. Eine generische Regel
  „Formular + POST ⇒ eigener Schlüssel" wäre zu laut gewesen; sie hätte vier Fehlalarme
  erzeugt. Ob eine dieser vier Aktionen planpflichtig sein soll, ist eine Produktfrage.

### M1.6 ist gebaut *(2026-09-02)* — aggregieren allein ist noch keine Anonymität

Die drei Endpunkte unter `/marketplace/public/*` tragen **alle** `requireAuth`.
„Öffentlich" heißt dort „jeder **angemeldete** Nutzer". Eine Suchmaschine hat kein Konto,
und ein Interessent, der wissen will, ob sich die Anmeldung lohnt, auch nicht. Solange die
Zahlen hinter dem Login liegen, kann der Marktplatz nicht für sich werben.

**Der Plan sagt „aggregieren statt auflisten". Das genügt nicht.** Gegen die laufende
Datenbank gemessen, gruppiert nach Rolle und Ort:

```
Altenpflege|Hamburg|2     Software|Hamburg|1        Elektriker|Köln|1
IT-Administrator|Köln|1   Demenzbetreuung|Hamburg|1  … (12 Gruppen)
```

**Jede** Rollengruppe hat ein oder zwei Anzeigen. Ein „Aggregat" der Größe eins ist kein
Aggregat, sondern der Datensatz mit anderer Beschriftung: *„1 Software-Kraft in Hamburg,
20 Köpfe"* ist genau eine Anzeige genau einer Firma. Ohne Mindestgruppengröße wäre das
Schaufenster eine Personensuche mit Zwischenschritt.

Deshalb hat der Dienst eine **Mindestgruppe von drei** — bei zwei genügt ein Mitwisser, um
auf den anderen zu schließen. Was darunter liegt, wandert nach „Sonstige"; die Gesamtzahl
bleibt richtig, nur die Zuordnung verschwindet. Gegen die echten Daten liefert das:

```
Kapazität  13 Anzeigen, 44 Köpfe   nach Rolle: nur „Sonstige" (13)
                                    nach Ort:   Hamburg 9 · Sonstige 4
Bedarf     11 Anfragen, 19 Köpfe    nach Rolle: Lagerhelfer 6 · Sonstige 5
```

Zwei weitere Entscheidungen: die Feldliste ist eine **Erlaubnisliste** (ein neues Feld ist
per Vorgabe nicht öffentlich, bis jemand es einträgt und dabei nachdenkt), und die Abfrage
**holt gar nicht erst**, was nicht heraus darf — kein `id`, kein `company_name`, kein
Titel, keine Preisspanne. Was nie gelesen wird, kann kein späterer Umbau durchreichen.

Die Seite [`schaufenster.html`](../frontend/public/schaufenster.html) ist indexierbar
(`robots: index`, canonical, Beschreibung) und aus dem **gemeinsamen Seitenfuß** verlinkt —
damit von jeder Seite erreichbar, ohne die Landeseite anzufassen (sichtbare
Landing-Änderungen brauchen laut CLAUDE.md eine Vorschau). Fünf Rückmutationen belegt:
Schwelle abschalten, Firmenname in die Gruppe, Anmeldezwang auf die Route, Router nicht
einhängen, auch Erfülltes mitzählen — alle fünf werden rot.

> **Im Browser gegen echte Daten geprüft**, über einen kurzlebigen Vorschau-Server aus
> dieser Arbeitskopie (der Container bedient das Haupt-Repo). Inhalt vollständig, keine
> Konsolenfehler, Dokumenthöhe 1001 px bei 720 px Fenster — der Fußnoten-Hinweis liegt bei
> 592 px, also im Sichtbereich. Der Server ist gelöscht, nicht committet.

### Ein Prüffehler, der eine Welle auf rotem Tor durchgehen ließ

**M1.5 wurde committet, obwohl der Lauf `ℹ fail 1` meldete.** Ursache war nicht der Lauf,
sondern wie ich ihn gelesen habe: ich suchte im Protokoll nach dem Abbruch-Block
(*„ACHTUNG — diese Dateien sind unabhängig vom Abbruch rot"*) und nach Zeilen der Form
`✖ test\datei.js`. Beide erscheinen **nur bei einem abgestürzten Testprozess**. Eine
gewöhnlich fehlgeschlagene Zusicherung steht woanders — unter `✖ failing tests:` — und
taucht in keinem der beiden Muster auf.

Rot war `entitlementRouteGates.test.js`: es pinnt die Middleware-Kette der
Kapazitäts-Routen als wörtliche Zeichenkette, und M1.5 hatte `ceCreate` eingefügt.
Aufgefallen ist es erst eine Welle später, weil derselbe Test wieder rot war.

**Regel ab sofort:** das Ergebnis eines Laufs wird an genau einer Zeile abgelesen —

```bash
grep -E "^ℹ (pass|fail)" <protokoll>
```

Erst bei `ℹ fail 0` ist der Lauf grün. Der Abbruch-Block ist eine *zusätzliche* Auskunft
(Prozess gestorben, Klärungslauf nötig), kein Ersatz.

> **Der Wächter hat dabei etwas gefunden, das ich übersehen hatte:** die Kette wird für
> **drei** Routen gepinnt — `entries`, `activate` **und `reactivate`**. Reaktivieren stellt
> ebenfalls eine Anzeige aktiv, hatte den Erstellen-Schlüssel aber nicht. Jetzt schon. Ein
> spröder Test, der eine echte Lücke aufdeckt, ist kein spröder Test.

### Eine Falle, die in dieser Sitzung VIERMAL zugeschlagen hat

Eine Probe, die im Quelltext nach einer Zeichenkette sucht, findet sie auch **in der
eigenen Begründung**. Getroffen hat es: den Herzschlag (`res.on("finish")` im Kommentar),
den Import-Wächter, die Migrations-Probe (`„Empfängeradresse"` — erst im `--`-Kommentar,
dann in einem `COMMENT ON`-Text, den kein Kommentar-Strippen entfernt) und zuletzt
`innerHTML` in der Erklärung „nie mit innerHTML".

**Regel:** vor jedem `includes`/`match` auf Quelltext die Kommentare entfernen — und bei
SQL zusätzlich daran denken, dass `COMMENT ON` echter Code ist. Wo es geht, nicht die
Datei lesen, sondern die Struktur (die Spaltenliste, den Block, die Zeile).

### M1.7 ist gebaut *(2026-09-02)* — die zweite Wahrheit gewann, weil sie im Schreibpfad stand

`capacityExchangeService.js` führte **neben** `userService.PLAN_LIMITS` eine eigene
Tabelle:

```
eigene Tabelle:   DEMO 0 · BASIS 5 · PLUS 20 · PRO  50 · INDIVIDUELL 999
PLAN_LIMITS:      DEMO 0 · BASIS 5 · PLUS 20 · PRO  -1 · INDIVIDUELL  -1
```

Und die eigene entschied, weil `getActiveLimit` im Schreibpfad saß. Eine PRO-Agentur bekam
bei der **51. Anzeige** `PLAN_LIMIT` — für eine Leistung, für die sie 799 €/Monat zahlt;
INDIVIDUELL war bei 999 gedeckelt statt unbegrenzt. Owner-Entscheid M-E3: der abweichende
Wert wird **gelöscht**, nicht angeglichen — angeglichen wären sie beim nächsten Preisumbau
wieder auseinander.

> **Die Falle beim Löschen:** die verbleibende Tabelle schreibt „unbegrenzt" als `-1`. Ein
> bloßes Ersetzen hätte `cnt >= limit` zu `cnt >= -1` gemacht — **immer wahr**. Aus
> „unbegrenzt" wäre „gar nichts" geworden, ausgerechnet für die zwei teuersten Pläne.
> Deshalb `unbegrenzt()` an **jeder** Vergleichsstelle, auch im Aktivierungsweg.

Die Proben prüfen deshalb **Verhalten, nicht Zahlen**: PRO mit 500 aktiven Anzeigen darf
die 501. anlegen und einen Entwurf aktivieren; BASIS wird bei fünf weiterhin gebremst; ein
unbekannter Plan bekommt nichts statt alles. Vier Rückmutationen, alle rot.

> **Eine Probe hat dabei zunächst versagt, und das ist lehrreich.** Die erste Fassung
> zählte Vorkommen von `unbegrenzt(limit)` im Quelltext und verlangte drei. Sie fing das
> Entfernen einer Prüfstelle **nicht** — das Muster trifft auch die Funktions*definition*
> mit, also blieben immer noch drei übrig. Eine Zählprobe zählt, was sie zählt, nicht was
> sie meint. Ersetzt durch zwei Verhaltensproben.

**Als Nächstes: M1.8** — die `org_type`-Dimension. Danach M2.1, der `acceptInvite`-Riegel;
für den gilt: der Nachweis muss den **beidseitig toten** Kontostand prüfen, nicht nur das
überschriebene Passwort.

**DER NÄCHSTE GRIFF:** M1 (die stillen Ausfälle) — alle Entscheidungen dafür
liegen vor. Zuvor wird die Anweisung aus der Parallelsitzung abgewartet.
Welle K ist durch (K0–K4).

**Zwei Datenlücken, benannt statt geraten** (wie die 49 ankerlosen Einsätze aus
E-K3-4): 15 von 40 Bedarfen gehören einem Besteller ohne Organisation; **6 von 24
Zuordnungen** tragen die Zeitarbeitsfirma selbst als Entleiher, wodurch in der
Vorschau die eigene Firma als Gegenseite erscheint. Der Konflikt stimmt trotzdem
— nur das Etikett ist sinnlos, und welcher Entleiher gemeint war, steht nirgends.

> **Für den Browser-Nachweis wichtig:** der API-Container läuft einen
> Prozess-Schnappschuss und kennt neue Routen nicht. Die Fläche wurde deshalb
> gegen eine **echte, aus der laufenden Datenbank gezogene** Dienst-Antwort
> geprüft (`.claude/monatsplan-probe.json`, vom Worktree-Vorschauserver
> ausgeliefert). Dass die Route selbst trägt, belegen die Proben am echten
> Handler und die Container-Tests — nicht der Browser.

> **Was beim Bauen der AÜG-Prüfung schiefging und gefangen wurde.** Zwei
> Falschalarme: eine Kette, die 2026 endete, wurde für September 2027 gemeldet
> (Rückfall auf „die letzte Kette"), und `ueberschritten` rechnete gegen heute,
> während der Härtegrad gegen das Fenster rechnete — dieselbe Zeile sagte „hart"
> und „nicht überschritten". Beim Rückmutieren kam ein dritter Fund dazu: die
> beiden Riegel **deckten sich gegenseitig**, einzeln entfernt blieb die Suite
> grün. Jeder hat jetzt einen eigenen, isolierten Testfall.

> **Ein Befund, der offen bleibt: 49 der 68 Einsätze tragen keinen Lieferanten**
> — und für sie gibt es keinerlei Anker (kein Angebot, kein Vertrag, keine
> Ausschreibung, keine Zuordnung). Die Agentur-Spur der Monatsplanung sieht sie
> deshalb nicht. Migration 210 hat nur die zwei rekonstruierbaren nachgetragen;
> die übrigen zu raten wäre das Gegenteil von vorsichtig.

---|---|---|
| **E-K3-1** | **Soll die AÜG-Überlassungshöchstdauer geprüft werden?** | Sie hat **kein Feld im Schema**. Prüfbar wäre sie nur mit einem neuen Datum (Überlassungsbeginn je Kraft und Kunde) und einer Regel (18 Monate, mit tariflichen Abweichungen) — ein eigener Bau. Eine falsch gerechnete gesetzliche Frist ist schlimmer als keine. **Ohne diese Antwort kann K3.4 nicht vollständig gebaut werden.** |
| **E-K3-2** | **Darf in einen vergangenen Monat geplant werden?** | 25 % der Einsätze werden rückwirkend angelegt (bis zu 426 Tage). Entweder die Fläche kann das auch — dann ist sie zugleich Nachtragewerkzeug — oder nicht. Beides ist vertretbar. |
| **E-K3-3** | **Wie weit zeigt das Raster einen Einsatz ohne Enddatum?** | Offene Einsätze sind der Normalfall, nicht die Ausnahme. |
| **E-K3-4** | **Sollen die drei nicht geschlossenen Zuordnungen aufgeräumt werden?** | Die Monatsplanung kommt ohne die Bereinigung aus — sie rechnet gegen die wirksame Spanne. Aber jede andere Auswertung, die nur den Link liest, zählt weiterhin falsch. Aufräumen heißt: Bestandsdaten anfassen. |

> **Was die Messung ergeben hat und warum sie den Entwurf bestimmt** *(2026-08-31,
> laufende Datenbank)*: **91 % der Einsätze überschreiten eine Monatsgrenze** (41
> von 45 mit Enddatum), 34 spannen drei Monate, nur 5 bleiben in einem einzigen.
> Ein Raster, das den Monat als abgeschlossene Einheit behandelt, wäre für neun
> von zehn Zeilen falsch — deshalb: **der Monat ist die Ansicht, der Einsatz ist
> die Sache.** Dazu: Ø 98 Tage Dauer, Ø 10 Tage Vorlauf, **25 % rückwirkend
> angelegt**, 7 später geändert.
>
> **Korrigiert am 2026-08-31 beim Bauen von K3.4:** die zuerst gemeldete
> „echte Doppelbelegung im Bestand" war **ein Phantom**. Bei **drei** Zuordnungen
> steht `end_date IS NULL`, obwohl ihr Einsatz beendet ist — einer endete am
> 31.03.2025. Gegen die **wirksame Zeitspanne** gerechnet (Link-Ende, begrenzt
> vom Einsatzende) gibt es **null** Doppelbelegungen. Der Befund ist damit ein
> anderer, aber kein kleinerer: **Zuordnungen werden beim Abschluss eines
> Einsatzes nicht geschlossen**, und eine naive Prüfung hätte daraus einen
> dauerhaften Fehlalarm gemacht. `worker_absences` und
> `worker_profile_documents` existieren und sind leer — H2 und W2 sind gebaut
> und berechenbar, aber heute ohne Daten.

> **Was K2 gekostet hat und wofür.** Der Plan sah sieben Phasen vor; gebaut sind
> sie alle, aber das **Gate K2.2 hat drei Blocker gefunden, die nicht im Plan
> standen** — die Tier-Deckelung (vorhergesagt), die 20-%-Katalogregel und, am
> schwersten, der Lebenszyklus: eine 0-€-Rechnung hätte das Abo auf `past_due`
> gesetzt, niemand hätte sie bezahlt, und nach 14 Tagen wäre der Kunde, dem die
> Rechnung geschenkt wurde, auf DEMO **ausgesperrt** worden. `applyRenewalPayment`
> hat bis heute **keinen einzigen Aufrufer**. Das trifft nicht nur den Cashback,
> sondern jede Rechnung, die auf null fällt — auch einen K1-Eingriff bei 100 %.

> **Die zwei Widersprüche zum Owner-Entscheid sind korrigiert, nicht neu
> verhandelt:** `MAX_REFERRAL_REWARDS` stand auf **6** statt 3, und die
> Qualifikation feuerte **sofort** beim Zahlungseingang statt nach 30 Tagen.
> Beides steht jetzt auf dem entschiedenen Wert. Und die Prämie, die seit jeher
> **gebucht und nie angewandt** wurde, erreicht die Rechnung.

> **Was das Gate ergeben hat, in einem Satz: die Rechenkette trug die 0 € auf
> Anhieb, drei andere Schichten nicht.** Der schwerste Befund: der Lauf setzt das
> Abo auf `past_due`, eine 0-€-Rechnung bezahlt niemand, `applyRenewalPayment`
> hat **keinen einzigen Aufrufer** — nach 14 Tagen hätte `applyHardLocks` den
> Kunden, dem die Rechnung geschenkt wurde, auf DEMO **ausgesperrt**. Dazu: die
> Tier-Deckelung stutzte 100 % auf 25 %, der Katalog ließ überhaupt nur 20 % zu,
> und der Mahnlauf hätte 0,00 € angemahnt. Alle vier behoben (Mig 208,
> `nullEuroRechnung.test.js`, 9 Rückmutationen). **Der Owner-Entscheid bleibt
> unverändert** — keine 99-%-Krücke, kein Gutschriftsweg nötig.

> **Zwei Stellen, an denen der Bestandscode dem Owner-Entscheid widerspricht** —
> in K2.4/K2.5 zu korrigieren, nicht neu zu verhandeln: `MAX_REFERRAL_REWARDS = 6`
> (Owner: **höchstens 3**) und die Qualifikation feuert **sofort** beim
> Zahlungseingang (Owner: **30 Tage Bestand**). Und: die Werbeprämie wird seit
> jeher **gebucht und nie angewandt** — keine Datei des Geldpfads erwähnt
> `referral` überhaupt.

> **`K4-B1` gilt weiter, und K1 ist ihm genauso begegnet.** Es gibt **keinen Kanal,
> der das Team erreicht**: `notificationMatrix.dispatch()` kennt nur org- und
> vorgangsbezogene Empfänger und **überspringt unbekannte Ereignis-Schlüssel
> wortlos** (`sent: 0`); `writeStaffAudit()` verlangt zwingend eine handelnde
> Person und wirft ohne sie — ein Systemereignis hat keine. K4 hat **gezählt**,
> K1 **hält fest**: der Ausfall wird zur Zeile in `rabatt_ausfaelle` (Kunde, Monat,
> Grund, angesetzter Ersatzwert, Nettobetrag, die entstandene Rechnung) und ist in
> der Staff-CC-Fläche `rabatt-faelle` sichtbar. **Kein erfundener Zustellweg** —
> das wäre genau die stille Fehlerklasse, gegen die diese Spur antritt.

> **Was K1 an der Erhebung gelernt hat und was das für K2 heißt.** Der Plan nannte
> *einen* stillen Ausfallpfad; es sind **zwei**. Neben dem `catch` in
> `recurringBillingService` (Summen-Abfrage wirft → Rechnung ohne Rabatt) fängt
> **`getUserTier` seinen eigenen Datenbankfehler ab** und liefert `null` — der
> Deckel fällt still auf 8 %, ununterscheidbar von „hat noch keine Stufe", ohne
> Log. Weil `getUserTier` nie wirft, ist der Sicherheitsnetz-Wert
> `FALLBACK_MAX_DISCOUNT_PCT = 25` in `bountyService` **unerreichbar**; ein
> bestehender Test hält das seit jeher fest, ohne dass jemand die Folge gezogen
> hätte. **Für K2 wichtig:** die Tier-Deckelung greift auf *jedem* Weg, auch auf
> dem des Eingriffs — der 100-%-Cashback braucht die in 2.3 benannte Ausnahme
> wirklich, sonst schrumpft er bei einem Bronze-Kunden auf 8 %.

> **Gemessen für K1 (2026-08-29, laufende Datenbank).** 754 verdiente Bounties,
> davon **57 aktiv** bei **55 Kunden — alle 55 mit aktivem Abo**. Ø 3,09 %,
> höchstens 8 %, **niemand derzeit gedeckelt**; nur **7 von 55** haben überhaupt
> eine materialisierte Stufe (die übrigen laufen auf der Voreinstellung 8 %).
> **273 der 312 aktiven Abos sind bereits fällig**, Rechnungen gibt es bisher
> **null**. Größenordnung des Rabatts, der an dieser Kette hängt: rund **670 €
> je Monatslauf** (43 × PLUS à 499 €, 5 × BASIS à 150 €, 7 × INDIVIDUELL).

---

## Eiserne Regeln (Verstoß = echter Schaden)

| Regel | Warum |
|---|---|
| **Nie `git add -A`** | Im Baum liegen ungetrackte Geschäftsunterlagen: `docs/launch/`, `docs/aktuellesitzung/`, die UG-Gründungs-PDF. Immer Pfade einzeln stagen. |
| **Immer `git commit --only <pfade>`** | **Zweimal passiert (2026-08-27/28):** eine zweite Sitzung arbeitet auf derselben Linie und committet, während meine Dateien im Index liegen — meine Arbeit landete unter *ihrer* Commit-Nachricht (`33374dd`, `e70dafc`). Inhaltlich unversehrt, die Historie erzählt es falsch. `--only` bindet den Commit an genau die genannten Pfade und ist immun dagegen. **Eine geteilte Linie wird nicht umgeschrieben** — der Fehler bleibt stehen und wird benannt. |
| **Nie `git checkout <branch> -- <datei>` zum Abgleich zwischen Sitzungen** | Das ist **kein** Abgleich, sondern ein **Rücksetzer**: es verwirft unversionierte Änderungen an genau diesen Dateien. Sitzen beide Sitzungen auf **derselben Linie** — was der Normalfall ist —, ist der Befehl sinnlos und gefährlich zugleich. **Passiert 2026-09-01:** ich habe einer Parallelsitzung genau das empfohlen, weil `list_sessions` mir einen anderen Branch gemeldet hatte und ich es nicht nachgeprüft habe. Sie hat sich zu Recht geweigert; ausgeführt hätte es ihre Arbeit an drei Owner-Entscheidungen vernichtet. **Vorher prüfen:** `git branch --show-current` auf beiden Seiten, `git merge-base --is-ancestor <commit> HEAD`, und `git log --oneline -- <datei>` sagt, ob es überhaupt etwas zu holen gibt. Auf einer geteilten Linie ist die richtige Antwort meist: **gar nichts tun, es liegt schon da.** |
| **Push nur auf Zuruf** | Die **Commit**-Freigabe steht dauerhaft (Owner 2026-08-13): fertige Wellen werden nach grüner Suite ohne Nachfrage committet. Der **Push** braucht jedes Mal eine ausdrückliche Zusage — `origin` ist öffentlich. |
| **`Co-Authored-By: Claude <noreply@anthropic.com>`** | An jeden Commit. |
| **Tests sind die Spezifikation** | Ein roter Test wird **nie** durch Abschwächen grün gemacht. Ausnahme nur, wenn der Test nachweisbar einen Bug als Soll kodiert — mit Begründung im Commit. |
| **Kein stiller Skip** | Ein Test, der unter `api/scripts/run-tests.js` nicht real läuft, zählt nicht als grün. Pfade immer über `import.meta.url` auflösen, nie nur über `process.cwd()`. |
| **`.claude/`, `.agents/`, `_TEMPCONNECT_*`** | Gitignored, local-only. Was dort steht, überlebt die Maschine nicht — Dauerhaftes gehört nach `docs/`. |
| **Secrets nur in Umgebungsvariablen** | Niemals in Dateien. |

---

## Wie geprüft wird

```bash
cd api && node scripts/run-tests.js          # offizieller Runner, ohne Pipe
```
Stand: **10327 Tests, 10312 bestanden, Rückgabewert 0** (2026-08-29, nach K4).
Zwischenstände zur Einordnung: 10197 nach dem Zusammenführen der Release-Linie
(2026-08-27), davor 9524 auf der Arbeitslinie bzw. 9520 auf der Release-Linie;
der Zuwachs ist die Summe beider Linien (u. a. E-Rechnung EN 16931, Wellen J1–J10).
Im Container zusätzlich **369/369** DB-gestützte Tests.

> **Der Rückgabewert ist das Urteil, nicht die Fehlerzeile.** Auf Windows bricht
> gelegentlich eine Testdatei mit einem **nativen libuv-Abbruch** ab
> (`UV_HANDLE_CLOSING`) — das ist ein Abbruch der Laufzeit, kein roter Test.
> Der Läufer erkennt das (`api/scripts/lib/nativerAbbruch.mjs`), fährt die
> abgestürzte Datei **einzeln nach** und meldet nur dann grün, wenn *beides* gilt:
> die Datei läuft allein vollständig grün **und** der Hauptlauf hatte sonst keine
> rote Datei. Ein echter Fehlschlag daneben verhindert die Wiederholung
> ausdrücklich. Der Lauf sagt außerdem selbst, was er **nicht** bewiesen hat
> (`20fcf42`) — diese Zeilen sind zu lesen, nicht zu überblättern.

> **Ein Worktree ist kein halbes Repo mehr (behoben 2026-08-21, P2-W1).**
> `.agents/`, `frontend/support-ops/`, die ungetrackten Dateien unter
> `docs/launch/` und `deploy/.env` sind gitignored und fehlen in jedem frischen
> Baum. Drei Wächter leiteten daraus einen Befund ab und waren im Worktree
> dauerhaft rot, **ohne dass am Code etwas falsch war** — zwei Sitzungen sind
> unabhängig voneinander hineingelaufen. Sie prüfen jetzt den **git-Index**
> statt des Dateibaums und melden Ignoriertes als *nicht geprüft* statt als
> Fund (`api/test/helpers/repoBestand.js`). **Die Junction-Krücke von früher
> ist damit überflüssig** — wer noch eine hat, kann sie entfernen
> (nicht-rekursiv: `[System.IO.Directory]::Delete($pfad, $false)`; ein
> `Remove-Item -Recurse` greift durch sie hindurch und räumt das Ziel im
> Hauptbaum mit ab).
>
> Nachgewiesen in drei Umgebungen mit identischem Urteil: Worktree, frischer
> `git clone` (trägt gar keine ignorierten Dateien) und ein Baum, in dem sie
> liegen. `api/test/repoBestand.test.js` nagelt die Regel fest — samt der
> git-Falle, dass ein abschließender Schrägstrich (`docs/README.md/`) den
> Index-Abgleich aushängt und **jeden** Pfad als ignoriert meldet.
>
> **Was ein Worktree wirklich braucht:** `api/node_modules`. Es ist gitignored,
> also fehlt es — und ohne es bricht die halbe Suite mit `ERR_MODULE_NOT_FOUND`
> ab (207 Fehler, die wie Testbrüche aussehen). Einmalig verknüpfen:
>
> ```powershell
> # Pfade OHNE Backslash-Escapes zusammensetzen - genau hier ist die Doku
> # schon einmal zerbrochen (aus api\node_modules wurde ein Klingelzeichen
> # plus Zeilenumbruch, der Befehl war unlesbar).
> $wt   = Join-Path $worktree  'api/node_modules'
> $haus = Join-Path $hauptbaum 'api/node_modules'
> New-Item -ItemType Junction -Path $wt -Target $haus
> ```

Die DB-gestützten Tests laufen im Container, wo `DB_HOST` gesetzt ist — auf dem
Host überspringen sie sich selbst. Was gegen das echte Schema geprüft sein muss
(Constraints, LATERALs, Casts), gehört deshalb zusätzlich dorthin:
```bash
docker exec tempconnect_api sh -c "cd /app && node --test --test-force-exit test/integration/<datei>"
```

Im Container (nur `api/` und Lese-Mounts sind dort sichtbar):
```bash
docker exec tempconnect_api sh -c "cd /app && node --test --test-force-exit test/X.test.js"
```

**`\b` in einem Template-Literal ist ein Backspace, keine Wortgrenze (2026-08-19).**
Der Org-Grenzen-Wächter erkannte Tabellennamen über ``new RegExp(`\b${tabelle}\b`)``
— und traf deshalb **nie**. Eine Probe, die nichts trifft, ist still grün: sie
meldete vier korrekt bewachte Routen als Lücke und hätte umgekehrt eine echte
durchgelassen. Gelöst durch einen Teilstring-Vergleich statt eines regulären
Ausdrucks. **Merksatz: wer ein Muster aus einem Template-Literal baut, verdoppelt
jeden Backslash — oder verzichtet auf den regulären Ausdruck.** Dieselbe Klasse
wie die Zeilenenden-Falle darunter: ein Prüfer, der leer läuft, sieht aus wie ein
Prüfer, der nichts findet.

**Zeilenenden-Falle (gelöst 2026-08-15):** Der SQL-Schema-Wächter hashte die
Migrationsdateien byteweise und konnte deshalb nur in EINER Welt grün sein —
Windows checkt CRLF aus, der Container sieht LF. Wer die Momentaufnahme im
Container erzeugte, machte sie auf dem Host rot. Der Fingerabdruck vereinheitlicht
die Zeilenenden jetzt, und der Test rechnet nicht mehr selbst, sondern benutzt die
Funktion des Erzeugers. **Merksatz für jeden neuen Wächter, der Dateien hasht:
gegen beide Welten prüfen, sonst ist er in einer davon dauerhaft rot — und ein
dauerhaft roter Test wird abgeschaltet.**

**Bekannte Fragilität:** `test/me.route.coverage.test.js` wird im vollen Lauf als
fehlgeschlagen gemeldet, obwohl alle 68 Tests darin grün sind. Ursache gefunden:
`routes/me.js` braucht 5,9 s zum Laden und hinterlässt einen offenen `MessagePort` —
der Import-Graph startet einen Worker, `--test-force-exit` tötet ihn beim Aufräumen.
Lastabhängig. **Als eigene Aufgabe ausgelagert, nicht nebenbei anfassen.**

---

### Der Browser prüft nicht deinen Backend-Code (gefunden 2026-08-26)

Der API-Container mountet das **Haupt-Repo** nach `/app`. Entscheidend ist aber
etwas anderes: **Node lädt seine Module beim Prozessstart und liest sie nie neu.**
Am 26.08. lief `node server.js` seit **2 Tagen 1 Stunde**. Was der Prozess
bedient, ist ein Schnappschuss von dem, was beim Start in `/app` lag — nicht das,
was heute dort liegt, und schon gar nicht dein Worktree.

**Konkret schiefgegangen:** Ein Bedarf wurde im Browser angelegt, kam mit **201**
zurück und trug eine Ansprechperson aus dem Profil. Das sah aus wie der Beleg
dafür, dass eine Worktree-Änderung greift. Der Code auf der Platte kann diese
Spalten aber gar nicht schreiben — sein `INSERT INTO demand_requests` kennt sie
nicht, und ein Trigger existiert auch nicht. Es war ein fremder Schnappschuss.

| Prüfweg | Was er wirklich prüft |
|---|---|
| Browser gegen `:8080` oder den Vorschau-Server `:4178` | den **Schnappschuss** im laufenden Prozess |
| `docker exec … node scripts/run-tests.js` aus einer Kopie (`/tmp/wtN`) | **deinen** Code — frischer Prozess, frisch geladen |
| Frontend über den Vorschau-Server | **dein** Frontend — der Server liefert den Worktree aus |

Also: **Frontend-Änderungen sind im Browser echt prüfbar, Backend-Änderungen
nicht.** Der Vorschau-Server leitet `/api` an denselben nginx weiter, der auch
8080 bedient.

**Bevor irgendwo „am laufenden System belegt" steht:**

```bash
docker exec tempconnect_api sh -c "ps -o etime,args | grep '[n]ode server.js'"
```

Ist die Laufzeit älter als die eigene Änderung, wird etwas anderes geprüft als
gemeint. Ein Neustart hilft nur bedingt — er lädt den Stand des **Haupt-Repos**,
nicht den des Worktrees.

---

### Drei Fallen der Werkzeugkette, jede teuer bezahlt

Diese drei haben in einer einzigen Sitzung zusammen mehrere Stunden gekostet.
Sie haben **nichts** mit dem Produkt zu tun und treffen trotzdem jeden.

**1 · Escape-Zeichen kollabieren auf dem Weg durch die Werkzeuge.**
Fünfmal passiert. `\n`, `\r`, Backslashes und Backticks werden je nach Weg
(Bash, Heredoc, `python -c`, Schreib-Werkzeug) einmal zu viel interpretiert.
Ein Reparaturskript hat dabei einen ganzen Testblock gelöscht; der Befehl in
dieser Datei war unlesbar, weil aus `api\node_modules` ein Klingelzeichen plus
Zeilenumbruch wurde (heute repariert).

> **Regel:** Inhalte **ohne jedes Escape** erzeugen — `chr(10)`, `chr(96)`,
> `String.fromCharCode(...)`. Skripte in eine **Datei** schreiben statt `-c`.
> Und **immer das Ergebnis ansehen**, nie der Erfolgsmeldung des Skripts glauben.

**2 · Eine Pipe verschluckt den Rückgabewert.**
`node scripts/run-tests.js | grep … | head` liefert den Status von `head` — also
**0**. Eine rote Suite sah grün aus. **Regel:** Läufe in eine Datei umleiten und
die Datei lesen; niemals einen Testlauf durch eine Pipe beurteilen.

**3 · Der Browser beweist nichts über das Backend.** Siehe den Abschnitt darüber.
Ein 201 aus einem zwei Tage alten Prozess ist kein Beleg — er ist eine Falle, die
wie ein Beleg aussieht. **Ich bin einmal hineingelaufen und habe die Behauptung
zurückziehen müssen.**

## Wo die Arbeitspläne liegen

| Plan | Inhalt |
|---|---|
| [features/M_MARKTPLATZ_FLOW.md](features/M_MARKTPLATZ_FLOW.md) | **Der große Plan.** Der vollständige Unternehmens-Marktplatz als Kette, 19 Schritte vom Abokauf bis zum Dokument im Einsatzportal. Ist-Stand **gemessen und gegengeprüft** (130 Urteile: 65 fertig, 33 teilweise, 24 fehlen, 7 unerreichbar), zwölf Wellen M0–M11, sechs offene Owner-Entscheidungen M-E1…M-E6. **Vor jedem Anfassen des Marktplatzes lesen.** |
| [features/K_BOUNTY_AUSZAHLUNG_MONATSPLANUNG.md](features/K_BOUNTY_AUSZAHLUNG_MONATSPLANUNG.md) | **Der aktive Plan.** Owner-Abschnitte 12 + 13: Bounty-Verwaltung ins Staff CC, Werbe-Cashback, Monatsplanung, Feed-Rückfall. Alle Owner-Entscheidungen getroffen (2026-08-27). **K0 + K4 + K1 + K2 gebaut, K3.1–K3.4 gebaut. K3.5 und die Oberfläche sind offen.** |
| [features/L_TRAGFAEHIGKEIT.md](features/L_TRAGFAEHIGKEIT.md) | Hochverfügbarkeit und Skalierung („wie tragen wir 10 000 Kunden?"). **Eigenständiger Abschnitt, dokumentiert und ausdrücklich nicht gebaut** — Owner-Vorgabe 2026-08-27. |
| [features/J_LIVE_BELEGSCHAFT_MARKTPLATZ.md](features/J_LIVE_BELEGSCHAFT_MARKTPLATZ.md) | Welle J: Live-Belegschaft ↔ Marktplatz, Rechnungsstammdaten, E-Rechnung (ZUGFeRD, PDF/A-3u, Schematron). Gebaut. |
| [features/I_AUDIT_ZUWEISUNG_SUPPORT.md](features/I_AUDIT_ZUWEISUNG_SUPPORT.md) · [features/I3_ZUSTELLUNG_ERREICHT_DEN_MENSCHEN.md](features/I3_ZUSTELLUNG_ERREICHT_DEN_MENSCHEN.md) | Welle I: Audit-Trennung, Fristen, Support-Weg. **I3 Stufe 1 gebaut** (E-Mail im Arbeiter-Weg), Stufen 2–4 offen (Web Push statt SMS — billiger und die Einwilligung ist sauberer). |
| [features/P10_IMPORT_LIVE_ZEIT.md](features/P10_IMPORT_LIVE_ZEIT.md) | Owner-Abschnitte 5–7: CSV-Import (Spur D), Live-Belegschaft (E), Systemzeit (F) |
| `_TEMPCONNECT_MUTATION_RBAC_PLAN.md` *(gitignored!)* | Mutation-Testing, Wellen 0–4 + Roadmap für sieben weitere Bereiche |
| [ORG_GRENZE_BEFUND.md](ORG_GRENZE_BEFUND.md) | Warum die Mandantengrenze 80-mal einzeln in den Routen steht — versionierte Fassung des wichtigsten Architekturbefunds. **Welle 3b ist abgeschlossen** (2026-08-19). |
| `api/test/fixtures/orgGrenzen.json` | Das **Register der Mandantengrenze**: je Route ein Urteil, je Route-Datei ein Abdeckungsvermerk. Wird von `api/test/orgGrenzenWaechter.test.js` erzwungen. **Vor jeder neuen `:id`-Route lesen.** |
| [FLAECHEN.md](FLAECHEN.md) | Was gehört ins Staff CC, was ins OCC, was ins Support Center. **Vor jedem neuen Modul lesen**, wird per Test erzwungen. |
| [TESTING.md](TESTING.md) | Testarchitektur, inkl. Mutation Testing und seiner zwei Fallen |
| [features/H_KUNDENANSICHT_UND_ORG_GRENZEN.md](features/H_KUNDENANSICHT_UND_ORG_GRENZEN.md) | **H2 abgeschlossen** (2026-08-19): zehn Cross-Org-Luecken geschlossen, Waechter gebaut, 15 von 82 Route-Dateien eingeordnet. Enthaelt die vollstaendige Recherche und die Korrekturen daran. H1 lief parallel in einem eigenen Baum. |
| [features/G_ABWESENHEIT_SELBSTERFASSUNG.md](features/G_ABWESENHEIT_SELBSTERFASSUNG.md) | Abwesenheit, vom Mitarbeiter selbst gemeldet — sechs Wellen. **G1-G3 gebaut** (Mig 181/182, Endpunkte, Zeitsperre, Mindestbeschreibung, Verspaetungsweg). Enthaelt die acht Owner-Entscheidungen G-E1 bis G-E8. **G1-G6 vollstaendig gebaut.** |
| [features/P11_DOKUMENTATION_ALS_SYSTEM.md](features/P11_DOKUMENTATION_ALS_SYSTEM.md) | Doku als System: generiert statt gepflegt, drei Leser (Investor/Owner/Technik), Hilfebereich. 11 Wellen, W1 laeuft. **Owner-Grundprinzip fuer alle Projekte.** |
| [PLATTFORM_REGISTER.md](PLATTFORM_REGISTER.md) | Das Inventar: jede Flaeche, jeder Endpunkt, jede Faehigkeit, mit Beleg und Zustand. Grundlage der Investoren- und Bedienungsdoku. Wird per `dokuWaechter.test.js` gegen den Code gehalten. |
| [TEAM_UND_ROLLEN.md](TEAM_UND_ROLLEN.md) | Wen dieser Code verlangt: Fachbereiche, Erfahrungsstufen, Minimalbesetzung, Reihenfolge der Einstellung — gemessen, nicht geschaetzt. |
| [investoren/WIE_WIR_BAUEN.md](investoren/WIE_WIR_BAUEN.md) | Das Dokument zum Zeigen: Ingenieursstandard mit Belegen, inkl. eines Abschnitts „Was noch nicht steht“. **Intern**, bis der Owner ueber Veroeffentlichung entscheidet (DOK-E3). |
| [qualitaet/mutation/2026-08-14-rbac/](qualitaet/mutation/2026-08-14-rbac/README.md) | Archivierter Mutations-Prüfbericht (voller Lauf, 91,33 %, 1292 Mutanten). Datiert abgelegt, damit der nächste Lauf ihn nicht überschreibt. |
| [features/P12_MUTATION_AUFRAEUMEN.md](features/P12_MUTATION_AUFRAEUMEN.md) | Aufräum-Wellen M0–M6 für die 112 überlebenden Mutanten. **Vollständig abgeschlossen** (2026-08-15): 39/39 A-Fälle geschlossen, Aggregat 94,43 %. |
| [qualitaet/mutation/2026-08-15-rbac-nach-wellen/](qualitaet/mutation/2026-08-15-rbac-nach-wellen/README.md) | Der Lauf NACH den Wellen: 94,43 %, 72 Überlebende, null A-Fälle. Der Gegenbeleg zum 14.08. |
| [qualitaet/mutation/2026-08-14-rbac/TRIAGE.md](qualitaet/mutation/2026-08-14-rbac/TRIAGE.md) | Das Ergebnis von M0: alle 112 Fälle einzeln eingestuft und gegengelesen (39 A · 32 B · 41 C), die Wellenreihenfolge und acht Befunde — darunter, dass der nächtliche Mutations-Job nie gelaufen ist. |

---

## Stand der Arbeit

### Owner-Abschnitte 5–7

| Abschnitt | Spur | Stand |
|---|---|---|
| 5 CSV-Import | D | **fertig** — D1–D6 ✅. D6 (DSGVO ohne Konto) am 2026-08-13 nach Weg (a) gebaut; dabei kam heraus, dass die **Konto**-Anonymisierung seit jeher an sechs Schema-Fehlern scheiterte — repariert, siehe P10/D6. |
| 6 Live-Belegschaft | E | **fertig** — E1 gemessen · E2 Abwesenheit (Mig 177) · E3 Montage (Mig 178) · E4 Reiter · E5 Zustandsprotokoll (Mig 179, Trigger). Gates E2/E3/E5 gegen die echte DB belegt, E4 am gerenderten Markup. Plan: features/E_LIVE_BELEGSCHAFT.md |
| 7 Systemzeit | F | **fertig** — F1 kartiert (33 Fehler), F2 behoben, F3 Wächter mit Grundlinie 39. Landkarte: features/F1_SYSTEMZEIT_LANDKARTE.md |

> Der Owner hat angekündigt, dass es **Abschnitte bis 12** gibt. Sie sind noch nicht durchgegeben.

### Mutation Testing

| Datei | 2026-08-14 | **nach den Wellen** |
|---|---|---|
| `services/rbacService.js` | 95,87 % | **99,01 %** |
| `services/enterpriseSurfaceAccessService.js` | 89,29 % | **93,88 %** |
| `utils/orgContext.js` | 93,94 % | 93,94 % |
| `middleware/orgContext.js` | 86,96 % | **90,22 %** |
| `middleware/rbac.js` | 87,82 % | **88,46 %** |
| `utils/orgBoundary.js` | 82,20 % | **86,44 %** |

**Aggregat 91,33 %** bei 1292 Mutanten, Break-Schwelle 86 — gemessen im vollen
Lauf vom **2026-08-14**, Bericht archiviert unter
[qualitaet/mutation/2026-08-14-rbac/](qualitaet/mutation/2026-08-14-rbac/README.md).
Das ist ab jetzt die **einzige** Quelle für diese Zahlen; die früher zitierten
91,49 % / 95,04 % stammten teils aus Einzelläufen, teils aus einer Commit-Nachricht
ohne Bericht. **29 neue Testfälle** aus den Wellen 0–4, **null Produktionsfehler** —
kein Produktionscode angefasst, jeder Kill von Hand gegenkontrolliert.

Zusätzlich: drei Frontend-Wächter (api/test/frontendVerdrahtung.test.js) — tote
onclick-Handler, fehlendes CSRF, Sackgassen-Links. Sie haben den Multi-Agenten-Audit
(docs/FRONTEND_REIFEGRAD_AUDIT.md, 85 Befunde) unabhängig reproduziert.

---

## Wo es weitergeht *(Stand 2026-08-19)*

**Spur G ist vollständig — G1 bis G6 gebaut und belegt.**
**H1 ist gebaut und belegt** (Kundenansicht zeigt den Ausfall, nie die Art;
Deep-Link führt zur Zeile). Der Owner hat angekündigt, dass es Abschnitte bis 12
gibt; der nächste ist noch nicht durchgegeben.

### Was als Nächstes ansteht

**Arbeitsplan: [features/H_KUNDENANSICHT_UND_ORG_GRENZEN.md](features/H_KUNDENANSICHT_UND_ORG_GRENZEN.md)**
— **H1 und H2 sind gebaut** (2026-08-19/20) und in dieser Linie zusammengeführt.
Sie liefen parallel in getrennten Bäumen; am Code gab es keine Überschneidung.

> **Eine Lehre aus H1, die für jede weitere Spur gilt:** Die H1-Recherche hatte in
> zwei von zehn Fallstricken eine falsche Schema-Annahme — `worker_profiles(user_id)`
> sei nicht eindeutig. Gelesen worden war der *Index* in Mig 029:57-58; das inline
> `UNIQUE` steht in Zeile 35 derselben Datei. Wäre die Empfehlung ungeprüft gebaut
> worden, wäre der **Name** der Einsatzkraft aus der Kundenliste gefallen.
> **Jede Schema-Aussage gegen `pg_constraint` / `pg_indexes` der laufenden
> Datenbank prüfen, bevor darauf gebaut wird** — eine Migrationszeile belegt nur
> das, was auf ihr steht.

### H2 — was daraus geworden ist

**Die Entscheidung D-M1: Wächter bauen, die 80 nicht konsolidieren.** Begründet
hat sie sich selbst: die fünf Lücken lagen genau dort, wo **keine** der 80
Kopien stand. Eine Konsolidierung hätte keine einzige gefunden.

**Zehn geschlossene Lücken, nicht fünf.** Die fünf aus der Recherche (E-1 bis
E-5) plus fünf, die der Wächter beim ersten Lauf selbst fand:

| | Route | Was möglich war |
|---|---|---|
| E-1 | `POST /rate-cards/:id/{activate,archive}` | fremden Konditionsrahmen schalten, Sätze per `RETURNING *` zurückbekommen |
| E-2 | `POST /invoices/operational/:id/{issue,paid,void,correction}` | fremde Rechnungen stellen, auf bezahlt setzen, stornieren |
| E-3 | `POST /approvals/:id/{approve,reject}` + `/history` | fremde Freigaben entscheiden; Historie mit Antragsteller-/Freigeber-E-Mails lesen |
| E-4 | `POST /requisitions/:id/submit`, `PATCH /requisitions/:id` | fremde Ausschreibung einreichen |
| E-5 | `GET /organizations/:id/audit-log/recent-changes` | `old_values`/`new_values` samt Akteur-E-Mail fremder Entitäten |
| **E-6** | `GET /requisitions/:id/events` | vollständige Statushistorie samt Akteur-E-Mails einer fremden Ausschreibung |
| **E-7** | `GET /requisitions/:id/candidates` | Lieferantennamen, Prüfer-E-Mails und Match-Scores einer fremden Ausschreibung |
| **E-8** | `PATCH /organizations/:id` | **den Organisationsdatensatz einer fremden Firma ändern** — Name, `billing_email`, `tax_id`, `parent_org_id`. Die einzige `:id`-Schreibroute der Datei ohne `sameOrgParam`. |
| **E-9** | `POST /organizations/:id/departments` | eine Abteilung **in** einer fremden Organisation anlegen |
| **E-10** | `POST /requisitions/:id/comment` | einen Kommentar an eine fremde Ausschreibung schreiben |

E-8 ist der schwerste: `requirePermission` schützt dort nicht, weil es gegen
`req.orgId` prüft (die eigene Org, in der man Admin ist) und sein `explicitOrg`
nur `query.org_id`/`params.org_id` liest — der Platzhalter heißt hier `:id`.

**Der Wächter** (`api/test/orgGrenzenWaechter.test.js`, Register
`api/test/fixtures/orgGrenzen.json`) hat vier Schichten:

- **(A) Vollständigkeit** — jede Route mit Pfad-Platzhalter in einer abgedeckten
  Datei braucht ein Urteil. Aufgezählt wird über das **Router-Objekt**, nicht
  über den Quelltext. *Das hätte E-1 bis E-4 beim Anlegen gemeldet.*
- **(B) Verhalten** — Spion-Pool, der jede Abfrage mitschreibt: 403 · **kein**
  INSERT/UPDATE/DELETE · die Ressourcen-ID stand in der Abfrage · Org und
  Adressat stehen in derselben Anweisung. Dazu die **Gegenprobe** mit der
  eigenen Org, ohne die ein pauschales `return 403` bestünde — und die
  **Seitenprobe**: bei einer zweiseitigen Grenze (`org_id ODER supplier_org_id`)
  wird jede Hälfte einzeln belegt. Ohne sie bleibt eine halbierte Grenze
  unbemerkt; gemessen an einer Mutation in `contracts.js`, die der Wächter
  zunächst durchgelassen hat.
- **(B2) Torwächter** — für Flächen, die *eine* Eintrittsbedingung statt einer
  Grenze je Route haben. Geprüft wird, dass der benannte Middleware auf **jeder**
  Platzhalter-Route steht, dass er ohne die Voraussetzung mit dem erwarteten
  Status abweist **und** dass dabei nichts geschrieben wird. Der dritte Punkt ist
  der Grund, warum das kein Struktur-Test ist: ein Torwächter, der dasteht und
  `next()` ruft, fällt hier durch.
- **(C) Bestandsbuch** — jede der 82 Route-Dateien ist abgedeckt **oder** mit
  Grund ausgesetzt. Damit ist die ehrlichste Zahl sichtbar und wächst nicht mehr
  stillschweigend: **82 Dateien · 257 Routen verhaltensgeprüft · 123 belegte
  Ausnahmen · 0 Dateien ausgesetzt.** Die 14 des Owner Control Centers werden
  über ihren Einstiegspunkt geführt (Schicht B3), `matching.js` ist seit dem
  Abschluss von E-14 regulär geprüft. Eine Sperrklinke verhindert, dass die Zahl fällt.

  | Datei | geprüft | Ausnahmen | Grenzmodell |
  |---|---|---|---|
  | `rateCards` `invoices` `approvals` `requisitions` `organizations` | 43 | — | Org |
  | `contracts` `assignments` `vendorPool` `complianceDocs` `documentCenter` `timesheets` | 37 | — | Org |
  | `workers` `orgControlCenter` `suppliers` | 53 | — | Org, Grenze im Dienst-SQL |
  | `capacityExchange` | 17 | 1 | **Nutzer** |
  | `marketplace` | 22 | 8 | **Nutzer**, teils offen per Bauart |
  | `workerPortal` | 18 | — | **Nutzer** + Torwächter `requireWorkerRole` |
  | `listings` `mentoring` `slaSearchJobs` `companyProfile` `emergency` `offerAssets` `notifications` | 26 | 6 | **Nutzer** (`owner_id`, `mentor_id`/`mentee_id`, `owner_company_id`, `user_id`) |
  | `dataGovernance` `supplierPools` `strategicCollaboration` `subscriptionDocuments` `capacities` `integrations` `preferredVendors` | 21 | 4 | Org — vier davon erst durch E-17 bis E-20 gebunden |
  | `staffControlCenter` | — | 47 | **Staff**, org-übergreifend per Bauart; Torwächter `staffControlAccess` |
  | `support` | — | 14 | **Torwächter am Präfix** `supportAuth`; Zuschnitt aus dem Agenten-Datensatz (Warteschlange, Fallart, `data_scope`) |
  | `internalControlCenter` `productReleases` | — | 19 | **Plattform-Flächen**, org-übergreifend per Bauart |
  | `agencyPortal` `admin` `timesheetTemplates` `scim` `sso` | — | 33 | **Torwächter** je Fläche |
  | `ratings` `reputation` `search` `analytics` `profileVisibility` `dealFeedback` `auth` | — | 41 | **bewusst offen**: Marktplatz-Aggregation bzw. Token-Weg vor der Anmeldung |
  | `matching` | 4 | 1 | **Sichtbarkeitsregel des Marktplatzes** statt Org-Grenze (E-14) |
| `companyTimesheets` | 4 | — | Org, Grenze im Middleware `requireCompanySubmission` |
  | 28 Dateien ohne `:id`-Route | — | — | mit `routen: []` eingetragen — der Wächter **rechnet das nach** |

  **Zwei Namen, die mehr versprechen als sie halten** (im Register vermerkt, keine
  Lücke, aber der Anfang der E-11-Klasse): `requireAgencyRole` verlangt **keine**
  Agentur-Rolle — es sperrt nur `userRole === 'worker'` aus; ein Firmennutzer oder
  einer ganz ohne Rollenfeld kommt durch. Die echte Grenze dieser Flächen sind
  `rperm('worker.review')` und `requireOwnSubmission`. Und `requireAdmin` kennt
  einen Bypass `ADMIN_PANEL_OPEN`, der jeden Angemeldeten durchlässt — per
  Voreinstellung aus, in der laufenden Umgebung `false`, seit Welle G1.5 durch
  einen eigenen Test abgedeckt.
- **(D) Selbstprobe** — fünf absichtlich kaputte Mini-Router (Grenze vergessen ·
  Grenze **nach** dem Schreiben · Grenze auf dem falschen Parameter · halbierte
  zweiseitige Grenze · ungefilterte Liste) müssen gemeldet werden — und **zwei
  korrekte Router dürfen es nicht**, sonst wäre der Prüfer nur streng statt
  richtig. Dazu zwei Proben auf das Werkzeug selbst: der Schreib-Erkenner
  verwechselt `deleted_at`/`updated_at` in einem SELECT nicht mit einem
  Schreibvorgang, und `BEGIN`/`COMMIT` zählen nicht als Abfrage.

**Gegen den echten Bestand mutiert** — nicht nur gegen Mini-Router:

| Mutation | Wächter | Service-Test |
|---|---|---|
| Grenze mit `if (false && …)` abgeschaltet (der G6-Mutant) | **rot** | — |
| `sameOrgParam` aus der Kette entfernt | **rot** | — |
| zweiseitige Grenze halbiert (supplier-Zweig weg) | **rot** | — |
| JS-Filter einer Listen-Route entschärft | **rot** | — |
| Grenze auf den falschen Parameter gelegt (die E-5-Klasse) | **rot** | — |
| Org-Grenze aus `/requisitions/:id/events` entfernt | **rot** | — |
| `AND org_id = $3` aus dem UPDATE genommen, Parameter bleibt | grün *(dokumentierte Grenze)* | **rot** |
| Org-Bindung aus der Freigabe-Historie entfernt | grün *(dokumentierte Grenze)* | **rot** |

Die dritte Zeile ist die lehrreichste: sie war beim ersten Anlauf **grün**. Beide
Trägerspalten trugen immer denselben Besitzer, also fiel nicht auf, dass der
Handler nur noch einen Zweig prüft. Erst die Seitenprobe macht sie rot — ein
Wächter, den man nicht gegen den echten Bestand mutiert, misst seine eigene
Erwartung.

Das ist die **ehrliche Grenze** des Wächters: er beweist die Entscheidung des
Handlers und die Parameterübergabe, **nicht**, dass ein Service-SQL seine
`AND org_id`-Klausel behalten hat. Diese Hälfte tragen die Service-Tests, die
das abgesetzte SQL selbst befragen. Beide zusammen, keiner allein.

### Der wichtigste Fund der zweiten Welle: nicht jede Grenze ist eine Org-Grenze

`capacityExchange` und `marketplace` sind **nicht org-gebunden**. Ihre Grenze ist
der **Nutzer**: `supplier_company_id` / `requester_company_id` werden gegen
`req.session.userId` verglichen. Eine Probe, die nur die Organisation variiert,
hätte dort jede Verletzung durchgelassen — sie wechselt schlicht nicht die
Kennung, über die entschieden wird. Der Wächter kennt deshalb jetzt die
Dimension `identitaet: "org" | "nutzer"`.

Die Folge ist ein Produktbefund, kein Sicherheitsbefund: **ein Kollege derselben
Organisation kann die Einträge eines Teamkollegen nicht sehen oder bearbeiten.**
Dasselbe Muster wie D-M4 bei den Requisitions — zusammengefasst als **D-M5**.

### E-12 · Ein Lesezugriff schrieb in die fremde Zeile *(geschlossen)*

`GET /staffing-assignments/:id` rief `getAssignmentStaffingOverview`, und die
Funktion begann mit `recalcAssignmentStaffing` — einem
`UPDATE assignments ... WHERE id = $1` **ohne Org-Bindung**. Die
Zugehörigkeitsprüfung stand in der Zeile **danach**. Ein GET auf eine fremde
Einsatz-Kennung hat damit Mengen, Besetzungsstatus und Zeitstempel der fremden
Zeile angefasst und anschließend 404 geliefert: kein Datenabfluss, aber ein
Schreibvorgang über die Mandantengrenze, ausgelöst von einem bloßen Lesen.

Gefunden hat ihn der Wächter, nicht eine Recherche — und zwar genau über die
Zusicherung „auf dem Spion steht kein INSERT/UPDATE/DELETE". Ein reiner
Statuscode-Test hätte den 404 gesehen und nichts gemerkt.

**Geschlossen:** die Zugehörigkeit wird jetzt zuerst geklärt, und zwar im SQL
(`WHERE id = $1 AND supplier_org_id = $2`), dann wird gerechnet. Beleg:
`api/test/security/orgGrenzeLuecken.test.js`, Abschnitt E-12 — mit einer
Gegenprobe, die sicherstellt, dass die Neuberechnung für die **eigene** Org
weiterhin stattfindet, die Reparatur die Funktion also begrenzt und nicht
stilllegt.

### E-20 · Der DSGVO-Vollexport eines fremden Nutzers stand offen *(geschlossen)*

**Der größte Datenabfluss dieser Arbeit.** `GET /data-governance/export/user/:userId`
rief `exportUserDataFull(pool, req.params.userId)` — allein mit der Kennung aus
dem Pfad. Das Recht `data_governance.export` halten `owner` und `admin` **jeder**
Kundenorganisation, für die eigene Belegschaft.

Damit konnte ein beliebiger Org-Admin den vollständigen Datensatz eines
beliebigen fremden Nutzers ziehen: Mailadresse, Telefon, Anschrift, Steuernummer,
dazu alle Anzeigen, Anfragen, Bewertungen, Angebote, Einsätze und Stundenzettel.
Ein Werkzeug für die Art.-15-Auskunft, auf Dritte gerichtet.

Die **Geschwister-Route** `/export/org` in derselben Datei machte es von Anfang
an richtig: sie nimmt `req.orgId` und akzeptiert gar keine Kennung aus dem Pfad.
Zwei Wege, eine Datei, zwei Bauarten — das ist das Muster, an dem man diese
Klasse künftig zuerst sucht.

**Geschlossen** mit derselben Bindung wie E-17 (`istInMeinerOrg`, über
`is_active`): eigene Organisation ja, fremde 403 — und die Absage fällt **vor**
dem Laden der Personendaten, was der Test eigens prüft. Der Selbstexport läuft
über `GET /me/data-export` und bleibt unberührt.

### E-19 · Der Verteilplan einer fremden Ausschreibung war lesbar *(geschlossen)*

`getDistributionPlan(pool, requisitionId)` lud die Verteilstufen allein über die
Ausschreibungs-Kennung; `GET /supplier-pools/distribution/:requisitionId` trug
dazu nur `requireAuth`. Jeder Angemeldete konnte damit lesen, an **welche**
Lieferanten die Ausschreibung eines Wettbewerbers geht, in welcher Reihenfolge
und wo sie gerade steht — die Wettbewerbsinformation schlechthin in einem
Marktplatz.

Schwerer noch: `advanceDistribution` hängt am selben Plan. Ein Fremder konnte die
Ausschreibung eines Wettbewerbers auf die nächste Lieferantenstufe
**weiterschalten** und damit dessen Vergabe steuern.

**Geschlossen** über die Ausschreibung, wo die Organisation steht:
`JOIN requisitions r ON r.id = ds.requisition_id AND r.org_id = $2`. Ohne
Organisation im Kontext wird gar nicht erst gefragt.

### E-18 · Eine fremde DSGVO-Anfrage ließ sich schließen *(geschlossen)*

`completeDataRequest` band nur an Kennung und Status
(`WHERE id = $1 AND status IN (...)`). Das Tor davor prüft ausschließlich, ob der
Aufrufer das Recht in **seiner** Organisation hat. Ein Org-Admin konnte damit die
Auskunfts- oder Löschanfrage einer fremden Organisation als erledigt schließen,
ohne sie zu erfüllen. Der Schaden liegt nicht im Abfluss, sondern in der
**Frist**: die fremde Organisation glaubt, ihre Art.-15/17-Pflicht sei erledigt,
während die Uhr weiterläuft. **Geschlossen** mit `AND org_id = $4` im WHERE.

> **Drei Befunde in einer Datei.** E-17, E-18 und E-20 liegen alle in
> `dataGovernance.js`. Die Datenschutz-Werkzeuge waren durchgehend unbewacht,
> weil das Recht die eigene Organisation prüft, die Kennung im Pfad aber eine
> beliebige sein durfte. Wo eine Datei *ein* solches Muster zeigt, lohnt es,
> **jeden** Weg darin zu prüfen statt nur den gemeldeten.

### Warum diese drei gegen die echte Datenbank geprüft wurden

Ein Spion-Pool kann kein `WHERE` erzwingen. Die Zusicherung „das SQL enthält
`org_id = $n`" fällt damit in dieselbe Klasse wie ein Quelltext-Test — und die
Lehre aus Welle G6 lautet, dass `if (false && X)` die gesuchte Zeichenkette
weiterhin enthält.

Deshalb lief für E-18/E-19/E-20 dieselbe Anweisung gegen das echte
Postgres-Schema, in einer Transaktion mit `ROLLBACK`: **acht Prüfungen grün**.
Mit entfernter Bindung wurden **fünf davon rot** — Organisation A schloss die
DSGVO-Anfrage von B (`status = 'completed'`), las deren Verteilplan und schaltete
deren Vergabe weiter. Erst diese Gegenprobe macht aus einer Textzusicherung einen
Nachweis.

### Zwei Blindstellen des Wächters selbst

**Anonyme Torwächter sind unsichtbar.** `supportAuth` **und** `ownerControlAuth`
waren namenlose Closures. Für jede Strukturprüfung und jede Stapelspur
unsichtbar — der Wächter konnte nicht belegen, dass die einzige
Eintrittsbedingung der **gesamten** Support- bzw. **Owner-Fläche** überhaupt noch
montiert ist. Der Name ist jetzt Teil der Absicherung, nicht Kosmetik.

**Und eine dritte, die schwerer wog als beide.** Das Owner Control Center hat
**keine einzige** Platzhalter-Route — es adressiert alles über Abfrageparameter.
Damit war die privilegierteste Fläche des Systems für den gesamten Wächter
unsichtbar: `ownerControlCenter.js` stand mit `routen: []` im Register und galt
als abgedeckt, während seine 13 montierten Unterrouter mit 31 Wegen niemand
anfasste. Die neue Schicht **(B3)** prüft solche Flächen als Ganzes: jede Route
liegt unter dem Montagepfad des Tores, das Tor hängt **vor** allen Teilflächen,
und ohne Owner-Freigabe weist es mit 403 ab, ohne etwas anderes zu schreiben als
sein eigenes Zugriffsprotokoll. Vier Mutationen an der Montage — Teilfläche vor
dem Tor, Teilfläche daneben, Tor lässt durch, Tor wieder anonym — werden jede von
genau der Zusicherung rot, die sie fangen soll.

**Ein Helferfehler, der die neue Schicht wertlos gemacht hätte.** `listRoutesTief`
gab die **inneren** Pfade zurück (`/bootstrap`) statt der aufrufbaren
(`/owner-control/bootstrap`) — Express behält den rohen Montagepfad nicht, nur
die daraus gebaute Regexp. Eine Prüfung „liegt jede Route unter dem Tor?" hätte
gegen einen Pfad verglichen, den es nach außen gar nicht gibt: grün und blind.
Der Pfad wird jetzt zurückgewonnen — und wo der Montagepfad selbst einen
Platzhalter trägt, **weggelassen statt geraten**, weil ein falsches Präfix eine
ungeschützte Route als geschützt ausweisen würde. Beides hält eine eigene
Selbstprobe fest ((l) und (l2)).

**Präfix-Tore sahen aus wie Lücken.** `support.js` montiert sein Tor einmal auf
`/support` statt je Route. Das ist die **strengere** Bauart — auf einer neuen
Route kann man es nicht vergessen —, aber ein Test, der nur `route.stack` liest,
meldet die Fläche als ungeschützt. Genau die Falschmeldung, vor der die
Arbeitsregel warnt („positiv formulieren"). Der Wächter kennt jetzt beide Formen
(`findPrefixMiddleware`, Register-Feld `alsPraefix`) und prüft bei der Präfix-Form
zusätzlich, dass der Montagepfad **jede** Route darunter wirklich deckt.

### Merksatz für die Folgeprojekte

> **Wo ein Recht die eigene Organisation prüft, die Kennung im Pfad aber eine
> beliebige sein darf, steht die Tür offen.** Das ist die Klasse hinter E-17,
> E-18 und E-20 — und sie sieht in jeder Datei gleich aus: eine Route nimmt
> `req.orgId`, die Geschwister-Route daneben nimmt `req.params.<etwas>Id`.

### E-17 · Ein Org-Admin konnte einen FREMDEN Nutzer anonymisieren *(geschlossen)*

**Der schwerste Fund dieser Arbeit.** `data_governance.anonymize` halten laut
`services/rbacService.js:121` die Rollen **`owner` und `admin`** — also jede
Kundenorganisation für sich selbst, nicht die Plattform. `anonymizeUser` hat die
Organisation des Ziels aber **nie geprüft**: `canDeleteUser` sieht nur
Betriebsblocker (offene Einsätze, Stundenzettel, Rechnungen), alle am *Ziel*.

Damit konnte der Inhaber einer beliebigen Kundenorganisation das Konto eines
beliebigen **fremden** Nutzers unwiderruflich anonymisieren: E-Mail, Name,
Passwort-Hash und Personenbezüge überschrieben. Art.-17-Maschinerie auf einen
Dritten gerichtet. Er gibt keine Daten preis — er **zerstört** die eines Dritten.

**Geschlossen** an der Wurzel: `anonymizeUser` verlangt jetzt die Organisation
des Aufrufers und prüft die Mitgliedschaft des Ziels; die Vorbedingungsprüfung
(`/check`) ebenso, weil sie sonst verraten hätte, dass es den fremden Nutzer gibt
und was ihn blockiert. Die Abfrage nutzt **`is_active`, nicht `status`** — genau
der Fehler, an dem `utils/ownerCheck.js` seit jeher scheitert (E-11); hier nicht
wiederholt. Beleg: `orgGrenzeLuecken.test.js`, Abschnitt E-17.

> **Falls die Plattform je einen org-übergreifenden Weg braucht** (Support,
> Rechtsabteilung): der gehört hinter das Staff-Tor, nicht hinter eine
> Berechtigung, die jede Kundenorganisation selbst vergibt.

### E-16 · Fremde Mentoring-Sitzungen waren bewertbar *(geschlossen)*

`addFeedback` ermittelte `isMentor = mentor_id === userId` — und wer **weder**
Mentor noch Mentee war, galt damit stillschweigend als **Mentee**. Das UPDATE band
nur `WHERE id = $3`. Jeder Angemeldete konnte also Bewertung und Note auf eine
fremde Sitzung schreiben; die Note zählt auf den Ruf des Mentors.
**Geschlossen:** wer nicht beteiligt ist, bekommt `null`, und das UPDATE bindet
`AND (mentor_id = $4 OR mentee_id = $4)`.

### E-15 · Fremde Daten wurden GELÖSCHT *(geschlossen)*

`deleteSearchJob` räumte erst auf und prüfte dann den Besitzer:

```
DELETE FROM sla_search_matches WHERE search_job_id = $1     <- ohne Bindung
DELETE FROM sla_search_events  WHERE search_job_id = $1     <- ohne Bindung
DELETE FROM match_alerts       WHERE job_id = $1            <- ohne Bindung
DELETE FROM sla_search_jobs    WHERE id = $1 AND owner_company_id = $2
```

Ein `DELETE /sla/search-jobs/<fremde-id>` hat damit Treffer, Ereignisse und
Treffermeldungen einer fremden Suche gelöscht — und dem Aufrufer danach **404**
gemeldet. Der Bestohlene sah eine leere Suche und keinen Grund dafür. Dieselbe
Klasse wie E-12/E-13 (handeln, dann prüfen), nur in ihrer schlimmsten Form.
**Geschlossen:** Besitzprüfung zuerst, dann aufräumen.

### E-14 · Die Matching-Wege liefen ohne jede Bindung *(geschlossen)*

`findMatches` lud `SELECT * FROM demand_requests WHERE id = $1` — sonst nichts.
Jeder Angemeldete mit `requisition.view` konnte die Engine damit gegen einen
**fremden** Bedarf laufen lassen und erfuhr, dass es ihn gibt und welche
Lieferanten zu ihm passen. `logMatch` schrieb den fremden Vorgang zusätzlich
unter der **eigenen** Org ins ML-Protokoll — die Trainingsdaten des Rankings also
mit fremder Herkunft. Dasselbe galt für `matchCapacityToRequisitions`.

**Warum die Reparatur nicht „eigene Org" heißt.** Ein Bedarf wird im Marktplatz
*bewusst* an Lieferanten ausgespielt; eine reine Org-Grenze wäre das Ende des
Marktplatzes. Genau daran hing die Frage bisher als Owner-Entscheidung.

**Die Regel musste nicht erfunden werden — sie stand schon im Code.**
`capacityExchangeService` zeigt einen Bedarf genau dann, wenn er offen ist, noch
freie Plätze hat, keinen Ursprungsauftrag trägt und nicht abgelaufen ist
(`demandVisibilityWhere`, Zeile 538). `WHERE id = $1` erreichte dagegen auch
`closed`, `cancelled` und `fulfilled`. **Das Matching war die Hintertür zu genau
den Bedarfen, die die Sichtbarkeitsregel schützt** — und damit war es kein
Produktkonflikt mehr, sondern eine Inkonsistenz mit einer Regel, die die
Plattform längst getroffen hatte.

Geschlossen mit zwei Wächtern im Dienst, `darfBedarfSehen` und
`darfKapazitaetSehen`, die vor jeder Arbeit klären (Muster aus E-12/E-15). Wer
den Bedarf selbst gestellt hat, sieht ihn in jedem Status; der Anbieter sieht
sein Angebot auch privat; ein Kollege derselben Organisation ebenfalls.

**Gegen das echte Schema geprüft, mit der Zusicherung, die zählt:** über alle
angelegten Bedarfe hinweg zeigen Matching und Marktplatz derselben Agentur
**dieselbe Menge — null Abweichungen**. Dazu zwölf weitere Prüfungen, alle grün.
Sechs Mutationen — jede der vier Sichtbarkeitsbedingungen einzeln, die
Kapazitätsregel, und das Entfernen der Klärung — werden alle rot.

> Die drei Gegenproben wiegen hier schwerer als die Hauptproben. Eine Reparatur,
> die den Marktplatz zumacht, wäre schlimmer als der Befund gewesen.

### E-21 · `GET /matching/worker/:id` hat nie funktioniert *(geschlossen: entfernt, siehe P1-19)*

`matchWorkerToAssignments` liest `FROM workers`. **Diese Tabelle hat keine
Migration je angelegt** — gegen die laufende Datenbank gemessen antwortet
Postgres mit `42P01`. Der Weg endet seit jeher in 500. Kein Frontend, kein
E2E-Lauf und keine Dokumentationsseite ruft ihn auf.

Ob er entfernt oder auf `worker_profiles` gebaut wird, ist eine
Produktentscheidung (**P1-19**) und wurde hier nicht geraten: `worker_profiles`
hat weder `role` noch Koordinaten — die Bewertung der Engine liefe ins Leere und
erzeugte systematisch falsche Treffer.

**Was nicht gewartet hat: die Bindung.** Sie steht jetzt im SQL
(`AND supplier_org_id = $2`, sobald ein Betrachter bekannt ist). Ohne sie wäre
die Abfrage an dem Tag, an dem jemand eine `workers`-Tabelle anlegt, sofort ein
ungebundener org-übergreifender Lesezugriff — ein **schlafendes Leck**, das
niemand mit dem Anlegen der Tabelle in Verbindung gebracht hätte. Hintergrund-
und Cron-Läufe ohne Betrachter behalten ihr Verhalten; eine Bindung, die dort
greift, würde die Hintergrundarbeit stilllegen.

> **Merksatz.** Eine Grenze gehört ins SQL, **bevor** es die Tabelle gibt. Sie
> nachzurüsten heißt, sich daran erinnern zu müssen — und niemand erinnert sich
> beim Anlegen einer Tabelle an eine Abfrage, die seit Jahren fehlschlägt.

### E-13 · Dasselbe Muster, zweite Fundstelle *(geschlossen)*

`getStaffingChoiceSet` rief `refreshStaffingChoiceSetLifecycle` — und das
**schreibt** (`UPDATE assignment_staffing_choice_sets SET status = …`). Die
Zugehörigkeitsprüfung stand erst danach. Ein Zugriff mit fremder
Auswahl-Kennung hat deren Status fortgeschrieben, etwa auf
`options_presented`, und anschließend 404 geliefert.

Der Wächter hat es gefunden, **nachdem** E-12 dieselbe Klasse in einer anderen
Datei aufgedeckt hatte. Deshalb gibt es dafür jetzt eine eigene Zusicherung
statt eines Schalters: `schreibenNachGrenze` prüft die **Reihenfolge** — es
muss eine lesende Abfrage geben, die Kennung und Adressat zusammen trägt, und
sie muss **vor** dem ersten Schreibvorgang kommen. Genau das war bei E-12 und
E-13 verletzt. Geschlossen wie dort: Zugehörigkeit zuerst, im SQL.

### Der Wächter hatte selbst ein falsches Grün eingebaut

`catchAsync` (`utils/routeHandler.js:39-43`) ruft
`Promise.resolve(fn(…)).catch(next)` und gibt **sofort** zurück — die eigentliche
Arbeit läuft danach weiter. Die Probe hat also nachgesehen, bevor der Handler
fertig war, und hätte einen noch nicht erfolgten Schreibvorgang für einen
unterbliebenen gehalten: **ein falsches Grün für jede `catchAsync`-Route.**
Aufgefallen ist es, weil eine zusätzliche `await`-Runde im Spion eine zuvor
grüne Route auf „schreibt nichts" umschlagen ließ. Die Probe wartet jetzt,
bis der Handler wirklich zu Ende ist.

### P1-19 · `GET /matching/worker/:id` — entfernt statt repariert *(erledigt)*

Die Route rief `matchWorkerToAssignments`, und diese las `FROM workers` — eine
Tabelle, die **keine Migration je angelegt hat**. Gegen die laufende Datenbank
gemessen: `42703`. Der Weg endete seit jeher in 500; kein Frontend, kein
E2E-Lauf und keine Dokumentationsseite rief ihn auf.

**Entfernt, nicht gebaut** — aus drei Gründen, von denen der erste der stärkste
ist:

1. **Das Projekt hatte die Frage längst beantwortet.** Der SQL-Schema-Wächter
   führte den Fall selbst, mit Begründung: *„workers: Altbestand. Die
   Arbeiterdaten liegen in `worker_profiles`."* Es war kein unfertiges Feature,
   sondern ein Rest.
2. **Auf `worker_profiles` zu bauen wäre kein Umbenennen, sondern ein Feature.**
   Dort gibt es weder `role` noch Koordinaten; die Bewertung der Engine ruht auf
   genau diesen beiden (Rollen- und Geo-Treffer) und liefe ins Leere. CLAUDE.md
   verbietet spekulative Features ausdrücklich.
3. **Eine Route, die dauerhaft 500 antwortet, ist ein toter Pfad** — und war
   zugleich ein *schlafendes* Leck: am Tag, an dem jemand eine `workers`-Tabelle
   anlegt, wäre daraus ein ungebundener org-übergreifender Lesezugriff geworden.

Mit der Funktion fiel auch `getReputationScore` weg — sie hatte keinen anderen
Aufrufer.

**Der Wächter hat die Aufräumung erzwungen und bewiesen.** Der SQL-Schema-Wächter
meldet Einträge seiner Ausnahmeliste, die *nicht mehr auftreten*. Nach der
Entfernung nannte er von sich aus genau die drei, die jetzt stale waren:

```
services/matchingEngine.js::workers
services/matchingEngine.js::supplier_reputation.org_id
services/matchingEngine.js::supplier_reputation.overall_score
```

**Das ist der Beweis, der bei P1-17 fehlte.** Dort hatte ich eine Ausnahmezeile
gestrichen und nichts damit belegt — die Prüfung sah den Fall danach gar nicht
mehr. Hier fordert sie die Streichung selbst ein.

**Die Tests wurden nicht gelöscht, sondern umgestellt.** Neun Prüfungen in
`matchingEngine.coverage.test.js` prüften die Arithmetik einer Funktion, die in
Wirklichkeit nach ihrer ersten Abfrage abbrach — grün nur, weil der Mock-Pool
jede Tabelle bestätigt. An ihre Stelle tritt die Frage, die ab jetzt zählt:
**kommt der tote Weg zurück?** Vier Zusicherungen antworten darauf, gemessen an
einer simulierten Rückkehr — alle vier werden rot:

| Zusicherung | fängt |
|---|---|
| `matchingEngine.coverage`: „die Engine bietet die Funktion nicht mehr an" | die Funktion kehrt zurück |
| `matchingEngine.coverage`: „keine Abfrage liest mehr `FROM workers`" | das SQL kehrt zurück |
| `rbac-hardening`: „die Route gibt es nicht mehr" | die Route kehrt zurück |
| `sqlSchemaWaechter` | jede Abfrage gegen eine unbekannte Tabelle |

Die Sperrklinke des Org-Registers sinkt dabei von 257 auf 256 — bewusst und
begründet im Register vermerkt: **eine Route, die es nicht mehr gibt, kann nicht
geprüft werden.**

### P1-20 · Der Statuswechsel verlangte weniger als die Titeländerung *(geschlossen)*

`POST /requisitions/:id/transition` trug **keine** Berechtigungsprüfung.
`requireScope("write:requisitions")` sieht nach einer aus — es prüft aber
ausschließlich API-Key-Scopes und lässt **jede Sitzung ungefragt durch**
(`apiKeyAuth.js:153`: `if (!req.isApiKeyAuth) return next();`). Für einen
angemeldeten Nutzer stand dort also nur `requireAuth` plus die Org-Grenze.

Das Ergebnis war eine **umgekehrte Rangfolge**: ein Feld zu ändern verlangte
`requisition.edit`, den Status auf `CANCELLED` zu setzen verlangte nichts. Jede
Mitgliedschaft der Organisation — bis hinunter zu `viewer` — konnte die
Ausschreibung durch ihren gesamten Lebenszyklus schieben und sie beenden.

**Dass das kein Vorsatz war, sagt der Katalog.** `requisition.cancel` steht dort
seit jeher, mit einer **eigenen, engeren** Rollenliste (`rbacService.js:30` —
`owner, admin, program_manager, hiring_manager`, ohne `recruiter`) — und war an
**keiner einzigen Stelle** verdrahtet. Die Berechtigung fürs Stornieren
existierte, sie hing nur an nichts. Damit war es keine Produktfrage mehr,
sondern eine unverdrahtete Wache.

Drei Routen trugen die Lücke; sie sind unterschiedlich geschlossen, weil sie
unterschiedlich schwer wiegen:

| Route | jetzt | Begründung |
|---|---|---|
| `/transition` | `requisition.edit`, für `CANCELLED` zusätzlich `requisition.cancel` | Stornieren beendet den Vorgang — der Katalog unterscheidet das seit jeher |
| `/submit` | `requisition.edit` | landet über `submitForApproval` in derselben `transitionStatus` |
| `/comment` | `requisition.view` | **bewusst weiter**: Kommentieren ist Zusammenarbeit, keine Bearbeitung |

Bei `/comment` wäre `requisition.edit` der Fehler in die andere Richtung
gewesen: es hätte Einkauf, Disposition und Lieferantenbetreuung ausgesperrt, die
genau dafür da sind. Geschlossen wird trotzdem etwas — wer **gar keine**
Requisitions-Berechtigung hat (Arbeiter, Lieferantenkonten), schreibt nicht mehr
in die Ausschreibungen einer fremden Organisation.

Drei Mutationen — Wache auf `/transition` entfernen, die Storno-Sonderprüfung
entfernen, die Kommentar-Wache entfernen — machen die Tests alle rot.

### Die vierte anonyme Wache — und diesmal die zentrale

`requirePermission` gab eine **namenlose** Closure zurück. Das ist derselbe Fund
wie bei `supportAuth`, `ownerControlAuth` und dem Präfix-Tor — nur trifft er hier
die Berechtigungsprüfung der **gesamten Plattform**.

Die Folge ist im Bestand zu besichtigen: `rbac-hardening.test.js` konnte nicht
fragen *„trägt diese Route eine Berechtigungsprüfung?"*, sondern nur Middleware
**zählen** — `assert.ok(names.length >= 2)`. Eine Route ohne Prüfung sah damit
aus wie eine mit. **Genau deshalb blieb P1-20 so lange unentdeckt.**

`requirePermission` und `requireRole` sind jetzt benannt. Erst dadurch ist der
neue Wächter überhaupt formulierbar: *jede schreibende Requisitions-Route trägt
`requirePermissionMiddleware`* — eine Regel statt einer Aufzählung.

> **Merksatz, viermal in einer Welle bestätigt:** Ein Middleware ohne Namen ist
> für jede Strukturprüfung unsichtbar. `return async function name(req, res, next)`
> statt `return async (req, res, next)` ist Teil der Absicherung, nicht Kosmetik.

### M0-B9 · Die laufende Datenbank war weiter als jede Migration *(geschlossen)*

Der rote Test aus Welle G4b hat **richtig gemeldet und wurde falsch
verstanden.** Zwei Dinge lagen übereinander.

**Die Prüfung suchte eine Schreibweise, die Postgres nicht ausgibt.** Sie suchte
die erlaubten Werte als `'info'` — mit Anführungszeichen — im Text des
Constraints. Postgres rendert ihn aber je nach Schreibweise unterschiedlich; in
der Array-Form (`= ANY ('{a,b}'::text[])`) steht **kein einziger** Wert in
Anführungszeichen. Die erste Zusicherung schlug also schon bei `info` fehl — und
verdeckte damit genau den Befund, den die zweite finden sollte.

**Der Befund selbst:** `notifications.severity` wird an genau einer Stelle
definiert (Migration 019, vier Werte). Die laufende Datenbank erlaubte **fünf**.
Gesucht in allen 184 Migrationen, in `init.sql`, in den Seeds: **keine Quelle.**
Der fünfte Wert ist an `sql/` vorbei entstanden.

Das ist der Kern, nicht der fehlende Wert: **das Schema war aus `sql/` nicht mehr
reproduzierbar.** Eine frische Installation und die laufende Datenbank hätten
sich unterschieden — und nichts hätte es gemeldet, weil der eine Test, der es
gekonnt hätte, aus einem anderen Grund rot war und deshalb als bekannt-rot galt.

Zurück statt vor, weil `urgent` keinen Nutzer hat: kein Dienst schreibt es dorthin,
keine der 765 Zeilen trägt es, das Frontend kennt es nicht.
`match_alerts.severity` ist eine **andere** Spalte und benutzt `urgent` sehr wohl.
Migration `185`, mit Sicherheitsnetz und Rollback im Kopf; die Prüfung liest die
Werte jetzt **aus** statt sie zu suchen und vergleicht **Mengen in beide
Richtungen**. Gemessen: Drift wieder hergestellt → Test wird rot und nennt
`urgent` beim Namen.

> **Ein rotes Testergebnis, das man kennt, ist ein blinder Fleck.** Dieser Test
> war seit Wochen rot und galt als bekannt — also hat niemand mehr hingesehen,
> was er eigentlich sagt. Er sagte die ganze Zeit etwas anderes als das, wofür
> man ihn hielt.

> **Übertragbar:** Ein Test, der eine Zusicherung als Zeichenkette im generierten
> SQL sucht, prüft die Schreibweise des Datenbanksystems mit — und die ändert
> sich, ohne dass jemand etwas falsch macht. Werte auslesen, Mengen vergleichen.

### P1-21 · Das Wachregister — welche Wache gehört auf welchen Weg *(gebaut)*

Erst als fünf Wächter-Erzeuger Namen hatten, liess sich die Frage überhaupt
stellen. Das Ergebnis ist ein Register nach dem Vorbild des Org-Grenzen-Registers:
**415 schreibende Wege, alle mit Urteil und Begründung.**

| Wachart | Wege | was sie trägt |
|---|---|---|
| `berechtigung` | 161 | `requirePermission` / `requireRole` / `requireInternalPermission` |
| `eigene-daten` | 67 | kein fremdes Ziel erreichbar (`/me`, MFA, eigenes Profil) |
| `besitz` | 65 | Bindung am Vorgang — vom Org-Grenzen-Wächter **ausgeführt** geprüft |
| `flaechentor` | 64 | eine Eintrittsbedingung je Fläche |
| `cron` | 28 | Zeitplan-Geheimnis |
| `oeffentlich` | 19 | bewusst ohne Mandant |
| `inline-rolle` | 10 | Rolle oder Geheimnis im Handler |
| `BEFUND` | 1 | P1-22 |

**Die wichtigste Entscheidung war, was der Wächter NICHT fordert.** Hätte er
pauschal `requirePermission` verlangt, wären es 254 Falschmeldungen gewesen —
und ein Wächter, der falsch meldet, wird abgeschaltet. Genau davor warnt die
Arbeitsregel dieser Welle. Er verlangt stattdessen ein **Urteil mit Begründung**
und prüft die `berechtigung`-Klasse **ausgeführt**: der Aufruf läuft mit einem
Rollenschlüssel, den der Katalog nicht kennt — wer trotzdem durchkommt, hat
keine wirksame Prüfung. 161 Wege, 161 Proben.

Vier Mutationen werden rot: Wache von einer Route nehmen · neue schreibende
Route ohne Registereintrag · Urteil ohne Begründung · Route auf eine
schwächere Wachart zurücksetzen.

**Der fünfte anonyme Wächter.** `requireInternalPermission` trägt die gesamte
interne Steuerungsfläche und gab eine namenlose Closure zurück. In der
Bestandsaufnahme fielen ihre Routen als „ohne Wache" auf, obwohl sie bewacht
sind — dieselbe Blindstelle wie bei `supportAuth`, `ownerControlAuth`,
`requirePermission` und dem Präfix-Tor. **Fünf in einer Welle.**

### N-1 · nginx sendet eine gefaltete Kopfzeile *(geschlossen)*

**Beim Verdrahtungs-Check der Guthabenseite gefunden — und der Fund ist größer
als die Seite.** `nginx/nginx.conf` schrieb die Content-Security-Policy über elf
Zeilen: lesbar, ordentlich eingerückt, und falsch. nginx gibt den Wert
**verbatim** aus; über die Leitung ging eine **gefaltete** Kopfzeile (obs-fold).

RFC 7230 §3.2.4 hat diese Faltung abgeschafft — Sender dürfen sie nicht
erzeugen, Empfänger **müssen** die Nachricht ablehnen. Gemessen: Nodes
Standard-HTTP-Parser bricht mit *„Parse Error: Invalid header value char"* ab und
kann damit **keine einzige** Antwort dieses Servers lesen.

> **Browser und curl sind nachsichtig — und genau deshalb hat es überlebt.**
> Der Defekt betraf jede Antwort der Plattform, war aber nur zu sehen, wenn ein
> strenger Client zuhörte. Aufgefallen ist er erst, als ein Node-Prozess die API
> sprechen sollte.

Behoben (Wert in einer Zeile), gehalten von `api/test/nginxKopfzeilen.test.js`.

**Am 2026-08-21 auch scharf geschaltet.** Der laufende Container mountet
`nginx/nginx.conf` aus dem **Haupt-Checkout**, nicht aus diesem Worktree — die
Korrektur wurde dort auf Zuruf des Owners nachgezogen (genau diese eine Zeile,
sonst nichts; `diff` vorher gezeigt) und nginx neu geladen. Gemessen danach: ein
Aufruf mit Nodes **strengem** Standard-Parser liefert 200 und 525 Bytes, wo er
vorher abbrach; im Wert der Kopfzeile steht kein Zeilenumbruch mehr.

Die Aenderung liegt im Haupt-Checkout **uncommitted** — beim Merge dieses
Branches kommt derselbe Inhalt regulaer nach. Wer vorher `git checkout` darauf
anwendet, holt sich den Defekt zurueck.

### P1-22 · Guthaben nur gegen Zahlung — Owner-Entscheidung Stripe *(geschlossen)*

Bei der Bestandsaufnahme zu P1-21 aufgefallen: `POST /credits/purchase` trug nur
`requireAuth` und schrieb ein **bepreistes** Paket gut, ohne jeden Bezahlschritt.
Kein aktives Leck, weil `spendCredits` keinen Aufrufer hatte — aber ein
schlafender Defekt, der am Tag der ersten Ausgabe aufgewacht wäre.

**Der Owner hat entschieden: Stripe.** Der Kauf geht jetzt denselben Weg wie die
Abos — Sitzung erzeugen, Kunde zahlt, der signaturgeprüfte Webhook schreibt gut.
Die Aufteilung in zwei Funktionen ist die eigentliche Absicherung: es gibt keine
Funktion mehr, die „gutschreiben" heißt und ohne Zahlungsnachweis aufrufbar ist.
Ohne gesetzten Stripe-Schlüssel antwortet die Route **503** statt auf einen
kostenlosen Ersatzweg zu fallen — dieser Ersatzweg *war* der Befund.

**Migration 186** legt den Riegel dorthin, wo Gleichzeitigkeit entschieden wird:
ein eindeutiger, partieller Index auf der Kauf-Referenz. Stripe stellt Webhooks
*wiederholt* zu — Zusicherung des Anbieters, kein Fehler. Eine Idempotenz aus
„erst SELECT, dann INSERT" hält zwei gleichzeitige Zustellungen nicht auf.

> **Der Lauf gegen die echte Datenbank hat einen echten Fehler gefangen — meinen.**
> Die erste Fassung schrieb über `earnCredits` gut, und diese Funktion erhöht
> **zuerst** den Saldo und schreibt **danach** die Buchung. Der Index feuerte also
> erst, als das Guthaben schon oben war: eine wiederholte Zustellung kam auf den
> **doppelten** Stand. Die Mock-Tests waren dabei grün — ein Mock kennt keine
> Indizes. Repariert: die Buchung ist der erste Schritt, beides in einer
> Transaktion.

Sechs Prüfungen gegen das echte Schema, neun gegen Mocks. Was **nicht** gebaut
ist, weil es Betrieb ist und nicht Code: die Schlüssel und die
Erfolgs-/Abbruchseite. Solange nichts gesetzt ist, antwortet die Route 503 —
niemand bekommt etwas geschenkt.


> **Das Muster hinter P1-19 und P1-22:** Ein halb gebautes Feature ist kein
> halbes Risiko — es ist ein volles, das auf sein fehlendes Stück wartet. Wo man
> es nicht fertigstellen darf und nicht entfernen will, gehört ein Draht daran,
> der beim Fertigstellen reißt.

### D-M4 / D-M5 · Zusammenarbeit innerhalb einer Firma *(entschieden und umgesetzt)*

Beide Fragen stellten dasselbe an zwei Stellen: **darf eine Kollegin derselben
Organisation den Vorgang eines Teammitglieds bearbeiten?** Zusammen mit E-11 war
es *eine* Entscheidung für drei Flächen — der Owner hat sie am 2026-08-20
getroffen: **ja, bis zur Org-Grenze und nicht weiter.**

**D-M4 hat der Code selbst beantwortet.** `updateRequisition` band mit
`WHERE id = $1 AND created_by = $2` — eine *vierte* Einschränkung über drei
bereits vorhandenen (`requireScope`, `requirePermission("requisition.edit")`,
`assertOrgOwnership`). Dass sie kein Vorsatz war, zeigt der Nachbar: **keine
andere Mutation an derselben Zeile kennt sie.** `transitionStatus` schreibt mit
`WHERE id = $1` — eine Kollegin durfte die Ausschreibung also **stornieren**,
aber keinen Tippfehler im Titel korrigieren. Eine Regel, die den folgenschweren
Weg offen lässt und den harmlosen sperrt, ist keine Regel. `created_by` bleibt
jetzt, was es ist: Herkunft, nicht Besitz. Die Bindung liegt im SQL
(`AND org_id = $2`), nicht nur im Handler davor.

**D-M5 waren 17 Stellen**, 13 in den Routen (`marketplace` 10,
`capacityExchange` 3) und 4 in `marketplaceService`. Alle prüften **bloße
Namensgleichheit** (`supplier_company_id !== req.session.userId`). Alle fragen
jetzt `canAccessAsOwner` — den Helfer, der genau diese Frage beantwortet und sie
seit E-11 wirklich trägt. Der direkte Vergleich bleibt der Kurzschluss: der
häufigste Fall kostet weiterhin keine Abfrage.

**Der Beweis hat wieder die Form, die eine Weitung haben muss.** Neun Prüfungen
gegen das echte Schema, einmal gegen den Stand davor und einmal danach:

| | vorher | nachher |
|---|---|---|
| Kollege ändert fremde Ausschreibung (D-M4) | **rot** | grün |
| Kollegin der Kundenfirma nimmt Angebot an (D-M5) | **rot** | grün |
| Kollegin der Agentur zieht Angebot zurück (D-M5) | **rot** | grün |
| Arbeiter derselben Firma | grün (verweigert) | grün (verweigert) |
| fremde Organisation | grün (verweigert) | grün (verweigert) |
| Kundenseite zieht Angebot der Gegenseite zurück | grün (verweigert) | grün (verweigert) |
| ohne Org im Kontext wird nicht geschrieben | grün | grün |

**Nur Gewährungen ändern sich, keine einzige Verweigerung** — dieselbe Aussage
wie bei E-11. Besonders wichtig ist die vorletzte Zeile: die Weitung läuft
entlang der *Organisation*, nicht entlang des Vorgangs. Die beiden Marktseiten
bleiben getrennt.

Dauerhaft festgehalten in `test/integration/kollegenZugriff.flow.test.js`
(7 Prüfungen) — bewusst **ohne** `./helpers.js`, weil dessen `createPool` den
gesamten Express-Aufbau mitimportiert; diese Probe ruft nur zwei
Dienstfunktionen. Ein Mantel bildet den inneren Transaktionsblock von
`withTransaction` auf Sicherungspunkte ab, sonst wäre es ein verschachteltes
`BEGIN` in der Probe-Transaktion.

### Zwei Beobachtungen am Rand, die jemand aufgreifen sollte

**P1-20** — bei D-M4 aufgefallen, inzwischen **geschlossen** (eigener Abschnitt
oben): `POST /requisitions/:id/transition` trug keine Berechtigungsprüfung.

**M0-B9 — ein roter Integrationstest aus Welle G4b.**
`g4bKundenMeldung.flow.test.js` → „die erlaubten severity-Werte stimmen mit der
Konstante überein" schlägt fehl (`expected: true, actual: false`):
`ERLAUBTE_SEVERITY` und die Datenbank sind auseinandergelaufen. **Nicht** aus
dieser Welle — nachgewiesen: keiner der H2-Commits berührt
`workerAbsenceService`, `notificationMatrix` oder diesen Test. Er ist der einzige
rote in der Integrationssuite (285 von 286 grün).

### Eine Falle dieser Umgebung, teuer gelernt

`docker inspect` zeigt: **`…\12_tempconnect_docker(D)\api` ist als Bind-Mount auf
`/app` gelegt.** Jedes `docker cp … tempconnect_api:/app/…` schreibt damit
**direkt in den Arbeitsbaum des Haupt-Repos** — nicht in den Container. Bei den
Schema-Proben dieser Welle ist genau das passiert: sechs Dateien unter `api/`
wurden dort überschrieben und vier Hilfsdateien abgelegt.

Wiederhergestellt mit `git checkout -- api/` plus Löschen der vier Streudateien;
`docs/PILOT_GO_LIVE_TODOS.md` und `support-ops-dist/index.html` blieben
unangetastet — sie liegen außerhalb des Mounts und stammen nicht aus dieser
Arbeit.

> **Regel für Prüfungen gegen die echte Datenbank:** den zu prüfenden Code in ein
> **nicht gemountetes** Verzeichnis des Containers kopieren (`/tmp/wt`, dazu
> `ln -s /app/node_modules`) und von dort starten. Niemals nach `/app`. Der Mount
> ist unsichtbar, solange man nicht danach fragt — und `docker cp` warnt nicht.

### E-11 · `canAccessAsOwner` hat nie funktioniert *(geschlossen)*

Die Prüfung hatte **zwei voneinander unabhängige Fehler**, von denen jeder
einzelne schon genügt hätte, den Organisations-Zweig nie greifen zu lassen:

1. Sie fragte `WHERE ... AND status = 'active'`. Die Spalte heißt `is_active`
   und ist ein Wahrheitswert — `status` gibt es in `org_memberships` nicht.
   Postgres antwortete mit `42703`, die Abfrage warf, und der `catch` machte
   daraus ein stilles `false`.
2. Sie verglich `WHERE org_id = $1` mit dem übergebenen Eigentümer. Alle **zehn**
   Aufrufstellen übergeben aber eine **Nutzer**-Kennung
   (`requester_company_id`, `owner_company_id`, `supplier_company_id` — allesamt
   Fremdschlüssel auf `users`, gegen das laufende Schema geprüft). Eine
   Nutzer-Kennung steht nie in `org_memberships.org_id`.

Wirksam war also ausschließlich der direkte Vergleich: **genau ein Mensch** —
der, der die Zeile angelegt hat — konnte je auf sie zugreifen. Bei Urlaub,
Krankheit oder Personalwechsel war die Bedarfsmeldung, der Suchauftrag oder die
Dealakte des Unternehmens für das Unternehmen verloren.

Dass es anders **gemeint** war, steht im Quelltext: `offerAssets.js:127` erklärt
ausdrücklich, `canAccessAsOwner` berücksichtige „auch Organisations-Member und
nicht nur den direkten Owner". Der Kommentar beschreibt seit Jahren eine
Fähigkeit, die es nie gab.

**Warum es so lange unsichtbar blieb — der `catch` war der eigentliche Fehler.**
Ein `catch { return false }` um eine Sicherheitsabfrage sieht vorsichtig aus und
ist es auch: es schließt zu. Genau deshalb hat niemand etwas gemerkt — **eine
kaputte Abfrage ist von einer verweigerten Berechtigung nicht zu unterscheiden,
wenn beide dasselbe antworten.** Fail-closed bleibt richtig, aber nicht still:
der Fehler wird jetzt protokolliert.

**Wo die Weitung endet — und warum das der heikle Teil war.** Diese Reparatur
öffnet den Zugriff vom einen Menschen auf seine Kolleginnen und Kollegen. Sie
darf ihn deshalb nicht weiter öffnen als gemeint: `org_memberships` führt nicht
nur die Belegschaft einer Organisation, sondern auch ihre **Arbeiter**
(`role_key = 'worker'` — gegen den Bestand gemessen: **33 Zeilen**). Eine Regel
„gleiche Organisation genügt" hätte einem Zeitarbeiter die Suchaufträge,
Angebote und Dealakten seiner Agentur geöffnet. Aus einer wirkungslosen Prüfung
wäre ein **echtes Leck** geworden.

Der Ausschluss ist keine neue Erfindung: die Plattform trennt die Arbeiterwelt
ohnehin durchgehend (`hidden_worker` auf allen Flächen, `requireCompanyOrg`
sperrt `org_type = 'worker'`, `workerService.js:441` benutzt `role_key = 'worker'`
als genau dieses Kennzeichen).

**Der Beweis hat die Form, die eine Weitung haben muss.** Dieselben elf
Prüfungen gegen das echte Schema, einmal gegen die alte und einmal gegen die
neue Fassung:

| | alte Fassung | neue Fassung |
|---|---|---|
| Kollegin derselben Organisation darf handeln | **rot** | grün |
| Eigentümerin selbst | grün | grün |
| Arbeiter derselben Organisation | grün (verweigert) | grün (verweigert) |
| ruhende Mitgliedschaft | grün (verweigert) | grün (verweigert) |
| fremde Organisation | grün (verweigert) | grün (verweigert) |
| Zeile eines Arbeiters, Belegschaft fragt | grün (verweigert) | grün (verweigert) |
| nur in einer *anderen* Org Mitglied | grün (verweigert) | grün (verweigert) |

**Genau die zwei Gewährungen ändern sich, keine einzige Verweigerung.** Das ist
die stärkste Aussage, die eine Weitung über sich machen kann.

**Ein Nebenbefund, der wichtiger ist als er aussieht.** Der SQL-Schema-Wächter
*hatte* Fehler 1 gefunden — er stand dort auf der Liste bekannter Befunde. Die
Reparatur hat ihn aber aus dessen Sichtfeld geschoben: `sqlSchemaWaechter` prüft
Spalten nur bei **einrelationalen** Anweisungen (`relationen.length !== 1 →
übersprungen`), und die neue Fassung verbindet drei Relationen. Ein Tippfehler in
einem Spalten- oder Aliasnamen wäre dort ab sofort unsichtbar gewesen.

> **Merksatz.** Eine Reparatur kann eine Prüfung *blind* machen, ohne sie
> anzufassen — indem sie den Code aus deren Sichtfeld schiebt. Wer eine Zeile von
> einer Ausnahmeliste streicht, muss belegen, dass die Prüfung den Fall danach
> wirklich sieht. Bei mir tat sie es nicht.

Geschlossen mit der zweiten Schicht, die das Projekt für genau diesen Fall
vorsieht (`test/integration/ownerCheck.flow.test.js`): ein billiger Lauf gegen
die echte Datenbank mit erfundenen Kennungen. Null Treffer — aber Postgres
**parst und plant** die vollständige Abfrage. Ein Pool-Mantel reicht den Fehler
an den Test durch, statt ihn verschlucken zu lassen. Gemessen: die Rückmutation
auf `status` macht ihn rot, mit `42703: column meine.status does not exist` im
Klartext.

### Gegen die echte Datenbank geprüft (was ein Mock nicht zeigen kann)

- `rate_cards` und `approval_requests`: **`rls=false`, 0 Policies** — für E-1 und
  E-3 gab es in **keinem** Deployment einen Backstop in der Datenbank. Die
  Vermutung des Plans ist damit gemessen, nicht mehr vermutet.
- **Migration 117 existiert nicht.** `docs/security/TENANT_ISOLATION_MODEL.md`
  verweist 28 Tabellen auf sie als „nächsten Schritt"; die Datei wurde nie
  geschrieben (`sql/migrations/` springt von 116 auf 118).
- `audit_log`: 2711 Zeilen, davon **1782 ohne `org_id`**; von 920 Entitäten
  wären **416** unter dem strikten Filter von E-5 unsichtbar. Das ist heute
  folgenlos — die org-gebundene Route hat **keinen** Aufrufer (das Admin-Panel
  ruft die plattformweite Fassung). Es ist aber die Zahl, die zur offenen
  Null-Politik-Entscheidung gehört.

### Erledigt am 2026-08-19

| Punkt | Ergebnis |
|---|---|
| **H1 Kundenansicht** | Der Statusbadge war ein **binäres Ternär**: ein neuer Zustand hätte nicht gefehlt, sondern als grünes „Im Einsatz" das Gegenteil behauptet. Deshalb Renderer zuerst, dann das Feld. `getCompanyLiveWorkforce` gibt die Zeile jetzt über eine **Positivliste** heraus statt roh — vorher wäre die nächste SELECT-Spalte ohne Zutun beim Kunden gelandet. `?einsatz=` wurde von der Zielseite gar nicht gelesen und die Zeile trug keine `assignment_id`; beides gebaut. Wächter: `h1KundenansichtAusfall.test.js` (32), `integration/h1KundeSiehtAusfall.flow.test.js` (13). |
| **Demo-Compose** (`cde6c42`) | War **nie** startfähig (nicht „seit P0-08"): Die Datei entstand einen Monat nach dem Guard, den sie verletzt. Schwerer: Sie wird **ausgeliefert** und öffnete beim Kunden alle Plan-Gates — der CI-Wächter dagegen durchsucht nur `.env*`. Dazu der `release-package.sh`-Fehler, durch den `.claude/` ins Artefakt kam (die `EXCLUDE_LIST` galt nur im Fallback-Zweig). Wächter: `composeStartfaehig.test.js` |
| **NOT_AUTH** (`61d2091`) | Nicht „alle Portalseiten", sondern **genau die G5-Seite**. Und kein Konsolen-Problem: Sie blieb für Abgemeldete **dauerhaft weiß**, ohne Weg zum Login — ausgerechnet der Notfallweg. Siebenmal kopiert, beim achten Mal vergessen. |
| **H2 — Mandantengrenzen** | Die Entscheidung **D-M1 ist gefallen: Wächter, nicht konsolidieren.** Die fünf Lücken des Plans sind geschlossen — **und der Wächter fand über alle 82 Route-Dateien hinweg zwölf weitere**. Siebzehn Lücken, nicht fünf. Die schwersten kamen zuletzt und lagen zu dritt in **einer** Datei: DSGVO-Vollexport eines Fremden (E-20), fremdes Konto anonymisieren (E-17), fremde Betroffenenanfrage schließen (E-18); dazu der Verteilplan fremder Ausschreibungen, lesbar **und weiterschaltbar** (E-19). Alle geschlossen und gegen das echte Schema bewiesen, ebenso E-14 (Matching) und E-11 (`canAccessAsOwner`, das seit jeher nur den einen anlegenden Menschen durchliess). **Kein offener Sicherheitsbefund mehr** — **kein offener Punkt mehr** — P1-22 ist mit der Owner-Entscheidung Stripe umgesetzt, die Oberflaeche steht, und der beim Pruefen gefundene nginx-Befund N-1 ist geschlossen. Offen ist nur noch der Betrieb: die beiden Stripe-Schluessel setzen. Details unten. |

### Zwei Blocker, die nur der Owner lösen kann

**Die gesamte CI läuft seit dem 2026-06-24 nicht.** Selbst über die GitHub-API
geprüft: alle Jobs enden mit `Schritte: 0`, GitHub sagt wörtlich *„The job was
not started because your account is locked due to a billing issue."* Kein
einziger erfolgreicher Lauf seit zwei Monaten.

**`mutation.yml` liegt nicht auf dem Default-Branch.** GitHub feuert `schedule`
nur dort. `main` steht auf `fd9a3ab` (01.06.) und ist **400 Commits zurück**;
`gh workflow list` kennt nur `ci.yml`. Der frühere Abschluss-Vermerk zu M0-B1
(auch in `TRIAGE.md:127`) hat den Branch nicht geprüft, der die Sache
entscheidet. Die dokumentierten Ursachen (Zeitgrenze 90 min, `incremental`) sind
dagegen längst behoben — `timeout-minutes: 180`, sechs parallele Matrix-Jobs.

## Der Plan fuer die naechsten Sitzungen

**Aktiv: [features/K_BOUNTY_AUSZAHLUNG_MONATSPLANUNG.md](features/K_BOUNTY_AUSZAHLUNG_MONATSPLANUNG.md)**
— Owner-Abschnitte 12 und 13, alle Entscheidungen getroffen. Reihenfolge
**K0 → K4 → K1 → K2 → K3**; K0 und K4 sind durch, **K1 ist der nächste Griff**.

Die tragenden Entscheidungen in Kurzform, damit niemand sie neu verhandelt:

| Frage | Entscheid (2026-08-27) |
|---|---|
| Werbeprämie | **Kein** eigener „Pilot-Verlängerungs"-Mechanismus, sondern ein **100 %-Cashback-Bounty**: die **nächste Rechnung ist frei** (keine Rückerstattung) |
| Bedingung | Der Geworbene muss **30 Tage** Bestand haben |
| Deckel | höchstens **3 Monate** insgesamt |
| Der Geworbene | bekommt **nichts extra** — nur die üblichen Bounties |
| Bounty-Eingriff | nach oben erlaubt, aber **strukturell begrenzt** (Abschnitt 3a): kein freies Betragsfeld, sondern ein **Grund**, aus dem das System rechnet · Wirkungsvorschau in Euro **vor** der Handlung · **Verfall** nach einem Lauf statt Dauerzustand · nie in eigener Sache · Quelle steht auf der Rechnung |
| Monatsplanung | **beide planen**, ohne Pflicht-Hin-und-Her; Konflikte werden **gezeigt**, nie zum Abstimmen gezwungen |
| Feed | Kopie der letzten guten Liste, **in derselben Datenbank** — keine Mehr-Server-Hochverfügbarkeit (die ist Welle L) |

> **K2.2 ist ein Gate, keine Phase.** *Verträgt der Abrechnungsweg eine 0-€-Rechnung?*
> `berechneRabatt(netto, 100)` → netto 0, Steuer 0, gesamt 0 — durch `createInvoice`,
> den Zahlungsweg und den PDF-Beleg. Das muss **vor** dem Bau feststehen: verträgt er
> sie nicht, ändert das den ganzen Entwurf (99 % plus Restbetrag, oder ein
> Gutschriftsweg).

**Vorgänger, abgearbeitet:**
`docs/features/I_AUDIT_ZUWEISUNG_SUPPORT.md` — Owner-Vorgabe vom 2026-08-21:
Audit-Trennung (8.1.1), aktive Sitzungen (8.1.2), Ersatz-Zuweisung (8.2),
Support-Weg Kunde → TempConnect (10) und die Entscheidung zu Kunde ↔ Kunde (10b).
Davor ein Vorlauf aus dem, was H2 offen gelassen hat (RLS-Backstop P1-16,
Doku-Waechter P2-W1).

> **Abschnitt 8.1.1 ist ein aktiver Sicherheitsbefund, an der Quelle gemessen.**
> Ein Konto der Organisation *Unternehmen* sieht im eigenen Audit-Log einen
> `auth.login` eines Kontos der Organisation *Zeitarbeit*. Der Lesepfad ist
> dabei sauber (`al.org_id = $n`) — falsch ist das **Schreiben**: **135 Zeilen**
> tragen eine `org_id`, deren Akteur nie Mitglied dieser Organisation war.
> Dazu die Gegenrichtung: **1796 von 2740 Zeilen tragen gar keine `org_id`** und
> sind damit in *keinem* Org-Audit sichtbar. Details, Messung und Abnahmekriterium
> im Plan.

## Offene Owner-Entscheidungen

> Diese Liste wird per Test gegen die Arbeitspläne abgeglichen.

### Welle M — Marktplatz-Flow: **alle sechs entschieden (2026-09-01)**

Vollständig in [features/M_MARKTPLATZ_FLOW.md](features/M_MARKTPLATZ_FLOW.md), Abschnitt 8.

- ~~**M-E1**~~ ✅ **Schaltbar bauen.** Formweg-Schalter (`textform` \| `schriftform`),
  Vorgabe `textform`; bei `schriftform` wird der Sofort-Abschluss zur Anfrage mit
  Signaturlauf auf Mig 084. **Siehe die Rest-Aufgabe unten** — die Rechtslage ist
  ausdrücklich *nicht* bestätigt.
- ~~**M-E2**~~ ✅ **Erst sehen, dann zahlen**, in drei Stufen: öffentlich nur Zahlen und
  Kategorien **ohne Personen** (indexierbar, wirbt für sich selbst) · ab Konto der volle
  Feed mit anonymen Profilen · ab Plan das Handeln (Bedarf anlegen, anbieten, buchen).
  Je Seite ein eigener Erstellungs-Schlüssel.
- ~~**M-E3**~~ ✅ **Unbegrenzt**, wie verkauft. Der widersprechende zweite Wert wird
  **entfernt**, nicht angeglichen — zwei Tabellen für dieselbe Grenze sind der Fehler.
- ~~**M-E4**~~ ✅ **Einsatzradius statt Wohnort**, wählbar 10 / 50 / 100 km, Vorgabe 50.
  Ausgeliefert werden Radius plus grobe Raumangabe, **nie der Anker**; gesucht wird per
  Abstandsrechnung serverseitig. Die Kraft erscheint dadurch in **jeder** Suche, deren
  Einsatzort im Radius liegt — datensparsam **und** reichweitenstärker. Radius null ist
  zugleich der Widerspruchshebel der Person.
- ~~**M-E5**~~ ✅ **Struktur jetzt, Werte später.** Die `org_type`-Dimension wird im
  Plankatalog angelegt, mit sinnvollen Vorgaben, die der Owner ohne Codeänderung anpasst.
- ~~**M-E6**~~ ✅ **Automatisch, wenn eindeutig — sonst Aufgabe mit Frist.** Genau eine
  passende freie Kraft → zugeordnet; mehrere → Aufgabe. Das System wählt nie willkürlich.

**Rest-Aufgabe mit Auslöser (nicht mit Datum):** Ob **Textform** für den
Überlassungsvertrag genügt, ist **nicht anwaltlich bestätigt** — der Owner hat das benannt
und die Lage angenommen. Der Schalter macht die Korrektur billig (eine Konfigurationszeile
statt eines Umbaus), er macht die Frage nicht kleiner. **Vor dem ersten Abschluss zwischen
zwei echten Kunden gehört die Auskunft eingeholt**; solange Pilotkunden und Vorführdaten
laufen, trägt der Schalter.

- ~~**D-E3**~~ ✅ entschieden 2026-08-13: **Weg (a)**. Ursprünglich: Weg für Welle D6 (DSGVO für Profile ohne Konto): zweiter Einstieg für
  Profil-IDs **(a, empfohlen)** oder Vereinheitlichung der bestehenden Löschpfade (b).
  *Ein Löschpfad, der heute nachweislich richtig ist, wird nicht umgebaut, um zwei
  Zeilen zu sparen.*
- ~~E-E1/E-E2/E-E3~~ ✅ entschieden am 2026-08-13 (siehe features/E_LIVE_BELEGSCHAFT.md):
  voller Umfang, Abmeldung ans Profil, echtes Zustands-Protokoll.
- ~~**G-E1**~~ ~~**G-E2**~~ ~~**G-E3**~~ ~~**G-E4**~~ ~~**G-E5**~~ ~~**G-E6**~~ ~~**G-E7**~~ ~~**G-E8**~~ ✅ entschieden am 2026-08-15 (Selbsterfassung von Abwesenheit,
  siehe features/G_ABWESENHEIT_SELBSTERFASSUNG.md): **sofort wirksam** statt auf Antrag,
  mit **Schalter je Zeitarbeitsfirma** für den Rückfall auf Antragspflicht · **alle vier
  Arten** selbst meldbar · **Einsatzportal UND eigener Reiter**, nicht später · die Meldung
  ist **absichtlich mehrstufig**, damit sie niemand versehentlich auslöst · **Zeitsperre von
  einer Minute je Schritt**, serverseitig erzwungen · **auch der Kunde wird benachrichtigt**
  (Ausfall und Ersatz) — **ohne die Art der Abwesenheit**, weil „krank" ein Gesundheitsdatum
  nach Art. 9 DSGVO ist und der Kunde ein Dritter · **mindestens 30 Woerter Beschreibung**,
  erreicht ueber vier strukturierte Fragen statt eines leeren Textfelds — und dieser Text
  bleibt beim Arbeitgeber.

- ~~**D-M1**~~ ✅ entschieden 2026-08-19: **Wächter, nicht konsolidieren.**
  Die 80 Kopien sind untereinander einheitlich; alle zehn echten Defekte lagen
  dort, wo *keine* stand. Der Helfer taugt in heutiger Form nicht als Ziel
  (22 Tabellen ohne `timesheets`/`invoices`/`worker_profiles`, keine zweiseitige
  Grenze, eine Extra-Abfrage je Aufruf). Umgesetzt als
  `api/test/orgGrenzenWaechter.test.js`.
- **D-M2 (neu)** — **Null-Politik.** Darf eine Anfrage ohne `req.orgId` durch?
  Heute dreigeteilt: 42 Stellen `if (req.orgId && …)` (fail-open), 14 fail-closed,
  `timesheets.js:67` mit eigener Legacy-Ausnahme. Der neue Code ist durchgehend
  fail-closed. Der saubere Ort für eine Vereinheitlichung ist eine Middleware
  `requireOrgContext`, die vor dem Handler mit 403 abbricht — nicht das
  Umschreiben von 80 Vergleichen. Vorbild existiert (`suppliers.js:46`,
  `workforce.js:58`). *Berührt Produktionscode auf breiter Fläche → Owner.*
- **D-M3 (neu)** — **Audit-Zeilen ohne `org_id`.** `GET /organizations/:id/audit-log/recent-changes`
  filtert jetzt strikt (`al.org_id = $3`). Gemessen: 1782 von 2711 Audit-Zeilen
  tragen keine Org, 416 von 920 Entitäten wären damit unsichtbar. Heute
  folgenlos (kein Aufrufer). Sobald die Route einen bekommt: strikt lassen
  (kein Leck, leere Historie) **oder** wie die RLS-Policy `org_id IS NULL`
  durchlassen (vollständige Historie, Rest-Leck)? *Owner.*
- ~~**D-M5**~~ ✅ **entschieden und umgesetzt 2026-08-20** (Details oben) — **Nutzer- statt Org-Grenze in `capacityExchange` und
  `marketplace`.** Beide binden über `req.session.userId`, nicht über die
  Organisation. Ein Kollege derselben Firma sieht die Einträge seines Teams
  nicht. Zusammen mit **E-11** (der Helfer, der genau das reparieren sollte und
  nie funktioniert hat) und **D-M4** ist das *ein* Thema: soll die
  Zusammenarbeit innerhalb einer Organisation überhaupt möglich sein? Die
  Antwort entscheidet über drei Stellen gleichzeitig. *Owner.*
- ~~**D-M4**~~ ✅ **entschieden und umgesetzt 2026-08-20** (Details oben) — **`PATCH /requisitions/:id` begrenzte per `created_by`**, nicht
  per Org. Die Org-Grenze steht jetzt zusätzlich davor (E-4), die
  Ersteller-Bedingung ist unangetastet. Nebeneffekt bleibt: ein Kollege
  derselben Org kann die Ausschreibung eines anderen nicht bearbeiten. Absicht
  oder Altlast? *Produktentscheidung, kein Sicherheitsthema.*

- **D-N1 (neu, 2026-08-21)** — **Hub-Karte fuer Guthaben auf `enterprise.html`?**
  Bewusst offen gelassen, nicht vergessen. Die Guthabenseite ist erreichbar
  (Menuepunkt *Steuerung* leuchtet, Suche findet sie, `sla_abo.html` und
  `bounties.html` verlinken sie) — was fehlt, ist die **prominente** Flaeche auf
  dem Hub, wie sie `bounties` hat.

  *Warum es nicht nebenbei geht:* Eine Hub-Karte traegt `data-surface="…"` und
  haengt damit an einer **Surface** der Sichtbarkeitsmatrix
  (`api/config/visibilityMatrix.js`, `enterprise.html` fuehrt heute acht). Wer
  sie sieht, entscheidet sich dort ueber `allowed_org_types` und die
  Surface-Zugriffslogik (`enterpriseSurfaceAccessService`) — also eine
  RBAC-Entscheidung, keine Gestaltungsfrage.

  *Was zu entscheiden waere:* Sollen **beide** Org-Typen sie sehen (wie
  `bounties`) oder nur Kunden? Und: soll sie ein Abzeichen tragen, wenn der
  Stand niedrig ist (`hubCardBadges.js`, `TYPES_BY_SURFACE`) — das waere die
  erste Karte, deren Abzeichen aus einem **Kontostand** statt aus einer
  Ereigniszahl kommt.

  *Aufwand:* Entscheidung 15 Minuten, Umsetzung 2 Stunden (Matrix-Eintrag,
  Karte, Registereintrag, Wächterlauf). *Owner.*

## Offene Befunde ohne Ticket

- **K4-B1 (neu, 2026-08-28)** — **Kein Kanal erreicht das Team.** Ein
  Systemereignis, das *niemanden* betrifft außer dem Betreiber, hat heute keinen
  Zustellweg: `notificationMatrix.dispatch()` kennt nur org- und vorgangsbezogene
  Empfänger und überspringt einen unbekannten Ereignis-Schlüssel **wortlos**
  (`sent: 0`, kein Fehler); `writeStaffAudit()` verlangt zwingend eine handelnde
  Person und wirft ohne sie. In K4 wurde deshalb **gezählt** (`marktplatz_feed_kopie.rueckfaelle`,
  `letzter_rueckfall`) und auf `error` protokolliert, statt einen Kanal zu erfinden.
  **Jede Welle, deren Plan „Meldung an das Team" enthält, läuft hier hinein** —
  K1.1 als Nächstes. Der saubere Ort wäre eine Betriebs-Fläche im Staff CC
  (K1.2 legt sie an). *Owner-Entscheidung, sobald es mehr als zwei Fälle sind.*
- **OCC → Staff CC (Owner-Entscheid 2026-08-27)** — das Owner Control Center wird
  ins Staff Control Center überführt. **Bis der Owner den Abschnitt ausgearbeitet
  hat: keine neuen OCC-Module anlegen und keine entfernen**, nur umzugsfähig
  arbeiten. Offene Fragen (Zugangsstufe, Audit-Namensraum, sieben kollidierende
  Modulnamen, React-Fläche vs. Staff-Bauart) in [FLAECHEN.md](FLAECHEN.md).
- **Owner-gated, ruhend:** `SUPPORT_PHONE` (nicht gesetzt), I3 Stufen 2–4
  (Web Push), `enforce_mfa`, `preferred_supplier_only`,
  `partial_fulfillment_allowed`, ein **Demo-Zugang für die Arbeiter-Perspektive**
  (das Einsatzportal hat heute keine Tür: die geseeten Demo-Arbeiter tragen
  Attrappen-Hashes mit 51 statt 60 Zeichen, `bcrypt.compare` liefert für jede
  Eingabe `false`).
- **M0-B1 (neu, 2026-08-15)** — **Der nächtliche Mutations-Job ist nie gelaufen.**
  `.github/workflows/mutation.yml` entstand am 2026-08-12, `origin` steht auf dem
  Stand vom 2026-08-06 und ist **57 Commits zurück**. Die Übergabe hat ihn bis
  heute als bestehend geführt. Zwei Folgepunkte: seine Zeitgrenze (90 min) liegt
  unter der gemessenen Laufzeit (1 h 49 min), und `incremental: true` bringt in CI
  nichts. Alle drei gehören in Welle M6 — der Push der 57 Commits ist eine
  Owner-Entscheidung, keine Nebenbei-Aufgabe.
- **M0-B4/B8 (neu)** — Zwei Werte werden erzeugt und von niemandem gelesen:
  `req.locationScope` (`middleware/orgContext.js`) und
  `surface_access.multi_location` (`userService.js:290`; die Standort-Karte gatet
  über `org_settings`). Kein Fehler nach außen, aber Felder, die Verlässlichkeit
  vortäuschen.
- **M0-B7 (neu)** — Die zentrale Mandantengrenze `assertOrgOwnership` erlaubt **23
  Tabellen und wird genau einmal aufgerufen** (`routes/requisitions.js`, viermal,
  immer mit `'requisitions'`); `assertUserOwnership` hat **gar keinen** Aufrufer.
  Das ist derselbe Befund wie [ORG_GRENZE_BEFUND.md](ORG_GRENZE_BEFUND.md) von der
  anderen Seite und gehört zur offenen Entscheidung **D-M1**.
- **M0-B6 (neu)** — `enterpriseSurfaceAccessService.js:157-159` prüft doppelt
  (`coMode === "full"` ist gleichbedeutend mit `isSenior`). Vier Mutanten sind
  dadurch nicht tötbar — kein Testproblem, ein Codeproblem.
  *Alle drei berühren Produktionscode und wurden deshalb nicht angefasst: P12
  verbietet das ausdrücklich.*
- **Welle 3b** — 80 Mandantengrenzen stehen einzeln in 18 Route-Dateien.
  Braucht Owner-Freigabe, weil ihre Auflösung Produktionscode berührt.
- **P1-14** `reputationService` hat keinen Aufrufer. Präzisiert am 2026-08-13:
  das Bounty `top_supplier` ist **bereits abgeschaltet** (`is_active = f` mit
  Begründung in der Datenbank, Mig 166) — offen ist nur noch, **wann** die
  Reputation neu gerechnet wird (Cron oder ereignisgesteuert). Kein Fehler nach
  außen, eine ruhende Funktion.
- ~~**P1-15** Notfall-Antwortpfad liefert 500~~ ✅ **geschlossen 2026-08-13**
  (Migration 180; Beleg `test/integration/notdienstAntwortpfad.flow.test.js`, 5/5).
- **Owner-eigene Punkte:** Secret-Rotation (inkl. Web3Forms-Key in der Git-Historie),
  Staff-CC-Betriebseinrichtung, Backup-Wiederherstellungsprobe.

---

## Die eine Lektion, die sich durch alles zieht

**Ein Test, der das Ergebnis prüft statt WELCHE Abfrage lief, beweist nichts.**

Sie ist in dieser Codebasis fünfmal unabhängig aufgetreten — bei der Standortbindung,
beim Schutz des letzten Eigentümers, beim Standort-Cache, bei der Flächenmatrix, und
einmal in einem Test, den ich selbst gerade geschrieben hatte. Der Mock beantwortet
jede Abfrage gleich, der Code fällt in einen anderen Zweig, das Ergebnis sieht
identisch aus — und die Suite bleibt grün.

Zweite Fassung derselben Lektion: **doppelte Logik braucht doppelte Tests.** Derselbe
Guard steht zweimal in `middleware/rbac.js`; die erste Runde deckte nur eine Kopie ab.
Coverage kann das prinzipiell nicht sehen — beide Kopien werden ausgeführt, also gelten
beide als abgedeckt.

---

## Die zweite Lektion: gebaut, montiert — und niemand benutzt es

Die häufigste Fehlerklasse dieses Repos ist nicht der falsche Code. Es ist der
**korrekte Code ohne Aufrufer**. Drei systematische Durchgänge in einer Sitzung:

| Durchgang | Ergebnis |
|---|---|
| exportierte Funktionen ohne Aufrufer | mehrere; die meisten harmlos |
| Regel-Spalten, die nie gelesen werden | mehrere; eine davon war eine tote Funktion (ersatzlos entfernt) |
| Tabellen, in die geschrieben, aus denen nie gelesen wird | **9 von 186** — 8 nach Messung harmlos, **1 echt**: das OCC-Zugriffsprotokoll mit **23 abgewiesenen Zugriffsversuchen**, die niemand je hätte sehen können |

Und derselbe Fehler traf **meine eigene Arbeit**: die Verdrahtungs-Probe zu K4 fand
beim ersten Lauf einen `ReferenceError` — `opts` war mit `const` *innerhalb* des `try`
deklariert und im `catch` nicht sichtbar. Der Rückfall hätte in der Praxis **nie
gegriffen**, und alle acht Dienst-Proben wären trotzdem grün gewesen.

**Das strukturelle Gegenmittel, dreimal angewandt:** einen Wächter, der eine
**Liste abhakt**, in einen verwandeln, der **selbst sucht**. Ein aufzählender
Wächter kennt nur, was jemand eingetragen hat; ein entdeckender findet die Stelle,
die nächste Woche dazukommt. Beispiele im Baum:
`api/test/jedeMailHatEinenAbsender.test.js` (findet **jeden** `sendMail`-Aufruf im
Quelltext und verlangt den Absenderrahmen — §37a HGB) und
`api/test/statuswertSpiegel.test.js` (findet **jedes** `UPDATE`, das einen
Endzustand schreibt, und verlangt das Deaktivieren in derselben Anweisung).

**Merksatz:** *Eine Probe, die prüft, ob etwas existiert, ist keine Probe darauf,
dass es benutzt wird.* Und: **jede neue Verdrahtung bekommt eine Probe, die den
echten Handler durchläuft** — nicht nur den Dienst darunter.
