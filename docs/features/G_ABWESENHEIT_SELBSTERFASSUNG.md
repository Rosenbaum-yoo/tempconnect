# G — Abwesenheit, vom Menschen selbst gemeldet

> **Stand: 2026-08-15** · Owner-Entscheidungen dieser Sitzung eingearbeitet
> **Grundlage:** [E_LIVE_BELEGSCHAFT.md](E_LIVE_BELEGSCHAFT.md) — Welle E2 hat die
> Datenschicht gebaut (`worker_absences`, Mig 177), aber ausdrücklich offen
> gelassen, dass **nur der Disponent** erfasst.

---

## Die Leitfrage

Eine Krankmeldung passiert morgens um sechs. Im Büro sitzt niemand. Heute heißt
das: Der Mensch ruft an, erreicht niemanden, schreibt vielleicht eine Nachricht —
und die Tafel zeigt ihn bis neun Uhr als verfügbar. Der Disponent plant mit
jemandem, der nicht kommt.

**Die Frage ist nicht „wie bauen wir ein Formular", sondern: wie erfährt das Büro
rechtzeitig genug, um noch umdisponieren zu können — ohne dass die Meldung so
leicht wird, dass sie aus Bequemlichkeit benutzt wird?**

---

## Die vier Owner-Entscheidungen

| | Entscheidung | Konsequenz |
|---|---|---|
| **G-E1** | **Sofort wirksam**, nicht auf Antrag | Wer krank meldet, ist ab sofort abwesend. Der Disponent korrigiert, wenn nötig — er genehmigt nicht vorab. |
| **G-E2** | **Rückfall auf Antragspflicht muss möglich sein** | Als **Schalter je Zeitarbeitsfirma**, nicht als Code-Änderung. Standard: sofort wirksam. Wer Missbrauch erlebt, stellt um. |
| **G-E3** | **Alle vier Arten** (krank · urlaub · termin · sonstiges) | Kein Sonderweg je Art im Ablauf; der Unterschied liegt in der Pflicht zur Begründung. |
| **G-E4** | **Beides als Ort, und zwar sofort** | Direkt im Einsatzportal **und** eine eigene Seite über einen Reiter links. Nicht „später". |

**G-E5 — Owner-Entscheidung, im Verlauf ergänzt: Die Meldung muss schwer genug sein, dass sie
niemand versehentlich auslöst.** Mehrere Schritte, bewusst unbequem — damit sie
in ernsten Fällen benutzt wird und nicht, wenn jemand sich verspätet und es eilig
hat.

---

## Die Ergänzung, ohne die G-E5 nicht funktioniert

**Reibung wirkt nur, wenn der leichte Fall einen eigenen leichten Weg hat.**

Gibt es nur eine schwere Tür, wird sie für alles benutzt — auch für „ich bin 20
Minuten später". Dann steht der Mensch als *abwesend* im System, obwohl er
kommt, seine Einsätze werden freigegeben und das Büro disponiert um. Der Schaden
ist größer als der, den die Hürde verhindern sollte.

Deshalb bekommt der kleine Anlass seinen eigenen, schnellen Knopf:

| Anlass | Weg | Wirkung |
|---|---|---|
| **„Ich verspäte mich um X"** | ein Tippen, Minutenangabe, fertig | Meldung ans Büro. **Keine** Abwesenheit, keine Freigabe von Einsätzen. |
| **Abwesenheit** | mehrstufig, mit Begründung und Folgenhinweis | Der Mensch ist abwesend, Einsätze werden zur Umdisposition markiert. |

Erst dadurch darf die zweite Tür so schwer sein, wie sie sein soll.

---

## Wie die Hürde aussieht (G-E5, konkret)

Kein Knopf, der eine Abwesenheit auslöst. Stattdessen drei Schritte, die
*inhaltlich* etwas verlangen — nicht bloß dreimal „Weiter":

1. **Art wählen** — krank, urlaub, termin, sonstiges. Kein Vorbelegung.
2. **Zeitraum und Grund** — ab wann, voraussichtlich bis wann. Bei *sonstiges*
   und *termin* ist die Notiz Pflicht; bei *krank* genügt der Zeitraum.
3. **Folgen bestätigen** — der Schritt, der die Hürde trägt. Er zeigt **namentlich**,
   welche Einsätze dadurch offen werden, und verlangt eine ausdrückliche
   Bestätigung. Wer hier liest „Einsatz Müller GmbH, morgen 06:00 — wird zur
   Neubesetzung freigegeben", klickt nicht aus Versehen weiter.

Der dritte Schritt ist keine Schikane, sondern eine Information, die der Mensch
ohnehin haben sollte. **Eine Hürde, die nur nervt, wird umgangen; eine, die etwas
zeigt, wird gelesen.**

### G-E6 — Zeitsperre, eine Minute je Schritt (Owner-Entscheidung)

**Owner-Entscheidung:** Der Weiter-Knopf ist auf jeder Seite des Ablaufs für
**eine Minute gesperrt**. Drei Schritte, also rund drei Minuten bis zur Meldung.

Damit das trägt und nicht bloß ärgert, gelten drei Bedingungen:

1. **Serverseitig, nicht im Browser.** Eine per JavaScript gesperrte Schaltfläche
   ist über die Entwicklerkonsole in zehn Sekunden frei. Der Server merkt sich
   den Beginn des Vorgangs und **weist eine Meldung ab, die zu früh ankommt**
   (`429`, mit der Restzeit in der Antwort). Der Browser zeigt den Zähler nur an
   — die Regel liegt hinten.
2. **Die Wartezeit wird benutzt.** Währenddessen lädt und erscheint, was die
   Meldung kostet: die betroffenen Einsätze, namentlich, mit Datum und Kunde.
   Aus Strafzeit wird Lesezeit — und genau das hält jemanden auf, der nur schnell
   herauswollte.
3. **Die Verspätungsmeldung bleibt ungesperrt.** Sonst drängt die Hürde die
   Leute in die falsche Tür, und der Schaden wäre größer als der Nutzen.

**Der ehrliche Einwand, festgehalten:** Drei Minuten treffen den wirklich Kranken
genauso wie den Drückeberger — eine Zeitsperre unterscheidet nicht nach Absicht,
sondern nach Eile. Der Owner hat das abgewogen: Wer krank zu Hause liegt, kann
drei Minuten warten; wer nur zu spät dran ist, hat daneben den schnellen Knopf.
Sollte sich zeigen, dass Meldungen deshalb ausbleiben oder telefonisch
vorbeilaufen, ist die Dauer der erste Stellhebel — sie gehört deshalb in die
Konfiguration, nicht in den Code.

---

### G-E8 — mindestens 30 Wörter Beschreibung (Owner-Entscheidung)

Der Mensch muss beschreiben, **was vorgefallen ist** — mindestens 30 Wörter. Zweck:
Der Disponent soll beim Betreten des Büros verstehen, was los ist, und nicht erst
telefonieren müssen.

**Umgesetzt über strukturierte Fragen, nicht über ein leeres Textfeld.** Eine
Mindest-Wortzahl misst Aufwand, nicht Inhalt: Erzwungene 30 Wörter erzeugen
Füllsel („ich kann heute leider nicht kommen, weil ich krank bin, deshalb kann
ich heute nicht kommen"), und der Disponent liest anschließend mehr und weiß
weniger. Deshalb wird die Länge über **vier kurze Fragen** erreicht, deren
Antworten zusammengezählt werden:

| Frage | warum sie dem Büro hilft |
|---|---|
| Seit wann? | entscheidet, ob die heutige Schicht überhaupt noch zu retten ist |
| Voraussichtlich bis wann? | bestimmt, ob Ersatz für einen Tag oder eine Woche nötig ist |
| Arzt aufgesucht / Krankschreibung zu erwarten? | sagt, ob mit einer Verlängerung zu rechnen ist |
| Eingeschränkt einsetzbar? | manchmal geht leichte Tätigkeit — dann braucht es keinen Ersatz, sondern eine andere Schicht |

Fällt die Summe unter 30 Wörter, verlangt der letzte Schritt eine Ergänzung im
Freitext. **Die Prüfung liegt serverseitig**, wie die Zeitsperre — sonst ist sie
eine Empfehlung, keine Bedingung.

**Und dieser Text verlässt die Zeitarbeitsfirma nicht** (siehe G-E7): Er ist
genau die Sorte Angabe, die Art. 9 DSGVO schützt. Will der Disponent dem Kunden
etwas davon mitteilen, tut er das **bewusst und selbst** — das System leitet
nichts automatisch weiter.

### G-E7 — auch der Kunde wird benachrichtigt (Owner-Entscheidung)

Das Unternehmen, bei dem der Mensch im Einsatz ist, erfährt **zweimal** etwas:

1. **wenn die Kraft ausfällt** — damit es planen kann statt um sechs Uhr früh vor
   einer leeren Schicht zu stehen,
2. **wenn Ersatz gestellt ist** — das ist die eigentlich gute Nachricht und der
   Grund, warum die erste Meldung niemandem schadet.

**Aber: der Kunde erfährt NICHT, warum.** „Krank" ist ein Gesundheitsdatum und
gehört zu den besonderen Kategorien des Art. 9 DSGVO. Der Arbeitgeber — die
Zeitarbeitsfirma — darf es verarbeiten; der Kunde ist ein Dritter und braucht es
nicht: Für seine Planung genügt *dass* jemand ausfällt und *bis wann
voraussichtlich*.

| Empfänger | sieht | sieht nicht |
|---|---|---|
| Zeitarbeitsfirma (Arbeitgeber) | Art, Zeitraum, Notiz, wer gemeldet hat | — |
| Kunde (Einsatzunternehmen) | „fällt aus", voraussichtliche Dauer, betroffene Schicht, später: Ersatz | **die Art der Abwesenheit**, die Notiz |

Das ist keine Vorsicht, sondern die Trennlinie, an der Datenschutzverstöße in
dieser Branche üblicherweise passieren — und sie ist im Datenmodell schon
angelegt: `art` und `notiz` bleiben auf der Arbeitgeberseite.

---

## Was im Büro ankommen muss

Owner-Vorgabe: *„wenn der Zeitarbeitschef ins Büro kommt, weiß er direkt Bescheid
und kann umdisponieren — mit Vorschlägen."*

Das ist mehr als eine Benachrichtigung. Es sind drei Dinge:

1. **Die Meldung selbst**, sofort — nicht erst beim nächsten Laden der Seite.
2. **Die Folgen**, vorgerechnet: welche Einsätze sind jetzt unbesetzt, welche
   davon beginnen heute, welche sind kritisch.
3. **Vorschläge**, wer einspringen kann — die Plattform kennt Qualifikationen,
   Verfügbarkeit und Standort. Genau dafür gibt es bereits
   `assignmentStaffingService` mit Kandidaten-Bewertung.

---

## Wellen

| Welle | Inhalt | Gate |
|---|---|---|
| **G1** | Datenschicht: Quelle der Meldung (`quelle`: disponent \| mitarbeiter), Zustand (`wirksam` \| `beantragt`), Org-Schalter für die Antragspflicht | Eine Meldung des Mitarbeiters ist von einer des Disponenten unterscheidbar; der Schalter wirkt, ohne dass Code sich ändert |
| **G2** | Backend: Endpunkt für den Mitarbeiter, mit Rechteprüfung „nur die eigene Person" und der Folgen-Vorschau (welche Einsätze) | Fremde Profil-ID → 403; die Vorschau nennt dieselben Einsätze, die danach wirklich freigegeben werden |
| **G2c** | Mindestbeschreibung serverseitig: vier strukturierte Fragen, Summe >= 30 Woerter, Pruefung im Backend | Eine Meldung mit zu kurzer Beschreibung wird abgewiesen — auch wenn sie den Browser umgeht; und der Text taucht in KEINER Kunden-Benachrichtigung auf |
| **G2b** | Zeitsperre serverseitig: Vorgang wird eröffnet, Meldung vor Ablauf → `429` mit Restzeit. Dauer aus der Konfiguration, nicht fest im Code | Eine Meldung, die den Browser umgeht und sofort abgeschickt wird, wird **abgewiesen** — nachgewiesen mit einem Test, der genau das tut |
| **G3** | Verspätungsmeldung als eigener, leichter Weg — ohne Abwesenheit | Eine Verspätung erzeugt **keine** Zeile in `worker_absences` und gibt keinen Einsatz frei |
| **G4** ✅ | Benachrichtigung ans Büro, sofort, mit den Folgen | Der Disponent sieht die Meldung ohne Neuladen; die Benachrichtigung führt zum betroffenen Einsatz, nicht auf eine Übersicht |
| **G4b** ✅ | Benachrichtigung an den Kunden — Ausfall und später Ersatz, **ohne die Art** | Ein Test weist nach, dass die Kunden-Benachrichtigung weder `art` noch `notiz` enthält, auch nicht in Zwischenfeldern; und dass die Ersatz-Meldung erst nach echter Neubesetzung geht |
| **G5** ✅ | Oberfläche im Einsatzportal: der dreistufige Weg + eigener Reiter links | Kein Zustand ohne Anzeige (Lade-, Leer-, Fehlerfall); der dritte Schritt zeigt echte Einsatzdaten, keine Platzhalter |
| **G6** ✅ | Umdisponieren mit Vorschlägen im Büro | Aus der Meldung heraus ist ein Ersatz in ≤ 3 Klicks vorgeschlagen und eingeladen |

**Reihenfolge:** G1 → G2 → G3 → G4 → G5 → G6. Die Oberfläche kommt nach dem
Endpunkt, weil sie sonst gegen Platzhalter gebaut wird — und die Vorschläge
zuletzt, weil sie ohne die Meldung nichts anzuzeigen haben.

---

## Welle G4 — was dabei herauskam *(2026-08-17)*

### Der Befund, der die Welle erklärt

Der Live-Weg für Benachrichtigungen war **an drei Stellen tot** — unabhängig
voneinander, und jedes Mal still:

1. **`pushToUser` hatte keinen einzigen Aufrufer.** Der SSE-Strom
   (`routes/notificationStream.js`) lief, war in `app.js` eingehängt, der
   Browser hing mit einer `EventSource` daran und bekam Heartbeats. Gesendet
   wurde nie etwas. Jede Benachrichtigung der ganzen Plattform landete in der
   Tabelle und wartete darauf, dass jemand die Seite neu lädt.
2. **`pageShell.js` rief `TC.toast(...)` als Funktion auf.** `TC.toast` ist ein
   Objekt (`.success/.error/.warning/.info/.show`). Der Aufruf warf jedes Mal
   einen `TypeError` — in einem `catch`, das nichts tut. Selbst ein Push wäre
   unsichtbar geblieben.
3. **`js/toast.js` wurde von keiner einzigen Seite geladen.** Eine vollständige
   Toast-Schicht mit Warteschlange, Varianten und Barrierefreiheit — und drei
   Module, die sie aufrufen (`pageShell.js`, `dealFeedbackModal.js`,
   `ratingModal.js`), jedes mit einer Wenn-vorhanden-Prüfung davor, die immer
   falsch war. **Dieser dritte Befund kam erst im Browser heraus**, nachdem die
   ersten beiden repariert und testgrün waren: `TC.toast` war schlicht
   `undefined`. Behoben, indem die Shell die Datei selbst nachlädt — ein Ort
   statt einer `<script>`-Zeile in 49 Seiten.

**Die Lehre, allgemeiner als diese Welle:** Ein `catch`, das nichts tut, macht
aus einem lauten Fehler eine stille Funktionslücke. Alle drei Stellen sahen im
Code vollständig aus; aufgedeckt hat sie nicht ein Test, sondern die Frage
**„wer ruft das eigentlich auf — und wer lädt es?"**. Ein Test auf „es wurde
eine Zeile geschrieben" hätte alle drei bestätigt, und ein Test auf „steht der
richtige Aufruf im Code" hätte die dritte durchgelassen: Die Reparatur war
korrekt und trotzdem wirkungslos, weil das Aufgerufene nie im Browser ankam.

**Erzwungen wird das jetzt** von `g4BenachrichtigungBuero.test.js` → „toast.js
wird auch WIRKLICH GELADEN". Gegengeprüft mit einer Mutation: Zielpfad auf eine
nicht existierende Datei geändert → Test rot. Er misst, was er behauptet.

Dazu kam ein dritter, kleinerer: `EVENT_CATEGORY_MAP` fällt für unbekannte
Schlüssel auf `match_alerts` zurück. Ohne eigenen Eintrag hätte ausgerechnet die
Krankmeldung am Schalter für Marktplatz-Treffer gehangen — wer den Marktplatz-
Lärm abstellt, hätte ab da keine Krankmeldungen mehr bekommen und es nie
erfahren. Neue Kategorie: `workforce_updates`.

### Was gebaut wurde

| Baustein | Wo |
|---|---|
| Zwei Meldungstypen im CHECK, additiv aus dem Bestand (Muster 171) | `sql/migrations/183_meldung_erreicht_das_buero.sql` |
| Zwei Matrix-Einträge (`warning` für Abwesenheit, `info` für Verspätung) | `services/notificationMatrix.js` |
| **Der SSE-Push nach dem Schreiben** — `RETURNING` + `pushToUser` in `dispatch()` | `services/notificationMatrix.js` |
| `benachrichtigeBuero()` — Empfänger über `worker.manage`, Folgen über `folgenVorschau()` | `services/workerAbsenceService.js` |
| Beide Routen verdrahtet, Antwort nennt `buero_benachrichtigt` | `routes/workerPortal.js` |
| Eigene Einstellungs-Kategorie `workforce_updates` | `services/matchAlertService.js` |
| Klickbarer Toast (echtes `<a>`, Fokusring) | `frontend/public/js/toast.js` |
| Der reparierte Aufruf, Auswertung von `link_path`, **Nachladen von `toast.js`** | `frontend/public/js/pageShell.js` |
| Reiter aus der Adresse, Zeilen-Fokus über `data-person` | `frontend/public/js/pages/mitarbeiter.js` |
| Hub-Karten-Abzeichen (Spiegel der Surface-Map) | `frontend/public/js/hubCardBadges.js` |

**Beleg:** `api/test/g4BenachrichtigungBuero.test.js` — 30 Tests, die den WEG
prüfen statt des Ergebnisses: dass der Empfängerkreis aus `rbacService.PERMISSIONS`
kommt (nicht aus einer abgeschriebenen Rollenliste), dass die Mandantengrenze im
Statement steht, dass die 30-Wörter-Beschreibung in **keinem** Feld der
Benachrichtigung auftaucht, dass die Verspätung die Folgen-Vorschau gar nicht
erst abfragt — und dass `pushToUser` an einer echten, über den Router
registrierten Verbindung ein gültiges SSE-Bild schreibt.

Dazu `api/test/integration/g4Benachrichtigung.flow.test.js` (5 Tests) **gegen das
echte Schema**: Ein Mock kann keinen CHECK-Constraint erzwingen — er nimmt jeden
Typ an, auch einen, den Postgres ablehnt. Genau daran ist diese Codebasis bei
Migration 139 schon einmal gescheitert. Belegt wird dort, dass die neuen Typen
wirklich durchgehen, dass ein erfundener Typ weiterhin abgewiesen wird (der
Constraint lebt noch), und dass die additive Migration den Altbestand nicht
verloren hat.

### Drei Entscheidungen, die getroffen wurden

- **Der Link führt zur Person, nicht auf eine Übersicht.**
  `?person=<profil>#live-abwesend` öffnet die Live-Belegschaft, gefiltert, mit
  hervorgehobener Zeile — und in dieser Zeile stehen Kunde, Einsatz und
  Enddatum. Welle E4 hatte den Hash-Mechanismus bereits vorgesehen („später aus
  einer Benachrichtigung"), aber der **Reiter** wurde beim Laden nie
  umgeschaltet: Wer den Link öffnete, landete auf der Mitarbeiterliste.
- **Die Beschreibung fährt nicht mit.** Sie ist der Grund, warum es die vier
  Fragen gibt — aber der Nachrichtentext läuft über Kanäle, die sie nicht
  brauchen (Sperrbildschirm-Vorschau, später Slack/Teams). In der Nachricht
  steht, was zum Umdisponieren nötig ist: wer, welche Art, ab wann, wie viele
  Einsätze, der erste namentlich. Die Beschreibung ist einen Klick entfernt.
- **E-Mail wird angeboten, nicht erzwungen.** `getUserPreferences` kennt einen
  Weg, die Einstellung zu übergehen (urgent/Notdienst bekommen immer Mail). Für
  eine Krankmeldung wäre das der falsche Griff — sie ist nicht selten. Ein nicht
  abschaltbarer Mailstrom wäre der schnellste Weg dahin, dass der Disponent alle
  Mails der Plattform in einen Ordner filtert; dann verliert auch der echte
  Notdienst seine Wirkung.

### Was G4 ausdrücklich NICHT ist

Die Vorschläge, wer einspringt, sind **G6**. Die Owner-Vorgabe nennt drei Dinge
in einem Satz („weiß direkt Bescheid und kann umdisponieren — mit Vorschlägen");
G4 ist nur das erste. Die zweite Hälfte — die Folgen, vorgerechnet — stand
bereits mit `folgenVorschau()` und wird hier nur benutzt, nicht neu gebaut.

---

## Was hier ausdrücklich nicht gebaut wird

- **Keine Krankschreibung als Datei.** Ein hochgeladenes Attest ist ein eigenes
  Thema (Aufbewahrung, Zugriff, Löschfrist) und gehört nicht in eine
  Abwesenheitsmeldung.
- **Keine Lohn- oder Urlaubskontenlogik.** Wie viele Urlaubstage jemand hat,
  entscheidet die Zeitarbeitsfirma in ihrem System, nicht hier.
- **Keine automatische Umdisposition.** Die Plattform schlägt vor; der Mensch
  entscheidet. Ein System, das eigenmächtig umbesetzt, verliert das Vertrauen
  beider Seiten.

---

## Welle G4b — was dabei herauskam *(2026-08-18)*

### Der Befund, der die Welle geformt hat

**`fuerKunde()` hatte bis zu dieser Welle keinen einzigen Produktionsaufrufer.**
Die Funktion stand seit G2c da, mit Test und Kommentar — aber nichts im Code
zwang irgendeinen Pfad durch sie hindurch. Die Zusage „der Kunde erfährt nicht,
warum" war reine Absicht. Das ist dieselbe Klasse Befund wie die drei toten
Stellen aus G4, nur eine Ebene abstrakter: nicht „wer ruft das auf", sondern
**„was erzwingt, dass es aufgerufen wird".**

**Und `fuerKunde()` allein hätte auch nicht gereicht.** Sie schützt das *Objekt*.
Der Weg, auf dem die Art tatsächlich entkommen wäre, ist der **Text**:
`dispatch()` schreibt `context.message` unverändert in die Tabelle, schickt ihn
als Mailtext und reicht ihn an Slack/Teams weiter. Die Vorlage aus G4 baut ihren
Text wörtlich aus Name und `absence.art` — wer sie kopiert hätte, hätte „krank"
in die Kundenmeldung, in dessen Postfach und in dessen Chat geschrieben, während
`fuerKunde()` danebensteht und formal recht behält.

**Die Antwort darauf:** `kundenNachricht()` nimmt **kein Abwesenheits-Objekt**
entgegen, sondern nur einzelne, benannte Werte. Was nicht übergeben werden kann,
kann auch nicht durchrutschen — auch nicht bei dem Feld, das jemand nächstes
Jahr ergänzt. Das ist eine Stufe strenger als eine Positivliste auf einem
Objekt: **es gibt kein Objekt.**

### Der Bestandsfehler, der nebenbei auffiel

**Vier Notdienst-Benachrichtigungen konnten nie entstehen.** `notifications.severity`
erlaubt laut CHECK (Migration 019) nur `info | warning | error | success`; vier
Einträge der Matrix trugen `urgent`. Gegen die laufende Datenbank verifiziert:
Der INSERT wird mit `check_violation` abgewiesen. Ausgerechnet der dringlichste
Fall der Plattform kam nie an — und niemand hat es gemerkt, weil `dispatch()`
den Fehler nicht meldet.

Behoben durch `severity: 'warning'`, **nicht** durch Erweitern des CHECKs. Der
Grund ist die Wirkungsrichtung: Das Frontend kennt `urgent` gar nicht — weder
die Toast-Varianten noch die Stufen-Abbildung der Shell. Eine so markierte
Meldung wäre auf `info` zurückgefallen und hätte damit **harmloser** ausgesehen
als eine gewöhnliche Warnung. Die Dringlichkeit geht dabei nicht verloren: Ob
eine Mail zwingend rausgeht, entscheidet `getUserPreferences` am
Ereignisschlüssel (`emergency.*`), nicht an der Stufe. Sie steuert die Optik,
nicht die Zustellung.

### Drei Entscheidungen, die getroffen wurden

- **Der Empfänger kommt aus `assignments.org_id`, nicht aus
  `worker_assignment_links.org_id`** — obwohl letztere NOT NULL ist und
  griffbereit wäre. Sie wird in `routes/workers.js` ungeprüft aus dem
  Anfrage-Rumpf übernommen (`orgId: parsed.data.org_id`) und nie gegen den
  Einsatz abgeglichen. Wer sie als Empfängerkreis benutzt, lässt den Aufrufer
  bestimmen, welche fremde Firma eine Ausfallmeldung bekommt.
  **Verfügbarkeit schlägt nicht Vertrauenswürdigkeit.** Weichen beide
  voneinander ab, wird gar nicht gesendet (`ORG_DIVERGENZ`).

- **Kunde = Lieferant heißt: keine Meldung.** In den echten Daten betrifft das
  **6 von 24** Verknüpfungen — interne Einsätze. Ohne diese Prüfung bekäme das
  Büro dieselbe Sache zweimal: einmal als Arbeitgeber *mit* Art, einmal als
  „Kunde" ohne. Das ist nicht nur Lärm — es stellt beide Meldungen nebeneinander
  und macht die Reduktion sichtbar sinnlos.

- **Eine nur beantragte Meldung verlässt den Betrieb nicht.** Bei eingeschalteter
  Freigabepflicht (G-E2) hat die Firma noch nicht entschieden; das nach außen zu
  tragen hieße, eine Entscheidung zu melden, die drinnen aussteht. Die
  Absendebedingung ist exakt `fuerKunde().faellt_aus` — dieselbe Regel, an
  derselben Stelle kodiert.

### Was gebaut wurde

| Baustein | Wo |
|---|---|
| Zwei Kundentypen im CHECK, additiv aus dem Bestand | `sql/migrations/184_der_kunde_erfaehrt_dass_nicht_warum.sql` |
| `benachrichtigeKunde()` — je betroffenem Einsatz einmal | `services/workerAbsenceService.js` |
| `kundenNachricht()` — nimmt **nur Primitive** entgegen | `services/workerAbsenceService.js` |
| `kundeIstEmpfangsberechtigt()` — drei Gründe, nicht zu senden | `services/workerAbsenceService.js` |
| `folgenVorschau()` um Kunden-Org **und** Verknüpfungs-Org erweitert | `services/workerAbsenceService.js` |
| `listAbsences()` um `zustand` erweitert — stille Falle geschlossen | `services/workerAbsenceService.js` |
| Ausfall bei der Selbstmeldung | `routes/workerPortal.js` |
| **Entwarnung** beim Aufheben | `routes/workers.js` |
| **Ersatz** nach echter Neubesetzung, nach dem COMMIT | `routes/workers.js` |
| Vier Notdienst-severities repariert + `ERLAUBTE_SEVERITY` | `services/notificationMatrix.js` |
| Eigene Einstellungs-Kategorie `client_assignment_updates` | `services/matchAlertService.js` |
| Aktivitätsliste: G4- **und** G4b-Typen, plus `milestone`/`bounty_*` | `frontend/public/js/pages/activity.js` |

**Die stille Falle in `listAbsences()`:** Die Abfrage selektierte `zustand`
nicht. `fuerKunde()` auf eine Zeile aus dieser Liste hätte deshalb **immer**
`faellt_aus: false` geliefert — lautlos, weil `undefined === "wirksam"` schlicht
falsch ist. Ein Aufrufer, der die Kundenmeldung aus einer Liste speist statt aus
dem `RETURNING` des INSERT, hätte damit jeden Ausfall als „kein Ausfall"
gemeldet.

### Das Register hat acht Einträge, nicht vier

G4 hatte vier gepflegt und dabei einen **fünften übersehen**:
`frontend/public/js/pages/activity.js` kannte die neuen Typen nicht — dort
erschien der rohe Schlüsselname als Beschriftung, und unter jedem
Kategoriefilter verschwand die Meldung ganz. Dass dort auch `milestone` und
`bounty_*` fehlten, belegt: **diese Kopie prüfte kein Wächter.** Seit G4b tut es
einer, und der G4-Rückstand ist mit nachgetragen.

### Belege

`api/test/g4bKundenBenachrichtigung.test.js` — 35 Tests. Die tragenden:

- **Kein Parameter des INSERTs** trägt Art, Notiz oder Beschreibung — geprüft
  über den *gesamten* Parametersatz, nicht über die `message` allein, mit einer
  Wortliste (`krank`, `Grippe`, `Fieber`, `Hausarzt`, …).
- Auch ein **später ergänztes Feld** (`diagnose_code`, `zusatz`) rutscht nicht
  durch.
- Auch **Titel und Typname** verraten nichts — sie erscheinen in Push-Bannern,
  Betreffzeilen und Filtern, wo der Empfängerkreis ein anderer sein kann.
- Der Empfängerkreis wird in der **Kunden-Org** gesucht, nicht beim Lieferanten.
- **Jede `severity` der Matrix** ist ein Wert, den die Datenbank erlaubt — der
  Wächter, der den Notdienst-Befund aufgedeckt hat. Er importiert
  `ERLAUBTE_SEVERITY` statt die Liste zu wiederholen.

`api/test/integration/g4bKundenMeldung.flow.test.js` — 8 Tests **gegen das echte
Schema**: dass beide Typen im CHECK angekommen sind, dass der Altbestand nicht
verloren ging, dass die Konstante `ERLAUBTE_SEVERITY` mit dem echten CHECK
übereinstimmt, und dass **jedes** Matrix-Ereignis wirklich durchgeht — der
Gegenbeweis zum Notdienst-Befund.

### Was G4b nicht ist

Die **Oberfläche des Kunden zeigt den Ausfall noch nicht.**
`getCompanyLiveWorkforce` berührt `worker_absences` gar nicht — der Deep-Link
führt auf die Kundenansicht, aber diese Ansicht kennt den Zustand „fällt aus"
noch nicht. Das ist die konsequente Fortsetzung und gehört in **G5**, wo die
Oberflächen ohnehin gebaut werden. Bis dahin trägt die Benachrichtigung selbst
die Information (Name, Kunde, Zeitraum) — sie ist nicht auf das Ziel angewiesen,
um verständlich zu sein.

---

## Welle G5 — was dabei herauskam *(2026-08-18)*

### Drei Befunde, die die Welle geformt haben

**1. Der alte, leichte Abmeldeweg stand die ganze Zeit offen.**
`einsatzportal-einsaetze.html` trug einen Knopf mit exakt demselben Wort
(„Abwesenheit melden") und führte auf
`POST /worker/assignments/:id/report-unavailable`: ein Datum, ein optionaler
Freitext, abschicken. Keine Zeitsperre, keine 30 Wörter, keine Folgenanzeige,
keine Kundenmeldung. **Solange er offenstand, war die dreistufige Hürde aus
G-E5 Dekoration** — wer es eilig hatte, nahm diese Tür. Der Knopf leitet jetzt
auf den neuen Ablauf um; der Endpunkt bleibt für andere Aufrufer bestehen.

**2. `429` verlor seinen Rumpf, bevor der Browser ihn sah.**
`portalApi.js` warf bei 429 **vor** dem Lesen der Antwort, ohne Detaildaten.
Damit erreichte `verbleibend_sekunden` den Browser nie — der Zähler der
Zeitsperre hätte nie eine echte Zahl zeigen können. Und unter 429 liegen zwei
verschiedene Dinge: die fachliche Zeitsperre (`ZEITSPERRE`) und das technische
Anfragenlimit (`RATE_LIMIT`), nur am Rumpf zu unterscheiden. Zentral repariert
— **an beiden Stellen**, die zweite steckte in `upload()`.

**3. Der Slug `abmelden` war bereits vergeben — als Logout-Icon.**
Eine Seite `einsatzportal-abmelden.html` hätte über `_iconKeyFromHref`
automatisch die Tür-mit-Pfeil bekommen, im Englischen „Sign out" geheißen und
in der Seitenleiste direkt über dem echten Abmelden-Knopf gestanden. Der Slug
heißt deshalb `abwesenheit`. *(Nebenbedingung des Icon-Wächters: der Dateiname
darf nur `a-z` enthalten — ein Bindestrich fällt lautlos aus der Icon-Pflicht.)*

### Was gebaut wurde

| Baustein | Wo |
|---|---|
| Die Seite mit dem dreistufigen Ablauf | `einsatzportal-abwesenheit.html` |
| Die Logik: Schritte, Zähler, Entwurf, Folgen | `js/workerPortal/portalAbwesenheit.js` |
| Der leichte Verspätungsweg — **zuerst** auf der Seite | dieselbe Seite |
| Icon, DE/EN-Beschriftungen, Aufnahme-Ausnahme | `js/workerPortal/portalShell.js` |
| Der Reiter in **allen acht** Seiten, Seitenleiste + Kurznavigation | alle `einsatzportal-*.html` |
| Prominenter Zugang direkt unter dem Hero | `einsatzportal-dashboard.html` |
| Umleitung des alten Weges | `einsatzportal-einsaetze.html` |
| **`GET /worker/me/abwesenheiten`** — die Quittung | `routes/workerPortal.js` |
| `429` trägt seinen Rumpf bis in den Browser | `js/workerPortal/portalApi.js` |

### Sechs Entscheidungen, die getroffen wurden

- **Die Uhr startet bei der Art-Wahl**, nicht beim Öffnen der Seite. Wer nur
  nachsieht, was es gibt, löst keine Sperre aus; wer eine Art wählt, hat
  begonnen. Die Wartezeit läuft dann während des Tippens ab — genau das meint
  G-E6: *aus Strafzeit wird Lesezeit*.
- **Der Absenden-Knopf wird nie hart gesperrt.** Die Zeitsperre liegt hinten und
  wird dort geprüft. Ein clientseitig gesperrter Knopf wäre eine Attrappe (über
  die Entwicklerkonsole in zehn Sekunden frei) und würde bei driftendem Zähler
  jemanden aussperren, der längst darf. Der Server antwortet, die Oberfläche
  zeigt die Antwort.
- **Der Zähler gleicht sich bei `visibilitychange` ab.** Ein Mobil-Tab im
  Hintergrund friert Timer ein; ohne Abgleich zeigt die Seite eine Zahl, die mit
  dem Server nichts mehr zu tun hat.
- **Ein Entwurf überlebt den Fehlversuch.** Die vier Antworten liegen in
  `sessionStorage`. Ohne ihn löschte ein Fehler im dritten Schritt 30 mühsam
  getippte Wörter — der Ablauf wäre nach dem ersten Fehlversuch unzumutbar.
- **Leer und fehlgeschlagen sind unterscheidbar.** Schlägt die Folgen-Abfrage
  fehl, steht das dort — nicht „kein Einsatz betroffen". Sonst meldet sich
  jemand ab im Glauben, es sei nichts zu verlieren.
- **Die Erfolgsmeldung beschönigt nicht.** War niemand mit Zuständigkeit
  erreichbar (`buero_benachrichtigt: 0`), rät die Meldung zum zusätzlichen
  Anruf. Ein pauschales „erledigt" wäre genau die Beschönigung, die der
  Route-Kommentar vermeidet.

### Im Browser gemessen, nicht geschätzt

Die Kurznavigation hat jetzt **sieben** Einträge. Bei **320 px** (iPhone SE,
das schmalste real vorkommende Gerät) teilen sie sich je **45 px**; kein
Eintrag bricht um, der knappste („Stunden", 36 px) behält 8 px Luft. Ein achter
Eintrag drängte das unter die Grenze — deshalb ist die Zahl per Test
festgehalten.

Dabei fiel auf, dass die neue Seite versehentlich `Plan` **ersetzt** statt
ergänzt hatte und damit eine andere Leiste trug als die übrigen sieben. Die
Navigation ist in jeder Seite dupliziert; genau deshalb prüft jetzt ein Wächter,
dass alle acht dieselbe Reihenfolge zeigen.

### Belege

`api/test/g5AbwesenheitOberflaeche.test.js` — 33 Tests. Sie prüfen durchgehend
**wer etwas aufruft, lädt und erreicht**, nicht wie es aussieht:

- die Seite lädt ihre eigene Logik (die G4-Lehre: `toast.js` war gebaut und von
  niemandem eingebunden),
- jeder der drei Zustände hat eine Anzeige — bei **jeder** der drei Listen,
- `pruefeAbsenden()` wertet die Zeitsperre **nicht** aus,
- die vier Fragen stehen **wortgleich** in Oberfläche und Dienst (der Server
  legt seinen Fragetext mit der Antwort in die Akte — Abweichung hieße, der
  Disponent liest eine andere Frage als die beantwortete),
- Mindestwortzahl und Verspätungsgrenze werden gegen die Dienst-Konstanten
  gehalten, nicht gegen Literale,
- alle acht Seiten führen hin, in identischer Reihenfolge,
- der alte Weg ist wirklich weg,
- beide `429`-Stellen sind versorgt.

### Was G5 nicht ist

**Die Kundenansicht zeigt den Ausfall weiterhin nicht.**
`getCompanyLiveWorkforce` berührt `worker_absences` nach wie vor nicht — der
Deep-Link der G4b-Kundenmeldung führt auf eine Ansicht, die den Zustand „fällt
aus" nicht kennt. Das ist bewusst **nicht** in dieser Welle gebaut: G5 ist die
Oberfläche für den Arbeiter, und die Kundenseite braucht eine eigene
Entscheidung darüber, wo der Zustand erscheint (Live-Reiter, Stundenzettel oder
eigene Karte) — mit der Auflage „ohne die Art".

**Ein End-to-End-Durchlauf mit echter Anmeldung fehlt.** Geprüft ist: die Seite
und ihre Logik werden ausgeliefert, der neue Endpunkt antwortet (401 ohne
Sitzung), die Navigation misst sich bei 320 px sauber, und die Konsole zeigt
kein anderes Verhalten als die Bestandsseiten. Nicht geprüft ist der vollständige
Ablauf mit Anmeldung, drei Minuten Wartezeit und echter Meldung.

**Offener Bestandsbefund:** Alle Portalseiten — auch die bestehenden — werfen
ohne Anmeldung ein unbehandeltes `PortalApiError: NOT_AUTH` in die Konsole,
bevor sie korrekt zum Login umleiten. Kein Funktionsfehler, aber die
Konsolen-Sauberkeit aus CLAUDE.md verlangt eine eigene Runde dafür.

---

## Welle G6 — was dabei herauskam *(2026-08-18)*

### Der Befund, der schwerer wog als das Gate

**Die Kandidatenliste kannte `worker_absences` nicht.** Der Dienst, aus dem das
Büro einen Ersatz wählt, hatte null Referenzen darauf. Ein krank Gemeldeter
stand im Vorschlag für genau den Einsatz, der durch eine andere Krankmeldung
frei wurde.

Der bestehende Konflikt-Block deckte das nicht ab, und das ist kein Versehen,
sondern eine Feinheit des Schemas: **Eine Abwesenheit ist kein Einsatz.** Sie
hängt am Profil (Mig 177), nicht am Konto, und erzeugt deshalb keinen einzigen
Konflikt in `worker_assignment_links`.

**Schlimmer als die fehlende Prüfung war die falsche Zusicherung.** Zwei Namen
versprachen Verfügbarkeit und meinten etwas anderes:

| Name | verspricht | tat |
|---|---|---|
| `availabilityMatch`, Gewicht **25** von 100 | Verfügbarkeit | vergleicht Stichworte aus dem **Freitextfeld** `availability_note` |
| `onlyAvailable: true` | „nur Verfügbare" | prüfte nur Doppelbelegung mit Einsätzen und Reservierungen |

Wer den Filter setzte, glaubte geprüft zu haben.

### Und die Reparatur war zuerst nur halb

Die erste Fassung erhob den Zähler und sperrte die Schnellzuweisung — aber
`is_selectable` und `can_invite` blieben wahr. Ein Abwesender überlebte damit
`hardOnly=true` und `includeBlocked=false`, konnte Rang 1 mit dem Etikett „hoch"
tragen und wurde an **sechs** Stellen als einladbar behandelt, darunter die
Wartelisten-Saat der Staffing-Kampagne. Gesperrt war nur der eine Weg, den man
sich zuerst ansieht.

Das Gate verlangt wörtlich „vorgeschlagen **und eingeladen**" — die halbe Sperre
ließ genau die zweite Hälfte offen. Abwesenheit steht jetzt in den
`hard_failures`: **eine** Aussage an **einer** Stelle, die alle sechs Filter
erben.

### Der Testbefund, der mehr wiegt als der Fix

Die erste Testfassung suchte im **Quelltext** nach `absenceConflictCount > 0`.
Eine Mutation zu `if (false && absenceConflictCount > 0)` **hat das überlebt** —
die Zeichenkette steht ja weiterhin da. Der Test prüfte Schreibweise, nicht
Entscheidung.

Das ist dieselbe Lektion wie die durchgehende dieses Repos („ein Test, der das
Ergebnis prüft statt welche Abfrage lief"), eine Ebene höher. Deshalb ist
`scoreWorkersForAssignment` jetzt exportiert — rein synchron, der
Client-Parameter war ohnehin unbenutzt. Sechs Verhaltenstests ersetzen die
Textsuche; beide Mutationen sterben.

### Der Rückweg — Owner-Entscheidung 2026-08-18

`cancelAbsence` fasst ausschließlich `worker_absences` an. Wird eine Abwesenheit
aufgehoben, gilt der Mensch wieder als verfügbar, **aber sein Einsatz ist weg**:
Der Alt-Link steht auf `worker_unavailable`, dort sitzt der Ersatz.

Seit G4b hatte das eine zweite Seite: Der Kunde bekam eine **Entwarnung**
(„fällt doch nicht aus"). Für die Person stimmte sie — für seinen Einsatz nicht.
Der Kunde plante mit zwei Leuten auf einer Stelle. Die Entwarnung geht jetzt nur
noch raus, wenn **kein** Ersatz dort steht.

**Es wird nichts automatisch zurückgedreht.** Der Plan sagt „Keine automatische
Umdisposition — die Plattform schlägt vor, der Mensch entscheidet". Beim
Zurückdrehen wäre es sogar schwerer: Der Ersatz hat die Zusage und hat
vielleicht Anderes abgesagt. Die Route **antwortet** — namentlich, nicht als
Zahl.

**Was die echten Daten sofort zeigten:** Die erste Fassung meldete bei einem
mehrfach besetzten Einsatz **drei** „Ersätze", von denen zwei knapp zwei Monate
*vor* der Freistellung angefangen hatten — Kollegen, keine Nachfolger.
`reportUnavailable` setzt dieselben Felder wie die Ersetzung; eine bloße
Freistellung sieht am Alt-Link identisch aus. Mit
`neu.start_date >= alt.unavailable_from` bleibt der echte übrig (3 → 1).

### Der Weg: drei Klicks, und keiner mehr

| Klick | wo |
|---|---|
| 1 | „Ersatz suchen" in der Zeile der abwesenden Person (Live-Belegschaft) |
| 2 | „Einsetzen" beim gewählten Kandidaten |
| 3 | „Verbindlich einsetzen" in der Rückfrage |

**Der dritte ist keine Schikane, sondern die einzige Bremse vor einer
unumkehrbaren Handlung.** Die Zuweisung gilt sofort (`auto_confirmed`), der
Ersatz bekommt die Zusage, der Kunde eine Meldung — einen automatischen Rückweg
gibt es nicht. Wer das auf zwei Klicks bringt, macht das Versehen billiger als
die Absicht.

**Die Begründung wird vorbelegt, nicht getippt.** `replaceAssignmentWorker`
verlangt einen Grund fürs Audit. Ihn tippen zu lassen kostete den vierten
Schritt und brächte weniger: *„Ersatz für Max Mustermann, abwesend ab 20.08."*
ist präziser als jeder Text, den jemand um sechs Uhr früh eingibt — und er
stimmt immer.

Dazu: `wal.id AS link_id` wandert jetzt bis in die Tafel. Der Ersatz braucht die
**Verknüpfung**, nicht den Einsatz — ein Einsatz kann mehrere Kräfte tragen.

### Belege

`api/test/g6ErsatzVorschlaege.test.js` — 41 Tests:

- **Verhalten** statt Quelltext, wo es zählt: `scoreWorkersForAssignment` bekommt
  Kandidatenzeilen und wird an `is_selectable`/`can_invite`/`quick_assign_eligible`
  gemessen, mit Gegenprobe (ohne Abwesenheit bleibt alles offen)
- die Rückweg-Abfrage: Nachfolger nur nach der Freistellung, nur andere
  Personen, Mandantengrenze an beiden Verknüpfungen
- der Klick-Weg: Klick 1 nur mit `link_id` (sonst Sackgasse), Klick 2 setzt noch
  nicht ein, kein Eingabefeld für den Grund (das wäre der vierte Schritt),
  Doppelklick-Schutz, Zustand in Modul-Variablen (die Tafel lädt alle 30 s neu)

Gegen die echte Datenbank ausgeführt: die Rückweg-Abfrage findet die bestehende
Ersatz-Kette, und `link_id` kommt bis in die Live-Tafel durch.

### Was G6 nicht ist — und ein Befund, der bleibt

**Die Kundensperre wird im Einladungsweg nicht geprüft.**
`isWorkerBlockedForCompany` wird im gesamten Backend an **zwei** Stellen
aufgerufen (`workerService.js:1605` und `:1910`). Der Weg
`createStaffingCampaignInternal` → `promoteReservationInternal` →
`createWorkerAssignmentLink` prüft sie **nirgends**. Damit ist die Kette
Einladung → Annahme → Promotion ein vollständiger Umgehungsweg um die
Kundensperre.

Das ist älter als G6 und unabhängig davon ein Compliance-Defekt. Der hier
gebaute Weg ist **nicht** betroffen — er läuft über `replaceAssignmentWorker`,
und das prüft (Zeile 1910). Als eigene Aufgabe ausgelagert, weil ein
Sicherheitsfix an drei Stellen eigene Sorgfalt braucht.

**Nicht gebaut:** der Einladungsweg (Owner-Entscheidung: Direktzuweisung), ein
automatischer Rückweg (bewusst: keine Eigenmacht), und ein Durchlauf mit echter
Anmeldung — geprüft ist, dass Seite, Logik und Kette ausgeliefert werden und
kein Handler ins Leere zeigt.
