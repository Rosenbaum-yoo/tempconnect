# I3 — Zustellung: erreicht die Meldung den Menschen?

> **Status: Stufe 1 gebaut (2026-08-26), Stufen 2-4 offen.**
> Owner-Entscheid 2026-08-26: *„Nicht jetzt — als eigene Welle festhalten."*
> Die Finalisierung bleibt geschlossen; dieses Dokument ist der Rahmen, mit dem
> die Welle später aufgemacht werden kann.
>
> Herkunft: der letzte offene Punkt aus
> [`I_AUDIT_ZUWEISUNG_SUPPORT.md`](I_AUDIT_ZUWEISUNG_SUPPORT.md) —
> *„Erreicht die Erinnerung den Arbeiter überhaupt?"*

---

## Die Frage

Eine Zuweisung trägt seit dem 24.08. eine Frist: 4 Stunden bei Ersatz-Anfragen,
72 Stunden bei regulären (gedeckelt am Einsatzbeginn). Läuft sie ab, verfällt die
Anfrage, der Platz wird neu vergeben.

Die Meldung darüber ist eine Zeile in `notifications`. Sie erscheint im
Einsatzportal und seit dem 24.08. auch sofort über den Live-Strom — **wenn der
Mensch die Seite offen hat.** Hat er sie nicht, sieht er sie beim nächsten
Besuch. Die Frist läuft trotzdem.

Ursprünglich stand die Frage als *„SMS ja oder nein?"* im Raum. Die Erhebung
zeigt: das war die falsche Frage.

---

## Die Messung (2026-08-26, laufende Datenbank)

### Wie oft wird überhaupt auf eine Antwort gewartet

| | |
|---|---|
| Zuweisungen gesamt | 24 |
| davon auf Bestätigung gewartet | **19** |
| davon bestätigt | 7 |
| davon **abgelehnt** | **0** |
| davon noch offen | 5 |
| davon verfallen oder zurückgezogen | 6 |

**Zwölf von neunzehn Anfragen blieben ohne jede Antwort** — und *abgelehnt hat
nie jemand ein einziges Mal.* Es wird nicht Nein gesagt. Es wird nicht gesehen.

### Wie lange die sieben gebraucht haben, die geantwortet haben

| Antwortzeit | Anzahl |
|---|---|
| unter 1 Minute | **5** |
| 6 Tage 2 Stunden | 1 |
| 11 Tage 21 Stunden | 1 |

Median: **1 Minute.** Und genau das ist die Pointe — der Median lügt hier.
Die Verteilung ist **zweigipflig**: entweder jemand sitzt gerade davor und
antwortet sofort, oder er sieht es tagelang nicht. **Dazwischen liegt nichts.**

> **Ehrlichkeit zur Datenlage:** sieben Datenpunkte, und die fünf
> Sofort-Antworten sehen nach Seed- oder Vorführdaten aus. Die Stichprobe ist
> klein. Aber alles darin zeigt in dieselbe Richtung, und die beiden
> echt wirkenden Fälle liegen bei 6 und 11 Tagen.

**Was daraus für die Frist folgt:** In dieser Verteilung trifft eine
4-Stunden-Frist fast nie. Wer nicht zufällig hinsieht, verliert den Einsatz —
nicht weil er nicht wollte, sondern weil ihn niemand erreicht hat.

### Was heute schon gefeuert hat

| | |
|---|---|
| Erinnerungen, die je gefeuert haben | **1** |
| echte Verfälle mit Frist | **1** |
| weitere Verfälle | 5 — aus der Altbestands-Bereinigung (Migration 197), nicht aus dem Betrieb |

Die Frist ist zwei Tage alt. Die Zahlen sagen also nichts über ihre Wirkung,
sondern nur: das Volumen ist heute winzig. **Für die Kostenfrage ist das
entscheidend** (siehe unten).

---

## Die drei Kanäle

### In-Plattform — vorhanden, seit dem 26.08. auch brauchbar

Existiert: `notifications`, Liste im Portal, Live-Strom (SSE) seit dem 24.08.,
und seit dem 26.08. führen die Meldungen auch zum Einsatz statt auf die Liste,
aus der sie stammen (Deep-Link `?einsatz=<link-id>`).

**Löst den Fall „schaut gerade nicht hin" nicht.** Das ist die Lücke, nicht ihre
Behebung.

### SMS — technisch fertig, rechtlich offen

| | |
|---|---|
| Dienst | `smsService.js`, verdrahtet, läuft ohne Anbieter im `console`-Modus |
| Kosten heute | keine — kein Vertrag, kein Anbieter |
| heute benutzt für | Einladungen (`routes/workers.js`) |
| Arbeiter mit hinterlegter Nummer | **17 von 33** (52 %) |
| Einwilligungsfeld im Schema | **keines** |

**Der Blocker ist nicht Geld, sondern Einwilligung.** Bei einer Erinnerung in
der gesamten Historie sind die Kosten gegenstandslos. Es gibt aber im ganzen
Schema kein Feld, in dem eine Einwilligung zur SMS festgehalten würde — und
selbst mit einer wäre SMS nur ein halber Kanal, weil nur die Hälfte der Arbeiter
überhaupt eine Nummer hinterlegt hat.

### Web Push — der eigentliche Kandidat

| | SMS | **Web Push** |
|---|---|---|
| Kosten pro Nachricht | Anbietertarif | **0** |
| Vertrag nötig | ja | **nein** |
| Einwilligung | kein Feld, Rechtsfrage offen | **im Browser eingebaut** — expliziter Dialog, jederzeit widerrufbar, vom Betriebssystem verwaltet |
| Voraussetzung beim Menschen | Telefonnummer (17/33) | Portal einmal geöffnet und erlaubt |
| erreicht das gesperrte Handy | ja | **ja**, als Systembenachrichtigung |
| iOS | ja | erst ab 16.4 **und nur als installierte PWA** |
| Android/Desktop-Chrome | ja | ja |

Push schlägt SMS in genau den beiden Punkten, an denen SMS hängen blieb: Kosten
und Einwilligung. Die Einwilligung ist dabei nicht bloß „auch geregelt", sondern
**sauberer als alles, was wir selbst bauen würden** — der Browser fragt, der
Nutzer entscheidet, das Betriebssystem verwaltet den Widerruf.

### E-Mail — der unterschätzte Zwischenschritt

Jeder Arbeiter hat ein Konto (33 von 33 haben `user_id`), und die Plattform
schreibt ihm ohnehin (Einladung). Eine Frist-Erinnerung per E-Mail bräuchte
**keine neue Einwilligung** und keinen neuen Kanal.

**Heute gibt es sie nicht:** `workerNotificationService.insertWithType` schreibt
eine `notifications`-Zeile und schiebt sie in den Live-Strom — mehr nicht. Der
Arbeiter-Meldeweg kennt überhaupt keine E-Mail.

Das ist der billigste Schritt mit der größten Reichweite und sollte **vor** Push
kommen, wenn nur eines gebaut wird.

---

## Machbarkeit

**Kein neues Paket nötig.** `web-push` ist nicht installiert, wird aber auch
nicht gebraucht: VAPID ist ECDSA über `prime256v1` plus AES-GCM, und beides
bringt `node:crypto` mit (geprüft am 26.08.). Das entspricht der Hauslinie
„keine neue Abhängigkeit, wenn Bordmittel reichen".

**Die Kanalstruktur steht schon.** `notification_preferences` trägt pro Nutzer
und `event_category` die Spalten `channel_in_app` und `channel_email` (14 Zeilen,
gelesen von sieben Modulen). Ein `channel_push` fügt sich ein, statt daneben zu
stehen.

**Was fehlt vollständig:** Service Worker, Web-App-Manifest, Abo-Tabelle,
VAPID-Schlüsselpaar, Zustellweg. Es gibt heute **keine** PWA-Grundlage im Repo —
weder für das Einsatzportal noch für die Enterprise-Seiten.

---

## Die Reihenfolge — und warum sie hier zählt

**Das Einsatzportal hat keine Tür.** Kein Demo-Zugang bietet die
Arbeiter-Perspektive, `ROLE_ACCOUNTS` kennt keinen Arbeiter, und die drei
geseeten Demo-Arbeiter tragen Attrappen-Hashes (51 statt 60 Zeichen —
`bcrypt.compare` liefert für jede Eingabe `false`). Siehe den eigenen Abschnitt
dazu in [`I_AUDIT_ZUWEISUNG_SUPPORT.md`](I_AUDIT_ZUWEISUNG_SUPPORT.md).

Push auf ein Portal, das niemand betreten kann, wäre das nächste Stockwerk auf
einem Haus ohne Eingang — nicht prüfbar, nicht vorführbar, nicht widerlegbar.

**Aber die Büro-Seite hat eine Tür.** Disponenten bekommen dieselbe Klasse von
Meldungen — Verfall, Ausfall, Verspätung, Ersatz gefunden — und haben dasselbe
Problem, wenn sie nicht auf den Schirm sehen. Für sie existiert ein
Demo-Zugang. **Dort ist Push heute baubar und am laufenden System nachweisbar**,
und der Arbeiter-Weg hängt automatisch mit dran, sobald die Tür aufgeht.

---

## Vorschlag in Stufen

Jede Stufe ist für sich abgeschlossen, grün und committbar. Keine Stufe setzt
voraus, dass die nächste kommt.

| Stufe | Inhalt | Nachweisbar? |
|---|---|---|
| ~~**1 · E-Mail im Arbeiter-Weg**~~ | **gebaut 2026-08-26** - siehe Abschnitt unten | - |
| **2 · PWA-Fundament** | Web-App-Manifest + Service Worker, Portal installierbar („Zum Homescreen"). Für Leute auf der Baustelle für sich schon Wert. | ja — Lighthouse/Browser |
| **3 · Push-Zustellung** | VAPID aus `node:crypto`, Abo-Tabelle, `channel_push` in `notification_preferences`, Einstellungsfläche mit Widerruf. Zuerst Büro-Seite. | ja — echter Browser mit Demo-Zugang |
| **4 · Arbeiter-Seite scharf** | Sobald der Portal-Zugang existiert: derselbe Weg, keine neue Technik. | erst nach der Tür |

**Wenn nur eines gebaut wird: Stufe 1.** Sie kostet am wenigsten, braucht keine
Entscheidung und erreicht als einzige heute schon alle 33 Arbeiter.

---

## Was owner-gebunden bleibt

| Punkt | Warum |
|---|---|
| **Arbeiter-Zugang** (Stufe 4) | Ein Login-Weg für die Demo-Arbeiter berührt Konten, die heute bewusst gesperrt sind. Gehört unter das `SEED_DEMO_WORLD`-Gate. |
| **E-Mail-Menge** (Stufe 1) | Wie viele Mails ein Arbeiter bekommen soll, ist eine Produktfrage, keine technische. Vorschlag: nur fristgebundene Typen, nicht jede Meldung. |
| **iOS-Anspruch** (Stufe 2/3) | Push auf iOS setzt eine installierte PWA voraus. Ob wir das verlangen oder iOS-Nutzer bei E-Mail belassen, ist eine Produktentscheidung. |
| **SMS** | Bleibt offen. Nach dieser Erhebung aber als *Ergänzung* für Fälle ohne Portal-Zugang, nicht als Hauptweg. |

---

## Was ausdrücklich NICHT gebaut werden sollte

- **Keine eigene Push-Infrastruktur** (eigener Dienst, eigene Zustellgarantie).
  Web Push nutzt die Push-Dienste der Browser-Hersteller; alles darüber hinaus
  wäre ein Betriebsversprechen, das wir nicht halten wollen.
- **Kein eigenes Einwilligungs-Formular für Push.** Der Browser-Dialog *ist* die
  Einwilligung. Ein zusätzliches Häkchen davor erzeugt nur die Illusion einer
  zweiten Prüfung.
- **Keine Push-Nachrichten mit Inhalt, der nicht auf einen Sperrbildschirm
  gehört.** Kundenname und Einsatzort sind personenbezogen; die Meldung sagt,
  *dass* etwas wartet, den Rest sieht man nach dem Entsperren.

---

## Stufe 1 - gebaut am 2026-08-26

**Was jetzt passiert:** Schreibt der Arbeiter-Meldeweg eine Zeile eines
fristgebundenen Typs, geht zusaetzlich eine E-Mail hinaus - mit dem Text der
Meldung, der Frist darin und einem Link, der den **Einsatz** aufschlaegt (nicht
die Liste; der Deep-Link kam am selben Tag dazu).

**Drei Typen, nicht alle.** Anfrage, Erinnerung, Verfall - die, bei denen
Schweigen den Menschen etwas **kostet**. Rueckzug, Dokumenten-Hinweise und
Absagen bleiben im Portal: dort kostet Nichtstun nichts, und jede Meldung zu
mailen ist der sichere Weg, dass keine mehr gelesen wird.

**Widerspruch:** eigene Kategorie `einsatz`, damit ein Nein nicht die
Stundenzettel mit abschaltet. Es sperrt nur ein **ausdrueckliches** Nein - fehlt
die Einstellungszeile, wird zugestellt. Anders waere Stufe 1 wirkungslos: keiner
der 33 Arbeiter hat je eine Einstellung gesetzt.

> **Offene Luecke, ausdruecklich benannt:** Das Einsatzportal verlinkt
> `activity.html` nicht - die Einstellungsflaeche existiert, ist fuer Arbeiter
> aber **nicht erreichbar**. Der Schalter wirkt serverseitig; der Weg dorthin
> fehlt. Er gehoert zu Stufe 2 (die Portal-Flaeche), spaetestens zu Stufe 3, wo
> Push ohnehin eine Zustimmungsflaeche braucht.

**Weg der Zustellung:** ueber die BullMQ-Warteschlange, nicht direkt. Das kostet
dem schreibenden Vorgang keine Zeit, wiederholt bei Ausfall (drei Versuche) und
ist gedeckelt (20 Mails/Minute im `emailWorker`). Ohne Redis passiert nichts -
und die Meldung im Portal steht trotzdem. Dieselbe Regel wie beim Live-Strom:
**ein Zustellweg darf das Schreiben nie gefaehrden.**

**Zur Transaktion, ehrlich:** Beim Erinnerungs-Sweep stehen Marke und Meldung in
EINER Transaktion, und die Einreihung liegt darin. Rollt sie zurueck, ist die
Mail trotzdem unterwegs. Der Inhalt bleibt dabei **wahr** - die Anfrage wartet ja
wirklich; nur die Buchhaltungsmarke fehlt, und der naechste Lauf erinnert erneut.
Schlimmster Fall: eine zweite Erinnerung, keine falsche Aussage.

### Mitgefunden: es waren zwei Mailwege, nicht einer

Der Absender-Fuss (Firmierung + Kontakt, Pflichtangaben nach Paragraf 37a HGB)
wurde am 24.08. in den `sendMail`-Engpass von `app.js` gesetzt - mit der
Begruendung, so bekomme **jede** Mail ihn. Es gibt aber einen zweiten Weg:
`services/emailService.js`, benutzt vom BullMQ-Email-Worker, von
`orgControlCenter.js` und von `workerSubmissionService.js`. Er reichte das HTML
ungerahmt durch.

Aufgefallen ist es erst, weil Stufe 1 ueber die Warteschlange geht - also durch
genau diesen zweiten Weg. Behoben; und der Waechter
`jedeMailHatEinenAbsender.test.js` **zaehlt nicht mehr auf, sondern sucht**: er
findet jeden Versandaufruf im Quelltext und verlangt, dass er rahmt. Ein dritter
Weg macht ihn rot, statt still danebenzustehen - dieselbe Umkehr wie bei der
Ansprechperson.

### Nachweis

Vier Rueckmutationen, jede von genau der zustaendigen Probe gefangen:

| Rueckmutation | gefangen von |
|---|---|
| Verdrahtung entfernt (niemand ruft den Mailweg) | *eine geschriebene Erinnerung schlaegt den Empfaenger nach* |
| Widerspruch ignoriert | *ein ausdrueckliches Nein sperrt* |
| Escaping entfernt | *fremder Text landet nicht roh im HTML* |
| zweiter Mailweg wieder ungerahmt | *jeder Versandweg rahmt* |

Die Verdrahtungs-Probe ist die wichtigste: die Fehlerklasse dieser Welle heisst
*gebaut, montiert - und niemand benutzt es*. Ein Kanal, den `notifyWorker` nie
anfasst, waere gruen getestet und trotzdem stumm.

**Noch nicht nachgewiesen:** eine echte Mail im Mail-Faenger. Der API-Prozess im
Container bedient einen Schnappschuss vom Prozessstart (siehe
[`UEBERGABE.md`](../UEBERGABE.md)), ein HTTP-Nachweis wuerde also fremden Code
messen. Der Beleg steht in den Proben - der Gang bis in den Posteingang bleibt
offen, bis der Prozess den eigenen Stand traegt.

## Quellen der Zahlen

Alle Werte am 2026-08-26 gegen die laufende Datenbank erhoben:

- Zuweisungen und Antwortzeiten: `worker_assignment_links`
  (`worker_confirmation_status`, `created_at`, `worker_confirmed_at`)
- Telefonnummern: `worker_profiles.phone`
- Fristen: `frist_bis`, `erinnert_am`, `verfallen_am`
- Kanalstruktur: `notification_preferences`
- PWA-/Push-Bestand: Suche über `frontend/` und `api/` — kein Treffer
- Krypto-Eignung: `crypto.getCurves()` / `crypto.getCiphers()` unter Node 24
