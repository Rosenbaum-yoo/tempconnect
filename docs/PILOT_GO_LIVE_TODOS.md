# TempConnect - Pilot/Go-Live TODOs
Quelle: fundierte Projektbewertung April 2026, abgeleitet aus realem Ist-Zustand (65 Routes, 102 Services, 156 Tests, 98 Migrationen, 6-Job-CI, 289/290 Audit-Coverage).
Dieses File wird automatisch gepflegt, solange die Regel in `AGENTS.md` ("Pilot-TODO-Pflege") aktiv ist. Erledigte Punkte wandern nach `## Done

### 2026-09-21 — Ein Klient statt zwei, und der Stand ist ablesbar (S1 / S2 / S3 / S4)

**Status:** erledigt · **Kategorie:** Technik (Abhängigkeiten) + Betrieb ·
**Quelle:** Owner-Reihenfolge 2026-09-20, Posten 3

**Gemessen zuerst (S1), wie der Plan es verlangt:**

| Frage | Antwort |
|---|---|
| Was macht `rateLimit.js` mit Redis? | `createClient` aus `redis` (node-redis v4), als `sendCommand` an `rate-limit-redis` gereicht. Ohne `RATE_LIMIT_STORE=redis`: ein Zähler **je Instanz** im Arbeitsspeicher |
| Läuft der Begrenzer überhaupt mit Redis? | **Ja.** Beide Compose-Dateien setzen `RATE_LIMIT_STORE: ${RATE_LIMIT_STORE:-redis}` — Redis ist der Standard im Container. Die Umstellung betraf also den **laufenden** Begrenzer |
| Weitere Redis-Nutzer? | **Genau einer.** `rateLimit.js` war der einzige Aufrufer von `redis`; einen direkten Aufrufer von `ioredis` gab es **nicht** — es kam unausgesprochen über BullMQ herein |

**Der Preis der zweiten Bibliothek war nicht nur ein Paket:** `bullmq@5` führt
`peerOptional redis@">=5.0.0"`, die Wurzel pinnte `redis@^4.6.13`. Jedes `npm install`
endete mit ERESOLVE, und der Ausweg hieß `--legacy-peer-deps` — ein Schalter, der
Abhängigkeiten ausdrücklich *potenziell kaputt* auflöst und dabei jede künftige **echte**
Warnung mitverschluckt. Auf genau diesem Weg ist `@pdf-lib/fontkit` einmal mit `--no-save`
im Baum gelandet, ohne je im Lockfile zu stehen.

**Umgestellt:** der Ratenbegrenzer benutzt jetzt `ioredis` — denselben Klienten wie die
Warteschlangen, aus **derselben** Zugangsdefinition (`queue/connection.js`). Der Unterschied
zwischen den beiden Bibliotheken sitzt an **einer** Stelle: node-redis nimmt die Befehlsteile
als *ein Feld*, ioredis als *einzelne Argumente*. Deshalb steht die Umrechnung als eigene,
**ausgeführte** Funktion `befehlsBruecke()`: verwechselt man sie, gibt es beim Start keinen
Fehler — der Begrenzer zählt erst im Betrieb falsch und lässt dann alles durch oder nichts.

**Damit läuft `npm install` wieder ohne Schalter** — geprüft mit `--dry-run`, und auch
`npm ci --omit=dev` (der Weg des Abbilds) läuft sauber. Das `--legacy-peer-deps` im
`api/Dockerfile` ist entfernt.

**S4 — der Hauptbaum als Betriebsumgebung:** der Container bedient den **Hauptbaum**, nicht
den Arbeitsbaum. Ein grüner Testlauf im Worktree sagt deshalb nichts über den laufenden
Container. Neu: `APP_COMMIT` als Bauargument, von beiden Compose-Dateien weitergereicht und
im **Startprotokoll** neben Port, Node-Version und Umgebung. Fehlt der Wert, steht *unbekannt*
da — auch das ist eine Aussage. Dazu ein Ablauf in vier Schritten zum Abtippen
(`docs/features/S_ABHAENGIGKEITEN.md`, Abschnitt 4a).

**Nachweis:** `api/test/einKlientFuerRedis.test.js` (13), **6 Rückmutationen, alle rot**.

**Beim Bauen gefunden — und dann dauerhaft bewacht:** dreimal an einem Tag wurde eine
Escape-Sequenz beim Schreiben zum **Zeichen**: ein NUL-Byte in einer Probendatei (git stufte
sie als binär ein), ein NUL in einer Commit-Nachricht (git verweigerte sie) und ein
BACKSPACE **in einer Regex** — die Probe war grün und verglich gegen ein Zeichen, das im
Zieltext nie vorkommt. Sie hätte **nie** etwas gefangen. Beim Messen dafür kamen vier alte
Vorkommen in zwei Planungsdokumenten zutage, ausgerechnet an der Stelle, an der beide Texte
diese Falle **beschreiben**; sie sind mitrepariert. Neu in `api/test/repoHygiene.test.js`:
keine getrackte Textdatei trägt noch ein Steuerzeichen.

**Offen, benannt:** S3.1/S3.2 (Register *eine Bibliothek je Aufgabe* mit entdeckendem
Wächter) und S2.4 — die Übrigen der S-Welle.

### 2026-09-21 — Zwei Wächter gegen einen großen Schaden (W5.1 / W5.2 / W4.2)

**Status:** erledigt · **Kategorie:** Security (Repo-Hygiene) ·
**Quelle:** Owner-Reihenfolge 2026-09-20, Posten 2

Das Repository ist öffentlich, und die Unterlagen des Owners liegen im selben Baum.

**Der Befund war ein anderer als der Plan vermutete.** Die Sperre für Office-Dateien in der
Wurzel existierte bereits — aber in **`.git/info/exclude`**. Diese Datei **wandert nicht mit**:
sie schützt genau einen Arbeitsplatz. Ein frischer Klon (anderer Rechner, CI, neue Mitarbeit)
hatte die Regel nicht, und dort wäre die nächste Owner-Unterlage in einer Wurzel gelandet, die
sie nicht mehr ignoriert. Eine Sperre, die nur lokal existiert, ist im Zweifel keine. Sie steht
jetzt in `.gitignore`, und eine Probe hält sie dort fest.

**Gemessen:** 0 Office-Dateien und 0 PDFs getrackt, 1911 von 1914 getrackten Dateien auf
Zugangswerte geprüft — **0 Treffer**.

**W4.2 erfindet nichts neu.** Die Regel, was ein *echter* Zugangswert ist, steht seit der
Release-Prüfung in `scripts/lib/secretScan.mjs`: Anbieter-Präfix mit strengem Format, sonst
Länge **und** Entropie — an echten Werten gemessen, deshalb ohne die 18 Fehlalarme, an denen die
Vorgängerregel gescheitert ist. Sie lief bisher nur gegen das **Release-Paket**. Jetzt läuft
dieselbe Regel gegen die getrackten Dateien: was im Paket nicht liegen darf, darf erst recht
nicht in der Historie liegen — aus der bekommt man es nicht mehr heraus.

**Nachweis:** `api/test/repoHygiene.test.js` (7), **5 Rückmutationen, alle rot**. Beide
Gegenproben sind der eigentliche Wert: die Positiv-Proben sind heute grün, *weil* nichts
Verbotenes getrackt ist — sie wären es auch mit einer Einstufung, die nichts mehr erkennt.

**Beim Bauen gefunden:** die Datei trug ein echtes NUL-Byte im Quelltext (aus der NUL-Escape-Sequenz in einem
JSON-Schreibvorgang wurde das Zeichen selbst). `git` stufte sie damit als binär ein — ausgerechnet
die Probe, die Repo-Hygiene prüft. Auf Byte-Ebene ersetzt.

**Offen, benannt:** W4.1 (Rotationsliste) bleibt bewusst zuletzt — Rotieren ergibt erst
unmittelbar vor dem Go-Live Sinn.

### 2026-09-20 — Die Standortgrenze, entdeckend geprüft (U0.2 / U2.4)

**Status:** erledigt · **Kategorie:** Rollen-/Sichtbarkeitslogik mit Sicherheitswirkung ·
**Quelle:** Owner-Reihenfolge 2026-09-20, Posten 1 (`docs/UEBERGABE.md`)

Der Plan U vermutete einen Sicherheitsbefund: `assertLocationBelongsToOrg` stehe in nur vier
Routendateien. **In der Zahl war die Vermutung falsch, in der Sache richtig.**

Falsch in der Zahl: die Prüfung liegt eine Schicht tiefer. Elf Routendateien nehmen einen
Standort an, **sechs Dienste** tragen die Prüfung — wer in `routes/` zählt, zählt die falsche
Schicht.

Richtig in der Sache: gemessen am **Verhalten** über alle **967** Wege (jeder Handler bekam
einen fremden Standort, ein Spion schrieb jede Abfrage mit) erreichte der fremde Standort von
**drei** Wegen aus die Datenbank, ohne dass ihn jemand geprüft hätte:

| Weg | Abfrage |
|---|---|
| `PUT /organizations/:id/departments/:deptId` | `UPDATE org_departments SET ... location_id` |
| `POST /organizations/:id/members` | `INSERT INTO org_memberships` |
| `updateMemberScope` | `UPDATE org_memberships` — die Route prüft, der **Dienst** nicht (zweite Tür) |

**Der Fremdschlüssel fängt das nicht:** er zeigt auf `org_locations(id)`, nicht auf
`(id, org_id)` (Migration 019/112) — er prüft nur, dass es die Zeile *irgendwo* gibt.

**Warum das ein Sicherheitsbefund ist und keine Unsauberkeit:** `middleware/orgContext.js` löst
`req.locationId` über `resolveLocation(pool, req.orgId, …)` auf; ein fremder Standort liefert
dort nichts. Wenige Zeilen später steht „if no location resolved, user sees org-wide". Eine
Mitgliedschaft, die formal **an einen Standort gebunden** ist, wirkt damit **org-weit** — die
Umkehrung dessen, wofür eine Standortleitung existiert, und lautlos, weil nirgends ein Fehler
entsteht. Teil C der Probe stellt genau das nach.

**Geschlossen** in den Schreibwegen, nicht in den Routen: `rbacService.addMember`,
`rbacService.updateMemberScope`, `organizationService.updateDepartment`. Die Routen sind nur
zwei von mehreren Türen; `addMember` hängt auch an der Einladungsstrecke.

**Nachweis:** `api/test/standortGrenze.test.js` (11) — (A) entdeckender Durchlauf über alle
Wege, (B) jeder Schreibweg direkt am Dienst mit Gegenprobe, (C) die Wirkung im Kontext.
**8 Rückmutationen, alle rot**, darunter drei, die sowohl (A) als auch (B) rot färben — der
Durchlauf beißt also selbst und nicht nur die Einzelproben.

**Fixture-Pflege (§0.9, Zusicherungen unverändert):** vier Proben in `rbacService.test.js`
griffen `queries[0]`; davor steht jetzt die Eigentumsprüfung. Sie greifen nun die **schreibende**
Abfrage. Eine davon wäre sonst **grün geblieben und hätte den Stellvertreter geprüft**: auch die
Prüfabfrage enthält `org_id = $2`.

**Offen, benannt:** ein zusammengesetzter Fremdschlüssel `(id, org_id)` auf
`org_locations`/`org_departments` würde die Grenze in der Datenbank verankern statt nur im Dienst.
Das ist eine Migration mit Rückwärtsprüfung bestehender Zeilen — eigener Posten, nicht in dieser
Welle.

### 2026-09-20 — Der Rang ist ehrlich (N3.4 / N3.5 / N3.6)

**Status:** erledigt · **Kategorie:** Rollen-/Sichtbarkeitslogik (die Reihenfolge ist eine Aussage)
+ Bug-Pattern (ein Rang, der nur für die Seite galt) · **Quelle:** Regel **O-L1** aus
`docs/features/O_RAHMENBEDINGUNGEN.md`, Abschnitt 4; Messung am Code 2026-09-19

Drei Befunde an derselben Stelle:

1. **Der Rang galt nur für die Seite.** `browseFeed` holte 25 Zeilen nach **Datum** und rangierte
   danach — also innerhalb einer Zufallsauswahl. Der beste Treffer des Marktes stand auf Seite 3
   und kam dort nie weg, weil er nur gegen die anderen 24 Zeilen von Seite 3 antrat. Jetzt: ein
   **Kandidatenfenster von 500**, vollständig rangiert, und **erst danach** die Seite. Jenseits des
   Fensters bleibt es bei der Datums-Reihenfolge — exakt und überschneidungsfrei, weil das Fenster
   die erste Datums-Seite bis 500 **ist**. Gesagt wird es trotzdem: `feed_context.rang_fenster`
   nennt Größe, Kandidatenzahl und ob der Rang für diese Seite gilt.

2. **Bezahlung sortierte mit.** Tarif (12), Platzierung (8) und Premium-Anzeige (15) lagen mit
   Passung und Reputation in **einer** Summe: bis zu 35 kaufbare Punkte, genug für eine deutlich
   schlechtere Passung. Das ist genau, was O-L1 verbietet. Jetzt zwei Zahlen: `rank_score`
   (verdient) und `rank_boost_paid` (bezahlt). Sortiert wird verdient → bezahlt → Kennung; die
   Hebung entscheidet nur noch bei **Gleichstand**. `rank_erklaerung` nennt jeden Bestandteil mit
   Punkten und Art. Auf der Karte trägt die Hebung ein eigenes Kennzeichen mit Erklärung — und
   fällt nicht mehr unter die Kürzung auf drei Gründe, die sie vorher bei den auffälligsten Karten
   verschluckt hat.

3. **Die Profil-Rangliste existierte nicht.** `runDailySnapshotBatch` und `updateRankPositions`
   hatten **keinen Aufrufer**. „Ihre Position: #N" in `sla_profil.html` war dauerhaft leer — für
   eine Fähigkeit, die ab PRO als „Marketplace Visibility" verkauft wird. Jetzt ein Takt
   (`profil-rangliste`, täglich 02:50, mit interner Handkurbel), der erst die Momentaufnahmen
   schreibt und dann die Positionen vergibt. Die Ordnung dort folgt ebenfalls O-L1
   (`ranking_score` vor `premium_boost` statt `effective_rank_score`), und das Tagesdatum kommt aus
   `todayDE()` statt aus dem UTC-Schnitt — sonst trägt die Momentaufnahme nachts den Vortag und die
   Liste ist leer.

**Nachweis:** `api/test/rangIstEhrlich.test.js` (18), Ergänzungen in
`api/test/marketplaceFeedCard.test.js` (4). **18 von 19 Rückmutationen rot.** Die eine überlebende
ist benannt: der Kennungs-Schritt im Vergleicher ist vorsorglich, weil die Zeilen bereits in einer
totalen Ordnung ankommen (SQL sortiert nach Kennung, `Array#sort` ist stabil).

**Fixture-Pflege (§0.9, Zusicherungen unverändert):** zwei N2.7-Proben hielten den **Mechanismus**
der Blätterung fest (SQL-Versatz je Seite). Der Versatz ist mit dem Fenster in den JavaScript-Teil
gewandert. Beide prüfen den Mechanismus jetzt dort, wo er weiter gilt (ausdrückliche Sortierung),
**und** zusätzlich die Wirkung: Seite 3 wiederholt Seite 1 nicht.

**Offen, benannt:** Sperrliste und Live-Verfügbarkeit als eigene Rang-Bestandteile (N3.4), die
positive Hälfte von N3.6 (heutige Abwesenheit senkt den Rang), interne Bewertung Q1.

### 2026-09-19 — Die Menge stimmt, und drei Riegel halten (N3.0 / M5 Teil 1)

**Status:** erledigt · **Kategorie:** Bug-Pattern (drei Wahrheiten über dieselbe Zahl) + Produktausbau ·
**Quelle:** Owner-Entscheid 2026-09-19 („Riegel zuerst, dann Korb, dann Sammelabschluss"); Messung
am Code für den Kreislauf der Personalsuche

Das Bündel in N3 setzt auf dem Korb aus M5 auf — und der Korb setzt darauf, dass die **Menge
stimmt**. Gemessen stimmte sie nicht.

**1. Drei Rechner, drei Wahrheiten (M5.1).** `demand_requests.currently_committed_count` und
`remaining_open_count` wurden von drei Diensten geschrieben, jeder mit eigener Rechnung:

| Dienst | zählte | Folge |
|---|---|---|
| `marketplaceService` | angenommene Angebote | die kanonische Rechnung, aber nicht die einzige |
| `assignmentStaffingService` | die Besetzung **eines** Einsatzes | bei zwei Zeitarbeitsfirmen löschte die zweite Neuberechnung den Anteil der ersten — ausgelöst auch vom **Lesen** einer Dealakte |
| `emergencyCommitmentService` | nur Notdienst-Zusagen | überschrieb die Angebote |

Jetzt rechnet **eine** Abfrage über drei Quellen, und keine zählt doppelt: angenommene Angebote,
Notdienst-Zusagen **ohne** Angebot (`agreement_offer_id IS NULL`) und Einsätze am Bedarf **ohne**
Angebot (`offer_id IS NULL`). Die beiden anderen Dienste stoßen sie nur noch an.

**2. Der Überfüllungs-Riegel gilt jetzt auch auf dem Normalweg (M5.2).** Er stand nur im Notdienst:
ein Bedarf über 30 Plätze konnte zweimal 30 annehmen. Geprüft wird vor dem Schreiben, in derselben
Transaktion, in der der Bedarf gesperrt ist — sonst gewinnt bei zwei gleichzeitigen Annahmen der
Zufall. Antwort: **409 `OVERFILL_NOT_ALLOWED`** mit Restmenge. Wer Überfüllung ausdrücklich
erlaubt, darf überfüllen.

**3. Die Menge steht am Angebot (M5.3).** `offered_quantity` blieb NULL, und die Deckungsrechnung
las NULL als „der ganze Bedarf". Ein Angebot über **eine** Kraft galt damit als vollständige
Deckung — der Bedarf war erfüllt, die übrigen Plätze verschwanden aus dem Markt. Ohne Angabe gilt
jetzt **1**.

**4. „Alle 30 oder keiner" wirkt (M5.9).** `partial_fulfillment_allowed` stand seit Migration 070
im Schema und wurde von **keiner Zeile** gelesen. Der Kunde kann es jetzt beim Anlegen wählen; ein
Angebot, das den Rest nicht deckt, wird mit **409 `PARTIAL_NOT_ALLOWED`** abgewiesen.

**5. Niemand handelt mit sich selbst (M5.8).** Der Riegel stand nur auf dem Zustimmungsweg. Ein
Unternehmen konnte auf den **eigenen** Bedarf bieten und selbst annehmen. Jetzt beides: **403
`SELF_DEAL_FORBIDDEN`**, schon beim Anbieten.

**Verifikation.**

* `api/test/mengeUndRiegel.test.js` — 13 Proben an der Wirkung: welche Quellen die Abfrage nennt,
  was gebunden wird, dass vor dem Schreiben abgewiesen wird, und dass die Besetzung eines Einsatzes
  die Deckung des Bedarfs **nicht** mehr überschreibt.
* `api/test/integration/deckungStimmt.flow.test.js` — 9 Fälle gegen die echte Datenbank
  (Transaktion mit ROLLBACK): 2 + 1 + 1 = 4 von 6, und beide Doppelzähl-Wege einzeln nachgestellt.
  Die neue Abfrage ist damit wirklich ausgeführt, nicht nur gepinnt.
* **12 Rückmutationen, alle rot** (4 davon zusätzlich mit Datenbank).
* **Beim Bauen gefunden:** die neue Abfrage enthielt `FROM offers o` — und mehrere Muster-Pools
  erkennen daran die **Angebots**-Abfrage. Sie antworteten der Deckungsrechnung mit einer
  Angebotszeile, und die Deckung kam als 0 zurück. Die Aliase heißen jetzt `ang`, `notd`, `eins`.
  Ein zweiter Fehler derselben Art: ein Kommentar **im** SQL-Text enthielt Backticks und beendete
  die Zeichenkette.
* **Fixture-Pflege (§0.9, Zusicherungen unverändert):** zwei Vorrichtungen lieferten für „vorher"
  und „nachher" dieselbe Deckung. Der Riegel liest den Stand **vor** der Annahme; stünde dort
  schon die volle Deckung, wiese er die eigene Annahme ab. Die Vorrichtung kennt jetzt beide Stände.

**Offen, benannt:** Anbieter-Modus der Bedarfsliste und die Korb-Ansicht (M5.4/M5.5), danach ein
Klick → N Verträge (M5.6/M5.7). Erst damit kann N3 ein Bündel über mehrere Firmen zeigen.

---

### 2026-09-19 — Was die Nachprüfung der Nachprüfung fand (N2.12)

**Status:** erledigt · **Kategorie:** Bug (tote Prüfung) + Wächter-Qualität ·
**Quelle:** unabhängige Nachprüfung der elf N2.11-Fixes, die in der großen Gegenprüfung über der
Prüfgrenze lagen (je ein Skeptiker; 8 von 11 kamen durch, 3 fielen ins Wochenlimit)

**Urteil der acht:** sechs Fixes einwandfrei (Preis-Tor, Eingabetaste, Notdienst-Weg,
Bedarfs-ODER, Leerzustand, Vorschau nach Entwurf), zwei behoben, aber mit Lücken daneben.
**Ohne Urteil und weiterhin offen: Blättern, Start-Firma, Matching-Route** — die stehen als
erstes in der nächsten Prüfung.

**1. `PATCH /assignments` verwarf Standort und Abteilung stillschweigend — und die Anlage auch.**
`createSchema` kannte `location_id` und `department_id` nicht, Zod entfernt unbekannte Schlüssel.
Beide Felder kamen also nie bei `updateAssignment`/`createAssignment` an, und die drei
Org-Prüfungen dafür (Route zweimal, Dienst einmal) liefen immer mit `undefined` — sie waren tot.
`docs/API.md` versprach sie als änderbar. Jetzt stehen beide im Schema, kommen im Datensatz an, und
ein fremder Standort ist eine **403**, kein 500: der `OrgBoundaryError` wird im Anlagepfad
abgefangen wie im PATCH.

**2. Nur angeklickte Fähigkeiten zählten nicht mehr als Entwurf.** N2.11 hatte den Markup-Standard
über `defaultValue` verglichen. Bei `<input type="hidden">` setzt `.value` aber das
value-**Attribut** selbst, und `defaultValue` gibt genau dieses zurück — für `skill_tags` war
`v !== defaultValue` deshalb nie wahr. Wer in Schritt 2 Fähigkeiten anklickte und die Seite
verließ, fand beim Wiederkommen nichts vor. Die Markup-Standards werden jetzt **einmal beim Laden**
festgehalten. Die Test-Sandbox bildet die Regel für versteckte Felder nach, sonst hätte sie daran
vorbeigemessen.

**3. Drei Wächter, die nur scheinbar zusicherten** (jeder mit ausgeführter Rückmutation belegt):

| Wächter | Was durchging |
|---|---|
| Entwurf nach dem Absenden | Ein `loeschen()` im Sprachwechsel-Hörer **oder** im Fehlerzweig blieb grün — der Befund aus N2.11, nur eine Zeile weiter. Jetzt zählt die Probe die ganze Seite: **genau ein** Aufruf, und der liegt im Erfolgszweig |
| Leerzustand (`zweigNach`) | Ein Anführungszeichen in einem regulären Ausdruck (`/["]/`) oder ein Apostroph im Kommentar brachte die Klammersuche aus dem Tritt; sie las bis in den Treffer-Zweig. Jetzt werden Kommentare zuerst entfernt, Zeichenklassen übersprungen — und findet sie sich doch im Treffer-Zweig wieder, ist sie **rot** statt still grün |
| Notdienst-Firma | Nur die Route war gedeckt. Nahm man im Dienst die Ableitung zurück, blieb alles grün. Jetzt belegt eine Probe, dass der **gespeicherte** Bedarf gewinnt, und eine zweite den Rückfall für den Altbestand |

**4. Die API-Doku hängt jetzt am Code.** Kein Test hielt `docs/API.md` fest; der alte Satz „Link a
deal/requisition to a worker" hätte unbemerkt zurückkehren können. Der neue Wächter ist
**entdeckend**: jeder Fehlercode aus `assignmentService` und der Route muss im Abschnitt stehen,
und jedes Feld, das die Doku als änderbar nennt, muss es im Schema geben.

**Beim Bauen gefunden:** die Doku-Probe scheiterte zuerst **still** — `docs/API.md` liegt mit CRLF
im Baum, die Abschnittssuche fand nichts, und der Fehler fiel im `describe`-Rumpf an, wo ihn der
Runner nicht mitzählt. Zeilenenden werden jetzt normalisiert, und die Existenz beider Abschnitte
ist eine eigene, laute Probe.

---

### 2026-09-16 — Was die große Gegenprüfung fand: 20 Befunde, abgearbeitet (N2.11)

**Status:** erledigt · **Kategorie:** Security (Mandantengrenze) + Bug + Wächter-Qualität ·
**Quelle:** adversarische Prüfung der ganzen Welle N vom 15.09. (14 Agenten, ~2,3 Mio. Tokens;
drei Blickwinkel waren nie gelaufen: SQL-Einschleusung, Browser-Verdrahtung, Wächter-Qualität)

**Ergebnis der Prüfung:** 20 Befunde. Neun wurden von je einem Skeptiker geprüft und **alle
bestätigt** (vier davon in der Schwere heruntergestuft), elf lagen über der Grenze der Prüfung und
wurden hier beim Beheben einzeln am Code verifiziert. **Kein Befund im SQL-Blickwinkel** — der
Prüfer hat 64 Filterkombinationen gegen die laufende Datenbank ausgeführt, inklusive Grenzwerten
wie `1e21` und `5e-324`; Platzhalter und Schranken hielten.

**1. Kundensperre: die Firma stand nicht am Bedarf** (Owner-Entscheid, Migration 218). Ein Bedarf
speicherte nur den anlegenden **Nutzer**. Vier Stellen rieten die Firma über `users.org_id` — die
persönliche Start-Firma. Wer als eingeladenes Teammitglied für Firma A handelt, wurde dort gegen
die **leere** Sperrliste seiner Start-Firma geprüft: die bei A gesperrte Kraft wurde A doch
vorgeschlagen, und ihre Zeitarbeitsfirma bekam eine Anfrage. Jetzt trägt der Bedarf
`requester_org_id` (aus der aktiven Firma der Sitzung, nie aus dem Rumpf); Altbestand: einzige
aktive Unternehmens-Mitgliedschaft, sonst Start-Firma. Gelesen wird sie an **einer** Stelle
(`companyBlocklistService.kundenOrgEinesBedarfs` / `…sDerBedarfe`, mit Rückfall). Gemessen: 32 von
40 Bedarfen bekamen eine Firma; die übrigen acht haben Anleger ohne jede Firma.

**2. Zweiter Notdienst-Weg ohne Sperre.** `POST /api/emergency/request` reichte keine Firma durch —
der Abgleich lief ungefiltert, die gesperrte Kraft stand in den Treffern, und ihre Zeitarbeitsfirma
bekam „NOTDIENST — sofortige Reaktion erforderlich".

**3. `GET /api/matching/demand/:id`**: rechnete ohne Sperre (zwei Flächen, zwei Antworten zur
selben Sperre) **und** gab per `SELECT *` die interne `worker_profile_id` heraus. Die Sperre sitzt
jetzt in `findMatches` selbst — kein Aufrufer muss mehr daran denken —, und die Vorschläge lesen
die öffentliche Projektion.

**4. Blättern ohne eindeutige Ordnung.** Beide Marktseiten sortierten nur nach Zeitstempel. Bei
Gleichstand ist die Reihenfolge für Postgres unbestimmt und hängt vom LIMIT ab: nachgestellt
lieferten drei Seiten zu je 25 nur 73 verschiedene Zeilen — zwei Angebote standen auf keiner Seite,
obwohl `total` sie zählte. Gleichstände sind der Normalfall, weil die Marktpräsenz Angebote in
**einem** INSERT anlegt. Jetzt ist die Kennung letzter Sortierschlüssel, in SQL und in der
Zusammenführung, und `sort_date` ist auf Millisekunden gekürzt (genauer liefert der pg-Treiber
Zeitstempel nicht an JavaScript).

**5. Sieben Befunde im Browser** (Bedarfsanlage, Dispo-Ansicht):

| Befund | jetzt |
|---|---|
| Wiederhergestellte Fähigkeiten erschienen **nicht** im Katalogwähler — unsichtbar mitgesendet oder beim ersten Klick verworfen | der Wähler liest seine Vorauswahl beim ersten Aufsetzen aus dem versteckten Feld |
| Absenden scheiterte **lautlos** an ungültigen Feldern in ausgeblendeten Schritten | der Assistent prüft selbst, springt zum Feld, macht seinen Schritt sichtbar und sagt, was fehlt |
| Nach erfolgreichem Anlegen blieb der Assistent im letzten Schritt stehen, obwohl `form.reset()` alles geleert hatte | er fängt von vorn an |
| `headcount="1"` zählte immer als Eingabe → jeder Seitenaufruf legte einen 7-Tage-Entwurf an, der den alten Ort zurückholte | ein Feld mit bloßem Markup-Standard ist keine Eingabe |
| Sprachwechsel löschte einen neu begonnenen Entwurf | gelöscht wird nur im Erfolgszweig des Absendens |
| Eingabetaste blätterte auf Knöpfen weiter („Zurück" sprang vorwärts) und zusätzlich im Suchfeld des Wählers | nur aus einem Eingabefeld, und nicht, wenn jemand anderes die Taste schon behandelt hat |
| Treffer-Vorschau blieb nach dem Wiederherstellen unsichtbar | sie wird beim Start geholt, wenn ein Ort dasteht |

Dazu in der Dispo-Ansicht: nach dem Warten auf die Kundensperren schrieb der **frühere** Einsatz
Sperren und Zeitraum in den inzwischen gewählten — „Zuweisen" hätte B mit den Daten von A
abgeschickt. Jetzt schreibt nur der jüngste Lauf.

**6. Acht Wächter, die nur scheinbar etwas zusicherten** — jeder mit ausgeführter Rückmutation
belegt, die vorher grün blieb:

* Sperre im Feed: `params.includes(org)` statt Platzhalter **an seiner Stelle** — eine fest
  verdrahtete `$1` verglich die Sperre mit der Nutzer-Kennung (284/284 grün).
* Feed-Kopie: `params.includes(1)` wurde von der **Eintragszahl** 1 erfüllt — die Kopie fest auf
  die Bedarfs-Seite zu schreiben blieb unbemerkt (82/82 grün); genau der N4.4-Fehler.
* Umkreis: Formel und Radius gepinnt, der **Vergleich** dazwischen nicht — `<=` zu `>` blieb
  318/318 grün.
* Detailansicht „bleibt offen": nur `notEqual(409)` — ein 404 für jedes Unternehmen blieb grün.
* Preis-Tor: „requireFeature wurde irgendwann aufgerufen" — das Tor aus der Route zu nehmen blieb
  grün (65/65).
* Entwurfs-Probe lief mit leerer Personenzahl, die es im Markup nicht gibt.
* Bedarfs-Verweis: das **ODER** zwischen Start-Firma und Mitgliedschaft war nicht gepinnt — ein UND
  blieb auch gegen die echte Datenbank grün.
* Leerzustand-Wächter schnitt 900 Zeichen aus und zählte einen Verweis im **Treffer**-Zweig mit.

**7. Doku:** `docs/API.md` beschrieb `POST /assignments` noch als Weg, einen Deal zu verknüpfen —
genau das lehnt der Endpunkt seit N2.9 ab. Jetzt stehen dort alle neuen Antworten.

**Verifikation.**

* Neue Proben: `api/test/firmaAmBedarf.test.js` (17), `api/test/gegenpruefungFrontend.test.js` (14,
  mit ausgeführtem Code in vm-Sandkästen), `api/test/integration/firmaAmBedarf.flow.test.js` (7
  gegen die echte Datenbank: Spalte, Rückfall, **der Nachtrag der Migration selbst**, Blättern mit
  echten Gleichständen, Umkreis „innerhalb").
* **32 Rückmutationen, alle rot:** 21 am Backend und an den Wächtern (15 davon zusätzlich mit
  Datenbank), 11 am Frontend.
* **Zwei davon überlebten im ersten Lauf** — und der Fehler lag in meinen eigenen Proben: Die
  beiden Eingabetasten-Proben ließen die Pflichtfelder leer, und dann blättert der Assistent
  ohnehin nicht weiter. Sie prüfen jetzt zuerst, dass die Taste unter denselben Bedingungen
  wirklich blättern **würde**. Dabei kam eine dritte Probe dazu (fremd behandelte Taste).
* **Ehrlich benannt:** die Rückmutation „Zusammenführung ohne Tie-Break" wurde nur **ohne**
  Datenbank rot. Mit Datenbank blieb sie grün, weil das Fenster beider Marktseiten immer bei 0
  beginnt und JavaScript stabil sortiert — die Kennung ist dort Absicherung, kein Fehler von heute.
* Beim Bauen an den eigenen Proben gefunden: eine Probe las meinen **Kommentar** über die alte
  Stelle als Code; eine andere scheiterte, weil ein `COUNT(*)` im Muster-Pool keine Zeile lieferte —
  die alte „nicht 409"-Fassung hatte verdeckt, dass die Ansicht dort nie 200 erreichte.

**Offen, benannt:** die elf Befunde über der Prüfgrenze sind hier behoben, aber **nicht** von einem
unabhängigen Skeptiker geprüft worden. Wer die nächste große Prüfung fährt, sollte die Grenze
höher setzen (oder in zwei Läufen prüfen) — 20 Befunde bei 9 Prüfplätzen war zu eng.

---

### 2026-09-15 — Die DSGVO-Auskunft liefert wieder, und Löschen räumt die Einsatzplanung auf (N2.10)

**Status:** erledigt · **Kategorie:** Bug (Compliance, Art. 15/17) + drei Owner-Entscheide ·
**Quelle:** offene Rechtsfrage aus N2.9; beim Umsetzen zwei weitere Befunde gefunden

**1. Die Auskunft hat für niemanden funktioniert.** Owner-Entscheid war: Vormerkungen der
Warteliste gehören in die formale Auskunft (Art. 15) — neutral benannt, in der Oberfläche nie.
Beim Einbauen, gegen die Entwicklungsdatenbank gemessen: `exportUserDataFull` lieferte für ein
echtes Kräfte-Konto `null`. Die erste Abfrage verlangte `users.plan` und `users.is_active`
(gibt es nicht), `safeQuery` schluckte den Fehler, und **`GET /api/me/export` antwortete jedem
Nutzer mit 404**. Sechs weitere Abschnitte kamen still leer an (`company_contacts`,
gesendete Anfragen, Bewertungen, Angebote, Abos, Rechnungen — jeweils eine Spalte, die es nicht
gibt), im Org-Export zwei (`om.role`, `contracts.org_id`). Der SQL-Schema-Wächter führte die
Spalten als „Bestand" — gesehen, nicht behoben.

Jetzt: alle Abfragen korrigiert und für `dataGovernanceService.js` **ohne Wächter-Ausnahme**;
Koordinaten des Kontos (seit N2.0) in der Auskunft; Geheimnisse (Passwort-Hash, MFA/TOTP,
Tokens) bewusst nie. **Einsatzplanung:** Einladungen und Vormerkungen mit Rang, Punktzahl,
Gründen, Zeitarbeitsfirma, Tätigkeit und Zeitraum — **ohne Kundenunternehmen** (Art. 15 Abs. 4)
— und einem neutralen Hinweis. Beide Auskünfte (Konto und Profil ohne Konto) lesen aus
denselben Abfragen in `assignmentStaffingService`.

**2. Löschen ließ einen Menschen im Kandidatenpool.** Keiner der drei Löschpfade fasste die
Einsatzplanung an. `anonymizeUser` (`DELETE /me`) ließ das Profil sogar **aktiv**: die Person
blieb in Vorschlägen („[Gelöscht]"), ihre Vormerkungen standen, und das automatische Nachrücken
konnte einen gelöschten Menschen einladen und benachrichtigen. Die Wohnort-Koordinaten blieben.
Owner-Entscheid „vollständig aufräumen" — `raeumeEinsatzplanungAuf`, in der Transaktion jedes
Löschpfads (`anonymizeUser`, `deleteWorkerData`, `anonymizeWorkerProfile`):

| Was | danach |
|---|---|
| Profil / Koordinaten | inaktiv / gelöscht |
| Reservierungen | freigegeben (`person_geloescht`) |
| Einladungen, Auswahl-Sets | offene zurückgezogen — auch die angenommene Einladung, deren Reservierung freigegeben wurde |
| Unbeantwortete Einsatzanfragen | wie eine Ablehnung (derselbe Zustand wie beim Ablehnen im Portal) |
| Vormerkungen | **gelöscht** — Bewertungsdaten ohne Zweck |
| Offene Marktangebote der Person | archiviert |
| Betroffene Einsätze | Zähler neu gerechnet — der frei gewordene Platz wird sichtbar |
| Einsätze, Stundenzettel, Rechnungen | bleiben (HGB §257) |

**3. Die Löschsperre griff nur halb.** Owner-Entscheid „beides sperren":
* **Rechnungen:** der Riegel fragte `invoices.created_by` (gibt es nicht) und den Status `sent`
  (gibt es auch nicht) — `OPEN_INVOICES` hat **nie** gegriffen. Jetzt `user_id` und
  `draft`/`issued`/`overdue`.
* **Eigene Einsätze:** geprüft wurden nur Einsätze, die jemand *angelegt* hat (der Disponent).
  Eine Kraft konnte ihr Konto mitten im Einsatz löschen. Jetzt `ACTIVE_DEPLOYMENTS`: zugesagte
  Einsätze, heute (Europe/Berlin) noch nicht beendet. Unbeantwortete Anfragen sperren nicht —
  die zieht die Löschung zurück.
* **Fail-closed:** jede Sperr-Prüfung lief durch `safeQuery` — ein Fehler hieß „kein Hindernis".
  Genau so ist der Rechnungs-Riegel unbemerkt gestorben. Jetzt scheitert die Löschung (500),
  statt still durchzugehen.

**Verifikation.**

* `api/test/auskunftFunktioniert.test.js`, `api/test/loeschenRaeumtAuf.test.js` — Zustände,
  Bindungen, Transaktionsgrenze, fail-closed, Route 409/500, alle drei Löschpfade.
* `api/test/integration/auskunft.flow.test.js` — die Auskunft gegen die echte Datenbank mit
  mitgeschriebenen Abfragefehlern: **null**.
* `api/test/integration/loeschenRaeumtAuf.flow.test.js` — die ganze Einsatzplanung einer echten
  Kraft aufgebaut (Einladung, angenommene Einladung mit Reservierung, Auswahl-Set, Anfrage,
  Vormerkung, Marktangebot, beendeter Einsatz), beide Sperren, Löschung über den `DELETE /me`-Pfad.
* **31 Rückmutationen, alle rot:** 13 an der Auskunft (Spalten, Bindung an die Person, Kunde in
  Vormerkung und Einladung, Passwort-Hash, Koordinaten, Hinweis, Org-Export), 18 an Löschen und
  Sperre (Profil aktiv, Koordinaten, jeder Bereinigungsschritt einzeln, keine Neuberechnung,
  Rechnungs-Status, heute endender Einsatz, Anfrage sperrt, fail-open, alle drei Löschpfade) —
  15 davon zusätzlich mit Datenbank rot.
* Beim Bauen an den eigenen Proben gefunden: eine Probe suchte `expires_at` im ganzen SQL-Text —
  Einladungen haben die Spalte zu Recht (Teilzeichenketten-Falle, jetzt je Tabelle); die
  Datenbank-Probe schrieb `org_id` in eine Tabelle ohne diese Spalte; eine Rückmutation
  („Einladung nennt den Kunden als Firma") war nur ohne Datenbank rot — die Datenbank-Probe
  prüft die Firma jetzt auch bei der Einladung.

**Offen, benannt:** die Auskunft ist für Kräfte noch nicht vollständig — Einsatz-Verknüpfungen,
Abwesenheiten, Dokumente und Beschwerden stehen in der Profil-Auskunft, aber nicht in der
Konto-Auskunft (`GET /api/me/export`). Eine gemeinsame, testerzwungene Inventur „jede Tabelle mit
`user_id`/`worker_user_id` ist in der Auskunft oder begründet ausgenommen" wäre der nächste Schritt.

---

### 2026-09-14 — Ein Angebot, ein Einsatz — und eine Anlage, die nichts an Fremdes hängt (N2.9)

**Status:** erledigt · **Kategorie:** Owner-Entscheid (Schema) + Security (Org-Boundary) ·
**Quelle:** offener Punkt aus N2.8, Sicherheitsbefund beim Klären gefunden

Drei Owner-Entscheide vom 13.09., in dieser Reihenfolge umgesetzt.

**1. Genau eine Zuweisung je Angebot — Ausfälle über die Warteliste im Einsatz.** Die Frage aus
N2.8 war: eine oder mehrere, „mit Warteliste, falls die erste nicht mehr läuft"? Beim Klären
stellte sich heraus, dass die Warteliste **längst existiert** (`assignment_staffing_waitlist`,
Migration 089) — und zwar **innerhalb** eines Einsatzes: fällt eine Kraft aus, rückt die nächste
in **denselben** Einsatz nach, der Staffing-Worker füllt automatisch nach. Vertrag, Stundensatz,
Stundenzettel und Rechnung bleiben eine Linie. Ein zweiter Einsatz am selben Angebot wäre ein
zweiter Vertragsdatensatz für dieselbe Vereinbarung — und genau die doppelte Zusage aus N2.8.

**Migration 217** (`217_eine_zuweisung_je_angebot.sql`): eindeutiger Teilindex
`assignments_offer_eindeutig` auf `assignments(offer_id) WHERE offer_id IS NOT NULL`; er ersetzt
den gewöhnlichen `assignments_offer_idx`. Liegen Doppelte vor, bricht die Migration **mit ihrer
Anzahl ab**, statt eine Zeile zu löschen — an einer Zuweisung hängen Stundenzettel und Rechnungen
(HGB §257). Gemessen vor dem Einspielen: 5 Zuweisungen mit Angebot, 5 verschiedene Angebote.
Eingespielt auf der Entwicklungsdatenbank; Rollback steht in der Datei.

**2. Sicherheitsbefund: die manuelle Einsatz-Anlage übernahm sechs Fremdschlüssel ungeprüft.**
`POST /api/assignments` schrieb `offer_id`, `supplier_org_id`, `demand_request_id`,
`deal_request_id`, `contract_id` und `requisition_id` direkt in den Einsatz — geprüft wurden nur
Standort und Abteilung. Wer das Anlagerecht hatte (auch per API-Schlüssel mit `write:assignments`),
konnte einen Einsatz an ein **fremdes Angebot** oder eine **beliebige Zeitarbeitsfirma** hängen:
er erschien in deren Portal (die Liste liest beide Seiten), und sobald er besetzt war, zählte er
im Handelsstand gegen die freie Kopfzahl des fremden Angebots. `PATCH` ließ dasselbe für
`contract_id` zu.

| Verweis | jetzt |
|---|---|
| `offer_id`, `deal_request_id` | **400 `LINK_VIA_DEAL_ONLY`** — setzt nur der Deal-Abschluss |
| `requisition_id` | muss der Org gehören, sonst 403 |
| `demand_request_id` | Anleger gehört der Org (`users.org_id` oder aktive Mitgliedschaft), sonst 403 |
| `contract_id` | Käufer = Org, sonst 403; nennt der Rumpf eine andere Firma als der Vertrag: 400 |
| `supplier_org_id` | eigene Org, oder **erklärter Partner**: Vendor-Pool aktiv/nicht gesperrt/nicht abgelaufen, aktiver Rahmenvertrag, oder ein Einsatz aus einem Deal; sonst 403 `SUPPLIER_NOT_PARTNER` |
| ohne Org-Kontext | Verweise werden abgelehnt (400), nicht ungeprüft geschrieben |

Fremd und nicht vorhanden sind **dieselbe** Antwort — sonst ließe sich mit der Anlage abfragen,
welche Kennungen es bei anderen gibt. Die Prüfung sitzt in `assignmentService.pruefeAnlageVerweise`
/ `pruefeVertragsVerweis`; die Route bleibt dünn.

**Grenze, benannt:** „erklärter Partner" beweist eine Beziehung, die die **Org selbst** angelegt
hat (Vendor-Pool, Vertrag) — nicht die Zustimmung der Zeitarbeitsfirma. Das ist eine eigene,
auditierte Handlung an anderer Stelle, keine Nebenwirkung eines einzelnen Aufrufs.

**3. Die Warteliste läuft still.** Owner-Vorgabe: „keiner soll mitbekommen, dass er vorgemerkt ist
für ein Angebot, das er sehr wahrscheinlich niemals annimmt." **Gemessen: der Code hält das
bereits ein** — kein Kräfte-Endpunkt liest die Warteliste, benachrichtigt wird nur bei einer
echten Einladung. `api/test/wartelisteBleibtStill.test.js` hält es fest, an der Wirkung:
Vormerken schreibt keinen Kontakt; eine Kampagne benachrichtigt die Eingeladenen, das mitgefüllte
Polster nicht; Anfragen und Auswahl-Sets der Kraft lesen die Warteliste nicht; das Kräfte-Portal
hat keinen Pfad dorthin.

**Offen, benannt (Owner, Rechtsfrage):** eine **formale DSGVO-Auskunft** (Art. 15) ist keine
Oberfläche. `exportUserDataFull` nennt heute weder Einladungen noch Vormerkungen. Ob eine
Vormerkung dort erscheinen muss (Rang und Punktzahl sind personenbezogene Daten), entscheidet der
Owner — nicht der Code. Empfehlung: in der Auskunft ja, neutral benannt; in der Oberfläche nie.

**Verifikation.**

* `api/test/einsatzAnlageVerweise.test.js` — 22 Proben am Handler: Antwort **und** ob der Einsatz
  geschrieben wurde, Bindung der Org aus der Sitzung, Form der Partner-Abfrage.
* `api/test/wartelisteBleibtStill.test.js` — 5 Proben; jede prüft zuerst, dass ihr Gegenstand
  wirklich eingetreten ist (vorgemerkt, zugestellt, Quelle gelesen).
* `api/test/integration/einsatzVerweise.flow.test.js` — die Prüfung gegen die **echte** Datenbank
  (7 Fälle, Transaktion mit ROLLBACK): Vendor-Pool aktiv/gesperrt/abgelaufen/ausgesetzt/Gegenrichtung,
  Vertragsentwurf vs. aktiv, Deal-Einsatz, Bedarf.
* `freieKopfzahl.flow.test.js`: der Fall „zwei Zuweisungen" ist nach §0.9 umgestellt — er
  kodierte einen Zustand, den das Schema jetzt verbietet, und beweist nun das Verbot selbst
  (`23505` auf `assignments_offer_eindeutig`).
* **28 Rückmutationen, alle rot:** 19 am Sicherheitsfix, 5 an der stillen Warteliste, 4 nur
  mit Datenbank fangbare (heute Ablaufendes, Vertragsentwurf, Gegenrichtung, Bedarf ohne Org).

**Beim Rückmutieren an meinen eigenen Proben gefunden:** die Großbuchstaben-Probe benutzte eine
Kennung **nur aus Ziffern** — `toUpperCase()` änderte nichts, die Probe war wirkungslos. Sie prüft
jetzt zuerst, dass sich die Kennung ändert.

---

### 2026-09-13 — Die freie Kopfzahl filtert vor dem LIMIT (N2.8)

**Status:** erledigt · **Kategorie:** Bug-Pattern (zwei Befunde in bestehendem Code)

**1. Seiten wurden kürzer, und die Trefferzahl stimmte nicht.** Der Feed filterte die
**Gesamt**-Kopfzahl in SQL (`cp.headcount >= N`) und die **freie** Kopfzahl erst danach in
JavaScript. Ein Angebot mit 20 Plätzen und 19 Zusagen kam bei „mindestens 2" durch SQL, wurde
gezählt — und fiel dann aus der Seite. Ebenso ein aktives Angebot ohne freien Platz, dessen
Status noch nicht synchronisiert war.

Jetzt rechnet ein `LEFT JOIN LATERAL` die zugesagte Kopfzahl je Angebot, und **beide**
Kopfzahl-Filter stehen in Zählung und Abfrage. Die JavaScript-Kopien sind entfernt: bei der
kleinsten Abweichung hätten sie wieder genau das getan, was behoben ist.

**2. Zwei Zuweisungen verdoppelten die Zusage — und nahmen ein Angebot aus dem Markt.**
`getCapacityCommercialStates` joinete `assignments` direkt. `assignments.offer_id` ist **nicht
eindeutig** (kein UNIQUE-Index). Trägt ein Angebot zwei Zuweisungen, erscheint es zweimal im
Verbund, und die Summe zählt seine Zusage doppelt. Die freie Kopfzahl fällt auf null, und
`syncCapacityCommercialState` setzt das Angebot auf `reserved` — **es verschwindet aus dem
Markt, obwohl Plätze frei sind.** Heute hat kein Angebot zwei Zuweisungen; das Schema
verhindert es nicht. Die Zuweisungen werden jetzt je Angebot vorab summiert.

**Eine Formel statt drei.** Die Rechnung „wie viele Personen belegt ein Angebot" stand in
**drei** Diensten als eigene Abschrift: Handelsstand/Feed (`capacityExchangeService`),
Anlage-Treffer (`marketplaceService`) und die Zahlen „N Kräfte verfügbar"
(`capacityDiscoveryService`, fünf Aggregate). Sie kommt jetzt aus einem eigenen, abhängigkeitsfreien
Modul `api/services/zusageFormel.js` — ein eigenes Modul, weil `marketplaceService` bereits
`capacityExchangeService` importiert und die Gegenrichtung ein Zirkel wäre.

**Gegen die laufende Datenbank belegt** (Transaktion mit ROLLBACK, Angebot mit 20 Plätzen):

| Fall | Ergebnis |
|---|---|
| 19 zugesagt, „mindestens 2" | nicht im Feed · total 5 = 5 Einträge |
| 19 zugesagt, „mindestens 1" | im Feed · total 7 = 7 Einträge |
| zwei Zuweisungen am selben Angebot | zugesagt 19 — der alte Verbund lieferte 38 |
| voll gebucht, Status noch `active` | nicht im Feed · total 6 = 6 Einträge |

**Beim Bauen gefangen:** eine lange Erklärung stand **im** SQL-Text — sie ging bei jeder Abfrage
an Postgres, und eine Probe hielt den Satz „hier stand `LEFT JOIN assignments …`" für den
Verbund selbst. Die Erklärung steht jetzt vor der Abfrage.

**Offen, benannt:** eine UNIQUE-Bedingung auf `assignments(offer_id)` — falls ein Angebot fachlich
nie mehr als eine Zuweisung haben soll. Das ist eine Schemaentscheidung und liegt beim Owner; die
Abfrage rechnet jetzt in beiden Fällen richtig. **→ Entschieden 2026-09-13, umgesetzt in N2.9:**
genau eine Zuweisung je Angebot (Migration 217), Ausfälle über die Warteliste im Einsatz.

**Verifikation — und was eine kleine Gegenprüfung an meinen Proben fand.**

Nach dem ersten Bau standen 8 Rückmutationen ohne Überlebende. Eine Gegenprüfung mit zwei
Blickwinkeln (Semantik, Qualität der Proben) fand **keine** veränderten Ergebnisse — sie bestätigte
den Defekt sogar selbst (24 von 189 Fällen mit `total` über der Zahl der Einträge, jeder mit
Mindestwert). Aber sie fand **11 Mutationen, die meine Proben überlebten**, per Ladehaken im
Speicher angewandt:

* Die Proben prüften nur den **Rahmen** des Zusage-Blocks. `capacity_post_id = cp.id` →
  `IS NOT NULL` (die Zusagen der **ganzen Plattform**), `SUM` → `MAX`, `demand_requests … ON TRUE`
  blieben grün.
* „Eine Formel" prüfte die exportierte Konstante, nicht die **tatsächlich gesendeten** Texte —
  Zählung und Abfrage konnten verschieden rechnen.
* Die Platzhalter-Probe lief nur an Stelle `$1`; ein fest verdrahtetes `$1` fiel nicht auf, obwohl
  die Route dort die Betrachter-Kennung bindet.
* Eine Schleifen-Probe konnte ohne eine einzige Zusicherung grün sein; vertauschte
  Zuweisungs-Spalten fielen nicht auf; zwei Kommentare waren veraltet.

Alle behoben. **Und beim Nachmessen überlebte eine Mutation meine eigene Härtung:** die neue Probe
suchte `")::int AS zugesagt"` als Teilzeichenkette — `zugesagt_n` enthält das. Jetzt mit Wortende.

**Endstand:** 30 Proben in `trefferzahlStimmt.test.js`, alle 11 Mutationen der Gegenprüfung **ohne
Datenbank** rot, dazu `api/test/integration/freieKopfzahl.flow.test.js` — der Datenbank-Beweis
als echte Probe (5 Fälle, Transaktion mit ROLLBACK, datenbankgebunden).

---

### 2026-09-13 — Was die Pruefung am Umkreis fand (N2.7)

**Status:** erledigt · **Kategorie:** Bug-Pattern · **Quelle:** adversarische Prüfung vom
12.09., Befunde von Hand bestätigt

Sieben bestätigte Befunde rund um Umkreis, Blätterung und Koordinaten — **drei davon in meiner
eigenen Arbeit aus N2.0/N2.4b**.

| Befund | was falsch war | jetzt |
|---|---|---|
| Blätterung der Bedarfsseite | Bedarfe wurden nur „für den Rest der Seite" und **ohne OFFSET** geholt; Seite 2 wiederholte Seite 1. Eine Zeitarbeitsfirma holte Angebote, die sie nie sieht, und verbrauchte damit ihre Seite | geholt wird nur, was der Betrachter sieht; jede Seite blättert in SQL |
| Nähe über beide Seiten | beim Umzug des Umkreisfilters nach SQL (N2.4b) ist die gemeinsame Sortierung **verschwunden** — Angebote in 100 km vor einem Bedarf in 200 m | beide Seiten gemeinsam sortiert, dann geschnitten |
| Zwei Definitionen von „Umkreissuche" | die Rangsortierung prüfte `!= null`, der Filter `isFinite` — `latitude=abc` schaltete die Rangsortierung still ab | eine Definition: die, nach der gefiltert wird |
| Stadtfilter in der Vorschau | die Treffer-Vorschau schickte `&city=` mit → **exakter** Stadtname zusätzlich zum Umkreis; Norderstedt fiel bei „Hamburg, 50 km" heraus | kein Stadtfilter — der Punkt steht für den Ort |
| Punkt zu spät | N2.0 trug Koordinaten **nach** dem Anlegen nach. `runInitialMatching` lief aber davor — der erste Durchgang samt Mails an bis zu 15 Anbieter rechnete ohne Punkt | der Punkt entsteht **vor** dem Datensatz |
| Notdienst ohne Punkt | der Notdienst-Zweig kehrte **vor** dem Nachtragen zurück — der dringendste Bedarf bekam nie Koordinaten | beide Wege bekommen den Punkt, bevor verzweigt wird |
| Kein Zeitlimit | antwortete Nominatim nicht, hing das Absenden eines Bedarfs | `GEO_TIMEOUT_MS = 3000`; danach entsteht der Datensatz ohne Punkt |
| „N Kräfte im Umkreis" | gezählt wurden **Angebote**; ein Sammelangebot trägt oft mehrere Personen — „3 Kräfte" bei 24 verfügbaren | „N Angebote im Umkreis". Eine echte Personenzahl bräuchte die freie Kopfzahl in SQL — offen |

**Die Probe, die die Reihenfolge bewachen sollte, war grün.** Sie verglich die Position zweier
Zeichenketten im Quelltext — Nachtragen vor `scheduleMatchTrigger`. Das erste Matching stand
aber noch weiter oben. Ersetzt durch `api/test/punktVorDemBedarf.test.js`: Kartendienst über
`fetch` ersetzt, Route ausgeführt, gemessen wird, was in der Datenbank ankommt und **in welcher
Reihenfolge**.

**Gegen die laufende Datenbank belegt:** Zeitarbeitsfirma, 4 je Seite — Seite 1 und 2 ohne
Doppelte, alle Seiten zusammen genau `total` (10 von 10). Beide Seiten mit Umkreis — nach
Nähe sortiert. Müll-Koordinaten — gleiche Zahl und Reihenfolge wie ohne Umkreis.

**Weiterhin nach dem LIMIT, benannt:** die Nachfilter der Angebotsseite (`visible_to_viewer`,
`min_headcount`, freie Kopfzahl) können eine Seite weiter kürzen. Eigener Befund, nicht Teil
dieser Welle. **→ Behoben in N2.8** (die beiden Kopfzahl-Filter); `visible_to_viewer` bleibt, weil
SQL dort schon strenger eingrenzt.

**Und ein Fehler in einer eigenen Probe, beim Rückmutieren gefunden:** die Zeitlimit-Probe
arbeitete mit einem `fetch`, das nur auf ein Abbruchsignal reagiert. Ohne Frist hing sie
**ewig**, statt rot zu werden — und das Mutationsskript stellt die Datei erst nach dem Lauf
wieder her. Der Lauf musste von Hand beendet werden. Eine Probe, die bei fehlender Frist hängt,
ist selbst eine fehlende Frist; sie bricht jetzt selbst ab.

---

### 2026-09-12 — Die Kundensperre an den uebersehenen Stellen (N4.5)

**Status:** erledigt · **Kategorie:** Rollen-/Sichtbarkeitslogik + Bug-Pattern ·
**Quelle:** adversarische Prüfung vom 12.09., Befunde von Hand bestätigt

**Der schwerste Befund betraf eine eigene Zusage.** N4.1 hatte gemeldet: „Detailansicht: 409".
Der Riegel **hat nie ausgelöst.** Er las `entry.worker_profile_id` — und diese Spalte steht mit
Absicht **nicht** in der öffentlichen Projektion (`NUR_INTERN`: „`is_anonymous` ist das
Versprechen; diese Spalte draußen zu halten ist sein Vollzug"). Die Bedingung war immer falsch.

**Die Probe dazu war grün, weil sie die Spalte selbst in die Muster-Zeile geschrieben hatte.**
Der Muster-Pool lieferte, was die Produktion nie liefert. Die Muster-Zeile wird jetzt **aus
der echten `OEFFENTLICH`-Liste gebaut** — wer die Spalte eines Tages öffentlich macht, ändert
damit auch die Probe, und wer den Riegel wieder auf sie stützt, fällt durch.

**Die Lösung macht die Spalte nicht öffentlich.** `isCapacityPostBlockedForCompany` löst die
Kraft serverseitig über die **Angebots**-Kennung auf und benutzt danach dieselbe
Einzelprüfung wie überall.

**Fünf weitere Stellen kannten die Sperre nicht — und drei davon schreiben Anbieter an:**

| Stelle | was dort passierte |
|---|---|
| `runInitialMatching` (Anlage) | die Treffer, aus denen der Anlagepfad **bis zu 15 Anbieter anmailt** |
| `matchRequisition` | die Vorschläge in der Bedarfsansicht, mit Titel, Ort und Anbieter |
| `instantMatchFromParams` | hinter dem Match-Trigger (**schreibt beide Seiten an**) und der Notdienst-Alarmierung |
| `escalateEmergency` | die Eskalation schreibt **bis zu 50 Anbieter** an |
| `matchCapacityToRequisitions` | die **Gegenrichtung**: ein neues Angebot ging an das sperrende Unternehmen |

**Die Sperre bekommt eine eigene Angabe `kundeOrgId` — und nicht `orgId`.** Im Match-Trigger
hängt an `orgId` auch, **wer benachrichtigt wird** (`resolveRecipients`), und im Sofort-Abgleich
die Vendor-Pool-Rangfolge. Die Sperre darf beides nicht verschieben.

**Der Normalfall bezahlt nichts.** Ohne Kunden-Org bleiben alle drei Abfragen **wortgleich** mit
ihrer bisherigen Fassung; die Gegenrichtung lädt Nutzer-Orgs nur, wenn die Kraft überhaupt
irgendwo gesperrt ist.

**Beim Einbau habe ich denselben Fehler einmal wiederholt.** Die Eskalation las
`demand.requester_company_id` aus einer Abfrage, die diese Spalte gar nicht auswählte — der neue
Riegel war dort so tot wie der alte in der Detailansicht. Gefunden vor dem Commit, beim
Gegenlesen jeder neuen Lesestelle gegen ihre Abfrage; die Probe prüft jetzt auch, dass die
Spalte **geladen** wird.

**Und eine stille Ausweitung:** `GET /workers/blocks` fiel bei einer gesendeten, aber krummen
`company_org_id` auf die **ungescopte** Liste zurück — der Disponent sah dann „gesperrt bei
diesem Kunden" an Kräften, die bei einem anderen gesperrt sind. Jetzt `400
INVALID_COMPANY_ORG_ID`. Die frühere Probe hatte den Rückfall als Soll festgeschrieben; sie ist
mit Begründung korrigiert (§0.9: Test kodierte einen Fehler).

**Verifikation.** 53 Proben in `api/test/gesperrtHeisstUnsichtbar.test.js` (13 neu),
**17 Rückmutationen ohne Überlebende** — **vier davon überlebten zuerst**: die Dienste waren
bewacht, die **Übergabe der Org in den Routen** nicht. Man konnte in der Bedarfsansicht die Org
des *Betrachters* statt des *Bedarfstellers* übergeben, ohne dass etwas rot wurde. Alle fünf neu
erzeugten Abfragen **gegen die laufende Datenbank geplant** (exakter Produktionstext, abgefangen
aus den Diensten). 12 bestehende Suiten der berührten Dienste unverändert grün.

---

### 2026-09-12 — Abbrechen verliert nichts (N2.5)

**Status:** erledigt · **Kategorie:** Produktausbau — **damit ist Abschnitt N2 vollständig**

Wer den Assistenten schließt und wiederkommt, findet seinen Stand vor — Eingaben **und** den
Schritt, an dem er aufgehört hat.

**Im Browser, nicht auf dem Server, und das ist eine Entscheidung.** Ein `status='draft'` in
`demand_requests` bräuchte eine Migration **und** einen zusätzlichen Filter in *jeder* Abfrage,
die Bedarfe liest. Genau diese Fehlerklasse hat diese Welle mehrfach behoben — in N4 fehlte die
Sperre in vier von fünf Flächen, in N2.4 zählte die Trefferzahl die falsche Marktseite. Ein
halbfertiger Bedarf, der in den Feed rutscht, wäre der teuerste Ausgang: eine Zeitarbeitsfirma
antwortet auf etwas, das niemand abgeschickt hat.

**Der Preis dieser Wahl wird benannt:** der Entwurf lebt in *diesem* Browser. Wer das Gerät
wechselt, fängt neu an. Für einen halbfertigen Bedarf ist das vertretbar — für einen
abgeschickten wäre es das nicht, und der liegt auf dem Server.

**Drei Regeln, die den Unterschied machen:**
* **Die bloße Ortsvorbelegung ist kein Stand.** Der Ort wird beim Öffnen aus dem
  Standortkontext gefüllt (N2.1), der Umkreis hat einen Standardwert. Zählte das als Entwurf,
  meldete sich das Formular beim zweiten Besuch mit einem „Stand", den niemand eingegeben hat.
* **Nach dem Absenden gelöscht** — sonst startet der nächste Bedarf vorbelegt mit dem vorigen,
  und der Kunde schickt womöglich zweimal dasselbe ab.
* **Nach sieben Tagen verworfen** — ein zwei Wochen alter Entwurf trägt ein Startdatum in der
  Vergangenheit. Ab da ist ein leeres Formular ehrlicher als ein alter Stand.

**Eine gemessene Reihenfolge-Falle entschied den Einbauort.** Der Katalogwähler liest seine
Vorauswahl **beim Montieren** aus dem versteckten Feld `skill_tags`. Stünde die
Wiederherstellung weiter unten (in der Assistenten-IIFE), kämen die Fähigkeiten zu spät: im
Feld, aber nicht angeklickt. Der Entwurfsblock steht deshalb **vor** dem Wähler — und diese
Position ist bewacht, samt Selbsttest, dass der Wächter die umgekehrte Reihenfolge auch
wirklich bemerkt.

**Zwei eigene Fehler dabei gefangen.** Eine Probe forderte, der Entwurf dürfe ein gefülltes
Feld nicht anfassen — falsch: `headcount` und `radius_km` *stehen* im Markup auf Werten, und
wer sie ausnimmt, stellt genau die zwei Zahlen nicht wieder her, die der Kunde geändert hat.
Und eine zweite legte einen Eintrag hin und las ihn zurück; damit prüfte sie nur, dass JSON
funktioniert — das **Schreiben** des Schritts blieb unbewacht und überlebte die Rückmutation.

**Verifikation.** 15 Proben in `api/test/entwurfVerliertNichts.test.js` — der Entwurf wird
**ausgeführt**, mit Speicher-Ersatz —, **11 von 12 Rückmutationen gefangen**. Die zwölfte ist
kein Überlebender, sondern ein nicht greifender Anker; die betroffene Zusicherung (Position vor
dem Wähler) ist durch eine eigene Probe mit Selbsttest gedeckt.

---

### 2026-09-08 — Offen: die adversarische Pruefung der Wellen N4/N2

**Status:** geplant, einmal fehlgeschlagen · **Owner-Vorgabe 2026-09-08**

**Was geprüft werden soll.** Der Diff `4434c99~1..HEAD` über `api/`, `frontend/`, `sql/` —
zehn Wellen aus dem 06./07.09., rund 4.700 Zeilen in 28 Dateien (N4, N4.4, N2.0, N2.0b,
N2.0c, N2.2, N2.4, N2.4b, N2.1, N2.6). Fünf Blickwinkel, je Befund zwei unabhängige
Skeptiker, die ihn zu **widerlegen** versuchen; im Zweifel gilt widerlegt.

Die Blickwinkel: SQL-Korrektheit und Einschleusung · verlorene Semantik (was konnte der alte
Code, was der neue nicht mehr?) · die Bedarfsanlage im Browser (vier IIFEs, Gültigkeitsbereiche,
i18n, ausgeblendete Pflichtfelder) · taugen die neuen Wächter etwas? · Mandantengrenze und
Preisgabe.

**Der erste Anlauf am 07.09. ist NICHT durchgelaufen** — alle fünf Finder starben am
Sitzungslimit. Das Ergebnis lautete `rohbefunde: 0`, und das heißt hier **„kein Agent kam
durch"**, nicht „alles sauber". Wer diese Zeile später liest: das war keine Prüfung.

**Wiederholung** am 08.09. gestartet, sobald das Limit wieder voll verfügbar war (die
ursprüngliche Planung nannte 11:30; der Start erfolgte um 13:11, weil das Limit erst dann
zurückgesetzt war).

**Das Skript liegt vor** und ist wiederverwendbar:
`.claude/projects/…/workflows/scripts/pruefe-welle-n-wf_bc573e4f-907.js` — es liest nur, ändert
nichts und committet nichts. Kosten des Laufs: rund 750.000 Subagent-Token.

**Bis die Prüfung durchgelaufen ist, gilt:** die zehn Wellen sind ausschließlich durch ihre
eigenen Wächter gedeckt (rund 130 Proben, rund 120 Rückmutationen ohne Überlebende) — also
durch dieselbe Hand, die sie gebaut hat.

**Stand des zweiten Anlaufs (08.09. gestartet, am 12.09. beendet): TEILWEISE gelaufen.**
Zwei der fünf Finder kamen durch (Semantik, Mandantengrenze) und lieferten **13 Befunde**;
drei Finder und **alle 20 Skeptiker** starben am Sitzungslimit.

**Das Ergebnis des Skripts war an dieser Stelle irreführend.** Es sortierte jeden Befund, zu
dem **kein einziges** gültiges Urteil vorlag, als „widerlegt" ein — die Auswertung prüfte
`widerlegt === 0` nur, wenn Urteile vorlagen, und fiel sonst auf „nicht überlebt". Zehn
ungeprüfte Befunde standen damit als „widerlegt" in der Ausgabe. Wer nur die Zusammenfassung
liest, hätte „alles geprüft, nichts hält" verstanden. Die Befunde wurden deshalb **von Hand am
Code geprüft**: sechs bestätigt, die übrigen in N2.7 eingeplant (siehe dort).

**Nicht gelaufen und weiterhin offen:** die Blickwinkel SQL-Einschleusung, Browser-Verdrahtung
und Wächter-Qualität.

**Stand 2026-09-13:** alle 13 Befunde abgearbeitet — neun bestätigt und behoben (N4.5, N2.7),
zwei niedrig und erledigt (Meilisearch-Vorab-Liste, krumme Kennung), zwei nach Prüfung
zusammengefasst (die beiden Blätterungsbefunde sind eine Ursache).

---

## Übergabe an die nächste Sitzung (Stand 2026-09-12)

**Welle N, Abschnitt N2 — was steht:**

| Phase | Stand |
|---|---|
| N2.0 / N2.0b / N2.0c | ✅ Koordinaten: beim Anlegen, für den Bestand, und beide Marktseiten lösen gleich auf |
| N2.1 | ✅ fünf Schritte, der Ort vorn |
| N2.2 | ✅ Preisvorschlag an der vierten Frage |
| N2.3 | ✅ Notdienst wird abgeleitet (committet als „N2.1", siehe Abschnitt 5 des Plans) |
| N2.4 / N2.4b | ✅ Treffer-Vorschau; Trefferzahl und Umkreis vorher belastbar gemacht |
| N2.6 | ✅ Weg aus der Personalsuche, bewacht |
| N2.5 | ✅ Entwurf im Browser, mit Schritt |

**Damit ist Abschnitt N2 vollständig.** Die folgende Vorarbeit ist in N2.5 eingeflossen und
bleibt als Begründung stehen:

1. **Entwurf im Browser, nicht auf dem Server.** Ein `status='draft'` in `demand_requests`
   bräuchte eine Migration *und* einen zusätzlichen Filter in **jeder** Abfrage, die Bedarfe
   liest. Genau diese Fehlerklasse — ein Filter, der an einer von mehreren Stellen fehlt —
   hat diese Sitzung mehrfach behoben (N4, N2.4). Ein halbfertiger Bedarf, der in den Feed
   rutscht, wäre der teuerste Ausgang. `localStorage` hat dieses Risiko nicht. Hausmuster
   steht in `capacityExchangeDetail.js:1823` (`tc_`-Schlüssel, JSON, try/catch, weil der
   Speicher fehlen kann). Dazu gehören: **Löschen nach erfolgreichem Absenden** (sonst startet
   der nächste Bedarf vorbelegt) und eine **Altersgrenze**, weil ein zwei Wochen alter Entwurf
   ein Startdatum in der Vergangenheit trägt.
2. **Eine Reihenfolge-Falle, gemessen:** der Katalogwähler montiert in einem Skriptblock
   **vor** der Assistenten-IIFE und liest seine Vorauswahl beim Montieren aus dem versteckten
   Feld `skill_tags`. Ein Entwurf, der erst in `start()` des Assistenten zurückgeschrieben
   wird, käme **zu spät** — die Fähigkeiten wären wiederhergestellt, aber nicht angeklickt.
   Das Zurückschreiben muss vor der Montage des Wählers passieren.

**Ebenfalls offen, nicht von mir zu entscheiden:** Commit `1e3d539` (Live-Belegschaft, zwei
vergessene Importe). Die zweite Sitzung hat am 07.09. gemeldet, dass sie merget — **ob es
angekommen ist, ist hier nicht geprüft.** Solange nicht, zeigt der Container die kaputte
Fassung, obwohl der Quellbaum längst stimmt.

---

### 2026-09-07 — Der Weg von der Personalsuche zum Assistenten (N2.6)

**Status:** erledigt · **Kategorie:** Erreichbarkeit

**Fakt.** Die Bedarfsanlage war von `marketplace_demand_list`, `enterprise`,
`notdienst_leitstand` und `matching_results` aus verlinkt — ausgerechnet von
`capacity_search.html` („Personal finden") **nicht**. Also von genau der Fläche, auf der ein
Unternehmen sucht und nichts findet.

**Der allgemeine Erreichbarkeits-Wächter war dabei grün** — zu Recht: die Seite *war* von
irgendwo erreichbar. Die Owner-Vorgabe verlangt aber einen **bestimmten** Weg. Das ist der
Unterschied zwischen „kann man hinkommen?" und „kommt man von dort hin, wo man es braucht?".

**Zwei Wege, mit Absicht:** einer dauerhaft unter der Überschrift („Nichts Passendes dabei? →
Bedarf ausschreiben") und einer im **Leerzustand**, direkt bei „Keine Matches gefunden" — ein
Hinweis ohne nächsten Schritt ist eine Sackgasse.

**Der Wächter hat sich zweimal selbst korrigiert.** Die erste Fassung fragte nur, ob
*irgendwo* auf der Seite ein Verweis steht. Zwei Rückmutationen überlebten: man konnte den
dauerhaften Weg entfernen, und der im Leerzustand hielt die Probe grün — obwohl der erst
erscheint, wenn eine Suche null Treffer hatte. Wer noch nicht gesucht hat, hätte keinen Weg
gehabt. Jetzt prüft er das **statische Markup** (Skriptblöcke herausgeschnitten) und den
Leerzustand **getrennt**. Danach: 3 von 3.

**Verifikation.** 10 Proben in `api/test/erreichbarkeit.test.js`, **3 Rückmutationen ohne
Überlebende**, dazu ein Selbsttest, der eine bloße Erwähnung im Kommentar nicht als Weg
durchgehen lässt.

---

### 2026-09-07 — Die Treffer-Vorschau (N2.4)

**Status:** erledigt · **Kategorie:** Produktausbau

„Mit diesen Angaben: **23** Kräfte im Umkreis" — und die Zahl ändert sich mit jedem Schritt.

**Sie kommt aus demselben Endpunkt, dessen Ergebnis der Kunde später sieht**
(`/capacity-exchange/feed`, `limit=1`, nur `total` gelesen). Ein eigener Zähler wäre eine
zweite Wahrheit über denselben Markt — und die beiden liefen beim ersten Regelwechsel
auseinander. Nebeneffekt: der Feed zählt die **Sperrliste** dieses Unternehmens richtig mit,
wer hier gesperrt ist erscheint nicht in der Zahl.

**Die Zahl musste erst belastbar gemacht werden** — beides in dieser Sitzung:
* **N2.4** `total` addierte beide Marktseiten (ein Unternehmen las 23 und sah 6)
* **N2.4b** der Umkreis lief nach dem `LIMIT`, die Zahl kannte ihn nicht

Ohne diese zwei Reparaturen wäre die Vorschau eine hübsche Lüge gewesen.

**Der Punkt wird genauso bestimmt wie später am Server:** Freitext `„<PLZ> <Ort>"`, sonst der
Ort allein — dieselbe Reihenfolge wie in `marktGeoService` und (seit N2.0c) im
Angebotsformular. Sonst zählte die Vorschau gegen einen anderen Punkt als den, den der
angelegte Bedarf bekommt. Ein Ort wird **einmal** aufgelöst, auch ein Misserfolg wird gemerkt.

**Ohne auflösbaren Punkt gibt es KEINE Zahl.** Man könnte den Feed auch ohne Koordinaten
fragen — nur zählte er dann *alle* Kräfte der Plattform, während der Satz darüber „im Umkreis"
behauptet. Eine falsche Zahl ist schlimmer als keine.

**An der Wurzel behoben:** der Katalogwähler schrieb seine Auswahl in ein verstecktes Feld,
**ohne es zu melden** — ein per Skript gesetzter Wert löst kein `change` aus. Jeder Zuhörer
hätte pollen müssen. Das Ereignis gehört an die Stelle, die den Wert ändert.

**Eine Unstimmigkeit gefunden, die niemand bemerkt hätte:** der Rückfalltext im Code sagte
weniger als der Wörterbucheintrag. Ausgerechnet wer ohne geladenes Wörterbuch dasteht, hätte
den hilfreichen Teil („größerer Radius oder weniger Fähigkeiten hilft") nicht bekommen.

**Verifikation.** 14 Proben in `api/test/trefferVorschau.test.js` — die Vorschau wird
**ausgeführt** —, **15 Rückmutationen ohne Überlebende**.

Eine Rückmutation überlebte zuerst und deckte eine **zu schwache Probe** auf: sie stieß zwei
Abrufe an, aber beide lieferten dieselbe Zahl — alt und neu waren nicht unterscheidbar. Beim
Nachbauen zeigte sich, dass es **zwei** Wettlauf-Sperren gibt (eine nach der Ortsauflösung,
eine nach der Feed-Antwort) und die Probe nur die erste traf. Jetzt trifft sie beide. Eine
weitere Mutation ist **gleichwertig** und bewusst nicht in der Liste — sie entfernt eine
doppelt vorhandene Prüfung; sie festzunageln hieße, redundanten Code zu bewachen statt
Verhalten.

---

### 2026-09-07 — Beide Marktseiten loesen einen Ort gleich auf (N2.0c)

**Status:** erledigt · **Kategorie:** Bug-Pattern (bestehender Code, gefunden beim Vorbereiten
von N2.4)

**Fakt.** `frontend/public/js/pages/capacityExchangeForm.js` — das Formular, mit dem
Zeitarbeitsfirmen ihre Angebote anlegen — geokodierte **genau umgekehrt** zu dem, was gegen
den echten Dienst gemessen richtig ist: sobald eine Postleitzahl vorlag, nahm es die
**strukturierte** Abfrage (`postal_code=` + `city=`).

Genau diese ignoriert Nominatim meistens:

```
48143 + Münster  vs  nur Münster   0,0 km
21031 + Hamburg  vs  nur Hamburg   0,0 km
81929 + München  vs  nur München   0,0 km
13403 + Berlin   vs  nur Berlin    9,3 km
```

Der **Freitext** löst sie auf — 3,4 bis 10,6 km vom Ortsmittelpunkt.

**Warum das jetzt zählt.** Bis Welle N2.0 lagen ohnehin fast nirgends Koordinaten, und der
Umkreis wurde erst nach dem `LIMIT` in JavaScript angewandt — der Punkt war damit fast
folgenlos. Seit N2.0/N2.4b geokodiert der Server beim Anlegen **und** der Umkreis rechnet in
SQL mit diesen Punkten. Ein Angebot auf dem Stadtmittelpunkt statt im Stadtteil verschiebt
damit reale Treffer.

**Die eigentliche Gefahr war die Asymmetrie:** der Server legte Bedarfe auf den Stadtteil, das
Formular Angebote auf die Stadtmitte. Zwei Reihenfolgen, zwei Punkte für denselben Ort — je
nachdem, wer ihn gerade bestimmt. Die Entfernung hängt von beiden ab.

Jetzt dieselbe Reihenfolge wie im Server (`marktGeoService.koordinatenNachtragen`): Freitext,
und nur wenn der nichts findet, der strukturierte Weg. Findet keiner etwas, kommt `null` — ein
erfundener Punkt wäre schlimmer als keiner.

**Verifikation.** 5 Proben in `api/test/dieselbeOrtsaufloesung.test.js` — die Funktion wird
**ausgeführt** —, **5 Rückmutationen ohne Überlebende**. Eine davon koppelt Browser und Server
aneinander: wer die Freitext-Form auf einer Seite ändert, wird rot.

---

### 2026-09-07 — Fuenf Schritte, der Ort vorn (N2.1)

**Status:** erledigt · **Kategorie:** Produktausbau

**Owner-Vorgabe (Nachtrag 2026-09-06):** der Einsatzort wird ausdrücklich gefragt und steht
**vorn** — vorbelegt, aber änderbar. Der Grund ist kein Bedienkomfort: der Standortkontext ist
die **Rechnungsadresse oder Niederlassung**, nicht der **Einsatzort**. Eine Pflegeeinrichtung
mit vier Häusern sucht für *ein* Haus. Wer den Kontext ungefragt als Einsatzort nimmt, rechnet
die Entfernung gegen den falschen Punkt — und seit N2.4b rechnet sie wirklich.

**Kein zweites Formular.** Die Felder werden weder verschoben noch verdoppelt; das Skript
ordnet die **vorhandenen** je einem Schritt zu und blendet die übrigen aus. Es bleibt ein
Anlagepfad, ein Datensatz, eine Absendestelle. Ein zweiter wäre die Sorte Parallelstruktur,
die beim ersten Regelwechsel auseinanderläuft.

**Die fünf Schritte:** Ort · Was · Wie viele · Von wann bis wann · Wie teuer (mit
Preisvorschlag aus N2.2 und abgeleitetem Notdienst).

**Ohne JavaScript ändert sich nichts.** Erst `data-assistent="an"` am Formular lässt die
Ausblendregel greifen; fällt das Skript aus, steht das Formular wie zuvor als **eine** Seite
da und bleibt absendbar. Eine Regel ohne diese Bedingung machte aus einem Skriptfehler eine
unbenutzbare Seite.

**Der Absendeknopf existiert nur im letzten Schritt** — und die Eingabetaste blättert weiter,
statt abzuschicken. Sonst entsteht ein halber Bedarf: ohne Zeitraum läuft die
Notdienst-Ableitung ins Leere, ohne Rolle gibt es weder Preisvorschlag noch Matching.

**Die wichtigste Probe** vergleicht die Schrittzuordnung gegen das, was der Absendecode
**wirklich liest** (`document.getElementById("…").value`), nicht gegen eine gepflegte Liste.
Ein Feld, das in keinem Schritt steht, wäre unter dem Assistenten unerreichbar — der Bedarf
ginge stillschweigend ohne es raus.

**Zwei eigene Fehler dabei gefangen.** `ortVorbelegen()` gab seine Zusage nicht zurück (wie
zuvor `holePreis()` — dieselbe Stelle, dieselbe Lehre). Und eine meiner Proben strich den
Wächter `form[data-assistent="an"]` aus dem Text und suchte dann nach einer unbedingten
Regel — sie fand genau die, die sie selbst erzeugt hatte. Eine Probe, die sich ihren Befund
herstellt; sie zählt jetzt Vorkommen, statt zu ersetzen.

**Verifikation.** 16 Proben in `api/test/bedarfInFuenfSchritten.test.js` — der Assistent wird
**ausgeführt** —, **13 Rückmutationen ohne Überlebende**. Die Wächter aus N2.2 und der
Notdienst-Ableitung laufen unverändert weiter: 49 Proben zusammen grün.

---

### 2026-09-07 — Der Umkreis rechnet in SQL (N2.4b)

**Status:** erledigt · **Kategorie:** Bug-Pattern · **Owner-Freigabe 2026-09-07**

**Fakt.** Der Umkreis wurde erst *nach* der Datenbankabfrage in JavaScript angewandt — und
zwar **nach dem `LIMIT`**. Drei Folgen:

1. `total` kannte den Umkreis nicht. Wer 25 km suchte, las eine Zahl, die die ganze Republik
   zählte.
2. Eine Seite lieferte **weniger** Einträge als angefordert: erst 25 Zeilen geschnitten, dann
   davon die Hälfte weggefiltert.
3. Die Blätterung zeigte Seiten, die es nicht gab — und „nichts gefunden" auf Seite 2,
   obwohl Seite 3 wieder Treffer hatte.

**Jetzt rechnet Postgres**, mit derselben Haversine-Formel wie `haversineKm` — die Auswahl
darf nicht anders rechnen als die Anzeige. Gemessen gegen die laufende Datenbank, Suchpunkt
Hamburg-Bergedorf: **25 km → 9, 200 km → 9, 300 km → 11, 400 km → 13.**

**Zahlen statt Platzhalter, und das ist Absicht.** Die beiden Marktseiten haben verschiedene
Parameter-Regime (die Angebotsabfrage zählt `idx` hoch, die Bedarfsabfrage bindet gar nichts);
sie zusammenzuführen wäre ein größerer Eingriff als der, um den es hier ging. Die drei Werte
werden auf `Number.isFinite` und auf gültige Bereiche geprüft — eine geprüft endliche Zahl
kann nichts einschleusen, und ein Text kommt gar nicht erst durch.

**Von einer Probe zurückgeholt:** der alte Filter prüfte ausdrücklich `!= null`. Beim Umzug
ging das verloren — und `Number(null)` ist `0`. Ein fehlender Längengrad hätte damit still
**Greenwich** bedeutet, ein fehlender Breitengrad den Äquator: die Suche hätte gefiltert, ohne
dass jemand einen Punkt genannt hat.

**Ehrlich benannt:** die anderen Nachfilter der Angebotsseite (`visible_to_viewer`,
`min_headcount`, `remaining_headcount > 0`) laufen **weiterhin** nach dem `LIMIT` und können
eine Seite kürzen. Der Umkreis war der teuerste von ihnen, weil er als einziger die
Trefferzahl verfälschte; die anderen bleiben ein eigener Befund.

**Verifikation.** 16 Proben in `api/test/trefferzahlStimmt.test.js`, **11 Rückmutationen ohne
Überlebende**, dazu der Lauf gegen die echte Datenbank.

---

### 2026-09-06 — Die Trefferzahl zaehlt nur die eigene Marktseite (N2.4, Vorstufe)

**Status:** Vorstufe erledigt, **ein Rest offen und owner-pflichtig** ·
**Kategorie:** Bug-Pattern

**Fakt.** `browseFeed` gab `total = supply + demand` zurück und filterte `items` erst danach
nach der Marktseite des Betrachters. Gemessen mit 6 Angeboten und 17 fremden Bedarfen: ein
**Unternehmen** bekam `total: 23` und sah **6**. Die 17 waren die Einkaufslisten anderer
Unternehmen.

**Das ist nicht nur Anzeige.** `total` speist die **Blätterung**: über einer Liste mit sechs
Einträgen standen 23 Treffer, also mehrere Seiten, die es nicht gibt.

**Gefunden beim Vorbereiten der Treffer-Vorschau (N2.4).** Die Vorschau soll den Endpunkt
benutzen, dessen Ergebnis der Kunde später sieht — sonst gäbe es zwei Wahrheiten über
denselben Markt. Genau deshalb fiel auf, dass die vorhandene Zahl selbst nicht stimmt.

**Offen, und bewusst nicht mitgebaut:** der **Radius** wirkt weiterhin nicht auf `total`. Er
wird erst nach der Datenbankabfrage in JavaScript angewandt, und zwar **nach dem `LIMIT`** —
daher ist die Zahl bei gesetztem Umkreis zu groß, und eine Seite kann weniger Einträge
liefern als angefordert. Das zu beheben heißt, den Umkreis in SQL zu rechnen; das berührt die
Blätterung des ganzen Marktplatzes und gehört dem Owner vorgelegt.

**Verifikation.** 6 Proben in `api/test/trefferzahlStimmt.test.js`, **4 Rückmutationen ohne
Überlebende** — darunter „die Marktseiten sind vertauscht".

---

### 2026-09-06 — Der Marktplatz bekommt Koordinaten (N2.0)

**Status:** erledigt · **Kategorie:** Bug-Pattern (ein vorhandener Dienst wurde nie gerufen)

**Fakt, gemessen in der laufenden Datenbank.**

| Tabelle | Zeilen | mit Koordinaten | mit Radius |
|---|---|---|---|
| `demand_requests` | 40 | **5** | 40 |
| `capacity_posts` | 45 | **7** | 45 |

`matchingEngine.scoreMatch` bewertet die Entfernung nur, wenn **beide** Seiten Koordinaten
haben. Fehlt eine, fällt sie auf den Vergleich der Stadt-**Zeichenkette** zurück — exakt
geschrieben, 60 % des Ortsgewichts. Praktisch lief der Marktplatz also immer über den
Rückfall: „Münster" und „Muenster" waren zwei Orte, 3 km und 80 km derselbe. `radius_km`
wurde bei **jeder** Zeile erfasst und nie benutzt.

**Der Grund war keine fehlende Fähigkeit.** `geoService.geocode()` gibt es seit Langem, und
Registrierung (`auth.js`), Profil (`me.js`) und Inserate (`listings.js`) benutzen es — der
Marktplatz als einziger nicht.

**Warum das jetzt zählt.** Owner-Nachtrag zu Welle N: der Einsatzort wird ausdrücklich
gefragt, mit dem Hinweis „genauere Angaben erhöhen die Trefferqualität" — der **wahr** sein
muss, nicht Zierde.

**Und genau dort habe ich mich selbst korrigiert.** Der erste Entwurf nahm die strukturierte
Abfrage (`postalcode=` + `city=`) und behauptete im Kommentar, sie liefere einen Punkt *in*
der Stadt. Gegen den echten Dienst gemessen stimmte das in **drei von vier** Fällen nicht:

```
geocode("48143","Münster") vs geocode(null,"Münster")   0,0 km
geocode("21129","Hamburg") vs geocode(null,"Hamburg")   0,0 km
geocode("81929","München") vs geocode(null,"München")   0,0 km
geocode("13403","Berlin")  vs geocode(null,"Berlin")    9,3 km
```

Die **Freitext**-Abfrage löst die PLZ auf — 10,6 / 6,4 / 7,1 / 3,4 km von der Ortsmitte.
Deshalb: mit PLZ der Freitext, ohne sie der Ort, und der strukturierte Weg als Rückfall.
Ohne diese Messung wäre der versprochene Hinweis eine Behauptung geblieben.

**Reihenfolge ist die Sache.** Der Bedarf wird **vor** `scheduleMatchTrigger` geokodiert —
sonst liefe genau der erste und für den Kunden sichtbarste Zuordnungsdurchgang noch ohne
Koordinaten.

**Ein Kartendienst darf keinen Bedarf verhindern.** Fällt Nominatim aus, entsteht die Zeile
trotzdem und fällt auf das Verhalten von gestern zurück. Der Nutzer hat alles richtig
gemacht; ein Fehler wäre ein Rückschritt.

**Nachgetragen am 2026-09-06 (N2.0b).** `api/scripts/koordinaten-nachtragen.js` — und der
lebende Bestand ist damit vollständig:

| | vorher | nachher |
|---|---|---|
| aktive Angebote | 0 von 13 | **13 von 13** |
| offene Bedarfe | 0 von 9 | **11 von 11** |

**Der Trockenlauf hat den Rest der Arbeit gespart.** Er zeigte 22 Zeilen mit ganzen **sieben**
verschiedenen Orten — „21031 Hamburg" allein siebenmal, „Berlin" sechsmal. 22 Abfragen für 7
Antworten wären nicht nur langsam, sondern unhöflich gegenüber einem Dienst, der freiwillig
und kostenlos antwortet. Der Lauf brauchte am Ende **6 Abfragen für 22 Zeilen**.

Gebaut über dieselbe Einspeisung, die `koordinatenNachtragen` ohnehin hat: der Dienst bleibt
die eine Fassung, das Skript reicht ihm nur einen Frager, der sich erinnert.

**Und der Beleg, dass die Postleitzahl wirklich etwas ändert** — genau das, was der
Owner-Hinweis „genauere Angaben erhöhen die Trefferqualität" behauptet:

```
"21031 Hamburg" -> 53.5083 / 10.1967
"Hamburg"       -> 53.5502 / 10.0013     13,7 km auseinander
```

Bei 25 km Umkreis entscheidet das über drin oder draußen.

**Geschlossene Zeilen bleiben absichtlich leer.** Sie zu geokodieren kostet Abfragen bei einem
fremden Dienst für etwas, das niemand mehr sucht; `--alle` hebt das auf, wenn es je gebraucht
wird.

**Verifikation.** 18 Proben in `api/test/marktBekommtKoordinaten.test.js` und 14 in
`api/test/koordinatenNachtragenSkript.test.js`, **20 Rückmutationen ohne Überlebende**,
dazu acht Messungen gegen den echten Kartendienst.

**Zwei Rückmutationen überlebten zuerst** — beide im *echten* Speicher des Skripts: die
Proben speisten ihren eigenen Frager ein und rührten ihn nie an. Man konnte den Speicher
ausbauen, ohne dass etwas rot wurde. Dieselbe Lücke wie in N4.4: die Naht macht testbar
und lässt die Standardfassung unbewacht. Vier Proben später: 8 von 8.

---

### 2026-09-06 — Die vierte Frage beantwortet sich selbst (N2.2)

**Status:** erledigt · **Kategorie:** Produktausbau (Verdrahtung eines fertigen Motors)

**Fakt.** `/api/pricing/suggest` ist gebaut, getestet und plan-gegated — und hatte im
gesamten Frontend **null Aufrufer**. Der Plan nennt das selbst „die billigste Wow-Lieferung
des ganzen Projekts": es fehlte nur die Anzeige.

**Warum das mehr ist als Bequemlichkeit.** Ein Budget, das niemand bedienen kann, ist die
häufigste Ursache für einen Bedarf, auf den nie jemand antwortet. Der Kunde erfährt das nie —
er sieht nur Stille und schließt daraus auf den Markt statt auf seine Zahl.

**Wo der Code steht, ist eine Entscheidung.** Der Preisteil sitzt in **derselben** IIFE wie
die Notdienst-Ableitung, weil der Aufschlag an der Dringlichkeitsstufe hängt. Läge er
daneben, stünde die Vorlauf-Regel ein **drittes** Mal im Code (Server, Anzeige, Preis) — und
irgendwann sähe der Kunde den Notdienst-Hinweis, bekäme aber den normalen Preis.

**Ohne Tarif kein Vorschlag, aber keine Sperre.** Ein 403 verbirgt die Karte still — und
**fragt nicht wieder**: ein Tarif ändert sich nicht während des Tippens, und eine 403 je
Tastendruck wäre Lärm im Netz und in jeder Fehlerstatistik. Ein 500 wird ausdrücklich
*nicht* als fehlender Tarif gelesen.

**Drei Fehler vor dem Anwenden gefangen, weil ich die Umgebung geprüft habe statt sie
anzunehmen:** `esc()` dieser Seite liegt in einer **anderen** IIFE und wäre bei jedem
Zeichnen unbemerkt gefallen (der Aufruf steckt in einem `.then()`); das lokale `t()` reicht
**keine** Werte weiter, „{n} Datenpunkte" hätte wörtlich auf dem Schirm gestanden; und
`holePreis()` gab seine Zusage nicht zurück — mehrere Proben wären dadurch grün gewesen,
**ohne je eine Antwort gesehen zu haben**.

**Verifikation.** 17 Proben in `api/test/preisvorschlagVierteFrage.test.js` — die Anzeige
wird **ausgeführt**, nicht gelesen —, **18 Rückmutationen ohne Überlebende**, darunter „das
Budget wird ungefragt gesetzt" und „das Plan-Tor fällt".

---

### 2026-09-06 — Gesperrt heisst unsichtbar (N4)

**Status:** erledigt (N4.1–N4.4) ·
**Kategorie:** Rollen-/Sichtbarkeitslogik + Bug-Pattern

**Fakt.** Ein Unternehmen kann eine Kraft sperren. Der Riegel beim Buchen steht seit Welle J2c
und hat immer gehalten — aber er war der **einzige**. Gemessen am 2026-09-06:

| Fläche | vorher |
|---|---|
| `accept-deal` | 409 ✅ |
| `negotiate-deal` | **ließ durch** |
| Feed | blendete aus (die einzige Stelle im Repo) |
| Suche | zeigte an |
| Detailansicht | zeigte an |
| Deckungsvorschau | zählte Gesperrte mit |

**Warum das mehr ist als Kosmetik.** Ein Angebot, das man nicht buchen darf, ist keine
Auskunft, sondern eine Falle: der Kunde plant damit, telefoniert, stimmt Konditionen ab — und
erfährt die Sperre am Ende. Beim Verhandlungsweg zahlt das auch die Gegenseite: der Weg legt
Bedarf und Angebot an, benachrichtigt die Zeitarbeitsfirma und mailt sie an. Zwei Häuser
arbeiten dann an etwas, das von Anfang an ausgeschlossen war.

**Eine Bedingung statt vier Abschriften.** `nichtGesperrtSql(alias, platzhalter, {spalte})` —
sie nennt zwei Tabellen und eine Frist; wer eine davon ändert, hätte sonst an einer Stelle
geändert und drei vergessen. Die Spaltenwahl ist kein Beiwerk: die Deckungsrechnung läuft auf
den Profilzeilen selbst (`k.id`), nicht auf einem Angebot (`cp.worker_profile_id`).

**Die Gegenrichtung, Owner-Entscheid 2026-09-06.** `GET /workers/blocks` gab die ganze Liste
heraus — Kraft, Kunde, **Grund**, Kundenname; der Disponenten-Bildschirm zeigte die Gründe an
(„2 gesperrt: zu spät gekommen, Qualität"). Eine Sperre ist das Urteil eines Kunden über einen
**Menschen**; sie durchzusetzen ist etwas anderes, als sie dem Arbeitgeber dieses Menschen zu
erzählen. Jetzt beantwortet der Server die gestellte Frage: **mit** Kunde nur dessen Sperren
(ohne Grund, ohne Namen), **ohne** Kunde nur, wer irgendwo gesperrt ist — je Kraft eine Zeile,
damit nicht die Zeilenzahl verrät, bei wie vielen Kunden jemand aufgefallen ist.

**Beim Bauen gefunden — und nach Owner-Entscheid am selben Tag behoben (N4.4).** Die
K4-Feed-Kopie (`marktplatz_feed_kopie`) hatte genau **eine** Zeile und prüfte für die
Kopierwürdigkeit nur die 15 Query-Filter, nicht die aus dem Betrachter abgeleiteten
Einschränkungen. `viewer_role` entscheidet aber über die ganze **Marktseite** (Unternehmen
sehen `supply`, Zeitarbeitsfirmen `demand`). Die Kopie trug im Fehlerfall also entweder die
falsche Marktseite — ein Unternehmen bekam die Einkaufslisten anderer Unternehmen statt der
Angebote — oder die Sperrliste eines einzelnen Kunden in die Ansicht aller anderen.

**Migration 216** trennt die Seiten (`CHECK (id = 1)` → `id IN (1,2)`) und löscht die alte
Zeile, statt sie umzudeuten. `istKopierwuerdig()` zählt jetzt auch den Betrachter mit: ein
Unternehmen mit Sperrliste hinterlässt keine Kopie und bekommt im Fehlerfall den ehrlichen
Fehler. **Zwei Rückmutationen überlebten zuerst** — beide in der Verdrahtung Route → Dienst,
nicht im Dienst selbst; vier Routen-Proben später 12 von 12.

**Verifikation.** 33 Proben in `api/test/gesperrtHeisstUnsichtbar.test.js`, **35
Rückmutationen ohne Überlebende** — darunter „Kunde statt Nutzer gebunden" (die Sperrliste
hängt an der Org, `requester_company_id` ist eine Nutzer-Kennung) und „der Bildschirm merkt
sich den fehlgeschlagenen Abruf" (ein Netzhänger hätte die Sperren für den Rest der Sitzung
unsichtbar gemacht, bei völlig gesund aussehender Seite).

---

### 2026-09-06 — Der Notdienst wird abgeleitet, nicht gefragt (N2.1)

**Status:** erledigt (Teil A) · **Kategorie:** Bug-Pattern + Produktausbau ·
**Owner-Vorgabe 2026-09-05, bestätigt 2026-09-06.**

**Fakt.** Die Dringlichkeit war ein Auswahlfeld. Es ließ sich in **beide** Richtungen falsch
setzen: ein Einsatz morgen als „normal" (die 30-Minuten-Uhr läuft nie an, niemand wird
alarmiert) oder ein Einsatz in drei Wochen als „Notdienst" (50 Anbieter werden ohne Anlass
alarmiert — und sehen beim nächsten Mal nicht mehr hin). Der Einsatzbeginn steht ohnehin im
Formular; aus zwei Angaben eine zu machen, die einander widersprechen können, ist die
Fehlerquelle.

**Die Regel:** Vorlauf ≤ 2 Kalendertage in **Europe/Berlin** → Notdienst. Ein Beginn in der
Vergangenheit erst recht. Tagesgenau ist hier keine Kosmetik: ein Bedarf für den 08.09.,
angelegt am 06.09. um 23:30, wäre unter rohem UTC-Schnitt **keine** Notlage gewesen.

**Beim Bauen gefunden.** `createEmergencyRequest` liest `payload.urgency` — dort stand noch
der Schema-Standardwert. Die Notdienst-Maschinerie wäre mit **normaler** SLA angelaufen: 120
statt 30 Minuten, kein Antwortfenster, keine Eskalation. Ein Notdienst, der keiner ist, ohne
dass irgendetwas nach Fehler aussieht.

**Ohne Tarif kein 403.** Abgeleitet wäre daraus eine Sperre für jeden kurzfristigen Bedarf.
Sie brächte nichts ein — derselbe Kunde wählt heute einfach „normal" — und träfe genau den
dringendsten Fall. Jetzt: normaler Weg plus Hinweis, was ihm entgeht.

**Teil B (Dealabschluss) ist kleiner als gedacht.** Die *operative* Wirkung existiert bereits:
`anfrageFristSql` deckelt die Antwortfrist auf den Starttag, mit 4 h Untergrenze. Was fehlt,
ist die **Benennung** — siehe `docs/features/N_PERSONALSUCHE.md`, Abschnitt 4.4.

**Verifikation.** 16 Proben in `api/test/notdienstAbleitung.test.js`, 3 weitere in
`marketplace.route.coverage.test.js`, **15 Rückmutationen ohne Überlebende**. Darunter eine
Probe, die die **Browser-Anzeige ausführt** und gegen den Dienst hält — die Regel steht
bewusst zweimal (der Server entscheidet, der Browser zeigt), und ohne diese Wache liefen die
beiden auseinander, ohne dass eine Seite für sich falsch aussähe.

---

### 2026-09-06 — Der plattformweite Notdienst-Blick bekommt Zielgruppe und Feldauswahl (N7.5)

**Status:** erledigt · **Kategorie:** Rollen-Logik + Security · **Owner-Entscheidung 2026-09-06.**

**Fakt.** `GET /api/emergency/active?all=1` (und `/dashboard`, `/history`) hebt den Org-Filter
auf. Davor stand nur `requireFeature("emergency_staffing")` — ein **Tarif**-Tor, keine Rolle —
und dahinter `SELECT dr.*`, also alle **44 Spalten** von `demand_requests`. Ein *Unternehmen*
auf PLUS las damit die offenen Notlagen seiner Wettbewerber, samt `contact_phone`,
`budget_min`/`budget_max`, `requirements`, `shifts` und Koordinaten.

**Was die Abwägung auflöste.** `GET /marketplace/public/demand-requests` filtert **nicht** nach
Dringlichkeit: Notlagen erscheinen dort schon heute für jeden Angemeldeten, mit 14 kuratierten
Feldern, ohne Tarifschranke. Den Schalter einzugrenzen kostet also **keine Reichweite** für den
suchenden Kunden. Was er zusätzlich liefert, ist die Leitstand-Qualität (Alter, SLA-Stand,
Eskalationsstufe) — das Premium-Merkmal, nicht der Bedarf.

**Entschieden und gebaut.** Zielgruppe: nur Agenturen, Tarif bleibt. Feldauswahl: dieselben 14
Felder wie der öffentliche Nachbarpfad plus die Notdienst-Kennzahlen — als **Erlaubnisliste**
(`FREMDE_SICHT`) im *Dienst*, nicht als Streichliste in der Route: eine neue Spalte bleibt
damit standardmäßig draußen. Die eigene Organisation sieht unverändert alles. Abgelehnt wird
ausdrücklich (403 `AGENCY_ONLY`) statt still auf die eigene Org zurückzufallen — wer
plattformweit fragt und nur das Eigene bekommt, hält eine leere Liste für eine Aussage über
den Markt.

**Ein Test wurde korrigiert, nicht abgeschwächt.** `emergency.route.coverage.test.js` schrieb
fest, dass ein *Unternehmen* `?all=1` bekommt — die getreue Abbildung eines Verhaltens, das
niemand entschieden hatte. Der eine Fall, in dem der Test der Entscheidung folgt, mit
Begründung an Ort und Stelle.

**Verifikation.** 12 neue Proben in `api/test/notdienstLeitstand.test.js` (Abschnitt 6), **11
Rückmutationen ohne Überlebende**. Die alte Frontend-Wache gegen `?all=1` ist bewusst
entfallen — ihre Prämisse gilt nicht mehr; an ihre Stelle treten Proben am **Dienst**, die für
jeden künftigen Aufrufer gelten statt nur für die, die es schon gibt.

---

### 2026-09-06 — Eine Achse für Fähigkeiten, auch dort wo die Menschen gepflegt werden (N1b)

**Status:** erledigt · **Kategorie:** Bug (Matching) + Produktausbau ·
**Anlass:** Owner-Hinweis — die gesuchten Fähigkeiten müssen mit den angeklickten
zusammenfinden.

**Fakt.** Welle N1 stellte die beiden **Markt**-Flächen auf den Katalog. Das genügte nicht:
`matchingEngine.scoreMatch` vergleicht beide Seiten als **Mengen**, ohne Index als
kleingeschriebene Rohform. Eine gemeinsame Achse entsteht nur, wenn **alle** Flächen aus
derselben Menge wählen — und das taten drei von fünf.

Die folgenreichste Ausnahme war ausgerechnet die, an der die Zeitarbeitsfirma ihre Leute
pflegt (`mitarbeiter.html`). Sie bot **142 im Browser fest verdrahtete** Begriffe an; davon
standen **33 im Katalog** (Namen und Aliase zusammen), **109 nicht** — darunter „Stapler",
„Pick-by-Voice", „MAG-Schweißen". Kanonisch heißt es „Staplerfahrer:in". Ein Unternehmen,
das seit N1 den Katalogbegriff wählt, fand einen so gepflegten Menschen **nicht**.

**Der tiefere Schaden.** Diese Fläche schrieb per `PATCH /workers/:id` eine Wortliste ins
Profil. Die relationale Zuordnung `worker_profile_skills` blieb dabei **leer** — und genau
daraus baut `capacityOfferGeneratorService` die Marktangebote. Wer seine Leute dort pflegte,
brachte sie gar nicht erst in den Markt. Ohne Fehler, ohne Meldung: der Weg endete einfach.

**Warum es den Weg nicht gab.** Der Arbeiter selbst konnte seine Fähigkeiten seit jeher
katalog-gebunden setzen (`PUT /worker/me/skills` → `setWorkerSkills`, jede `skill_id` gegen
`platform_skills` geprüft). Die Agentur, die dieselben Menschen verwaltet, hatte diesen
Endpunkt nicht. Neu: `GET`/`PUT /workers/:userId/skills`, org-gebunden, mit
`source: "agency"`.

**Geliefert.** `mitarbeiter.html` und `requisition_create.html` auf `TCSkillPicker`; 15
Funktionen und das Freitextfeld „Zusätzlicher Spezial-Skill" entfallen ersatzlos. Der Wähler
lernt `auswahl()` (Auswahl **mit** Katalog-Kennung) und optionale Gruppen-Aktionen — die es
bewusst **nur** auf der Mitarbeiterseite gibt: eine Ausschreibung mit zwölf Pflicht-
Fähigkeiten findet niemanden.

**Bestandsdaten sind sauber.** Gegen die laufende Datenbank gemessen: 33 Profile, 3 mit
Fähigkeiten — und genau diese 3 haben auch relationale Zuordnungen, mit übereinstimmender
Anzahl und **null** Begriffen außerhalb des Katalogs. Nichts nachzuziehen.

**Verifikation.** 17 Proben in `api/test/eineAchseFuerFaehigkeiten.test.js`, **17
Rückmutationen ohne Überlebende**. Die Rundum-Wache sucht nach der **Form** eines tippbaren
Fähigkeitsfeldes über alle Seiten — sie hat beim ersten Lauf den *geführten* Vorschlagsweg
im Arbeiterportal zu Unrecht angeklagt und unterscheidet ihn jetzt, eng begrenzt und mit
Gegenprobe.

---

### 2026-09-06 — Freitext war nie eine gemeinsame Achse (N1)

**Status:** erledigt (ein Punkt bleibt offen, siehe Offene Blocker) ·
**Kategorie:** Produktausbau + Bug-Pattern

**Fakt.** Beide Marktseiten tippten Fähigkeiten als Freitext ein — die Nachfrage in
`marketplace_demand_create.html`, das Angebot in `capacity_exchange_form.html`, beide mit
dem Etikett „Skills (kommagetrennt)". Was dabei entsteht, sind Schreibvarianten, die einander
nie finden: „Stapler", „stapler", „Gabelstapler", „Staplerschein". **Und niemand sieht es** —
die Suche bleibt leer, und beide Seiten halten den Markt für dünn.

Der Katalog war die ganze Zeit da: `platform_skills` trägt seit Migration 145 **162
Fähigkeiten in 14 Kategorien, mit Schreibvarianten in `aliases`**; `GET /skills/catalog` und
`POST /skills/propose` liefern und auflösen sie. Erreichbar war beides auf keiner der beiden
Seiten.

**Geliefert.** `frontend/public/js/skillPicker.js` — ein gemeinsames Bauteil, das seine
Gestalt selbst mitbringt (ein Script-Tag, kein CSS-Abgleich) und in jedes Folgeprojekt passt.
Es schreibt die Auswahl in **dasselbe** Feld zurück, das vorher der Freitext war; jeder
bestehende Formular-Code bleibt Wort für Wort gültig.

**Die Zahl je Fähigkeit gab es noch nicht.** Der Plan nennt als Quelle
`capacity-discovery/by-role` — das gruppiert nach `cp.role`, nicht nach `cp.skill_tags`. Neu:
`aggregateBySkill` + `GET /capacity-discovery/by-skill`, mit derselben Rest-Rechnung wie die
Nachbarn (verbindlich vergebene Köpfe zählen nicht als verfügbar).

**Zwei Brücken, die sonst still kaputtgegangen wären.** Ein verstecktes Feld feuert kein
`input`/`change`, wenn ein Skript seinen Wert setzt. Daran hängen auf der Angebotsseite die
Deckungsvorschau und die Vorbelegung beim Bearbeiten — beide verdrahtet, beide einzeln
bewacht.

**Verifikation.** 34 Proben in `api/test/faehigkeitenKatalog.test.js` plus 6 gegen die
**laufende Datenbank** in `test/integration/bestandJeFaehigkeit.flow.test.js`, **43
Rückmutationen ohne Überlebende**. Ein Lauf gegen den **echten** Katalog (162 Fähigkeiten,
14 Kategorien) hat dabei einen Befund gezeigt, den keine erfundene Vorrichtung zeigen kann:
kanonisch heißt es „Staplerfahrer:in", in alten Anzeigen steht „Gabelstaplerfahrer" — ein
hinterlegter Alias. Die Vorbelegung verglich nur Namen und hätte die Fähigkeit beim
Bearbeiten verworfen, obwohl die Suche im selben Bauteil die Aliase längst kannte. Drei Proben mussten nachgeschärft werden — alle suchten
einen Namen irgendwo statt an seiner Stelle. Und eine eigene Annahme über SQL war schlicht
falsch (`TRIM(UNNEST(...))` wird von Postgres **nicht** abgewiesen); die Rückmutation hat sie
widerlegt, der Kommentar sagt jetzt den richtigen Grund.

---

### 2026-09-05 — Der Notdienst: neun fertige Endpunkte ohne Aufrufer, zwei Befunde dahinter (N7.4)

**Status:** erledigt (ein Punkt bleibt Owner-Entscheidung, siehe Offene Blocker) ·
**Kategorie:** Rollen-Logik + Produktausbau

**Fakt.** `api/routes/emergency.js` trägt elf fertige, auditierte Endpunkte. Gemessen am
2026-09-05 riefen die Oberflächen davon **zwei** auf — beide `:id/commitments`, einmal
lesend, einmal schreibend. (Der Plan sprach von sieben; die erste Messung sagte elf. Beide
Zahlen waren falsch: die zwei echten Aufrufe setzen ihren Pfad aus Teilen zusammen und
fielen durch ein Muster, das den ganzen Pfad suchte.)

Neun waren gebaut, geprüft und unerreichbar — darunter **der einzige Weg, eine Teilzusage
zurückzunehmen**. Eine Agentur, die drei Leute zugesagt und sie verloren hatte, konnte das
nirgends sagen; das Unternehmen rechnete weiter mit dreien und merkte es am Einsatztag.

**Zwei Befunde, die nur deshalb so lange standen, weil niemand die Endpunkte benutzte:**

* **`POST /emergency/:id/escalate` hatte keine Eigentumsprüfung** — weder in der Route noch
  im Dienst. `escalateEmergency` nimmt `actorId` entgegen, protokolliert sie und vergleicht
  sie nie mit `requester_company_id`. Jeder Angemeldete mit `emergency_staffing` im Tarif
  konnte jede fremde Notlage dreimal hochstufen; jede Stufe löst einen Rundruf an bis zu 50
  Anbieter aus, **auch per E-Mail**, mit Titel, Rolle und Ort der fremden Notlage im Text.
  Ein Schreibzugriff in einen fremden Vorgang, der zugleich ein Versandverstärker ist.
  Dass es ein Versehen war, sagen die Nachbarn in derselben Datei: `/respond` prüft die
  Rolle, `GET /:id/commitments` prüft `isRequester || isMatchedAgency`,
  `dealAgreementService.js` schreibt den Grund sogar ausdrücklich hin. **Geschlossen** über
  `canAccessAsOwner` (Organisations-Kolleginnen eingeschlossen, sonst wäre die Reparatur
  bei Urlaub eine Verschlechterung).
* **`?all=1` hebt die Org-Grenze auf** — offen, siehe Offene Blocker.

**Sechs der neun verdrahtet.** `/active`, `/dashboard`, `/history`, `/:id/escalate`,
`PATCH /commitments/:id`, `/:id/commitments/:cid/create-agreement`. Drei bleiben bewusst
ohne Aufrufer: `POST /emergency/request` wäre ein **zweiter** Anlegeweg neben
`marketplace_demand_create.html` (Parallelstruktur, von der Hausregel verboten);
`GET /emergency/config` liefert die Dringlichkeitsstufen für genau dieses Formular und hat
ohne es keinen Leser; `POST /:id/respond` wird heute schon **intern** von
`POST /:id/commitments` gerufen und bräuchte als eigener Knopf eine Agentur-Fläche, auf der
eine fremde offene Notlage sichtbar ist — die hängt an der `?all=1`-Entscheidung.

**Geliefert.** `notdienst_leitstand.html` (Kennzahlen, offene Notlagen mit Alter, SLA-Stand
und Deckung, Eskalation mit Wirkungsvorschau, Verlauf; Eingang aus
`marketplace_demand_list.html`, im Register geführt) und die vollständigen Handlungen an der
Teilzusage in `marketplace_demand_detail.html`: zurücknehmen, ablehnen, verbindlich machen —
mit Pflichtbegründung, weil die Gegenseite genau diesen Satz liest.

**Nebenbefund, mitgeschlossen:** `marketplace_demand_detail.html` hatte **kein `esc()`**.
Anbietername und Freitext-Notizen (bis 1000 Zeichen, von der Gegenseite) gingen ungeprüft in
`innerHTML`.

**Dritter Befund, beim Eintragen ins Register gefunden:** der Erreichbarkeits-Wächter
`api/test/erreichbarkeit.test.js` erkannte im Register nur Zeilen mit **blankem** Dateinamen.
Die Tabellen schreiben die Seite aber mal blank, mal mit Pfad — 84 zu 17. Die 17 hat er
übersprungen, darunter **fünf lebende Seiten** direkt unter `frontend/public/` (`pricing`,
`about`, `onepager`, `onboarding`, `whats-new`). Für seine Zusage „kein Feature, das nur seine
URL kennt" gab es diese fünf nicht, und es fiel nicht auf, weil seine Selbstprüfung
`register.size >= 50` lautet. Behoben; zwei neue Proben. Keine der fünf war unerreichbar —
der Wächter hatte nur nicht hingesehen.

**Verifikation.** 31 Proben in `api/test/notdienstLeitstand.test.js` plus 2 in
`api/test/erreichbarkeit.test.js`, **47 Rückmutationen, keine Überlebende**. Darunter eine Laufzeitprobe, die das Seitenskript wirklich ausführt
(vm-Kontext, DOM-Attrappe, echte Antwortform) — sie hat eine Unsauberkeit gefunden, die
keine Textprüfung sieht: der Code prüfte `window.TCDate` und rief danach das blanke
`TCDate`. Im Browser gleichwertig, überall sonst nicht; vereinheitlicht.

Drei Wächter-Proben mussten nach einer überlebenden Rückmutation **geschärft** werden — alle
drei suchten ein Wort statt der Sache (`zeigeLaedtNichtMehr` enthält `zeigeLaedt`;
`document.hidden` steht zweimal in der Datei).

---

### 2026-08-31 — Die Werbeprämie wurde gebucht und nie angewandt (K2.4–K2.7)

**Status:** erledigt · **Kategorie:** Bug (Geld) · **Owner-Abschnitt 12.**

**Fakt:** Die Werbe-Mechanik war seit jeher verdrahtet — `qualifyReferralReward`
schreibt beim Zahlungseingang des Geworbenen eine `referral_rewards`-Zeile. Aber
**keine einzige Datei des Geldpfads** (invoiceService, recurringBillingService,
paymentService, planCatalog) erwähnte `referral` überhaupt. Der Kunde sah eine
Gutschrift und zahlte den vollen Preis — dieselbe Fehlerklasse wie der
Treue-Rabatt vor Migration 170: ein Preisversprechen ohne Wirkung.

Dazu zwei Stellen, an denen der Code dem Owner-Entscheid vom 2026-08-27
widersprach: `MAX_REFERRAL_REWARDS = 6` (entschieden: **3**) und die
Qualifikation feuerte **sofort** statt nach **30 Tagen** Bestand.

**Aktion:** Migration 209 (Katalogeintrag `werbe_cashback`, 100 %, deckel-frei)
und `api/services/werbepraemieService.js`. Die Prämie fährt auf **derselben
Schiene wie der Eingriff aus K1.4**: vor der Transaktion gelesen, darin
verbraucht (mit Parallellauf-Riegel im WHERE), danach belegt. Karenz und Bestand
des Geworbenen stehen **im WHERE** der einen Abfrage — kein Widerrufs-Job, der
irgendwann nicht mehr läuft.

**Verify:** `api/test/werbepraemie.test.js` (26 Proben), **16 Rückmutationen** an
der Produktionsquelle — jede gefangen; `test/integration/rabattWirdSichtbar.flow.test.js`
34/34 im Container. Die Rückmutationen aus K1 (14) und dem Gate (9) halten
unverändert.

**Aufwand:** halbe Sitzung.

**Fund beim Bauen der eigenen Probe:** die erste Fassung von
`praemienKonfiguration` fing den Datenbankfehler ab und meldete „Programm aus" —
**ein Ausfall war nicht von einer Owner-Entscheidung zu unterscheiden.** Genau
der Defekt, den K1.1 bei `getUserTier` gefunden hat, in neuem Code reproduziert
und von der eigenen Probe gefangen.

### 2026-08-31 — Der Freimonat haette den Kunden ausgesperrt (Gate K2.2)

**Status:** erledigt · **Kategorie:** Bug (Geld/Lebenszyklus) · **Owner-Abschnitt 12.**

**Fakt:** Welle K2 verspricht einen Werbe-Cashback (100 %, naechste Rechnung frei).
Der Arbeitsplan macht daraus ein **Gate** — gemessen, bevor gebaut wird. Die
Rechenkette trug die 0 EUR auf Anhieb; **drei andere Schichten nicht**:

| Schicht | Befund |
|---|---|
| Tier-Deckelung | Diamant-Kunde bekam **25 % statt 100 %** (im Plan vorhergesagt) |
| Katalog-Grenze | `discount_pct <= 20` — ein 100-%-Eintrag war **nicht anlegbar** |
| **Lebenszyklus** | **Abo auf `past_due` → niemand zahlt 0 EUR → `applyRenewalPayment` hat KEINEN Aufrufer → nach 14 Tagen Hard-Lock auf DEMO** |
| Mahnlauf | haette eine Zahlungserinnerung ueber **0,00 EUR** verschickt |

Die letzten beiden treffen **jede** Rechnung, die auf null faellt — auch einen
Eingriff nach K1.4, der die 100 % erreicht. Nicht nur den Cashback.

**Aktion:** Migration 208 (`bounties.deckel_frei` + praezisere 20-%-Regel;
`referral_rewards.faellig_ab/angewandt_am/rechnung_id`). Im Lauf: eine 0-EUR-
Rechnung wird sofort als bezahlt gebucht und die Periode weitergerollt — **in
derselben Transaktion** wie der Status-Flip. Der Mahnlauf filtert auf den Betrag.

**Verify:** `api/test/nullEuroRechnung.test.js` (15 Proben), **9 Rueckmutationen**
an der Produktionsquelle — jede gefangen; `test/integration/rabattWirdSichtbar.flow.test.js`
26/26 im Container. K1s 14 Rueckmutationen halten unveraendert.

**Aufwand:** halbe Sitzung.

**Offen:** K2.4–K2.7. Dabei zwei Stellen, an denen der Bestandscode dem
Owner-Entscheid widerspricht: `MAX_REFERRAL_REWARDS = 6` (Owner: hoechstens 3)
und die Qualifikation feuert sofort beim Zahlungseingang (Owner: 30 Tage
Bestand). Ausserdem: die Werbepraemie wird seit jeher **gebucht und nie
angewandt** — keine Datei des Geldpfads erwaehnt `referral` ueberhaupt.

### 2026-08-29 — Der stille Rabatt-Ausfall: zwei Pfade, keiner sichtbar (Welle K1)

**Status:** erledigt (`a8b722d`) · **Kategorie:** Bug (Geld) · **Owner-Abschnitt 12.**

Der Treue-Rabatt laeuft automatisch und traegt echtes Geld — gemessen am 2026-08-29
gegen die laufende Datenbank: **55 Kunden mit aktivem Abo**, Ø 3,09 %, rund **670 EUR
je Monatslauf** (43 × PLUS, 5 × BASIS, 7 × INDIVIDUELL). **273 der 312 aktiven Abos
sind bereits faellig**, Rechnungen gibt es bisher null.

**Fakt:** Faellt die Ermittlung aus, passierte nichts Sichtbares — an **zwei** Stellen:

| | Ausfall | Folge | Sichtbar |
|---|---|---|---|
| (a) | Summen-Abfrage wirft | Rechnung **ohne Rabatt** | nur `logger.warn` |
| (b) | Stufen-Abfrage wirft | Deckel faellt still auf **8 %** | **gar nicht** |

(b) war vorher unbekannt: `getUserTier` faengt seinen eigenen Datenbankfehler ab und
liefert `null`, ununterscheidbar von „hat noch keine Stufe". Ein Diamant-Kunde
(Deckel 25 %) wird dabei auf 8 % gestutzt. Weil `getUserTier` nie wirft, ist der
Sicherheitsnetz-Wert `FALLBACK_MAX_DISCOUNT_PCT = 25` **unerreichbar** — ein
bestehender Test hielt das seit jeher fest, ohne dass jemand die Folge gezogen hat.

**Aktion:** Migration 206 (`rabatt_ausfaelle`, `rabatt_eingriffe`), drei Dienste,
Staff-CC-Modul `rabatt-faelle` mit Einzelfall, Vorschau auf den naechsten Lauf,
Eingriffspunkt nach Plan-Abschnitt 3a und Monatsuebersicht. **Die Rechenkette wurde
nicht angefasst** — jede Zahl bleibt, was sie war; neu ist nur der Befund.

**Verify:** `api/test/rabattWirdSichtbar.test.js` (75 Proben, 11 am echten Handler),
**14 Rueckmutationen** an der Produktionsquelle — jede gefangen;
`test/integration/rabattWirdSichtbar.flow.test.js` 18/18 im Container gegen das echte
Schema. Eigener Lauf ueber alle beruehrten Dateien und Waechter: **903/903**.

**Aufwand:** eine Sitzung.

**Offen geblieben:** `K4-B1` — es gibt weiterhin **keinen Kanal, der das Team
erreicht**. Der Ausfall wird deshalb festgehalten und in der Staff-Flaeche gezeigt,
statt eine Meldung zu behaupten, die nirgends ankommt.

### 2026-08-29 — Die drei XML-Defekte: abgelehnt statt geglättet

**Status:** erledigt · **Kategorie:** Normkonformität (Steuerbeleg) · **Owner-Auftrag.**

Die drei Defekte, die das Schematron-Gate belegt hatte. Alle drei sind behoben — und
bei zweien war die **Ablehnung** der richtige Fix, nicht die Korrektur.

| Regel | Defekt | Behandlung |
|---|---|---|
| BR-AE-05 / BR-AE-09 | Reverse Charge setzte nur die Kategorie auf AE; Satz (19 %) und Steuerbetrag liefen unverändert durch | **Ablehnen.** Der Generator rechnet nicht um |
| BR-CO-25 | Ohne `due_at` fielen Fälligkeit (BT-9) **und** Zahlungsbedingung (BT-20) gemeinsam weg — beide kamen aus derselben Quelle | Zahlungsbedingung setzen, **ohne** eine Frist zu erfinden |
| BR-CO-09 | USt-IdNr. ohne Länderkennzeichen ging unbeanstandet durch | **Ablehnen.** Kein automatisches Voranstellen |

**Warum bei Reverse Charge nicht umgerechnet wird**, obwohl das die Regeln grün färbte:

- *Rechtlich:* aus einer 19-%-Rechnung würde im maschinenlesbaren Teil eine
  0-%-Rechnung, während das PDF weiter 19 % zeigt. Bei `/AFRelationship /Alternative`
  ist das der gebrochene Zusagefall — und an einem Steuerbeleg eine stille Fälschung.
- *Technisch:* es hätte gar nicht gewirkt. `total_cents` trägt die Steuer weiter; mit
  genulltem Betrag bräche stattdessen BR-CO-15. Ein in sich widersprüchlicher Beleg ist
  auf der Serialisierungsebene nicht reparierbar — die Rechnungszeile muss stromaufwärts
  richtig entstehen.

Entlastend: `reverseCharge` hat im ganzen Repo **keinen Aufrufer**. Es ging nie eine
Rechnung als AE hinaus; der Defekt war latent, und der Fix kann keinen gestellten Beleg
nachträglich verändern. Eine korrekt gebaute AE-Rechnung (0 %, 0 Cent, Brutto = Netto)
geht jetzt durch und trägt den Pflichthinweis „Steuerschuldnerschaft des
Leistungsempfängers" (BT-120). Zusätzlich greift BR-AE-01/02: bei AE braucht auch der
**Empfänger** eine Kennung — bedingt geprüft, damit gewöhnliche Rechnungen ohne
Käufer-USt-IdNr. weiter funktionieren.

**Warum die USt-IdNr. nicht automatisch ergänzt wird:** im Feld `vat_id` steht
erfahrungsgemäß auch mal eine **Steuernummer**. Aus „315/5711/0815" ein
„DE31557110815" zu machen schriebe eine steuerliche Kennung auf den Beleg, die es nicht
gibt — und niemand würde es merken, weil das Ergebnis richtig aussieht. Die Meldung nennt
genau diesen häufigsten Grund und die normativen Ausnahmen (EL für Griechenland, XI für
Nordirland).

**Bei der Zahlungsbedingung wird keine Frist erfunden.** Ein ausgedachtes „14 Tage" wäre
eine Vertragsaussage auf einem Steuerbeleg. Ohne Vereinbarung gilt der gesetzliche
Normalfall (§ 271 BGB, sofort fällig) — das ist keine Erfindung, sondern die Rechtslage.
Nebenbei: das Datum steht in BT-20 jetzt deutsch (`03.09.2026`), weil dieses Feld ein
Mensch liest; das maschinenlesbare BT-9 bleibt im Normformat.

**Vierter Fund, mitbehoben:** der Steuernummer-Zweig war rollenblind und schrieb BT-32
auch in den **Empfänger**-Block. BT-32 ist in EN 16931 ein reiner Verkäufer-Begriff; die
Käuferpartei kennt nur BT-48. Der Validator hätte es nie gemeldet — die Norm kennt das
Element dort schlicht nicht.

**Das Gate belegt jetzt sieben Fälle** statt eines:

| Fall | Erwartung | Ergebnis |
|---|---|---|
| Regelfall CII / UBL | konform | 0 Fehler, 0 Warnungen |
| Reverse Charge korrekt | konform | 0 Fehler, 0 Warnungen |
| Ohne Fälligkeit | konform | 0 Fehler, 0 Warnungen |
| RC unstimmig | **Ablehnung** | `REVERSE_CHARGE_UNSTIMMIG` |
| USt-IdNr. ohne Präfix | **Ablehnung** | `PFLICHTFELDER_FEHLEN` |
| Gegenprobe | Validator **muss** meckern | BR-CO-17 gefunden |

Ein Fall, der nur behauptet behoben zu sein, ist nicht behoben — deshalb steht jeder
einzeln im Gate. 17 zusätzliche Unit-Tests halten fest, **warum** abgelehnt wird; das
sieht das Gate nur als Abwesenheit einer Datei.

**Weiterhin offen — Datenmodell, nicht Generator:** nur **ein** Steuersatz je Rechnung
ist abbildbar. Eine Rechnung mit 19 % Überlassung und 7 % Nebenleistung käme mit
einheitlichem Satz heraus, und **kein Validator sähe es**, weil alle Summen dann
aufgehen. Das wird teurer, je später es kommt.

### 2026-08-29 — Das Schematron-Gate: der Inhalt ist jetzt auch geprüft

**Status:** erledigt · **Kategorie:** Normkonformität (Prüfkette) · **Owner-Auftrag.**

veraPDF prüft die **Hülle**. Ob der **Inhalt** eine gültige Rechnung ist, sagt nur ein
Schematron-Lauf gegen das offizielle CEN-Regelwerk. Das war der ausdrücklich offen
gebliebene Punkt der PDF/A-Welle — jetzt geschlossen.

**Werkzeug:** KoSIT-Validator 1.6.3 (Apache-2.0) mit der XRechnung-Konfiguration
(Release 2026-01-31), die die CEN-Schematron **1.3.15** bündelt. Als eigenes
Docker-Abbild, one-shot aufgerufen wie veraPDF. Ins Repo wandern nur Dockerfile und
`HERKUNFT.txt`; JAR (10 MB) und Konfiguration zieht der Bau aus den offiziellen
Releases, über SHA256 festgenagelt. Ablage unter `api/scripts/` — die `.dockerignore`
schließt das vom Produktionsabbild aus.

    npm run test:schematron

**Der erste Lauf fand sofort einen Produktionsdefekt**, den kein bestehender Test
sehen konnte. Die XRechnung trug:

| | Kennung |
|---|---|
| war | `…#compliant#urn:xoev-de:kosit:standard:xrechnung_3.0` |
| gültig | `…#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0` |

Der Namensraum wechselte mit XRechnung 3.0 von `xoev-de` auf `xeinkauf.de`; im Code
stand der **alte** Namensraum mit der **neuen** Versionsnummer. Diese Kombination gibt
es nicht. Der Validator meldete `noScenarioMatched`: es wurde **keine einzige**
Geschäftsregel geprüft, und ein Empfänger — etwa eine Behörde — hätte das Dokument
nicht als XRechnung erkannt. Beide Hälften der Kennung sehen für sich richtig aus;
genau deshalb fällt so etwas beim Lesen nicht auf.

Danach blieben exakt zwei Fehler: **BR-DE-5** (Kontaktstelle BT-41) und **BR-DE-6**
(Telefonnummer BT-42). Die Kontaktspalte gab es längst und wurde korrekt ausgegeben —
sie war nur nie gepflegt worden. Die Telefonspalte fehlte: **Migration 205**, dazu
beide Felder in der Pflegemaske und im XML beider Formate (Reihenfolge in `cac:Contact`
und `DefinedTradeContact` ist schemagebunden — Telefon **vor** E-Mail, sonst bricht die
XSD-Prüfung).

**Gemessen nach der Behebung:**

| Format | Szenario | XSD | EN 16931 | XRechnung-CIUS | Fehler | Warnungen |
|---|---|:-:|:-:|:-:|---:|---:|
| ZUGFeRD (CII) | EN16931 (CII) | ✓ | ✓ | — | **0** | **0** |
| XRechnung (UBL) | EN16931 XRechnung (UBL) | ✓ | ✓ | ✓ | **0** | **0** |

**Die Gegenprobe.** Jeder Lauf fährt zusätzlich ein absichtlich falsches Dokument
(Steuerbetrag passt nicht zur Bemessungsgrundlage) und besteht darauf, dass der
Validator es ablehnt — gemessen wird BR-CO-17 gefunden. Ohne diese Probe wäre ein immer
grünes Gate von einem kaputten Gate nicht zu unterscheiden.

**Nicht auf den Exitcode gegatet:** die KoSIT-Berichtslogik setzt einen Prüfschritt
schon bei einer *Warnung* auf `valid=false`, und das CII-Regelwerk führt mehr Warn- als
Fatal-Regeln. Ein Exitcode-Gate wäre bei einwandfreien Rechnungen rot — und ein Gate,
das immer rot ist, schaut nach zwei Wochen niemand mehr an. Maßgeblich ist
`level="error"`.

**Nebenbefund, mitbehoben:** die Fixtures führten `hours:` statt `quantity:` — ein Feld,
das die Datenbank gar nicht kennt (Migration 030). Im XML stand deshalb
`BilledQuantity 0.00`, während das PDF 40 Stunden druckte. In Produktion griff der
Fallback, der Defekt war rein in den Testdaten — aber er schwächte deren Aussagekraft.

**Damit ist die Prüfkette vollständig:** `test:pdfa` beweist die Hülle, `test:schematron`
den Inhalt. Was jetzt noch offen bleibt: die drei bekannten XML-Defekte (Reverse Charge,
fehlende Zahlungsbedingung ohne `due_at`, USt-IdNr. ohne Länderpräfix) — sie ändern
ausgewiesene Steuerbeträge und gehören dem Owner. Und: nur **ein** Steuersatz je Rechnung
ist im Datenmodell abbildbar; eine Rechnung mit 19 % Überlassung und 7 % Nebenleistung
käme mit einheitlichem Satz heraus und **kein Validator sähe es**, weil alle Summen dann
aufgehen. Das ist eine Datenmodellfrage, keine Reparatur im Generator.

### 2026-08-29 — ZUGFeRD richtig: PDF/A-3u, geprüft statt behauptet

**Status:** erledigt · **Kategorie:** Produktausbau (Normkonformität) · **Owner-Auftrag.**

**Vorher:** ein PDF mit eingebettetem XML, ehrlich als „hybrider Beleg" benannt. Was
fehlte, war die PDF-Hülle nach PDF/A — ohne sie ist es kein ZUGFeRD, sondern ein PDF
mit einer Datei im Bauch.

**Der harte Punkt war die Schrift.** PDF/A verlangt, dass jede benutzte Schrift
vollständig eingebettet ist — die Ausnahme für Helvetica & Co. gilt dort **nicht**.
pdf-lib kann eine TTF nur mit `@pdf-lib/fontkit` einbetten. Damit war eine neue
Abhängigkeit unvermeidbar; die Projektregel („keine neue Dependency, wenn ein
bestehender Weg reicht") greift nicht, weil nachweislich keiner existiert.
Owner-Freigabe eingeholt, Liberation Sans gewählt: metrisch Helvetica-kompatibel,
das Layout verrutscht nicht.

**Geliefert:**
- `services/pdfa/xmp.js` — das XMP-Paket mit pdfaid-Kennung **und** dem
  Factur-X-Extension-Schema. Letzteres ist die häufigste Fehlerquelle: PDF/A verbietet
  unbekannte XMP-Felder, wer eigene einführt, muss sie im selben Paket deklarieren.
  Die Fallen sind einzeln kommentiert (Namespace mit abschließendem `#`, `fx:Version`
  ist 1.0 und nicht 2.3, `EN 16931` mit Leerzeichen, xpacket ohne `bytes=`).
- `services/pdfa/index.js` — Dokumentkennung im Trailer (ein frisches pdf-lib-Dokument
  hat keine), OutputIntent mit eingebettetem ICC, /Metadata, Sprache. Die ICC-Prüfung
  läuft bei **jeder** Erzeugung: ein ausgetauschtes Profil fällt auf, bevor ein Beleg
  das Haus verlässt.
- `assets/pdfa/` — zwei Schriften (OFL), ein 456-Byte-sRGB-Profil (CC0), beide Lizenzen
  und `HERKUNFT.txt` mit URL, Version und SHA256. Bewusst `.txt` statt `.md`: die
  `.dockerignore` schließt `*.md` aus, die Herkunftsangabe wäre im Abbild verschwunden.
- `scripts/verapdf.mjs` + `npm run test:pdfa` — der Nachweis.

**Gemessen mit veraPDF 1.30.2** (Referenzwerkzeug der PDF Association):

| Profil | Regeln | Prüfungen | Fehler |
|---|---:|---:|---:|
| PDF/A-3b | 146 | 7390 | **0** |
| PDF/A-3u | 148 | 7608 | **0** |

Stufe **u**, nicht b: sie garantiert zusätzlich, dass jedes Zeichen eine
Unicode-Zuordnung hat — der Empfänger kann den Text auslesen, nicht nur ansehen.
pdf-lib schreibt die nötige ToUnicode-CMap ohnehin; der erste 3u-Lauf scheiterte an
**einer** Prüfung, nämlich der Selbstauskunft „B". Erst der Beleg, dann das Versprechen.

**Vier Deckungsgleichheits-Brüche gefunden und behoben.** `/AFRelationship /Alternative`
ist für EN 16931 in Deutschland der einzig zulässige Wert — und die Zusage, dass PDF und
XML dieselben Angaben tragen („identisches Mehrstück"). Der Abgleich zeigte:

| Bruch | Ursache |
|---|---|
| Kraft fehlte im XML (dort stand „Leistung") | XML las `it.description`, PDF `worker_name` |
| Abrechnungszeitraum fehlte im XML | XML las nur `billing_period_*`, PDF auch `period_*` |
| Falscher Firmenname im XML | CII setzte `ram:Name` = Handelsname; das **ist** aber BT-27, der Rechtsname. Der UBL-Zweig machte es an derselben Stelle richtig |
| PDF zeigte zwei Steuerkennungen, XML eine | Renderer an die XML-Vorrangregel angeglichen |

Alle vier waren unsichtbar: beide Teile sahen für sich genommen richtig aus.
`test/belegDeckungsgleich.test.js` hält sie gegen Rückfall.

**Was damit NICHT gesagt ist:** veraPDF prüft die Hülle, nicht das XML. Ob der Inhalt
die Geschäftsregeln der EN 16931 erfüllt (BR-*, BR-CO-*), sagt nur ein Schematron-Lauf —
**der bleibt offen.** Und „zertifiziert" wäre in jedem Fall falsch: einzelne Belege
werden nicht zertifiziert. Korrekt ist: PDF/A-3u, geprüft mit veraPDF; Factur-X/ZUGFeRD
Profil EN 16931.

**Offen:** Schematron-Gate für die Geschäftsregeln (KoSIT/Mustang). Drei bekannte
XML-Defekte (Reverse Charge, fehlende Zahlungsbedingung ohne `due_at`, USt-IdNr. ohne
Länderpräfix) sind bewusst **nicht** angefasst — ihre Korrektur verändert ausgewiesene
Steuerbeträge und gehört dem Owner.

### 2026-08-29 — Das PDF zur operativen Rechnung (J7 abgeschlossen)

**Status:** erledigt · **Kategorie:** Produktausbau · **Fund beim Bauen.**

**Warum nicht der vorhandene Renderer.** `invoicePdfService.js` setzt `COMPANY` als
Absender — die Plattformfirma. Für die Abo-Rechnungen von TempConnect an seine Kunden
ist das richtig. Für eine **operative** Rechnung ist es falsch, und nicht kosmetisch:
dort stellt die Zeitarbeitsfirma dem Unternehmen die Einsatzstunden in Rechnung,
TempConnect ist Vermittler. Ein Beleg mit TempConnect im Absenderfeld schriebe der
falschen Firma die Leistung zu — und den Vorsteuerabzug beim Empfänger gleich mit.
Deshalb ein eigener Renderer, der beide Parteien aus den echten Stammdaten nimmt.

**Geliefert:**
- `operationalInvoicePdfService.js` — Absender und Empfänger vollständig, Positionen mit
  Kraft, Einsatzwoche, Stunden und Satz (§ 14 Abs. 4 Nr. 5 und 6 UStG), Summen,
  Bankverbindung, Handelsregister. Seitenumbruch ab der 30. Position: ohne ihn schreibt
  pdf-lib stillschweigend unterhalb der Seite, der Text ist dann im Dokument, aber
  unsichtbar — die schlechteste Art, Positionen zu verlieren.
- **Fail-closed wie die E-Rechnung.** Fehlt eine Pflichtangabe, entsteht kein PDF,
  sondern dieselbe Feldliste, die die Bereitschaftsprüfung zeigt und die Pflegemaske
  schließen kann. Ein Beleg ohne Steuernummer sieht aus wie eine Rechnung, berechtigt
  aber nicht zum Vorsteuerabzug — der Fehler fiele sonst erst in der Buchhaltung auf.
- Die Regeln bleiben an **einer** Stelle: derselbe `firmaZuPartei`, dieselbe
  `pruefeFirmenstammdaten` wie die E-Rechnung. Sonst laufen PDF und XML auseinander
  und niemand merkt es, bis ein Finanzamt fragt.
- `GET /invoices/operational/:id/pdf` — zweiseitig lesbar (Aussteller **und**
  Empfänger), im Org-Grenzen-Register eingetragen. Verlinkt in beiden Oberflächen; auf
  der Ausstellerseite **nicht** bei Entwürfen: die haben weder Nummer noch Datum, der
  Knopf lieferte verlässlich 422.

**`?anhang=1` — ehrlich benannt.** Bettet die CII-Nutzlast als Datei ein. Das ist die
*Grundlage* eines Factur-X-Belegs, **nicht** das zertifizierte Format: dafür fehlt
PDF/A-3 (Farbprofil, XMP-Profilkennung, eingebettete Schriften). Der Antwortkopf
`X-Rechnung-Hybrid` sagt, was drin ist, statt es zu behaupten. Wer es liest, bekommt
die strukturierten Daten; wer nicht, sieht ein normales PDF.

**Nebenbefund, offen:** der ZUGFeRD-Weg (`?format=zugferd`) liefert die CII-XML als
`factur-x-<nr>.xml`. Der Name suggeriert Factur-X, geliefert wird die Nutzlast ohne
PDF-Hülle. Für Empfänger, die CII direkt lesen, ist das brauchbar; wer ein
ZUGFeRD-PDF erwartet, findet den Anhang nicht. **Vollwertiges ZUGFeRD wäre eine eigene
Welle** (PDF/A-3-Konformität) — Owner-Entscheidung, kein stiller Umbau.

18 Tests. Volle Suite mit Datenbank: 10323 Tests, 10321 grün, Exit 0.

### 2026-08-29 — Die Sackgasse hinter der E-Rechnung: es gab keine Pflegemaske

**Status:** erledigt · **Kategorie:** Produktausbau (Verdrahtung) · **Fund beim Weiterbau der Oberflächen.**

**Der Befund.** Migration 187 schuf die Rechnungsstammdaten, die E-Rechnung braucht sie,
und die Bereitschaftsprüfung auf `integrations.html` meldete brav, welche fehlen — mit
dem Hinweis „Nachzutragen in den Firmenstammdaten Ihrer Organisation". **Diesen Ort gab
es nicht.** `slaProfil.js` pflegt Straße, PLZ und Ort auf `users`, also am Nutzer,
während die Norm sie auf der Rechtsperson verlangt. Gemessen am 2026-08-28: keine
einzige von 2240 Organisationen hatte eine Anschrift. Die Prüfung hätte auf ewig
Fehlanzeige gemeldet, ohne dass jemand etwas dagegen tun konnte.

**Geliefert:**
- Die Pflegemaske steht **in der Karte, die die Lücke meldet** — nicht auf einer eigenen
  Seite. Wer erfährt, dass die USt-IdNr. fehlt, trägt sie im selben Atemzug ein. Nach dem
  Speichern läuft die Prüfung sofort neu: der Nutzer sieht, ob die Lücke wirklich zu ist.
- `pruefeFirmenstammdaten` gibt je fehlender Angabe einen stabilen `schluessel` zurück.
  Damit markiert die Oberfläche genau das fehlende Feld, ohne deutschen Klartext
  auszuwerten. USt-IdNr. und Steuernummer teilen sich einen Schlüssel — die Norm verlangt
  eines von beiden, also werden beide markiert und nicht willkürlich das eine, das ein
  Kleinunternehmer nie ausfüllen wird.
- Die Bereitschaft liefert zusätzlich `werte` (die aktuellen Stammdaten) und `org_id`.
  Ohne die Werte könnte das Formular nur leer sein — und ein leeres Formular über
  vorhandenen Daten ist die Einladung, sie zu überschreiben.
- **`darf_pflegen` entscheidet das Backend, nicht der Browser.** `org.billing` sieht die
  Bereitschaft, `org.settings` ändert die Stammdaten. Ohne diese Trennung bekäme ein
  Nutzer mit Rechnungseinsicht ein Formular, das beim Speichern mit 403 endet.
- Gesendet werden **nur geänderte** Felder: sonst meldete das Audit bei jeder Korrektur
  einer Postleitzahl zehn geänderte Felder und `changed_fields` wäre als Spur wertlos.
  Ein geleertes Feld wird `null`, nicht Leerstring — sonst sähe die Prüfung einen
  gesetzten Wert und der Fehler verschwände, ohne dass etwas gepflegt wurde.

**Verifiziert im Browser** (Worktree-Server, gestubbte API): Endpunkt gerufen, Lücken
gerendert, genau die fehlenden Felder rot, vorhandene vorbefüllt; Speichern schickt CSRF
und exakt die drei geänderten Felder an `PATCH /organizations/:id`, danach Prüfung neu →
„vollständig". Fünf Zustände einzeln geprüft: ohne Änderungsrecht kein Knopf, 403, 400,
nichts geändert, Netzfehler — jeder mit eigener Meldung, Knopf danach wieder bedienbar.
Auf 375 px eine Spalte, kein Überlauf. 20 Tests in `rechnungsstammdatenMaske.test.js`.

**Offen aus J7:** ein PDF für operative Rechnungen (bisher CSV und E-Rechnung).

### 2026-08-29 — Wer eine Rechnung stellen darf: eine Rolle, die niemand geprueft hat

**Status:** erledigt · **Kategorie:** Sicherheit (Rollen-Logik) · **Fund beim Bau der Empfangsseite.**

**Der Befund.** Die operativen Rechnungsrouten pruefen die Mandantengrenze zweiseitig:
Entleiher UND Verleiher duerfen den Beleg sehen. Das ist fuer das LESEN richtig — ein
Unternehmen muss seine Eingangsrechnung oeffnen koennen. Fuer das SCHREIBEN war es zu
weit: dieselbe Pruefung liess den Empfaenger eine Rechnung an sich selbst erzeugen,
korrigieren, stellen und als bezahlt markieren. Nicht org-fremd, also kein Leck ueber die
Mandantengrenze — aber die falsche Seite des Geschaefts. Wer zahlt, quittiert nicht.

**Warum es durchrutschte.** Die Mandantengrenze war geprueft und gruen. Sie beantwortet
aber nur "gehoert der Beleg zu dieser Organisation?", nicht "ist diese Organisation der
Aussteller?". Zwei Fragen, eine Antwort — und die zweite hatte niemand gestellt.

**Geliefert:**
- `istRechnungssteller()` in `operationalInvoiceService.js`, angewandt auf Erzeugen,
  Korrigieren und jeden Statuswechsel. Zweistufig: fremde Org ergibt weiterhin
  `ORG_BOUNDARY_VIOLATION`, die eigene aber falsche Seite `NOT_INVOICE_ISSUER` (403).
  Ein gemeinsamer Fehlercode haette die beiden Faelle im Audit ununterscheidbar gemacht.
- `api/test/rechnungRollentrennung.test.js` — 7 Tests gegen die echte Datenbank. Nicht
  gemockt: die Rolle entscheidet sich an Zeilen, und ein Mock haette genau die Zuordnung
  erfunden, die hier zu pruefen ist.
- Der Rechnungs-Eingang fuer Unternehmen (`company-timesheets.html`): Liste, Kennzahlen,
  Beleg-Ansicht mit Positionen, CSV und E-Rechnung. **Bewusst ohne jeden Schreibknopf** —
  die Oberflaeche zieht dieselbe Linie wie der Server, statt zu etwas einzuladen, das
  danach mit 403 endet. `api/test/rechnungsEingangOberflaeche.test.js` haelt das fest.

**Offen aus J7:** ein PDF fuer operative Rechnungen (bisher nur CSV und E-Rechnung) und
eine Pflegemaske fuer die Rechnungsstammdaten — der Weg dorthin steht seit J7b, das
Formular nicht.

### 2026-08-22 — E-Rechnung nach EN 16931: die Frist zum 01.01.2027 ist bedient

**Status:** erledigt · **Fakt:** Rechnungen verließen die Plattform bisher nur als CSV
und PDF. Beides ist ab dem 01.01.2027 für Unternehmen mit mehr als 800.000 € Vorjahres-
umsatz kein zulässiger Rechnungsweg mehr, ab dem 01.01.2028 für niemanden. Ein PDF ist
ausdrücklich keine E-Rechnung. Ohne dieses Format wäre TempConnect ab 2027 als
Rechnungsquelle ausgefallen — bei Kunden, die bereits darüber abrechnen.

**Was fehlte außerdem:** `organizations` trug nur Name und Steuernummer. Die Norm
verlangt für beide Seiten eine vollständige Postanschrift und für den Rechnungssteller
eine steuerliche Kennung. Die Adressdaten lagen bis dahin auf `users` und
`org_locations` — also nicht auf der Rechtsperson, die tatsächlich Rechnungssteller ist.

**Geliefert:**
- Mig **187** — Rechnungsstammdaten auf `organizations` (Anschrift, USt-IdNr., IBAN/BIC),
  add-only, ohne NOT NULL: ein Pflichtfeld auf Datenbankebene hätte Bestandszeilen
  gebrochen, ohne irgendjemandem zu sagen, was fehlt.
- `api/services/eRechnungService.js` — reine Funktionen, keine DB, kein IO. XRechnung
  (UBL 2.1) und ZUGFeRD/Factur-X (CII, Profil EN 16931) aus **einer** normalisierten
  Zwischenstruktur, damit die Formate nicht auseinanderlaufen können.
- `GET /api/invoices/operational/:id/e-rechnung?format=xrechnung|zugferd` — zweiseitige
  Mandantengrenze (Entleiher **und** Verleiher), im Org-Grenzen-Register eingetragen und
  vom Wächter verhaltensgeprüft.
- `GET /api/invoices/e-rechnung/bereitschaft` + Oberfläche auf `integrations.html` —
  jede Firma sieht **vor** der ersten Rechnung, ob sie versandfähig ist. Wer die Lücke
  erst bei der ersten abgewiesenen Rechnung bemerkt, hat ein Liquiditätsproblem statt
  eines Datenpflegeproblems.
- **Fail-closed:** fehlt eine Pflichtangabe, entsteht *kein* Dokument, sondern 422 mit
  der Liste der fehlenden Felder samt Geschäftsbegriff-Nummer und Fundort. Eine
  unvollständige E-Rechnung sieht aus wie eine Rechnung und wird beim Empfänger stumm
  abgewiesen.

**Zwei Befunde nebenbei:**
1. Bei Rechnungen mit Bounty-Rabatt (Mig 170) gehen Positionssumme und Netto
   auseinander. Ohne getrennten Ausweis als Nachlass auf Dokumentebene schlägt jede
   solche Rechnung die Prüfregel BR-13 des Empfängers. Ist umgesetzt und getestet.
2. `firmaZuPartei()` bildete die Bankverbindung nicht ab — die Bereitschaftsprüfung
   meldete deshalb *immer* eine fehlende IBAN. Vom eigenen Test gefangen, an der
   Wurzel behoben (eine Quelle statt zwei).

**Tests:** `api/test/eRechnung.test.js` — 72 Prüfungen: Betragsformat (Punkt statt
Komma), Datumsgrenze in Europe/Berlin (ein UTC-Schnitt legt den Beleg in den falschen
Voranmeldungszeitraum), Maskierung von Freitext, rechnerische Schlüssigkeit,
Wohlgeformtheit des erzeugten XML, Mandantengrenze, Bereitschaftsprüfung.
Volle Suite: 9594 Tests grün.

**Doku:** `docs/INTEGRATIONS.md` — neuer Abschnitt; zugleich korrigiert, dass die
DATEV-Anbindung dort noch als "geplant" gefuehrt wurde, obwohl Lohn-Bewegungsdaten **und**
Fibu-Buchungsstapel längst gebaut sind.

---

### 2026-08-19 — H2: zehn Cross-Org-Lücken geschlossen + Wächter (Welle 3b)

**Status:** erledigt · **Fakt:** Zehn Routen ohne Mandantengrenze, sechs davon
schreibend. Die fünf aus der Recherche (Konditionsrahmen aktivieren/archivieren,
operative Rechnungen issue/paid/void/correction, Freigaben approve/reject +
Historie, Requisitions submit/PATCH, Audit-`recent-changes` mit der falschen
Kennung) und fünf, die der neue Wächter selbst fand: Requisitions-`events` und
-`candidates` (Lesen mit E-Mails), **`PATCH /organizations/:id`** (Schreiben auf
den Organisationsdatensatz einer fremden Firma, inkl. `parent_org_id`),
`POST /organizations/:id/departments` (Abteilung in fremder Org anlegen) und
`POST /requisitions/:id/comment`.
**Aktion:** Grenze in Route **und** Service-SQL; `getRecentChanges` in eine
org-gebundene und eine ausdrücklich benannte plattformweite Fassung getrennt.
**Verify:** `api/test/security/orgGrenzeLuecken.test.js` (24 Fälle, vor der
Reparatur rot), `api/test/orgGrenzenWaechter.test.js` (62 Fälle inkl.
Selbstprobe), volle Suite **8804/0**. Vier Mutationen gegen den echten Bestand
gefahren: Handler-Mutationen macht der Wächter rot, SQL-Mutationen die
Service-Tests.

### 2026-08-20 — E-15/E-16/E-17: drei weitere Cross-Org-Schreibzugriffe geschlossen

**Status:** erledigt · **Fakt:** (E-17, der schwerste) `data_governance.anonymize`
halten owner/admin JEDER Kundenorganisation (rbacService.js:121), und
`anonymizeUser` prueste die Organisation des Ziels nie — ein Org-Inhaber konnte
das Konto eines FREMDEN Nutzers unwiderruflich anonymisieren.
(E-15) `deleteSearchJob` loeschte Treffer, Ereignisse und Meldungen OHNE Bindung
und prueste den Besitzer erst in der vierten Anweisung — Datenverlust bei einem
Dritten, mit 404 quittiert.
(E-16) `addFeedback` behandelte jeden Unbeteiligten als Mentee und schrieb
Bewertung samt Note auf eine fremde Sitzung.
**Aktion:** alle drei an der Wurzel geschlossen (Zugehoerigkeit bzw. Beteiligung
zuerst, Bindung im SQL). E-17 zusaetzlich auf dem /check-Weg, der sonst die
Existenz und die Blocker eines fremden Nutzers verraten haette.
**Verify:** `orgGrenzeLuecken.test.js` Abschnitte E-15/E-16/E-17, je mit
Gegenprobe, dass der eigene Weg weiterhin funktioniert.

### 2026-08-19 — E-13: derselbe Fehler ein zweites Mal, in einer anderen Datei

**Status:** erledigt · **Fakt:** `getStaffingChoiceSet`
(`assignmentStaffingService.js:3903`) rief `refreshStaffingChoiceSetLifecycle`,
das `UPDATE assignment_staffing_choice_sets SET status = ...` schreibt, VOR der
Zugehoerigkeitspruefung. Ein Zugriff mit fremder Auswahl-Kennung hat deren
Status fortgeschrieben und danach 404 geliefert.
**Aktion:** Zugehoerigkeit zuerst, im SQL; dann fortschreiben. Zusaetzlich hat
der Waechter dafuer eine eigene Zusicherung bekommen (`schreibenNachGrenze`),
die die REIHENFOLGE prueft statt nur das Ergebnis — sie findet die naechste
Fundstelle dieser Klasse von selbst.
**Verify:** `orgGrenzeLuecken.test.js` Abschnitt E-13.

### 2026-08-19 — E-12: ein Lesezugriff schrieb ueber die Mandantengrenze

**Status:** erledigt · **Fakt:** `getAssignmentStaffingOverview`
(`assignmentStaffingService.js`) rief `recalcAssignmentStaffing` — ein
`UPDATE assignments ... WHERE id = $1` ohne Org-Bindung — VOR der
Zugehoerigkeitspruefung. `GET /staffing-assignments/:id` auf eine fremde Kennung
hat damit die fremde Zeile geschrieben und danach 404 geliefert.
**Aktion:** Zugehoerigkeit zuerst, im SQL (`AND supplier_org_id = $2`), dann
rechnen. **Verify:** `orgGrenzeLuecken.test.js` Abschnitt E-12 (26/26), inkl.
Gegenprobe, dass die Neuberechnung fuer die eigene Org weiterhin laeuft.

### 2026-08-19 — H2 zweite Welle: die vier größten Flächen eingeordnet

**Status:** erledigt · **Fakt:** `capacityExchange` (18), `marketplace` (30),
`workerPortal` (18) und `staffControlCenter` (47) stehen unter dem Wächter.
**Kein neuer Cross-Org-Schreibzugriff gefunden** — dafür drei
Architekturbefunde: die ersten beiden Dateien sind **nutzer-** statt
org-gebunden (D-M5), das Arbeiterportal und das Staff Control Center haben je
*eine* Eintrittsbedingung statt einer Grenze je Route (neue Wächter-Schicht B2),
und `canAccessAsOwner` funktionierte nicht (P1-17, seit dem 2026-08-20 behoben).
**Verify:** `api/test/orgGrenzenWaechter.test.js` 457/457, volle Suite 9210/0.
Abdeckung **82 von 82** Route-Dateien, 257 verhaltensgeprüft, 123 belegte
Ausnahmen — dazu Schicht B3 für Flächen ganz ohne Platzhalter-Route (OCC).

### 2026-08-19 — Betriebswissen: gemessen gegen die laufende Datenbank

`rate_cards` und `approval_requests` haben **keine RLS-Policy** (`rls=false`,
0 Policies) — für diese Tabellen gibt es in keinem Deployment einen
DB-Backstop. `audit_log` trägt 1782 von 2711 Zeilen ohne `org_id`.`. Neue Blocker, die in Sessions auftauchen, werden als P0/P1/P2 angelegt.
Letzte Aktualisierung: 2026-08-22 — **E-Rechnung nach EN 16931 geliefert**: XRechnung (UBL 2.1) und ZUGFeRD (CII) aus operativen Rechnungen, Migration 187 (Rechnungsstammdaten auf `organizations`), Bereitschaftspruefung mit Oberflaeche auf `integrations.html` (9595 Tests, 0 Fehler). Damit ist die Versandpflicht zum 01.01.2027 fuer die B2B-Einsatzabrechnung bedient. Neuer offener Punkt: die Abo-Rechnungen der Plattform an ihre eigenen Kunden laufen noch nicht ueber diesen Weg. Vorher: 2026-08-20 — **Welle H1 (Kundenansicht Ausfall) abgeschlossen** und mit H2 auf der Release-Linie zusammengefuehrt (9109 Tests, 0 Fehler); neuer P2-Eintrag W1 zu den Doku-Waechtern im Worktree. Vorher: 2026-08-19 — **Welle H2 (Mandantengrenzen) abgeschlossen: zehn Cross-Org-Lücken geschlossen, Wächter gebaut.** Neuer P1-Eintrag: Migration 117 existiert nicht, obwohl 28 Tabellen in `TENANT_ISOLATION_MODEL.md` auf sie verweisen. Vorher: 2026-08-07 — **P8 Deal-Verbindlichkeit (Wellen A-E) abgeschlossen und committet** (`4220693`..`67b0282`). Vier geerbte Defekte dabei gefunden und geschlossen, darunter eine Kennzahl, die das Feed-Ranking steuerte und in Produktion durchgehend NULL war, und ein Bounty, das notorische Kurzfrist-Stornierer mit 3 % Rabatt belohnte. **Neue Betriebs-Pflicht vor Go-Live: Cron `recompute-deal-reliability` einrichten + Migrationen 164/165 einspielen** (siehe Done-Eintrag). Vorher: 2026-07-26 — **P1.0 Schritt (d) erledigt**: `.env.prod.example` kannte `STAFF_SESSION_SECRET` nicht, obwohl die Variable in Produktion ein `fatal()` ausloest — ein Deploy nach dieser Vorlage waere nicht gestartet. Ergaenzt + Waechter `api/test/prodEnvTemplate.test.js`, der Pflichtvariablen aus dem Code gegen die Vorlage prueft. Ebenfalls am 2026-07-26: `docs/AUDIT_BACKLOG.md` vollstaendig abgearbeitet (u. a. ein ausnutzbares Cross-Org-Leck geschlossen). Vorher: 2026-06-13 — **Welle F1 (Code-Schlussarbeiten) abgeschlossen + committet** (`9f37250`/`1044343`/`878b022`/`845b6c9`): Prod-Härtung, Security-Quick-Wins, Hygiene-Sweep, Test-Harness-Folge inkl. eines gefundenen+gefixten requireMfa-SCC-Betriebsblockers; volle Suite 4508/0, Lint 0/0, Builds grün — siehe Abschlussbericht im Worklog. Marktstart-Ziel auf **01.09.2026** aktualisiert (UG-Gründung = kritischer Pfad). Vorher: 2026-06-11 — **Der konsolidierte Vorwaerts-Plan bis zur finalen Abnahme (Wellen F0-F6) liegt in `docs/finalization/FINALISIERUNGSPLAN_ABNAHME.md`** und mappt ALLE offenen Punkte dieses Files (P0.4, P1.0, P1.4, E-01, P2.x) + Gap-Register O-01-O-11 + Audit-Funde 2026-06-11 auf Wellen/Phasen mit Abnahmekriterien. Vorher: 2026-06-05 (Go-Live-Haertung abgeschlossen, „drei wie empfohlen" Owner-approved: P0.6 [052-Demo-Seed-Backdoor] via Env-Flag-Gate `SEED_DEMO_WORLD` [migrate.sh PGOPTIONS-GUC + 052 DO-Guard + Compose-Split base/prod=false, override=true] + Remediation-Migration 125 [Hash-Neutralisierung der 6 Demo-Konten, gegated+idempotent]; P0.7 Tier-2 [Bestands-DB-116-Backstop] via Forward-Repair-Migration 126 [nicht-transaktional, per-Tabelle-to_regclass-guarded, idempotent]; subscriptions-RLS-Exclusion bestaetigt. Verifiziert auf zwei Wegwerf-DBs [beide Flag-Pfade + Nicht-Superuser-Deny-by-Default-Laufzeitbeweis], realer Stack unberuehrt. AKTIVIERUNG: 126 schaltet Deny-by-Default+FORCE RLS beim naechsten migrate-Lauf gegen Bestands-/Managed-DB scharf. Alle Diffs uncommitted = Owner-Commit-Gate. Vorherige offene Owner-Tasks bleiben: P0.4, P1.4-Live-Run, E-01, R2/R9 extern).
## Offene Blocker (neu 2026-08-19)

- **E-Rechnung: die Abo-Rechnungen der Plattform laufen noch nicht über den neuen Weg.**
  - *Status:* offen, **kein Produktionsrisiko heute**, aber dieselbe Frist.
  - *Fakt:* `GET /api/invoices/operational/:id/e-rechnung` deckt Rechnungen zwischen zwei
    Organisationen ab (aus freigegebenen Stundenzetteln). Bei den Abo-Rechnungen der
    Plattform an ihre eigenen Kunden ist **TempConnect selbst** Rechnungssteller — dafür
    braucht es Betreiber-Stammdaten aus der Konfiguration statt aus `organizations`.
  - *Aktion:* Betreiber-Stammdaten als Konfiguration (Tier-1) ergänzen und denselben
    Generator anschließen. Der Generator selbst ist fertig und formatunabhängig.
  - *Frist:* 01.01.2027, sobald der eigene Vorjahresumsatz 800.000 € übersteigt —
    spätestens 01.01.2028. **Owner-Entscheidung**, weil es die eigene Rechnungsstellung
    betrifft.

- **P2-W1 — Die beiden Doku-Waechter leiten aus einem FEHLENDEN Pfad einen Befund ab.**
  - *Status:* offen, **kein Produktionsrisiko**, aber eine Falle, in die inzwischen **zwei Sitzungen unabhaengig voneinander** getappt sind.
  - *Fakt:* `api/test/docsConsistency.test.js` und `api/test/dokuWaechter.test.js` scannen `.agents/`, `frontend/support-ops/` und `docs/launch/`. Alle drei sind gitignored und fehlen in einem frischen `git worktree`. Folge: `SKILL.md` und `support-ops` gelten als "belegter Pfad existiert nicht", acht `docs/launch/`-Eintraege der Bestandsliste als "erledigt", und vier Dokumente als neu verwaist — sie werden ausschliesslich aus den fehlenden Dateien verlinkt. Im Hauptbaum gruen (13/13 am 2026-08-19 und erneut am 2026-08-20 gemessen).
  - *Zwischenloesung, bereits dokumentiert:* die drei Pfade aus dem Hauptbaum verknuepfen (siehe `docs/UEBERGABE.md`). Das macht den Baum benutzbar, behebt aber die Ursache nicht.
  - *Aktion:* Die Waechter sollen eine fehlende Scan-Wurzel ausdruecklich als **nicht geprueft** melden, statt aus ihrer Abwesenheit einen Befund abzuleiten. Ein Waechter, der in einer von zwei Welten dauerhaft rot ist, wird irgendwann abgeschaltet — genau die Lehre, die nach der CRLF-Episode schon einmal in der Uebergabe stand. **Owner-Entscheidung**, weil es einen Waechter beruehrt.
  - *Aufwand:* ~1 h. *Verify:* dieselbe Datei im Hauptbaum und in einem frischen Worktree, beide mit identischer Aussage.

---


Letzte Aktualisierung: 2026-09-13 — **N2.8: die freie Kopfzahl filtert vor dem LIMIT.** Dabei gefunden: zwei Zuweisungen am selben Angebot verdoppelten dessen Zusage und konnten es als `reserved` aus dem Markt nehmen, obwohl Plaetze frei waren. Vorher: **N2.7: was die Pruefung am Umkreis fand.** Die Bedarfsseite blaetterte nicht (Seite 2 = Seite 1), die Naehe galt nicht ueber beide Marktseiten, der Punkt entstand erst nach dem ersten Matching und beim Notdienst gar nicht. Vorher: **N4.5: die Kundensperre an den uebersehenen Stellen.** Der Riegel der Detailansicht (N4.1) hat nie ausgeloest — er las eine Spalte, die die oeffentliche Projektion absichtlich nicht liefert; und fuenf Zuordnungs-Wege kannten die Sperre nicht, drei davon schreiben Anbieter an. Vorher: **N2.5: Abbrechen verliert nichts — damit ist Abschnitt N2 vollstaendig.** Der Entwurf lebt im Browser und nicht als `draft` in der Datenbank: ein halbfertiger Bedarf, der durch einen vergessenen Filter in den Feed rutscht, waere der teuerste Ausgang. Vorher: **N2.6: die Bedarfsanlage ist aus der Personalsuche erreichbar** — dauerhaft im Kopf und im Leerzustand. Der allgemeine Erreichbarkeits-Waechter war gruen, weil die Seite von IRGENDWO erreichbar war; jetzt steht der bestimmte Weg fest (WOHER → WOHIN). Vorher: **N2.4: die Treffer-Vorschau steht.** „Mit diesen Angaben: N Kraefte im Umkreis“ — die Zahl kommt aus demselben Endpunkt, dessen Ergebnis der Kunde spaeter sieht, und reagiert auf Ort, PLZ, Umkreis, Rolle und Faehigkeiten. Vorher: **N2.0c: beide Marktseiten loesen einen Ort gleich auf.** Das Angebotsformular geokodierte umgekehrt zum Server — Angebote landeten auf der Stadtmitte, Bedarfe im Stadtteil. Seit N2.4b rechnet der Umkreis wirklich mit diesen Punkten. Vorher: **N2.1: die Bedarfsanlage ist ein Assistent in fuenf Schritten, der Ort vorn.** Vorbelegt aus dem aktiven Standort, aenderbar; die Felder werden nicht verschoben, sondern je einem Schritt zugeordnet. Ohne JavaScript bleibt es das bisherige Formular. Vorher: **N2.4b: der Umkreis rechnet in SQL.** Er lief vorher nach dem LIMIT — die Trefferzahl kannte ihn nicht, und eine Seite konnte weniger liefern als angefordert. Nachweis gefuehrt: 25 km -> 9, 300 km -> 11, 400 km -> 13. Vorher: **N2.0b: der Bestand ist nachgetragen.** Alle aktiven Angebote und offenen Bedarfe haben jetzt Koordinaten (vorher 0 von 22); der Lauf brauchte 6 Abfragen fuer 22 Zeilen, weil ein Ort nur einmal gefragt wird. Belegt: die PLZ verschiebt den Punkt um 13,7 km gegenueber der Ortsmitte. Vorher: **N2.4-Vorstufe: die Trefferzahl des Feeds zaehlte beide Marktseiten und filterte erst danach — ein Unternehmen sah 6 Angebote und las 23 Treffer.** Behoben; der Radius wirkt weiterhin nicht auf die Zahl (offen, owner-pflichtig). Vorher: **Welle N2.0 abgeschlossen: der Marktplatz bekommt Koordinaten.** Gemessen: von 40 Bedarfen hatten 5 welche, von 45 Angeboten 7 — bei 100 % erfasstem Radius. Die Entfernungsbewertung lief damit praktisch nie. Beide Seiten werden jetzt beim Anlegen geokodiert, die PLZ ueber die Freitext-Abfrage (die strukturierte verschluckt sie meistens — gemessen). Vorher: **Welle N2.2 abgeschlossen: der Preisvorschlag erreicht die Bedarfsanlage.** `/api/pricing/suggest` war fertig und hatte NULL Aufrufer; jetzt zeigt die vierte Frage eine belegte Spanne statt eines leeren Feldes. Ohne Tarif kein Vorschlag, aber keine Sperre. Vorher: **Welle N4 vollstaendig abgeschlossen: gesperrt heisst unsichtbar — eine Bedingung, vier Flaechen (Feed, Suche, Detailansicht, Deckungsrechnung), und `negotiate-deal` bekommt den Riegel, den nur `accept-deal` hatte.** Die Auskunft an die Agentur nennt weder Grund noch Kunden. Die K4-Feed-Kopie hat seit Migration 216 eine Marktseite und nimmt keine betrachter-gefilterte Liste mehr auf (N4.4). Vorher: **Welle N2.1 abgeschlossen: der Notdienst wird aus dem Einsatzbeginn ABGELEITET (Vorlauf <= 2 Kalendertage, Europe/Berlin), das Auswahlfeld ist entfernt.** Dabei gefunden: die Notdienst-Maschinerie waere mit NORMALER SLA angelaufen, weil der geparste Rumpf den Schema-Standardwert trug. Vorher: **Welle N7.5 abgeschlossen: der plattformweite Notdienst-Blick hat jetzt eine Zielgruppe (nur Agenturen) und eine Feldauswahl (22 Felder statt 44 Spalten, als Erlaubnisliste im Dienst).** Damit ist der letzte offene Sicherheitspunkt aus N7.4 entschieden und geschlossen. Vorher: **Welle N1b abgeschlossen: jetzt waehlen ALLE FUENF Flaechen aus derselben Faehigkeitsmenge.** Die Mitarbeiterseite bot 142 fest verdrahtete Begriffe an, von denen **109 im Katalog nicht vorkamen** — und schrieb sie als Wortliste ins Profil, wodurch `worker_profile_skills` leer blieb und der Angebotsgenerator diese Menschen nie in den Markt brachte. Neuer katalog-gebundener Endpunkt fuer die Agentursicht; Bestandsdaten geprueft und sauber. Vorher: **Welle N1 (Faehigkeiten-Katalog) abgeschlossen: beide Marktseiten waehlen jetzt aus derselben Menge.** Vorher tippten beide Freitext — Schreibvarianten, die einander nie finden, ohne dass es jemand sieht. Neu: ein gemeinsames Bauteil (`skillPicker.js`), die Zahl verfuegbarer Kraefte je Faehigkeit (`aggregateBySkill`, die es noch nicht gab) und der gefuehrte Weg fuer eigene Begriffe. **Neuer offener Punkt:** `mitarbeiter.js` traegt eine zweite, fest verdrahtete Liste. Vorher: **Welle N7.4 (Notdienst) abgeschlossen: von elf fertigen, auditierten Endpunkten riefen die Oberflächen zwei auf.** Sechs davon verdrahtet, darunter der einzige Weg, eine Teilzusage zurückzunehmen. Drei Befunde dabei: `POST /emergency/:id/escalate` hatte **keine Eigentumsprüfung** (jeder Tarif-Berechtigte konnte fremde Notlagen hochstufen und damit einen E-Mail-Rundruf an bis zu 50 Anbieter auslösen) — geschlossen; `?all=1` liefert `dr.*` inkl. fremder Kontakt-Durchwahl — **offen, Owner-Entscheidung**; der Erreichbarkeits-Wächter übersah 17 Registerzeilen und damit fünf lebende Seiten — geschlossen. Vorher: 2026-08-21 — **8.1.1 (a)–(e) abgeschlossen. Beim Bauen von (d) zwei aktive Cross-Org-Lecks gefunden: 201 Kundenkonten konnten das plattformweite Audit-Log lesen und exportieren — und jeden Nutzer der Plattform ändern oder sperren.** Beides geschlossen. Zwei neue P1-Punkte offen (admin.js als Kundenfläche mit Plattformdaten; fünf Routen mit selbstabschaltender Org-Grenze). Vorher: **8.1.1 abgeschlossen: das Audit-Log trennt die Mandanten, Abnahme `fremde_org` 139 → 0.** Die Ursache war ein Demo-Login ohne `session.regenerate()`, der die Organisation des Vorgängers erbte — das betraf die Mandantengrenze von 45 Routen, nicht nur das Audit. Vorher: **Vorlauf V-2 zu Welle I erledigt: drei Wächter prüfen jetzt den git-Index statt des Dateibaums (P2-W1)** — sie waren in jedem Worktree/Klon/CI dauerhaft rot, ohne dass etwas kaputt war, und im Hauptbaum gleichzeitig falsch grün. Voller Lauf erstmals 9524/0. Vorher: 2026-08-19 — **Welle H2 (Mandantengrenzen) abgeschlossen: zehn Cross-Org-Lücken geschlossen, Wächter gebaut.** Neuer P1-Eintrag: Migration 117 existiert nicht, obwohl 28 Tabellen in `TENANT_ISOLATION_MODEL.md` auf sie verweisen. Vorher: 2026-08-07 — **P8 Deal-Verbindlichkeit (Wellen A-E) abgeschlossen und committet** (`4220693`..`67b0282`). Vier geerbte Defekte dabei gefunden und geschlossen, darunter eine Kennzahl, die das Feed-Ranking steuerte und in Produktion durchgehend NULL war, und ein Bounty, das notorische Kurzfrist-Stornierer mit 3 % Rabatt belohnte. **Neue Betriebs-Pflicht vor Go-Live: Cron `recompute-deal-reliability` einrichten + Migrationen 164/165 einspielen** (siehe Done-Eintrag). Vorher: 2026-07-26 — **P1.0 Schritt (d) erledigt**: `.env.prod.example` kannte `STAFF_SESSION_SECRET` nicht, obwohl die Variable in Produktion ein `fatal()` ausloest — ein Deploy nach dieser Vorlage waere nicht gestartet. Ergaenzt + Waechter `api/test/prodEnvTemplate.test.js`, der Pflichtvariablen aus dem Code gegen die Vorlage prueft. Ebenfalls am 2026-07-26: `docs/AUDIT_BACKLOG.md` vollstaendig abgearbeitet (u. a. ein ausnutzbares Cross-Org-Leck geschlossen). Vorher: 2026-06-13 — **Welle F1 (Code-Schlussarbeiten) abgeschlossen + committet** (`9f37250`/`1044343`/`878b022`/`845b6c9`): Prod-Härtung, Security-Quick-Wins, Hygiene-Sweep, Test-Harness-Folge inkl. eines gefundenen+gefixten requireMfa-SCC-Betriebsblockers; volle Suite 4508/0, Lint 0/0, Builds grün — siehe Abschlussbericht im Worklog. Marktstart-Ziel auf **01.09.2026** aktualisiert (UG-Gründung = kritischer Pfad). Vorher: 2026-06-11 — **Der konsolidierte Vorwaerts-Plan bis zur finalen Abnahme (Wellen F0-F6) liegt in `docs/finalization/FINALISIERUNGSPLAN_ABNAHME.md`** und mappt ALLE offenen Punkte dieses Files (P0.4, P1.0, P1.4, E-01, P2.x) + Gap-Register O-01-O-11 + Audit-Funde 2026-06-11 auf Wellen/Phasen mit Abnahmekriterien. Vorher: 2026-06-05 (Go-Live-Haertung abgeschlossen, „drei wie empfohlen" Owner-approved: P0.6 [052-Demo-Seed-Backdoor] via Env-Flag-Gate `SEED_DEMO_WORLD` [migrate.sh PGOPTIONS-GUC + 052 DO-Guard + Compose-Split base/prod=false, override=true] + Remediation-Migration 125 [Hash-Neutralisierung der 6 Demo-Konten, gegated+idempotent]; P0.7 Tier-2 [Bestands-DB-116-Backstop] via Forward-Repair-Migration 126 [nicht-transaktional, per-Tabelle-to_regclass-guarded, idempotent]; subscriptions-RLS-Exclusion bestaetigt. Verifiziert auf zwei Wegwerf-DBs [beide Flag-Pfade + Nicht-Superuser-Deny-by-Default-Laufzeitbeweis], realer Stack unberuehrt. AKTIVIERUNG: 126 schaltet Deny-by-Default+FORCE RLS beim naechsten migrate-Lauf gegen Bestands-/Managed-DB scharf. Alle Diffs uncommitted = Owner-Commit-Gate. Vorherige offene Owner-Tasks bleiben: P0.4, P1.4-Live-Run, E-01, R2/R9 extern).
## Owner-Aufgaben im Klartext (Stand 2026-07-26)

> **Warum dieser Abschnitt existiert:** die Punkte unten stehen weiter unten schon als P0.4 /
> P1.0 / P1.4 — aber in Kurzschrift, die man nur versteht, wenn man sie geschrieben hat. Hier
> steht in normalen Sätzen, **was gemeint ist, warum es zählt und was konkret zu tun ist.**
> Alles hier kann **nur der Owner** erledigen: Zugangsdaten, Server, GitHub-Konto.

---

### 0. Vorab: warum GitHub-Links „404" zeigen

`Rosenbaum-yoo/tempconnect` ist ein **privates** Repository. GitHub antwortet Besuchern ohne
Berechtigung absichtlich mit **404** statt „kein Zugriff" — es soll nicht einmal verraten, dass
etwas existiert. Ein Actions-Link, der nicht öffnet, ist deshalb **nicht kaputt**: der Browser
ist nur nicht als `Rosenbaum-yoo` angemeldet. Einmal auf github.com mit diesem Konto anmelden,
dann öffnen dieselben Links normal. (Die `gh`-Kommandozeile ist angemeldet — daher kommen die
Angaben in diesem Dokument.)

---

### 0b. 🔴 Redis ist keine Kür — ohne ihn läuft nichts von allein *(2026-08-14)*

**Der Zustand meldet sich nicht.** Ist Redis beim Start nicht erreichbar, schreibt
`api/workers/index.js:34-37` die Zeile `Redis not configured — background workers
disabled` ins Log und fährt fort. Die API antwortet normal, der Healthcheck ist
grün, die Oberfläche wirkt vollständig — nur im Hintergrund passiert nichts mehr:
keine Benachrichtigungs-E-Mail, keine Trefferberechnung, keine Einsatz-Einladung,
und **kein Verfallslauf um 03:00**.

Die letzte Folge ist die teuerste: der Marktplatz zeigt dann Personal an, das es
nicht mehr gibt. Ein Unternehmen ruft wegen einer Kraft an, die längst weg ist.
Das meldet niemand als Ausfall — das kommt als Unzuverlässigkeit an.

- [ ] Vor dem Start: Redis erreichbar (`redis-cli ping` → `PONG`).
- [ ] Nach dem Start: `docker logs tempconnect_api | grep -E "Background workers started|Redis not configured"` zeigt die **erste** Zeile.
- [ ] Überwachung meldet einen Redis-Ausfall. Ohne Alarm bleibt der stille Zustand wochenlang unbemerkt.

Vollständige Checkliste mit Wirkungstabelle: `docs/launch/C_HETZNER-DEPLOY-RUNBOOK.md` §10a.

*Warum das hier steht:* Der Kommentar in `api/workers/index.js:18-23` hält fest,
dass genau dieser Zustand schon einmal bestand — den Capacity-Worker gab es,
eingeplant hat ihn nichts, der Verfall lief nie. Ein Fehler, der sich selbst
verschweigt, gehört auf eine Liste.

---

### 1. 🔴 Die CI — Ursache gefunden, eine Owner-Handlung offen

**Was gemessen wurde:** von **62 Läufen in der gesamten Repo-Historie sind alle 62
`startup_failure`** nach 0 Sekunden. Nicht „seit Juni kaputt" — es gab **nie** einen
erfolgreichen Lauf.

**Aufgeklaert am 2026-07-26 — es waren zwei Ursachen.** Erstens war der Workflow **manuell
deaktiviert** (`gh workflow list --all` → `CI  disabled_manually`); deaktivierte Workflows
verschweigt `gh workflow list` ohne `--all`, deshalb blieb das lange unentdeckt. Das ist
**behoben**, er steht auf `active`. Zweitens zeigte der erste danach wirklich ausgefuehrte
Lauf den eigentlichen Grund: eine **Kontosperre wegen Abrechnung**. Nur die ist noch offen —
und nur vom Owner loesbar (Schritt 2 unten).

**Warum das mehr ist als ein rotes Lämpchen:** `docs/GO_LIVE_FINAL.md` und
`docs/RELEASE_RUNBOOK.md` erklären den CI-Job `release-artifact` zum **kanonischen** Weg zum
Produktions-Artefakt — „CI grün laufen lassen, Artefakt herunterladen". Dieser Weg ist derzeit
nicht ausführbar. Und jede Aussage „CI ist grün" in der Dokumentation beschreibt etwas, das nie
stattgefunden hat.

**Wie schlimm ist es wirklich?** Es ist **kein Code-Problem**: die Testsuite ist auf diesem
Rechner nachweislich grün (7484 Unit-Tests, 186 Integrationstests). Es ist ein
**Verifikations**-Problem: niemand hat den Code je auf einer fremden, sauberen Maschine gebaut
und getestet. Genau das ist der Zweck einer CI — sie fängt „bei mir läuft's". Vor dem ersten
echten Kunden muss das weg; heute brennt nichts, weil nichts produktiv läuft.

**Ursache steht fest — bitte nichts davon erneut prüfen:** es war weder der Code noch die
Workflow-Datei. Zwei Dinge kamen zusammen: ein manuell deaktivierter Workflow (behoben) und
die Kontosperre (offen, Schritt 2). Unterwegs ausgeschlossen wurde:
- Actions sind auf Repo-Ebene aktiviert (`enabled: true, allowed_actions: all`).
- Die Workflow-Datei ist auf **beiden** Branches gültig: YAML lädt, alle Jobs haben `runs-on`
  und `steps`, kein `needs` zeigt ins Leere, kein Step hat `uses` **und** `run`, keine
  doppelten Schlüssel, **kein BOM**, keine Tabs.
- Die API liefert als einzigen Hinweis `path: "BuildFailed"` — ein Platzhalter, den GitHub
  setzt, wenn es die Workflow-Definition gar nicht aufbauen konnte.

**Deine Schritte (5 Minuten):**
1. Auf github.com als `Rosenbaum-yoo` anmelden.
2. **Settings → Billing and plans.** Dort liegt die Ursache. Beim ersten tatsächlich
   ausgeführten Lauf meldete GitHub für **jeden** Job: „account is locked due to a
   billing issue“. Offene Zahlungssache klären — abgelaufene Karte, unbezahlte Rechnung
   oder ein Ausgabenlimit.
3. Hintergrund, damit die alte Fehlersuche nicht wiederholt wird: der Workflow war
   zusätzlich **manuell deaktiviert** (`gh workflow list --all` → `CI  disabled_manually`).
   Das ist **behoben**, er steht auf `active`. Genau deshalb endeten alle 62 früheren Läufe
   mit `startup_failure` nach 0 Sekunden — ohne Annotation, an der etwas ablesbar gewesen
   wäre. Die Kontosperre wurde erst sichtbar, als wieder ein Lauf startete.
4. Danach **Actions → CI → Run workflow** anstoßen (`workflow_dispatch` ist konfiguriert) und
   das Ergebnis hier eintragen.

**Selbst prüfen, jederzeit:** `bash scripts/ci-status.sh` — sagt in 5 Sekunden, ob es je einen
grünen Lauf gab und wie alt der letzte ist. Genau diese Blindstelle blieb sonst einen Monat
unbemerkt.

---

### 2. Secret-Rotation (P0.4) — die Schlüssel wechseln

**Was gemeint ist:** alle Geheimnisse in der aktuellen `.env` sind während der Entwicklung
entstanden und benutzt worden. Sie standen in Logs, in Terminals, teils in Screenshots, und
manche waren von Anfang an Entwicklungs-Platzhalter. Bevor echte Kundendaten im System liegen,
wird **jedes einzelne** durch einen frischen Zufallswert ersetzt.

**Warum das zählt:** wer `SESSION_SECRET` kennt, kann sich **fremde Sitzungen selbst
ausstellen** — ohne Passwort, ohne Spur. Das ist keine Formalie.

**Was zu tun ist** (die Befehle stehen unten bei P0.4, hier die Bedeutung):
- **`SESSION_SECRET` + `STAFF_SESSION_SECRET`** neu erzeugen. Folge: **alle** angemeldeten
  Nutzer werden ausgeloggt und müssen sich neu anmelden. Vor dem Pilotstart also harmlos,
  danach ein angekündigter Wartungsschritt.
- **DB-Passwort** wechseln — zuerst in der Datenbank, **direkt danach** in der `.env`, dann
  neu starten. Die Reihenfolge ist wichtig, sonst kommt die API nicht mehr an die Datenbank.
- **Stripe Secret Key** im Dashboard rollen („Roll key"), **Sentry-Token** neu ausstellen und
  den alten löschen.
- **Zusätzlich (aus früheren Sitzungen):** den **Web3Forms-Key** bei Cloudflare als Secret
  setzen **und den alten rotieren** — er steht in der Git-Historie und lässt sich daraus nicht
  entfernen. Bis zur Rotation bleibt er für Fremde nutzbar.

---

### 3. Staff Control Center betriebsbereit machen (P1.0, Rest)

**Was das ist:** das Staff Control Center ist die **Betreiber-Kanzel** unter `/staff/` — deine
Sicht auf die Plattform, strikt getrennt von Kunden-, Admin- und Support-Welt. Der Code ist
fertig und getestet; es fehlt die Einrichtung auf dem Server.

**Was zu tun ist:**
- **(a) nginx-VHost** für eine eigene Subdomain (z. B. `staff.tempconnect.de`), damit die
  Betreiber-Oberfläche nicht unter derselben Adresse wie die Kundenanwendung liegt.
- **(b) eigenes TLS-Zertifikat** für diese Subdomain.
- **(c) optional IP-Allowlist** auf VHost-Ebene — nur euer Anschluss kommt überhaupt bis zur
  Anmeldemaske.
- **(e) die zwei echten Nutzer-UUIDs** (Betreiber-Team) in `STAFF_USER_IDS`. Das ist ein
  einmaliger Startschalter: beim ersten Login werden diese Konten als Staff freigeschaltet,
  danach verwaltet das Center seine Mitglieder selbst. **Leer bedeutet: niemand kommt hinein.**
- **(f) optional `HETZNER_CLOUD_TOKEN`** (Lesezugriff genügt). Ohne Token zeigt die
  Infrastruktur-Ansicht ehrlich gekennzeichnete Beispieldaten statt echter Server.

**Schon erledigt (2026-07-26):** alle drei Variablen stehen samt Erklärung in
`.env.prod.example`. Dabei fiel auf, dass `STAFF_SESSION_SECRET` dort **fehlte** — und diese
Variable bricht den Produktionsstart hart ab. Ein Deploy nach der alten Vorlage wäre nicht
hochgekommen. Ein Test wacht jetzt darüber (`api/test/prodEnvTemplate.test.js`).

---

### 4. Restore-Probe (P1.4) — einmal wirklich zurückspielen

**Was gemeint ist:** die Backup-Skripte existieren, sind getestet und laufen. Aber **noch
niemand hat auf dem echten Server ein Backup tatsächlich zurückgespielt.** Genau das ist die
Aufgabe — nicht Code schreiben, sondern es einmal durchspielen.

**Warum das zählt:** ein Backup, das nie zurückgespielt wurde, ist eine **Annahme**, keine
Absicherung. Der Ernstfall ist der schlechteste Zeitpunkt, um herauszufinden, dass die Datei
unvollständig ist, ein Passwort fehlt oder der Vorgang vier Stunden dauert.

**Die Übung:**
1. Backup erzeugen (`scripts/backup.sh`) und prüfen (`scripts/backup-verify.sh`).
2. In eine **Wegwerf-Datenbank** zurückspielen (`scripts/restore-test.sh`) — nicht in die echte.
3. Stichprobe: sind Organisationen, Nutzer und Stundenzettel wirklich da?
4. **Die Uhrzeit mitschreiben.** Wie lange hat es gedauert, wie alt war der Datenstand? Das
   sind genau die beiden Zahlen (RPO/RTO), die `docs/GO_LIVE_FINAL.md` verlangt — und
   dieselben, die man im Ernstfall dem Kunden nennen muss.
5. Ergebnis in `docs/BACKUP_DISASTER_RECOVERY.md` eintragen, mit Datum.

---

## Status-Legende
- **P0** - harter Blocker, verhindert gruene CI oder stabile Produktion. Muss vor Go-Live weg.
- **P1** - soll vor erstem Pilotkunden live sein (Vertrag, Sicherheit, Demo-Glaubwuerdigkeit).
- **P2** - Haertung waehrend der ersten 2-4 Pilotwochen.
- **A / B / C** - Verbesserungsvorschlaege: A = kurzfristig hoher Leverage, B = mittelfristig Marktwert-Multiplikator, C = Enterprise-Vertriebshebel.
## P0 - Go-Live-Blocker (Summe <1 Stunde Arbeit)
### P0.1 - Lint-Errors in `api/test/enterpriseFormReuse.test.js`
- Status: ERLEDIGT (2026-05-24)
- Ergebnis: `npm run lint` exit 0, 0 Errors, 0 Warnings. Bereits behoben gewesen.
### P0.2 - Audit-Gate gruen ziehen
- Status: ERLEDIGT (2026-05-24)
- Ergebnis: `audit-coverage-check.js` exit 0, 329/329 Endpunkte mit Audit-Coverage.
- Was gemacht: (a) `writeStaffAudit` + `insertSupportAudit` in AUDIT_PATTERNS ergaenzt (SCC/Support-Routen hatten Audit via eigene Funktionen, Checker war blind), (b) `/analytics/track-public` + `/me/active-location` in ALLOWLIST_ROUTES, (c) `POST /auth/login` in SCC tatsaechlich fehlenden Audit-Marker ergaenzt (fire-and-forget nach res.json).
### P0.3 - Prometheus-Platzhalter-Secret
- Status: ERLEDIGT (2026-05-24)
- Ergebnis: Secret wird jetzt aus `PROMETHEUS_METRICS_SECRET` Umgebungsvariable injiziert.
- Was gemacht: (a) `monitoring/prometheus.yml` Placeholder auf `PROMETHEUS_METRICS_SECRET_PLACEHOLDER` umgestellt, (b) `monitoring/start-prometheus.sh` erstellt (sed-Substitution + exec prometheus), (c) `docker-compose.monitoring.yml` entrypoint auf start-prometheus.sh umgestellt + env-var eingebunden, (d) `PROMETHEUS_METRICS_SECRET=` in `.env.example` ergaenzt.
- Noch offen (Ops): `PROMETHEUS_METRICS_SECRET` in Prod-.env auf echten ADMIN_SECRET setzen.
### P0.4 - Secret-Rotation vor Go-Live
- Status: OFFEN — muss VOR erstem Pilotkunden erledigt sein
- Hintergrund: .gitignore OK, Secrets nie committed, kein akuter Leak. Rotation ist Best-Practice vor Prod-Betrieb mit echten Kundendaten.
- Aufwand: 20-30 Min.

#### Checkliste (in dieser Reihenfolge abarbeiten):

**Block A — ohne Datenbankeingriff (5 Min.):**
- [ ] Neuen SESSION_SECRET generieren: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- [ ] Neuen STAFF_SESSION_SECRET generieren: gleicher Befehl, anderer Wert
- [ ] Beide Werte in `.env` eintragen
- [ ] `docker compose restart api` — alle aktiven Sessions werden ungueltig (alle muessen sich neu einloggen)
- [ ] Verify: `curl http://localhost:3000/api/health` → 200 OK

**Block B — mit Datenbankeingriff, Wartungsfenster einplanen (15 Min.):**
- [ ] Neues DB-Passwort generieren (min. 32 Zeichen): `node -e "console.log(require('crypto').randomBytes(24).toString('base64'))"`
- [ ] Passwort in laufender DB aendern: `docker exec -it tempconnect_db psql -U POSTGRES_USER` → `ALTER USER POSTGRES_USER WITH PASSWORD 'NEUES_PW';`
- [ ] Sofort danach `.env` aktualisieren: `DB_PASSWORD=NEUES_PW` und `POSTGRES_PASSWORD=NEUES_PW`
- [ ] Sofort danach `docker compose down && docker compose up -d`
- [ ] Verify: `curl http://localhost:3000/api/health` → 200 OK, keine DB-Connection-Errors in Logs

**Block C — externe API-Keys (nur wenn aelter als 6 Monate):**
- [ ] Stripe: Dashboard → Developers → API Keys → "Roll key" → neuen Wert in `.env` STRIPE_SECRET_KEY
- [ ] Sentry: Settings → Auth Tokens → neuen Token, alten loeschen → in `.env` SENTRY_DSN

- Verify gesamt: App laeuft, Health-Check 200, kein Fehler in `docker compose logs api | tail -50`
### P0.5 - `staff_vanilla_backup_20260521/` oeffentlich erreichbar via Nginx
- Status: ERLEDIGT (2026-05-24)
- Ergebnis: Verzeichnis `frontend/public/staff_vanilla_backup_20260521/` geloescht. Inhalt war: index.html, login.html, css/, js/.
- Verify: Verzeichnis existiert nicht mehr im Dateisystem.
### P0.6 - Demo-Seed-Welt (052) wird auf JEDEM Fresh-Install (auch Prod) angelegt — ENTERPRISE-Login-Backdoor
- Status: ERLEDIGT + COMMITTED + GEPUSHT (2026-06-05, Commit `bc24e58` auf origin/release/enterprise-premium-market-ready). Owner-approved Variante „drei wie empfohlen": Env-Flag-Gate + Remediation-Migration 125 + subscriptions-RLS-Exclusion bestaetigt.
- Befund (2026-06-04, beim Fresh-Install-Verify entdeckt): `052_demo_seed_world.sql` laeuft UNGATED in der Standard-Migrationschain (kein Env-Flag, kein Dev-Gate wie `dev-data.sql`). Auf einer prod-aehnlichen DB (nur `init.sql`, KEINE Dev-Seeds) existieren danach EXAKT 6 User — und alle 6 sind Demo-Konten: demo-buyer@/demo-admin@ (company, ENTERPRISE), demo-agency@ (agency, ENTERPRISE), demo-buyer2@ (PLUS), demo-agency2@ (PRO), demo-agency3@ (BASIS); alle `is_verified=TRUE`, mit Org-Memberships + voller Demo-Datenwelt. **Gemeinsames Passwort `DemoPass2026!` — der bcrypt-Hash steht im Klartext im Repo (052 Z.31).** Ein realer Prod-Install bringt also 6 ENTERPRISE-faehige Konten mit oeffentlich bekanntem Passwort mit = Login-Backdoor mit Mandanten-Vollzugriff.
- Was gemacht (Owner-approved „drei wie empfohlen", 2026-06-05): (a) **Env-Flag-Gate** — `migrate.sh` normalisiert `SEED_DEMO_WORLD` (1/true/yes/on→true, sonst false) und exportiert `PGOPTIONS="-c app.seed_demo_world=<wert>"`, sodass JEDE psql-Session den GUC traegt; `052`-Body in einen `DO $seed_demo_world$`-Guard gewickelt (`IF current_setting('app.seed_demo_world',true) IS DISTINCT FROM 'true' THEN RAISE NOTICE … RETURN` → prod-sicherer No-Op), BEGIN/COMMIT durch den DO-Block ersetzt (Erfolgs-Notice nach innen gefaltet). (b) **Compose-Split** (Defense-in-Depth, fuegt sich in den `dev-data.sql`-Split ein): `docker-compose.yml` migrate `SEED_DEMO_WORLD: ${SEED_DEMO_WORLD:-false}` (Basis-Default AUS), `docker-compose.prod.yml` hart `"false"` (override-t etwaigen .env-Streuwert), `docker-compose.override.yml` migrate `"true"` (Dev/Sales AN). (c) **Remediation-Migration `125_remediate_demo_seed_backdoor.sql`** fuer Bestands-DBs, die das ungegatete 052 bereits liefen: setzt `password_hash` der 6 bekannten Demo-Konten auf einen gueltig FORMATIERTEN, aber unknackbaren bcryptjs-Hash (Passwort-Login unmoeglich, kein 500er-Risiko) — NUR wenn Flag aus UND der Hash noch der oeffentlich bekannte Demo-Hash ist (praezise + idempotent; bereits geaenderte/gesperrte Konten unberuehrt). `is_active=false` verworfen, weil die `users`-Tabelle (init.sql) KEINE `is_active`-Spalte hat — Hash-Neutralisierung ist der schema-treue, nicht-destruktive Weg (Demo-Welt jederzeit via `SEED_DEMO_WORLD=true` re-seedbar).
- Aufwand: 0,5 Tag (Gate + Remediation-Migration + Fresh-Install-Verifikation beider Pfade).
- Verify (2026-06-05, zwei Wegwerf-DBs, danach entfernt — realer Stack unberuehrt): **OHNE Flag** → 052 No-Op, 0 Demo-Konten; 116-Backstop aktiv; FORCE RLS req/ts/inv = t/t/t; 125 neutralisiert (bzw. No-Op wenn keine vulnerablen Konten). **`SEED_DEMO_WORLD=true`** → 6 Demo-Konten wie bisher; 125 absichtlich uebersprungen. GUC-Propagation auf `postgres:16-alpine` empirisch bestaetigt (true / unset→NULL). **Laufzeit-Beweis Deny-by-Default** mit echtem Nicht-Superuser-Rollen-Probe (`rls_probe`, kein BYPASSRLS): [B] ohne org-Kontext → 0 Zeilen, [D] falsche org → 0, [C] korrekte org → 3, [E] Staff-Bypass (`app.rls_bypass=staff`) → 3 = exakt die fuer zahlende Kunden geforderte Mandanten-Isolation. `test-fresh-install.sh` deckt beide Pfade ab.
### P0.7 - Migrations-Chain Silent-Failure + 116 Deny-by-Default-RLS hat auf KEINER DB je gegriffen
- Status: ERLEDIGT + COMMITTED + GEPUSHT (2026-06-04, Tier-2 nachgezogen 2026-06-05; Commit `bc24e58`). Bestands-DB-Forward-Repair (Tier-2) via Migration `126`. AKTIVIERUNG: 126 schaltet Deny-by-Default + FORCE RLS beim naechsten migrate-Lauf gegen Bestands-/Managed-DBs scharf.
- Befund (Root-Cause): Altes `migrate.sh` lief `psql -f` OHNE `ON_ERROR_STOP` → Exit 0 auch bei SQL-Fehler → fehlgeschlagene Migrationen wurden faelschlich als „applied" verbucht. Das maskierte MEHRERE defekte Migrationen, die auf nie existente / an ihrer Stelle noch nicht existente Schema-Objekte verwiesen. Besonders folgenschwer: `116_rls_deny_by_default.sql` ist transaktional (BEGIN…COMMIT) — der erste maskierte Defekt darin riss die GESAMTE Mandanten-Isolation in den Rollback. **Konsequenz: der Deny-by-Default-RLS-Backstop (Staff-Bypass + org-Policies, IS-NULL-Wildcards entfernt, FORCE RLS) war auf KEINER Datenbank je aktiv.**
- Was gemacht: (a) `migrate.sh` gehaertet: `psql -v ON_ERROR_STOP=1 -f` + harter `exit 1` bei Migrationsfehler (kein stilles Weiterlaufen mehr). (b) Chain-Repair (jeder In-Place-Edit JUSTIFIED — eine Forward-Migration kann eine die Chain mittendrin abbrechende Migration nicht reparieren; die Edits aendern auf bereits-korrekten DBs nichts am Ergebnis, verhindern nur Crash-on-missing-object und laufen auf applied DBs nie erneut): `031` cd_same_org auf reines org_id (compliance_documents hat keine supplier_org_id) + vendor_pool_entries-Guard; `032` deals-/vendor_pool_entries-Indizes + cap_fts_idx hinter to_regclass/column-Guard; `039` `is_demo`-Spalte von Demo-Seeds entkoppelt (Spalte laeuft immer, Seeds hinter Early-RETURN-Guard); `047` Webhook-DDL hinter org_integrations-Guard; `116` co_same_org auf org_id (commercial_offers ist ein-org-besitzt, kein buyer/seller_org_id), subscriptions bewusst aus dem org-RLS-Set (user-skaliert, kein org_id), vendor_pool_entries-Guard; `124` idempotenter cron-index-repair. (c) `test-fresh-install.sh` gehaertet: toter `check_table "deals"` → `commercial_offers`; + neue Assertions, die nach Fresh-Install pruefen, dass der 116-Backstop wirklich aktiv ist (req_staff_bypass vorhanden, req_no_ctx weg, FORCE RLS auf req/ts/inv).
- Verify (2026-06-04, prod-aehnliche Wegwerf-DB, init.sql only): Chain 127 Migrationen, 0 Fehler; 116-Policies vorhanden; IS-NULL-Wildcards weg; FORCE RLS aktiv; Phantom-Objekte (deals/vendor_pool_entries/webhook_deliveries/org_integrations/capacity_posts.description) korrekt absent. `sh -n sql/test-fresh-install.sh` OK.
- Tier-2 erledigt (2026-06-05) via `126_rls_forward_repair.sql`: NICHT-transaktional, EIN per-`to_regclass` abgesicherter `DO`-Block pro Tabelle (requisitions/timesheets/invoices/org_memberships/compliance_documents/subscription_requests/commercial_offers/audit_log; vendor_pool_entries als out-of-scope-Guard) — CREATE OR REPLACE der Helfer `current_org_id()`/`is_staff_context()`, dann je Tabelle ENABLE RLS + DROP der IS-NULL-Wildcards + DROP/CREATE same_org & staff_bypass (USING-Klauseln 1:1 aus 031/116), FORCE RLS nur auf req/ts/inv. Idempotent (DROP IF EXISTS + identisches CREATE), resilient (ein fehlendes Objekt ueberspringt nur SEINEN Block, reisst nie den Backstop mit), auf Bestands-DBs erstmals wirksam, auf frischen DBs folgenloser No-Op. `subscriptions`-RLS-Exclusion bestaetigt (user-skaliert via user_id, kein org_id; eine Membership-Bruecke wuerde persoenliche Billing-Daten cross-org leaken — Schutz bleibt App-Layer). **AKTIVIERUNGS-HINWEIS:** 126 schaltet Deny-by-Default + FORCE RLS beim NAECHSTEN migrate-Lauf gegen Bestands-/Managed-DBs scharf. Lokal ist `tempconnect` Superuser → RLS-inert (kein Breakage); auf Managed-DB (Nicht-Superuser-App-User) wird der Backstop real wirksam = gewollter Mandanten-Schutz.
## P1 - Vor Pilotkunde (Summe 2-3 Personentage)

### ~~P1-19 — `GET /matching/worker/:id` liest eine Tabelle, die es nicht gibt~~ ✅ ERLEDIGT (2026-08-20)

**Entfernt, nicht gebaut.** Ausschlaggebend war, dass das Projekt die Frage
längst beantwortet hatte: der SQL-Schema-Wächter führte den Fall selbst als
„workers: Altbestand. Die Arbeiterdaten liegen in `worker_profiles`." Es war kein
unfertiges Feature, sondern ein Rest. Auf `worker_profiles` zu bauen wäre ein
Feature gewesen — dort gibt es weder `role` noch Koordinaten, und die Bewertung
der Engine ruht auf genau diesen beiden.

Mit der Funktion fiel `getReputationScore` weg (kein anderer Aufrufer), und mit
beiden drei Einträge der Ausnahmeliste des Schema-Wächters — den er **selbst
eingefordert** hat, weil er Einträge meldet, die nicht mehr auftreten. Das ist
der Beweis, der bei P1-17 fehlte.

Die neun Coverage-Tests wurden nicht gelöscht, sondern umgestellt auf die Frage,
die ab jetzt zählt: kommt der tote Weg zurück? Vier Zusicherungen antworten
darauf, gemessen an einer simulierten Rückkehr — alle vier werden rot.

### ~~P1-20 — Statuswechsel einer Ausschreibung ohne Berechtigungsprüfung~~ ✅ ERLEDIGT (2026-08-20)

**Es war keine Produktfrage.** `requisition.cancel` steht seit jeher im
Berechtigungskatalog (`rbacService.js:30`) — mit einer eigenen, engeren
Rollenliste — und war an **keiner einzigen Stelle** verdrahtet. Die Wache
existierte, sie hing nur an nichts.

Dazu kam: `requireScope("write:requisitions")` sieht wie eine Prüfung aus, lässt
aber **jede Sitzung** durch (`apiKeyAuth.js:153`) — es gilt nur für API-Keys.
Drei Routen standen damit offen: `/transition`, `/submit`, `/comment`.
Geschlossen mit `requisition.edit` (Statuswechsel, Einreichen),
`requisition.cancel` zusätzlich für `CANCELLED`, und bewusst nur
`requisition.view` fürs Kommentieren.

**Vierte anonyme Wache dieser Welle:** `requirePermission` gab eine namenlose
Closure zurück. Deshalb konnte `rbac-hardening.test.js` nur Middleware **zählen**
(`assert.ok(names.length >= 2)`) statt sie zu benennen — eine Route ohne Prüfung
sah aus wie eine mit. `requirePermission` und `requireRole` sind jetzt benannt.

### N-1 — nginx sendet eine gefaltete Kopfzeile ✅ ERLEDIGT (2026-08-21)

**Beim Verdrahtungs-Check der Guthabenseite gefunden.** `nginx/nginx.conf`
schrieb die Content-Security-Policy über elf Zeilen — lesbar, ordentlich
eingerückt, und falsch: nginx gibt den Wert **verbatim** aus. Über die Leitung
ging eine **gefaltete** Kopfzeile (obs-fold).

RFC 7230 §3.2.4 hat diese Faltung abgeschafft: Sender dürfen sie nicht erzeugen,
Empfänger **müssen** die Nachricht ablehnen. Gemessen: Nodes Standard-HTTP-Parser
bricht mit *„Parse Error: Invalid header value char"* ab — er kann damit **keine
einzige** Antwort dieses Servers lesen. Browser und curl sind nachsichtig und
verdecken es vollständig; aufgefallen ist es erst, als ein Node-Prozess die API
sprechen sollte.

Behoben (Wert in einer Zeile) und gehalten von `api/test/nginxKopfzeilen.test.js`:
kein `add_header` darf über mehrere Zeilen laufen. Gemessen: die alte Fassung
macht den Test rot.

> **Der Fehler sieht wie guter Stil aus.** Wer die CSP das nächste Mal
> erweitert, bricht sie mit hoher Wahrscheinlichkeit wieder um — und merkt
> nichts, weil der Browser weiterläuft. Deshalb ein Test und kein Kommentar.

**Scharf geschaltet am 2026-08-21.** Der laufende `tempconnect_frontend` mountet
`nginx/nginx.conf` aus dem **Haupt-Checkout**; die Korrektur wurde dort auf
Zuruf nachgezogen (nur diese eine Zeile) und nginx neu geladen. Gemessen: ein
Aufruf mit Nodes strengem Parser liefert 200/525 Bytes, wo er vorher abbrach.
Die Änderung liegt im Haupt-Checkout **uncommitted** — beim Merge dieses
Branches kommt derselbe Inhalt regulär nach.

### ~~P1-21 — Welche Wache gehört auf welche Fläche?~~ ✅ ERLEDIGT (2026-08-21)

**Gebaut:** `api/test/fixtures/wachen.json` + `api/test/wachenWaechter.test.js`,
nach dem Vorbild des Org-Grenzen-Registers.

**415 schreibende Wege, alle mit Urteil und Begründung:**

| Wachart | Wege | was sie trägt |
|---|---|---|
| `berechtigung` | 161 | `requirePermission` / `requireRole` / `requireInternalPermission` |
| `eigene-daten` | 67 | kein fremdes Ziel erreichbar (`/me`, MFA, eigenes Profil) |
| `besitz` | 65 | Bindung am Vorgang — vom Org-Grenzen-Wächter **ausgeführt** geprüft |
| `flaechentor` | 64 | eine Eintrittsbedingung je Fläche (Staff, Arbeiter, Support, Owner, …) |
| `cron` | 28 | Zeitplan-Geheimnis (`checkCronAuth`) |
| `oeffentlich` | 19 | bewusst ohne Mandant (Anmeldung, Webhooks, Kostenvorschau) |
| `inline-rolle` | 10 | Rolle oder Geheimnis im Handler statt als Middleware |
| `BEFUND` | 1 | P1-22 (siehe unten) |

**Der Wächter fordert ausdrücklich NICHT pauschal `requirePermission`** — das
wären 254 Falschmeldungen gewesen, und ein Wächter, der falsch meldet, wird
abgeschaltet. Er verlangt ein *Urteil mit Begründung* und prüft die
`berechtigung`-Klasse **ausgeführt**: der Aufruf läuft mit einem Rollenschlüssel,
den der Katalog nicht kennt — wer trotzdem durchkommt, hat keine wirksame
Prüfung.

Vier Mutationen werden rot: Wache von einer Route nehmen · neue schreibende
Route ohne Registereintrag · Urteil ohne Begründung · Route auf eine
schwächere Wachart zurücksetzen.

**Fünfter anonymer Wächter gefunden und benannt:** `requireInternalPermission`
trägt die gesamte interne Steuerungsfläche und war unsichtbar — ihre Routen
fielen in der Bestandsaufnahme als „ohne Wache" auf, obwohl sie bewacht sind.

### ~~P1-22 — Guthaben werden ohne Bezahlschritt gutgeschrieben~~ ✅ ERLEDIGT (2026-08-21)

**Owner-Entscheidung: Stripe.** Der Kauf geht jetzt denselben Weg wie die Abos —
`POST /credits/purchase` erzeugt nur noch eine Checkout-Sitzung, gutgeschrieben
wird ausschließlich im **signaturgeprüften Webhook**.

Die Aufteilung in zwei Funktionen ist die eigentliche Absicherung: es gibt keine
Funktion mehr, die „gutschreiben" heißt und ohne Zahlungsnachweis aufrufbar ist.

| | |
|---|---|
| `startPurchase` | schlägt nach, was das Paket kostet und enthält — schreibt **nichts** |
| `grantPurchasedPackage` | nur aus dem Webhook: prüft den **gezahlten Betrag** und die **Einmaligkeit** |

**Ohne Stripe kein Kauf:** ist kein Schlüssel gesetzt, antwortet die Route mit
**503** statt auf einen kostenlosen Ersatzweg zu fallen. Genau dieser Ersatzweg
*war* der Befund.

**Migration 186** legt den Riegel dorthin, wo Gleichzeitigkeit entschieden wird:
ein **eindeutiger Index** auf der Kauf-Referenz (partiell, nur für
`source = 'purchase'`). Stripe stellt Webhooks *wiederholt* zu — das ist die
Zusicherung des Anbieters, kein Fehler. Eine Idempotenz aus „erst SELECT, dann
INSERT" hält zwei gleichzeitige Zustellungen nicht auf.

> **Der Lauf gegen die echte Datenbank hat einen echten Fehler gefangen.** Die
> erste Fassung schrieb über `earnCredits` gut — und diese Funktion erhöht
> **zuerst** den Saldo und schreibt **danach** die Buchung. Der Index feuerte
> also erst, als das Guthaben schon oben war: eine wiederholte Zustellung kam auf
> den **doppelten** Stand. Die Mock-Tests waren dabei grün. Repariert: die
> Buchung ist der erste Schritt, und beides läuft in einer Transaktion.

Gemessen (`test/integration/guthabenKauf.flow.test.js`, sechs Prüfungen gegen das
echte Schema): zu wenig gezahlt → nichts · bezahlt → 500 + 10 % Bonus ·
Wiederholung → Stand unverändert · **zweiter** Kauf → wird gutgeschrieben · der
Index ist partiell · `bounty` darf seine Referenz weiterhin wiederholen.
Dazu neun Mock-Prüfungen in `test/security/guthabenNurGegenZahlung.test.js`, die
den Stolperdraht ablösen.

**Die Oberfläche steht** (2026-08-21): `frontend/public/credits.html` +
`js/pages/credits.js` — Stand, Verlauf, Paketauswahl, Weiterleitung zu Stripe
und die Deutung der Rückkehr. Im Browser gegen den laufenden Stapel geprüft:
Pakete laden mit echten Preisen (Bonus, Währungsformat, Stückpreis), 401 wird
als eigener Zustand benannt statt als Ladefehler, der Kaufknopf erholt sich nach
einem Fehlschlag, `?payment=cancelled` und `?payment=success` zeigen ihre
Meldungen, und das Warten auf die Gutschrift endet nach rund 20 Sekunden
**ehrlich** statt endlos zu drehen. Keine JS-Konsolenfehler.

**Die Navigation steht** (2026-08-21): `credits.html` hängt am Menüpunkt
*Steuerung* (`match`-Eintrag in `pageShell.js`, sonst hätte auf der Seite **kein**
Punkt geleuchtet und der Nutzer hätte seinen Ort verloren), ist über die Suche
findbar („guthaben", „credits", „aufladen", …) und von zwei Seiten verlinkt:
`sla_abo.html` (Teaser neben dem Bounty-Teaser — beide berühren den Preis, aber
von verschiedenen Seiten) und `bounties.html` (die Schwesterwährung). Im Browser
geprüft: die Zuordnungsregel des Shells trifft den Pfad, der Suchtreffer
erscheint live, beide Links stehen.

Bewusst **keine** Hub-Karte auf `enterprise.html`: die hängt an einer *Surface*
der Sichtbarkeitsmatrix, und eine neue Surface ist eine RBAC-nahe Entscheidung
(wer sie sieht, hängt an `allowed_org_types` und der Surface-Zugriffslogik).
Wenn Guthaben prominenter werden soll, ist das der nächste Schritt — und einer
mit Owner-Freigabe.

**Offen bleibt allein der Betrieb:** `STRIPE_SECRET_KEY` und
`STRIPE_WEBHOOK_SECRET` setzen. Die Rückkehr-URLs zeigen standardmäßig auf
`/public/credits.html` und sind über `STRIPE_CREDITS_SUCCESS_URL` /
`STRIPE_CREDITS_CANCEL_URL` überschreibbar. Solange nichts gesetzt ist,
antwortet die Route 503 und die Seite sagt das auch — niemand bekommt etwas
geschenkt.

### ~~M0-B9 — Ein roter Integrationstest aus Welle G4b~~ ✅ ERLEDIGT (2026-08-21)

**Er hat richtig gemeldet und wurde falsch verstanden.** Zwei Dinge lagen
uebereinander:

**1. Die Pruefung suchte eine Schreibweise, die Postgres nicht ausgibt.** Sie
suchte die Werte als `'info'` — mit Anfuehrungszeichen — im Text des
Constraints. Postgres rendert ihn aber je nach Schreibweise anders:

```
CHECK (severity IN ('a','b'))       ->  ... = ANY (ARRAY['a'::text, ...])
CHECK (severity = ANY ('{a,b}'))    ->  ... = ANY ('{a,b}'::text[])
```

In der zweiten Form steht **kein einziger** Wert in Anfuehrungszeichen. Die
erste Zusicherung schlug also schon bei `info` fehl — und verdeckte damit genau
den Befund, den die zweite finden sollte. Repariert: die Werte werden jetzt
**ausgelesen** statt gesucht, und **beide Richtungen** geprueft. Das ist strenger
als vorher — es faellt nicht nur auf, wenn ein bekannter Wert fehlt, sondern
auch, wenn ein unbekannter dazukommt, gleich welcher.

**2. Der eigentliche Befund: die laufende Datenbank war weiter als jede
Migration.** `notifications.severity` wird an genau einer Stelle definiert
(Migration 019, vier Werte). Die laufende Datenbank erlaubte fünf — zusätzlich
`urgent`. Gesucht wurde in allen 184 Migrationen, in `init.sql` und in den Seeds:
**keine Quelle.** Der Wert ist an `sql/` vorbei entstanden.

Das ist der Kern, nicht der fehlende Wert: **das Schema war aus `sql/` nicht mehr
reproduzierbar.** Eine frische Installation und die laufende Datenbank hätten
sich unterschieden.

**Zurück statt vor**, weil `urgent` keinen Nutzer hat: kein Dienst schreibt es
nach `notifications`, keine der 765 Zeilen trägt es (warning 660, info 54,
success 50, error 1), und das Frontend kennt es weder in den Toast-Varianten noch
in der Stufen-Abbildung. `match_alerts.severity` ist eine **andere** Spalte
(Migration 027) und benutzt `urgent` sehr wohl — dort bleibt alles.

Migration `185_severity_zurueck_auf_die_vier.sql`, mit Sicherheitsnetz (bricht
mit klarer Meldung ab, falls doch eine Zeile `urgent` trägt) und Rollback im
Kopf. Gemessen: gefahren, Test 8/8 grün; Drift wieder hergestellt, Test wird rot
mit *„der CHECK erlaubt mehr als die Konstante kennt: urgent"*; Migration erneut
gefahren, wieder grün.

> **Übertragbar:** Ein Test, der eine Zusicherung als **Zeichenkette** im
> generierten SQL sucht, prüft die Schreibweise des Datenbanksystems mit — und
> die ändert sich, ohne dass jemand etwas falsch macht. Werte auslesen und
> **Mengen** vergleichen, nicht Text suchen.

### ~~P1-17 — `canAccessAsOwner` hat nie funktioniert~~ ✅ ERLEDIGT (2026-08-20)

**Entscheidung des Owners: reparieren, also weiten.** Umgesetzt in
`utils/ownerCheck.js`. Die Kollegin mit **aktiver** Mitgliedschaft in **derselben**
Organisation darf jetzt handeln — die Weitung endet aber an der Arbeiterrolle:
`org_memberships` führt auch 33 Arbeiter (`role_key = 'worker'`), und
„gleiche Organisation genügt" hätte ihnen die Suchaufträge, Angebote und
Dealakten ihrer Agentur geöffnet.

Gegen das echte Schema gemessen, alte gegen neue Fassung: **genau die zwei
Gewährungen ändern sich, keine einzige Verweigerung.** Der `catch` schließt
weiterhin zu, protokolliert den Fehler aber — sein Schweigen war der Grund, warum
der Befund sechs Jahre überlebte.

**Nebenbefund mit Folgen für andere Reparaturen:** der SQL-Schema-Wächter hatte
Fehler 1 gefunden (Ausnahmeliste), aber die Reparatur schob den Code aus seinem
Sichtfeld — er prüft Spalten nur bei **einrelationalen** Anweisungen, die neue
Fassung verbindet drei. Abgedeckt durch
`test/integration/ownerCheck.flow.test.js`: ein Lauf gegen die echte Datenbank
mit erfundenen Kennungen, bei dem Postgres die volle Abfrage parst und plant.
Gemessen: die Rückmutation auf `status` macht ihn rot.

**Weiterhin offen sind die Geschwisterfragen D-M4** (Requisitions, `created_by`)
**und D-M5** (capacityExchange/marketplace, nutzergebunden). Sie stellen dieselbe
Frage an anderen Stellen; die hier getroffene Antwort ist die naheliegende
Vorlage, wurde aber bewusst nicht ungefragt übertragen.

### P1-16 — Migration 117 existiert nicht (RLS für 28 Tabellen)

**Status:** offen · **Fakt:** `docs/security/TENANT_ISOLATION_MODEL.md` führt 28
Tabellen unter „RLS noch nicht aktiv" und nennt als nächsten Schritt jeweils
„Migration 117". Diese Datei wurde nie geschrieben — `sql/migrations/` springt
von `116_rls_deny_by_default.sql` auf `118_staff_identity_hardening.sql`. Am
2026-08-19 gegen die laufende Datenbank bestätigt: `rate_cards` und
`approval_requests` stehen auf `relrowsecurity = false` mit 0 Policies.
**Aktion:** Owner entscheidet: Migration 117 nachziehen **oder** die Doku auf
den tatsächlichen Stand bringen und die Anwendungsschicht ausdrücklich als
alleinige Grenze führen. Solange sie das ist, trägt sie
`api/test/orgGrenzenWaechter.test.js`.
**Aufwand:** Entscheidung 15 Minuten, Migration 0,5–1 Tag ·
**Verify:** `SELECT relname, relrowsecurity FROM pg_class WHERE relname IN (...)`
gegen die Ziel-DB; `docs/security/TENANT_ISOLATION_MODEL.md` stimmt mit dem
Messwert überein.
### P1.0 - Staff Control Center produktiv schalten
- Status: **Schritt (d) ERLEDIGT (2026-07-26) — dabei einen Startblocker gefunden.** Rest bleibt Ops/Owner.
- Fakt: SCC-Stack ist live im Code (Migrationen 095+096, Router `/staff/api`, Frontend `/public/staff/`, Tests gruen). Ops-Schritte fehlen: Nginx-VHost `staff.tempconnect.de`, ENV `STAFF_USER_IDS` (2 UUIDs: Betreiber-Team), `STAFF_SESSION_SECRET`, optional `HETZNER_CLOUD_TOKEN`.
- Aktion: (a) Nginx-VHost fuer Staff-Subdomain anlegen, (b) dediziertes TLS-Zertifikat, (c) optional IP-Allowlist auf VHost-Ebene, ~~(d) ENV in `.env.example` dokumentieren + in Prod-Compose injizieren~~, (e) Initial-Staff-UUIDs (Betreiber-Team) in `STAFF_USER_IDS`, (f) `HETZNER_CLOUD_TOKEN` fuer Live-Infra-GUI (sonst bleibt SCC im Stub-Mode).

**(d) erledigt — und der Punkt war groesser als beschrieben.**
Nachgeprueft statt angenommen: „in Prod-Compose injizieren" war bereits erfuellt, der
`api`-Dienst laedt `env_file: .env`, alle Variablen erreichen den Container ohnehin. Und
`.env.example` dokumentierte alle drei Werte laengst.

**Offen war die Produktionsvorlage — und dort mit Folgen:** `.env.prod.example` (die Datei,
die laut Kopf „auf dem Server nach `.env.prod` kopiert" wird) kannte `STAFF_SESSION_SECRET`
nicht. Diese Variable ist in Produktion kein Komfort, sondern ein **`fatal()`** in
`runProductionValidation()` — der Rueckfall auf `SESSION_SECRET + ':staff'` ist dort
ausdruecklich verboten. Wer die Produktion nach der Vorlage aufgesetzt haette, waere mit
einer scheinbar vollstaendigen `.env.prod` dagestanden und **die API waere nicht
hochgekommen**. Aufgefallen erst beim Deploy — im ungeeignetsten Moment.

Ergaenzt wurde ein eigener SCC-Abschnitt in `.env.prod.example` mit allen drei Werten und
je einer Zeile, die sagt, was passiert, wenn man sie weglaesst (kein Zugang / Stub-Modus /
Start bricht ab).

**Damit es nicht wiederkommt:** `api/test/prodEnvTemplate.test.js` liest die Pflichtvariablen
**aus dem Code** (welche Bedingungen fuehren zu `fatal()`?) und vergleicht sie mit der
Vorlage. Wer morgen eine neue Pflichtvariable einfuehrt, wird hier daran erinnert, sie zu
dokumentieren. Der Test prueft ausserdem, dass in der Vorlage keine echten Werte stehen
(sie liegt im Repo **und** im Release-Artefakt) und dass Staff- und Kundensitzung nicht
denselben Platzhalter teilen. Gegenprobe in beide Richtungen bestanden.
- Aufwand: 0,5-1 Tag Ops.
- Verify: Login nur fuer Allowlist-User, Abo-Kunden/Platform-Admins/Org-Owner bekommen 401/403, Admin-Panel + Organization zeigen keinen Link ins SCC (und umgekehrt).
### P1.1 - SSO Enterprise-Pfad (per-Kunde aktivierbar, 300-Kunden-tauglich)
- Status: CODE-SEITIG ABGESCHLOSSEN (ehrlicher Coming-Soon-Soft-Lock). Produktive SAML-Aktivierung = pro-Kunde-Ops-Schritt (Owner + IdP-Test).
- Architektur-Entscheidung (2026-06-01, fuer max. 300 Kunden, zukunftssicher): SSO ist **pro Organisation** konfigurierbar (`org_sso_config`), nicht global. Jeder Kunde aktiviert SSO einzeln, sobald sein IdP angebunden ist — kein Big-Bang, skaliert auf beliebig viele Mandanten.
- Ist-Zustand (gate-konform, kein taeuschender Stub):
  - `ssoService.getSSOMode()` liefert `"stub"`, solange `@node-saml/node-saml` nicht installiert ist; flippt automatisch auf `"saml"`, sobald das Paket vorhanden ist (dynamischer Import).
  - `resolveSsoCardAvailability(...)` zeigt im Stub-Modus den Zustand `SSO_STUB_MODE` ("soft-locked bis produktive SAML-Laufzeit aktiv") — die Karte ist **nicht** als aktiv/buchbar sichtbar.
  - `sso_config.html` zeigt ehrlich Badge "SAML: Stub-Modus" + Locked-State; kein Kunde kann SSO scheinbar aktivieren und ins Leere laufen.
  - Break-Glass (F-02): `auth.js` erzwingt SSO-Enforce nur, wenn `getSSOMode() === "saml"` — Passwort-Login bleibt als Recovery erhalten, niemand sperrt sich aus.
  - Plan-Gate: SSO-Karte ist `PLAN_REQUIRED` unterhalb PRO/INDIVIDUELL (enterprise_only).
- Runbook — SSO fuer einen Kunden produktiv schalten (Owner-Schritte):
  1. `cd api && npm install @node-saml/node-saml` → in `api/package.json` aufnehmen, Container neu bauen. Danach `getSSOMode() === "saml"`.
  2. IdP-Testlauf (Okta-Dev ODER Azure AD Preview): SAML-App anlegen, ACS-URL + Entity-ID aus `sso_config.html` uebernehmen.
  3. Kunden-Org in `org_sso_config` konfigurieren (Metadata-XML / Cert / SSO-URL) — pro Org isoliert.
  4. Test-Login ueber echten IdP gegen die Kunden-Org; danach Enforce optional aktivieren (Passwort-Break-Glass bleibt aktiv).
  5. `sso_config.html` verifizieren: Karte zeigt `active` statt `SSO_STUB_MODE`.
- Aufwand: 0,5 Tag pro Erstanbindung (danach pro Kunde ~1h).
- Verify: `getSSOMode()` liefert `"saml"`; Login ueber echten IdP klappt; Stub-Org bleibt unveraendert (Isolation); Break-Glass-Passwort-Login funktioniert weiterhin.
### P1.2 - E2E-Smoketests um Pilot-Core erweitern
- Status: CODE-SEITIG ERLEDIGT (2026-06-01) — Specs vorhanden; CI-Verdrahtung = E-01 (Owner).
- Fakt: Die in P1.6 erstellten 4 Kernflow-Specs decken exakt die 4 geforderten Flows ab (26 Tests):
  - (a) Login + Marktplatz-Feed → `kernflow-hub-navigation.spec.js` (8 Tests: Hub Company/Agency, `/api/me`, Org-Members, Strategic Collaboration, Activity-Feed, Notifications, `capacity_exchange_feed.html`)
  - (b) Bedarf anlegen + Deal-Accept + Aktivierung → `kernflow-requisition.spec.js` (5 Tests: POST/GET/Detail/Transition DRAFT→OPEN) + `kernflow-deal-activation.spec.js` (6 Tests: OPEN-Requisition, received-offers, contracts, State-Machine-Transitions, Hub)
  - (c) Worker-Assignment + Stundenzettel → `kernflow-assignment-timesheet.spec.js` (7 Tests: Assignment anlegen/Liste/Transition planned→active, ungültige Transition, Timesheet-Plan-Gate, Endpunkt definiert, Einsätze-Seite)
  - (d) Admin-/Strategic-Collaboration → in `kernflow-hub-navigation.spec.js` abgedeckt
- **E-01 nachgeprueft (2026-07-26): die Verdrahtung IST da.** `.github/workflows/ci.yml` hat den Job `e2e-core`, der `npm run test:e2e:core` faehrt — und dieses Skript zielt ausdruecklich auf `kernflow occ-access-guards einsatzportal executive-dashboard`. Postgres laeuft als Service-Container, Playwright wird installiert. Der Job ist auf `workflow_dispatch` + woechentlichen Zeitplan (montags 02:17) begrenzt, nicht auf jeden Push — bei E2E eine vertretbare Wahl.
- **Aber: er kann derzeit gar nicht laufen.** Seit 2026-06-29 erzeugt die CI ueberhaupt keine Laeufe mehr (siehe **C-12** in `docs/AUDIT_BACKLOG.md`). E-01 haengt damit nicht mehr an der Verdrahtung, sondern an C-12.
- Verify: `npx playwright test e2e/tests/kernflow-*.spec.js` lokal; CI-Gate = E-01.
### P1.3 - `FEATURE_GATE_BYPASS`-Default umkehren
- Status: ERLEDIGT (2026-05-24)
- Ergebnis: `.env.example` setzt jetzt `FEATURE_GATE_BYPASS=false` als Default mit erklaerenden Kommentaren. Lokal per eigener `.env` ueberschreiben.
### P1.4 - Backup/Restore Dry-Run dokumentieren
- Status: TEILWEISE (2026-06-03) — Skript-Fidelity-Bug behoben, Live-Lauf bleibt Owner
- Fakt: `scripts/backup.sh`, `scripts/backup-verify.sh`, `scripts/restore.sh`, `scripts/restore-test.sh` vorhanden. **Drill-Fidelity-Bug gefunden+behoben (Triage: Bug):** `restore-test.sh` führte pg_restore OHNE `--single-transaction --exit-on-error` aus — ein nur teilweise eingespielter Dump konnte fälschlich „bestanden" melden (False-Confidence). Jetzt an echten `restore.sh` angeglichen. Zusätzlich Infra-Snapshot-Severity-Matrix (Backup-Staleness 12/24/48h) gepinnt (`infrastructureSnapshotService.test.js`, 36/36). Weiterhin kein nachweisbarer Live-Lauf.
- Aktion: einmal gegen Staging durchziehen, Run-Log als `docs/OPS_RUNBOOK.md` oder als Artefakt in `release/`-Ordner ablegen.
- Aufwand: 2 Stunden (Owner/Ops, gegen reale Infra).
- Verify: `bash -n scripts/restore-test.sh` OK; Run-Log zeigt erfolgreichen Restore in frische DB.
### P1.5 - Doku-Drift final schliessen
- Status: STRUKTURELL GELÖST (2026-06-14, A.2/Commit `5d4e67e`) — OpenAPI 3.0.3 wird jetzt AUTO-GENERIERT aus den echten Zod-Schemas (`openapi/registry.js` + `npm run openapi:generate`), Drift-Guard-Test (`openapi.spec.test.js`, deepEqual generiert↔committet) macht Drift unmöglich, x-drift-notice entfernt, Live-Explorer `api-explorer.html` + serviert via `GET /api/openapi/spec.json`. Verbleibend (inkrementell, kein Blocker): die 10 kuratierten Pfade auf weitere Route-Familien ausweiten (Framework steht, je 1 Eintrag in registry.js).
- Vorher: TEILWEISE ERLEDIGT (2026-05-28) — Sofort-Fix + Drift-Dokumentation; vollständige Auto-Generierung = P2/post-launch
- Was gemacht: (a) `docs/OPENAPI_DRIFT_REPORT.md` erstellt: vollständiges Gap-Assessment (27/747 Pfade abgedeckt, < 4 %), Route-Familien-Übersicht, 3 Lösungsstrategien (Auto-Gen / Manuell / Freeze). (b) `openapi/spec.json`: `x-drift-notice`-Warnung hinzugefügt, `/api/csrf-token` → `/api/csrf` korrigiert, Beschreibung als veraltet markiert. (c) Empfehlung Go-Live: Option C (Freeze + klarer Hinweis) jetzt aktiv; Option A (Auto-Gen via `@asteasolutions/zod-to-openapi`) als P2/A.2.
- Noch offen (P2): Vollständige spec.json-Neugenerierung aus Zod-Schemas. Kein Enterprise-Kunde darf spec.json ohne OPENAPI_DRIFT_REPORT-Hinweis als aktuelle Referenz erhalten.
- Verify: `docs/OPENAPI_DRIFT_REPORT.md` vorhanden; `openapi/spec.json` x-drift-notice gesetzt.
### P1.6 - Cross-Tenant Isolation der Core-Business-Flows
- Status: ERLEDIGT (2026-05-24)
- Ergebnis: `api/test/security/coreFlowCrossTenant.test.js` — 19/19 gruen, 0 Failures.
- Was gemacht (Welle 1 — 12 Tests): Negative Isolationstests fuer alle 5 fehlenden Business-Domains (WAVE_03-Luecken): Timesheets GET/:id (cross-tenant + supplier-perspective), Timesheets POST (cross-tenant body + supplier als Ersteller), Assignments GET/:id (cross-tenant + supplier-perspective), Assignments PATCH/:id (cross-tenant), Assignments POST/:id/transition (cross-tenant), Org Audit-Log GET/:id (cross-tenant + own-org), Requisitions GET/:id (cross-tenant + unscoped org_id=null).
- Was gemacht (Welle 2 — 7 Tests): Contracts GET/:id (cross-tenant + supplier-perspective), Contracts PATCH/:id (cross-tenant + supplier schreibt → 403), Rate Cards GET/:id (cross-tenant), Rate Cards PATCH/:id (cross-tenant). Bugfix: `rateCards.js` PERMISSION_DENIED → ORG_BOUNDARY_VIOLATION (replace_all).
- Gleichzeitig behoben: (a) dead ternary `requisitionService.js` Z.55 (`approvalRequired ? 'DRAFT' : 'DRAFT'` → direktes Assignment mit Kommentar), (b) Plan-Default `timesheets.js` Z.73 (`"FREE"` → `"DEMO"` — kanonischer Default gemaess planFeatures.js).
- WAVE_04 Subflow 4A (PARTIALLY_FILLED): Migration 113 eingespielt (`requisitions_status_check` Constraint + `requisitions_partial_fill_idx`); `stateMachine.js` + `requisitionService.js` REQUISITION_TRANSITIONS auf 10 Zustaende erweitert; Doku `CORE_BUSINESS_STATE_MACHINES.md` aktualisiert.
- P1.2 / G1.4 E2E-Specs erstellt: `kernflow-requisition.spec.js` (5 Tests), `kernflow-deal-activation.spec.js` (5 Tests), `kernflow-assignment-timesheet.spec.js` (7 Tests), `kernflow-hub-navigation.spec.js` (10 Tests). Laeuft mit `npx playwright test e2e/tests/kernflow-*.spec.js`.
- Verify: `node --test test/security/coreFlowCrossTenant.test.js` → 19 pass; E2E-Specs syntaktisch korrekt; `npm run test:unit` → bestehende Suite unveraendert.
### WAVE_05 - Executive Dashboard und KPI-Wahrheit
- Status: ERLEDIGT (2026-05-24)
- Ergebnis: G2.3 gruen — `docs/KPI_SOURCE_OF_TRUTH.md` vollstaendig; `api/test/reportingDashboard.test.js` 14/14 gruen.
- Was gemacht: (a) Hub Visibility Matrix komplett: `hubVisibility.js` alle 4 Code-Aenderungen bereits implementiert, `visibilityMatrix.test.js` 27/27 pass (frontend volume-mounted). (b) `reportingService.js`: PARTIALLY_FILLED zu `zeroRequisitionKpis()` und SQL-Query ergaenzt (Migration 113 jetzt in KPI-Zaehlung sichtbar). (c) `docs/KPI_SOURCE_OF_TRUTH.md` komplett umgeschrieben: 8 KPI-Gruppen (Requisitions, Compliance, SLA, Platform, Spend, Vendors, Rate Cards, Compliance Warnings + Finance Truth + Procurement Pulse), alle 30+ Felder mit SQL-Quelle, Zeitraum und Drilldown. (d) Null-Zustand-Garantie-Tabelle dokumentiert (alle Funktionen demo-safe). (e) 14 neue Unit-Tests: zero-state, Schema-Vollstaendigkeit, Resilience gegen DB-Fehler (Promise.allSettled).
- Verify: `node --test test/reportingDashboard.test.js` → 14 pass; `npm run test:unit` → 3787/3787 pass.
### WAVE_06 - Security Audit (Rate Limits, Upload-Haertung, API-Key-Scope)
- Status: ERLEDIGT (Audit-Phase 2026-05-24), offenes Item dokumentiert
- Ergebnis: G1.5 gruen (14/14 Tests); G3.4 substanziell verbessert (11/11 Rate-Limit-Tests gruen); 3812/3812 Unit-Tests gruen.
- Was gemacht (G1.5): (a) `/admin/control-center` fehlte `requireAdmin` — Sicherheitsluecke behoben. (b) `isGlobalAdminScope()` um `owner` via `session.userRole`-Fallback erweitert. (c) `api/test/security/adminRoutes.test.js` erstellt: 5 describe-Bloecke (Whitelist, Regression-Guard, ADMIN_PANEL_OPEN, SCC-Guard, Vollstaendigkeit). (d) SCC-Isolation verifiziert: `staffUserId`-only-Session korrekt von Platform-Session getrennt.
- Was gemacht (Rate-Limit-Wiring): (a) GET `/invoices/export` + GET `/invoices/operational/:id/export/csv` → `exportLimiter` (requestLimiter) — vorher null Rate-Limit auf GETs! (b) GET `/admin/audit-log/export/csv` → `exportLimiter` nach requireAdmin. (c) POST `/sso/callback` → `ssoCallbackLimiter` (authLimiter). (d) POST `/worker-invites` + `/resend` → `inviteLimiter` (requestLimiter, Email-Bomb-Schutz). Alle Limiter als Noop-Fallback definiert (Unit-Tests ohne echten Limiter nicht beeinflusst). (e) `api/test/security/rateLimitCoverage.test.js` erstellt: 5 describe-Bloecke, alwaysBlock429/alwaysAllow-Mock-Pattern.
- Was gemacht (Upload-Audit): Alle 3 Upload-Handler auditiert — complianceDocs, offerAssets, workerDocument — alle haben MIME-Whitelist, Extension-Whitelist, Groessenbeschaenkung (10MB), UUID-Validierung (worker).
- Was gemacht (API-Key-Audit): `apiKeyAuthMiddleware` global korrekt verdrahtet; `hasScope()` korrekt implementiert; `requireScope()` exportiert aber NIRGENDWO verwendet — Scopes sind aktuell dekorativ. Spawn-Task erstellt: Scope-Enforcement auf Finance-Routen wired.
- Offen (muss separat erledigt werden): API-Key-Scope-Enforcement (`requireScope()` auf Finance-Routen — aktuell toter Code). FEATURE_GATE_BYPASS=true in Dev (muss false in Prod sein — G1.6).
- Verify: `node --test test/security/adminRoutes.test.js` → 14/14 pass; `node --test test/security/rateLimitCoverage.test.js` → 11/11 pass; `npm run test:unit` → 3812/3812 pass.
### SCC_WAVES_03-06 - Staff Control Center Profi-Level (Code-Seite)
- Status: ERLEDIGT (2026-05-27)
- Ergebnis: SCC Build gruen (58 Modules, 0 TS-Errors). 21 neue Security-Tests (staffSecurity.test.js).
- Was gemacht: (a) WAVE 03: staffSecurity.js (Origin-Guard, CacheControl, SecHeaders), staffMutationLimiter, SCC_ERROR_CONTRACT.md, 21 Unit-Tests gruen. (b) WAVE 04: ToastContext (kein alert()), StepUpContext (kein window.confirm), ConfirmContext ARIA-gehaertet, AppShell mit Hash-Routing, PageHeader/EmptyState/ErrorBanner-Komponenten, Focus-Rings WCAG AA. (c) WAVE 05: CommercialInbox Profi-Level — Detail-Drawer, SLA-Zaehler (warn ab 48h), Preset-Filter, Assignee-Anzeige, getInboxItemDetail+getActiveStaffMembers (Backend), CSS-Klassen komplett. (d) WAVE 06: SubscriptionRequests — Plan-Modell DEMO→INDIVIDUELL (Farb-Kodierung), Pre-Aktivierungsschutz (nur bei status=accepted), Kuendigungsdatum-Feld (cancellation_effective_at), Billing-Mode-Anzeige, Dokument-Pipeline-Visualisierung (KV→ANG→AB→AE/KB), setOfferDetails cancellationEffectiveAt-Parameter ergaenzt (Backend).
- Noch offen: SCC WAVEs 07-13 (Support/SOC, Operations, Risk, Audit, Tests, Release). Ops-Setup (P1.0) weiterhin offen.
- Verify: `npm run build:scc` → 0 Errors; `node --check api/middleware/staffSecurity.js` → OK; `node --test api/test/staffSecurity.test.js` → 21/21 pass.
### WAVE_07 - Admin Centers Surface Isolation
- Status: ERLEDIGT (2026-05-24)
- Ergebnis: requireInternalPermission-Guard unit-getestet (11/11); Cross-Surface-Isolation bestaetigt; admin_panel.html Redirect bei Zugriffsfehler; 3836/3836 Unit-Tests gruen.
- Was gemacht (P1 — QA-Gap geschlossen): `api/test/security/surfaceIsolation.test.js` erstellt mit 11 Tests in 7 describe-Bloecken: (a) Unauthenticated → 401, (b) Kein DB-Eintrag → 403 INTERNAL_ACCESS_REQUIRED, (c) Falsche Permission → 403 INTERNAL_PERMISSION_DENIED (2 Faelle: audit_readonly vs. execute, support_agent vs. audit), (d) Korrekte Rolle → next() + req.internalAccess gesetzt (2 Faelle: platform_owner, support_agent), (e) Cross-Surface Org-Owner ohne DB-Eintrag → 403 (kein orgRole-Bypass), (f) Cross-Surface Platform-Admin-Session → 403 (kein session.userRole-Fallback), (g) Router-Level 3 Faelle: kein Eintrag → 403, platform_owner → 200, ops_manager auf Support-Route → 403 INTERNAL_PERMISSION_DENIED.
- Was gemacht (P2 — UX-Haertung): `frontend/public/js/pages/adminPanel.js` boot()-catch erweitert: wenn e.status === 401 ODER (e.status === 403 AND e.code === 'ADMIN_REQUIRED') → redirect zu `/?error=access_denied` statt Error-Banner. Verhindert, dass Org-User die leere Admin-Shell sehen.
- Surface-Isolation-Fazit: OCC (requireOwnerControlAccess, DB-basiert, Allowlist) ✅; SCC (staffUserId-Session, physisch getrennt) ✅; Internal Control (requireInternalPermission, DB-basiert, kein Session-Fallback) ✅ neu getestet; Admin Panel (requireAdmin, Whitelist owner/admin/platform_admin) ✅; Support-Ops (requireSupportAccess, DB-basiert) ✅.
- Verify: `node --test test/security/surfaceIsolation.test.js` → 11/11 pass; `npm run test:unit` → 3836/3836 pass.
### Phase3_WAVES_07-13 - SCC Profi-Level: Support / Operations / Risk / Audit / Tests / Release
- Status: OFFEN
- Fakt: SCC WAVES 00-06 sind erledigt (2026-05-27). WAVES 07-13 decken Support-/SOC-Modul, Operations, Risk/Trust, Audit/Decisions, Data Explorer, Automation/Runbooks, Test-Sweep und Release ab. Aktueller SCC-Score ~45% von Phase-3-Gate.
- Aktion: Pro Wave eine Session, Masterprompt in `finalization/phase3_scc/MASTERPROMPT.md`. Mit WAVE 07 beginnen (Support/SOC-Modul).
- Aufwand: 7 Sessions (je 1 Wave).
- Verify: `npm run build:scc` 0 Errors, Phase-3-Gates A-E gruen, `staffControlCenter.test.js` durchgehend gruen.
### Phase4_TRACK_B - Einsatzportal auf Enterprise-Reife 90% (Pflicht fuer Marktstart)
- Status: WORKER-SELF-SERVICE VERIFIZIERT GRÜN (2026-06-05) — Owner-Sign-off ausstehend (3 Restpunkte). Gate-Entscheidung: `docs/releases/EINSATZPORTAL_GO_LIVE_DECISION.md` (17/20 automatisiert grün).
- Erledigt: EP-02 KERN-Blocker geschlossen (native Stundenzettel-Erfassung inline in `einsatzportal-stundenzettel.html`, keine Weiterleitung). EP-03 Backend-Haertung geschlossen (org_id serverseitig aus `worker_assignment_link_id` abgeleitet, Client-Felder aus POST-Body entfernt; `workerSubmissionOrgHardening.security` gruen). Cross-Org-Negativtests gruen (EP-09 XORG-Set). 0 Links auf Legacy-`worker-timesheet.html`. Browser-Smoke NEU: `e2e/tests/einsatzportal-worker-flow.spec.js` 8/8 gruen.
- Voraussetzungs-Fixes (2026-06-05): Registrierungs-Blocker behoben (`authService.js` → `normalizePlanKey`, DEMO statt FREE), Migration 127 `org_access_suspension` angewandt.
- Restpunkte (owner-/manuell-gated, NICHT Worker-Portal): (1) Gate 16 = 2 Agency-Review-Tests in `workerSubmissionsReview.access.flow.test.js` — Fehler A `worker_view`-Capability = in-flight Entitlement-Refaktorierung (entitlementService.js uncommitted, → Task #30/Item-3); Fehler B `worker_module`-Gate 200≠403 = `FEATURE_GATE_BYPASS=true` Container-Artefakt. (2) Gate 20 Mobile-Abnahme = Owner manuell. (3) Gate 13 Kontakt-Kontext = manuelle Sicht-Bestätigung empfohlen.
- Verify (durchgeführt): `node --test test/integration/worker*` im Container → 37/39 pass (2 Fehler = Restpunkt 1, nicht Worker-Portal); `npx playwright test einsatzportal` → 8/8; `grep worker-timesheet.html einsatzportal-*.html` → leer.
### P1.7 - Entitlement-Leaks: als INDIVIDUELL verkaufte Features nur rollen-gegated
- Status: ERLEDIGT (2026-06-03, Owner-Freigabe „alle, effizientester/zukunftssicherer Weg") — HIGH-Leaks geschlossen, MED/LOW als „open-by-design" geklaert (kein Doku-Drift). Diffs uncommitted bis Owner-Commit-Freigabe.
- Befund (Audit): `visibilityMatrix.has_backend_guard:true` ist DOKU, nicht Laufzeit-Wahrheit. Nur Routen mit explizitem `requireFeature`/`requireOrgFeature` erzwingen den Plan-Gate; `rperm(...)` ist ROLLE, kein Plan. Cross-Check aller 12 `feature_key` gegen `routes/`.
- **HIGH (Umsatzleck) — GESCHLOSSEN, pilot-bewusst:**
  - `enterprise_analytics`: `requireOrgFeature("enterprise_analytics")` auf `reporting.js` `/reporting/dashboard` + `/reporting/finance-truth/export` (NUR die 2 `report.executive`-Routen; operationale Reports `report.operational` bewusst offen, da `sla_access` plan-uebergreifend gilt).
  - `assignments`: `requireOrgFeature("assignments")` auf `assignments.js` NUR `POST /assignments` (create) + `PATCH /assignments/:id` (edit) = kaeufer-exklusive Schreibpfade. Lesen (view) + Lifecycle (transition/complete) bleiben offen, weil zweiseitig — `supplier_org_id` (Agentur/Lieferant, oft nicht INDIVIDUELL) ist dort legitim beteiligt.
  - Guard ist pilot-aware (`getOrganizationEntitlements` → `effective_plan=INDIVIDUELL` fuer `pilot_status='active'`): aktive DEMO-Piloten behalten Zugang; nur zahlende Tarife < INDIVIDUELL erhalten `FEATURE_NOT_ENABLED`. Tests: `api/test/entitlementLeakGates.route.test.js` (12 Faelle: PRO=403 / INDIVIDUELL=ok / DEMO+Pilot=ok + Struktur-Checks ungegateter Routen). Bestehende `reporting.route.test.js` (28) regressionsfrei.
- **MED/LOW — OPEN-BY-DESIGN (kein Leak, NICHT gaten):** rollenbasiert geprueft, bewusst offen:
  - `persistent_requisitions` (`requisitions.js`): Requisition-CRUD ist Trial-Kernfluss (DEMO/BASIS legen Requisitionen an). Differenzierung laeuft ueber Limits/Retention, nicht ueber ein Create-Gate. Wholesale-Gate wuerde Trials brechen.
  - `basic_analytics`: KEINE dedizierte API-Route (nur Config + Frontend-Entitlement-Anzeige). `reports.js` `/reports` ist Missbrauchsmeldung (spam/betrug), NICHT Analytics — fruehere Zuordnung war falsch. Operationale Reports bleiben korrekt auf `report.operational` RBAC.
  - `supplier_ratings`: `ratings.js` `POST /ratings` ist ein ZWEISEITIGER Peer-Trust-Mechanismus (`isRequester || isReceiver`) — muss fuer alle Plaene offen bleiben, sonst kippt die Marktplatz-Reputation. Einziges theoretisches Gate-Ziel waere die Buyer-Scorecard (`requests.js` `/suppliers/:agencyId/scorecard`, companyOrg), aber Route→Feature-Mapping ist nicht durch Spec bestaetigt → kein spekulatives Gate.
  - `deal_workflow`: keine dedizierte Backend-Route (Deals laufen ueber bereits gegatete Capacity-Exchange-Endpunkte) → nur client-seitig gegated.
- Lektion: Zweiseitige Routen (view/transition/complete/peer-rating) NIE wholesale mit einem kaeuferseitigen Feature gaten — nur kaeufer-exklusive Schreibpfade. Sonst sperrt man die Lieferanten-/Agenturseite aus.
### P1.8 - Benachrichtigungen auf Hub-Cards + Glocken-Konsolidierung
- Status: ERLEDIGT (2026-06-04, Owner-Freigabe „Ja, voll bauen"). Diffs uncommitted bis Owner-Commit-Freigabe.
- Befund: Enterprise-Shell zeigte ZWEI Glocken nebeneinander (beide im `[data-notif-topbar]`): die statische pageShell-Link-Glocke `#tc-notif-bell` (→ activity.html) und das reiche `notifications.js`-Dropdown (Deep-Links via `link_path`, Read-all, Mark-read). Redundanz. Hub-Cards trugen keine Ereigniszahl.
- Umsetzung (bestehende Strukturen erweitert, keine Parallelstruktur):
  - Backend: `notificationSurfaceMap.js` = einzige Wahrheitsquelle `notification.type → Hub-Surface` (deckt notificationMatrix/Mig-019/071/072 ab). Neuer read-only `GET /api/notifications/surface-summary` (user-scoped, EINE `GROUP BY type`-Query auf den vorhandenen Partial-Index, foldet auf `{surfaces,total}`; `total` bleibt Glocken-konsistent inkl. bell-only Typen).
  - Frontend: `enterpriseHub.js` rendert kleine Zahl (≤99+) auf sichtbare `[data-surface]`-Cards; Card-href = „direkt da hin". `notifications.js` blendet die statische Alt-Glocke nach Mount plattformweit aus (guarded → strandet keine Seite; pageShell-SSE-Live-Toasts bleiben).
  - Surface-Mapping: requisition_*→requisitions, offer_*/deal_*→deals, capacity_*/demand/emergency_*→marketplace, vendor_pool_*→vendor_pool, compliance_*→trust_center, sla_*→my_company, timesheet_*→assignments; general/system/worker-only→bell-only.
- Tests: `notificationSurfaceMap.test.js` (15) + `notifications.surfaceSummary.route.test.js` (4) grün; bestehende notif-Suiten 120/120 regressionsfrei.
- Verify (manuell, Browser offen): Hub-Card-Badge erscheint bei ungelesenen Ereignissen, Klick navigiert; nur EINE Glocke sichtbar; Worker-Portal (einsatzportal-*) unberührt.
## P2 - Erste Pilotwochen (Betriebshaertung)
### P2.0 - INDIVIDUELL Tier-Schwellen migrieren (W-01 aus WAVE_02)
- Status: ERLEDIGT (2026-06-13, Owner-bestaetigt, Commit `c80b74c`)
- Loesung (echte Single Source statt nur Angleichung): kanonische Schwellen 50/150/350 leben jetzt NUR in `planFeatures.getIndividualTierByEmployeeCount`; `planCatalog` re-exportiert sie als `getIndividualTierByEmployeeCountV2` (Alias) — das abweichende `TIER_THRESHOLDS_V2`-Duplikat (Doppelwahrheit) entfernt. `auth.js` liefert dadurch automatisch kanonisch (kein Aufrufer-Change). Drift-Guard-Test (Funktion <-> INDIVIDUAL_TIER_CATALOG) verhindert kuenftige Divergenz. 3 stale-Tests kanonisch korrigiert (par. 0.9).
- (c) DB-Backfill `individual_tier_auto`: **N/A pre-launch** (keine zahlenden Bestands-Orgs; Neu-Registrierungen erhalten kanonisch). Falls je noetig: einmaliges `UPDATE organizations SET individual_tier_auto = ...` (1-Zeiler).
- Verify: `getIndividualTierByEmployeeCount(45)`==`individuell_s`, `(100)`==`individuell_m` ✓; tier/pricing/registration 115/115 + 149/149 gruen; Drift-Guard datengetrieben gegen den Katalog.
### P2.1 - Coverage-Schwellen schrittweise anheben
- Status: GEPLANT
- Ziel: von 35/75/55/35 -> 45/80/60/45 -> 55/85/70/55 in drei Schritten (monatlich).
- Aufwand: rollierend, ca. 1 Tag pro Welle.
### P2.2 - Load-Tests fuer Kern-Endpoints
- Status: GEPLANT
- Umfang: k6-Skript gegen Matching, Deal-Accept, Emergency-Commit, Timesheet-Submit.
- Aufwand: 1-2 Tage.
### P2.3 - Chaos-Run (DB-Down, Redis-Down, API-Restart)
- Status: GEPLANT
- Ziel: verifizieren, dass Correlation-IDs, Pending-Requests, Idempotency-Keys robust bleiben.
- Aufwand: 1 Tag.
### P2.4 - Phase 4 Track C: Terminologie-Umbenennung
- Status: GEPLANT (kann parallel zu Phase-3 WAVES 07-13 laufen)
- Fakt: Technische Begriffe (Requisition, Kapazitaet, Marktplatz) sichtbar im UI, fuer Kunden verwirrend. Track-C-Gate aus GATES.md ist Marktstart-Pflicht oder explizit Post-Launch.
- Aktion: Eigener Branch `feature/terminology-rename`. Mit Phase 0 (Read-only Inventar -> `docs/product/TERMINOLOGY_RENAME_AUDIT.md`) beginnen. Masterprompt: `finalization/phase 4/MASTERPROMPTS.md` Abschnitt C. Owner-Freigabe fuer Begriffsmatrix noetig (MANUAL_TASKS.md).
- Aufwand: 13 Sessions (Phase 0-12). Phase 0+1 (Audit + Guide) als Voraussetzung fuer Track A.
- Verify: Track-C-Gate aus `finalization/phase 4/GATES.md` (10 Kriterien), kein `Bedarf einstellen` in Company-Surfaces, kein `Kapazitaet einstellen` in Agency-Surfaces, `docs/product/TERMINOLOGY_GUIDE.md` vorhanden.
### P2.5 - Cross-Org-Regressionstest-Abdeckung fuer org-scoped Schreib-Endpunkte (Audit 2026-06-13)
- Status: TEILWEISE (2026-06-14, Commit `5de10d7`) — **Wave 1 workers + Wave 2 suppliers erledigt** (11 Tests in `coreFlowCrossTenant.test.js`: by-id-Worker-Mutationen + vendor-pool approve/suspend/block/categorize/tier/notes, je cross-org->403 + own-org->ok). Verbleibende Folge-Wellen (niedrigeres Risiko, Enforcement vorhanden): timesheetTemplates, agency-submissions, marketplace-offers, emergency.
- Status (Rest): GEPLANT (inkrementell; KEINE akute Vuln — Enforcement vorhanden, nur Test fehlt)
- Fakt: Cross-Org-Coverage-Audit (6-Slice-Workflow) ueber ~100 mutierende org-scoped Endpunkte. **Enforcement ist breit vorhanden** (req.orgId-scoped WHERE, getScopedWorker, requireOwnedVendorEntry, assertOrgOwnership, supplier_org_id-Check) — aber viele haben KEINEN dedizierten Cross-Org-403-Regressionstest. Risiko = Regression (jemand entfernt einen Check unbemerkt), nicht aktive Luecke. Die 2 ECHTEN Luecken (requisition-candidates IDOR) sind bereits gefixt+getestet (`1a72f60`). integrations.js-„HOCH-vuln" war False-Positive (Service org-scoped).
- Aktion: pro Domaene eine Mock-Pool-Test-Welle nach dem `coreFlowCrossTenant.test.js`-Muster (poolWith(foreignOrgRow) -> findHandlerExact -> 403). Prioritaet: workers (PII/Invites/Assignment-Links), suppliers (tier/block), timesheetTemplates, agency-submissions, marketplace-offers, dataGovernance/invoices-operational.
- Aufwand: ~4-6 kurze Slices (je 1 Domaene), rein additive Tests, kein Produktcode.
- Verify: jede Domaene hat >=1 cross-org-403 + 1 own-org-ok Test; `npm run test:unit` gruen.
## Verbesserungsvorschlaege
### A - kurzfristig, hoher Leverage (3-6 Wochen)
- **A.1** Web-Components-Shell neben Vanilla-JS einfuehren (kein Big-Bang). Zuerst `pageShell`/`hub`/`nav`, dann Page-fuer-Page.
- **A.2** OpenAPI-Spec aus Zod-Schemas generieren (`@asteasolutions/zod-to-openapi`). Beendet Doku-Drift strukturell.
- **A.3** Feature-Flags extern (Unleash oder ConfigCat) statt `FEATURE_GATE_BYPASS` + Plan-Matrix fuer granulare Pilot-Schaltung.
### B - mittelfristig, Marktwert-Multiplikator (2-3 Monate)
- **B.1** Public Marktplatz-KPI-Dashboard ("X offene Bedarfe / Y Agenturen / Z Deals") als Landing-Segment. Macht Netzwerk-Effekt sichtbar.
- **B.2** Worker-PWA statt native App: `einsatzportal-*.html` installierbar machen, Offline-Safe fuer Zeiterfassung.
- **B.3** Erklaerbares Matching: "Warum matched dieser Worker nicht" mit Feedback-Loop auf `matching_results.html`. Enterprise-Argument.
### C - Enterprise-Vertriebshebel (parallel zum Pilot)
- **C.1** SOC2/ISO27001-Vorbereitung: Audit-Log, Data-Governance, Org-Boundary-Bausteine existieren. Trust-Center-Inhalte in 2-3 Wochen vorbereitbar, voller Audit 3-6 Monate mit Partner.
- **C.2** DPA/AV-Vorlagen + Subprocessor-Liste in `trust/compliance.html`. Haeufiger Einkauf-Stopper.
- **C.3** Rollout-Playbook als Warp-Notebook ("Create Tenant", "Seed Demo", "Assign Program Manager"). Senkt Pilot-Onboarding von Stunden auf Minuten.
- **C.4** Phase 4 Track A: Marketplace Visibility Center als Post-Launch-Premium-Feature fuer PRO/INDIVIDUELL. Kontrolliertes oeffentliches Anbieterprofil, anonymisierte Profil-Analytics, verifizierte Deal-basierte Bewertungen, kuratierte Rankings. 13 Wellen (M-00 bis M-13), Masterprompt: `finalization/phase 4/MASTERPROMPTS.md` Abschnitt A. NICHT vor Phase 3 WAVE 04 + Track C Phase 0+1 starten (Cross-Cutting-Abhaengigkeit).
## Done
- **Welle H1 — der Kunde sieht den Ausfall, nie den Grund (2026-08-19)**
  - **Auftrag:** Die Kundenansicht soll zeigen, DASS eine gebuchte Kraft ausfaellt und bis wann voraussichtlich — nie die Art ("krank" ist ein Gesundheitsdatum nach Art. 9 DSGVO, das Einsatzunternehmen ist ein Dritter). Der Deep-Link aus der G4b-Meldung soll auf der betroffenen Zeile landen.
  - **Der gefaehrlichste Befund war kein fehlendes Feature, sondern eine Luege in Reserve:** `liveBadge()` war ein binaeres Ternaer — jeder Zustand ausser `endet_bald` fiel ins gruene "Im Einsatz". Ein serverseitig ergaenzter Zustand haette also nicht GEFEHLT, sondern das Gegenteil behauptet. Reihenfolge deshalb: Renderer + Waechter zuerst, dann das Feld.
  - **Zweitens wurde die Antwort durchgereicht statt gebaut.** `getCompanyLiveWorkforce` gab die rohen Datenbankzeilen heraus; die naechste SELECT-Spalte waere ohne Zutun beim Kunden gelandet. Jetzt Positivliste, mit `fuerKunde()` als Schutzfunktion davor.
  - **Drittens war die Sackgasse doppelt:** die Zielseite las weder `?einsatz=` noch `#live`, UND die Zeile trug keine `assignment_id`. Viertens hatte die "Live"-Tafel kein Polling.
  - **Zusatzfund, mitbehoben:** Die Spalte "Rolle" rendert `wal.role` — ein geschlossener CHECK auf `'primary'|'backup'` (Besetzungsart, keine Taetigkeit), NOT NULL mit Vorgabe `'primary'`. Der Kunde las dort das englische Wort "primary", und zwar in **jeder** Zeile. Der Rueckfall `|| worker_description` war tot, weil die Spalte nicht leer sein kann.
  - **Eine Recherche-Annahme war falsch und wurde korrigiert:** `worker_profiles(user_id)` galt als nicht eindeutig (gelesen war der *Index* in Mig 029:57-58; das inline `UNIQUE` steht in Zeile 35). Die daraus abgeleitete Empfehlung war zuerst gebaut und wurde wieder entfernt — sie haette nichts geschuetzt und bei abweichender Profil-Firma den **Namen** der Kraft aus der Kundenliste fallen lassen.
  - **Verify:** `api/test/h1KundenansichtAusfall.test.js` (36 Tests: Antwort-Wortliste, Positivliste der Schluessel, Abfrageform, gerendertes Markup, Deep-Link, Takt, DE/EN-Paritaet ueber das ganze Woerterbuch) + `api/test/integration/h1KundeSiehtAusfall.flow.test.js` (13 Tests gegen das echte Schema). Nach dem Zusammenfuehren mit H2: **9109 Tests, 0 Fehler**.

- **`organizations.js`: vier Kopien der Mandantengrenze zu einer fail-closed Stelle — erledigt 2026-08-21 (`79e95e2`)**
  - **Fakt:** Die Org-Grenze stand fünfmal in der Datei — einmal als Middleware `sameOrgParam` (12 Routen) und viermal als wörtliche Kopie in den Lese-Routen `GET /organizations/:id{,/locations,/departments,/members}`. Alle fünf trugen die selbstabschaltende Form `if (req.orgId && …)`; die vier Lese-Routen hatten ausser `requireAuth` keinen weiteren Guard.
  - **Bemerkenswert:** die richtige Form stand zwei Zeilen tiefer — `parentOrgBoundary` prüft `if (!req.orgId || …)`. Zwei Grenzen nebeneinander, eine mit Selbstabschaltung.
  - **Was die Reparatur über die Tests verraten hat:** zwölf Proben wurden rot, alle aus demselben Grund — sie holen sich per `findHandlerExact` den **letzten** Handler und greifen an jedem Guard vorbei. Als die Grenze in die Middleware wanderte, meldeten sie „keine Grenze", obwohl sie strenger geworden war. Dafür gibt es seit H2 bereits `findChainFrom`; sein Kommentar nennt `sameOrgParam` namentlich. Umgestellt — auch die Positiv-Probe, die über den letzten Handler allein leer war.
  - **Verify:** `grenzeIn: "sameOrgParam"` im Register (Ratsche unverändert 256), neue Probe ohne Org-Kontext über alle vier Routen, Rückmutation rot/grün. Voller Lauf **9591/0**.
- **`admin.js`: alle 25 Routen org-begrenzt — erledigt 2026-08-21 (`36ad91d`)**
  - **Owner-Entscheidung:** jede Route der Kundenfläche wird begrenzt, statt die Fläche zu verschieben.
  - **Org-begrenzt (5):** `/admin/organizations` (listete jede Organisation der Plattform — Namen, Tarife, Mitglieder- und Standortzahlen der Mitbewerber), `/admin/requests` (über eine Mitgliedschafts-Brücke, weil `requests` keine `org_id` trägt — 47 von 47 Zeilen NULL), `/admin/strategic-collaboration/requests` (zweiseitig: beide Seiten zählen), `/admin/activity-feed` (`queryActivityFeed(pool, null)` heißt plattformweit — dieselbe selbstabschaltende Form wie 8.1.1 c), `/admin/control-center` (`queryAdminSummary` zählte unbedingt über alle Nutzer, Orgs, Angebote, Audit-Ereignisse).
  - **Der Plattformverwaltung vorbehalten (13):** Sichtbarkeitsmatrix, Pilot-Ausnahme, Metriken, Umsatz, System-Health, Feature-Overrides GET/PUT/DELETE + Feature-Keys, Marktplatz-Statuswechsel und die drei Team-Workflows der strategischen Anfragen. **`PUT /admin/feature-overrides` nahm `org_id` frei aus dem Rumpf** — ein Kunden-Admin konnte damit eine Funktion für jede Organisation freischalten. Präzise: `checkOverride` wird von genau **einem** Dienst konsultiert (`dealStaffingFastTrackService`) — ein echter, aber schmaler Hebel, kein Generalschlüssel.
  - **Keine toten Knöpfe:** `allowed_tabs` lässt die Reiter metrics/revenue/features/strategic/releases für Kunden weg; users/orgs/audit/activity/requests bleiben.
  - **Struktureller Riegel:** `admin.route.coverage.test.js` verlangt jetzt, dass **jede** Route sichtbar Stellung bezieht (`bestimmeAdminUmfang`, `zielNutzerErlaubt` oder `nurPlattform`). Genau so ist der Befund entstanden — später hinzugefügte Routen haben die Frage nie gestellt. Der Riegel hat beim ersten Lauf sofort `/admin/control-center` gefangen, das ich über einen anderen Helfer gegated hatte.
  - **Drei Tests korrigiert, nicht abgeschwächt:** `adminUsers.route.test.js` prüfte Pagination als **Kunden**-Owner und schrieb damit die unbegrenzte Abfrage als Sollzustand fest; `security/adminRoutes.test.js` prüfte die Whitelist über die eine Route ohne zweite Prüfung (spröde nach §0.9) und prüft sie jetzt am Wächter selbst; `adminControlCenterService.test.js` fordert die Plattformzahlen jetzt ausdrücklich an. Jeder mit Gegenprobe.
  - **Verify:** 22 neue Proben. Rückmutation zweifach — Sperre entfernt → 13 rot; Route ohne Umfang eingeschmuggelt → Riegel rot. Voller Lauf **9590/0** (13 übersprungen).
- **8.1.1 (c)–(e): die drei Audit-Sichten stehen getrennt — dabei zwei aktive Cross-Org-Lecks gefunden und geschlossen, 2026-08-21 (`5677f70`, `bcf03b9`, `0259d94`, `a971979`)**
  - **P0-Befund, aktiv und erreichbar:** `requireAdmin` in `api/routes/admin.js` lässt jeden mit der **Org**-Rolle `owner`/`admin` durch — gegen die laufende Datenbank gezählt **201 von 395 Konten**, davon 142 in Unternehmens- und 59 in Zeitarbeits-Organisationen. **Kein einziges gehört TempConnect.** Der Router hängt ohne weiteres Tor unter `app.use("/api", v1)`.
  - **Gelesen:** `GET /admin/audit-log`, `/export/csv` und `/recent-changes` lieferten das **plattformweite** Audit-Log — `org_id: req.query.org_id || null` heißt ohne Angabe *alles*. Inklusive CSV-Ausfuhr außer Haus.
  - **Geschrieben (schwerer):** `PATCH /admin/users/:id` und `POST /admin/users/:id/deactivate` schrieben `UPDATE users … WHERE id = $1` ohne jede Org-Prüfung — jedes Konto der Plattform änderbar und sperrbar, auch fremde Kunden und TempConnect selbst. **Die Liste war längst org-begrenzt, die Mutation nicht:** die Grenze lebte nur in dem, was die Oberfläche *zeigt*, nicht in dem, was der Endpunkt *zulässt*.
  - **Aktion:** `bestimmeAdminUmfang()` + `zielNutzerErlaubt()` in `admin.js`; `role`/`plan` der Plattformverwaltung vorbehalten; `GET /admin/users` liefert `scope`, `adminPanel.js` blendet die beiden Auswahlfelder sonst aus (keine toten Knöpfe). `GET /staff/platform-audit` neu — die Plattformsicht liegt jetzt im Staff Center, hinter `requireStaff`. Kunden-Audit-Grenze fail-closed statt selbstabschaltend.
  - **Nicht überzeichnet:** die Tarif-Auswahl war **kein** Freischalt-Bypass — kein Feature-Gate liest `users.plan` (der wirksame Tarif kommt aus `subscriptions`). Sie verfälscht Analytik und DSGVO-Auskunft, sie kauft nichts frei.
  - **Verify:** 17 neue Proben in drei Dateien, jede per Rückmutation belegt (Riegel entfernt → rot, zurückgesetzt → grün). Voller Lauf **9564/0** (13 übersprungen), Register 621/621.

- **8.1.1: Das Audit-Log trennt die Mandanten — Ursache behoben, Bestand repariert, 2026-08-21 (`23e4ea5`, `615e042`)**
  - **Abnahme erfüllt:** Zeilen mit fremder Organisation **139 → 0**. Org-lose Zeilen 1797 → 495, jede mit Grund (253 ohne Akteur, 242 mit Akteur ohne Mitgliedschaft). Nichts gelöscht: 2740 → 2742 Zeilen (2 aus laufendem Verkehr).
  - **Die Ursache war kein Audit-Fehler.** `routes/demo.js` setzte `req.session.userId` **ohne `session.regenerate()`** — den Schutz, den `/auth/login` seit SEC-001 gegen Session-Fixation hat. Die alte Sitzung behielt ihren `_orgCache`, und `req.orgId` zeigte für den Demo-Nutzer die ganze Sitzung lang auf die Organisation des zuvor angemeldeten Kontos. Das trifft die Mandantengrenze von **45 Routen**, die als `if (req.orgId && ressource.org_id !== req.orgId) return 403;` gebaut ist — nicht nur das Audit.
  - **Drei Schichten repariert:** Sitzung wird neu erzeugt; der Zwischenspeicher trägt jetzt den Nutzer, für den er aufgelöst wurde, und wird sonst verworfen; die Audit-Schreibseite nimmt die Organisation über `bestimmeAuditOrg()` aus der Quelle der Wahrheit statt aus dem Anfragekontext.
  - **Dabei mitgefunden:** die RLS-Policy `al_same_org` lautete `org_id = current_org_id() OR org_id IS NULL` und zeigte damit **jeder** Organisation alle 1796 org-losen Zeilen, sobald RLS die Grenze ist — während der Anwendungspfad sie korrekt herausfiltert. Datenbank und Anwendung widersprachen sich. Geschlossen.
  - **Beim Einspielen gefunden:** `min(uuid)` gibt es in Postgres nicht; der erste Lauf brach dank `ON_ERROR_STOP=1` folgenlos ab. Genau die Klasse Fehler, an der 116 scheiterte — deshalb ist 187 nicht-transaktional und je Schritt `to_regclass`-geschützt.
  - **Verify:** Verhaltensprobe mit Wegwerf-Rolle **ohne Superuser und ohne `BYPASSRLS`**: ohne Kontext 0, Org A 303 (nur eigene), Org B 140 (nur eigene), Staff 2742, org-lose für A 0. Gegenprobe bestanden (das eigene Audit ist nicht leer). Dreifache Rückmutation. Migration idempotent (2. Lauf: 0/0). Wächter `api/test/auditMandantenGrenze.test.js` Host 6/6, Container 10/10. Voller Lauf **9540/0**.
  - **Offen:** Register `orgGrenzen.json`/`wachen.json` nachziehen; Teile (c)–(e) — die drei getrennten Sichten, der Admin-Bereich, die Plattformsicht im Staff Center.
- **P2-W1: Die Wächter prüfen jetzt den git-Index statt des Dateibaums — erledigt 2026-08-21**
  - **Fakt:** `docsConsistency`, `dokuWaechter` und (vom vollen Lauf gefunden, nicht vom Nachdenken) `releaseSecretScan` leiteten aus einem **fehlenden** Pfad einen Befund ab. Betroffen sind die gitignorierten `.agents/`, `frontend/support-ops/`, `docs/launch/*` und `deploy/.env`: sie liegen im Haupt-Checkout und fehlen in jedem Worktree, jedem frischen Klon und in CI. **Zwei Sitzungen sind unabhängig hineingelaufen.**
  - **Der Fehler wirkte in beide Richtungen.** Die ignorierte `docs/launch/C_HETZNER-DEPLOY-RUNBOOK.md` liess im Haupt-Checkout vier echte Dokumente als verlinkt erscheinen, die im Repo in keinem Index standen — darunter `docs/security/TENANT_ISOLATION_MODEL.md`. Falsch rot im Worktree, falsch grün im Hauptbaum. Ein Wächter, dessen Urteil vom Arbeitsplatz abhängt, ist an beiden Enden unbrauchbar.
  - **Aktion:** Neuer Helfer `api/test/helpers/repoBestand.js`. Eingangsmenge aus `git ls-files`, Link-Ziele gegen den Index statt gegen die Festplatte aufgelöst. Was git bewusst nicht trägt, wird als *nicht geprüft* benannt und gezählt, nie als Fund. Die vier Dokumente stehen jetzt in `docs/README.md`; die Verwaisten-Ratsche schrumpfte dabei 154 → 146 ohne einen neuen Eintrag.
  - **Keine Hintertür:** `git check-ignore` befragt den Index mit — eine getrackte Datei gilt nie als ignoriert. Ein Befund lässt sich also nicht dadurch entfernen, dass man den Pfad in `.gitignore` einträgt. `api/test/repoBestand.test.js` (8 Tests) weist das per Rückmutation nach, ebenso die neue Zusicherung in `releaseSecretScan`.
  - **Nebenbefund, festgenagelt:** Ein abschliessender Schrägstrich hängt den Index-Abgleich von `git check-ignore` aus — `docs/README.md/` gilt dann als ignoriert (Treffer auf eine **leere Zeile** der `.gitignore`), obwohl die Datei versioniert ist. Wer so sondiert, entschuldigt am Ende alles. `nichtImRepo` sondiert deshalb über einen Kindpfad und nur für Pfade ohne getrackten Inhalt.
  - **Aufwand:** ~1 h wie veranschlagt. **Verify:** identisches Urteil in drei Umgebungen (Worktree, frischer `git clone` ohne jede ignorierte Datei, Baum mit ihnen). Voller Lauf `node scripts/run-tests.js` **9524/0** (13 übersprungen) — der erste grüne Gate-Lauf in diesem Worktree überhaupt.
  - **Zweiter Fund nebenbei:** Ein Worktree hat kein `api/node_modules` (gitignored). Ohne Verknüpfung bricht die halbe Suite mit `ERR_MODULE_NOT_FOUND` ab — 207 Fehler, die wie Testbrüche aussehen und keine sind. In `docs/UEBERGABE.md` als Einmal-Handgriff dokumentiert.
- **P8 Deal-Verbindlichkeit, Wellen A-E abgeschlossen 2026-08-07 (committet `4220693`, `bcecf3f`, `a7968d2`, `e02bb7f`, `67b0282`)**
  - **Was der Owner beauftragt hatte:** Beide Seiten sollen Deals zurueckziehen bzw. abbrechen koennen — mit Folgen, aber ohne Geldstrafen; Abschluss in drei Schritten bestaetigen; und die Zeitarbeitsfirma soll beim Ueberfahren eines Angebots sehen, ob sie es besetzen koennte. Alles gebaut, alle fuenf Gates nachgewiesen. Owner-Entscheidungen E1-E4 wie vorgeschlagen umgesetzt, **E5 neu entschieden**: beide Bounty-Stufen bleiben bei 3 %.
  - **Der eigentliche Ertrag waren vier geerbte Defekte**, die alle dasselbe Muster teilen — Code, der richtig aussieht, dessen Wirkung nie ankommt, bei durchgehend gruener Suite. Ein *fehlender* Effekt macht nichts rot:
    1. **`deal_success_rate` war in Produktion durchgehend NULL.** Seit Mig 044 verdrahtet, im Feed-Ranking gewichtet und an sechs Stellen angezeigt — die einzige Schreibstelle (`reputationService.recomputeReputation`) hatte nie einen Aufrufer. Am Entwicklungsbestand nachgemessen: 0 gesetzte Werte. Ein Storno kostete exakt nichts.
    2. **E1 zuendete nie.** `cancelAgreement` loeste den Einsatzbeginn ueber `offer.assignment_start_date` auf — diese Spalte gibt es auf `offers` nicht (nur auf `offer_cancellations`, als Zielspalte). `undefined` wirft nicht, es rutscht durch: `lead_time_hours` blieb NULL, die 48-Stunden-Regel griff nie. Betraf **8 von 15** bestaetigten Angeboten.
    3. **Das Bounty `zero_complaint` mass den falschen Storno-Kanal.** Es zaehlt `requests.status='CANCELED'` — den Alt-Pfad. `cancelAgreement` fasst `requests` nie an. Wer eine Einsatzvereinbarung platzen liess, behielt 3 % Rabatt fuer "null Stornos"; die Plattform subventionierte genau das Verhalten, das P8 abstellen soll.
    4. **Der Storno-Knopf war seit Welle A tot.** Die Route verlangt `reason_code` aus einem Enum, das Frontend schickte weiter Freitext unter `reason` → 400 bei jeder Stornierung ueber `offer_detail.html`. Route-Tests benutzen naturgemaess die neue Form; fuer den Knopf gab es keinen Klickpfad.
  - **Uebertragbare Lehren (gelten fuer alle 20 Folgeprojekte),** in `SKILL.md` verankert: (a) Eine Kennzahl braucht einen Test, der beweist, dass sie GESCHRIEBEN wird — nicht nur einen, der prueft, wie sie gerechnet wuerde. (b) Ein `||`-Fallback auf einen Spaltennamen ist eine ungepruefte Behauptung ueber das Schema. (c) Bei einer Bedingung ueber einen Status zaehlt nicht, *ob* er geschrieben wird, sondern *welcher Flow* ihn fuellt — bei zwei parallelen Flows ist "wird geschrieben" die falsche Frage. (d) Ein `grep`, der Status-Literal und `UPDATE` in derselben Zeile verlangt, findet parametrisierte Statements nicht; Schreibpfade ueber die Aufrufer der Update-Funktion suchen. (e) Wer eine Request-Schema-Signatur aendert, muss die Aufrufer greppen.
  - **Zwei Fehler in der eigenen Arbeit, aufgedeckt durch Gegenpruefung bzw. echte Daten** und beide korrigiert: die erste Fassung behauptete zu weit gegriffen, `'CANCELED'` schreibe *kein* Codepfad (widerlegt — es ist der falsche Kanal, nicht der tote Status); und die Bounty-Leiter lief anfangs rueckwaerts, weil Streak- und Nachweisfenster gekoppelt waren.
  - **Betriebs-Pflicht vor Go-Live:** Der Cron `POST /api/internal/recompute-deal-reliability` MUSS eingerichtet werden (taeglich, Zeile steht in `docs/SCHEDULER.md`). Ohne ihn friert jede Quote nach dem letzten Storno ein — niemand kann sich freiarbeiten, und das rollierende Jahresfenster schiebt sich nie weiter. Ausserdem: Migrationen **164** und **165** einspielen.
  - **Betriebs-Blocker — BEHOBEN am 2026-08-24 (Owner-Entscheid).** Befund vom 2026-08-23: Der dokumentierte Cron-Aufruf `POST /api/internal/*` mit `X-Internal-Secret` lieferte am laufenden Container **403 CSRF_INVALID** — `csrfProtect` haengt unter `app.use("/api/", ...)` und lief vor dem internen Router, die Ausnahmeliste kannte `/internal/` nicht. **Jede** daran haengende Frist (staffing-maintenance, recompute-deal-reliability, Ersatz-Frist) lief nie; zusaetzlich kein Crontab im Repo, kein Scheduler-Container, 0 Aufrufe in 72 h Log. **Gebaut:** CSRF-Ausnahme in `api/middleware/auth.js`, eng gefuehrt — nur **mit** `X-Internal-Secret`-Kopf (ohne Kopf bleibt CSRF in Kraft) und nur fuer `/internal/`, **nicht** fuer das session-basierte `/internal-control/`. Begruendung wie bei der `X-API-Key`-Ausnahme daneben: ein eigener Kopf loest CORS-Preflight aus, ein fremder Tab kann ihn nicht setzen. **Mitgeschlossen:** `checkCronAuth` schaltete sich ohne konfiguriertes Secret selbst ab (`if (cronSecret && ...)`) — CSRF war dort die unbeabsichtigte Sperre; jetzt fail-closed mit **503 CRON_NOT_CONFIGURED**. Am laufenden System belegt: mit Secret **200** (vorher 403), ohne Kopf 403 CSRF, falsches Secret 403 FORBIDDEN, `/internal-control/` 403 CSRF, ohne Secret 503. 7 Proben in `api/test/cronOhneCsrf.test.js`. **Rest-Betriebspflicht:** den Crontab tatsaechlich einrichten (Zeilen stehen in `docs/SCHEDULER.md`) — der Weg ist jetzt offen, aber es ruft ihn noch niemand. Die Ersatz-Frist laeuft unabhaengig davon ueber BullMQ (alle 10 Min) und den taktunabhaengigen Riegel.
  - **Org-weite MFA-Pflicht ist nie gebaut worden (gefunden 2026-08-24, Welle I).** `organizations.enforce_mfa` existiert seit Migration 058 und kommt im **gesamten Repo nur dort** vor — nicht setzbar, nicht gelesen, keine Oberflaeche. Es taeuscht niemanden (anders als `org_settings.approval_required`, das sich als aktiv meldete und nichts bewirkte — behoben in `a6a2cf2`), aber fuer Enterprise-Beschaffung ist eine org-weite MFA-Pflicht ein ueblicher Punkt. **Owner-Entscheidung, nicht autonom baubar:** eine solche Pflicht sperrt jeden aus, der MFA nicht eingerichtet hat — es braucht Uebergangsfrist und Break-Glass, sonst schliesst sich eine Organisation selbst aus (dieselbe Klasse wie Stop-Regel 8 „SSO-Enforce ohne Recovery“). Die Bausteine liegen bereit: `api/middleware/requireMfa.js`, `api/routes/mfa.js`.
  - **Das Einsatzportal ist fuer niemanden erreichbar (gefunden 2026-08-24, Welle I).** `frontend/demo.html` bietet drei Perspektiven (buyer/agency/admin), das Wort „Arbeiter“ kommt dort **0 Mal** vor; `ROLE_ACCOUNTS` kennt keinen `worker`; einen Magic-Link gibt es nicht. Die drei geseeten Demo-Arbeiter (`*.worker-demo.de`) tragen `is_demo=false` (loginDemoUser verlangt TRUE) und **Attrappen-Hashes mit 51 statt 60 Zeichen** — `bcrypt.compare` liefert fuer jede Eingabe `false`. **Folge 1:** die Demo-Geschichte „Besetzung → Zeiten“ ist nur zur Haelfte vorfuehrbar. **Folge 2:** keine Aenderung am Einsatzportal ist im Browser pruefbar — genau das hat die tote `ersatz`-LATERAL drei Tage ueberleben lassen. **Owner-Entscheidung, bewusst nicht autonom gebaut:** einen Demo-Arbeiter zu schaffen hiesse, einen Login-Weg fuer heute gesperrte Konten zu oeffnen — das gehoert unter dasselbe `SEED_DEMO_WORLD`-Gate wie P0.6, nicht daneben.
  - Verify: volle Suite **7986/0** (13 uebersprungen, DB-gebunden), E2E P8 **13/13**, DB-gestuetzter Schema-Smoke 10/10, drei Mutationsproben rot. Details: `docs/features/P8_DEAL_VERBINDLICHKEIT.md`.
- **Audit-Akteur bei Maschinen-Auth zentralisiert + Audit-Gate-Scanner gehaertet 2026-08-01 (committet 2026-08-02; Nachverifikation im Container: Audit-Gate 409/409, gezielte Tests 131/131 gruen)**
  - **Ausgangsmeldung (2 Gate-Verstoesse, `scim.js` PATCH/PUT `/scim/v2/Users/:id`) war ein Scanner-Fehler, KEINE fehlende Audit-Zeile:** beide Handler teilen sich die Funktion `applyUpdate`, die `writeAudit` bereits aufrief. Das Gate kannte nur Inline-Arrows und delegierte Aufrufe der Form `=> fn(req, res)`, nicht die Registrierung per Funktions-REFERENZ (`router.put(p, mw, applyUpdate)`).
  - **Die ECHTE Luecke dahinter war systemisch, nicht SCIM-spezifisch (Produktionspfeiler 5):** beide Audit-Wege loesten den Akteur nur aus `req.session.userId` auf — `middleware/auditWrite.js` (der Weg der MEISTEN Mutationen) und `writeAuditEnhanced`. Ein Request per API-Key/M2M hat keine Session und schrieb dadurch `actor_id: null` → `responsible_actor_user_id: null`, was laut der Semantik in `withResponsibleActor` „kein Mensch, sondern Cron/Webhook/Systemlauf" bedeutet. Betroffen sind alle scope-faehigen Routen: **72 Audit-Marker in 7 Dateien** (workers 32, timesheets 14, requisitions 8, invoices 7, companyTimesheets 5, assignments 4, capacityExchange 2) — jede Kundenintegration per API-Key erzeugte Audit-Zeilen ohne benennbaren Verantwortlichen.
  - **Fix an der Wurzel statt pro Route:** neues `resolveAuditActor(req)` in `services/auditLog.js` ist die eine Stelle, die den Akteur bestimmt (Session ODER Maschine); `auditWrite`-Middleware und `writeAuditEnhanced` nutzen sie beide. Verantwortlich bei Maschinen-Auth ist der Key-Ersteller — `apiKeyAuth` setzt `req.apiKeyOwnerUserId` aus `org_api_keys.created_by` (`lookupByHash`/`lookupById` selektieren die Spalte mit). Zusaetzlich landen `actor_type` (`api_key`|`m2m_token`) und `api_key_id` in `details`. **Durabilitaets-Loch geschlossen:** `created_by` ist `ON DELETE SET NULL` — ist der Ersteller geloescht, steht `responsible_actor_unknown: true` in der Zeile, statt still als Systemlauf zu erscheinen. Der Session-Fall bleibt bewusst byte-identisch (kein `actor_type`), damit bestehende Eintraege sich nicht aendern.
  - **Wirkung fuer die naechste Maschinen-Schnittstelle: keine Arbeit.** Wer ueber die Middleware oder `writeAuditEnhanced` auditiert, bekommt die Attribution automatisch — SCIM haelt selbst keine Akteurs-Logik mehr vor (`writeScimAudit` delegiert nur noch). Damit entfaellt der spaetere Umbau, den eine SCIM-lokale Loesung erzwungen haette.
  - **Vollstaendigkeit nachgemessen statt angenommen.** Audit-Wege repo-weit: 320 `res.locals.audit` (Middleware) + 6 `writeAuditEnhanced` → beide zentral geloest; 96 direkte `writeAudit`-Aufrufe bekommen kein `req` und muessen den Akteur weiterhin ausdruecklich setzen. Von diesen 96 lagen genau **7 auf einer maschinenerreichbaren Route** (`capacityExchange.js`, per `requireScope`) — sie sind auf `writeAuditEnhanced` umgestellt; nebenbei fuellen sie jetzt `org_id`/IP/User-Agent, die dort bisher leer blieben. Die uebrigen 89 liegen in reinen Session-Bereichen (admin/staff/support) und sind so korrekt. Damit ist die Luecke auf ALLEN API-Key-erreichbaren Oberflaechen geschlossen, nicht nur in SCIM.
  - **Zwei weitere Scanner-Defekte gefunden und behoben (beide false NEGATIVE — das Gate haette echte Luecken verschwiegen):** (a) der Handler-Block reichte bis zur naechsten Route-Registrierung, dadurch zog ein `writeAudit` in einer DAZWISCHEN stehenden Hilfsfunktion den vorherigen Handler faelschlich auf "abgedeckt"; jetzt paren-gematchte Blockgrenze. (b) Beim Klammer-Scan wurden Kommentare (`// 1)`) und Regex-Literale (`/^\//` — sein `//` galt als Kommentarbeginn) falsch gelesen; 4 Endpunkte fielen dadurch auf die permissive Ersatzgrenze zurueck (jetzt 0). Delegat-Aufloesung ist brace-gematcht statt 2000-Zeichen-Fenster; lokale Audit-Wrapper werden generisch aufgeloest und muessen ihren `writeAudit`-Aufruf im Rumpf BEWEISEN (kein Namens-Blindvertrauen wie bei den fruehen AUDIT_PATTERNS-Eintraegen).
  - Verify: `npm run audit:check` (CI-Pfad, Container) **408/408, exit 0** (vorher 2 Verstoesse). Negativkontrolle bestaetigt, dass das Gate weiterhin rot wird: Handler ohne Audit, Referenz-Handler ohne Audit und der Bleed-Fall werden alle gemeldet. Tests (Container): Audit-/Auth-Pfad **157/157** — `auditResponsibleActor` (+10 Maschinen-Akteur-Tests inkl. geloeschter Key-Ersteller), `audit-write` (+4 Middleware-Tests, davon einer als Regressionsschutz: Session-Eintraege bleiben unveraendert), `scim` (7 Audit-Tests), neu `auditCoverageCheck` 18/18, `apiKeyAuth`/`m2mAuth`/`audit-trail`. Lint auf allen geaenderten Dateien 0/0.
  - **Volle Suite `node scripts/run-tests.js`: 7425/7437 gruen, 3 fail + 9 cancelled — alle PRE-EXISTING und umgebungsbedingt, nicht durch diese Aenderung.** Nachgewiesen per `git stash` der Quelldateien: identische Fehlerliste mit und ohne die Aenderung. Zusaetzlich zweimal nachgemessen (nach der zentralen Middleware-Aenderung, die ~320 Audit-Marker beruehrt, und nach der `capacityExchange`-Umstellung) — beide Male exakt dieselben 9 Eintraege, also null Regressionen. Ursache: der Container mountet nur `api/` → `/app`; `docsConsistency` (`/docs/.docs-consistency-baseline.json`), `prodEnvTemplate` (`.env.prod.example`) und die Migrations-Tests (154/156) greifen auf Repo-Root-Pfade zu, die im Container nicht existieren; `occ_bootstrap` erwartet System-Status `healthy`, die Container-Umgebung meldet `degraded`. **Offene Hygiene (eigener Slice, nicht hier gefixt):** diese Tests skippen/failen je nach Startort statt sauber zu skippen — Kandidat fuer `import.meta.url`-relative Pfadaufloesung bzw. echtes Skip-Gate, sonst behauptet die "gruene" Suite mehr, als sie prueft (§0.9).
  - Geaendert: `api/services/auditLog.js` (neu `resolveAuditActor` + `withMachineActor`), `api/middleware/auditWrite.js`, `api/middleware/apiKeyAuth.js`, `api/services/apiKeyService.js`, `api/routes/scim.js`, `api/routes/capacityExchange.js` (7 Aufrufe), `api/scripts/audit-coverage-check.js`, Tests `api/test/auditResponsibleActor.test.js` + `api/test/audit-write.test.js` + `api/test/scim.test.js`, neu `api/test/auditCoverageCheck.test.js`, `.agents/skills/tempconnect-project/SKILL.md`.
- **Pre-Launch-Review #2: Kill-Switch am Self-Service-Checkout durchgesetzt 2026-06-16 (committet `2e137ea`)**
  - **HIGH Go-Live-Blocker (test-blind, dormant bis Stripe live):** Betreiber-Kill-Switch (`orgAccessSuspension`/`access_suspended_at`) griff NICHT am Self-Service-Checkout — gesperrte Org konnte buchen + via Stripe-Webhook auf INDIVIDUELL aktiviert werden (Operator-Hold unterlaufen). Fix: read-only `isOrgAccessSuspended` + zentraler `requireOrgNotSuspended`-Guard (403 ACCESS_SUSPENDED, fail-safe→500; NICHT requireActiveSubscription → Erstkäufer-sicher) auf `/payment/checkout`+`/individuell` + `access_suspended_at`-Recheck in `handleIndividuellActivation` (Audit `activation_blocked_suspended`, Session offen). Verifiziert: Host 53/53, Container 62/62 (payment + App-Boot + suspension + auth/rbac). OFFEN (eigener Slice): Findings 2/3 (Staff-Activate-Zahlungs-Diskriminator, ggf. Migration) + 2 Governance-Lows.
- **Pre-Launch-Review Geldkette: 2 Stripe-Webhook-Middleware-Blocker gefixt 2026-06-16 (committet `774c49d`)**
  - **Echte HIGH-Blocker vor echtem Stripe-Go-Live (test-blind in findHandler-Tests):** (1) globaler `express.json()` konsumierte den Roh-Body VOR der HMAC-Signaturprüfung → 400 INVALID_SIGNATURE bei JEDEM Webhook; (2) globaler `csrfProtect` blockte `/payment/webhook/*` → 403. Produktive Folge: Kunde zahlt, INDIVIDUELL-Tarif wird NIE aktiviert (Lifecycle kaputt). Fix: `express.json verify`→`req.rawBody`, `constructEvent(req.rawBody||req.body)`, csrf-Exemption `/^(\/v\d+)?\/payment\/webhook\//` (req.path ist unter `app.use("/api/")` um /api gekürzt, /vN bleibt). Plus Währungs-Check im Manipulationsschutz (Blueprint-Härtung). Neuer Integrationstest durch die VOLLE App (createApp+supertest, echte Signatur) schließt die Test-Blindheit. Verify (Container): webhook-stack **2/2**, payment-unit **85/85**, auth+rbac-flows **25/25**.
- **A.2 — OpenAPI Auto-Gen aus Zod + Live-Explorer 2026-06-14 (committet `5d4e67e`)**
  - Beendet den Doku-Drift STRUKTURELL: `openapi/registry.js` generiert OpenAPI 3.0.3 direkt aus den echten Zod-Schemas (13 Components + 10 Kern-Pfade + 3 Security-Schemes), `npm run openapi:generate`, build-time-isoliert (keine Prod-Runtime-Dep, app.js importiert registry NIE). Drift-Guard-Test (deepEqual generiert↔committet, 4 Tests) → Drift unmöglich. `GET /api/openapi/spec.json` serviert die Spec (behebt toten api-docs-Verweis). Live-Explorer `api-explorer.html` (Vanilla-JS, CSP-clean, design-system, interaktiv) + von api-docs.html verlinkt. Zukunftssicher: neue Schemas auto-Component, neue Pfade je 1 registry-Eintrag. Verify: volle Suite 4549/0, Lint 0/0, Restart+Smoke grün.
- **P2.0 Tier-Single-Source 2026-06-13 (`c80b74c`) + P2.5 Cross-Org-Tests Wave 1+2 2026-06-14 (`5de10d7`)** — Tier-Doppelwahrheit (30/250/999 vs 50/150/350) auf kanonische Single Source vereinheitlicht + Drift-Guard; workers+suppliers Cross-Org-403-Regressionstests (11).
- **Cross-Org-Audit + React-XSS + Dependency-Sweep 2026-06-13 (committet `1a72f60`)**
  - **Cross-Org-IDOR gefixt (echte Lücke, Gate C):** `POST/PATCH /requisitions/:id/candidates*` hatten kein `assertOrgOwnership` → Org B konnte Kandidaten an/in Org-A-Requisitions schreiben. Fix + 4 Regressionstests (`coreFlowCrossTenant`). Der 6-Slice-Audit über ~100 org-scoped Schreib-Endpunkte zeigte sonst: Enforcement breit vorhanden, Rest = Test-Coverage-Gap → **P2.5**. integrations-„HOCH-vuln" war False-Positive (Service org-scoped).
  - **React-SPAs (OCC/SCC/SOC) XSS-verifiziert sauber:** 0 `dangerouslySetInnerHTML`/`innerHTML`/`eval`; die 2 dynamischen URL-Params (`returnUrl`, `d.id`) sind `encodeURIComponent`'t. Keine Fixes nötig.
  - **Dependency-Sicherheit:** API-**Produktion 0 Schwachstellen** (`npm audit --omit=dev`); 2 moderate (qs-DoS) nur in Dev/CI-Tooling (Stryker), nicht produktiv erreichbar. Frontend-Prod = statische Assets (kein node_modules ausgeliefert).
- **XSS-Härtung + Frontend-Lint grün 2026-06-13 (committet `ca6a6e7` + `2dc6fea`)**
  - **Security (Gate C, Verbot „kein innerHTML ohne esc()"):** adversarialer 7-Slice-Workflow-Sweep über 39 Frontend-Dateien / 515 `innerHTML`-Sinks. Nach Eigen-Verifikation am echten Code (pageShell-Befunde als False-Positives verworfen): **14 echte Escaping-Lücken in 11 Dateien** geschlossen. Genuin exploitierbar war org-/user-Freitext (Standortname `locLbl`, Invite-Email `referred_email`, Firmenname `role`/`from`, Revenue-Label); Rest Defense-in-Depth (Status-Enum-Badge-Fallbacks, `event.icon`, `r.id`-in-onclick Attribut-Breakout, `document_url`-iframe-src). esc()-Helper in 3 Dateien ergänzt.
  - **CI-Gate-D-Blocker (dabei entdeckt): `frontend-lint:js` war ROT** (9 pre-existing Probleme in nicht-sweep-Dateien) → behoben: stray `_test2.js` (Debug-Scratch) entfernt, `portalShell.js` `/* global PortalApi */`, `cookieConsent.js` leere catch-Blöcke. Ergebnis: „Scanned 91 files, no errors found".
  - Verify: node --check 11/11, frontend lint 0/0, volle Unit-Suite **4512/4512/0**.
- **Welle F1 — Code-Schlussarbeiten 2026-06-12/13 (committet, Commits `9f37250`/`1044343`/`878b022`/`845b6c9`)**
  - **P1-Betriebsblocker gefunden+gefixt (F1.4): `requireMfa`-Identitäts-Precheck kannte die separierte Staff-Session (`staffUserId`) nicht** → 401 auf ALLEN 24 SCC-Mutationen (Step-up/Transition/Approve/…), sobald die Session nicht zufällig auch plattform-eingeloggt war — und das TROTZ `enforce:false` (Audit-Only-Vertrag darf nie blockieren). Fix: `userId || staffUserId` in `requireMfa.js` + 5 Regressions-Tests (`requireMfa.middleware.test.js`). Hätte im Staff-Produktivbetrieb (eigene `tc.staff.sid`-Session) jede Freigabe-Mutation blockiert.
  - F1.1 Prod-Härtung: Container-`resources.limits/reservations`, `FEATURE_GATE_BYPASS:"false"`-Pin in prod.yml, TLS-Pflicht-Banner (nginx+deploy). F1.2 Security: OCC/Staff-Secret via HKDF, `requireScope()` auf Finance/Export verdrahtet (war toter Code seit WAVE_06), Rate-Limit pro API-Key-ID. F1.3 Hygiene: `swallow()`-Helper ersetzt alle stillen `.catch(()=>{})` (0 Rest), companyProfile→`res.locals.audit`, CHANGELOG + RELEASE_PROCESS, Lint 4 Errors+7 Warnings→0/0, 5 Audit-Coverage-Lücken geschlossen.
  - F1.4 Test-Harness (Tests=Spezifikation, Code blieb richtig): CAN-1/FG-5 via org-first-Plan-Auflösung im Harness (`ensureSubscription` setzt Subscription+Org-Plan, FREE→DEMO), workerReview#2 via Re-Login nach Org-Umzug, HTTP-6 Step-up-Passwort, FG-3 bypass-aware. 4 Integrations-Dateien **21/21/0**.
  - Verify: volle Unit-Suite **4508/4508/0**, Lint **0/0**, Audit-Gate **373 exit 0**, Builds **OCC51/SOC29/SCC66 tsc-clean**. Abschlussbericht (Gate Teil 3) im `finalization_worklog.md` (2026-06-13).
- **SaaS-Self-Service-Billing vorbereitet (2026-06-22, feature-flagged AUS, uncommitted = Owner-Gate)**
  - **Recurring + Dunning** als bezahlter Zwilling der Lifecycle-Engine: `recurringBillingService` — `generateRecurringInvoices` (aktive bezahlte Subs, `current_period_end <= NOW` → Folgerechnung via `invoiceService.createInvoice` + Flip `active→past_due`, exakt analog `applyTrialEnds`), `runDunningSweep` (gestaffelte Mahn-Mails Stufe 1/2/3, getrackt über `invoices.dunning_level`/`last_dunning_at`), `applyRenewalPayment` (Zahlungseingang → `active` + Periode +1 Monat). **Reuse** der bestehenden Grace/Hard-Lock-Mechanik (`applyHardLocks`: unbezahlt nach 14 d → `canceled` + Org DEMO) — KEINE Parallelstruktur.
  - **Tier-2-Env-Flags** `RECURRING_BILLING_ENABLED`/`DUNNING_ENABLED` (Default AUS). `/internal/recurring-billing` + `/internal/dunning-sweep` (cronRateLimit + checkCronAuth, secret/IP-gated) sind **No-Ops** solange die Flags aus sind → „kein Auto-Billing, solange manuelle Rechnung Default ist". Mig **142** (`invoices.dunning_level`/`last_dunning_at` + Partial-Index `invoices_dunning_overdue_idx`). `dunningEmail`-Template (Stufen 1–3) in `emailHtmlTemplates.js`.
  - Tests: `recurringBilling.test.js` **16/16** (Preis-Auflösung Katalog + INDIVIDUELL-Vertragspreis, Idempotenz-Guard, Self-Healing-Revert bei Rechnungsfehler, Dunning-Stufenlogik, Flag-OFF-No-Op, Flag-ON-Service-Aufruf).
  - **Aktivierung bei UG-Gründung (verzahnt mit R1/R2):** (1) Flags setzen, (2) beide Crons im Scheduler verdrahten (wie bestehende `/internal/*`-Crons), (3) `applyRenewalPayment` an den Zahlungs-Bestätigungspfad hängen (Staff „bezahlt" heute / Stripe `invoice.paid`-Webhook nach Gründung). Bis dahin: Rechnung manuell durch Staff (unverändert).
- **Phase-5-Finalisierung 2026-06-03 (10-300-Kunden-Härtung, alle Diffs uncommitted = Owner-Gate)**
  - **Provider-Abstraktion Billing (Phase D):** `billingProviderService` (stripe/manual/disabled, manual-first), `BILLING_PROVIDER`-Env, Webhook-Dispatch über `mapStripeEvent`, `payment_failed`→Observability (kein Auto-Cancel), SCC-Billing-Sicht + Inkasso-Worklist. Tests: billingProviderService 26/26, payment.route 32/32, staffBillingOverview 8/8.
  - **Provider-Abstraktion Email (Phase E):** `emailProviderService` (console/smtp/sendgrid/disabled, KEINE neue Dependency, SendGrid via SMTP-Relay), `emailService` provider-fähig (Default-Pfad byte-identisch), `EMAIL_PROVIDER`/`SENDGRID_API_KEY`-Env, System-Health + SCC-Mail-Sicht. Tests: emailProviderService 21/21, systemHealth 17/17, staffMailCenter 10/10.
  - **Incident-Modell (R6, Owner-freigegeben):** Mig **121** `ops_incidents` + `staffIncidentService` (read-only Aggregat + open/ack/resolve mit strengen Übergängen via SELECT…FOR UPDATE) + 5 SCC-Routen (requireStaff·mfaGuard·requireStepUp·requireConfirmAndReason·Audit) + Signals-Feed (§6.2) + React-Modul. Tests: staffIncidents 25/25.
  - **Skalierungs-Index-Härtung (Phase Q):** Mig **122** (5 Cron-Sweep-Partial-Indizes) + Mig **123** (BRIN `product_analytics_events(occurred_at)`). ALLE ~20 Sweeps in internal.js gegen „wächst unbegrenzt?"-Diskriminator geprüft, jede Lücke gegen Quell-Migration verifiziert. DB-gated Index-Test `scaling-indexes.flow.test.js`.
  - **N+1-Write-Sweep:** `searchSlaScan`/`demandSlaScan`/`productReleaseService.markAllSeenForUser` auf set-based UPDATE + Bulk-UNNEST (verhaltensgleich). `createStaffingCampaignInternal` (INPUT-skaliert + withTransaction/RETURNING/per-Row-Audit) bewusst owner-gated. Tests: slaSearchService 4/4, marketplaceService grün.
  - **N+1-Read-Sweep:** `GET /support/lookup/orgs` (bis 100 Round-Trips/Request) → EINE windowed Query `loadRecentOpenCasesByOrg` (ROW_NUMBER PARTITION BY, ANY($1::uuid[])). Gesamter routes/+services/-Sweep sonst sauber. Tests: support.recentCasesByOrg 6/6 (Anti-N+1-Zählung) + DB-gated SQL-Smoke.
  - **Theme-System (Phase J):** `ultra_premium` + Registry + Tier-2-Flags (`THEME_SWITCHER_ENABLED`/`ULTRA_PREMIUM_THEME_ENABLED`) → /bootstrap → SCC-Topbar-Cycle. envValidator Fail-Fast. Tests: themeRegistry 9/9, themeFlags.config 4/4, envValidator 18/18.
  - **Restore-Drill-Fidelity (Phase P, R8):** `restore-test.sh` += `--single-transaction --exit-on-error` (False-Confidence behoben). `infrastructureSnapshotService.test.js` 36/36 (Backup-Staleness-Schwellen gepinnt).
  - **Verbleibend (alle Owner-gated/extern):** echte Stripe-Keys/Price-IDs (R2) + Lifecycle-Reaktivierung (R1), echte SendGrid-Keys (R3), platform/worker_portal-Theme-Injektion + Theme-Control-Modul (R4), Auto-Alert-Notify-Hook (R6), echter Restore-Drill gegen Infra (R8), finale Preise/Rechtstexte (R9), Flag-Konsolidierung (R10), AI-Unsafe-Classifier (R7 Hälfte B, erst bei AI-Code). Laut `99_GOLIVE_GATE.md` Teil 4 erklärt der **Owner** „fertig".
- **Finalisierungswelle 2026-05-28 (Enterprise Pack + WAVE_08-15)**
  - Enterprise Pack 1.0.0 komplett (8 Dateien in `docs/enterprise_pack/`): SECURITY_OVERVIEW, TENANT_ISOLATION_TESTS, OBSERVABILITY_OVERVIEW, CSRF_RATE_LIMIT_COVERAGE, BACKUP_RESTORE_TEST (Template), SLA_OPERATIONAL_COVERAGE, VERSION, GAPS
  - WAVE_08: Referral + Credits Cross-Tenant — 12/12 Tests gruen (`wave08CrossTenant.test.js`)
  - WAVE_09: Billing Lifecycle Trial-End + Grace + Hard-Lock — Migration 119, `applyTrialEnds()` + `applyHardLocks()`, 9 Tests gruen
  - WAVE_10: Empty-State-Audit SCC — alle 15 Module haben professionelle Empty States
  - WAVE_12/13: CI `scc-build` Job; `occ-build` Fix; Observability (Sentry, Prometheus, Pino) bestaetigt
  - WAVE_14: Legal Docs — `docs/TOMS.md`, `docs/SUBPROCESSORS.md`, `docs/AVV_TEMPLATE.md`
  - WAVE_15: `sql/seeds/demo-sales.sql`, `docs/SALES_DEMO_PATH.md`
  - F-02 SSO Break-Glass: `auth.js` — enforce_sso nur wenn `getSSOMode() === "saml"`, Passwort als Break-Glass
  - F-01 Coming-Soon-Guard: `subscriptionRequestService.js` ADDON_NOT_AVAILABLE (400); 47/47 Tests gruen
  - E-02 Spend Analytics Scope-Display: Backend `scope:{}` + `generated_at`; Frontend `renderScopeBar()`
  - Worker-Profil noindex (DSGVO): `worker-profile-public.html` `noindex, nofollow` + footer.js Mount-Point
  - `frontend/robots.txt` erstellt (Docker-Mount `./frontend` → `/robots.txt` via Nginx catch-all)
  - `docs/NOINDEX_DECISIONS.md` — alle Surfaces dokumentiert
  - Finance Export / API-Key default-deny / Vendor Tier Audit — alle bestaetigt gruen
  - Enterprise Readiness Score ~88%. Verbleibende Blocker = Owner-Tasks (P0.4, E-01, I-01, G-01, G-COM-03)
- **Welle 7 Pilot-Haertung (April 2026)**
  - Phase 12: AbortController + `ApiError(code=ABORTED|NETWORK_TRANSIENT)` im `workerSubmissionsReview.js` – kein `ERR_NETWORK_CHANGED`-Sturm mehr bei schnellen Tab-Wechseln auf `worker-submissions-review.html`
  - Phase 0+1: Hub-Card `Einsaetze & Zeiten` wird fuer `org_type=company` zu "Einsatzverfolgung / Begleitsicht" umetikettiert; `worker-submissions-review.html` zeigt fuer Unternehmen eine Read-only-Informationskachel statt des Agency-Reviews
  - Phase 3+4: `GET /api/closed-deal-assignments` + `listClosedDealAssignments` + `#closedDealAsgnSection` im Einsaetze-Tab – abgeschlossene/vollbesetzte/stornierte Deals bleiben fuer Agenturen hart sichtbar
  - Phase 2+5: `workerService.assignCapacityToWorker` schaltet Multi-Headcount-Kapazitaeten nur bei tatsaechlich vollem Headcount auf `filled`; Teilbesetzungen bleiben aktiv
  - Phase 10+11: Einsaetze-Tab bekommt Archiv-Sub-Filter; `assignmentLifecycleState` ist Europe/Berlin-timezone-safe
  - Phase 6+7+8: Aggregator `GET /api/marketplace/offers/:id/staffing-context` + `POST /api/marketplace/offers/:id/quick-assign-to-deal`; neuer `#od-staffing-block` in `offer_detail.html` mit One-click-Bulk-Zuweisung + Fast-Track-Deep-Link (manuelle Zuweisung unveraendert)
  - Phase 9: `cancelAgreement` dreht `assignments/reservations/invites` zurueck; `AGREEMENT_TRANSITIONS.activated=["cancelled"]` freigeschaltet
  - Tests: `api/test/welle7DealStaffingHardening.test.js` (4 gruen), `dealAgreement.test.js` + `hubVisibility.test.js` + `hubVisibilityIntegration.test.js` weiterhin vollstaendig gruen
## Pflege-Regeln (fuer Agenten und Menschen)
- Jeder neue echte Blocker, der in einer Session entdeckt wird, wird hier als P0/P1/P2 eingetragen, BEVOR die Antwort abgeschlossen wird.
- Aktion + Aufwand + Verify-Schritt sind Pflicht bei jedem Eintrag - kein "siehe Chat".
- Erledigte Punkte wandern in `## Done` mit Datum und Kurzbeleg (Commit-Hash, Test-Name oder Artefakt).
- Aenderungen am File brauchen keinen Commit in der Session, nur das Datei-Update.
