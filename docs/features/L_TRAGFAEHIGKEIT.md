# Welle L — Tragfähigkeit: Hochverfügbarkeit und 10.000 Kunden

> **Status: erhoben und geplant, nicht gebaut.** Eigenständiger Abschnitt auf
> Owner-Vorgabe vom 2026-08-27 — bewusst getrennt von den Produktwellen, weil
> Tragfähigkeit keine Funktion ist, sondern eine Eigenschaft der ganzen Plattform.
>
> Owner: *„HA ab Anfang an, aber nicht übertreiben. Wie können wir direkt 10.000
> Kunden tragen?"*

---

## 1. Warum das ein eigener Abschnitt ist

Hochverfügbarkeit lässt sich nicht an eine Funktion anhängen. Der Versuch, sie im
Rahmen des Marktplatz-Feeds zu lösen (Welle K, Abschnitt 3c), hat genau das
gezeigt: dort ging es um eine **fehlerhafte Abfrage**, und dagegen hilft eine Kopie
in derselben Datenbank vollständig. Gegen einen **Serverausfall** hilft sie nicht —
aber der betrifft dann ohnehin die ganze Plattform, nicht eine Liste.

**Die Trennung ist die Erkenntnis:** Ausfallsicherheit *einer Ansicht* und
Ausfallsicherheit *des Systems* sind verschiedene Probleme mit verschiedenen
Preisen. Sie zu vermischen führt dazu, dass man für das eine bezahlt und das
andere bekommt.

---

## 2. Ist-Stand — gemessen am 2026-08-27

### 2.1 Die gute Nachricht: waagerecht skalierbar ist die Plattform heute schon

```js
const sessionStore      = new PgSession({ pool, tableName: "session",       ... });
const staffSessionStore = new PgSession({ pool, tableName: "staff_session", ... });
```

**Sitzungen liegen in Postgres, nicht im Prozessspeicher.** Damit lassen sich
mehrere Node-Prozesse hinter denselben nginx stellen — **ohne klebrige Sitzungen,
ohne Umbau, ohne Migration.** Das ist die Voraussetzung für alles Weitere, und sie
ist bereits erfüllt.

### 2.2 Was heute läuft

| | |
|---|---|
| API-Prozesse | **einer** (`node server.js`) |
| Verbindungen je Prozess | `PGPOOL_MAX = 20` (`api/config/index.js:48`) |
| Postgres `max_connections` | Standard **100** |
| Hintergrundarbeit | BullMQ + Redis, vorhanden |
| Vorgeschaltet | nginx, vorhanden |
| Größte Tabelle | wenige hundert Zeilen |

### 2.3 Der Maßstab, gegen den heute geprüft wird, stimmt nicht mehr

Die `CLAUDE.md` denkt in Stufen **10 / 50 / 100 / 300** Kunden. Das Zielbild lautet
jetzt **10.000** — eine andere Größenordnung, nicht eine weitere Stufe.

Solange die Meßlatte nicht angepasst ist, prüft jede künftige Entscheidung gegen
die falsche Zahl. Das ist die billigste Korrektur in diesem ganzen Dokument und
gehört an den Anfang.

---

## 3. Hochverfügbarkeit in drei Stufen

Sortiert nach **Nutzen pro Euro**, nicht nach Vollständigkeit. Der Owner-Auftrag
lautet ausdrücklich *„nicht übertreiben"*.

### Stufe A — kostet fast nichts, größter Gewinn

| Maßnahme | Warum |
|---|---|
| **Zwei bis drei API-Prozesse** statt einem | Beseitigt den einzigen echten Single-Point und verdoppelt nebenbei den Durchsatz. Geht heute ohne Umbau (2.1). |
| **Verbindungen mitrechnen** | `PGPOOL_MAX = 20` gilt **je Prozess**. Drei Prozesse sind 60 von 100 Verbindungen. Wer das übersieht, tauscht einen Ausfall gegen einen anderen. |
| **Getestetes Zurückspielen des Backups** | **Der wertvollste Einzelpunkt dieser ganzen Liste.** Hochverfügbarkeit ohne erprobtes Restore ist Theater — ein Backup, das nie zurückgespielt wurde, ist eine Vermutung. |
| **Neustart-Richtlinie** | Ein abgestürzter Prozess muss von allein wiederkommen. |

### Stufe B — moderat, eine zusätzliche Maschine

| Maßnahme | Warum |
|---|---|
| **Postgres Streaming-Replica** als heißer Standby | Schützt gegen Serververlust. Umschaltung zunächst von Hand — das ist ehrlicher als ein automatisches Failover, das niemand geprobt hat. |
| **Redis-Persistenz (AOF)** | Damit eingereihte Jobs einen Neustart überleben. Heute wären Fristen-Sweeps und Mails nach einem Redis-Neustart weg. |

### Stufe C — teuer, erst mit Messung

Automatisches Failover (Patroni), PgBouncer, Lese-Repliken fürs Reporting,
mehrere Standorte.

> **Empfehlung: A sofort, B sobald zahlende Kunden darauf liegen, C nie ohne
> Messung.** Stufe C ohne Zahlen zu bauen heißt, Betriebskomplexität gegen ein
> Gefühl zu tauschen — und Betriebskomplexität ist selbst eine Ausfallursache.

---

## 4. Die 10.000 — was wirklich bricht

**Nicht die Hardware.** Postgres trägt 10.000 Organisationen ohne Weiteres. Was
bricht, ist Code — und zwar an fünf benennbaren Stellen.

| # | Was | Warum es kippt | Gegenmittel |
|---|---|---|---|
| **1** | **Die Sweeps** — `verfalleneAnfragen`, `staffing-maintenance`, die Monatsabrechnung | Sie laufen über *alle* Zeilen in einem Durchgang. Bei 10.000 Kunden ist der Abrechnungslauf ein Batch-Job, kein Cron-Tick. Bricht er in der Mitte ab, ist der Zustand unklar. | Stapelung, Fortschrittsmarke, Wiederaufsetzbarkeit nach Abbruch |
| **2** | **N+1 und unbegrenzte Scans** | Das Projekt hat dafür bereits den Diskriminator *„läuft bei 10, bricht bei 300"* (Erkenntnis vom 2026-06-03). Die Linse stimmt — sie wurde nur punktuell angewandt. | Systematischer Durchlauf gegen die Sonde aus Abschnitt 5 |
| **3** | **Der Live-Strom (SSE)** | Eine dauerhaft offene Verbindung je geöffnetem Portal. Bei 10.000 Kunden mit mehreren Nutzern sind das Tausende, die auf demselben Prozess mit dem Request-Handling konkurrieren. **Hier reicht waagerechte Skalierung nicht mehr** — der Strom braucht dann eine eigene Fläche. | Eigener Prozess/Dienst für den Strom, sobald die Sonde die Grenze zeigt |
| **4** | **Verbindungen** | 20 je Prozess gegen `max_connections = 100`. Ab einer Handvoll Prozessen ist das die Decke — vor jeder anderen. | PgBouncer (Stufe C), oder Pool-Größe bewusst senken |
| **5** | **Fehlende Indizes** | Wächst eine Tabelle von 750 auf 750.000 Zeilen, entscheidet ein Index über 5 ms oder 5 s. Heute fällt nichts auf, weil nichts groß ist. | Die Sonde nennt sie namentlich |

---

## 5. Die Skalierungs-Sonde — nicht argumentieren, messen

Alles in Abschnitt 4 ist begründet, aber es bleibt **Theorie, solange die größte
Tabelle wenige hundert Zeilen hat.**

**Der Vorschlag:** eine Wegwerf-Datenbank mit synthetisch **10.000 Organisationen**
in realistischer Tiefe — Nutzer, Arbeiter, Einsätze, Stundenzettel, Rechnungen,
Bounties. Dann die heißen Pfade messen:

| Gemessen wird | Warum dieser Pfad |
|---|---|
| Marktplatz-Feed | die sichtbarste Fläche, hat schon einmal 500 geworfen |
| Live-Belegschaft | die dichteste Abfrage über Arbeiter × Einsätze × Abwesenheiten |
| Monatsabrechnung | der einzige echte Batch-Lauf über alle Kunden |
| Die Fristen-Sweeps | laufen alle zehn Minuten über den ganzen Bestand |
| Anmeldung + Sitzungsprüfung | jeder einzelne Aufruf hängt daran |

**Das Ergebnis ist keine Note, sondern eine Liste:** *diese sieben Abfragen brauchen
einen Index, jene zwei Sweeps brauchen Stapelung, der Strom hält bis N
Verbindungen.* Genau das lässt sich abarbeiten.

**Ohne die Sonde optimiert man auf Verdacht** — und das ist die teuerste Art zu
skalieren, weil man Arbeit in Pfade steckt, die nie eng werden, und die echte
Engstelle erst im Betrieb findet.

---

## 6. Wellen und Phasen

### L1 · Die Meßlatte richtigstellen *(kostet eine Stunde)*

| Phase | Inhalt |
|---|---|
| L1.1 | Zielbild in der `CLAUDE.md` von 10/50/100/300 auf das neue Bild heben, mit Begründung |
| L1.2 | Die Skalierungs-Frage in die Ticket-Triage aufnehmen: *„was passiert damit bei 10.000?"* |

### L2 · Stufe A: die billige Hochverfügbarkeit

| Phase | Inhalt | Nachweis |
|---|---|---|
| L2.1 | **Backup zurückspielen — einmal wirklich.** Auf eine leere Datenbank, mit Zeitmessung. | ein wiederhergestellter Stand, der startet |
| L2.2 | Zweiter und dritter API-Prozess hinter nginx | ein Prozess getötet → Plattform antwortet weiter |
| L2.3 | Verbindungsrechnung: Prozesse × `PGPOOL_MAX` gegen `max_connections` | Lastlauf ohne „too many connections" |
| L2.4 | Neustart-Richtlinie geprüft | Prozess getötet → kommt von allein wieder |

### L3 · Die Sonde

| Phase | Inhalt | Nachweis |
|---|---|---|
| L3.1 | Erzeuger für synthetische 10.000 Organisationen in realistischer Tiefe | Wegwerf-Datenbank gefüllt, Verteilung plausibel |
| L3.2 | Messung der fünf heißen Pfade, jeweils mit Zeit und Abfrageplan | Zahlen, kein Gefühl |
| L3.3 | **Befundliste** — namentlich, nach Wirkung sortiert | jede Zeile ein abarbeitbarer Punkt |

### L4 · Abarbeiten, was die Sonde findet

Inhalt steht erst nach L3 fest. Erwartbar: Indizes, Stapelung der Sweeps,
Entscheidung über den Live-Strom.

### L5 · Stufe B *(wenn zahlende Kunden darauf liegen)*

Streaming-Replica, Redis-Persistenz, geprobte Umschaltung.

---

## 7. Reihenfolge

```
L1 (Meßlatte)        ← sofort, kostet fast nichts
L2 (Stufe A)         ← unabhängig, sofort möglich
L3 (Sonde)           ← liefert die Grundlage für L4
L4 (Befunde)         ← Inhalt steht erst nach L3 fest
L5 (Stufe B)         ← wenn zahlende Kunden darauf liegen
```

**L1 und L2 sind sofort machbar und hängen an nichts.** L3 ist die eigentliche
Investition — und die einzige, die verhindert, dass L4 auf Verdacht gebaut wird.

---

## 8. Was Welle L **nicht** tut

- **Kein automatisches Failover ohne Messung.** Betriebskomplexität ist selbst
  eine Ausfallursache.
- **Keine mehreren Datenbankserver für einzelne Ansichten.** Das war die Frage
  beim Marktplatz-Feed; dort ist eine Kopie in derselben Datenbank die richtige
  Antwort (Welle K, 3c).
- **Keine Optimierung vor der Sonde.** Wer heute Indizes rät, baut sie an die
  falschen Stellen.
- **Kein Umbau der Sitzungshaltung.** Sie liegt bereits in Postgres und ist damit
  der Grund, warum Stufe A so billig ist.
