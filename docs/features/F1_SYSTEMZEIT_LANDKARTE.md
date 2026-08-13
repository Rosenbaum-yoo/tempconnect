# F1 — Landkarte der Datumsfehler

**Kartiert am 2026-08-13** durch drei parallele Agenten, jede Fundstelle am Code belegt.
Ergebnis: **33 echte Kalendertag-Fehler**, 29 Stellen belegt harmlos.

---

## Die Ursache ist systemisch, nicht punktuell

Die Ausgangsvermutung lautete: falsch zwischen 00:00 und 02:00 deutscher Zeit.
**Das stimmt nicht.** `node-postgres` parst `DATE`-Spalten absichtlich als **lokale**
Mitternacht (`postgres-date/index.js:17`), in `api/` gibt es keinen
`setTypeParser`-Override, und `docker-compose.yml:102` setzt `TZ: Europe/Berlin`.

Damit liefert `.toISOString().slice(0,10)` bei **jedem** Wert aus einer `DATE`-Spalte
**ganztägig den Vortag** — nicht nur nachts. Das betrifft die Mehrzahl der Fundstellen.

## Zwei Fehlerklassen, zwei verschiedene Fixes

| Klasse | Symptom | Fix |
|---|---|---|
| „heute" wird in UTC bestimmt | zwischen 00:00 und 02:00 der Vortag | `todayDE()` |
| DB-Wert wird nach UTC umgewandelt | **ganztägig** der Vortag | `dateOnlyDE(value)` |

Die naive Reparatur — überall `todayDE()` — greift also zu kurz. Bei Werten aus der
Datenbank ist nicht „heute" das Problem, sondern die Umwandlung eines bereits korrekten
lokalen Datums.

Mindestens vier Stellen sind **wortgleiche Kopien** desselben Helfers
(`normalizeIsoDateValue`) in verschiedenen Diensten — jede muss einzeln behoben
werden, sonst bleibt die Hälfte der Oberfläche falsch. Dasselbe Muster wie in den
Mutation-Wellen: doppelte Logik braucht doppelte Arbeit.

## Das vom Owner gemeldete Symptom

`frontend/public/einsatzportal-plan.html`: der Helfer `toISO()` (Zeile 231) wird auf
Datumsobjekte angewandt, die `getMonday()` (Zeile 225) zuvor auf **lokale** Mitternacht
gesetzt hat. Lokale Mitternacht Berlin ist 22:00/23:00 UTC des Vortags — deshalb steht
dort Mittwoch, wenn Dienstag ist.

## Was Geld und Recht berührt

| Stelle | Folge |
|---|---|
| `exportService.js:38` | Stundenzettel-CSV zeigt die Abrechnungswoche einen Tag zu früh — **landet in der Lohnabrechnung** |
| `rateCardService.js:298` | ein heute gültiger Stundensatz wird nicht gefunden, ein gestern ausgelaufener noch angewendet |
| `workerSubmissionService.js:357` | der letzte gearbeitete Tag vor der Abmeldung wird abgewiesen — **nicht erfasste Arbeitsstunden** |
| `workerService.js:116` | Dokument-Ablauf zu früh → ein noch gültiger Führerschein blockiert den Einsatz |
| `recurringBillingService.js:360` | Mahnschreiben nennt ein falsches Fälligkeitsdatum |
| `dealAgreementService.js:453` | Notdienst-Einsatz wird rückdatiert — und der wird typischerweise nachts ausgelöst |

---

## Alle 33 Fundstellen

| Beleg | Was der Nutzer erlebt |
|---|---|
| `api/routes/requests.js:351` | Nimmt ein Unternehmen eine Anfrage ohne start_date zwischen 00:00 und 02:00 (Sommerzeit) an, wird der Einsatz auf den Vortag datiert — Einsatzportal, Live-Belegschaft und Stundenze |
| `api/services/assignmentLifecycleService.js:28` | Einsatzbeginn und -ende stehen im Portal einen Tag zu frueh; ein Einsatz gilt einen Tag zu frueh als beendet. Genau das vom Owner gemeldete Symptom (falscher Wochentag im Einsatzpo |
| `api/services/dealAgreementService.js:365` | Eine nachts angelegte Vereinbarung ohne bestaetigtes Startdatum bekommt den Vortag als Einsatzbeginn — der Einsatz erscheint rueckdatiert und faellt sofort in die 'laufend'-Logik. |
| `api/services/dealAgreementService.js:453` | Der Notdienst-Einsatz startet laut Beleg am Vortag. Bei einem Sofort-Einsatz, der typischerweise nachts ausgeloest wird, ist das der wahrscheinlichste Fall ueberhaupt. |
| `api/services/entitlementService.js:389` | Der Kunde sieht 'Zugang aktiv bis 19.08.', obwohl der Zugang noch den ganzen 20.08. laeuft — Panik-Anrufe beim Support oder verfruehte Zahlung. |
| `api/services/exportService.js:38` | Jeder CSV-Export zeigt die Abrechnungswoche einen Tag zu frueh (Mo 10.08. wird als So 09.08. exportiert) — und zwar ganztaegig, nicht nur nachts, weil pg DATE als lokale Mitternach |
| `api/services/pilotConversionTruthService.js:61` | Die angezeigte Kohortenspanne der Pilot-Conversion nennt nachts den Vortag als Endedatum. |
| `api/services/rateCardService.js:298` | Zwischen 00:00 und 02:00 wird ein heute in Kraft tretender Stundensatz noch nicht gefunden, ein gestern ausgelaufener noch angewendet — es wird zum falschen Preis abgerechnet. |
| `api/services/recurringBillingService.js:254` | Auf dem Beleg steht ein Periodenbeginn, der einen Tag vor dem tatsaechlichen liegt. Genau der Fehler, der in invoiceService.js:116-124 fuer billing_period_start/end schon dokumenti |
| `api/services/recurringBillingService.js:352` | Die kommunizierte Schonfrist endet auf dem Papier einen Tag frueher als im System — der Kunde glaubt, er habe die Frist verpasst, oder umgekehrt. |
| `api/services/recurringBillingService.js:360` | Der Kunde liest im Mahnbrief ein Faelligkeitsdatum, das einen Tag vor dem tatsaechlichen liegt, wenn die Rechnung nachts erzeugt wurde — eine falsche Frist in einer zahlungsrelevan |
| `api/services/reportingService.js:202` | Zwischen 00:00 und 02:00 zeigt die Scope-Leiste 'Zeitraum 14.07.–11.08.' obwohl heute der 12.08. ist. Die Fensterlaenge stimmt, nur die genannten Kalendertage sind um einen Tag ver |
| `api/services/timesheetService.js:497` | In der Woche der Sommerzeitumstellung (29.03.) laeuft die Instanz von 01:00 CET auf 01:00 CEST = 23:00 UTC des Vortags: der Wochentag wird doppelt angelegt und der Folgetag fehlt.  |
| `api/services/workerService.js:111` | Zwischen 00:00 und 02:00 deutscher Zeit rechnet die Ablaufwarnung gegen den Vortag: 'laeuft in 31 Tagen' statt 30, ein heute ablaufendes Dokument gilt noch als gueltig. |
| `api/services/workerService.js:116` | Ablaufdatum jedes Arbeiter-Dokuments wird um einen Tag zu frueh angezeigt, die Restlaufzeit ist um 1 zu niedrig, und die Ampel springt einen Tag zu frueh auf 'abgelaufen' — ein noc |
| `api/services/workerSubmissionService.js:357` | Der letzte tatsaechlich gearbeitete Tag vor der Abmeldung wird abgelehnt ('Datum liegt nach der Abmeldung'), und dem Nutzer wird ein Abmeldedatum genannt, das einen Tag zu frueh is |
| `api/services/workerSubmissionService.js:54` | Der Buendel-Periodenschluessel eines Stundenzettels, dessen Woche am Monatsersten beginnt, faellt in den Vormonat: die Sammelfreigabe erscheint unter 'Juli' statt 'August' und misc |
| `api/services/workerSubmissionService.js:563` | Das Korrektur-Protokoll ('am 09.08. wurden 8 auf 6 Stunden geaendert') nennt durchgaengig den falschen Arbeitstag. Der String/Date-Zweig macht es zusaetzlich inkonsistent: derselbe |
| `api/services/workerSubmissionService.js:74` | Die erwarteten Arbeitstage einer Woche sind komplett um einen Tag verschoben; die Vollstaendigkeitspruefung meldet fehlende Tage, die eingetragen sind, und uebersieht den echten Lu |
| `api/services/workforceService.js:25` | Dieselbe Vortags-Verschiebung, aber in der Workforce-Uebersicht — und sie muss getrennt gefixt werden, sonst bleibt die Haelfte der Oberflaeche falsch. |
| `api/services/workforceService.js:35` | Der Nutzer liest 'Einsatz endet in 3 Tagen', obwohl es 4 sind; der 14-Tage-Warnschwellwert und die error/warning-Grenze bei 3 Tagen loesen einen Tag zu frueh aus. Doppelt verschobe |
| `frontend/public/capacity_exchange_notdienst.html:147` | Nachts 00:00-02:00 steht der Vortag im Feld. Eine Notdienst-Anfrage wird mit Startdatum in der Vergangenheit erzeugt und kann serverseitig abgelehnt werden oder falsch matchen. |
| `frontend/public/einsatzportal-dashboard.html:488` | Zwischen 00:00 und 02:00 deutscher Zeit gilt der Vortag. Ein Einsatz, der gestern endete, bleibt in dieser Zeitspanne faelschlich 'aktiv' und erzeugt Hero-Karte und Pending-Banner. |
| `frontend/public/einsatzportal-dashboard.html:772` | Nachts 00:00-02:00 kippt weekStart auf Sonntag. Der Match schlaegt fehl, die Karte 'Diese Woche' zeigt keinen vorhandenen Stundenzettel an. Zusaetzlich inkonsistent: getDay() ist l |
| `frontend/public/einsatzportal-einsaetze.html:272` | Nachts 00:00-02:00 wird ein gestern beendeter Einsatz als 'ends_today' etikettiert und ein heute endender als noch laufend. Direkter Widerspruch zur korrekten Variante in workerSub |
| `frontend/public/einsatzportal-einsaetze.html:400` | Nachts 00:00-02:00 steht der Vortag im Feld. Der Arbeiter meldet sich fuer den falschen Tag ab; die Disposition plant ihn faelschlich ein. |
| `frontend/public/einsatzportal-plan.html:231` | Lokale Mitternacht Berlin = 22:00/23:00 UTC des Vortags. Der Schnitt liefert damit NICHT nur nachts, sondern RUND UM DIE UHR den Vortag. Alle abgeleiteten ISO-Daten des Plans sind  |
| `frontend/public/einsatzportal-plan.html:244` | Angefragt wird Sonntag-Samstag statt Montag-Sonntag. Der Sonntag der angezeigten Woche liegt ausserhalb des Abfragefensters, seine Schichten fehlen; ein Vorwochen-Sonntag wird unno |
| `frontend/public/einsatzportal-plan.html:257` | Die Zuordnung erfolgt gegen den Vortag. Einsaetze erscheinen konsistent auf dem falschen Wochentag; ein Einsatz, der nur am Montag laeuft, wird gegen Sonntag geprueft und faellt au |
| `frontend/public/einsatzportal-plan.html:288` | DAS IST DER GEMELDETE DEFEKT. 'iso' ist immer Anzeigedatum minus 1 Tag (Zeile 287 via toISO), 'today' ist der korrekte Tag (new Date() traegt Uhrzeit, kippt nur 00:00-02:00). Die G |
| `frontend/public/js/pages/accountSubscription.js:204` | Nachts 00:00-02:00 wird statt morgen der heutige Tag als gewuenschter Start uebermittelt — vertraglich relevantes Datum um einen Tag falsch. |
| `frontend/public/js/pages/mitarbeiter.js:2655` | Nachts 00:00-02:00 zeigt die Mitarbeiterliste veraltete Einsatzzustaende; heute endende Einsaetze werden nicht als 'endet heute' markiert. |
| `frontend/public/js/pages/timesheets.js:657` | Nachts 00:00-02:00 rutscht das voreingestellte Wochenfenster auf So-Do. Die Stundenzettel-Liste startet mit einem falschen Zeitraum und blendet den Freitag aus. |

---

*Nächster Schritt: **Welle F2** (beheben, nach Fehlerklasse getrennt), dann **F3***
*(Wächtertest, der neue rohe UTC-Schnitte meldet — übertragbar auf die Folgeprojekte).*
