# Welle U — Standorte, Rollen, und wer welches Profil sieht

> **Status: Bauanweisung.** Erstellt 2026-09-14 aus dem Owner-Dokument (Abschnitte 11 und 24).
> **Gebaut von der bauenden Sitzung, gegengeprüft von der planenden** — siehe
> [`../UEBERGABE.md`](../UEBERGABE.md), Abschnitt „Wer baut, wer prüft".

---

## 1. Die Owner-Vorgabe

- **Abschnitt 11:** Organisations- und Standortstrukturen, rollenbasierter Zugriff, Mandantenfähigkeit
  bis zur Finalisierung. *„Was darf welche Rolle auf welcher Seite? Kann der Admin der jeweiligen
  Firma das überwachen, steuern, anpassen und verwalten?"*
- **Abschnitt 24:** *„Sollten Unternehmensprofile für Zeitarbeitsfirmen und andersrum einsehbar
  sein? Worker-Profile nur DSGVO-konform, aber hart abgesichert."*

> **Abgrenzung:** „Das Team ist eine Person" gilt für TempConnect selbst. **Kunden** haben mehrere
> Menschen — dort ist Rollenverwaltung durch den Firmen-Admin genau richtig.

---

## 2. Ist-Stand (gemessen 2026-09-14 — U0 vertieft das)

| Baustein | Stand |
|---|---|
| Mitgliedschaften und Rollen | `org_memberships.role_key`, Einladungen mit Rolle (Mig 129), HR-Attribute (Mig 144) |
| Standorte | Mehrstandort-Spalten (Mig 112). **Korrigiert 2026-09-20 durch die bauende Sitzung:** `location_id` wird in **11** Routendateien angenommen, die Prüfung `assertLocationBelongsToOrg` liegt in **6 Diensten** — Rate Cards, Bedarfe, Lieferantenpool und Organisationen sind darüber abgesichert, `me.js` prüft inline (`WHERE id=$1 AND org_id=$2`). Meine erste Zahl (4 Routendateien) zählte die Aufrufer der Prüfung, nicht die abgesicherten Wege |
| Unternehmens-Provisionierung | `api/routes/scim.js` |
| Org-Kontext | `middleware/orgContext.js` — Rückfall auf die primäre Mitgliedschaft, nie leer (C-11) |
| Profilseiten | `company_profile_public.html`, `worker-profile-public.html`, `sla_profil.html` |
| Audit je Firma | Welle I (8.1.1): Firmen sehen nur das eigene Audit |

**Gefunden am 2026-09-20 (bauende Sitzung), noch nicht abschließend gemessen:**

> **`rbacService.addMember` und `updateMemberScope` schreiben `location_id` und `department_id`
> nach `org_memberships`, ohne zu prüfen, dass der Standort dieser Organisation gehört.**
> Erreichbar über `POST /organizations/:id/members` und den Scope-Weg. Ein Org-Admin könnte
> seinem Mitglied damit einen **fremden** Standort eintragen.
>
> Was daraus folgt, hängt an drei Fragen, die vor jeder Änderung zu messen sind: greift ein
> Fremdschlüssel? Wie wird `req.locationId` daraus aufgelöst? Und was tun die standortgebundenen
> Abfragen mit einem fremden Wert — filtern sie ins Leere oder liefern sie fremde Daten?
> **Erst die Antwort entscheidet, ob das ein Sicherheitsbefund oder eine Unsauberkeit ist.**
> Die Prüfung gehört in beide Schreibwege, nicht in die Routen.

---

## 3. Entscheidungen (in dieser Welle getroffen, nicht zurückgespielt)

| Frage | Entscheidung | Warum |
|---|---|---|
| Firmenprofile gegenseitig sichtbar? | **Ja, für angemeldete Plattformmitglieder.** Öffentlich im Netz nur, was die Firma selbst freigibt | Geschäftsdaten einer Firma sind kein Geheimnis; ohne Profil kein Vertrauen vor dem Abschluss |
| Worker-Profile? | **Pseudonym bis zum Abschluss:** Skills, Erfahrung, Region, Verfügbarkeit, Zuverlässigkeitsstufe (Welle Q). **Kein** Nachname, keine Kontaktdaten, kein Geburtsdatum; Foto nur mit Einwilligung | Datenminimierung — der Käufer braucht die Identität erst für den Einsatz |
| Identität nach Abschluss? | Nur an den **Käufer dieses Einsatzes**, nur die für den Einsatz nötigen Angaben | Zweckbindung |
| Rechte-Übersicht? | **Aus der zentralen Rechte-Registratur erzeugt**, nie von Hand gepflegt | Eine gepflegte Tabelle lügt nach dem ersten Umbau |
| Zusammengesetzte Fremdschlüssel `(id, org_id)` jetzt oder später? | **Jetzt** (Owner 2026-10-01) | Alle 13 Beziehungen sind auf verletzende Zeilen geprüft: überall **0**, nur eine überhaupt belegt. Es gibt nichts zu bereinigen — heute risikofrei, mit jedem Kunden teurer |
| Darf eine Konditionskarte auf eine fremde Organisation zeigen? | **Beantwortet (Owner 2026-10-01): nur auf Firmen aus dem EIGENEN Lieferantenpool.** Der frühere Zwischenstand ist damit überholt | Der Zwischenstand nimmt keine Fähigkeit weg, die heute jemand nutzt, und schließt den offenen Rand. Die Regel selbst („nur aus dem eigenen Lieferantenpool"?) bleibt beim Owner |

---


## 4. Wellen und Phasen

### U0 · Messen

| Phase | Inhalt | Nachweis |
|---|---|---|
| U0.1 | Welche Rollen gibt es, welche Rechte trägt jede, wo werden sie geprüft | Tabelle mit Fundstellen |
| U0.2 | **Routen, die `location_id` annehmen** — und ob sie die Zugehörigkeit prüfen | ✅ **2026-09-20 gemessen, drei Lücken geschlossen.** Gemessen wurde am **Verhalten**, nicht am Quelltext: alle **967** Wege bekamen einen fremden Standort in Körper, Abfrage und Pfad, ein Spion schrieb jede Datenbankabfrage mit. **24** Wege fassen einen Standort an; **298** weisen vor der ersten Abfrage ab (über die sagt der Durchlauf nichts — deshalb die Dienste zusätzlich einzeln). **Befunde:** `PUT /organizations/:id/departments/:deptId` und `POST /organizations/:id/members` schrieben einen fremden Standort ungeprüft, `updateMemberScope` ebenso (die Route prüfte, der Dienst nicht — zweite Tür). Geschlossen in `organizationService.updateDepartment`, `rbacService.addMember`, `rbacService.updateMemberScope`. **8 Rückmutationen, alle rot** |
| U0.3 | Wo verwaltet ein Firmen-Admin heute Mitglieder und Rollen — Seite, Endpunkte, Klickpfad | Befund, bevor etwas gebaut wird |

### U1 · Der Firmen-Admin verwaltet sein Team

| Phase | Inhalt | Nachweis |
|---|---|---|
| U1.1 | Einladen, Rolle ändern, entfernen — auf **einer** Seite, erreichbar | Klickpfad; Erreichbarkeits-Wächter |
| U1.2 | **Keine Rechteausweitung:** niemand vergibt eine Rolle über der eigenen | Versuch → 403. Rückmutation |
| U1.3 | **Der letzte Admin kann sich nicht entfernen** | Versuch → abgelehnt mit Begründung |
| U1.4 | Jede Rollenänderung im **Firmen**-Audit (wer, was, vorher/nachher) | Audit-Zeile belegt; fremde Firma sieht sie nie |

### U2 · Standorte

| Phase | Inhalt | Nachweis |
|---|---|---|
| U2.0 | **Alle Standorte zuerst** *(Owner-Vorgabe 2026-09-20)*: wer mehrere Standorte hat, trägt sie **vorab vollständig** ein — bevor Mitarbeiter, Bedarfe oder Einsätze einem Standort zugeordnet werden. Ein geführter Schritt bei der Einrichtung (Name, Anschrift, optional Kostenstelle), Liste mit „noch einen hinzufügen", und erst danach die standortgebundenen Flächen | Ohne mindestens einen Standort fragt die Plattform danach, statt still org-weit zu arbeiten |
| U2.0b | **Nachträglich bleibt möglich, aber sichtbar:** ein später angelegter Standort erscheint in der Einrichtungsliste mit Datum — niemand muss raten, warum alte Einsätze keinen Standort tragen | Neuer Standort → bestehende Daten bleiben unberührt und unzugeordnet, nicht stillschweigend zugeordnet |
| U2.0c | **Einer genügt für den Einstieg:** wer nur einen Standort hat, sieht den Schritt als einzelne vorbelegte Zeile und klickt weiter — die Mehrstandort-Führung darf den einfachen Fall nicht verteuern | Einzelstandort-Firma: ein Klick, keine zusätzliche Pflege |
| U2.1 | Standorte anlegen, umbenennen, archivieren (nie löschen, wenn Einsätze daran hängen) | Archivierter Standort bleibt in Historie lesbar |
| U2.2 | **Standortrolle:** eine Standortleitung sieht nur ihren Standort; org-weite Flächen sind für sie `hidden_location_scope` | Fremder Standort → 403 |
| U2.3 | Drilldowns tragen `location_id` weiter (Pfeiler 7) | Wächter über alle Drilldown-Links |
| U2.4 | **Entdeckender Wächter:** jede Route, die `location_id` liest, prüft die Zugehörigkeit | ✅ **2026-09-20** — `api/test/standortGrenze.test.js`. Drei Teile: (A) der Durchlauf über alle Wege, der über die **erste Abfrage mit dem fremden Standort** urteilt — schreibend heißt ungeprüft geschrieben, lesend ohne die eigene Org heißt ungebunden; (B) jeder Schreibweg **direkt am Dienst**, fail-closed und mit Gegenprobe (ein eigener Standort darf nicht werfen); (C) die **Wirkung**: eine Mitgliedschaft mit fremdem Standort löst sich nicht auf und fällt auf `locationScope: 'org'` zurück — **gebunden wird still org-weit**. Eine neue Route ohne Prüfung fällt in (A) auf |

### U3 · „Wer darf was" — sichtbar für den Firmen-Admin

| Phase | Inhalt | Nachweis |
|---|---|---|
| U3.1 | Rechte-Matrix als Seite, **erzeugt** aus der Registratur | Matrix = durchgesetzte Rechte; Abweichung → rot |
| U3.2 | Rollenbeschreibung in Klartext je Rolle | Keine Rolle ohne Beschreibung |

### U4 · Ein Mensch, mehrere Firmen

| Phase | Inhalt | Nachweis |
|---|---|---|
| U4.1 | Firmenwechsel für Personen mit mehreren Mitgliedschaften (Holding, Dienstleister für mehrere Standorte) | Wechsel ändert jede Anzeige; kein Datenrest der vorigen Firma |
| U4.2 | C-11 bleibt: ein fremder Org-Wunsch führt nie zu leerem Kontext | Bestehender Sicherheitstest bleibt grün |

### U5 · Profile

| Phase | Inhalt | Nachweis |
|---|---|---|
| U5.1 | Firmenprofil für angemeldete Mitglieder; öffentliche Freigabe als Schalter der Firma | Abgemeldet → nur Freigegebenes |
| U5.2 | **Worker-Profil über Positivliste** (wie H1 `getCompanyLiveWorkforce`) — die nächste Spalte landet nie von selbst beim Kunden | Neue Spalte im SELECT → nicht in der Antwort |
| U5.3 | **Sperrliste wirkt auf das Profil** (N4): gesperrte Kraft ist für diesen Kunden nicht aufrufbar, auch nicht per Direktlink | Direktlink → 404, nicht 403 (kein Existenzhinweis) |
| U5.4 | **Teilen-Link:** Ablaufdatum, dieselbe Sichtbarkeitsbedingung wie die Liste (Befund M4.13) | Link nach Ablauf oder nach Sperre → nicht mehr lesbar |
| U5.5 | Identität nach Abschluss nur an den Käufer dieses Einsatzes | Anderer Kunde → pseudonym |

### U6 · Die Grenze **erzwingen**, nicht nur prüfen *(Owner-Freigabe 2026-10-01)*

> **Owner, 2026-10-01:** *„kannst du 9 und 10 für K1 als Arbeitsaufforderung schreiben?"* — bezogen
> auf die Punkte 9 und 10 der Sammelliste in [`../UEBERGABE.md`](../UEBERGABE.md), Abschnitt „Was
> auf dem Owner liegt". **Das ist die Freigabe für genau das, was dort als Empfehlung stand** —
> nicht mehr. Wo die Empfehlung einen *Zwischenstand* vorsah, ist der Zwischenstand freigegeben
> und die Regel dahinter weiter offen (U6.2).

**Warum diese Phase anders ist als U0–U5.** Alles davor prüft im **Code**: ein Dienst fragt, ob
ein Standort zur Organisation gehört, und weist ab. Das ist richtig und bleibt — aber es ist
**eine** Verteidigungslinie, und sie reißt genau dort, wo jemand einen Riegel vergisst. U0.2b hat
zwei solche Stellen gefunden, U0.2 hatte sie nicht gesehen, weil ihre Liste `updateRequisition`
nicht führte. **Die Lehre ist nicht „sorgfältiger auflisten", sondern „die Datenbank mitnehmen":**
ein zusammengesetzter Fremdschlüssel kann nicht vergessen werden.

| Phase | Inhalt | Nachweis |
|---|---|---|
| **U6.0** | **Die Messung wiederholen, unmittelbar vor der Migration.** Die 13 Beziehungen in 7 Tabellen erneut auf verletzende Zeilen prüfen — die Null von vorgestern ist keine Null von heute, und zwischen Messung und Migration liegen Commits und Testläufe, die Daten anlegen | Zahl mit Datum im Commit. **Bei einem einzigen Verstoß: anhalten und melden**, nicht bereinigen — eine org-fremde Verknüpfung ist ein Befund, keine Altlast |
| **U6.1** | **Zusammengesetzte Fremdschlüssel `(id, org_id)`** statt `(id)`. Zuerst die **zwei fehlenden `UNIQUE (id, org_id)`** anlegen — ohne sie kann kein zusammengesetzter Schlüssel darauf zeigen. Dann je Tabelle einzeln umstellen, nicht in einem Block | **Die Probe muss die DATENBANK prüfen, nicht den Code** — sonst beweist sie die zweite Linie nicht: ein Einfügeversuch mit org-fremder Kennung muss von Postgres abgewiesen werden. **Rückmutation:** einen Schlüssel auf `(id)` zurückstellen → rot. Dazu eine **datenbankfreie** Form-Probe auf den Migrationstext, damit im Tor nicht alles überspringt |
| **U6.2** | **Die Pool-Regel** *(Owner-Entscheid 2026-10-01: „die Regel darf nur auf Firmen aus dem eigenen Pool zeigen")*. Damit ist der frühere Zwischenstand (im Ändern-Pfad zurückweisen) **überholt**; gebaut wird die Regel selbst, in **beiden** Pfaden — `createRateCard` **und** `updateRateCard`, der **fünfte** Fall des Paar-Musters. **Im Code, nicht im Schema** (Begründung unten). **„Im Pool" heißt — **vom Owner am 2026-10-01 bestätigt** — aktiver Status UND innerhalb des Gültigkeitsfensters zum Zeitpunkt des Schreibens** — `vendor_pool` trägt `status` und `tier` (beide `NOT NULL`) sowie `valid_from`/`valid_until`; welche `status`-Werte „aktiv" bedeuten, wird **gemessen, nicht am Namen geraten** | **Fail-closed** (fehlt die Organisation: abweisen, nicht überspringen) und **Fehlerobjekt** statt `OrgBoundaryError`, sonst endet es als 500. **Die Probe stellt ihren Gegenstand zuerst her:** bei **0** Poolzeilen ist „wird abgewiesen, weil nicht im Pool" leer grün — ein Lieferant, der **wirklich** im Pool steht, muss **durchkommen**. **Rückmutationen, die rot werden müssen:** Statusbedingung entfernen · Gültigkeitsfenster entfernen · `client_org_id` gegen `supplier_org_id` tauschen |
| **U6.2a** | **Bestandsschutz — die Regel gilt für Schreibvorgänge, nicht rückwirkend.** Gemessen 2026-10-01: **4** Konditionskarten, **1** mit Lieferant, **0** Poolzeilen. Die eine Karte verletzt die neue Regel ab Sekunde eins. Sie wird **nicht** migriert, **nicht** geleert, **nicht** rückwirkend geprüft — sie bekommt einen **sichtbaren Hinweis** („Lieferant steht nicht im Pool") | Eine Regel, die beim Einschalten bestehende Daten entwertet, ist derselbe Tausch, vor dem die Spaltenauswahl in U6.1 die Migration bewahrt hat. Probe: eine Altkarte bleibt lesbar und änderbar **in allen anderen Feldern** |
| **U6.2b** | **Entfernen aus dem Pool: Wirkungsvorschau statt Sperre** *(von der planenden Sitzung vorgeschlagen, **vom Owner am 2026-10-01 bestätigt**: „passt so“)*. Das Entfernen wird **nicht blockiert**, zeigt aber vorher seine Folge: *„3 Konditionskarten verweisen auf diesen Lieferanten."* | Blockieren macht Pool-Pflege unmöglich, stilles Zulassen erzeugt genau die hängenden Verweise, die U6 schließt. **Wirkungsvorschau vor der Handlung** ist die Hausregel (`CLAUDE.md`, Abschnitt zum Bounty-Eingriff) und passt hier wörtlich |

> **Warum die Datenbank diese Regel NICHT halten kann — gemessen, damit niemand es versucht.**
> Nach U6.1 läge ein zusammengesetzter Schlüssel nahe: `rate_cards(supplier_org_id, org_id)` →
> `vendor_pool(supplier_org_id, client_org_id)`. **Es gibt dort kein passendes `UNIQUE`.** Der
> einzige lautet `UNIQUE (client_org_id, supplier_org_id, category, location_id, department_id)` —
> fünf Spalten, zwei davon nullbar. **Ein Lieferant darf mehrfach im Pool einer Firma stehen**
> (je Kategorie, Standort, Abteilung). Ein `UNIQUE (client_org_id, supplier_org_id)` nachzurüsten
> wäre deshalb **kein Fortschritt, sondern ein Fehler**: es verböte die legitime
> Mehrfachzugehörigkeit.
>
> Das ist dieselbe Falle wie die `ALLOWED_TABLES`-Empfehlung einen Tag zuvor: **ein Muster, das
> gerade gut funktioniert hat, passt nicht automatisch auf den nächsten Fall.** Hier wird im Code
> erzwungen — mit Rückmutation, weil ein Riegel im Code vergessen werden kann und einer im Schema
> nicht.
| **U6.3** | **`contract_id` prüfen — in BEIDEN Pfaden.** `assertOrgOwnership(pool, "contracts", data.contract_id, orgId)`, fail-closed davor (`if (!orgId) throw`). **Korrektur 2026-10-01:** die planende Sitzung hatte hier `assertOrgOwnership` empfohlen, weil `contracts` in `ALLOWED_TABLES` steht — **das war falsch.** `contracts` hat **kein** `org_id`, sondern `buyer_org_id` und `supplier_org_id`; die generische Prüfung hätte `SELECT org_id FROM contracts` abgesetzt und aus einem 403 einen **500** gemacht. Gebaut ist `assertContractBelongsToOrg` mit **beiden** Seiten, nach dem Muster, das in `routes/contracts.js` fürs Lesen schon stand. Gemessen vorher: 4 Konditionskarten, **0** mit Vertragsbezug — der Riegel ist vorbeugend; **`createRateCard` ist genauso offen wie `updateRateCard`** — der dritte Fall desselben Paar-Musters in einer Datei | Rückmutation **je Pfad** (Anlegen und Ändern getrennt). Plus Zwillingszusicherung: eine gültige **eigene** Vertragskennung kommt durch |
| **U6.5** | **Der Stundenzettel lässt sich auf einen fremden Einsatz umhängen** *(gefunden 2026-10-01 als Nebenertrag von U6.4, gegengeprüft von der planenden Sitzung)*. `PATCH /timesheets/:id` prüft mit `checkOrgBoundary(ts, req.orgId)`, dass **der Stundenzettel** der eigenen Organisation gehört — und ruft dann `updateTimesheet(pool, id, data, actorId)` **ohne Organisation** auf. Die `allowed`-Liste führt `assignment_id`, `updateSchema` nimmt es nicht aus, und die Abfrage lautet `UPDATE timesheets SET … WHERE id = $1` **ohne `org_id`**. Der Dienst *könnte* den neuen Einsatz also nicht einmal prüfen. **Stundenzettel sind Abrechnungsgrundlage.** Einzige Bremse heute: nur `status='draft'` ist änderbar — also genau der Zustand, in dem man es täte, bevor man einreicht | **Die vorhandene Prüfung herausziehen, nicht kopieren:** `createTimesheet` prüft `assignment_id` schon gegen **beide** Seiten des Einsatzes (`org_id` **oder** `supplier_org_id`) — ein Stundenzettel darf zu einem Einsatz gehören, in dem die eigene Firma Lieferant ist. Als `pruefeEinsatzVerweis` gemeinsam nutzen. **Zwei Besonderheiten:** der Dienst gibt **Fehlerobjekte** zurück (`{ error: … }`), ein `OrgBoundaryError` wäre hier die Abweichung und endete als 500; und die alte Bedingung `if (data.org_id && …)` ließ die Prüfung bei fehlender `org_id` **ganz aus** — das wird **fail-closed**. **Rückmutation:** Riegel entfernen → rot; Prüfung auf nur eine Seite verengen → **muss ebenfalls rot werden** (siehe unten) |
| **U6.4** | **Erst messen, dann entscheiden:** ein Wächter, der in jeder `allowed`-Liste eines Schreibdienstes die Felder auf `*_id` gegen einen vorhandenen Riegel hält. Dreimal dasselbe Muster in einer Datei legt nahe, dass es öfter vorkommt | **Zuerst die Zahl der nötigen Ausnahmen messen und melden — nicht bauen.** Ein Wächter, dessen Ausnahmeliste länger ist als sein Ertrag, ist eine Ausrede mit Zahlen (so entschieden bei „123 von 967" und beim Pfadverweis-Wächter) |
| **U6.6** | **Die CHECK-Listen in die Momentaufnahme.** `vendor_pool.status` und `.tier` (und künftig weitere) nach `test/fixtures/schema.json`, als eigener Abschnitt wie `fremdschluessel`. **Das ist kein Komfort:** die Probe, die die **erlaubten** Werte gegen die Mengen hält, welche die Pool-Regel benennt, ist heute **datenbankgebunden** — und damit im Host-Tor **keine Zusicherung**, sie läuft nur im Abbild-Lauf. Genau dort entscheidet sich aber, ob jemand einen Status hinzufügen kann, **ohne zu sagen, auf welche Seite er gehört** | Erzeuger, Fingerabdruck-Wächter und die Prüfungen darüber wie beim Abschnitt `fremdschluessel`. **Zwei Vorgaben aus eigener Erfahrung:** die Listen **sortiert** ablegen, sonst erzeugt jede Neugenerierung einen Diff ohne Inhalt — und die Momentaufnahme **vor** dem Tor erzeugen, nicht danach; in U6.1 hat die umgekehrte Reihenfolge einen roten Test gekostet. **Rückmutation:** einen Wert aus der abgelegten Liste entfernen → rot; einen Wert erfinden, den die Datenbank nicht kennt → rot |
| **U6.7** | **Die vordatierte Partnerschaft** *(Owner-Freigabe 2026-10-01, Punkt 11 der Sammelliste)*. Der Partner-Riegel in `assignmentService` prüft `valid_until`, aber **nicht `valid_from`** — ein auf die Zukunft datierter Pooleintrag zählt dort heute schon als Partnerschaft. Der Dienst ruft künftig die gemeinsame Fassung (`poolMitgliedschaftSql`), statt eine eigene zu führen. Gemessen vor der Freigabe: `vendor_pool` ist **leer** — **0** betroffene Firmen, die Verschärfung kostet heute keine einzige Abweisung | **Die Probe, die den IST-Zustand festnagelt, wird rot und muss umgedreht werden** — sie kündigt das in ihrem eigenen Fehlertext an, also ist das kein Unfall, sondern der geplante Weg. **Rückmutation:** `valid_from` wieder herausnehmen → rot. Und die fünfte Fassung der Regel verschwindet damit; der Paar-Wächter aus U6.2 muss danach **weniger** Ausnahmen führen, nicht mehr — das ist die Gegenprobe darauf, dass wirklich zusammengeführt und nicht nur ergänzt wurde |

**Reihenfolge innerhalb von U6: U6.3 → U6.4 (messen) → U6.5 → U6.0 → U6.1 → U6.2 → U6.6 → U6.7.**

> **U6.5 vor U6.0/U6.1 (planende Sitzung 2026-10-01).** U6.1 baut eine **vorbeugende** zweite
> Verteidigungslinie; U6.5 schließt eine **heute offene** Grenze auf **Abrechnungsdaten**, die ein
> gewöhnlich angemeldeter Nutzer erreicht. Offen schlägt vorbeugend. U6.4 steht davor, weil der
> Befund U6.5 überhaupt erst aus dieser Messung kam.

> **U6.3 zuerst**, weil es klein ist, ein vorhandenes Muster benutzt und eine offene Grenze in
> **beiden** Pfaden schließt. **U6.0 unmittelbar vor U6.1**, nie früher. **U6.2 nach der
> Migration**, weil es dieselbe Datei berührt wie U6.3 und zwei Eingriffe in eine Datei besser
> hintereinander als verschränkt laufen. **U6.4 zuletzt und nur als Messung.**

**Rücknahme.** Jede Migration dieser Phase trägt ihren `DROP CONSTRAINT`/`DROP INDEX` im Kopf.
Der zusammengesetzte Schlüssel ist rücknehmbar, solange keine Daten darauf gebaut wurden — und das
tut niemand, weil er nur verbietet. **Nach U6.1 muss der Frisch-Installationslauf grün bleiben**
(seit 2026-09-28 möglich): eine Migration, die auf der laufenden Datenbank greift und ab null
scheitert, ist nicht fertig.
---


### U6.2b · gebaut 2026-10-01 — und die Vorschau sagt mehr, als der Plan verlangt hat

Der Plan nannte als Beispielsatz *„3 Konditionskarten verweisen auf diesen Lieferanten."* Vor dem
Bauen habe ich gemessen, **wer die Poolzugehörigkeit überhaupt als Bedingung liest** — und **vier**
Stellen gefunden statt einer. Eine Vorschau, die nur die erste nennt, ist nicht unvollständig: sie
ist **genauer falsch als keine**, weil sie den Handelnden glauben lässt, er kenne die Folge.

| Stelle | Was das Entfernen dort bewirkt |
|---|---|
| `rateCardService.createRateCard` | eine **neue** Konditionskarte für ihn ist nicht mehr anlegbar |
| `rateCardService.updateRateCard` | eine bestehende Karte lässt sich nicht mehr **auf ihn umhängen** |
| `assignmentService` (Partner-Riegel) | **nur wenn** kein aktiver Rahmenvertrag und kein Einsatz aus einem Abschluss da ist: **keine neuen Einsätze** mehr |
| `supplierPoolService.getEligibleSuppliers` | laufende Verteilstufen auf seine Stufe erreichen ihn nicht mehr — **und umgekehrt** wird er in **offenen** Runden erst dadurch **sichtbar** |

**Der erste Entwurf meiner Vorschau war eine glaubwürdige Lüge.** Er lautete: „die Karten lassen
sich nach dem Entfernen nicht mehr ändern." Gemessen ist das falsch — `updateRateCard` prüft den
Pool **nur**, wenn `supplier_org_id` mitgeschickt wird, und `findApplicableRateCard` fragt ihn
**nie**. Bestehende Karten gelten weiter und werden weiter angewandt. Der Satz war plausibel, in
sich stimmig und falsch; genau die Sorte Aussage, die eine Wirkungsvorschau wertlos macht. Er steht
jetzt als Zusicherung fest (`bestehende_karten_gelten_weiter`).

**Es gab kein „vorher", in das eine Vorschau gepasst hätte.** `suspendEntry` in
`frontend/public/js/pages/vendorPool.js` feuerte **sofort**, ohne jede Rückfrage, mit einem **fest
eingebauten Grund** („Manuell gesperrt") — und hing auf `window`. Der Moment musste erst entstehen:
Dialog, gemessene Folge, Grund vom Menschen (≥ 10 Zeichen, landet im Prüfpfad). `suspendEntry` ist
**entfernt**, nicht nur ungenutzt — ein zweiter Weg zur selben Handlung ist kein toter Code,
sondern eine offene Tür.

**Beide Wege gehen durch die Vorschau.** Nach der Pool-Definition aus U6.2 nimmt nicht nur das
Suspendieren einen Lieferanten aus dem Pool, sondern auch eine **Abstufung auf `BLOCKED`** — und die
steht in derselben Auswahlliste. Ein Dialog nur am Sperr-Knopf wäre eine halbe Absicherung mit
ganzem Anschein gewesen.

**Eigene Route, nicht ein Feld in der Liste.** `GET /vendor-pool/:id/wirkung`. Die Liste liefert bis
zu 200 Zeilen; 200 Vorschauen zu rechnen, von denen eine gebraucht wird, ist die Verschwendung, die
§0.3 verbietet. Die Route trägt **dieselben** Riegel wie die Handlung (`vendor_pool.manage`), nicht
die schwächeren eines Lesepfads — und ist **einseitig**: der Lieferant darf sie **nicht** lesen,
anders als `GET /vendor-pool/:id` daneben. Aus `bleibt_partner: false` liest er sonst ab, dass er
bei seinem Auftraggeber ohne Vertrag dasteht.

**Nachweis: 33 Rückmutationen, 33 rot.** Zwei sind beim ersten Durchgang **entwischt**, und beide
waren echte Probenlücken:

1. **Die Route las die Org aus der Anfrage** (`req.query.org_id || existing.client_org_id`). Der
   Org-Grenzen-Wächter blieb **grün**, weil er ohne `?org_id=` fährt — der Fallback greift, die
   403 kommt weiterhin. Die Lücke öffnet sich erst, wenn jemand den Parameter **setzt**: Prüfung
   auf dem eigenen Eintrag bestanden, Zahlen einer **fremden** Org geliefert. Das Muster „Prüfung
   auf A, Ausführung mit B". Dagegen steht jetzt `test/wirkungsvorschauRoute.test.js`, das nicht
   die Antwort prüft, sondern die **Bindung** der Abfrage.
2. **`esc()` entfernt blieb grün** — weil meine Probe `konditionskarten: "3<script>…"` übergab und
   der Satz nur bei `w.konditionskarten > 0` gebaut wird. `"3<script>…" > 0` ist `NaN > 0`, also
   **false**: der gefährliche Text erreichte die Ausgabe nie. **Dritter Fall dieser Art in dieser
   Woche** — eine Probe, die ihren Gegenstand nicht herstellt. Der Text sitzt jetzt im
   Wörterbuch-Eintrag des **unbedingten** Satzes, und die Probe belegt zuerst, **dass** er
   angekommen ist.

**Zwei Befunde, die dem Owner gehören — gemessen, nicht gebaut:**

- **Zwei Definitionen von „im Pool" über demselben Feld.** `istLieferantImPool` (U6.2) prüft
  `valid_from <= heute` **und** `valid_until >= heute`. Der Partner-Riegel in `assignmentService`
  prüft **nur** `valid_until` — ein **vordatierter** Pooleintrag gilt dort schon heute als
  Partnerschaft. Das ist genau die Fehlerklasse, mit der diese Woche angefangen hat. **Nicht
  angeglichen:** der Riegel entscheidet, wem ein Einsatz gegeben werden darf; ihn zu verengen ist
  die sichere Richtung, kostet aber eine 403 für jede Firma, die vordatiert hat — eine spürbare
  Verhaltensänderung an einem Sicherheitsriegel. Der IST-Zustand ist als Probe festgehalten, damit
  er nicht unbemerkt wandert.
- **`bleibt_partner` ist eine Nachbildung.** Es bildet den Partner-Riegel nach, **ohne ihn
  aufzurufen** (er sitzt mitten in einem Validierungspfad und bräuchte einen ganzen
  Einsatz-Datensatz). Kommt dort ein **vierter** ODER-Zweig hinzu, lügt die Vorschau. Dagegen steht
  eine Probe, die die **Anzahl** der Zweige und jede gelesene Tabelle festnagelt — eine
  Teilzeichenketten-Suche hätte einen **hinzugefügten** Zweig nie melden können.
- **`isInPool` ist tot.** Gemessen: nur noch von `test/vendorManagement.test.js` gerufen, von keinem
  Produktionspfad. Es steht neben `istLieferantImPool` und prüft **weniger** (kein Fenster, keine
  Sperre). **Nicht entfernt** in dieser Welle — aber als Stolperstein benannt: wer es findet, hält
  es für die Pool-Prüfung.

**Proben:** `test/wirkungDesEntfernens.test.js` (11, datenbankfrei: Form, Bindung je Teilabfrage,
Ableitung, Kopplung) · `test/integration/wirkungDesEntfernens.flow.test.js` (8, DB-gebunden: die
Zahlen an echtem SQL, Org-Grenze in **beide** Richtungen, Status-Filter) ·
`test/wirkungsvorschauRoute.test.js` (6, Bindung und Riegel der Route) ·
`test/wirkungsvorschauOberflaeche.test.js` (14, vm-Sandbox: kein Weg vorbei, Sätze aus Zahlen,
ehrlicher Leerzustand, beide Sprachen).

Gruppe C der DB-Probe **legt ihre Verteilstufe selbst an**: `requisition_distribution_stages` hat
**0 Zeilen**, und „nach dem Entfernen erreicht ihn keine Stufe mehr" wäre dort leer grün gewesen.
Der erste Aufbau war dabei **unmöglich** — eine Stufe mit `pool_tier = 'BLOCKED'` weist Postgres ab
(`requisition_distribution_stages_pool_tier_check`). Eine Verteilstufe **kann** gar nicht auf
Gesperrte zielen; die Probe baut jetzt den Fall, der wirklich vorkommt.


### U6.2a · gebaut 2026-10-01 — und der Hinweis hat eine vierte Fassung der Regel aufgedeckt

Der Plan verlangte: die eine Altkarte wird **nicht** migriert, **nicht** geleert, **nicht**
rückwirkend geprüft — sie bekommt einen **sichtbaren Hinweis**. Gebaut ist genau das: die Liste der
Konditionskarten liefert je Zeile `lieferant_im_pool`, und `frontend/public/rate-cards.html` setzt
daneben ein Abzeichen *„nicht im Pool"* mit einer Erklärung, die auch sagt, **dass die Karte
gültig bleibt**.

**Warum der Hinweis nicht optional ist.** Beim nächsten Ändern des Lieferanten weist der Server ab.
Ein Hinweis, der erst im Fehlerfall erscheint, ist eine **Falle** statt einer Auskunft: der Mensch
erfährt die Regel in dem Moment, in dem sie ihm im Weg steht, und hält sie für einen Defekt.

**Drei Werte, nicht zwei.** `lieferant_im_pool` ist `true`, `false` oder **`null`** — null bei einer
Karte ohne Lieferanten (org-weit). Ein `false` wäre dort eine Falschaussage, und die Oberfläche
würde an **jeder** org-weiten Karte warnen. Darum prüft sie streng auf `=== false`: ein
`!rc.lieferant_im_pool` hätte auch bei `null` und bei einer alten API-Antwort ohne das Feld
gewarnt. Ein Hinweis, der falsch oft erscheint, wird weggesehen — dann nützt er auch da nichts, wo
er stimmt.

#### Die eigentliche Erkenntnis: die Regel stand vierfach im Baum

U6.2a brauchte die Pool-Bedingung an einer **zweiten** Stelle. Sie dort von Hand hinzuschreiben wäre
die Fehlerklasse gewesen, mit der diese Woche angefangen hat. Also gibt es jetzt
`api/services/poolMitgliedschaftSql.js` — **ein** Modul, nach dem Muster der vorhandenen
Wahrheitsmodule (`zusageFormel.js`, `bindungSql.js`, `koepfeFormel.js`, `reputationSql.js`), mit
Bezeichnerprüfung wie dort.

Und dann hat ein Wächter über diesem Modul **vier** Fassungen gefunden, davon **zwei von mir, aus
derselben Welle**:

| Fassung | Zustand | Was fehlte |
|---|---|---|
| `istLieferantImPool` (U6.2) | **benutzt jetzt das Modul** | — (war die vollständige) |
| `wirkungDesEntfernens`, Stufen-Teilabfrage (U6.2b, **drei Stunden alt**) | **benutzt jetzt das Modul** | das **Gültigkeitsfenster** |
| `isInPool` (Altbestand, **tot**) | **benutzt jetzt das Modul** | das **Gültigkeitsfenster** |
| `assignmentService`, Partner-Riegel | **unverändert — Owner-Befund** | `valid_from` |

Die dritte ist die lehrreichste: **`isInPool` hatte ich in der Dokumentation zu U6.2b schon als
„Stolperstein, nicht entfernt" abgehakt.** Ein Vermerk hat sie nicht angefasst; der Wächter hat sie
angeglichen. Das ist der Unterschied zwischen einem Vermerk und einem Riegel — und derselbe
Unterschied, der in dieser Woche schon einmal sechs falsche Leser hinter einem ungemessenen
„nicht anfassen" geschützt hat.

Die zweite ist die unangenehmste: sie war **drei Stunden alt**. Ich hatte in U6.2b eine verkürzte
Fassung geschrieben (Status und Sperre, kein Fenster) und **im selben Atemzug** dokumentiert, dass
genau das die Fehlerklasse dieser Woche ist.

#### Das Suchmuster des Wächters ist zweimal korrigiert worden — das gehört zum Befund

**Erster Versuch:** „`vendor_pool` **und** `tier` **und** `status` im selben Abfragetext." Das
meldete `instantMatchService` und `reportingService` — **beide Fehlalarme.** Gemessen: der eine baut
eine **Stufen-Karte** (`SELECT vp.tier`, der Wert ist das Ergebnis), der andere zählt Lieferanten
für Kennzahlen (`GROUP BY vp.tier`). Keiner fragt „steht er im Pool". Hätte ich sie in die
Ausnahmeliste geschrieben, wäre aus einer Messung eine **Ausrede mit Zahlen** geworden — genau das,
was bei „123 von 967" und beim Pfadverweis-Wächter zum Nichtbauen geführt hat.

**Zweiter Versuch, der Fingerabdruck der Regel:** ein Abfragetext, der `vendor_pool` liest **und
die Sperre selbst hinschreibt** (`tier <> 'BLOCKED'`). Die Sperre ist der unterscheidende Teil. Das
schärfere Muster hat die Ausnahmeliste von **vier auf eine** Stelle verkürzt und dabei die zwei
eigenen Fassungen gefunden.

**Was der Wächter nicht kann, offen gesagt:** eine **verkürzte** Nachbildung (nur
`status = 'active'`, Sperre vergessen) sieht im Text wie eine gewöhnliche Pool-Abfrage aus und ist
nicht unterscheidbar. Deshalb gibt es das Modul: der Wächter fängt die auffällige Hälfte, das Modul
verhindert beide. Gescannt wird der **ganze** Korpus mit dem Haus-Scanner (`test/lib/sqlScanner.mjs`
— Kommentare entfernt, Interpolationen maskiert), nicht nur `services/`: ein Riegel in einer Route
wäre derselbe Fehler. Eine **Notbremse** daneben sichert zu, dass der Scan überhaupt greift — fände
er nichts, wäre die Ausnahmeliste leer und der Wächter grün, ohne eine Datei gelesen zu haben.

**Nachweis:** `test/altkarteOhnePool.test.js` (20: das Modul samt Einspritzversuchen, die Liste samt
Platzhalter-Verschiebung, der Hinweis samt Farben und beiden Sprachen, der Wächter samt Notbremse).
**24 Rückmutationen, 24 rot** — darunter „Sperre aus dem Modul", „Fenster aus dem Modul",
„Bezeichnerprüfung abgeschaltet", „Stichtag aus rohem UTC-Schnitt", „Stichtag nach LIMIT geschoben"
(der Index verschiebt sich und die Liste würde nach dem **Datum** begrenzt), „harte Farbe im
Abzeichen", „Klassendefinition weg" (ein unsichtbarer Hinweis ist keiner) und je eine pro
zurückfallender Fassung.


#### Nachtrag am selben Tag: zwei Einwände der gegenprüfenden Sitzung, einer davon mit falscher Zahl

**Einwand 1 — „dreh den Wächter um: beobachte die Tabelle, nicht die Bedingung."** Begründung: eine
**verkürzte** Nachbildung (nur `status = 'active'`, Sperre vergessen) trägt den Fingerabdruck
`tier <> 'BLOCKED'` nicht, *„und genau die wird der Fünfte schreiben, weil er die Regel aus dem Kopf
tippt statt sie zu importieren."* Die Ausnahmeliste sei **zwei Einträge**.

**Nachgerechnet, und die Zahl war anders: 19 Dateien** lesen `vendor_pool` — `services/` (14),
`routes/` (3), `config/visibilityMatrix.js`, `utils/orgBoundary.js`. Die genannten zwei
(`instantMatchService`, `reportingService`) waren die **Fehlalarme meines ersten Musters**, nicht die
Gesamtmenge. Eine 19-zeilige Ausnahmeliste ist nach unserem eigenen Maßstab („eine Liste, die man
Zeile für Zeile verteidigen kann") eine Ausrede mit Zahlen.

**Der Einwand stimmt trotzdem** — also die richtige Invariante gesucht statt die falsche Liste
gepflegt. Die Regel ist eine Frage nach einem **Paar**: „steht **dieser** Lieferant im Pool
**dieses** Kunden" heißt, **beide** Seiten in Vergleichsstellung zu binden. Eine Kennzahl bindet nur
eine Seite; eine Stufen-Karte bindet die Gegenseite über eine Brücke. Gemessen:

| Zuschnitt | Getroffene Dateien |
|---|---|
| jeder Zugriff auf `vendor_pool` (Vorschlag) | **19** |
| `vendor_pool` + `tier <> 'BLOCKED'` (erster Wächter) | **1** |
| `vendor_pool` + **beide** Seiten in Vergleichsstellung (zweiter Wächter) | **4** |

Beide Wächter stehen nebeneinander, weil sie verschiedene Hälften fangen: der erste eine Kopie, die
die Sperre über eine Brücke bindet; der zweite eine **verkürzte**, die sie weglässt. Die
Rückmutation dazu ist die aussagekräftigste der Welle: eine neue Funktion mit
`WHERE client_org_id = $1 AND supplier_org_id = $2 AND status = 'active'` — **genau die Kopie, die
die Gegensitzung vorhergesagt hat** — wird vom zweiten Wächter rot, vom ersten nicht.

**Einwand 2 — „nagle die Regel an die `CHECK`-Mengen."** Angenommen, unverändert. `vendor_pool`
erlaubt `status ∈ {active, suspended, removed}` und
`tier ∈ {PREFERRED, SECONDARY, TRIAL, RESTRICTED, BLOCKED}`. Die Regel nennt zwei Werte daraus;
käme ein dritter Status hinzu (etwa `paused`), fiele er **stillschweigend** in „nicht im Pool" — in
beide Richtungen eine Entscheidung, die niemand getroffen hat: ein pausierter Lieferant bekäme keine
neue Konditionskarte mehr, ohne dass jemand das so wollte. Die Probe vergleicht jetzt die Mengen und
verlangt, dass **jeder** erlaubte Wert benannt ist — wer einen Status hinzufügt, muss sagen, auf
welcher Seite er steht. Drei Rückmutationen (Wert aus der Liste entfernt · Stufe entfernt · Wert
erfunden, den die Datenbank nicht kennt), alle rot.

**DB-gebunden, mit benanntem Grund:** die Momentaufnahme `test/fixtures/schema.json` führt Spalten,
NOT-NULL, Fremdschlüssel, Sichten, Funktionen und Enums — **keine `CHECK`-Listen**. Sie dort
aufzunehmen wäre der bessere Weg (dann liefe die Probe auch ohne Datenbank) und bleibt als Posten
offen. Bis dahin fragt sie die laufende Datenbank und läuft damit im Abbild-Tor.

**Was ich beim Nachrechnen sonst noch geschlossen habe:** die Zahl „Service-Dateien" im
`PLATTFORM_REGISTER.md` stand **zwischen zwei Wächtern** — handgepflegt, von `dokuWaechter.test.js`
geprüft, von niemandem fortgeschrieben. Eine einzige neue Dienstdatei genügte: der Generator meldete
*„alle 3 erzeugten Zahlen stimmen"*, während eine vierte Zahl in **derselben Datei** veraltet war und
nur der volle Prüflauf es sah. Die Zahl hat keine Ermessensentscheidung in sich
(`ls api/services/ | wc -l`), gehört also in die Fortschreibung — jetzt mit Marke, Gegenrechnung und
angepasster Attrappe. Die Prüfung in `dokuWaechter` bleibt stehen: sie ist die Gegenprobe zur
Fortschreibung, nicht ihr Ersatz.


### U6.6 · gebaut 2026-10-01 — die Wertelisten stehen in der Momentaufnahme

`api/test/fixtures/schema.json` führt einen neuen Abschnitt **`wertelisten`**: je Tabelle und
Spalte die erlaubten Werte aus den `CHECK`-Regeln. Gemessen: **231 Spalten in 117 Tabellen**.
`api/test/wertelistenSindBenannt.test.js` (9 Proben) hält die Regeln dagegen — **datenbankfrei**,
also auch im Host-Tor.

**Warum das der Unterschied zwischen einer Probe und einer Zusicherung ist.** Dieselbe Prüfung stand
zuerst DB-gebunden in `test/integration/wirkungDesEntfernens.flow.test.js` und war damit im Host-Tor
**keine** Zusicherung — sie läuft nur im Abbild-Lauf. Genau dort entscheidet sich aber, ob jemand
einen Wert hinzufügen kann, ohne zu sagen, auf welche Seite er gehört. Die DB-gebundene Probe bleibt
stehen, mit anderer Aufgabe: sie belegt, dass die Momentaufnahme die **Wirklichkeit** trifft. Eine
Zusicherung über einer veralteten Momentaufnahme ist grün und wertlos.

**Was die Regel verlangt.** Für jede Spalte, auf der eine Regel steht, nennt die Probe **beide**
Seiten vollständig. Fünf Regeln heute: `vendor_pool.status`, `vendor_pool.tier` (U6.2),
`rate_cards.status`, `assignments.status`, `contracts.status` (U6.2b). Ein erlaubter Wert, den keine
Seite nennt, wird rot — mit der Folge im Fehlertext. Und die Gegenrichtung: ein Wert, den die Regel
nennt und die Datenbank nicht erlaubt, ist **toter Code mit dem Anschein von Sorgfalt**.

**Zwei Abgrenzungen, damit die Zahl nachrechenbar bleibt:**

- **Nur einspaltige `CHECK`s mit `= ANY (ARRAY[...])`.** Mehrspaltige Regeln („entweder A oder B
  gesetzt") und Bereichsregeln (`>= 0`) sind keine Listen; sie aufzunehmen hieße, eine Zahl zu
  führen, die niemand vergleichen kann.
- **Keine Zahlengrenze als Wächter.** Eine Obergrenze auf die Tabellenzahl (117 heute, **140** beim
  geweiteten Filter — gemessen) schlüge bei jeder legitimen Migration an, und eine Zahl, die bei
  normaler Arbeit Alarm schlägt, trainiert dem Leser das Wegschauen an. Stattdessen eine
  **Form**-Zusicherung: jeder Eintrag muss eine nicht-leere Liste von Zeichenketten sein.

**Die Form-Zusicherung hat innerhalb von Minuten einen echten Fehler in meinem eigenen Erzeuger
gefunden.** Sie wurde rot auf der **echten** Momentaufnahme: `marktplatz_feed_kopie.id` kam als
leere Liste. Ursache — `CHECK ((id = ANY (ARRAY[1, 2])))` ist eine **Zahlen**liste, und mein
Auszug las nur `'...'::text`. Eine Werteliste, die die Momentaufnahme nicht lesen kann, ist genau
die stille Lücke, die U6.6 schließen soll; die Zeile auszunehmen wäre die falsche Antwort gewesen.
Der Auszug liest jetzt Text **und** Zahlen, die Zählung bleibt bei 231/117 — der Filter wurde also
nicht geweitet, nur das Lesen repariert.

**Was die Form-Zusicherung nicht leistet, offen gesagt:** von den 125 einspaltigen `CHECK`s, die
keine Werteliste sind, tragen **117 null Zeichenketten-Literale** (`CHECK (accepted_count >= 0)` und
Verwandte) — die fängt sie. Die restlichen **8** (sieben mit einem Literal, eine mit sechs) sehen der
Form einer Werteliste zum Verwechseln ähnlich: `col <> 'x'` ist von einer Liste mit einem Wert nicht
unterscheidbar. Der primäre Riegel bleibt deshalb der Filter im Erzeuger; die Form-Zusicherung ist
der Rückhalt, der einen Bruch grob sichtbar macht, nicht die vollständige Trennung.

**Beide Vorgaben aus der Gegenprüfung sind eingehalten:** sortiert auf **drei** Ebenen (Tabellen,
Spalten, Werte) — zwei Neugenerierungen hintereinander ergeben außer `erzeugt_am` **keinen**
Unterschied, gemessen. Und erzeugt wird **vor** dem Tor, nicht danach: der Fingerabdruck der
Momentaufnahme hängt an den Migrationen, und in U6.1 hat genau diese Reihenfolge einen roten Test
gekostet.

**Nachweis: 14 Rückmutationen, 14 rot** — neun an der Momentaufnahme (Abschnitt weg · auf drei
Tabellen gekürzt · neuer Wert ohne Regel in beide Richtungen · Wert aus der Datenbank verschwunden ·
Werteliste ganz weg · unsortiert auf zwei Ebenen), zwei am Wahrheitsmodul (ein Wert, den die
Datenbank nicht kennt — die Pool-Regel träfe dann **nie** zu, und das sähe aus wie ein leerer Pool
statt wie ein Fehler), drei am **Erzeuger** mit echter Neugenerierung. Die letzten drei waren nötig,
weil eine Mutation am Erzeuger, die man nicht laufen lässt, nichts belegt — und die dritte
(`C3`, Filter geweitet) ist beim ersten Anlauf **entwischt** und hat die Form-Zusicherung überhaupt
erst erzwungen.

**Nebenfund, als Nachtrag an Z11 vermerkt:** `vendor_pool` trägt eine **dritte** Werteliste, die in
U6.2 niemand betrachtet hat — `invitation_status ∈ {accepted, expired, none, sent}`. Gemessen: der
Name kommt im ganzen `api/`-Baum **nur** in der Momentaufnahme vor, kein Produktionspfad liest oder
schreibt ihn. Die Spalte ist tot; sie aus der Pool-Regel auszulassen ist damit begründet und nicht
nachlässig. Genau diesen Fall macht U6.6 künftig sichtbar, statt ihn dem Zufall zu überlassen — die
Waisen-Familie aus Z11 reicht bis auf die **Spalten**ebene.


### U6.7 · gebaut 2026-10-01 — und der Zweizeiler hat eine Zeitzone aufgedeckt, die niemand gepinnt hatte

**Owner-Freigabe am 2026-10-01**, direkt in die bauende Sitzung („ja"), nachdem eine Weitergabe
durch die planende Sitzung ausdrücklich **nicht** als Freigabe genommen wurde.

Der Partner-Riegel in `assignmentService` bezieht seine Pool-Bedingung jetzt aus
`services/poolMitgliedschaftSql.js`. Er prüfte bis dahin `valid_until`, aber **nicht**
`valid_from`: ein vordatierter Pooleintrag galt dort schon heute als Partnerschaft, während
`istLieferantImPool` (U6.2) ihn ablehnte. **Fünfte Fassung derselben Regel**, und die letzte.

Gemessen vor der Freigabe: `vendor_pool` hatte **0** Zeilen, davon 0 vordatierte — die Verengung
kostete **null** echte 403er, und mit jedem Kunden mehr. Das war das Argument, mit dem der Owner
schon U6.1 entschieden hat: *heute kostenlos, später teuer.*

**Die Gegenprobe der planenden Sitzung greift, und sie war die richtige Forderung:** die
Ausnahmeliste des Paar-Wächters wird **kürzer** (4 → 3), die des Sperr-Wächters sogar **leer**.
Eine Zusammenführung, nach der die Ausnahmen wachsen, wäre keine gewesen.

#### Der eigentliche Fund: `CURRENT_DATE` war eine Wette auf den Host

Ich wollte `CURRENT_DATE` im Riegel **behalten**, mit der Begründung „die DACH-Direktive verlangt
`TZ=Europe/Berlin` im Container". Dann nachgemessen statt geglaubt:

| Messung | Ergebnis |
|---|---|
| laufende Datenbank, `SHOW TimeZone` | `Europe/Berlin` ✔ |
| `docker-compose.yml`, **db**-Dienst | **kein `TZ`** — es stand nur am api-Dienst |
| `sql/init.sql` (80 Zeilen) | **nichts** zur Zeitzone |
| alle 226 Migrationen | **keine** `SET timezone`, kein `ALTER DATABASE … timezone` |

**Das `Europe/Berlin` kam vom Host.** Der Postgres-Container erbte die Zone der Docker-VM.
**Nichts im Repo pinnte sie.** Auf einem Hetzner-Server mit UTC — dem Standard, und das Ziel für den
Livegang im Dezember — liegt `CURRENT_DATE` nach 22 Uhr deutscher Zeit einen Tag zurück. Der Fehler
tritt **nur abends** auf: in jedem Tagtest grün.

**Reichweite, mit dem Haus-Scanner über den ganzen Korpus:** 57 Vorkommen zeitzonenabhängiger
SQL-Ausdrücke in 18 Dateien, **0** mit ausdrücklicher Zone. Die dicksten: `workforceService` (14),
`workerService` (10), `companyBlocklistService` (6), `marktpraesenzService` (4) — darunter
`assignmentService` (dieser Riegel) und `bindungSql` (ein Wahrheitsmodul).

**Die Messung hat meinen Befund zweimal verkleinert, und beides gehört dazu:**

1. **Die JS-Seite ist nicht betroffen.** `todayDE()` baut sein `Intl.DateTimeFormat` mit
   `{ timeZone: "Europe/Berlin" }`, nennt die Zone also selbst — der eigene Kommentar sagt
   „unabhängig von der Container-Zeitzone". Das `TZ` am api-Dienst ist für Datumsrichtigkeit gar
   nicht nötig.
2. **„`TZ` fehlt" in den prod-Dateien ist keine Lücke.** `prod.yml`, `demo.yml`,
   `prod.managed.yml`, `managed.yml` und `ports-internal.yml` sind **Overlays**; compose **mischt**
   `environment`-Abschnitte, also trägt der api-Dienst sein `TZ` auch in Produktion. Es gibt genau
   **eine** echte db- und **eine** echte api-Definition.

**Gelöst an der Wurzel, nicht an 57 Aufrufstellen:** Migration **227** setzt
`ALTER DATABASE … SET timezone = 'Europe/Berlin'`. Das steht in `pg_db_role_setting`, überlebt
Neustart und Neuaufsetzen und gilt für **jeden** Verbindungsweg — eine Umgebungsvariable gilt nur
für den Prozess. 57 Aufrufstellen umzuschreiben wäre viel Bewegung für einen Fehler mit **einer**
Ursache. Das `TZ` am db-Dienst kommt dazu, aber als **Beiwerk**: es richtet Containeruhr und
Log-Zeitstempel, nicht die Rechnung.

**Und im Riegel trotzdem gebunden:** der Stichtag kommt aus `todayDE()`, nicht aus `CURRENT_DATE`.
Ein Riegel, der entscheidet, wem ein Einsatz gegeben werden darf, soll nicht an einer Einstellung
hängen, die jemand zurücksetzen kann — dieselbe Haltung wie bei der Org-Grenze, die „zweimal steht:
in der Route und im SQL".

**Nachweis in drei Schichten** (`test/zeitzoneIstGepinnt.test.js`, 6 Proben, **datenbankfrei**):
die Migration · die Momentaufnahme (neuer Abschnitt `datenbank_einstellungen`) · der db-Dienst in
compose. Bewacht wird die **Pinnung**, ausdrücklich **nicht** die Abwesenheit von `CURRENT_DATE` —
eine Ausnahmeliste mit 57 Einträgen wäre die Ausrede mit Zahlen, die dieses Projekt zweimal
verworfen hat.

#### Nachweis: 20 Rückmutationen, 20 rot — und vier haben Probenlücken aufgedeckt

`test/integration/partnerRiegelFenster.flow.test.js` (8, DB-gebunden) prüft das Fenster an echtem
SQL: vordatiert abgewiesen, am Tag des Beginns angenommen, am letzten Tag noch gültig, einen Tag
später nicht. Und `test/integration/einsatzVerweise.flow.test.js` prüft denselben Fall **durch den
echten Dienst** — der Unterschied zwischen „die Bedingung ist richtig" und „das Tor benutzt sie".
Dass dort der Spiegelfall fehlte (die Datei setzte `valid_from` nie und ging durch die Verengung
hindurch, ohne sie zu berühren), hat eine Breitenmessung gefunden, nicht der Lauf.

**Vier Mutanten sind beim ersten Anlauf entwischt**, und drei davon aus **einer** Ursache:

| Mutation | Warum sie durchkam |
|---|---|
| `ALTER DATABASE` durch `SET timezone` ersetzt | `ALTER DATABASE` steht **auch in meinem eigenen Kommentar** zwei Zeilen darüber |
| andere Zone eingesetzt (`Etc/UTC`) | `Europe/Berlin` steht zusätzlich in der `SET LOCAL`-Zeile — eine **andere Anweisung** erfüllte die Zusicherung |
| fester Datenbankname statt `current_database()` | derselbe Kommentar |
| Notbremse-Schwelle von `>= 10` auf `>= 0` gesenkt | **meine Mutation war unsinnig**: eine abgeschwächte Probe wird davon nicht rot |

Der erste Fall ist der **fünfte** dieser Woche — und diesmal in einer Probe, die ich ausdrücklich
dagegen gebaut hatte: der Schnitt bei `BEGIN;` schützt gegen den **Kopf**, nicht gegen Kommentare
im **Rumpf**. Jetzt werden beide Kommentarformen herausgeschnitten, mit einer Notbremse für den
Schnitt selbst. Der zweite Fall ist die Klasse „die Zusicherung traf die falsche Stelle", die am
selben Tag schon vier Mutanten durchgelassen hat — die Zone wird jetzt **in der herausgeschnittenen
`ALTER DATABASE`-Anweisung** geprüft.

Der vierte ist die Gegenrichtung und gehört genauso notiert: **eine Mutation, die nur den Wächter
abschwächt, prüft nichts.** Ersetzt durch zwei, die den **Gegenstand** kaputt machen — Korpus des
Scanners geleert und auf ein Verzeichnis ohne `vendor_pool` verengt. Beide rot.

#### Fünf Befunde derselben Klasse, gemessen und NICHT gebaut

Eine Breitenmessung (vier parallele Blickwinkel, jeder Befund adversarial gegengeprüft; 7 von 21
Befunden wurden dabei **widerlegt**, alle sieben, weil sie den Stand vor meinen Korrekturen
beschrieben) hat dieselbe Lücke an weiteren Stellen gefunden. Jede ist eine eigene Welle, und jede
ist eine **Verhaltensänderung an einem Lesepfad oder Riegel** — also owner-gebunden:

| Stelle | Befund | heute messbar betroffen |
|---|---|---|
| `assignmentService`, **Vertrags**-Zweig desselben Riegels | prüft nur `status = 'active'`; `contracts` **hat** `valid_from`/`valid_until` | **0** von 1 aktiven Verträgen (0 abgelaufen, 0 vordatiert) |
| `supplierPoolService.getEligibleSuppliers` | lädt Lieferanten für Verteilstufen **ohne jedes** Gültigkeitsfenster | — |
| `marketplaceService` | zwei Wahrheiten über `availability_to` in **einem** Pfad | — |
| `assignmentStaffingService` | `verified_doc_names` heißt „verified" und filtert nichts | — |
| `workerService` | `valid_from` wird viermal erhoben, gespeichert, angezeigt — und **nie** ausgewertet | — |

Dazu zwei Hinweise aus derselben Messung: `capacityWorkflow` trägt eine **unbenutzte
Zwillingsfunktion**, die die Hälfte des echten Kerns prüft (derselbe Stolperstein wie `isInPool`,
U6.2a) — und `bountyService`s einseitige Fenster sind **absichtlich richtig**, damit niemand sie
„mitfixt". Der letzte Punkt ist der wertvollste der Liste: eine Messung, die nur Treffer meldet und
nicht die begründeten Nicht-Treffer, erzeugt beim nächsten Leser genau den falschen Eingriff.

**Methodischer Vorbehalt, von einem der Prüf-Agenten selbst notiert:** die Dateien haben sich
**während** der Messung geändert, weil die bauende Sitzung gleichzeitig in denselben Arbeitsbaum
schrieb. Deshalb beschreiben sieben Befunde einen Stand, der beim Prüfen schon behoben war. Für die
oben stehenden fünf gilt das nicht — sie liegen in Dateien, die in dieser Welle nicht angefasst
wurden.

## 5. Reihenfolge

**U0 → U2.4 → U6 → U1 → U5 → U2 → U3 → U4.**

> **U6 direkt nach U2.4 (Owner-Freigabe 2026-10-01)**, weil es dieselbe Grenze betrifft und
> U0.2b gezeigt hat, dass die Code-Prüfung allein zweimal daneben lag. Solange die Datenbank
> die Mandantengrenze nicht mitträgt, kostet jede weitere Phase das Risiko, dass ein neuer
> Schreibweg den Riegel wieder vergisst.

> **U2.4 steht vor allem anderen**, weil U0.2 bereits eine Lücke geliefert hat: nicht in den
> Routen, sondern **im Schreibweg** (`rbacService`). Eine Grenze, die beim Lesen gilt und beim
> Schreiben nicht, ist keine Grenze.

---

## 6. Woran gegengeprüft wird

| # | Frage |
|---|---|
| 1 | Fremde Firma, fremder Standort → 403 an **jeder** betroffenen Route? |
| 2 | Kann sich jemand selbst befördern? |
| 3 | Taucht ein Nachname, eine E-Mail oder ein Geburtsdatum in einer Worker-Antwort vor dem Abschluss auf? |
| 4 | Ist die Rechte-Matrix erzeugt oder gepflegt? |

## 7. Was Welle U **nicht** tut

- **Staff-Rollen umbauen.** Die sechs Staff-Rollen bleiben, wie sie sind.
- **Direktnachrichten zwischen Firmen einführen.** Abschnitt 10b ist bewusst ausgelassen.
- **Das Owner Control Center anfassen.** Entschieden, wartet auf den Owner-Abschnitt.

## 8. Kreislauf und Verdrahtung

**Welle U schließt K-4 Vertrauen** (Profilsichtbarkeit) und trägt **K-6 Nachweis** (Rollenänderung
im Firmen-Audit). Kreislaufkarte und Verdrahtungskette: [`V_SCHNITTSTELLEN.md`](V_SCHNITTSTELLEN.md),
Abschnitte 3b und 3c — jede Phase hier gilt erst mit allen neun Gliedern als fertig.

| Über den Plan hinaus mitzudenken | Warum |
|---|---|
| Rolle geändert → **Navigation und Kacheln ändern sich sofort**, nicht erst nach neuem Login | Sonst sieht jemand minutenlang Flächen, die ihm entzogen wurden |
| Standort archiviert → offene Einsätze, Stundenzettel und Monatsplanung dieses Standorts werden **benannt**, bevor archiviert wird (Wirkungsvorschau) | Kein verwaister Einsatz |
| **Betriebsart** (V6): Mitglieder aus SCIM oder zvoove sind schreibgeschützt mit Kennzeichen | Eine lokale Rollenänderung würde beim nächsten Abgleich still verschwinden |
| Profil gesperrt → auch **Merkliste** und **Teilen-Link** des Kunden verlieren den Eintrag | Die Sperre gilt überall, nicht nur in der Liste |
