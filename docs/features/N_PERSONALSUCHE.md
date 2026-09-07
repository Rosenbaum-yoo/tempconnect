# Welle N — Die Personalsuche

> **Status: Bauanweisung, freigegeben 2026-09-05.** Ist-Stand gemessen.
> Owner-Vorgabe: die Unternehmenssicht auf den Marktplatz — vier Fragen, ein Bündel,
> eine Bestätigung, ein verbindlicher Abschluss.
>
> Gehört zu [`M_MARKTPLATZ_FLOW.md`](M_MARKTPLATZ_FLOW.md) (Angebotsseite) und setzt
> dessen Welle M5 (Korb) voraus.

---

## 1. Die Owner-Vorgabe im Wortlaut

> „wenn unternehmen auf arbeiter suchen geht oder personalsuche […] dass er drei oder vier
> fragen beantworten muss in nem modal oder in suchfeldern — er gibt an was er sucht, also
> die skills, damit die zum katalog passen müssen die auch da übereinstimmen, also irgendwie
> anklickbar für unternehmen machen. und dann wieviele er braucht und von wann bis wann und
> wie teuer diese einzeln sein dürfen. hier muss dann auch auf notdienst hingewiesen werden.
> er sendet ab und dann werden alle mit den gesuchten skills gebündelt für die menge an
> arbeiter die er buchen wollte angezeigt, mit ausnahme der gesperrten bei diesem
> unternehmen. wenn er einzelne leute sucht, dann werden die profile bzw angebote einzeln
> angezeigt. er kann dann auswählen und muss alle 4 vorher in der suche eingegebenen
> suchkriterien einmal bestätigen. und dann löst es, wenn er verbindlich gebucht hat, die
> live-belegschaftsbelegung bei der zeitarbeitsfirma aus, und es geht eine automatische
> benachrichtigung an den worker. die zeitarbeitsfirma bekommt die notwendigen unterlagen:
> rechnungen, stundenzettel, die vereinbarung und so weiter."
>
> Dazu: **„liefere mehr als erwartet, mit Wow-Effekt — für Unternehmen *und*
> Zeitarbeitsfirmen."**

---

## 2. Der Befund in einem Absatz

Die vier Felder existieren alle. Der Notdienst existiert. Die Buchungsprüfung existiert.
**Was fehlt, ist die Klammer** — und ein Defekt, der wichtiger ist als alles andere:

> **Die Angebotsseite ist katalogfest, die Nachfrageseite ist Freitext.**
> Jedes Marktplatz-Angebot entsteht aus einer Katalog-Fähigkeit (`platform_skills`). Das
> Bedarfsformular fragt: *„Skills (kommagetrennt), z. B. Schichtarbeit, Montage"* — ein
> freies Textfeld (`marketplace_demand_create.html:55`).
>
> Wer **„Gabelstaplerfahrer"** tippt, trifft den Katalogeintrag **„Staplerfahrer"** nicht.
> Die beiden Seiten können sich **strukturell nicht zuverlässig finden.**
>
> Die Owner-Vorgabe „anklickbar, damit sie übereinstimmen" ist damit **kein
> Bedienkomfort, sondern die Bedingung dafür, dass Matching überhaupt funktioniert.**
> Sie ist Phase N1 und geht allem anderen voran.

---

## 3. Der Wow-Effekt liegt schon im Code — er hat nur keine Oberfläche

Gemessen am 2026-09-05: **zwei vollständige Motoren mit null Frontend-Aufrufern.**

| Motor | Was er kann | Aufrufer heute |
|---|---|---|
| **`smartPricingService`** (`/api/pricing/suggest`) | Datengestützter Preisvorschlag je **Rolle, Region und Dringlichkeit** — inklusive der Stufe `notdienst`. Plan-gegated auf PLUS/PRO | ~~null~~ → **einer** (2026-09-06, N2.2: die Bedarfsanlage) |
| **`capacityDiscoveryService`** (`/capacity-discovery/by-role`, `/by-region`, `/by-category`, `/summary`) | Verfügbare Kapazität, aggregiert nach Rolle, Region und Kategorie | **null** |
| `profileRankings` | Kuratiertes Ranking, Segmente (z. B. GOLD) | einer (der eigene Rang der Agentur) |

**Das ist die billigste Wow-Lieferung des ganzen Projekts.** Beide Motoren sind gebaut,
getestet und plan-gegated. Es fehlt die Anzeige.

### Was daraus für die zwei Seiten wird

**Für das Unternehmen — die vierte Frage beantwortet sich selbst.**
Statt „Wie teuer dürfen sie sein?" auf ein leeres Feld zu stellen, sagt die Suche:
*„Üblich sind 28–34 €/h für Pflegefachkraft im Raum Münster. Bei Notdienst 41 €."*
Der Kunde muss nicht raten, und er stellt kein Budget ein, das niemand bedienen kann —
**die häufigste Ursache für einen Bedarf, auf den nie jemand antwortet.**

**Für die Zeitarbeitsfirma — sie erfährt, wo sie fehlt.**
Dieselben Aggregate von der anderen Seite gelesen sind ein **Nachfragesignal**:
*„Im Raum Münster werden 34 Pflegekräfte gesucht, verfügbar sind 6."* Das ist der Grund,
die Plattform täglich zu öffnen — und es beantwortet die teuerste Frage einer
Zeitarbeitsfirma: **wen soll ich als Nächstes einstellen?**

> Beides aus demselben Dienst, der heute niemandem etwas sagt.

---

## 4. Der Ablauf, präzise

### 4.1 Die vier Fragen

| # | Frage | Feld | Bauvorgabe |
|---|---|---|---|
| 1 | **Was suchst du?** | `skill_tags` | **Anklickbar aus dem Katalog** (`GET /skills/catalog`), Mehrfachauswahl, Suchfeld mit Vorschlägen. **Kein Freitext.** Findet der Kunde seinen Begriff nicht, wird er auf den nächstliegenden Katalogeintrag geführt — nicht abgewiesen |
| 2 | **Wie viele?** | `headcount` | Zahl. Ab 2 wird gebündelt (4.2) |
| 3 | **Von wann bis wann?** | `start_date`, `end_date` | **Dieses Feld entscheidet den Notdienst — es gibt keine fünfte Frage.** Owner-Vorgabe 2026-09-05: tagesgenau, Beginn in **höchstens zwei Tagen** = Notdienst, alles andere nicht (4.4) |
| 4 | **Wie teuer einzeln?** | `budget_min`, `budget_max` | **Mit Preisvorschlag aus `smartPricing`**, abhängig von Rolle, Region und Dringlichkeit. Der Vorschlag ist ein Vorschlag, keine Vorgabe |

> **Korrektur meines ersten Entwurfs (Owner-Vorgabe 2026-09-06).** Dort stand, der Ort komme
> aus dem Standortkontext und werde nicht gefragt. **Das ist falsch.** Der Owner will ihn
> ausdruecklich als **erste** Frage, mit dem Hinweis *„genauere Angaben erhoehen die
> Matching-Qualitaet"*.
>
> Und er hat recht: der Standortkontext ist die **Rechnungsadresse oder Niederlassung**, nicht
> der **Einsatzort**. Eine Pflegeeinrichtung mit vier Haeusern sucht fuer *ein* Haus. Wer den
> Kontext ungefragt als Einsatzort nimmt, rechnet die Entfernung gegen den falschen Punkt —
> und die ganze Radius-Logik aus M-E4 rechnet mit.
>
> **Also fünf Schritte, nicht vier**, und der Ort steht vorn:

| # | Frage | Feld | Bauvorgabe |
|---|---|---|---|
| **0** | **An welchen Ort sollen die Arbeiter?** | `location_city`, `location_postal` | **Erste Seite des Modals.** Vorbelegt aus dem Standortkontext, aber änderbar — und der Hinweis steht dabei: *„genauere Angaben erhöhen die Trefferqualität"*. Er ist wahr, nicht Zierde: gegen diesen Punkt rechnet der Einsatzradius |

### 4.2 Das Ergebnis: gebündelt oder einzeln

| Suche | Anzeige |
|---|---|
| **Mehrere** (`headcount > 1`) | **Ein Bündel**, das die gesuchte Menge deckt — quer über Zeitarbeitsfirmen. Mit Preis je Firma und Gesamtpreis. *(Das ist der Korb aus M5)* |
| **Einzelne** (`headcount = 1`) | **Profile einzeln**, mit Merkmalen und Herkunftskennzeichnung |

**In beiden Fällen ausgeschlossen: die bei DIESEM Unternehmen gesperrten Kräfte.**

> **Owner-Vorgabe 2026-09-05, und sie ist eine Bauvorgabe:** *„gesperrt unsichtbar bei der
> zutreffenden Firma — nur weil eine Firma sich beschwert hat, kann er ja trotzdem in einer
> anderen Firma eingesetzt werden."*
>
> Die Unsichtbarkeit ist **kundenbezogen, nie global.** Wer bei einem Kunden gesperrt ist,
> steht bei jedem anderen unverändert im Markt. Eine Sperre ist kein Urteil über den
> Menschen.
>
> **Die Falle dabei:** der Feed hat seit Welle K4 eine **Kopie der letzten guten Liste**, und
> die ist ausdrücklich die **ungefilterte** erste Seite. Wird der Filter in die Kopie
> hineingebaut, trägt ein Kunde seine Sperren in die Ansicht aller anderen. **Der Filter
> gehört hinter die Kopie, nicht davor.** Rückmutation: Sperre bei Kunde A setzen → Kunde B
> sieht die Kraft unverändert.

**Heute greift die Sperre erst beim Buchen** — der Kunde sieht also Menschen, die er gar nicht
buchen kann. Das dreht N4 um: **gesperrt heißt unsichtbar**, nicht „abgewiesen beim Klick".

> **Gebaut am 2026-09-06 (Welle N4).** Die Bedingung steht jetzt **einmal** im Repo —
> `nichtGesperrtSql(alias, platzhalter, {spalte})` im `companyBlocklistService` — und vier
> Flächen benutzen sie: Feed, Suche, Detailansicht und Deckungsrechnung. Bewacht von
> `api/test/gesperrtHeisstUnsichtbar.test.js` (33 Proben, **35 Rückmutationen ohne
> Überlebende**).
>
> **Gemessen war der Zustand schlechter als die Beschreibung oben.** „Die Sperre greift beim
> Buchen" stimmte nur für **einen** der beiden Deal-Wege:
>
> | Fläche | vorher | jetzt |
> |---|---|---|
> | `accept-deal` | 409 (seit J2c) | unverändert |
> | `negotiate-deal` | **ließ durch** | 409, vor der Platzrechnung |
> | Feed | blendete aus | benutzt den gemeinsamen Baustein |
> | Suche | zeigte an | filtert, Liste **und** Trefferzahl |
> | Detailansicht | zeigte an | 409 |
> | Deckungsrechnung | zählte mit | rechnet ohne (N4.2) |
>
> **Der Verhandlungsweg war die ernstere Lücke.** Er ist kein reiner Lesepfad: er legt einen
> Bedarf an, schreibt ein Angebot, benachrichtigt die Zeitarbeitsfirma und schickt ihr eine
> E-Mail. Ein Unternehmen konnte also eine Verhandlung über genau die Kraft anstoßen, die es
> selbst gesperrt hatte — und die Gegenseite bekam eine Anfrage, die niemals in einer Buchung
> enden kann. Auffallen konnte das erst am Telefon.
>
> **Kein 404 in der Detailansicht.** Das Unternehmen hat die Sperre selbst gesetzt; ihm „nicht
> gefunden" zu antworten ließe es den Fehler bei sich suchen. Derselbe Code wie beim Buchen,
> damit die Oberfläche einen einzigen Satz braucht.

> **Erledigt am 2026-09-06 (N4.4): die K4-Kopie ist undicht und marktseitenblind GEWESEN.**
> Beim Prüfen der oben genannten Falle („der Filter gehört hinter die Kopie") zeigte sich, dass
> `feedKopieService.istKopierwuerdig()` **nur die 15 Query-Filter** prüft, nicht die aus dem
> Betrachter abgeleiteten Einschränkungen. Dabei entscheidet `viewer_role` in `browseFeed`
> (Zeile 866 ff.), welche **Marktseite** überhaupt in der Liste steht: ein Unternehmen sieht
> `supply`, eine Zeitarbeitsfirma `demand`. Die Tabelle hat genau **eine** Zeile
> (`CHECK (id = 1)`). Folgen, beide live:
> * Die Kopie wird von dem geschrieben, dessen unfilterte Seite-1-Anfrage zuletzt lief. War
>   das eine Agentur, enthält sie **Bedarfe** — und ein Unternehmen bekommt im Fehlerfall die
>   falsche Marktseite serviert.
> * Ein Unternehmensabruf ist **nie** neutral (`viewer_company_org_id` ist für jedes
>   Unternehmen mit Org gesetzt). Seine gefilterte Liste wird zur Kopie für alle — genau der
>   Fall, den der Abschnitt oben ausschließen wollte.
>
> **Owner-Entscheid 2026-09-06: Kopie je Marktseite.** Migration 216 löst `CHECK (id = 1)`
> zu `id IN (1,2)` — `1 = supply` (was ein Unternehmen sieht), `2 = demand` (was eine
> Zeitarbeitsfirma sieht). Die vorhandene Zeile wird **gelöscht**, nicht umgedeutet: niemand
> weiß, welche Seite sie trug, und im schlechteren Fall trug sie die Sperrliste eines Kunden.
>
> `istKopierwuerdig()` zählt jetzt auch die aus dem **Betrachter** abgeleiteten
> Einschränkungen — `viewer_company_org_id` und die Inter-Agency-Freigabe wirken stärker als
> jeder Query-Filter. Damit gilt: ein Unternehmen mit Sperrliste hinterlässt **keine** Kopie
> und bekommt im Fehlerfall den ehrlichen 500er statt einer Liste, in der die von ihm
> gesperrten Kräfte wieder auftauchen.
>
> Der Kern des alten Fehlers war eine Wortverwechslung: „kein einziger Filter" meinte die 15
> Einträge aus der URL und übersah, dass der Betrachter die Liste stärker beschneidet als
> jeder von ihnen.
>
> **Zwei Rückmutationen haben zuerst überlebt** — beide in der *Verdrahtung*, nicht im Dienst:
> man konnte die Marktseite in der Route weglassen oder fest auf `supply` stellen, ohne dass
> eine Probe rot wurde. Vier Routen-Proben später: 12 von 12.

### 4.3 Die Bestätigung

Vor dem verbindlichen Abschluss werden **alle vier Kriterien noch einmal gezeigt** und in
einem Schritt bestätigt. Nicht als Formular — als **Zusammenfassung mit Wirkung**:

> „14 Pflegefachkräfte · 15.09.–31.10. · bis 32 €/h · Einsatzort Münster-Nord
> → 3 Zeitarbeitsfirmen · Gesamt 48.720 € · verbindlich"

Der Server prüft die Wünsche bereits gegen das Angebot (`marktplatzBuchungService`:
Zeitraum in der Vergangenheit, Zeitraum außerhalb des Angebots, Preis außerhalb des
Rahmens). **Was fehlt, ist der Schritt davor** — der Mensch sieht, was er gleich auslöst.

### 4.4 Der Notdienst wird abgeleitet, nicht gefragt

> **Owner-Vorgabe 2026-09-05:** *„taggenau ist besser, dann braucht der Notdienst nicht extra
> angegeben werden. Wenn er sagt Einsatz ab morgen, ist es Notdienst; wenn er sagt Einsatz in
> 2 Tagen, ist es auch Notdienst; alles andere nicht Notdienst."* Und: *„ganz einfach mit der
> Abfrage ab wann in den Suchfeldern kann das passieren."*

**Die Regel:** `start_date` minus heute **≤ 2 Tage** → Notdienst. Sonst nicht.
Keine fünfte Frage, kein Häkchen, keine Möglichkeit, es falsch zu setzen.

**Tagesgenau heisst `Europe/Berlin`.** Kein roher UTC-Schnitt — `todayDE()`, wie die
Systemzeit-Regel aus Welle F es verlangt. Ein Off-by-one entscheidet hier ueber die
Einstufung eines Auftrags, nicht ueber eine Anzeige.

**Sichtbar im Feld, nicht in einem Banner.** Wer ein Datum in Reichweite einträgt, sieht
sofort: „Beginn in 18 Stunden — das ist ein Notdienst. Teilzusagen werden sofort sichtbar."

Der Notdienst-Weg ist der **einzige** im System, der Teilzusagen und Überfüllungsschutz
bereits richtig kann. Er hat nur keine Oberfläche — **sieben auditierte Endpunkte ohne einen
einzigen Aufrufer.**

> **Gebaut am 2026-09-06 (Welle N2.1).** `notdienstAusStartdatum()` im Notdienst-Dienst;
> `POST /marketplace/demand-requests` leitet daraus ab, das Auswahlfeld im Formular ist
> entfernt und durch die **Anzeige** der abgeleiteten Stufe ersetzt (sichtbar beim Tippen des
> Datums, nicht nach dem Absenden). Bewacht von `api/test/notdienstAbleitung.test.js` —
> inklusive einer Probe, die die Browser-Anzeige ausführt und gegen den Dienst hält, damit
> die beiden Kopien der Regel nicht auseinanderlaufen.
>
> **Zwei Entscheidungen dabei, beide vom Owner bestätigt:**
> * **Ohne Notdienst-Tarif kein 403**, sondern der normale Weg plus Hinweis. Eine Sperre
>   träfe genau den dringendsten Fall — und brächte nichts ein, weil derselbe Kunde heute
>   einfach „normal" wählt.
> * **`requisitions.urgency` bleibt Handeingabe.** Es ist ein internes Triage-Etikett mit
>   eigener Skala, löst keine SLA-Uhr aus und fließt in keine Ausschreibung.
>
> **Beim Bauen gefunden:** `createEmergencyRequest` liest `payload.urgency` — im geparsten
> Rumpf stand aber der Schema-Standardwert. Die Notdienst-Maschinerie wäre mit **normaler**
> SLA angelaufen (120 statt 30 Minuten, keine Eskalation). Gefangen von einer Probe, die den
> gespeicherten Wert prüft statt die Antwort; die Antwort sah richtig aus.

> **Zum zweiten Auslöser (Dealabschluss), gemessen am 2026-09-06.** Die *operative* Wirkung
> gibt es bereits: `anfrageFristSql` deckelt die Antwortfrist auf Mitternacht des Starttags
> (`LEAST(NOW() + 72 h, start_date)`), mit vier Stunden Untergrenze. Ein Einsatz, der morgen
> beginnt, erzeugt heute schon die kurze Frist — und `fristLabelDE` nennt sie dem Menschen.
> Was fehlt, ist nicht die Wirkung, sondern die **Benennung**: niemand sagt an dieser Stelle
> „Notdienst", und die Zuweisung trägt keine Dringlichkeit (`assignments` hat keine solche
> Spalte). Das ist eine eigene, kleinere Welle — und sie sollte die Stufe **ableiten**, nicht
> speichern: ein gespeicherter Wert veraltet, ein abgeleiteter nie.

### 4.5 Nach dem verbindlichen Abschluss

| Was passieren soll | Stand |
|---|---|
| Live-Belegschaftsbelegung bei der Zeitarbeitsfirma | ❌ **Die Kette reißt** — siehe M7.1. Die Zuordnung macht heute immer ein Mensch |
| Automatische Benachrichtigung an den Worker | ✅ Vorhanden, mit Frist (72 h regulär, 4 h Ersatz) |
| Die Zeitarbeitsfirma bekommt die Unterlagen | ◐ Vereinbarung ✅, Stundenzettel ✅, Rechnung ✅ — die Rechnung entsteht aber aus **freigegebenen Stundenzetteln**, nicht aus dem Abschluss. Das ist Absicht („Leistung vor Beleg") und bleibt so |

---

## 5. Wellen und Phasen

### N1 · Der Katalog auf beiden Seiten *(geht allem voran)*

| Phase | Inhalt | Nachweis |
|---|---|---|
| N1.1 | **Fähigkeiten anklickbar** aus `GET /skills/catalog`, Mehrfachauswahl, Vorschläge beim Tippen | Freitext ist nicht mehr möglich |
| N1.2 | **Wer seinen Begriff nicht findet, wird geführt**, nicht abgewiesen — dieselbe Zuordnung über Schreibvarianten, die `proposeSkill` schon kann | „Gabelstaplerfahrer" führt zu „Staplerfahrer" |
| N1.3 | **Der Bestand wird sichtbar, bevor gesucht wird:** je Fähigkeit die Zahl verfügbarer Kräfte, aus `capacity-discovery/by-skill` | Wer eine Fähigkeit wählt, sieht sofort, ob es sie gibt |
| N1.4 | **Wächter: kein Freitext-Skill mehr auf der Nachfrageseite** | Rückmutation: Freitextfeld wieder einbauen → rot |

> **Erledigt am 2026-09-06 — mit einer Berichtigung.** Diese Tabelle nannte für N1.3
> `capacity-discovery/by-role` als Quelle. Gemessen stimmt das nicht: `aggregateByRole`
> gruppiert nach `cp.role` („Pflegekraft"), nicht nach `cp.skill_tags` („Stapler") — die
> Rolle beantwortet eine andere Frage. Die Zahl je **Fähigkeit** gab es noch nicht; sie ist
> als `aggregateBySkill` / `GET /capacity-discovery/by-skill` neu gebaut, mit derselben
> Rest-Rechnung wie die Nachbarn. (Dritte Ungenauigkeit dieser Art in Folge, vgl. N7.1 und
> N7.4 — Herkunftsangaben in diesem Plan sind Hinweise, keine Belege, und gehören vor dem
> Bauen gemessen.)
>
> Geliefert: `frontend/public/js/skillPicker.js` — ein gemeinsames Bauteil für beide Seiten,
> das seine Gestalt selbst mitbringt und in jedes Folgeprojekt passt. Eingebaut in
> `marketplace_demand_create.html` (mit Bestandszahlen und Ortsbezug) und
> `capacity_exchange_form.html`. Bewacht von `api/test/faehigkeitenKatalog.test.js` (29
> Proben, 36 Rückmutationen ohne Überlebende) und `test/integration/bestandJeFaehigkeit.flow.test.js`
> (6 Proben gegen die laufende Datenbank).
>
> **Nachgezogen in N1b (2026-09-06), auf Owner-Hinweis.** N1 stellte die beiden *Markt*-
> Flächen um; die Achse ist damit aber noch nicht gemeinsam. `matchingEngine.scoreMatch`
> vergleicht Nachfrage und Angebot als **Mengen** — eine gemeinsame Achse entsteht erst, wenn
> **alle** Flächen aus derselben Menge wählen. Zwei taten es nicht:
> `mitarbeiter.html` (142 fest verdrahtete Begriffe, davon **109 nicht im Katalog**, und ein
> Freitextfeld obendrein) und `requisition_create.html`. Beide sind jetzt am Wähler; die
> Agentur bekam dafür den katalog-gebundenen Endpunkt `PUT /workers/:userId/skills`, den es
> bis dahin nur für den Arbeiter selbst gab. Bewacht von
> `api/test/eineAchseFuerFaehigkeiten.test.js`.

### N2 · Die vier Fragen als Assistent

> **Zur Nummerierung, damit niemand zweimal dasselbe sucht.** Die Welle, die am
> 2026-09-06 als **„N2.1" committet** wurde (`e4fd049`), ist inhaltlich **N2.3** dieser
> Tabelle plus Abschnitt 4.4 — die Ableitung des Notdienstes aus dem Einsatzbeginn. Der
> Commit-Titel bleibt stehen, wie er ist; die Zeile N2.3 unten trägt den Verweis. Das
> eigentliche **N2.1 (die Schritte als Assistent) ist seit 2026-09-07 gebaut.**
>
> **Beim Bauen von N2.2 gemessen:** alle Felder stehen bereits auf
> `marketplace_demand_create.html` — **Einsatzort** (`location_city`, `location_postal`,
> `radius_km`), Katalogwähler (N1), Anzahl, Zeitraum mit abgeleiteter Dringlichkeit,
> Budget. Was fehlt, ist nicht das Datenmodell und nicht das Feld, sondern die
> **Schrittform**. Ein zweiter Anlagepfad wäre eine Parallelstruktur; der Assistent gehört
> deshalb auf diese Seite, nicht neben sie.
>
> Die Zählung folgt der Korrektur in 4.1 (`ce8b892`): **fünf Schritte, der Ort vorn** —
> der Standortkontext ist Rechnungsadresse oder Niederlassung, nicht der Einsatzort. Für
> N2.2 ändert das nichts: der Preisvorschlag liest `location_city`, also das Feld, das der
> Kunde selbst füllt — nie einen abgeleiteten Kontext.

| Phase | Inhalt | Nachweis |
|---|---|---|
| N2.1 | **Fünf Schritte**, die den **bestehenden** Bedarf erzeugen (M-L6: kein zweites Datenmodell) | ✅ 2026-09-07 — der Ort vorn, vorbelegt aus dem aktiven Standort, änderbar. Die Felder werden **nicht verschoben**: das Skript ordnet die vorhandenen je einem Schritt zu |
| N2.0 | **Der Marktplatz bekommt Koordinaten** — Vorbedingung dafür, dass „genauere Angaben erhöhen die Trefferqualität" wahr ist | ✅ 2026-09-06 — beide Seiten beim Anlegen, Bedarf vor dem Matching; PLZ über **Freitext**, weil die strukturierte Abfrage sie meist verschluckt |
| N2.2 | **Preisvorschlag aus `smartPricing`** bei Frage 4, abhängig von Rolle, Region, Dringlichkeit | ✅ 2026-09-06 — in der Bedarfsanlage, entprellt; 403 verbirgt still und fragt nicht wieder |
| N2.3 | **Notdienst-Hinweis**, wenn der Vorlauf ihn nahelegt | ✅ 2026-09-06 — **committet als „N2.1"** (`e4fd049`), siehe Hinweis oben; die Stufe wird abgeleitet statt gefragt (4.4) |
| N2.4 | **Treffer-Vorschau live**: „mit diesen Angaben: 23 Kräfte" — ändert sich mit jedem Schritt | ⏳ **Zahl ist jetzt belastbar** (2026-09-06/07): eigene Marktseite **und** Umkreis. Nachweis geführt: 25 km → 9, 300 km → 11, 400 km → 13. Offen bleibt die **Anzeige** im Formular |
| N2.5 | **Abbrechen verliert nichts** — der halbfertige Bedarf bleibt Entwurf | Modal schließen, wiederkommen, Stand ist da |
| N2.6 | **Erreichbar aus der Personalsuche**, nicht von einer eigenen Seite | Klickpfad vom Hub bis zum Assistenten. Die Fläche ist `capacity_search.html` („Personal finden"); sie verlinkt die Bedarfsanlage heute **gar nicht** |

> **N2.4: der Nachweis „Radius vergrößern → Zahl steigt" war nicht erreichbar — bis N2.0.**
> Gemessen 2026-09-06: der Radiusfilter des Feeds rechnet mit `haversineKm` und braucht
> **Koordinaten** (`capacityExchangeService.js:828`); die Bedarfsanlage erfasste nur Ort, PLZ
> und Radius, nie `location_lat`/`location_lng`.
>
> **Der Geokodierer war die ganze Zeit da** — `geoService.geocode()`, benutzt von
> Registrierung, Profil und Inseraten. Nur der Marktplatz rief ihn nie. In der laufenden
> Datenbank: `demand_requests` 40 Zeilen / **5** mit Koordinaten, `capacity_posts` 45 / **7**
> — bei **100 %** erfasstem `radius_km`. Die Entfernungsbewertung lief also praktisch nie;
> gerechnet wurde über den Rückfall „gleiche Stadt, exakt geschrieben" mit 60 % Gewicht.
> **Erledigt in N2.0** (2026-09-06): beide Marktseiten werden beim Anlegen geokodiert, der
> Bedarf **vor** dem Matching-Anstoß.

> **Beim Vorbereiten von N2.4 gefunden — und zur Hälfte behoben (2026-09-06).**
>
> Die Vorschau sollte den **Endpunkt benutzen, dessen Ergebnis der Kunde später sieht** —
> sonst gäbe es zwei Wahrheiten über denselben Markt. Dabei fiel auf, dass die Zahl dieses
> Endpunkts selbst nicht stimmte:
>
> **(1) `total` addierte beide Marktseiten** und wurde erst danach gefiltert. Gemessen mit 6
> Angeboten und 17 fremden Bedarfen: ein Unternehmen bekam `total: 23` und sah 6. Die Zahl
> speist auch die **Blätterung** — über sechs Einträgen standen 23 Treffer, also Seiten, die
> es nicht gibt. *(Die Beispielzahl „23" aus diesem Plan ist zufällig genau der Fehler.)*
> **Behoben**, bewacht von `api/test/trefferzahlStimmt.test.js`.
>
> **(2) Der Radius wirkte nicht auf `total`** — **behoben am 2026-09-07 (N2.4b, Owner-Freigabe).**
> Der Umkreis wurde erst *nach* der Datenbankabfrage in JavaScript angewandt, und zwar **nach
> dem `LIMIT`**. Drei Folgen: die Zahl war zu groß, sobald jemand einen Umkreis setzte; eine
> Seite lieferte **weniger** Einträge als angefordert; und die Blätterung zeigte Seiten, die
> es nicht gab.
>
> Jetzt rechnet Postgres — dieselbe Haversine-Formel wie `haversineKm`, damit die Auswahl
> nicht anders rechnet als die Anzeige. Gemessen gegen die laufende Datenbank, Suchpunkt
> Hamburg-Bergedorf:
>
> | Radius | 25 km | 200 km | 300 km | 400 km |
> |---|---|---|---|---|
> | Treffer | 9 | 9 | **11** | **13** |
>
> **Das ist der Nachweis, den dieser Plan verlangt** — „Radius vergrößern → Zahl steigt" —
> und `total` stimmt bei jedem Schritt mit der Zahl der Einträge überein.
>
> Zwei Regeln sind dabei erhalten geblieben, weil ihr Verlust still gewesen wäre: eine Zeile
> **ohne Koordinaten** fällt heraus, und der **eigene Radius** eines Eintrags zählt mit (wer
> „ich fahre bis 80 km" schreibt, bleibt drin, auch wenn der Suchende 25 km eingestellt hat).
>
> **Beim Umzug ins SQL verloren und von einer Probe zurückgeholt:** der alte Filter prüfte
> ausdrücklich `!= null`. Ohne das hätte ein fehlender Längengrad stillschweigend **Greenwich**
> bedeutet und ein fehlender Breitengrad den Äquator — die Suche hätte gefiltert, ohne dass
> jemand einen Punkt genannt hat.
>
> **Was weiterhin nach dem `LIMIT` läuft, benannt statt verschwiegen:** die anderen Nachfilter
> der Angebotsseite (`visible_to_viewer`, `min_headcount`, `remaining_headcount > 0`). Auch sie
> können eine Seite kürzen. Der Umkreis war der teuerste von ihnen, weil er als einziger die
> **Trefferzahl** verfälschte — die anderen bleiben ein eigener Befund.
>
> Ebenfalls gemessen: `aggregateBySkill` liefert eine Zahl **je Fähigkeit**, nicht eine
> Gesamtzahl — Summieren würde jedes Angebot doppelt zählen, das zwei gewählte Fähigkeiten
> trägt. Für „mit diesen Angaben: 23 Kräfte" braucht es also eine eigene, entdoppelte
> Aggregation. Vorschlag: Zahl über **Ort + Fähigkeiten**, Nachweis „eine Fähigkeit mehr
> wählen → Zahl sinkt". Der Radius bleibt draußen, bis Koordinaten erfasst werden.

### N3 · Das Ergebnis

| Phase | Inhalt | Nachweis |
|---|---|---|
| N3.1 | **Gebündelt bei mehreren**, einzeln bei einem | 14 gesucht → ein Bündel über 3 Firmen; 1 gesucht → Profile |
| N3.2 | **Merkmale und Herkunft werden gezeigt** — die API liefert sie heute an jeden, gerendert werden sie auf **einer** Fläche | „aus Live-Belegschaft" steht überall |
| N3.4 | **Die Sortierung speist sich aus mehr als der Passung** (Owner-Vorgabe 2026-09-06): **Sperrliste** (N4), **Verfügbarkeit aus der Live-Belegschaft**, **interne Bewertung** (Q1). Vorhandene Regeln zuerst prüfen — `profileRankingService` führt bereits `ranking_score`, `reputation_score`, `activity_score`, `premium_boost`, `effective_rank_score` und `rank_segment` | Je Bestandteil ein belegtes Gewicht. **Kein Bestandteil ohne Begründung im Code** |
| N3.5 | **„Hart und unzerstörbar"** — die Reihenfolge ist **stabil** (gleiche Eingaben, gleicher Rang), **erklärbar** (jede Position nennt ihren Grund) und **nicht kaufbar**: bezahlte Hebung bricht höchstens Gleichstand (**O-L1**) | **Rückmutation:** `premium_boost` über eine bessere Passung stellen → Probe rot |
| N3.6 | **Verfügbarkeit zählt, Krankheit nicht.** Wer heute abwesend ist, steht nicht oben — aber die **Zahl** der Abwesenheiten fließt **nirgends** in den Rang ein (Q1.1: Gesundheitsdaten werden nicht bewertet) | Abwesenheitstabelle in die Rangabfrage aufnehmen → **Probe rot** |
| N3.3 | **Kein Bündel, das die Menge nicht deckt**, ohne es zu sagen: „12 von 14 gedeckt — 2 offen" | Teildeckung ist sichtbar, nicht geschönt |

### N4 · Gesperrt heißt unsichtbar

| Phase | Inhalt | Nachweis |
|---|---|---|
| N4.1 | **Die Sperrliste wirkt im Feed und in der Suche**, nicht erst beim Buchen | ✅ 2026-09-06 — plus Detailansicht und `negotiate-deal`; eine Bedingung, vier Flächen |
| N4.2 | **Und im Bündel**, damit die Menge stimmt | ✅ 2026-09-06 — `checkOfferCoverage({kundeOrgId})`; ohne Kunde bleibt die Bedingung weg |
| N4.3 | **Ohne der Gegenseite zu verraten, dass gesperrt wurde** | ✅ 2026-09-06 — ohne Grund, ohne Kundenname; je Kunde gefragt statt am Stück geladen |
| N4.4 | **Die K4-Kopie** trägt weder fremde Sperren noch die falsche Marktseite | ✅ 2026-09-06 — Migration 216, eine Kopie je Marktseite; der Betrachter zählt bei der Kopierwürdigkeit mit |

### N5 · Die Bestätigung mit Wirkung

| Phase | Inhalt | Nachweis |
|---|---|---|
| N5.1 | **Alle vier Kriterien in einer Zusammenfassung**, einmal bestätigt | Alle vier erscheinen, keines fehlt |
| N5.2 | **Mit Wirkung in Zahlen**: Firmen, Gesamtpreis, Zeitraum, Anzahl | Vorschau = tatsächlicher Abschluss |
| N5.3 | **Drei Ausgänge**: verbindlich buchen · anfragen · abbrechen. „Anfragen" liegt auf `negotiate-deal` — der Endpunkt existiert und hat auf dieser Fläche keinen Aufrufer | Alle drei wirksam |

### N6 · Der Abschluss wirkt

| Phase | Inhalt | Nachweis |
|---|---|---|
| N6.1 | **Live-Belegschaft** — hängt an M7.1 (M-E6: automatisch, wenn eindeutig; sonst Aufgabe mit Frist) | Buchung → Zuordnung sichtbar |
| N6.2 | **Der Worker wird benachrichtigt**, mit Frist | Vorhanden — hier nur nachweisen |
| N6.3 | **Die Unterlagen sind da, wo die Firma sie sucht** — Vereinbarung sofort, Stundenzettel und Rechnung im Lauf | Je Beleg ein Klickpfad |

### N7 · Der Wow für die andere Seite

**Das ist der Teil, den niemand verlangt hat** — und der aus denselben Motoren fällt.

| Phase | Inhalt | Nachweis |
|---|---|---|
| N7.1 | **Nachfragesignal für die Zeitarbeitsfirma:** „Im Raum Münster werden 34 Pflegekräfte gesucht, verfügbar sind 6." Aus `capacity-discovery`, von der anderen Seite gelesen | Die Zahl stimmt mit den offenen Bedarfen überein |
| N7.2 | **Preisvorschlag auch für die Angebotsseite** — `smartPricing` kennt bereits den Kontext `supply` | Die Firma sieht, ob sie über oder unter Markt liegt |
| N7.3 | **„Deine Kräfte, die niemand findet"** — wer keinen Wohnort, keine Katalog-Fähigkeit oder keine Freigabe hat (M4.9) | Die Firma sieht die Lücke, bevor der Kunde sie nicht findet |
| N7.4 | **Der Notdienst-Leitstand** — sieben fertige, auditierte Endpunkte ohne Aufrufer, darunter die einzige Möglichkeit, eine Teilzusage zurückzunehmen | Größter Bestand pro Aufwand im Repo |

---

## 6. Reihenfolge

```
N1  Katalog beidseitig     ← ohne das findet nichts zueinander
 ├── N4  Gesperrt unsichtbar   ← klein, verhindert eine peinliche Buchung
 ├── N2  Der Assistent         ← die vier Fragen, mit Preisvorschlag
 ├── N3  Das Ergebnis          ← braucht den Korb aus M5
 ├── N5  Die Bestätigung
 ├── N6  Der Abschluss wirkt   ← hängt an M7.1
 └── N7  Der Wow für die Firma ← unabhängig, jederzeit vorziehbar
```

**Empfohlen — geändert durch Owner-Vorgabe 2026-09-05: N7 ZUERST.**
`N7 → N1 → N4 → N2 → N3 → N5 → N6`

> **Warum N7 vorne steht:** es hängt an nichts, und es macht **zwei fertige Motoren**
> sichtbar, die heute niemandem etwas sagen. Der schnellste sichtbare Fortschritt im ganzen
> Plan — und der einzige Teil, der **beiden Seiten sofort** etwas gibt.

> **N7 darf vorgezogen werden, sobald es hakt.** Es hängt an nichts und liefert zwei
> Motoren, die schon fertig sind — der schnellste sichtbare Fortschritt im ganzen Plan.

---

## 7. Woran gegengeprüft wird

| # | Frage |
|---|---|
| 1 | **Findet die Nachfrage die Angebote?** Ein Bedarf mit Katalog-Fähigkeit trifft die daraus erzeugten Angebote — an echten Zeilen, nicht am Muster |
| 2 | **Ist der Preisvorschlag echt?** Er kommt aus `smartPricing`, nicht aus einer festen Zahl im Frontend |
| 3 | **Ist eine gesperrte Kraft wirklich unsichtbar?** In Suche, Feed und Bündel — je eine Rückmutation |
| 4 | **Zählt „fertig" als fertig?** Jeder Endpunkt hat einen Aufrufer, jede Seite einen Klickpfad (M-L8) |
| 5 | **Hält die Mandantengrenze?** Fremde Org → 403, nicht 200 mit leerer Liste |
| 6 | **Ist etwas doppelt gebaut?** `smartPricing`, `capacityDiscovery`, `negotiate-deal`, `commitment-preview` existieren — wer sie neu baut, hat nicht gemessen |

---

## 8. Was Welle N **nicht** tut

- **Ein zweites Bedarfsmodell bauen.** Der Assistent erzeugt den bestehenden Bedarf.
- **Einen dritten mehrstufigen Assistenten bauen.** In `offer_detail.html` steht bereits
  ein Rahmen mit genau diesen Feldern (M-L6).
- **Die Rechnung aus dem Abschluss erzeugen.** „Leistung vor Beleg" bleibt.
- **Den Preisvorschlag zur Vorgabe machen.** Er ist ein Vorschlag; wer anders bietet, darf.
- **Eine eigene Matching-Engine bauen.** `matchingService` existiert.
