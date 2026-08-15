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
| **G4** | Benachrichtigung ans Büro, sofort, mit den Folgen | Der Disponent sieht die Meldung ohne Neuladen; die Benachrichtigung führt zum betroffenen Einsatz, nicht auf eine Übersicht |
| **G4b** | Benachrichtigung an den Kunden — Ausfall und später Ersatz, **ohne die Art** | Ein Test weist nach, dass die Kunden-Benachrichtigung weder `art` noch `notiz` enthält, auch nicht in Zwischenfeldern; und dass die Ersatz-Meldung erst nach echter Neubesetzung geht |
| **G5** | Oberfläche im Einsatzportal: der dreistufige Weg + eigener Reiter links | Kein Zustand ohne Anzeige (Lade-, Leer-, Fehlerfall); der dritte Schritt zeigt echte Einsatzdaten, keine Platzhalter |
| **G6** | Umdisponieren mit Vorschlägen im Büro | Aus der Meldung heraus ist ein Ersatz in ≤ 3 Klicks vorgeschlagen und eingeladen |

**Reihenfolge:** G1 → G2 → G3 → G4 → G5 → G6. Die Oberfläche kommt nach dem
Endpunkt, weil sie sonst gegen Platzhalter gebaut wird — und die Vorschläge
zuletzt, weil sie ohne die Meldung nichts anzuzeigen haben.

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
