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
| Darf eine Konditionskarte auf eine fremde Organisation zeigen? | **Regel offen, Zwischenstand freigegeben** (Owner 2026-10-01) | Der Zwischenstand nimmt keine Fähigkeit weg, die heute jemand nutzt, und schließt den offenen Rand. Die Regel selbst („nur aus dem eigenen Lieferantenpool"?) bleibt beim Owner |

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
| **U6.2** | **`supplier_org_id` im Ändern-Pfad zurückweisen** — mit Auskunft (`OrgBoundaryError`), nicht als stiller Filter. Beim **Anlegen** bleibt es unverändert setzbar. **Ausdrücklich NICHT bauen:** die Pool-Regel („nur Organisationen aus dem eigenen Lieferantenpool"). Die Regelfrage bleibt beim Owner | **Zwillingszusicherung, beide Hälften:** ein Änderungsversuch **mit** `supplier_org_id` wird abgewiesen **und** ein Änderungsversuch **ohne** das Feld kommt weiterhin durch. Eine Probe, die nur die Abweisung kennt, bleibt grün, wenn der gültige Weg zerstört wird |
| **U6.3** | **`contract_id` prüfen — in BEIDEN Pfaden.** `assertOrgOwnership(pool, "contracts", data.contract_id, orgId)`, fail-closed davor (`if (!orgId) throw`). `contracts` steht in `ALLOWED_TABLES`, das Muster existiert; **`createRateCard` ist genauso offen wie `updateRateCard`** — der dritte Fall desselben Paar-Musters in einer Datei | Rückmutation **je Pfad** (Anlegen und Ändern getrennt). Plus Zwillingszusicherung: eine gültige **eigene** Vertragskennung kommt durch |
| **U6.4** | **Erst messen, dann entscheiden:** ein Wächter, der in jeder `allowed`-Liste eines Schreibdienstes die Felder auf `*_id` gegen einen vorhandenen Riegel hält. Dreimal dasselbe Muster in einer Datei legt nahe, dass es öfter vorkommt | **Zuerst die Zahl der nötigen Ausnahmen messen und melden — nicht bauen.** Ein Wächter, dessen Ausnahmeliste länger ist als sein Ertrag, ist eine Ausrede mit Zahlen (so entschieden bei „123 von 967" und beim Pfadverweis-Wächter) |

**Reihenfolge innerhalb von U6: U6.3 → U6.0 → U6.1 → U6.2 → U6.4.**

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
