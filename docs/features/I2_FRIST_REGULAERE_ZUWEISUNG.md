# I2 — Frist auch für reguläre Zuweisungen? (entschieden und gebaut)

> **Status: Owner-Entscheid 2026-08-24 — „Option C mit 72h und Kundenmeldung".
> Gebaut am selben Tag (Migration 195).** Was gebaut wurde, steht in
> [Abschnitt 0](#0-was-gebaut-wurde); die Erhebung darunter bleibt als
> Begründung stehen. **Drei Punkte sind weiterhin offen** und ausdrücklich
> nicht mitgebaut: der Altbestand (Entscheidung 3), der Rückzieh-Knopf
> (Entscheidung 4) und der Kapazitäts-Rückweg nach einer *Absage*
> (Entscheidung 5).
>
> Ausarbeitung der offenen Frage aus
> [`I_AUDIT_ZUWEISUNG_SUPPORT.md`](I_AUDIT_ZUWEISUNG_SUPPORT.md)
> („Frist auch für reguläre Zuweisungen?", Abschnitt *Die Ersatz-Frist*).
> Erhebungsstand: 2026-08-24, Code auf `claude/brave-sanderson-9e9148`,
> Zahlen aus der laufenden Entwicklungsdatenbank (`tempconnect_db`).

---

## 0. Was gebaut wurde

**Die Frist.** `frist_bis = GREATEST(LEAST(NOW() + 72 h, Einsatzbeginn), NOW() + 4 h)`,
Erinnerung bei der Hälfte der *tatsächlichen* Frist. Gesetzt in genau den zwei
Stellen, die eine reguläre offene Anfrage erzeugen — `assignCapacityToWorker`
und `assignDealToWorker`; alle sechs Routen laufen über sie.

Die **Untergrenze von vier Stunden** war nicht Teil der Vorlage und ist beim
Bau dazugekommen: 22 von 24 Zuweisungen im Bestand haben einen Vorlauf von
≤ 0 Tagen — sie entstehen am Starttag oder danach. Ein harter Deckel hätte
solche Anfragen bei der Geburt verfallen lassen, und der Arbeiter bekäme eine
Meldung über etwas, das schon vorbei ist. Vier Stunden ist der Wert, den der
Owner für den dringendsten Fall gesetzt hat (Ersatz, 193).

**Der Sweep** heißt jetzt `verfalleneAnfragen` und behandelt beide Arten. Der
Filter `AND ersetzt_link_id IS NOT NULL` ist aus beiden UPDATEs gefallen;
`ersetzt_link_id` kommt stattdessen im RETURNING mit, weil die Nachbereitung
Ersatz von regulär unterscheiden muss. Takt und Riegel bleiben unverändert:
BullMQ alle 10 Minuten, der interne Wartungslauf, und die Fristbedingung direkt
in Zusage und Absage.

**Der Kunde** bekommt beim regulären Verfall eine Meldung
(`assignment.worker_not_confirmed`, Titel „Platz auf Ihrem Einsatz wieder
offen"). Jeder Baustein ist geliehen, keiner neu: dieselbe Empfangsprüfung
(`kundeIstEmpfangsberechtigt` — kein Kunde, Kunde ist der Lieferant,
Org-Divergenz), dieselbe Berechtigung (`assignment.edit`), derselbe Deep-Link
ins Einsatzfenster wie bei Ausfall und Ersatz. Beim **Ersatz**-Verfall bleibt es
beim stillen Aufräumen — dort hat der Kunde die Kraft nie gesehen.

**Der Kapazitäts-Posten** kommt beim regulären Verfall zurück. Die Zählung
spiegelt die Setz-Logik aus `assignCapacityToWorker`: geweckt wird nur, was die
Zuweisung selbst geschlossen hat (`status = 'filled'`), und nur wenn die aktiven
Links den Headcount wieder unterschreiten.

**Die Frist steht im Erst-Text** jeder der sechs Anfrage-Benachrichtigungen —
eine Frist, die man dem Betroffenen verschweigt, ist eine Falle. Die
Formatierung liegt zentral in `fristLabelDE` (`api/utils/dateDE.js`); die
Inline-Kopie in der Ersatz-Route ist dorthin gewandert, statt auf sechs Kopien
anzuwachsen. Die Portal-Anzeige griff bereits generisch über
`response_deadline_label` und brauchte keine Änderung.

**Zwei Fehler im Bestand fielen beim Umbau auf und sind mitkorrigiert:**
die Disponenten-Meldung las `first_name`/`last_name` von einem Objekt, das nur
`{ id, name }` trägt — der Name blieb leer, und weil das Objekt truthy ist,
griff auch der Rückfalltext nicht (die Meldung begann mit einem Leerzeichen);
und `assigned_links` der Schnellbesetzung trug die Frist gar nicht nach oben.

| Datei | Was |
|---|---|
| `sql/migrations/195_zuweisung_ohne_bestaetigung.sql` | zwei Meldungstypen, additiv nach Muster 184/193 |
| `api/services/workerService.js` | Frist-Ausdrücke, beide INSERTs, Sweep, Kapazitäts-Rückgabe, Kundenmeldung |
| `api/services/workerAbsenceService.js` | `EINSATZ_ERLEDIGT` exportiert (geliehen statt kopiert) |
| `api/services/notificationMatrix.js`, `matchAlertService.js`, `notificationSurfaceMap.js` | die zwei Ereignisse registriert |
| `frontend/public/js/hubCardBadges.js` | Kundenmeldung auf die Einsatz-Karte |
| `api/utils/dateDE.js` | `fristLabelDE` — eine Formatierung für sechs Wege |
| `api/routes/workers.js`, `marketplace.js` | Frist im Erst-Text, alle sechs Wege |
| `api/services/dealStaffingFastTrackService.js` | `frist_bis` in `assigned_links` |
| `api/workers/capacityWorker.js`, `api/routes/internal.js` | Sweep-Umbenennung |
| `api/test/anfrageFrist.test.js` | 39 Proben (ersetzt `ersatzFrist.test.js`) |

**Verifikation.** 39/39 Frist-Proben grün, davon zwei DB-Smokes an der echten
Datenbank — einer davon rechnet die Formel in Postgres nach: Einsatz in 30 Tagen
→ 72,0 h, Einsatz morgen → Deckel greift, Einsatz längst begonnen → 4,0 h.
Migration zweimal eingespielt (idempotent). Volle Suite: 9878 Tests.
Der Wächter `benachrichtigungsSpiegel` hält die neuen Typen gegen den
Datenbank-CHECK, die Oberflächen-Kopie und die Kanal-Zuordnung.

---

## 0b. Der Nachlauf — was die Bestandsaufnahme danach fand

Auf die Frage „alle Abfragen prüfen" (2026-08-24) wurde jede Stelle im Repo
durchgesehen, die `worker_assignment_links` liest oder schreibt. **Die große
Mehrheit war in Ordnung**: über zehn Abfragen verlangen `is_active = TRUE`, und
weil der Verfall Status *und* `is_active` zugleich setzt, fällt eine verfallene
Zeile dort automatisch heraus — auch bei der zentralen Terminkonflikt-Prüfung,
der Verfall gibt den Menschen also wirklich frei.

Vier Stellen waren es nicht. Alle vier sind repariert (Commit folgt auf
`09bea1a`):

**Ein HTTP 500, an der Datenbank nachgestellt.** `worker_assignment_links` trägt
`UNIQUE (worker_user_id, assignment_id)` (Migration 029). Der Guard in
`assignDealToWorker` lässt erledigte Zeilen bewusst durch — der Kommentar dort
behauptete sogar, „ein neuer Eintrag entsteht" —, aber der INSERT dahinter hatte
kein `ON CONFLICT`. Der zweite Zuweisungsversuch derselben Person endete in
`23505` und damit in einem Serverfehler. **Der Defekt ist älter als die Frist**:
die Gegenprobe nach einer *Absage* stürzte identisch ab. Der automatische
Verfall machte ihn vom Sonderfall zum Regelfall — die Meldung „der Platz ist
wieder offen" fordert genau diese Handlung. Behoben nach dem Vorbild von
`replaceAssignmentWorker`, das die Zeile recycelt; zusätzlich wird
`ersetzt_link_id` geleert, sonst hielte der Sweep die neue reguläre Anfrage für
eine Ersatz-Anfrage.

**Die Einladung wies den zusagenden Arbeiter ab.** `createWorkerAssignmentLink`
prüfte ohne jeden Filter, ob schon ein Link existiert. Wer nach einem Verfall
über eine Staffing-Kampagne erneut eingeladen wurde und **zusagte**, bekam 409
„bereits zugeordnet" — und kam über diesen Weg nie wieder hinein. Guard auf
lebende Zeilen begrenzt, INSERT mit `ON CONFLICT`.

**Der Kapazitäts-Posten kehrte nicht in den Drawer zurück.**
`getUnassignedCapacityPosts` schloss nur `worker_declined` aus und prüfte
`is_active` gar nicht — der Sweep gab den Posten korrekt frei, aber
„+ Kapazität zuweisen" zeigte ihn nie wieder. Zwei Abfragen weiter unten stand
die korrekte Variante. Nachgewiesen per SQL-Vergleich an der Datenbank: mit
einer verfallenen Zeile zeigt die alte Bedingung 3 Posten, die neue 4.

**Die Oberfläche kannte den Zustand nirgends.** Das Einsatzportal zeigte kein
Abzeichen (die Zeile sah aus wie eine normale Zuweisung, denn die Liste lädt
`include_inactive=true`), die Bestätigungsknöpfe blieben nach Ablauf aktiv, und
der Klick endete in einem Toast mit dem rohen Text `ANFRAGE_VERFALLEN`. Der
Monats-Einsatzplan — als abrechnungsrelevant ausgewiesen — zeigte eine
verfallene Zuweisung als regulären Einsatzblock, im PDF ebenso; dort leckte
`worker_declined` schon immer genauso durch. Alles behoben, inklusive der
sechs fehlenden Wörterbuch-Einträge (DE und EN) und der Aktivitäten-Seite, die
die neuen Meldungstypen nicht kannte.

**Zwei Bestandsfehler nebenbei belegt:** In der Datenbank stehen die
Disponenten-Meldungen von 09:06 und 14:05 desselben Tages direkt untereinander —
die ältere beginnt mit einem Leerzeichen (`" hat eine Ersatz-Anfrage…"`), die
jüngere trägt den Namen. Der Namens-Fix aus `09bea1a` ist damit an echten Daten
belegt.

**Und ein Wächter, damit das nicht wiederkehrt.** `statuswertSpiegel.test.js`
hält seitdem vier Dinge: dass die Datenbank keine unbekannten Statuswerte
kennt, dass der UNIQUE noch besteht, dass jede benannte Anzeige-Fläche die
erledigten Zustände kennt, dass keine Statusliste ohne `is_active` auskommt und
dass kein INSERT ohne `ON CONFLICT` bleibt. Die einzige Ausnahme prüft sich
selbst: Wo der Einsatz unmittelbar davor frisch angelegt wird, ist ein Konflikt
unmöglich — baut jemand das um, schlägt der Wächter wieder an. Beim ersten Lauf
hat er prompt einen INSERT gefunden, den die manuelle Durchsicht übersehen
hatte.

---

## Kurzfassung

Migration 193 hat **Ersatz**-Anfragen eine Uhr gegeben: vier Stunden, dann
verfallen sie. Der Owner-Entscheid vom 2026-08-21 galt ausdrücklich nur diesem
Fall. **Reguläre** Zuweisungen haben weiterhin keine Frist — eine unbeantwortete
Anfrage bindet den Platz unbegrenzt.

Die Erhebung hat drei Dinge gefunden, die über die ursprüngliche Fragestellung
hinausgehen:

1. **Vier Menschen stehen bei Kunden auf der Live-Tafel, ohne je zugesagt zu
   haben** — der älteste seit 136 Tagen. Anders als beim Ersatz blendet die
   Kundenansicht reguläre offene Anfragen **nicht** aus; der Code sagt das
   ausdrücklich. Das ist der wichtigste Unterschied zum Ersatz-Fall und ändert,
   was ein Verfall auslösen müsste.
2. **Fünf weitere Anfragen sind eingefroren**: ihr Einsatzzeitraum ist vorbei,
   deshalb weist der Server jede Zusage *und* jede Absage ab. Sie können ohne
   Eingriff nie mehr verschwinden und binden trotzdem Kapazität.
3. **Es gibt keinen Rückweg.** Ein Disponent kann eine gestellte Anfrage nicht
   zurückziehen — die Dienstfunktion existiert, aber ohne Route und ohne Knopf.

Fünf Entscheidungen lagen an; ausführlich in Abschnitt 8:

| # | Frage | Empfehlung | Stand |
|---|---|---|---|
| 1 | Frist für reguläre Zuweisungen? | **Ja — Option C**: 72 Stunden, gedeckelt am Einsatzbeginn | ✅ entschieden + gebaut |
| 2 | Was der Kunde beim Verfall erfährt | **Meldung an den Kunden** — er hat die Person auf der Tafel | ✅ entschieden + gebaut |
| 3 | Altbestand (9 Zeilen) | **Nur die fünf unbeantwortbaren** auf `expired` setzen | ⏳ offen — die neun Zeilen liegen unverändert |
| 4 | Rückzieh-Knopf für Disponenten | **Ja** — unabhängig von 1 sinnvoll, kleiner Aufwand | ⏳ offen |
| 5 | `capacity_post` kehrt nach **Absage** nicht zurück | Eigenständiger Defekt, **eigenes Ticket** | ✅ miterledigt — der Filter in `getUnassignedCapacityPosts` schließt jetzt jede erledigte Zeile aus, also auch die abgesagte |

---

## 1. Wer erzeugt überhaupt eine reguläre Anfrage

Sechs Stellen rufen `notifyAssignmentPendingConfirmation`. Sie führen aber nur
auf **zwei** Stellen zurück, die tatsächlich einen `pending`-Datensatz anlegen —
das entscheidet den Bauaufwand.

| # | Route | erzeugt über | Menge | Art der Anfrage |
|---|---|---|---|---|
| 1 | `POST /worker-assignment-links/:id/replace` ([workers.js:1651](../../api/routes/workers.js#L1651)) | `replaceAssignmentWorker` | 1 | **Ersatz — hat seit 193 eine Frist.** Nicht Teil dieser Frage |
| 2 | `POST /assign-capacity-to-worker` ([workers.js:1928](../../api/routes/workers.js#L1928)) | `assignCapacityToWorker` ([workerService.js:2346](../../api/services/workerService.js#L2346)) | 1 | Disponent besetzt eine eigene Kapazität |
| 3 | `POST /assign-deal-to-worker` ([workers.js:2354](../../api/routes/workers.js#L2354)) | `assignDealToWorker` ([workerService.js:2672](../../api/services/workerService.js#L2672)) | 1 | Disponent besetzt einen Deal-Einsatz von Hand |
| 4 | `POST /staffing-assignments/:id/quick-assign` ([workers.js:2019](../../api/routes/workers.js#L2019)) | `quickAssignSuggestedWorkers` → `assignDealToWorker` in der Schleife | **N** | Schnellbesetzung aus Vorschlägen |
| 5 | `POST /marketplace/offers/:id/quick-assign-to-deal` ([marketplace.js:1938](../../api/routes/marketplace.js#L1938)) | derselbe Dienst wie #4, aus der Dealakte heraus | **N** | Aggregator, kein eigener Pfad |
| 6 | `POST /staffing-choice-sets/:id/assign` ([workers.js:2226](../../api/routes/workers.js#L2226)) | **nur** im `else`-Zweig `assignDealToWorker` | 0 oder 1 | Der Arbeiter hatte selbst eine Auswahl bekommen |

**Zwei Ausschlüsse, die Arbeit sparen:**

- `createAssignmentLink` ([workerService.js:1617](../../api/services/workerService.js#L1617))
  setzt `worker_confirmation_status` gar nicht und erbt den Spalten-Default
  `'auto_confirmed'` ([Migration 034:16](../../sql/migrations/034_worker_assignment_confirmation.sql)).
  `POST /worker-assignment-links` erzeugt also **keine** offene Anfrage.
- `promoteReservationInternal` schreibt fest `worker_confirmed`
  ([assignmentStaffingService.js:1119](../../api/services/assignmentStaffingService.js#L1119)).
  Deshalb prüft Route #6 vor der Benachrichtigung ausdrücklich auf
  `pending_confirmation`.

### Was eine Frist je Stelle bedeuten würde

| Stelle | Dringlichkeit | Was eine kurze Frist dort anrichtet |
|---|---|---|
| #2 Kapazität besetzen | gering bis mittel | Wird oft auf Vorrat besetzt. **Sonderfall:** diese Route legt zusätzlich ein *neues* `assignment` an ([workerService.js:2333](../../api/services/workerService.js#L2333)) und schaltet den `capacity_post` auf `filled`/`is_active=FALSE`. Ein Verfall müsste beides zurückdrehen, sonst bleiben eine leere Einsatzhülle und ein für immer verschwundenes Angebot |
| #3 Deal von Hand | mittel | Der Regelfall. Der Einsatz kann morgen oder in sechs Wochen beginnen — eine feste Stundenzahl passt hier am schlechtesten |
| #4/#5 Schnellbesetzung | mittel bis hoch | Hier entstehen **N Anfragen auf einen Schlag**. Eine gemeinsame Frist heißt N Verfälle in derselben Minute; ohne Bündelung wird das zum Meldungslärm |
| #6 Auswahl-Set | **hoch** | Der Arbeiter hat sich diese Auswahl selbst angesehen und **erwartet** die Anfrage — hier ist eine kurze Frist am besten begründbar |

---

## 2. Der Befund, der alles verändert: der Kunde sieht die Anfrage

Beim Ersatz gilt ausdrücklich „kein Kundenpfad" — der Kunde hat die angefragte
Ersatzkraft nie gesehen, beim Verfall gibt es dort nichts zurückzunehmen
([workerService.js:1936](../../api/services/workerService.js#L1936)).

**Für reguläre Zuweisungen gilt das Gegenteil.** Die Live-Belegschaft des Kunden
([workforceService.js:559–586](../../api/services/workforceService.js#L559))
schließt offene Anfragen nur im Ersatzfall aus:

```sql
AND NOT (wal.ersetzt_link_id IS NOT NULL
         AND wal.worker_confirmation_status = 'pending_confirmation')
```

Der Kommentar darüber sagt es wörtlich: *„Bewusst NUR der Ersatzfall: eine
regulaere Zuweisung, die noch auf Bestaetigung wartet, war hier immer schon
sichtbar."*

Gegen die Datenbank geprüft: **vier** der neun offenen regulären Anfragen
erfüllen heute sämtliche Sichtbarkeitsbedingungen (`is_active`, Status nicht
ausgeschlossen, kein Ersatz, `start_date <= CURRENT_DATE`, Enddatum offen oder
künftig, Lebenszyklus `active`). Vier Unternehmen planen also seit 69 bis 136
Tagen mit Menschen, die nie zugesagt haben.

Dazu passt eine zweite Fernwirkung: `reserved_quantity` fließt in den
Erfüllungsgrad des Bedarfs — `committed = filled + reserved`
([assignmentStaffingService.js:825](../../api/services/assignmentStaffingService.js#L825)).
Der Kunde sieht seinen Bedarf als gedeckt, obwohl niemand zugesagt hat.

**Konsequenz für die Entscheidung:** Ein Verfall im regulären Fall ist kein
stiller Aufräumvorgang wie beim Ersatz. Es verschwindet jemand von der
Kundentafel, und dafür existiert heute kein Meldeweg. Das ist Entscheidung 2 in
Abschnitt 8 — sie lässt sich **nicht** aus 193 ableiten.

---

## 3. Der gemessene Schaden

Erhebung am 2026-08-24. Die Tabelle hat insgesamt nur 24 Zeilen; die absoluten
Zahlen sind klein, das **Muster** ist eindeutig.

Offene Anfragen (`pending_confirmation` + `is_active=TRUE`): **10** — davon
**1** Ersatz (mit Frist) und **9 reguläre ohne jede Frist**. Bei allen neun ist
`updated_at` identisch mit `created_at`: seit dem Anlegen hat sie niemand
angefasst. Acht der neun liegen bei derselben Zeitarbeitsfirma.

| Alter | Anzahl | Einsatzzeitraum | Lebenszyklus | Folge |
|---|---|---|---|---|
| 136 Tage (10.04.) | 1 | ab 01.04., kein Ende | `active` | **beim Kunden sichtbar** + einziger akut blockierter Einsatz |
| 103 Tage (13.05.) | 3 | 13.05.–31.05. | `expired` | **eingefroren** — Antwort serverseitig unmöglich |
| 89 Tage (27.05.) | 2 | 27.05.–31.05. | `expired` | **eingefroren** |
| 77 Tage (08.06.) | 1 | bis 08.06.2027 | `active` | beim Kunden sichtbar |
| 74 / 69 Tage (Juni) | 2 | kein Ende | `active` | beim Kunden sichtbar |

**Drei Größenordnungen, die auseinanderzuhalten sind:**

1. **Ein Einsatz ist wirklich blockiert.** `1950f8fd-a9a9-4233-8535-2d025fea2bc7`:
   `requested_quantity=1`, `reserved_quantity=1`, `open_quantity=0`,
   `staffing_status='sourcing'` — gehalten von der 136 Tage alten Anfrage.
2. **Fünf Anfragen sind eingefroren.** Ihr effektives Enddatum liegt in der
   Vergangenheit; `confirmAssignment` und `declineAssignment` steigen dann
   **vor** dem UPDATE mit `ASSIGNMENT_NOT_CURRENT` aus
   ([workerService.js:1820](../../api/services/workerService.js#L1820) und
   [:1859](../../api/services/workerService.js#L1859)). Der Arbeiter *kann*
   nicht mehr antworten, auch wenn er wollte — und die Zeile zählt weiter als
   reserviert. Diese fünf verschwinden **nie** von allein; keine Frist erreicht
   sie rückwirkend.
3. **Die übrigen vier** binden je einen Platz in Einsätzen mit genug Luft
   (z. B. 20 angefragt, 3 reserviert, 17 offen). Kein Stillstand — aber es sind
   genau die vier, die beim Kunden auf der Tafel stehen.

### Was eine offene Anfrage sonst noch bewirkt

| Wirkung | Beleg |
|---|---|
| Sperrt **fünf** Disponenten-Aktionen über `ASSIGNMENT_FILLED`: Kampagne, Warteliste-Welle, Auswahl-Set, Quick-Assign, Marktplatz-Zuweisung | `assignmentStaffingService.js:2790`, `:2894`, `:4082`; `workerService.js:2627` |
| Trifft **den Arbeiter selbst**: wer eine Staffing-Einladung annimmt, bekommt „Einsatz bereits besetzt" — weil eine tote Anfrage den Platz hält | [assignmentStaffingService.js:4909](../../api/services/assignmentStaffingService.js#L4909), Route `workerPortal.js:880` |
| Nimmt den Menschen **sofort vom Marktplatz** — `BUSY_EXISTS_SQL` prüft nur `is_active` und das Enddatum, nicht den Bestätigungsstand | [workerOfferReservationService.js:22](../../api/services/workerOfferReservationService.js#L22) |
| Gilt in der Verfügbarkeit als belegt; bei fehlendem Enddatum sogar als `unbefristet_gebunden` (`WHERE worker_user_id = $1 AND is_active = TRUE` — ohne Statusfilter) | [workerAvailabilityService.js:97](../../api/services/workerAvailabilityService.js#L97), [:102](../../api/services/workerAvailabilityService.js#L102) |
| Erscheint in der Abwesenheits-Folgenvorschau | `workerAbsenceService.js:281` |

Keine Sorge dagegen bei Folgeartefakten: **kein Job erzeugt aus einem Link
automatisch Stundenzettel oder Schichten**; ein Verfall müsste nichts
zurückrollen. (Die Zeiterfassung steht allerdings ohne Statusfilter offen —
ein Arbeiter kann für einen unbestätigten Einsatz Zeiten einreichen,
`workerSubmissionService.js:316`. Eigener Befund, nicht Teil dieser Frage.)

---

## 4. Der stärkste sachliche Grund: eine Asymmetrie in derselben Abfrage

`recalcAssignmentStaffing` speist `reserved_quantity` aus **drei** Mengen — zwei
davon haben längst eine Uhr
([assignmentStaffingService.js:866–901](../../api/services/assignmentStaffingService.js#L866)):

| Menge | Ablaufprüfung |
|---|---|
| Reservierungen (`assignment_staffing_reservations`) | `AND (r.expires_at IS NULL OR r.expires_at > NOW())` ✅ |
| Einladungen (`assignment_staffing_invites`) | `AND (i.expires_at IS NULL OR i.expires_at > NOW())` ✅ |
| **Zuweisungs-Links** | `AND wal.worker_confirmation_status = 'pending_confirmation'` — **keine Zeitbedingung** ❌ |

Danach gilt `reserved = pending + reservations` und
`open = requested − filled − reserved`. Eine Frist wäre damit keine neue Idee,
sondern die **Angleichung an die Regel, nach der die Nachbarmengen längst
funktionieren**. Der Zuweisungs-Link ist der einzige Weg, auf dem Kapazität
ohne Ablaufdatum gebunden werden kann.

---

## 5. Es gibt heute keinen Rückweg

- **Der Disponent kann eine Anfrage nicht zurückziehen.**
  `removeAssignmentLink` existiert
  ([workerService.js:1638](../../api/services/workerService.js#L1638)), hat aber
  **keinen einzigen Aufrufer außer den eigenen Proben** — keine Route, kein
  Knopf. Der einzige indirekte Weg ist, den ganzen Mitarbeiter zu deaktivieren
  (`setWorkerActive(false)` deaktiviert *alle* seine Links,
  [:1052](../../api/services/workerService.js#L1052)) — ein Kollateralschaden,
  kein Ausweg.
- **Der Disponent sieht nur eine Zahl.** Die Mitarbeiterfläche zeigt „Offene
  Bestätigungen: N"
  ([mitarbeiter.js:3310](../../frontend/public/js/pages/mitarbeiter.js#L3310))
  und ein Badge je Zeile — kein „wartet seit 136 Tagen", keine Sortierung nach
  Alter, keine Handlung.
- **Auch die Absage dreht nicht alles zurück.** `declineAssignment` setzt den
  Link inaktiv und rechnet die Staffing-Zahlen neu — aber der von
  `assignCapacityToWorker` auf `filled`/`is_active=FALSE` geschaltete
  `capacity_post` bleibt stehen. Der Freigabe-Pfad in
  `workerOfferReservationService` greift nur für `status='paused'` **und**
  `worker_reserved=TRUE` und erfasst diesen Fall nicht. **Eigenständiger Defekt,
  der schon heute bei jeder Absage zuschlägt** — ein Verfall würde ihn erben.

Ohne Frist **und** ohne Rückzieh-Knopf hat eine unbeantwortete Anfrage also
keinen Ausgang außer der Antwort des Arbeiters — die technisch unmöglich werden
kann, sobald der Einsatzzeitraum vorbei ist.

---

## 6. Welche Fristen das System heute schon kennt

| | Staffing-Einladung | Reservierung | Auswahl-Set | Ersatz-Link (193) |
|---|---|---|---|---|
| **Dauer** | **72 h** | **30 min** (konfigurierbar) | **72 h** | **4 h** (+2 h Erinnerung) |
| Beleg | `72 * 60 * 60 * 1000`, [assignmentStaffingService.js:2586](../../api/services/assignmentStaffingService.js#L2586) | Fallback `30` + DB-Default, [Migration 087:123](../../sql/migrations/087_assignment_multi_staffing.sql) | `DEFAULT_STAFFING_CHOICE_SET_HOURS = 72`, [:17](../../api/services/assignmentStaffingService.js#L17) | `INTERVAL '4 hours'`, [workerService.js:2250](../../api/services/workerService.js#L2250) |
| Spalte | `expires_at` | `expires_at` | `response_deadline_at` | `frist_bis` |
| Abräumung | Sweep + Lazy | Sweep + Lazy | **kein Sweep** — `response_deadline_at` wird nirgends gegen `NOW()` geprüft; `expired` entsteht nur beim Lesen | Sweep + Riegel in Zusage/Absage |

**72 Stunden ist der etablierte Wert, wenn ein Mensch antworten soll.** Die
30 Minuten der Reservierung gelten einem technischen Vorhalt, nicht einer
Person. Eine neue Zahl einzuführen, wo zwei Nachbarfälle bereits 72 Stunden
verwenden, wäre eine Sonderregel ohne Anlass.

**Die Antwortzeiten der Arbeiter taugen nicht als Grundlage.** Gemessen:
7 beantwortete Zuweisungen insgesamt, keine einzige Absage; fünf der sieben
Antworten kamen zwischen 41 Sekunden und 6 Minuten nach dem Anlegen — das ist
Seed-Verhalten, keine menschliche Reaktion. 22 von 24 Zuweisungen haben einen
Vorlauf ≤ 0 Tage, teils bis −426 Tage. Testdatenrauschen; eine daraus
abgeleitete Frist wäre eine Scheingenauigkeit. Der Bestandswert 72 h ist die
ehrlichere Begründung.

---

## 7. Die Optionen

### Was ohnehin gilt, egal wie entschieden wird

Das Verfalls**muster** ist fertig und erprobt: Status `expired` statt
`worker_declined` (Verfall ist keine Absage — sonst vergiftet er jede
Zuverlässigkeitsauswertung), `is_active=FALSE`, `verfallen_am`, danach
`recalcAssignmentStaffing`, Meldung an den Arbeiter und an alle mit
`worker.manage`. Der taktunabhängige Riegel in Zusage und Absage
(`AND (frist_bis IS NULL OR frist_bis > NOW())`) ist **bereits generisch** und
greift, sobald `frist_bis` gesetzt ist. Die Fristanzeige im Einsatzportal
ebenso — sie hängt an `response_deadline_label` und erscheint automatisch
([einsatzportal-einsaetze.html:395](../../frontend/public/einsatzportal-einsaetze.html#L395)).
Auch der Takt trägt bereits: BullMQ alle 10 Minuten (`workers/index.js:45`) plus
der interne Wartungslauf (`internal.js:562`).

### Option A — keine Frist, stattdessen Sichtbarkeit und ein Rückzieh-Knopf

- **Dafür:** keine Uhr, die einem Arbeiter etwas wegnimmt, das er nie gesehen
  hat. Der Mensch entscheidet.
- **Dagegen:** wirkt nur, wenn jemand hinschaut. Die fünf eingefrorenen
  Anfragen blieben liegen, und die vier Kundentafel-Fälle verschwinden erst,
  wenn ein Disponent sie zufällig bemerkt.

### Option B — dieselbe Frist wie beim Ersatz (4 Stunden) für alle fünf Stellen

- **Dafür:** eine einzige Regel, nichts zu erklären, geringster Aufwand.
- **Dagegen:** fachlich schwer zu rechtfertigen. Beim Ersatz ist ein Mensch
  ausgefallen und der Kunde wartet **heute**; bei einer Zuweisung für einen
  Einsatz in sechs Wochen ist dieselbe Uhr reine Härte. Wer eine Schicht
  arbeitet und abends aufs Handy schaut, hat die Anfrage bereits verloren.

### Option C — 72 Stunden, gedeckelt am Einsatzbeginn *(Empfehlung)*

`frist_bis = LEAST(NOW() + 72 h, Einsatzbeginn)`, Erinnerung bei der Hälfte.

- **Dafür:** Die Frist passt sich der Dringlichkeit an, ohne dass jemand sie
  pflegt. Anfrage für morgen → Antwort bis morgen früh. Anfrage für in sechs
  Wochen → drei Tage Zeit, dann ist der Platz wieder frei und der Disponent kann
  rechtzeitig jemand anderen fragen. **Kein Einsatz beginnt mehr mit einer
  offenen Anfrage** — genau der Zustand, aus dem alle fünf eingefrorenen Zeilen
  entstanden sind. Und 72 h fügt sich in die bestehende Reihe (Abschnitt 6).
- **Dagegen:** eine Regel mehr als B; „warum hier 72 und dort 6 Stunden" muss
  ablesbar sein — ist es, die Frist steht im Benachrichtigungstext und auf der
  Einsatzkarte.
- **Warum diese und nicht B oder D:** Sie ist die einzige Option, die den
  Auslöser trifft. Der Deckel am Einsatzbeginn macht den Zustand „Anfrage
  überlebt den Einsatz" strukturell unmöglich.

### Option D — Frist nur für die dringlichen Stellen (#4/#5/#6)

- **Dafür:** trifft genau die Fälle, in denen Tempo zählt.
- **Dagegen:** zwei Klassen von Anfragen, die im Portal identisch aussehen —
  die Sorte Sonderregel, die in zwei Jahren niemand mehr erklären kann. Und der
  136 Tage alte Blockierer stammt aus #2 oder #3, bliebe also unberührt.

---

## 8. Was der Owner entscheiden muss

**1. Frist für reguläre Zuweisungen — ja und welche?**
Empfehlung: **Option C**, 72 Stunden gedeckelt am Einsatzbeginn, Erinnerung
nach der Hälfte.

**2. Was erfährt der Kunde, wenn eine Anfrage verfällt?**
Neu und nicht aus 193 ableitbar (Abschnitt 2). Drei Wege:
   - *(a)* **Meldung an den Kunden** („die eingeplante Kraft hat nicht bestätigt,
     der Platz ist wieder offen") — **Empfehlung**: er hat die Person auf der
     Tafel und plant seine Schicht darauf.
   - *(b)* Stiller Verfall wie beim Ersatz — konsistent, aber jemand
     verschwindet ohne Erklärung von der Kundentafel.
   - *(c)* Die Kundenansicht so ändern, dass offene Anfragen dort **gar nicht
     mehr** erscheinen (den Ersatz-Ausschluss verallgemeinern). Sauberste
     Trennung von Anfrage und Zusage, aber die sichtbarste Änderung für
     Bestandskunden — und eigenständig, auch ohne Frist, erwägenswert.

**3. Altbestand — die neun Zeilen erreicht keine Frist.**
Neue Regeln gelten ab der nächsten Anfrage (`frist_bis IS NULL` = keine Frist,
Linie aus 188/193). Deshalb ein eigener Beschluss:

| Variante | Wirkung | Bewertung |
|---|---|---|
| **a: nichts tun** | Neun Plätze bleiben falsch reserviert, vier Kunden behalten Phantom-Kräfte auf der Tafel | Konsistent mit der 188er-Linie, versteckt den Schaden aber dauerhaft |
| **b: alle neun auf `expired`** | Alle Plätze sofort frei, Zahlen und Kundentafeln stimmen wieder | Setzt vier Anfragen ab, die technisch noch beantwortbar wären — bei über zwei Monaten Alter vertretbar |
| **c: nur die fünf eingefrorenen** | Räumt genau das auf, was ohne Eingriff nie verschwindet | **Empfehlung** — begrenzt auf die Fälle, in denen der Eingriff nachweislich nichts wegnimmt: dort ist die Antwort schon heute serverseitig unmöglich |

Bei b und c: **keine** Benachrichtigung an die betroffenen Arbeiter. „Ihre
Anfrage von vor vier Monaten ist verfallen" erklärt nichts und weckt Fragen zu
einem Einsatz, der längst vorbei ist. Der Vorgang gehört ins Audit, nicht ins
Postfach. Wird Variante c gewählt, bleiben die vier Kundentafel-Fälle offen —
sie lösen sich erst über Entscheidung 2c oder einen Rückzieh-Knopf.

**4. Rückzieh-Knopf für Disponenten?**
Unabhängig von 1 bis 3 sinnvoll: die Dienstfunktion existiert, es fehlen Route,
Audit-Eintrag und Knopf. Empfehlung: **ja**, zusammen mit „wartet seit X Tagen"
in der Liste.

**5. Der `capacity_post`, der nach einer Absage nicht zurückkehrt.**
Eigenständiger Defekt (Abschnitt 5), wirkt schon heute. Empfehlung: **eigenes
Ticket** — er gehört zur Absage, nicht zur Frist, muss aber vor dem Verfallsbau
gelöst sein, weil der Verfall sonst denselben Weg nimmt.

---

## 9. Aufwand und Risiko, falls gebaut wird

**Klein — das Fundament steht.** Bei Option C:

| Baustein | Umfang |
|---|---|
| `frist_bis` + `erinnerung_faellig_am` in zwei INSERTs setzen (`assignCapacityToWorker`, `assignDealToWorker`), gedeckelt per `LEAST(…, start_date)` | ~8 Zeilen, **keine Migration** — die Spalten existieren seit 193 |
| Sweep: `AND ersetzt_link_id IS NOT NULL` aus beiden UPDATEs lösen, Meldungstexte für Ersatz und Regulär trennen, Funktion umbenennen | ~25 Zeilen im Sweep (heißt jetzt `verfalleneAnfragen`) |
| Kundenmeldung beim Verfall (Entscheidung 2a) | neu — es gibt heute keinen Meldeweg dafür |
| Aufräumpfade, die der Ersatz-Fall nicht kennt: `capacity_post` zurücksetzen, leere Einsatzhülle aus #2 behandeln | der eigentliche Aufwand (siehe Entscheidung 5) |
| Bündelung der Verfallsmeldungen bei #4/#5 (eine Meldung je Einsatz statt N) | neu, sonst Meldungslärm |
| Proben | `ersatzFrist.test.js` erweitern; der Fall „ohne Frist ändert sich nichts" (Zeile 211) bleibt für den Altbestand gültig |
| Frontend | **nichts** — Fristanzeige und Riegel sind bereits generisch |
| Takt | **nichts** — BullMQ-Takt und Wartungslauf tragen die Erweiterung mit |

**Retrofit-Risiko:** `pending_confirmation` kommt in 18 Testdateien vor
(97 Fundstellen). Die meisten prüfen Statuswerte, nicht die Abwesenheit einer
Frist — vor dem Bau durchzusehen, nicht zu schätzen.

**Nebenbefund zum Migrationsstand** (nicht Teil dieser Entscheidung, aber
gemessen): Die Registry `_migrations` endet bei `180_notdienst_antwortpfad.sql`;
für 181–193 fehlen die Einträge, obwohl die Struktur von 193 physisch in der
Datenbank liegt. Das sollte geklärt werden, bevor eine weitere Migration darauf
aufsetzt.
