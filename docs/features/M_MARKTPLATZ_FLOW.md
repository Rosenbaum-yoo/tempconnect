# Welle M — Der Marktplatz-Flow, Ende zu Ende

> **Status: Bauanweisung, freigegeben. Ist-Stand gemessen und gegengeprüft am 2026-09-01.
> Alle sechs Owner-Entscheidungen M-E1…M-E6 beantwortet (2026-09-01) — kein Gate blockiert
> mehr den Bau.**
> Owner-Vorgabe: der vollständige Ablauf des Unternehmens-Marktplatzes, festgeschrieben
> als Kette — vom Abokauf bis zum Dokument im Einsatzportal.
>
> Vorgänger: [`K_BOUNTY_AUSZAHLUNG_MONATSPLANUNG.md`](K_BOUNTY_AUSZAHLUNG_MONATSPLANUNG.md),
> [`J_LIVE_BELEGSCHAFT_MARKTPLATZ.md`](J_LIVE_BELEGSCHAFT_MARKTPLATZ.md),
> [`L_TRAGFAEHIGKEIT.md`](L_TRAGFAEHIGKEIT.md) (dokumentiert, nicht gebaut).

---

## 0. Die Regel, die über allem steht

**Das meiste davon ist gebaut.** Gemessen: **130 Einzelurteile — 65 fertig, 33 teilweise,
24 fehlen, 7 gebaut aber unerreichbar, 1 unklar.**

Diese Welle ist deshalb überwiegend **Verkettung, Sichtbarmachung und Beweis** — nicht
Neubau. Wer sie als Neubau anfasst, baut ein zweites Mal daneben.

> **Vor jeder Phase gilt: erst messen, dann bauen.** Abschnitt 2 ist ein **Vorbefund**,
> kein Freibrief — Phase **M0** ist die eigene Nachmessung und nicht überspringbar.
>
> **Fehlt etwas wirklich, wird gefragt, nicht erfunden.** Eine Rückfrage kostet zehn
> Minuten; ein Parallelbau kostet eine Woche und hinterlässt zwei Wahrheiten.

### Wie dieser Ist-Stand entstanden ist — und warum das zählt

Acht Prüfer haben je einen Abschnitt der Kette gegen den Code gemessen, **acht
Gegenprüfer haben jede Behauptung zu widerlegen versucht.** Das war kein Ritual: die
Gegenprüfung hat in **jedem einzelnen Abschnitt** Korrekturen gefunden, und mehrere
davon hätten einen Doppelbau ausgelöst. Drei Beispiele:

| Behauptung | Gegenprüfung |
|---|---|
| „Zeilen ohne E-Mail werden fälschlich abgewiesen — ein fehlendes `.optional()`" | **Falsch.** `api/test/csvFeldregeln.test.js:191` nagelt die Pflicht *absichtlich* fest, mit dem Kommentar, er solle rot werden, sobald jemand das Schema öffnet. Kein Bug — eine Entscheidung |
| „Dem Feed fehlt das Plan-Gate" | **Folgenlos.** `capacity_exchange_basic` ist für *jeden* Plan inkl. DEMO offen. Ein nachgerüstetes Gate wäre ein No-op. Und das freie Browsen steht als Absicht im Code |
| „Es fehlt eine Fläche für die zukünftige Besetzung" | **Existiert.** Sie heißt Monatsplan, ist org-gebunden und verdrahtet (`monatsplanService.js:129/295`) |

**Merke daraus:** ein „fehlt" ist genauso teuer wie ein „fertig", wenn es falsch ist.

---

## 1. Die Owner-Vorgabe im Wortlaut

1. Zeitarbeitsfirma **und** Unternehmen kaufen ein Abo
2. **Nur** die Zeitarbeitsfirma lädt Mitarbeiter als CSV hoch
3. Profile werden mit den vorhandenen Daten automatisch angelegt
4. Automatische E-Mail-Einladung an **alle** Mitarbeiter gleichzeitig
5. Mitarbeiter öffnet den Link in der E-Mail
6. Wird ins **Einsatzportal** geleitet und registriert sich dort
7. **Keine Kollision** wegen der E-Mail-Anmeldung — vorbefüllt aus dem CSV
8. **Strikte Trennung:** kein Mitarbeiter-Zugang zur Plattform; und der Chef der
   Zeitarbeitsfirma kommt mit seinem Plattform-Konto **nicht** an das Einsatzportal-Konto
   seiner Mitarbeiter. *„Das muss wirklich sicher funktionieren."*
9. Mitarbeiter trägt Skills ein
10. Das löst **automatisch Angebote** aus
11. TempConnect befüllt den Marktplatz **automatisch aus diesen Skills**
12. Unternehmen greifen durch die Suche auf **Profile** zu — **DSGVO-konform**, aus dem
    Live-Bestand der Zeitarbeitsfirmen
13. Unternehmen kann **30 Mitarbeiter auf einmal** buchen, über **mehrere** Firmen
14. Modal in vier Schritten: **Ort → Anzahl → Zeitraum → Preis**
15. Dann: **Anfrage senden** / **Deal sofort abschließen** / **Abbrechen**
16. Der Abschluss geht als **echter Auftrag** an die Firma und löst **sofort** die
    Zuordnung in Live-Belegschaft und Einsatzportal aus
17. Die Firma bestätigt **per Klick** — oder schreibt zurück
18. **Staff Control Center:** Audit und Eingriff — Angebot zurücknehmen, Sperrlisten
19. **Dokumente der Einsätze** überall verdrahtet

---

## 2. Ist-Stand — gemessen, nicht vermutet

Belege als `datei:zeile`. Legende: ✅ fertig · ◐ teilweise · ⊘ gebaut, aber unerreichbar
· ✗ fehlt.

| # | Schritt | Stand | Beleg / Befund |
|---|---|---|---|
| 1 | Abo → wirksamer Plan | ✅ | `subscriptionRequestService.js:793` → `organizations.plan`, gelesen in `userService.js:268` |
| 1b | Abo-**Wirksamkeit** am Marktplatz | ✗ | `requireFeature` prüft nur die Plan-Matrix, **nie** `subscription.active`. Die abo-bewusste Variante `requireOrgFeature` gibt es und sie hängt an zehn Routendateien — Marktplatz und Kapazitätsbörse sind **nicht** darunter |
| 1c | Paywall im Frontend | ⊘ | Der Block ist vollständig gebaut, übersetzt, mit CTA — und **kann nie erscheinen**: `data-sla-guard="sla_access"`, und `sla_access` ist für **jeden** Plan wahr, DEMO eingeschlossen. Derselbe tote Schlüssel auf rund 20 Seiten |
| 1d | Zwei Wahrheiten für dasselbe Limit | ◐ | `capacityExchangeService.js:18` sagt PRO = 50 Angebote, `userService.js:165` sagt unbegrenzt. **Wirksam ist der niedrigere** — die verkaufte Zusage gilt faktisch nicht |
| 2 | CSV-Upload, Spaltenzuordnung, Duplikatprüfung | ✅ | `POST /workers/import`, `/import/map-columns`, `/check-duplicates`, org-gebunden über `req.orgId` |
| 2b | „Nur die Zeitarbeitsfirma" ist erzwungen | ◐ | Es gibt **keinen** `org_type`-Riegel — nur Plan + `rperm('worker.create')`. Eine Unternehmens-Org mit passendem Plan könnte denselben Import fahren |
| 3 | Profile automatisch anlegen | ✅ | `bulkImportWorkers` legt ein **volles Konto** an, nicht nur ein Profil |
| 3b | Zeilen **ohne** E-Mail | ⊘ | Datenmodell (Mig 175), Dienst (`createWorkerProfileWithoutAccount`) und Oberfläche („nur Stammdaten") sind fertig — das Routen-Schema weist jede Zeile ohne E-Mail eine Ebene höher ab. **Absichtlich**, per Test festgenagelt |
| 4 | Einladung an alle gleichzeitig | ◐ | `POST /worker-invites/bulk` existiert, set-based, kollisionsfrei (Mig 159). **Der Import löst sie nicht aus** — zwei Knöpfe, dazwischen ein `window.confirm` |
| 4b | Der Kandidatenkreis | ✗ | **Gefährlich:** die Route lädt **org-weit** alle unverifizierten Kräfte; der Dialog nennt die Zahl des *gerade importierten* Stapels. Wer 10 importiert und bestätigt, kann **180 Einladungen an Unbeteiligte** auslösen |
| 4c | Obergrenze 200 | ◐ | `BULK_INVITE_MAX = 200`. Der Server meldet `truncated` ehrlich — **das Frontend zeigt es nirgends**. Bei 1000 Kräften gehen 200 Mails raus, 800 verschwinden lautlos |
| 4d | Kommt die Mail überhaupt an? | ✗ | **`sendMail` gibt ohne konfigurierten Transport still `true` zurück** (`app.js:156`). Die Oberfläche meldet dann „200 eingeladen, 0 fehlgeschlagen", obwohl **keine einzige Mail** das Haus verlassen hat |
| 5 | Link in der Mail | ✅ | `worker-login.html?invite=<token>`, 7 Tage, eigener nginx-Block |
| 6 | Registrierung im Portal | ◐ | Formular, Vorbefüllung (`GET /auth/worker/invite/:token`), Passwortvergabe: alles gebaut |
| 6b | **Der Sprung danach** | ✗ | **Sackgasse.** Der Sprung ist *relativ*, es gibt kein `<base>`, und für `einsatzportal` existiert **kein** nginx-Alias (`worker-login.html` hat einen). Der frisch registrierte Mensch landet auf der **Marketing-Startseite**, HTTP 200 |
| 7 | Kollision auf dem **Import**-Weg | ✅ | `EMAIL_EXISTS_OTHER_ROLE` (`workerService.js:3282`) |
| 7b | Kollision auf dem **Einladungs**-Weg | ✗ | **Der schwerste Befund.** `acceptInvite` macht `INSERT INTO users … ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, is_verified = TRUE`. Gehört die Adresse schon einem Plattform-Konto, wird **dessen Passwort still überschrieben**, das Konto an die einladende Firma gehängt — und `role` bleibt unangetastet. Derselbe Riegel existiert im Import-Weg und fehlt hier ersatzlos |
| 8a | Trennwand Arbeiter → Plattform | ◐ | **Aufgezählt, nicht strukturell.** `hidden_worker` ist **reines Frontend** (`hubVisibility.js:170`) — im ganzen `api/` kommt es nur als Kommentar vor. Es trägt: `requireCompanyOrg` (wo montiert) und `rbacService` (`worker` steht in keiner Erlaubnisliste). **Die Lücke:** Routen mit nur `requireAuth`. Gemessen: **165 Routenzeilen** tragen `requireAuth` als einzigen Riegel — darunter `GET /invoices/operational` mit den Umsatzkennzahlen der Firma, und ein per Einladung angelegter Arbeiter hat eine `org_membership` in genau dieser Org |
| 8b | Trennwand Plattform → Portal | ✅ | `requireWorkerRole` (`workerPortal.js:214`), **44 von 44 Wegen** tragen ihn. Selbst nachgezählt |
| 8c | Der Wächter dazu | ◐ | Der Torwächter-Test sieht **nur 18 der 44 Routen** — beide Schleifen filtern auf `path.includes(':')`. Nicht gesehen werden ausgerechnet `GET /worker/me`, `PUT /worker/me/skills`, `GET /worker/documents`. **Ein Wächter, der Sicherheit zusagt, die er nicht prüft, ist teurer als keiner** |
| 8d | Getrennte Sitzungen? | ✗ | **Nein.** Es gibt zwei Sitzungswelten: `tc.staff.sid` (eigener Store, Pfad `/staff`) und `tc.sid` für **alles andere**. Portal und Plattform teilen Cookie, Store und `users`-Tabelle — getrennt allein durch `users.role`. Das Muster für die Trennung existiert bereits (`/staff`) |
| 9 | Skills eintragen | ✅ | `GET/PUT /worker/me/skills`, aus der Portal-Navigation erreichbar |
| 10 | Skills lösen Angebote aus | ⊘ | `setWorkerSkills` löst **nichts** aus. Die Materialisierung steckt allein in `sweepMarktpraesenz`, und deren **einziger Aufrufer** ist `POST /internal/staffing-maintenance` |
| 11 | Marktplatz füllt sich automatisch | ⊘ | **Der Mechanismus ist vollständig und sauber gebaut** (Mig 200/201, anonyme `capacity_posts` mit `quelle='live_belegschaft'`) — **er läuft nur nicht.** Kein Crontab im Repo, kein Scheduler-Container, kein BullMQ-Takt. Die eigene Betriebsakte hält zum 2026-08-24 fest: *„der Weg ist jetzt offen, aber es ruft ihn noch niemand"* |
| 12 | DSGVO-Profil statt Angebot | ◐ | Feldsparsamkeit ist maschinell erzwungen (`marktplatzFeldWaechter`), interne Notizen bleiben draußen. **Offen:** das Auto-Angebot trägt die **Wohnort-PLZ** der Person — in einem kleinen Ort ist PLZ + Skill + Zeitfenster re-identifizierend |
| 12b | Widerspruch des Arbeiters | ✗ | Der einzige Ausschalter liegt bei der **Agentur** (`POST /workers/:id/marktpraesenz`). Der Mensch selbst kann nicht widersprechen. Und das Portal verspricht ihm „Änderungen wirken sich **sofort** auf Ihre Sichtbarkeit aus" — im Automatik-Pfad nachweislich unwahr |
| 12c | Rücknahme bei Skill-Entzug | ✗ | Nimmt der Mensch eine Fähigkeit heraus, **bleibt das öffentliche Angebot stehen** — und weil `availability_to` NULL bleibt, fällt es auch aus keinem Verfallslauf |
| 12d | Audit der Automatik | ✗ | Beide **manuellen** Wege auditieren. Ausgerechnet der Weg **ohne menschliche Entscheidung** nicht. Auf „seit wann stand ich im Markt?" gibt es keine Quelle |
| 13 | Sammelabschluss über mehrere Firmen | ✗ | Nicht vorhanden. `accept-deal` sperrt genau **einen** `capacity_post`. **Aber:** die Bausteine stehen (siehe M5) |
| 13b | Teilangebot einer Firma | ⊘ | Die einzige Seite mit freiem Mengenfeld (`sla_angebote.html`) speist ihre Bedarfsauswahl aus einem Endpunkt, der **hart auf die eigenen Bedarfe** scopet — für eine Agentur ist die Liste **immer leer** |
| 14 | Vier-Schritte-Modal | ◐ | Es sind **drei** Schritte (Anzahl, Zeitraum, Preis); „Ort" ist ein Listenfilter davor. **Achtung Doppelbau:** in `offer_detail.html` steht bereits ein generischer mehrstufiger Assistent, dessen Schritt 1 exakt Leistung, Zeitraum, **Menge, Ort und Preis** auflistet |
| 15 | Drei Ausgänge | ◐ | Das Modal hat **zwei** Knöpfe. „Anfrage senden" fehlt — der Endpunkt `negotiate-deal` **existiert** und hat auf dieser Fläche keinen Aufrufer |
| 16 | Abschluss → sofort Zuordnung | ✗ | **Die Kette reißt zwischen `assignments` und `worker_assignment_links`.** `activateAgreement` schreibt den Einsatz-Container und schickt eine **Benachrichtigung** — die Zuordnung eines Menschen macht **immer ein Mensch**. Fünf INSERT-Stellen, alle mit menschlichen Aufrufern |
| 16b | Kunde sieht es sofort | ◐ | Die Live-Tafel ist eine **Heute**-Tafel (`start_date <= CURRENT_DATE`). Ein Deal mit Start in zwei Wochen erscheint dort nicht — **aber im Monatsplan**, org-gebunden und verdrahtet |
| 16c | Portal aktualisiert sich | ◐ | Der Live-Strom aktualisiert **nur den Glockenzähler**. Die Einsatzliste hat weder SSE noch Polling — der Mensch sieht den Einsatz erst nach Neuladen |
| 17 | Firma bestätigt / schreibt zurück | ✅ | `confirm-agreement`, `counter` — beide verdrahtet |
| 18 | Staff-Eingriff auf **einen** Vorgang | ✗ | Da ist Aufsicht auf **Org-Ebene** (freigeben, aussetzen, Moderation, Missbrauchsmeldungen). Es gibt **keinen** Endpunkt, um ein einzelnes Angebot zurückzunehmen; `companyBlocklistService` wird vom Staff CC **nie** importiert |
| 19 | Dokumente überall | ◐ | Plattform: ja. **Einsatzportal: nein** — der Mensch kennt nur seine *eigenen* Nachweise, die Einsatzvereinbarung, die ihn betrifft, kann er nirgends öffnen. Staff CC: nur eine Übersicht. **Eine von drei Flächen** |

---

## 3. Die Rechtsfrage — und warum die Antwort das Produkt besser macht

> „kann das irgendwie von tempconnect übernommen werden oder ist das rechtlich heikel?"

**Übernehmen: nein. Bündeln: ja — und zwar vollständig.**

### 3.1 Was nicht geht

Arbeitnehmerüberlassung ist erlaubnispflichtig, und verleihen darf nur, wer den
Arbeitnehmer **selbst beschäftigt**. **Kettenverleih ist untersagt.** Säße TempConnect als
Vertragspartei in der Mitte, wäre die Folge nicht ein Bußgeld allein, sondern im
schlimmsten Fall, dass die Arbeitsverhältnisse **beim Kunden** entstehen.

### 3.2 Was geht: ein Akt, N Verträge

TempConnect handelt als **Bevollmächtigter beider Seiten** (Vollmacht in den AGB). Ein
Klick erzeugt **N einzelne Überlassungsverträge**, jeder zwischen *einer* Firma und dem
Unternehmen.

| Ebene | Was der Kunde erlebt | Was juristisch passiert |
|---|---|---|
| Oberfläche | **ein** Kauf, zwei Klicks | — |
| Vertrag | — | **N** bilaterale Überlassungsverträge |
| Rechnung | **eine** Sammelaufstellung | **N** Rechnungen, je Verleiher eine |
| Geld | ein Vorgang | direkt an die Verleiher bzw. über einen lizenzierten Anbieter |

Das ist keine Notlösung, sondern die **stärkere** Position: TempConnect ist nicht ein
weiterer Verleiher, sondern die Schicht, die zwanzig zu einem Einkauf zusammenfasst.

### 3.3 Zwei harte Folgen für den Ablauf

**(a) Die Konkretisierungspflicht.** Der Vertrag muss die Überlassung als solche
bezeichnen **und die Person benennen, bevor die Überlassung beginnt.** „30 Pflegekräfte,
zwei Klicks" ist deshalb **nie der ganze Vertrag** — es ist der **Rahmen**.

> **Und genau das kann die Plattform schon.** Die namentliche Zuordnung ist die
> Live-Belegschaft. Der rechtliche Zwang und der gebaute Ablauf fallen zusammen.
>
> **Bauvorgabe:** Der Korb erzeugt **zwei** Ebenen. Wer beides in eine Tabelle presst,
> baut den Rechtsfehler ins Datenmodell.

**(b) Das Geld.** Fremdes Geld einsammeln und weiterleiten ist ein Zahlungsdienst und
erlaubnispflichtig. Sicherer Weg: **Rechnung im Namen und für Rechnung des Verleihers**,
das Unternehmen bekommt eine Sammelaufstellung.

### 3.4 Das Gate vor dem Korb

**Die Form des Überlassungsvertrags.** Historisch Schriftform; das
Bürokratieentlastungsgesetz IV hat sie zum **01.01.2025 auf Textform** gesenkt — nach
meinem Kenntnisstand, aber **anwaltlich zu bestätigen, bevor der Zwei-Klick-Abschluss
ausgeliefert wird** (Entscheidung **M-E1**).

| Antwort | Folge |
|---|---|
| **Textform genügt** | Der Zwei-Klick-Abschluss trägt: Vertragstext + Protokoll + Zustellung an beide |
| **Schriftform bleibt** | Der Rahmen braucht eine qualifizierte Signatur. Mig 084 ist der Anker; „Sofort-Abschluss" wird zur „Sofort-Anfrage mit Signaturlauf" |

**Der Entwurf muss beide Antworten tragen** — Formweg als Schalter, nicht hartverdrahtet.

### 3.5 Drei Grenzen, die heute **nicht** greifen

| Grenze | Befund |
|---|---|
| **Verleiherlaubnis** | `compliance_documents` kennt `doc_type = 'aueg_erlaubnis'` samt Prüf- und Ablaufzuständen. **Kein einziger Marktplatz-, Kapazitäts- oder Vertragspfad liest sie.** Der Compliance-Filter im Feed ist **selbstdeklariert**, Vorgabe `"unknown"`. Eine Firma ohne Erlaubnis kann anbieten, gebucht werden und zuordnen |
| **Equal Pay nach neun Monaten** | Existiert **nirgends** — ein einziger Treffer im ganzen Repo, und der ist eine Absichtserklärung in einem Plan. Dabei betrifft es genau das Geld, das das Buchungsmodal nennt |
| **Überlassungshöchstdauer** | Existiert **zweimal**: `auegService` (Frist je Kunde konfigurierbar, mit Datenlage-Vorbehalt) und `auegFristService` (Konstante 18/3, ohne Vorbehalt). Im **Buchungsmodal läuft die schwächere.** Dazu: die Konfigurationstabelle hat **keinen Schreiber**, es gibt **keine einzige AÜG-Benachrichtigung**, und ein **stornierter** Deal verbraucht weiter Frist |

---

## 4. Verbindliche Leitentscheidungen

| Nr. | Entscheidung | Begründung |
|---|---|---|
| **M-L1** ✅ entschieden | **Ein Akt, N Verträge.** TempConnect wird nie Vertragspartei der Überlassung | Kettenverleih ist verboten |
| **M-L2** ✅ entschieden | **Rahmen und Konkretisierung getrennt** — im Datenmodell, nicht nur in der Anzeige | Konkretisierungspflicht |
| **M-L3** ✅ entschieden | **Eine Sammelaufstellung, N Rechnungen.** Kein fremdes Geld über ein TempConnect-Konto | Zahlungsdiensterecht |
| **M-L4** ✅ entschieden | **Der Import bereitet die Einladungen vor, sendet sie erst auf einen Klick** — mit Vorschau, und **begrenzt auf den gerade importierten Stapel** | Eine Mail an die halbe Belegschaft ist nicht zurückholbar. Die Messung zeigt: heute kann ein Klick 180 Unbeteiligte erreichen |
| **M-L5** ✅ entschieden | **Die Trennwand wird bewiesen, nicht behauptet** — beide Richtungen, entdeckender Wächter, Mutationsprüfung | Ein Flip von 403 auf 200 ist hier ein Datenschutzvorfall |
| **M-L6** ✅ entschieden | **Kein neues Datenmodell für das Modal.** Und **kein dritter Assistent** — `offer_detail.html` hat bereits einen mehrstufigen Rahmen mit genau diesen Feldern | Zwei Assistenten sind schon zu viel |
| **M-L7** ✅ entschieden | **Der Staff-Eingriff folgt dem 3a-Muster aus Welle K:** Grund statt Freitext, Wirkungsvorschau, Verfall, nie in eigener Sache, Quelle sichtbar | Es gibt keine zweite Staff-Rolle |
| **M-L8** ✅ entschieden | **Verdrahtet, aber unerreichbar zählt nicht als fertig.** Jede Phase weist den Klickpfad nach | Die häufigste Fehlerklasse dieses Repos — hier siebenmal gemessen |
| **M-L9** ✅ entschieden | **Ein Takt-Herzschlag vor allem anderen.** Kein Automatismus gilt als geliefert, solange nicht messbar ist, wann er zuletzt lief | An einer nie eingerichteten Crontab-Zeile hängen: die gesamte Marktplatz-Automatik, der Hard-Lock bei Zahlungsausfall, das automatische Nachrücken und der Verfall von Einladungen |

---

## 5. Was im Ablauf fehlt — der Owner hat richtig vermutet

> „vielleicht habe ich noch was vergessen"

**Der Ablauf hat kein Ende.** Das ist die größte Lücke, und sie zieht eine halbe
Nachlaufkette mit sich.

| Rang | Lücke | Warum es weh tut |
|---|---|---|
| **1** | **Nichts setzt jemals `assignments.status = 'completed'`.** Die zwei Wege dorthin haben **null Frontend-Aufrufer**; kein Cron schließt einen Einsatz ab | Damit sind **Bewertung** (`WHERE a.status='completed'`) und **Lieferantenreputation** strukturell tot — das Bewertungsmodal ist gebaut und auf zwei Seiten eingehängt und kann nie etwas anzeigen. Und die AÜG-Rechnung **zählt Zeiten weiter, die längst vorbei sind**; Mig 210 beschreibt genau diesen Schaden und hat drei Zeilen von Hand repariert, nicht die Ursache |
| **2** | **Equal Pay: kein Rechenwerk** | Betrifft das Geld, das das Buchungsmodal nennt. Rechtsfolge: Nachzahlung, SV-Beiträge rückwirkend, Bußgeld |
| **3** | **Die Sperrliste greift an drei von fünf Zuweisungswegen nicht** — `assignmentStaffingService.js` enthält **kein einziges** Vorkommen von „Sperr"/„blocklist", und genau diese Datei trägt den **automatischen** Weg | Der Kunde sperrt eine Kraft nach einem Vorfall. Der automatische Nachrücker setzt **exakt diese Person** wieder auf dieselbe Baustelle. Kein Fehler, keine Meldung |
| **4** | **„Deaktivieren" ist irreversibel und trifft alle Kunden gleichzeitig** — ein Knopf ohne Rückfrage, ohne Grund; der Wiederherstellungsblock steht hinter `if (!isActive)` und feuert nie | Die Kraft verschwindet aus **jeder** Live-Belegschaft, der Einsatz gilt weiter als besetzt, kein Kunde erfährt es. Der *korrekte* Ausfallweg macht fünf Schritte inklusive Kundenmeldung — der Versehensweg macht ein UPDATE |
| **5** | **Absage ≠ Verfall.** `declineAssignment` macht **einen** Schritt; Verfall und Rückzug machen vier | Nach einer Absage bleibt der Marktplatz-Posten auf „belegt", die Kraft bleibt reserviert, **und der Kunde plant weiter mit jemandem, der abgesagt hat** |
| **6** | **Automatischer Ersatz feuert nie** — zwei Ursachen: kein Takt, **und** der Kandidatenfilter schließt jeden Einsatz mit offener Einladung aus, während das Frontend nie ein `expires_at` sendet | „Takt nachrüsten" allein würde nichts ändern — genau die Sorte Fehlannahme, die eine Woche kostet |
| **7** | **Verlängerung und Übernahme fehlen** — die zwei profitabelsten Enden. `extended` ist ein gültiger Status **mit Anzeigeplättchen**, erreichbar nur über die aufruferlose Route; `temp_to_perm` existiert als Aufzählungswert und Beschriftung, „Übernahmegebühr" hat **null Treffer** | Wiederkehrender Umsatz und eine einmalige Provision laufen an der Plattform vorbei — der Kunde verlängert am Telefon |
| **8** | **Zahlungsausfall auf der operativen Rechnung ist nicht modelliert.** `overdue` ist ein gültiger Zustand, den **nichts** je setzt | `overdue_count` ist **strukturell immer null** — eine Kennzahl, die nicht ungleich null werden kann. Die Firma erfährt nicht, dass ihr Kunde nicht zahlt |
| **9** | **Kein Storno-Entgelt.** Null Treffer für Stornogebühr/`cancellation_fee`/Absagefrist | Der Kunde sagt drei Stunden vorher ab; die Firma hat Bereitschaft bezahlt und bekommt eine Reputationszahl. *(Stornogrund, Vorlaufberechnung und Wirkungsvorschau existieren — nur die Folge fehlt)* |
| **10** | **Skalierung:** `worker_assignment_links` hat **neun Indizes und keinen auf `org_id`** — der Spalte, mit der **jede** Kundenabfrage beginnt und die alle 30 Sekunden gepollt wird. Mig 196 legt zusätzlich RLS auf genau diese Spalte | Bei 24 Zeilen unsichtbar. Bei 300 Kunden ist das die heißeste Abfrage der Plattform auf einem Sequential Scan |

### Was **nicht** fehlt — damit nichts doppelt gebaut wird

- **Stundenzettel-Schleife kundenseitig**: vollständig (bestätigen, ablehnen, Korrekturzustand, Beschwerdekanal)
- **Rechnungskorrektur, E-Rechnung, DATEV**: vorhanden, samt Aussteller-Riegel
- **Kulanzfrist bei Zahlungsausfall des Abos**: 14 Tage, dann Hard-Lock
- **Ausfall im laufenden Einsatz**: `reportUnavailable`, Ersatzstellung mit 4-Stunden-Frist, Kundenmeldung — gebaut und verdrahtet
- **Sperrliste selbst**: anlegen, lesen, löschen — es fehlt nur die **Durchsetzung**
- **Fläche für die zukünftige Besetzung**: existiert als **Monatsplan**
- **Wirkungsvorschau vor dem Storno**: existiert

---

## 6. Wellen und Phasen

Jede Phase ist für sich abgeschlossen, grün und committbar. Jede nennt ihren
**Nachweis** — und wo etwas geschützt wird, gehört eine **Rückmutation** dazu: die Regel
von Hand kaputtmachen und prüfen, dass die Suite dabei wirklich rot wird.

---

### M0 · Die Bestandsprüfung *(kein Code — und trotzdem die wichtigste Phase)*

| Phase | Inhalt | Nachweis |
|---|---|---|
| M0.1 | **Jeden Schritt aus Abschnitt 2 selbst nachmessen** — Urteil plus Beleg `datei:zeile` | Eine Tabelle, die der Owner lesen kann |
| M0.2 | **Jede Abweichung melden**, in beide Richtungen. „Ist doch schon da" ist so wertvoll wie „fehlt doch" | Abweichungsliste mit Beleg |
| M0.3 | **Erreichbarkeit separat**: welche Seite ist aus der Navigation eines Unternehmens wirklich zu erreichen? | Klickpfad je Seite, oder die Feststellung, dass es keinen gibt |

> **M0 endet mit einem Bericht an den Owner, nicht mit einem Commit.**
> Findest du, dass etwas **wirklich fehlt** — frag, bevor du baust.

---

### M1 · Die stillen Ausfälle *(zuerst — ohne sie funktioniert der Ablauf auf dem Papier)*

Drei Dinge melden heute Erfolg, ohne etwas zu tun. Solange sie stehen, ist jede weitere
Messung wertlos.

| Phase | Inhalt | Nachweis |
|---|---|---|
| M1.1 | **Takt-Herzschlag** (`D1`): Tabelle `betriebs_takt`, geschrieben von **jedem** `/internal/*`-Handler und **jedem** BullMQ-Takt; Kachel im Staff CC; Wächter, der rot wird, wenn eine Aufgabe länger schweigt als ihr Intervall mal drei | Eine Aufgabe künstlich aussetzen → Wächter rot. **Blueprint-fähig: gehört unverändert in jedes Folgeprojekt** |
| M1.2 | **Den Takt tatsächlich einrichten** — als Dienst im Stack, nicht als Zeile in der Doku | `sweepMarktpraesenz` läuft; der Herzschlag beweist es |
| M1.3 | **Mail ehrlich machen** (`D2`): ohne Transport in Produktion **hart ablehnen** statt still `true`; Versandprotokoll je Zweck; Bulk-Einladung über die vorhandene Queue statt seriell im Request | Ohne SMTP → die Route meldet den Fehlschlag, nicht Erfolg |
| M1.4 | **Die Sackgasse schließen** (`H7`): Sprungziele nach der Registrierung auf absolute Pfade, oder derselbe nginx-Alias wie für `worker-login.html` | `curl -I` gegen beide Adressen im laufenden Stack |
| M1.5 | **Die Paywall zum ersten Mal wirksam machen** (M-E2): je Seite ein eigener Erstellungs-Schlüssel, Browsen bleibt frei ab Konto. Der heutige Schlüssel ist für **jeden** Plan wahr — der fertige Paywall-Block kann auf ~20 Seiten nie erscheinen | DEMO-Konto → Feed sichtbar, Erstellen zeigt die Paywall. **Rückmutation:** Schlüssel wieder auf „alle Pläne" → Probe rot |
| M1.6 | **Das öffentliche Schaufenster** (M-E2, Stufe 1): Zahlen und Kategorien ohne Personen, indexierbar. Grundlage existiert (`/marketplace/public/capacity-posts` entfernt Kontaktdaten bereits) — sie muss aggregieren statt auflisten | Ohne Anmeldung: Zahlen ja, **kein einziges Personenprofil**. Wächter auf die Feldliste |
| M1.7 | **Die zweite Limit-Wahrheit entfernen** (M-E3): PRO ist unbegrenzt. Der abweichende Wert im Dienst wird **gelöscht**, nicht angeglichen — zwei Tabellen für dieselbe Grenze sind der Fehler, nicht ihr Inhalt | PRO-Agentur legt mehr als 50 Angebote an. **Ein-Schreiber-Wächter** (M11.3) verhindert die Rückkehr |
| M1.8 | **`org_type`-Dimension im Plankatalog anlegen** (M-E5): Struktur jetzt, Werte später. Sinnvolle Vorgaben, vom Owner anpassbar, ohne Codeänderung | Beide Seiten haben getrennte Grenzen; ein geänderter Wert wirkt ohne Neubau |

---

### M2 · Die Trennwand *(sicherheitskritisch)*

| Phase | Inhalt | Nachweis |
|---|---|---|
| M2.1 | **Das Passwort-Überschreiben schließen.** `createWorkerInvite` **und** `acceptInvite` bekommen denselben Riegel wie der Import (`EMAIL_EXISTS_OTHER_ROLE`) — als harter Abbruch statt `ON CONFLICT DO UPDATE` | Einladung an eine Adresse mit Plattform-Konto → Abbruch mit lesbarem Grund. **Rückmutation** |
| M2.2 | **Gemischte Groß-/Kleinschreibung**: heute entsteht dabei statt der Überschreibung ein **Zweitkonto** | Beide Fälle real durchgespielt |
| M2.3 | **Richtung Arbeiter → Plattform strukturell schließen** (`W2`): `wachen.json` um **lesende** Wege erweitern — jede GET-Route, die `req.orgId`/`req.session.userId` in eine Abfrage gibt, braucht eine Wachart | ✅ **gebaut 2026-09-05** — Ableitung aus der montierten Kette (457 von 471) plus benannte Ausnahmeliste (14), fail-closed. Vorlauf: `requireScope` benannt, sonst wären 61 Wege unsichtbar geblieben. Siehe `docs/UEBERGABE.md`, Abschnitt „M2.3 ist gebaut“. |
| M2.4 | **Den Torwächter reparieren** (`W3`): den Filter `path.includes(':')` an drei Stellen entfernen | Er sieht dann 44 statt 18 Routen. Neue Route ohne Guard → rot |
| M2.5 | **Eine Arbeitersitzung gegen Plattform-Routen fahren** und 403 erwarten — den Test gibt es heute **nicht** | Echte Sitzung, echte Routen |
| M2.6 | **Eigenes Cookie und eigener Store für die Arbeiterwelt** — das Muster `/staff` existiert. *Alternative: harter Riegel gegen Rollenkollision auf der E-Mail* | Owner-Entscheidung, wenn M2.1 nicht genügt |
| M2.7 | **Mutationsprüfung** auf der Entscheidungslogik, Schwelle 90 % | Bericht, **null Überlebende** in `if`/`&&`/Vergleich |

> **Grundlage für die Owner-Entscheidung M2.6, gemessen in M2.5 (2026-09-03).**
>
> Die Vorfrage von M2.6 lautet „genügt M2.1?“. Die Antwort ist **nein**, und zwar aus einem
> anderen Grund als vermutet: das Problem ist keine Rollenkollision auf der E-Mail, die man
> verriegeln könnte. Der Arbeiter ist **völlig regulär** Mitglied in der Org seiner
> Zeitarbeitsfirma — `acceptInvite` macht ihn dazu (`role_key='worker'` auf die
> `supplier_org_id`), einen Org-Typ `worker` gibt es nicht. Seine Sitzung trägt damit
> zwangsläufig `req.orgId` = die Kennung seines Arbeitgebers. Jede Route, die nur
> `requireAuth` trägt und über `req.orgId` liest, gibt ihm Firmendaten. Kein Riegel auf der
> E-Mail ändert daran etwas.
>
> **Der gemessene Umfang** *(korrigiert am 2026-09-03 — die erste Zahl war zu hoch)*:
> von 300 aufrufbaren GET-Routen antworten **64** einer Arbeitersitzung mit
> mandantengebundenen Daten. Davon sind **48 seine eigenen** (Konto, Portal, Profil,
> Benachrichtigungen — gelesen mit `WHERE user_id = $1`) und **16 org-geschlüsselt**.
> Von diesen 16 sind **15 geschlossen**; **eine** ist begründet unbedenklich
> (`/me/entitlements` — das Arbeiter-Portal braucht den Tarif der Firma, um zu
> wissen, welche Funktionen es anbieten darf). **Offene Befunde: 0.**
>
> Vollständig mit Begründung je Eintrag: `api/test/fixtures/arbeiterSitzung.json`,
> erzwungen von `api/test/arbeiterSitzung.test.js`. Dort ist `gemessen` eine Tatsache
> und `art` ein Urteil, das ihr nur mit geschriebener Begründung widersprechen darf.
>
> **Die Entscheidung ist damit eine andere geworden — kleiner, aber nicht weniger nötig.**
> Es geht nicht mehr um 45 offene Löcher, sondern um die **Bauart**:
>
> 1. **Route für Route, wie in M2.5 geschehen.** Funktioniert und ist heute erledigt —
>    aber jede künftige Route stellt die Frage neu. Der Wächter zwingt zur Antwort;
>    er kann sie nicht geben.
> 2. **Ein Riegel auf `/api/v1` mit benannter Ausnahmeliste** — fail-closed: eine neue
>    Route ist für Arbeiter zu, bis jemand sie einträgt. Das Register aus M2.5 **ist**
>    diese Liste, nur noch nicht scharf geschaltet. Entspricht dem Muster `/staff` und
>    dem Grundsatz der strukturellen Absicherung aus `CLAUDE.md`.
>
> **✅ OWNER-ENTSCHEID 2026-09-03: Weg (2)** — ein Riegel auf `/api/v1` mit der
> benannten Ausnahmeliste, fail-closed. Das Register aus M2.5 ist diese Liste.
>
> **✅ GEBAUT am 2026-09-04.** `api/middleware/arbeiterRiegel.js` als erste Schicht des
> v1-Routers, Wegliste in `api/config/arbeiterRiegel.js`, 23 Proben und neun
> Rückmutationen in `api/test/arbeiterRiegel.test.js`.
>
> **Zwei Dinge sind beim Bauen anders gekommen als im Entscheid formuliert, und beide
> gehören benannt:**
>
> 1. **Das Register kann die Liste nicht ALLEIN sein.** Sein eigener Kopf sagt, dass nur
>    Routen gemessen wurden, die **Mandantendaten** zurückgaben. Alles ohne
>    Mandantenbezug fehlt darin — `GET /csrf`, `GET /skills/catalog`,
>    `GET /auth/sessions`, `GET /notifications/stream`. Genau die ruft das Einsatzportal.
>    Das Register allein als Ausnahmeliste hätte das Portal am ersten Tag ausgesperrt.
>    Jetzt zwei Verzeichnisse, die einander prüfen: die **Messung**
>    (`test/fixtures/arbeiterSitzung.json`) und die **Erlaubnis**
>    (`config/arbeiterRiegel.js`). Jeder `erlaubt`-Eintrag muss durchkommen, jeder
>    `geschlossen`-Eintrag muss scheitern.
>
> 2. **Nicht auf `/api/v1`, sondern auf dem ROUTER.** Der v1-Router ist zweimal montiert
>    (`app.use("/api/v1", v1)` und `app.use("/api", v1)`), und die bestehende Oberfläche
>    benutzt die kurze Adresse. Ein Riegel auf dem Mount `/api/v1` — so wie der Entscheid
>    ihn wörtlich beschreibt — wäre durch Weglassen von `/v1` vollständig zu umgehen
>    gewesen, unauffällig, weil beide Wege funktioniert hätten.
>
> Die Messung stützt den Entscheid: von
> sechs in dieser Welle geschlossenen Befunden trugen **alle sechs** dieselbe Falle —
> `mine`/`me` im Pfad, gemeint war die **Org**: `/subscription-requests/mine`,
> `/subscription-documents/mine`, `/profile-bounties/me`, dazu `/org/departments`,
> `/org/locations`, `/deal-feedback/pending`. Eine Namenskonvention, die sechsmal in
> dieselbe Richtung täuscht, täuscht auch beim siebten Mal — und sie hat beim Einstufen
> auch mich getäuscht. Genau davor schützt fail-closed und kein Urteil.

> **Eine offene Frage, die diese Welle bewusst NICHT entschieden hat.** Vier Schreibwege
> lassen einen Arbeiter **im Namen seiner Firma handeln**, ohne dass Daten abfließen:
> `POST`/`DELETE /profile-visibility/:orgId/like` und `…/favorite` schreiben
> `likerOrgId: req.orgId`. Ein Arbeiter, der ein fremdes Firmenprofil befürwortet oder
> merkt, tut das damit als **seine Zeitarbeitsfirma** — und für eine Agentur ist eine
> öffentliche Befürwortung eines Marktteilnehmers kommerziell nicht bedeutungslos.
>
> Das ist kein Leck, sondern eine **Produktfrage**: darf ein Arbeiter im Namen seines
> Arbeitgebers auftreten? Sie gehört zu M2.6 und nicht in eine Welle, die Datenabflüsse
> schließt. Der Riegel dafuer liegt bereit (`verweigereArbeiter`, eine Zeile je Route);
> was fehlt, ist die Entscheidung.

---

### M3 · Der Kettenanfang

| Phase | Inhalt | Nachweis |
|---|---|---|
| M3.1 | **Der Import endet mit dem Angebot einzuladen** — Vorschau plus ein Klick (M-L4) | ✅ **gebaut 2026-09-04** — der Knopf nennt die Zahl der EINLADBAREN (nicht der angelegten) und schickt genau diese Kennungen; ohne E-Mail importierte Zeilen werden ausdrücklich als „noch nicht einladbar“ benannt. Siehe `docs/UEBERGABE.md`, Abschnitt „M3.1 ist gebaut“. |
| M3.2 | **Auf den Stapel begrenzen** (`H4`): `created`-IDs im Rumpf statt org-weit | ✅ **gebaut 2026-09-04** — 10 importiert → höchstens 10 eingeladen. `profile_ids` aus dem Import-Bericht begrenzen `listInvitableWorkers`; die Org-Bedingung bleibt die äußere Klammer, eine leere Liste heißt „keine“. Siehe `docs/UEBERGABE.md`, Abschnitt „M3.2 ist gebaut“. |
| M3.3 | **Die drei verschwiegenen Felder anzeigen**: `truncated`, `skipped_pending`, `skipped_accepted` | ✅ **gebaut 2026-09-04** — beide Sammel-Knöpfe nennen `truncated`, `skipped_pending` und `skipped_accepted`; `truncated` fordert zum erneuten Klicken auf. Der gespiegelte Deckel im Browser wird gegen `workerService.BULK_INVITE_MAX` erzwungen. Siehe `docs/UEBERGABE.md`, Abschnitt „M3.3 ist gebaut“. |
| M3.4 | **Vom abgelaufenen Link auf „Passwort vergessen" verlinken** (`H6`) — der Weg **funktioniert bereits**, er ist nur nicht verlinkt. Und die Reset-Mail rollenabhängig ins Portal zeigen lassen | ✅ **gebaut 2026-09-04** — abgelaufener/widerrufener Link zeigt den Weg zum Zurücksetzen (nicht bei „nicht gefunden“); die Reset-Mail führt Arbeiter ins Einsatzportal, alle anderen weiter auf die Landeseite. Siehe `docs/UEBERGABE.md`, Abschnitt „M3.4 ist gebaut“. |
| M3.5 | **Wiedervorlage** für nicht angenommene Einladungen | ✅ **gebaut 2026-09-04** — erinnert wird, was in 48 h abläuft (nicht was alt ist), genau einmal je Einladung; markiert erst nach dem Versand, ohne Fristverlängerung. Täglich 09:00 über die Takt-Maschinerie aus M1.9. Siehe `docs/UEBERGABE.md`, Abschnitt „M3.5 ist gebaut“. |
| M3.6 | **Zeilen ohne E-Mail freischalten** (`H3`) — vier Stellen, kein Neubau. **Nur mit Owner-Freigabe:** `csvFeldregeln.test.js:191` nagelt die Pflicht absichtlich fest | Der Test wird mit dokumentierter Begründung geändert, nicht abgeschwächt |
| M3.7 | **`org_type`-Riegel für den Import** — „nur die Zeitarbeitsfirma" ist heute nicht erzwungen | ✅ **gebaut 2026-09-04** — Unternehmens-Org → 403 (`AGENCY_ORG_REQUIRED`). Nicht nur der Import: gemessen sind von 65 Wegen dieses Moduls 36 belegbar agenturseitig und **null** kundenseitig, deshalb steht der Riegel im gemeinsamen Wachstapel. Siehe `docs/UEBERGABE.md`, Abschnitt „M3.7 ist gebaut“. |

---

### M4 · Der Markt entsteht wirklich

| Phase | Inhalt | Nachweis |
|---|---|---|
| M4.1 | **Rücknahme bei Skill-Entzug**: Bedingung `NOT EXISTS (worker_profile_skills …)`, und `availability_to` bekommt ein Ende | Skill entfernen → Angebot verschwindet |
| M4.2 | **Audit der automatischen Veröffentlichung** (`D4`) | „Seit wann stand ich im Markt?" ist beantwortbar. **Voraussetzung dafür, den Markt mit Personenprofilen überhaupt betreiben zu dürfen** |
| M4.3 | **Widerspruch für den Menschen selbst** — plus ein wahrhaftiger Hinweis an der Skill-Karte. Heute steht dort „wirkt sich **sofort** aus", und das ist im Automatik-Pfad unwahr | Widerspruch wirkt, Text stimmt |
| M4.4 | **Ein gemeinsames Katalog-Gate.** Die beiden Wege prüfen heute **disjunkt**: die Automatik nur `is_active`, der Generator nur `status='approved'` — unkuratierter Freitext erreicht den öffentlichen Markt | Beide Spalten, ein Gate |
| M4.5 | **Einsatzradius statt Wohnort** (M-E4, siehe 8.3): 10 / 50 / 100 km um einen Anker, Vorgabe 50. Ausgeliefert werden **Radius plus grobe Raumangabe**, nie der Anker; gesucht wird per Abstandsrechnung serverseitig | Eine Kraft erscheint bei jedem Bedarf im Radius, und die exakte PLZ verlässt den Server nicht. **Rückmutation:** Anker in die Antwort legen → Feld-Wächter rot |
| M4.5b | **Der Radius ist zugleich der Widerspruchshebel** (verbindet M4.3): Radius auf null heißt „nicht im Markt", vom Menschen selbst im Portal setzbar | Radius null → die Person verschwindet aus dem Feed, sofort |
| M4.6 | **`markt_merkmale` und `quelle` auch im allgemeinen Feed rendern** (`H5`) — die API liefert sie an jeden, gerendert werden sie auf **einer** Fläche | Herkunft ist überall sichtbar |
| M4.8 | **Der OK-Klick der Firma** (M-E10): speichert der Mensch seine Fähigkeiten, entsteht ein Eintrag „wartet auf Freigabe“ bei der Zeitarbeitsfirma; ein Klick veröffentlicht ihn **sofort**. Der Sofort-Weg existiert (`setzeMarktpraesenz` legt synchron je Katalog-Fähigkeit einen anonymen Eintrag an) — **es fehlt nur der Anstoß** | Fähigkeit speichern → Firma sieht die Freigabe → Klick → Eintrag steht im Feed, ohne auf den 15-Minuten-Takt zu warten. **Rückmutation:** Anstoß entfernen → Probe rot |
| M4.9 | **Pflichtfelder schließen den Kreis** (Owner-Vorgabe 2026-09-05). Von den fünf Bedingungen, unter denen ein Eintrag entsteht, sind **zwei Feld-Material und drei Zustände** — siehe die Aufschlüsselung unter der Tabelle. Gebaut wird beides: die zwei als Pflicht, die drei als lesbarer Grund | Kein Mensch fällt mehr **wortlos** aus dem Markt. Ausgangsbefund: **30 von 33 Kräften unsichtbar** |
| M4.10 | **Je Katalog-Fähigkeit ein Angebot — UND ein Sammelangebot je Mensch** (Owner-Vorgabe 2026-09-06). Der Sammelangebot-Erzeuger existiert bereits: `GET /capacity-exchange/pool/suggestion` und `POST /pool/generate` | Ein Mensch mit fünf Fähigkeiten erzeugt fünf Einzelangebote **und** ein Sammelangebot |
| M4.11 | **Der Zweck ist Volumen, und er gehört benannt.** Owner: *„damit es voluminös wirken kann, auch bei wenigen Zeitarbeitsfirmen und vielen Skills der einzelnen Mitarbeiter"*. Ein Marktplatz, der bei zehn Firmen leer aussieht, gewinnt die elfte nicht | **Und die Grenze dazu:** kein Angebot ohne echte Person dahinter. Volumen entsteht aus **Fähigkeiten**, nie aus Vervielfältigung. Ein Mensch, fünfmal gebucht, wäre Betrug — die Reservierung muss ueber alle Angebote **desselben** Menschen greifen. **Rückmutation** |
| M4.12 | **Die Bestaetigungspflicht trifft die falschen Eintraege** *(Befund aus dem Betrieb, 2026-09-07)*. `findStaleEntries` markiert alles mit `last_confirmed_at IS NULL OR < NOW() - 7 Tage` als `needs_reconfirmation` — **ohne Filter auf `quelle`**. Damit soll die Firma Eintraege bestaetigen, die **die Plattform selbst** aus ihrer Live-Belegschaft erzeugt hat und beim naechsten Takt ohnehin neu bildet | Bei einem **abgeleiteten** Eintrag kommt die Wahrheit aus dem Sweep, nicht aus einem Klick. Die Pflicht gilt nur fuer **handgepflegte** Eintraege. **Nachweis:** Auto-Eintrag 8 Tage alt → keine Meldung; handgepflegter → Meldung. **Rückmutation:** Filter entfernen → Probe rot |
| M4.13 | **Der Share-Link prüft dieselbe Bedingung wie der Leser** *(Befund aus dem Betrieb, 2026-09-07)*. Der Erzeuger (`workers.js:636`) prüft nur `public_profile_slug`; der Leser (`workerService.js:1572`) verlangt `public_profile_slug` **UND** `profile_public = TRUE`. Es entsteht ein Link fuer ein Profil, das gar nicht geteilt ist — der Empfaenger liest „Dieses Profil ist nicht verfuegbar" | Kein Link ohne Freigabe. Statt eines toten Links ein Satz, der sagt, was fehlt: *„Dieses Profil ist nicht freigegeben — erst freigeben, dann teilen."* **Rückmutation je Bedingung** |
| M4.7 | **Der Trichter** (`D3`): sechs Zahlen je Org und Woche — importiert / eingeladen / angenommen / Skills gesetzt / im Markt sichtbar / gebucht | **Wirtschaftlich der beste Nicht-Feature-Bau: er priorisiert alles andere.** Ausgangsbefund im Quelltext: 30 von 33 Kräften unsichtbar |

---

> **Die fünf Bedingungen aus M4.9, ehrlich getrennt.** Der Eintrag im Marktplatz entsteht
> heute nur, wenn alle fünf erfüllt sind. Sie sind aber nicht gleichartig, und wer sie
> gleich behandelt, baut Unsinn — „heute nicht krank“ ist kein Pflichtfeld.
>
> | Bedingung | Pflichtfeld? | Warum |
> |---|---|---|
> | **Wohnort** (`city`) | **ja** | Gemessen: heute weder beim CSV-Import Pflicht (`is_required = FALSE`) noch im Portal (`optional().nullable()`). Ohne Wohnort **kein Eintrag** — die häufigste stille Ursache. Pflicht **im Portal**, wo der Mensch es selbst weiß; beim Import bleibt es freiwillig, weil die Firma es oft noch nicht hat |
> | **Mindestens eine freigegebene Katalog-Fähigkeit** | **ja** | Ein *Vorschlag* zählt nicht — er wartet auf Kuratierung. Das muss die Oberfläche **sagen**, sonst hält der Mensch sich für fertig. Heute verspricht ihm das Portal sogar das Gegenteil |
> | Profil aktiv | **nein** | Ein Zustand, den die Firma bewusst setzt. Deaktivierung ist gewollt, kein Versehen |
> | Heute nicht abwesend | **nein** | Zeitlich und gewollt: wer krank ist, soll nicht angeboten werden. Als Pflichtfeld wäre es sinnlos |
> | Ein Agentur-Nutzer existiert | **nein** | Ein Datenproblem der Organisation, nicht der Person. Gehört als Warnung in die Firmen-Ansicht, nicht in das Formular des Menschen |
>
> **Die Regel dahinter:** Was der Mensch selbst wissen und ausfüllen kann, wird Pflicht.
> Was ein Zustand ist, wird **erklärt**. Ein Pflichtfeld für etwas, das man nicht ausfüllen
> kann, ist eine Sackgasse mit Sternchen.

### M4b · Der Selbstlauf — damit die Pflichtfelder tragen können

> **Owner-Vorgabe 2026-09-05:** *„lass uns alles so zusätzlich anpassen, dass diese
> Pflichtfelder auch Pflichtfelder werden können — weil ich denke, dass es auf diese Art
> viel Arbeit der Zeitarbeitsfirma spart. Wenn TempConnect automatisch alles selbst auslöst
> durch den CSV-Import oder die Neueinstellung mit Einsatzportal-Einladung in den Marktplatz,
> könnte es für die Firmen Gold wert werden.“*

**Das ist der Verkaufsgrund, nicht eine Bequemlichkeit.** Die Zeitarbeitsfirma soll gar keine
Marktplatz-Arbeit haben: sie lädt eine Liste hoch, bestätigt zwei Mal, und ihre Leute stehen
im Markt. Alles dazwischen macht die Plattform.

**Ein Pflichtfeld ist aber nur dann eines, wenn man es erfüllen KANN.** Gemessen — heute
kann man das zweite nicht:

| Blocker | Befund | Folge |
|---|---|---|
| **Es gibt keine Freigabe-Fläche für vorgeschlagene Fähigkeiten** | `POST /skills/propose` legt einen Vorschlag an; im Staff Control Center existiert **kein** Kuratier-Modul (gemessen: null Treffer). Ein Vorschlag liegt **für immer** | Wäre „mindestens eine freigegebene Katalog-Fähigkeit“ heute Pflicht, säße jeder mit einem neuen Gewerk in einer **Falle ohne Ausgang** |
| **Die beiden Katalog-Tore sind disjunkt** | Die Automatik nimmt jede Fähigkeit mit `is_active = TRUE` — auch einen **unkuratierten** Vorschlag. Der manuelle Erzeuger verlangt `status = 'approved'` und ignoriert `is_active` | Ein ungeprüfter Vorschlag steht **heute schon** öffentlich im Marktplatz, während das Portal dem Menschen sagt: „Wir prüfen sie, danach zählt sie“. Beides gleichzeitig ist unwahr |

**Die gute Nachricht:** Die Zuordnung greift bereits. `proposeSkill` sucht erst den exakten
Katalognamen, dann die bekannten Schreibvarianten (`aliases[]`) — die meisten Eingaben landen
auf einem bestehenden Eintrag. Ein echter Vorschlag entsteht nur bei einem wirklich neuen
Gewerk. Der Ausnahmefall ist also selten; er ist nur heute ausweglos.

| Phase | Inhalt | Nachweis |
|---|---|---|
| M4b.1 | **Ein gemeinsames Katalog-Tor.** Beide Wege prüfen dieselben zwei Spalten. Ein unkuratierter Vorschlag erreicht den öffentlichen Markt **nicht** mehr | Vorschlag anlegen → er steht nicht im Feed. **Rückmutation je Spalte** |
| M4b.2 | **Die Kuratier-Fläche im Staff CC** — offene Vorschläge, mit Zuordnungsvorschlag aus `aliases[]`. Gehört dorthin, weil der Katalog die **Plattform als Ganzes** betrifft (`FLAECHEN.md`, Entscheidungsfrage 3) | Ein Vorschlag ist in unter einer Minute entschieden. Ohne diese Fläche ist M4b.3 eine Sackgasse |
| M4b.3 | **Pflichtfeld ohne Falle:** Pflicht ist **mindestens eine Fähigkeit** — ein Vorschlag zählt dafür. **Veröffentlicht** wird nur mit einer freigegebenen. Der Mensch sieht den Unterschied in Worten, nicht als stille Abwesenheit | Wer nur einen Vorschlag hat, kann sein Profil **abschließen** und liest: „wird geprüft — danach erscheinst du im Markt“ |
| M4b.4 | **Die Firma kann sofort auflösen.** In der Freigabe-Ansicht (M4.8) wählt sie für einen Vorschlag die passende Katalog-Fähigkeit — sie kennt das Gewerk | Kein Warten auf Kuratierung im Normalfall. **Das ist der Griff, der die Kette wirklich schließt** |
| M4b.5 | **Der Nachtrag nach dem Import — als erweiterbare Liste, nicht als festes Formular.** Was nach dem Import fehlt, wird gefragt: Wohnort (falls nicht im CSV), **Einsatzradius der Firma** (M-E11), Zuordnung offener Fähigkeits-Vorschläge. Owner-Vorgabe 2026-09-05: *„mach da bei der Abfrage noch mehr Platz für weitere Sachen, die abgefragt werden können."* | **Ein neuer Punkt kommt als Registereintrag dazu, nicht als Umbau.** Je Eintrag: was fehlt, warum es zählt, wer es beantworten kann (Firma oder Mensch), ob es die Marktpräsenz blockiert |
| M4b.6 | **Jeder Schritt bietet sich selbst an.** Nach dem Import: „47 angelegt → einladen?“ Nach der Registrierung: „Skills eingetragen → freigeben?“ Niemand muss sich an den nächsten Schritt **erinnern** | Ein Durchlauf ohne Vorwissen: Datei hoch, zweimal bestätigen, Leute stehen im Markt |

> **Zwei Hände bleiben am Hebel, und nur zwei** — das ist kein Widerspruch zur Automatik,
> sondern ihre Bedingung. **Einladungen senden** (M-L4: eine Mail an die halbe Belegschaft
> ist nicht zurückholbar) und **Marktpräsenz freigeben** (M-E10: der OK-Klick, den der Owner
> ausdrücklich will). Alles andere läuft von selbst. Wer eine dritte Bestätigung einbaut,
> nimmt der Welle ihren Zweck.

---

### M5 · Der Korb — ein Akt, N Verträge

**Kein Gate mehr — M-E1 ist entschieden: schaltbar bauen** (siehe 8.1). Die Rechtsauskunft
bleibt eine Owner-Aufgabe mit Auslöser („vor dem ersten Abschluss zwischen zwei echten
Kunden"), sie blockiert den Bau nicht.

> **Teil 1 gebaut am 2026-09-19 (Welle N3.0, Owner-Entscheid „Riegel zuerst").**
> **M5.1, M5.2, M5.3, M5.8 und M5.9 sind erledigt** — Einzelheiten in
> `docs/PILOT_GO_LIVE_TODOS.md`, Eintrag „Die Menge stimmt, und drei Riegel halten".
>
> | Phase | Stand |
> |---|---|
> | M5.1 Restmengen-Rechner | ✅ eine Abfrage über drei Quellen (Angebote, Notdienst-Zusagen ohne Angebot, Einsätze ohne Angebot); die beiden anderen Dienste stoßen sie nur noch an |
> | M5.2 Überfüllungs-Riegel | ✅ auch auf dem Normalweg, in derselben Transaktion mit `FOR UPDATE`; 409 `OVERFILL_NOT_ALLOWED` |
> | M5.3 `offered_quantity` | ✅ ohne Angabe gilt 1, nicht mehr „der ganze Bedarf" |
> | M5.8 Selbstgeschäfts-Riegel | ✅ beim Anbieten **und** beim Annehmen, 403 `SELF_DEAL_FORBIDDEN` |
> | M5.9 `partial_fulfillment_allowed` | ✅ wählbar beim Anlegen, wirkt beim Annehmen (409 `PARTIAL_NOT_ALLOWED`) |
> | M5.4 Anbieter-Modus · M5.5 Korb-Ansicht · M5.6 N Verträge · M5.7 Aufstellung | offen — Teil 2 und 3 |
>
> **Gemessen beim Bau:** der Staffing-Rechner schrieb die Besetzung EINES Einsatzes in den
> Bedarf — bei zwei Zeitarbeitsfirmen löschte die zweite Neuberechnung den Anteil der ersten,
> ausgelöst auch vom bloßen Lesen einer Dealakte. Genau der Fall, den M5.1 beschreibt.

> **Die gute Nachricht der Messung:** der Sammelabschluss ist **kein Neubau**. Endpunkt,
> Mengenfeld, Restmengen-Buchführung und die Summierung über alle angenommenen Angebote
> sind gebaut. Was fehlt, ist ein **Anbieter-Modus** in der Bedarfsliste — und drei Riegel.

| Phase | Inhalt | Nachweis |
|---|---|---|
| M5.1 | **Ein kanonischer Rechner für die Restmenge** (`W5`). Heute schreiben **drei** Dienste dieselben Spalten — und der dritte feuert **bei einem reinen Lesezugriff**: Firma A öffnet ihre Dealakte, und der Anteil von Firma B verschwindet | Zwei Firmen, ein Bedarf, Dealakte geöffnet → beide Anteile stehen noch. **Vorbedingung für alles Weitere** |
| M5.2 | **Überfüllungs-Riegel auf den Normalweg heben** (`H8`) — er existiert im Notdienst | Zwei Angebote à 30 auf einem 30er-Bedarf → das zweite wird abgewiesen |
| M5.3 | **`offered_quantity` nicht mehr auf den vollen Bedarf defaulten** | Leere Menge → 1 oder Pflichtangabe, nicht 30 |
| M5.4 | **Anbieter-Modus der Bedarfsliste** (`H1`): offene **fremde** Bedarfe für Agenturen, ohne Kontaktdaten des Bestellers; `sla_angebote.html` daran hängen; Deep-Link „Teilmenge anbieten"; Navigationseintrag | Eine Agentur sieht offene Bedarfe und kann 12 von 30 anbieten |
| M5.5 | **Der Korb als Ansicht**: die Kombination, die den Bedarf deckt, mit Preis je Firma und Gesamtpreis | 12 + 10 + 8 → gedeckt, kein Überlauf |
| M5.6 | **Ein Klick, N Verträge** (M-L1/M-L2): je Firma ein Vertrag, Rahmen und Konkretisierung getrennt. **Über einen Formweg-Schalter** (`textform` \| `schriftform`, Vorgabe `textform`) — bei `schriftform` wird daraus eine Anfrage mit Signaturlauf auf Mig 084 | 3 Firmen → 3 Verträge, 3 Belege, **0** Verträge mit TempConnect als Partei. **Beide Formwege einmal durchgespielt**, nicht nur der voreingestellte |
| M5.7 | **Die Sammelaufstellung** (M-L3) | Summe der N stimmt |
| M5.8 | **Selbstgeschäfts-Riegel auf dem normalen Angebotsweg.** Heute hat ihn nur `accept-deal` — auf dem normalen Weg kann ein Unternehmen **auf den eigenen Bedarf bieten und selbst annehmen** | Versuch → 403 |
| M5.9 | **`partial_fulfillment_allowed` beleben** — heute eine **tote Spalte**, die im Schema vorhanden aussieht | „Alle 30 oder keiner" ist wählbar und wirkt |

---

### M6 · Der Assistent *(Umverpackung, kein Neubau)*

| Phase | Inhalt | Nachweis |
|---|---|---|
| M6.1 | **Erst messen, welcher Assistent bleibt.** In `offer_detail.html` steht bereits ein mehrstufiger Rahmen mit Leistung, Zeitraum, **Menge, Ort, Preis** | Befund, **bevor** etwas gebaut wird (M-L6) |
| M6.2 | **Vier Schritte**, die den **bestehenden** Bedarf erzeugen | Der Datensatz ist identisch mit dem der Formularseite |
| M6.3 | **„Anfrage senden" als dritter Knopf** (`H5`) auf `negotiate-deal` — der Endpunkt existiert und hat auf dieser Fläche keinen Aufrufer. Bei `PRICE_OUTSIDE_OFFER` **dorthin leiten** statt nur den Rahmen zu erklären | Drei Ausgänge, alle wirksam |
| M6.4 | **Abbrechen verliert nichts** | Modal schließen, wiederkommen, Stand ist da |
| M6.5 | **Der Marktplatz-Detailweg schickt heute einen leeren Rumpf** und bucht pauschal die volle Kopfzahl | Auch dort wählbare Teilmenge |

---

### M7 · Der Durchstich

| Phase | Inhalt | Nachweis |
|---|---|---|
| M7.1 | **Die Kette zwischen `assignments` und `worker_assignment_links` schließen** (M-E6 ✅): **automatisch, wenn eindeutig** — genau eine passende freie Kraft der Firma → zugeordnet, Anfrage an den Menschen raus. **Mehrere passende → Aufgabe mit Frist**, keine Willkür durch das System | Eine passende Kraft → Zuordnung ohne Klick, im Portal sichtbar. Zwei passende → Aufgabe entsteht, **nichts** wird stillschweigend gewählt. **Rückmutation je Zweig** |
| M7.1b | **„Passend" ist eine Entscheidung, keine Vermutung.** Die Bedingung wird ausgeschrieben: freie Kraft, richtiger Skill, im Radius, verfügbar im Zeitraum, **nicht gesperrt** (M7.6), keine Fristkollision | Jede Bedingung mit einer echten Zeile belegt. Fällt eine weg, ist die Kraft nicht mehr „eindeutig" |
| M7.2 | **Der stille Ausfallpfad in `activateAgreement`**: schlägt eine Org-Auflösung fehl, wird der Deal trotzdem auf „aktiviert" gesetzt, ohne Einsatz, ohne Fehler, ohne Audit | Rückmutation: Auflösung scheitern lassen → sichtbarer Fehler |
| M7.3 | **Absage = Verfall** (Rang 5): Posten zurückgeben, Reservierung lösen, **Kunden melden**, org-weit statt an eine Person | Vier Wirkungen, jede belegt |
| M7.4 | **Automatischer Ersatz entsperren** (Rang 6): **beide** Ursachen — Takt *und* der Kandidatenfilter, der auf ein nie gesendetes `expires_at` wartet | Absage → Ersatzlauf feuert wirklich |
| M7.8 | **Die Meldung an den Menschen ist nicht abschaltbar** (Owner-Vorgabe 2026-09-06): *„eine Benachrichtigung an die Mitarbeiter, was gar nicht mehr von der Zeitarbeitsfirma gesteuert werden kann"*. Wer gebucht wird, erfährt es — unabhängig von den Einstellungen der Firma | **Rückmutation:** Meldeweg in den Firmen-Einstellungen abschaltbar machen → Probe rot. *(Sie steht dem Menschen zu, nicht seiner Firma — er ist der Betroffene, nicht der Empfänger einer Mitteilung.)* |
| M7.9 | **Er bestätigt, und die Firma sieht es.** Der Zustand existiert bereits (`worker_confirmation_status`) — was fehlt, ist die Sichtbarkeit beim Disponenten: gesehen, angenommen, abgelehnt, oder noch nichts | Die Firma erkennt an der Zeile, ob der Mensch Bescheid weiß |
| M7.5 | **Die Einsatzliste im Portal aktualisiert sich** — heute springt nur der Glockenzähler | Neuer Einsatz erscheint ohne Neuladen |
| M7.6 | **Sperrliste an allen fünf Zuweisungswegen** (Rang 3) | Gesperrte Kraft → automatischer Nachrücker weist sie ab. **Rückmutation je Weg** |
| M7.7 | **„Deaktivieren" entschärfen** (Rang 4): Rückfrage, Grund, Wirkungsvorschau („betrifft 3 Kunden"), Rückweg | Der Wiederherstellungsblock feuert wirklich |

---

### M8 · Das Ende der Kette

| Phase | Inhalt | Nachweis |
|---|---|---|
| M8.1 | **Einsatzende-Sweep**: `end_date < heute` → `completed`, plus Vorwarnung „endet in X Tagen" | Bewertung und Reputation werden **erstmals** erreichbar |
| M8.2 | **Verlängerung als Handlung** — Zustand und Etikett existieren bereits | Aus der Vorwarnung heraus verlängerbar |
| M8.3 | **Übernahme durch den Kunden** (`temp_to_perm`) samt Provision | Der profitabelste fehlende Ausgang |
| M8.4 | **`overdue` auf der operativen Rechnung** setzen | `overdue_count` kann erstmals ungleich null werden |
| M8.5 | **Storno-Entgelt** — Grund, Vorlauf und Wirkungsvorschau existieren, die Folge fehlt | Kurzfristabsage hat eine Folge |

---

### M9 · Recht und Haftung

| Phase | Inhalt | Nachweis |
|---|---|---|
| M9.1 | **Verleiherlaubnis als Voraussetzung.** `doc_type='aueg_erlaubnis'` existiert samt Ablaufzuständen und wird **nirgends gelesen** | Firma ohne gültige Erlaubnis kann nicht anbieten. **Rückmutation** |
| M9.2 | **Eine AÜG-Wahrheit.** Der schwächere Dienst verschwindet aus dem Buchungsweg; der Datenlage-Vorbehalt gilt überall | Kunde mit Tarifausnahme bekommt überall dieselbe Antwort |
| M9.3 | **Schreiber für `aueg_konfiguration`** — heute nur Lesezugriffe | Die Tarifausnahme ist über das Produkt setzbar |
| M9.4 | **AÜG-Benachrichtigungen** mit Entdopplung je (Kraft, Kunde, Stufe) | Die Frist meldet sich von selbst |
| M9.5 | **Stornierter Deal verbraucht keine Frist mehr** | Zuordnung eines stornierten Einsatzes zählt nicht |
| M9.6 | **Equal Pay nach neun Monaten** — Rechenwerk, Warnung vor der Buchung, Hinweis am Preis | Ein Einsatz, der die Grenze reißt → Warnung **vor** dem Klick |

---

### M10 · Staff-Eingriff und Dokumente

| Phase | Inhalt | Nachweis |
|---|---|---|
| M10.1 | **Ein konkretes Angebot, ein Deal, ein Bedarf sind im Staff CC auffindbar** | Suche nach echter ID führt zum Vorgang |
| M10.2 | **Rücknahme mit Grund**, Wirkungsvorschau vor der Handlung (M-L7) | „Betrifft 3 Zuordnungen und 1 Rechnung" — Vorschau = Wirkung |
| M10.3 | **Sperrlisten-Aufsicht im Staff CC** — heute wird der Dienst dort nie importiert | Staff sieht und klärt Sperren |
| M10.4 | **Jeder Eingriff auditiert, nie in eigener Sache** | Versuch in eigener Sache → 403. Rückmutation |
| M10.5 | **Der Mensch sieht die Dokumente seines Einsatzes im Portal** — heute kennt er nur seine eigenen Nachweise | Am gerenderten Portal |
| M10.6 | **Staff CC sieht alles, protokolliert jeden Blick** | Audit je Einsicht |
| M10.8 | **Jedes Dokument ist herunterladbar, an jeder Fläche** (Owner-Vorgabe 2026-09-06): Plattform, Staff CC **und Einsatzportal** — Vertrag, Einsatzvereinbarung, Stundenzettel, Rechnung. *„Sowie auch im Frontend"* | Je Beleg und je Fläche ein Klickpfad. **Ein Endpunkt, der die Datei liefert, aber keinen Knopf hat, zählt nicht** (M-L8) |
| M10.9 | **Und jeder Download bleibt mandantengebunden.** Dieselbe Datei, drei Flächen, drei verschiedene Berechtigte — der Mensch sieht seine, die Firma ihre, das Staff CC alles mit Protokoll | Fremder Einsatz → 403, nicht 200 mit leerer Datei. **Rückmutation je Fläche** |
| M10.7 | **Notdienst-Leitstand** (`H2`): sieben fertige, auditierte Endpunkte ohne jeden Aufrufer — darunter die **einzige** Möglichkeit, eine Teilzusage zurückzunehmen | **Größter Bestand pro Aufwand im ganzen Repo.** Der Notdienst ist zugleich die einzige Stelle, an der Teilzusagen und Überfüllungsschutz bereits richtig sind |

---

### M11 · Härtung *(begleitend, nicht am Ende)*

| Phase | Inhalt | Nachweis |
|---|---|---|
| M11.1 | **Endpunkt-Erreichbarkeits-Wächter** (`W1`): jede Route braucht einen Aufrufer oder einen Registereintrag mit Grund | Macht aus „vergessen" ein „bewusst entschieden" und zählt die Restschuld sichtbar |
| M11.2 | **Gate-Trennschärfe-Wächter** (`W4`): ein Feature-Schlüssel, der für **alle** Pläne wahr ist, darf keine Paywall auslösen — rot mit „dieses Gate kann nie greifen" | Deckt zusätzlich die Abweichung zwischen `visibilityMatrix` und Route auf |
| M11.3 | **Ein-Schreiber-Wächter** (`W5`) für Buchhaltungsspalten | Zweiter Schreiber → rot |
| M11.4 | **Tote-Spalte-Wächter** (`W6`) | `partial_fulfillment_allowed` wäre aufgefallen |
| M11.5 | **Konvention „BEFUND"** (`W7`): ein Test, der einen **Defekt** festschreibt, trägt es im Namen | Heute sind zwei kaputte Fehlerpfade per grünem Test zementiert |
| M11.6 | **Mutationswellen** in dieser Reihenfolge: `M1` Plan-Entitlement (die einzige real wirkende Paywall ist ein `<`) · `M2` Deal-Zustandsmaschine · `M3` Mengen-Mathematik · `M4` Fristen · `M5` Marktpräsenz-DSGVO | Schwelle 90 %, null Überlebende im Entscheidungs-Branch |
| M11.7 | **Index auf `worker_assignment_links(org_id)`** (Rang 10) | Lastprobe: 300 Kunden |
| M11.8 | **Frontend-Erreichbarkeit als Wächter** | Neue Seite ohne Klickpfad → rot |


---

### M4c · Der Markt wirkt voll — ohne einen Menschen doppelt zu verkaufen

> **Posten 5 der Reihenfolge**, zugeteilt am 2026-09-23. **Zuerst messen, dann bauen:** seit dem
> Nachziehen der 15 fehlenden Migrationen (204–218, am 2026-09-21) und seit N8.1b steht ein
> anderer Ist-Stand als bei der M0-Messung. Wer hier nach dem alten Befund baut, baut Vorhandenes
> nach.

**Was am 2026-09-23 bereits läuft, gemessen:**

| Baustein | Stand |
|---|---|
| `marktpraesenzService` | ✅ **materialisiert automatisch** je markt-präsenter Kraft mit Katalog-Skills die fehlenden **Einzelskill-Angebote** (`offer_kind 'single_skill'`, `quelle 'live_belegschaft'`) — als ganz normale Einträge, kein zweiter Marktplatz |
| Auslöser | ✅ `workers/staffingWorker.js:46` im Auftrag `staffing-maintenance`, Takt **15 Minuten** — der M0-Befund „niemand ruft es" ist seit M1 überholt |
| Doppel-Angebote | ✅ Dedup-Index (Mig 145) |
| Reservierung | ✅ `workerOfferReservationService` pausiert, solange die Kraft gebunden ist, und gibt frei, sobald sie es nicht mehr ist |
| Katalogpflicht | ✅ seit N8.1b: nur freigegebene Katalog-Fähigkeiten erzeugen Angebote |
| **Sammelangebote** | **offen** — `buildBundleOfferData`, `buildPoolSuggestion` und `createPoolOffer` existieren, aber der Takt erzeugt **nur** Einzelangebote. Bündel entstehen nur, wenn ein Mensch sie anlegt |

**Damit ist die Aufgabe eine andere als „Selbstbefüllung bauen".** Sie lautet: **die Lücke
zwischen automatischen Einzelangeboten und den Sammelangeboten schließen — und dabei den
Betrugsriegel halten.** Die Owner-Vorgabe dazu ist eindeutig: *„ein Mensch, fünfmal gebucht,
wäre Betrug."* Volumen entsteht durch **Darstellungen**, nie durch mehrfache Verfügbarkeit.

| Phase | Inhalt | Nachweis |
|---|---|---|
| M4c.0 | **Neu messen, bevor etwas gebaut wird:** wie viele Kräfte sind markt-präsent, wie viele Angebote je Art stehen im Feed, wie viele Kräfte sind unsichtbar — und an welcher der fünf Bedingungen aus M4.9 scheitern sie heute? Der alte Ausgangsbefund („30 von 33 unsichtbar") stammt von vor dem Migrations-Nachzug | Eine Tabelle mit Zahlen von heute. **Keine Phase unten wird gebaut, bevor diese Zahl steht** |
| M4c.1 | **Das Gesamtangebot je Kraft entsteht mit.** Owner: *„bei 10 Skills 10 Angebote plus eines für alle Skills"*. Der Takt erzeugt es wie die Einzelangebote — aus denselben freigegebenen Katalog-Fähigkeiten, über dieselbe Schiene | Kraft mit 4 Fähigkeiten → 4 Einzel + 1 Bündel. **Rückmutation:** Bündelerzeugung entfernen → rot |
| M4c.2 | **Das firmenübergreifende Sammelangebot** für die Nachfrage *„30 Pflegekräfte"*: viele Kräfte, ein Skill — und viele Kräfte, mehrere Skills. Es entsteht **aus der Nachfrage**, nicht auf Vorrat: sonst stehen Bündel im Markt, die niemand gesucht hat | Suche nach 30 Kräften bündelt über Firmen hinweg (N5-Korb); ohne Nachfrage entsteht kein Vorrats-Bündel |
| M4c.3 | **Ein Mensch, eine Bindung — über alle Darstellungen.** Wird eine Kraft gebucht, verschwinden **Einzel- und Bündelangebote** derselben Person gemeinsam. Die Reservierung kennt heute nur Einzelangebote | Kraft buchen → beide Arten weg. **Rückmutation:** Bündel von der Pausierung ausnehmen → rot. **Das ist die wichtigste Probe dieser Welle** |
| M4c.4 | **Die Zahl im Markt zählt Menschen, nicht Angebote.** „128 verfügbare Kräfte" darf nicht entstehen, weil 32 Menschen je vier Fähigkeiten tragen | Zählung gegen `COUNT(DISTINCT worker_profile_id)` gepinnt. **Rückmutation:** auf Angebote zählen → rot |
| M4c.5 | **Die fünf Bedingungen aus M4.9 schließen**, soweit M4c.0 sie noch offen zeigt: zwei sind Feld-Material (Pflicht), drei sind Zustände (lesbarer Grund). **Niemand fällt wortlos aus dem Markt** | Je Grund ein Satz, den der Mensch versteht; kein stilles Fehlen |
| M4c.6 | **Das Staff CC sieht, warum jemand nicht im Markt steht** — dieselbe Antwort, die schon die katalogfremden Rollen und die Vorschläge trägt (b-6, b-7). Drei Zahlen, eine Fläche | Eine unsichtbare Kraft ist in unter einer Minute erklärt |
| M4c.7 | **Verdrahtung nach der Prüfliste** aus `V_SCHNITTSTELLEN.md`, Abschnitt 3c — besonders Glied 6 (Klickpfad) und Glied 9 (Eingriff im Staff CC) | Kein Endpunkt ohne Aufrufer, keine Fläche ohne Weg |
| M4c.8 | **Der Entwurfs-Riegel** *(gefunden 2026-09-24 bei M4c.0, nachgemessen von der planenden Sitzung)*. `MATERIALISIEREN_SQL` schließt über `NOT EXISTS … cp.status IN ('draft','active','paused')` (`marktpraesenzService.js:264`) auch **Entwürfe** aus — richtig, damit nichts doppelt entsteht. **Die Wirkung ist trotzdem ein Loch:** ein Entwurf ist im Markt unsichtbar, besetzt aber den Platz, den die Automatik füllen würde. Der Mensch ist dann **weder im Markt noch materialisierbar**, unbegrenzt, und kein Ereignis löst das auf. Betroffen: **2 von 2** markt-fähigen Menschen — der Normalfall dieser Datenbank, keine Randlage. **Entscheidung: der Riegel bleibt** (Doppelangebote wären schlimmer), **aber er wird sichtbar und endlich** | Der Zustand hat einen Namen und eine Frist: nach Ablauf meldet der Takt ihn, statt ihn auszusitzen |
| M4c.9 | **Der Bericht hört auf, das Gegenteil zu behaupten.** `offeneGruende()` überspringt genau diese Menschen mit `if (!gruende.length) continue;` — kommentiert mit „steht im Markt — keine Zeile nötig" (`:221`). Keine der sechs Bedingungen kennt den Riegel. **Der Entwurf wird die siebte Bedingung**, mit lesbarem Grund: „6 Entwürfe blockieren 6 Angebote" | Mensch mit Entwürfen erscheint im Bericht **mit** Grund. **Rückmutation:** die siebte Bedingung entfernen → rot. Eine Aufsicht, die Unsichtbares als sichtbar meldet, ist schlimmer als gar keine |
| M4c.12 | **Die Meldung, die zum Freigeben auffordert, entsteht nie** *(gefunden 2026-09-25 von der bauenden Sitzung, nachgemessen von der planenden)*. `worker.skills_awaiting_release` bildet auf den Datenbank-Typ `worker_marktpraesenz` ab — und **genau dieser eine von 54** Typen fehlt in der Positivliste der Tabelle. Die Einfügung scheitert mit `23514`, der Aufrufer schluckt den Fehler **bewusst und zu Recht** (`workerPortal.js:607` — die Fähigkeiten sind gespeichert, eine gescheiterte Meldung darf das nicht gefährden) und protokolliert ihn. **Folge:** der Arbeiter trägt Fähigkeiten ein, die Zeitarbeitsfirma erfährt es nie, niemand gibt frei. Das ist eine plausible Mitursache dafür, dass **3 von 33** Kräften freigegebene Fähigkeiten haben — und damit dafür, dass der Marktplatz leer wirkt | Migration ergänzt den Typ (mit Rücknahme-Anweisung); danach entsteht die Meldung wirklich |
| M4c.13 | **Entdeckender Wächter statt Einzelkorrektur:** jeder `type` aus `notificationMatrix.js` muss in der Positivliste der Tabelle stehen. Beides ist statisch lesbar — die Liste steht in den Migrationen —, **es braucht keine Datenbank** | Neuer Matrix-Eintrag ohne Migration → rot. **Rückmutation.** Ohne diesen Wächter stirbt die nächste Meldung denselben stillen Tod |
| M4c.14 | **Ein geschluckter Fehler wird gezählt** *(Entwurf entschieden 2026-09-27)*. Gefangen wird **in `dispatch` selbst**, nicht am Aufrufer, und sichtbar als Audit-Zeile `notification.dispatch_failed` — **keine neue Tabelle**. Begründung: eine Stelle statt einer Sorgfalt, die man vergessen kann (dasselbe Argument, mit dem `dispatch` schon den SSE-Push an sich gezogen hat); Audit ist ohnehin pflichtig und wird gelesen, das Staff CC hängt bereits daran; eine Tabelle zöge Migration plus fünf Register-Einträge nach sich für etwas, das nach M4c.13 hoffentlich nie feuert | **Zwei Zusätze der planenden Sitzung:** (1) die Zeile trägt **Ereignis, Typ und Fehlercode**, nicht nur „fehlgeschlagen" — sonst steht dort, dass etwas kaputt war, aber nicht was. (2) **Zusammenfassen statt fluten:** ein systematisch abgewiesener Typ schreibt sonst je Empfänger und je Speichern eine Zeile. Ein Audit, in dem das Wichtige untergeht, ist derselbe Fehler eine Ebene höher — deshalb je Ereignis und Stunde **eine** Zeile mit Zähler |
| M4c.15 | **M4c.1 ist im Tor unbewiesen.** Die neun Ablaufproben laufen nur im Container gegen die echte Datenbank; auf dem Rechner liefert die Datei `tests 0` — nicht einmal einen Übersprung. **Gemessen 2026-09-26 von der planenden Sitzung:** zwei Rückmutationen (`BUENDEL_MINDESTZAHL` von 2 auf 1, Rücknahme-Anweisung stillgelegt) blieben grün, weil die belegenden Proben im Tor gar nicht existieren | Je Kernzusage **zusätzlich** eine Probe ohne Datenbank: Form der drei Anweisungen und Bindung der Parameter. Danach: dieselben zwei Rückmutationen → rot, auch ohne Container |

> **Korrektur an M4c.3 (2026-09-24, gemessen von der bauenden Sitzung, nachgeprüft von der
> planenden).** Mein Satz „die Reservierung kennt heute nur Einzelangebote" war **falsch**.
> Im committeten Stand deckt `workerOfferReservationService` bereits
> `offer_kind IN ('single_skill', 'bundle')` ab — die dort vorgeschlagene Rückmutation wäre
> von Anfang an grün durchgelaufen.
>
> **Die Lücke liegt eine Ebene weiter: bei den Sammelangeboten (`pool_*`).** Der Sweep greift
> über `cp.worker_profile_id IS NOT NULL` — und genau diese Spalte hat ein Sammelangebot nicht.
> `capacity_post_pool_members` (Mig 146) wurde ausdrücklich „für die spätere Reservierung"
> angelegt und ist seither **geschrieben, aber nie gelesen** worden: ein Schreiber, null Leser.
>
> **Live gemessen:** ein Mensch stand gleichzeitig in einem aktiven Sammelangebot **und** einem
> aktiven Einzelangebot — zweimal buchbar. Zwei Sammelangebote warben mit je zwei Köpfen und
> teilten sich **dieselben zwei Menschen**.
>
> Wieder das Muster, das diese Welle prägt: **beide Seiten sehen für sich richtig aus.** Der
> Sweep schützt personengebundene Angebote. Sammelangebote soll er nicht sperren, weil ein
> belegter Mensch dort nur die Anzahl senken soll. Nur wurde das Senken nie gebaut — und es
> entsteht kein Fehler, an dem es auffiele.

> **M4c.3 erfüllte seine Abnahme nicht — obwohl alle Proben grün waren (2026-09-25).**
> Der adversariale Durchlauf der bauenden Sitzung hat zwei Befunde geliefert, beide von der
> planenden Sitzung im Code nachgeprüft:
>
> **1. Der Takt rief die Reservierung nie.** `staffingWorker.js` rief `runStaffingMaintenance`
> und `sweepMarktpraesenz` — `sweepReservations` hatte genau einen Aufrufer, den internen
> Endpunkt, und den stößt niemand an. Beim Umzug in den Takt (M1.2) sind **zwei von vier
> Schritten** mitgenommen worden. **Welle 4b und M4c.3 liefen seit ihrem Bau nicht.** Beleg aus
> der Datenbank: eine Kraft mit aktiver, unbefristeter Einsatz-Verknüpfung seit dem 2026-07-29
> stand mit sechs Automatik-Angeboten **12 Tage aktiv und buchbar**, bis erst eine Abwesenheit
> sie archivierte.
>
> **2. Eine Buchung bindet niemanden.** „Gebunden" heißt im ganzen System nur: aktive
> `worker_assignment_links`-Zeile. `accept-deal` legt keine an und ruft `syncWorkerReservation`
> nicht — nachgemessen: der Name kommt in `routes/marketplace.js` **nicht vor**. Bis jemand von
> Hand zuweist, ist derselbe Mensch über **jede** andere Darstellung buchbar. Und der Takt legt
> für die gebuchte Fähigkeit einen Zwilling an, weil `reserved` für sein `NOT EXISTS` kein
> belegter Platz ist — eine spätere Stornierung kollidiert dann mit dem Zwilling.
>
> **Die Lehre wiegt schwerer als beide Befunde:** die Proben prüften die *Einsatz-Verknüpfung*,
> nicht die *Buchung*. Sie prüften damit **ihren eigenen Begriff von „gebunden" statt den des
> Owners** — und waren grün, während die Zusage „ein Mensch, fünfmal gebucht, wäre Betrug"
> nicht galt.

| Phase | Inhalt | Nachweis |
|---|---|---|
| M4c.3b-1 | **Eine Definition von „gebunden"** (`bindungSql.js`, gebaut wie `zusageFormel.js`): laufender Einsatz **oder** angenommene Buchung auf einer personengebundenen Zeile vor dem Einsatz. `activated` bindet dort **nicht** — ab dann bindet der Einsatz mit Datum, sonst bliebe ein Mensch nach einem unbefristeten Deal für immer unsichtbar | Eingesetzt an **allen drei** Stellen, die heute je eine eigene Abschrift tragen: Reservierung personengebunden, Reservierung Sammelangebot, Kopfzahl im Feed |
| M4c.3b-2 | **Der Takt ruft die Reservierung** — über **eine** Funktion, die Takt und Endpunkt teilen | Takt und Endpunkt können nicht mehr auseinanderlaufen. **Rückmutation:** Schritt aus der Kette nehmen → rot |
| M4c.3b-3 | **`accept-deal` synchronisiert die Reservierung in derselben Transaktion** | Buchen → die übrigen Darstellungen desselben Menschen verschwinden **sofort**, nicht erst nach einer Handzuweisung |
| M4c.3b-4 | **`reserved` zählt als belegter Platz**, der Takt legt für einen gebundenen Menschen nichts an | Kein Zwilling nach der Buchung; eine Stornierung läuft ohne Kollision zurück |
| M4c.3b-5 | **Die Abnahme prüft den Begriff des Owners**, nicht den der Umsetzung: eine **Buchung** (nicht eine Verknüpfung) lässt Einzel-, Bündel- und Sammelangebot desselben Menschen verschwinden | Genau dieser Weg als Probe. **Ohne sie wäre M4c.3 wieder grün und trotzdem unwahr** |

### Stand am 2026-09-27 — beide Sitzungen am Nutzungslimit

**M4c.8 ist bestätigt.** Die bauende Sitzung hatte es als *unbestätigt* übergeben, weil die
Rückmutationen fehlten. Nachgeholt von der planenden Sitzung, beide rot:
Frist `7 → 999` Tage (nichts wird je überfällig) → 2 Proben rot; `nurDiagnose` entfernt
(der Riegel würde Menschen ganz aus dem Markt nehmen) → 2 Proben rot.

**M4c.2 ist blockiert und braucht eine Entscheidung, keine Umgehung.** Seine Abnahme verweist
auf den **N5-Korb**, und N5 ist nicht gebaut. Den Sammler ohne seinen Verbraucher zu bauen wäre
ein Endpunkt ohne Aufrufer. Zwei Wege: **N5 zuerst bauen**, oder **M4c.2 auf das umformulieren,
was ohne Korb belegbar ist** (die Bündelung entsteht, die Buchung bleibt offen). Die planende
Sitzung empfiehlt **N5 zuerst** — der Korb ist Teil der Owner-Kette „30 Kräfte in einem
Abschluss" und trägt M4c.2 als Verbraucher gleich mit.

**Frei und ungeblockt:** M4c.5 (zur Hälfte durch M4c.8/9 erledigt), M4c.6, M4c.7.

**Live gemessen nach dem Bau:** 8 überfällige Entwürfe, 2 betroffene Menschen — bei genau
2 markt-fähigen Menschen. Der Entwurfs-Riegel ist kein theoretischer Fall.

#### Nachgeholte Gegenprüfung (planende Sitzung, 2026-09-27)

**M4c.14 ist bestätigt.** Drei eigene Rückmutationen, alle rot: Zähler `failed++` entfernt
(8 Proben rot), `continue` → `break` (3 rot), Audit-Zeile umbenannt (1 rot). Damit sind Zählung,
Fortsetzung **und** Sichtbarkeit einzeln belegt — genau die drei, die zusammen nur scheinbar
geprüft waren.

**M4c.8/M4c.9 vollständig bestätigt.** Zusätzlich zu Frist und `nurDiagnose`: die **Zahl** im
Grund entfernt → rot; das Maß `entwuerfe_ueberfaellig` auf 0 festgenagelt → rot.

**Die datenbankgebundenen Proben laufen auch ohne Container:** die Datenbank liegt auf
`127.0.0.1:5432`. Mit `DATABASE_URL` aus der `.env` laufen sie direkt vom Rechner — der Umweg
über ein Verzeichnis im Container ist nicht nötig.

**Die vier lange roten Ablaufproben, neu gemessen:**

| Probe | Stand | |
|---|---|---|
| `g4bKundenMeldung` | **8/8 grün** | **geheilt durch Migration 221** — es war der abgewiesene Benachrichtigungstyp |
| `kollegenZugriff` | 6/7, einer rot | **Gemessen 2026-09-27, und es ist ein Prüfaufbau-Fehler, kein Produktfehler.** Der Fall scheitert nicht an einer Berechtigung — die Kollegin *darf* —, sondern an `OVERFILL_NOT_ALLOWED`. Ursache: die Prüfdaten legen einen Bedarf mit `headcount = 2` an, **ohne `required_total_count`**; damit rechnet `remaining_open_count` auf 0, und ein Angebot über 2 gilt als Überfüllung. **In der Wirklichkeit tritt das nicht auf: 0 von 41 echten Bedarfen fehlt das Feld.** Die Prüfdaten müssen es setzen wie die Anwendung; die Zusicherung bleibt unangetastet — dieselbe Form wie bei `freieKopfzahl` |
| `offer.counterpartyFirst` | 1/1 rot | ungemessen |
| `workerOpenDealAssignments` | 1/1 rot | ungemessen |

**M4c.2 — die Entscheidung, präzise.** Die Abnahme nennt den „N5-Korb", und dabei sind zwei
Dinge verwechselt: **N5** ist die *Bestätigung mit Wirkung*, der **Korb** ist **M5.5**. Gemessen:
**beide sind nicht gebaut**, und im Code gibt es keinen Korb (kein Treffer für `korb`, `basket`,
`poolSuggestion` in Diensten und Routen).

> **Entschieden: erst der Verbraucher, dann der Sammler — M5.5 und N5 vor M4c.2.**
> M4c.2 erzeugt ein firmenübergreifendes Bündel. Ohne Korb sieht es niemand, ohne Bestätigung
> bucht es niemand: ein Endpunkt ohne Aufrufer, genau das, was `P_ALTLASTEN` Klasse B nennt.
> Die Abnahme von M4c.2 wird auf **M5.5** umgeschrieben, sobald der Korb steht.

**Reihenfolge für die bauende Sitzung, sobald ihr Kontingent zurück ist:**
1. ~~`kollegenZugriff` messen~~ ✅ **gemessen 2026-09-27: Prüfaufbau.** Bleibt als kleine Korrektur der Prüfdaten (`required_total_count` setzen), nicht als Produktarbeit
2. `offer.counterpartyFirst` und `workerOpenDealAssignments` messen
3. M4c.5 · M4c.6 · M4c.7 (frei, M4c.5 zur Hälfte erledigt)
4. M5.5 + N5, danach M4c.2

**Reihenfolge: M4c.0 → M4c.3 → M4c.1 → M4c.4 → M4c.2 → M4c.5 → M4c.6 → M4c.7.**

> **M4c.3 steht vor der Erzeugung, nicht danach.** Wer zuerst Bündel erzeugt und die
> Pausierung nachzieht, hat in der Zwischenzeit einen Markt, in dem dieselbe Person mehrfach
> buchbar ist. Das ist genau der Zustand, den der Owner Betrug nennt — und er entsteht
> unbemerkt, weil jede einzelne Buchung für sich gültig aussieht.

**Woran gegengeprüft wird**

| # | Frage |
|---|---|
| 1 | Kann dieselbe Person nach dem Bau über zwei Darstellungen gleichzeitig gebucht werden? |
| 2 | Zählt die Marktzahl Menschen oder Angebote? |
| 3 | Entstehen Vorrats-Bündel, die niemand gesucht hat? |
| 4 | Steht die Messung aus M4c.0 im Plan — mit Zahlen von heute, nicht von vor dem Migrations-Nachzug? |
| 5 | Fällt noch jemand wortlos aus dem Markt? |

**Was M4c nicht tut**

- **Einen zweiten Marktplatz bauen.** Alles läuft über `capacity_posts` und den vorhandenen Feed.
- **Verfügbarkeit vervielfachen.** Mehr Darstellungen, nie mehr Menschen.
- **Angebote ohne Katalogbezug erzeugen.** Seit N8.1b ist das ausgeschlossen; M4c hält es.
- **Die Reservierungslogik neu schreiben.** Sie wird auf Bündel ausgedehnt, nicht ersetzt.

### M4c.0 · Die bindende Messung (2026-09-24, Entwicklungsdatenbank, nur lesend)

Die Zahl steht. Sie widerlegt zwei Annahmen des Plans und legt einen Riegel frei, den
niemand gesucht hat.

**Die fünf Bedingungen aus M4.9, über alle 33 Profile:**

| Bedingung | erfüllt |
|---|---|
| Profil aktiv | 33 von 33 |
| Marktpräsenz eingeschaltet | 33 von 33 |
| Wohnort hinterlegt | 33 von 33 |
| heute nicht abwesend | 32 von 33 |
| Organisation hat einen Agentur-Nutzer | 33 von 33 |
| **freigegebene Katalog-Fähigkeit** | **3 von 33** |
| **alle fünf zugleich** | **2 von 33** |

**Erste fehlende Bedingung je Mensch:** 30 × „ohne Fähigkeit", 3 × „sichtbar", sonst nichts.
Der fehlende Wohnort ist heute **kein** Blocker — der Hinweistext in `PRAESENZ_BEDINGUNGEN`
nennt ihn „die häufigste stille Ursache", und das trifft auf diese Datenbank nicht zu. Auch
der fehlende Agentur-Nutzer erklärt nichts: **0 von 33** Kräften fehlt er.

**Angebote im Feed je Art, Herkunft und Zustand:**

| Art | Herkunft | Zustand | Anzahl |
|---|---|---|---|
| `single_skill` | `live_belegschaft` | archiviert | 12 |
| `legacy` | manuell | besetzt | 6 |
| `single_skill` | manuell | **Entwurf** | **6** |
| `legacy` | manuell | reserviert | 5 |
| `legacy` | manuell | abgelaufen | 5 |
| `legacy` | manuell | aktiv | 4 |
| `bundle` | manuell | Entwurf | 2 |
| `pool_multi_skill` | manuell | aktiv | 1 |
| `single_skill` | manuell | aktiv | 1 |
| `legacy` / `pool_single_skill` / `legacy` | manuell | Entwurf / Entwurf / pausiert | je 1 |

**Die Antwort auf die Frage nach der Automatik: keines der 6 aktiven Angebote stammt aus
`live_belegschaft`.** Die Automatik hat 12 Einträge erzeugt — alle für **einen** Menschen
(16 Fähigkeiten, 6 Rollen doppelt, angelegt am 2026-08-26), und alle archiviert, weil genau
diese Person heute abwesend ist. Das ist **richtiges** Verhalten, kein Defekt: die Automatik
arbeitet, sie hat nur niemanden, für den sie arbeiten könnte.

**M4c.4 ist deutlicher bestätigt als das Beispiel im Plan:** hinter den **6 aktiven Angeboten
steht genau 1 Mensch**. Nicht 128 aus 32 — sondern 6 aus 1.

#### Der Befund, den die Messung freigelegt hat: der Entwurfs-Riegel

Die zwei Menschen, die alle fünf Bedingungen erfüllen, tragen zusammen **7 freigegebene
Katalog-Fähigkeiten** — und zu **jeder einzelnen** existiert bereits ein manueller
`single_skill`-Eintrag vom 2026-07-20/21. Davon ist **einer aktiv, sechs sind Entwürfe**.

`MATERIALISIEREN_SQL` schließt in seinem `NOT EXISTS` die Zustände
`('draft', 'active', 'paused')` aus. Gemessen: der Takt legt heute **0** Einträge an. Das ist
so gewollt — er soll nichts doppeln.

Die Wirkung ist trotzdem ein Loch:

- Ein **Entwurf ist im Markt unsichtbar** — aber er besetzt den Platz, den die Automatik
  füllen würde.
- Damit ist ein Mensch **weder im Markt noch materialisierbar**, auf unbegrenzte Zeit. Es
  gibt kein Ereignis, das diesen Zustand von selbst auflöst.
- Und `offeneGruende()` überspringt ihn mit `if (!gruende.length) continue`, kommentiert mit
  *„steht im Markt — keine Zeile nötig"*. Der Bericht **behauptet das Gegenteil dessen, was
  gilt**. Keine der sechs Bedingungen kennt den Entwurfs-Riegel.
- Betroffen sind **zwei von zwei** markt-fähigen Menschen. Das ist keine Randlage, das ist
  der Normalfall dieser Datenbank.

**Folge für die Reihenfolge:** der Riegel gehört in **M4c.5** („niemand fällt wortlos aus dem
Markt") und ist dort die erste Bedingung, die zu ergänzen ist — als siebte Zeile in
`PRAESENZ_BEDINGUNGEN`, mit `wer: "firma"`: beheben kann es nur, wer den Entwurf
veröffentlicht oder verwirft. Die Reihenfolge **M4c.0 → M4c.3 → M4c.1 → M4c.4 → M4c.2 →
M4c.5 → M4c.6 → M4c.7** bleibt unberührt.

**Was der bisherige Befund richtig hatte:** „30 von 33 unsichtbar" gilt weiter, und die
Ursache ist die fehlende Fähigkeit, nicht der Veröffentlichungsweg. Damit wirkt **M4.9
(Pflichtfeld) vor M4.8 (Anstoß)**: ein Anstoß, der zum Veröffentlichen auffordert, läuft ins
Leere, solange nichts da ist, das veröffentlicht werden könnte.

### Nachtrag zu b-7 aus der Gegenprüfung (2026-09-23)

| Phase | Inhalt | Nachweis |
|---|---|---|
| b-7.1 | **Der Alias-Schreibvorgang ist nicht festgenagelt.** Gemessen per Rückmutation: den `SET aliases = …`-Vorgang in `skillCatalogService` unwirksam gemacht → **alle Proben bleiben grün**. Genau dieser Vorgang macht aus der Zuordnung eine Dauerregel (beim nächsten Mal trifft `proposeSkill` sofort über den Alias). Fällt er bei einem Umbau weg, merkt es niemand — die Kuratierung hört einfach auf, sich zu lohnen | **Form-Probe je Bestandteil** des Schreibvorgangs (`SET aliases`, `unnest`, die Doppelten-Bedingung) plus Bindungsprobe der Parameter — dieselbe Antwort wie bei `merged_von`, nur auf der Schreibseite |

---

## 7. Reihenfolge

```
M0  Bestandsprüfung           ← zuerst, immer, ohne Ausnahme
 │
 ├── M1  Stille Ausfälle      ← ohne Takt und Mail ist alles andere Theater
 ├── M2  Trennwand            ← Sicherheit vor Funktion
 ├── M3  Kettenanfang
 ├── M4  Der Markt entsteht   ← M4.7 (Trichter) priorisiert alles Weitere
 ├── M5  Der Korb             ← M5.1 ist Vorbedingung; Formweg schaltbar (M-E1)
 ├── M6  Der Assistent        ← billig, sofort sichtbar
 ├── M7  Der Durchstich
 ├── M8  Das Ende der Kette   ← macht Bewertung und Reputation erstmals erreichbar
 ├── M9  Recht und Haftung    ← M9.1 kann vorgezogen werden, wenn Pilotkunden starten
 └── M10 Staff und Dokumente
     M11 Härtung — begleitend, je Phase
```

**Empfohlen: M0 → M1 → M2 → M3 → M4 → M5 → M6 → M7 → M8 → M9 → M10.**

M11 steht bewusst nicht am Ende: ein Wächter, der erst nach dem Bau entsteht, prüft den
Bau, der ihn erzeugt hat. Er gehört in dieselbe Phase wie die Regel, die er schützt.

---

## 8. Owner-Entscheidungen — **alle neun beantwortet (2026-09-01)**

| Nr. | Frage | Entscheid |
|---|---|---|
| **M-E1** ✅ entschieden | Genügt Textform für den Überlassungsvertrag? | **Schaltbar bauen.** Textform als Vorgabe, Schriftform als umlegbarer Formweg — dokumentiert als Erweiterungsfeld. *Owner ausdrücklich: „das weiß ich nicht, ob es rechtlich reicht — für mich ist das ok so."* Siehe 8.1 |
| **M-E2** ✅ entschieden | Welcher Schlüssel schützt die Marktplatz-Erstellung? | **Erst sehen, dann zahlen.** Browsen frei (Konto + Anmeldung genügt), Erstellen bezahlt — je Seite ein eigener Schlüssel. Dazu ein **öffentlicher Schaufenster-Stand ohne Personenprofile**, siehe 8.2 |
| **M-E3** ✅ entschieden | PRO-Angebotslimit: 50 oder unbegrenzt? | **Unbegrenzt**, wie verkauft. Der zweite, widersprechende Wert wird **entfernt**, nicht angeglichen |
| **M-E4** ✅ entschieden | Darf die Wohnort-PLZ öffentlich stehen? | **Nein — Einsatzradius statt Ort.** Wählbar 10 / 50 / 100 km. Die Kraft erscheint dadurch **als Radius-Fundstelle in jeder Suche, die ihr Gebiet trifft**, nicht nur bei ihrem Ort. Siehe 8.3 |
| **M-E5** ✅ entschieden | Eigene Tarife je Org-Typ? | **Struktur jetzt, Werte später.** Die `org_type`-Dimension wird angelegt, mit sinnvollen Vorgabewerten, die der Owner später anpasst |
| **M-E11** ✅ entschieden | Wer legt den Einsatzradius fest? | **Die Zeitarbeitsfirma — nicht der Mensch.** Owner 2026-09-05: *„viele Zeitarbeitsfirmen haben Einsatzfahrzeuge, also einen Fahrdienst."* Der Radius ist damit eine **Fähigkeit der Firma**, keine Eigenschaft der Person. Ein Mensch ohne Auto in einem Dorf ist mit Fahrdienst 60 km weit einsetzbar — und nur die Firma weiß das. **Folge für M-E4:** der Radius des Menschen ist **nicht** Pflicht, solange die Firma einen gesetzt hat. Gemessen: `org_settings.default_radius_km` existiert bereits (Vorgabe 25) und wird von **niemandem** gelesen — aber seine Nachbarfelder sind kundenseitig, also **vor der Wiederverwendung die Bedeutung prüfen** |
| **M-E6** ✅ entschieden | Löst der Abschluss die Zuordnung automatisch aus? | **Automatisch, wenn eindeutig — sonst Aufgabe mit Frist.** Genau eine passende freie Kraft → zugeordnet; mehrere → Aufgabe, keine Willkür durch das System |
| **M-E7** ✅ entschieden | Wer schließt einen Einsatz ab? | **Beide Seiten, beidseitig und gegenseitenorientiert.** Unternehmen UND Zeitarbeitsfirma können abschließen; die Handlung richtet sich an die Gegenseite und wird ihr sichtbar. Siehe 8.4 |
| **M-E8** ✅ entschieden | Soll der Takt eingerichtet werden? | **Ja.** Herzschlag (M1.1) und Takt (M1.2) werden gebaut. Damit fallen in einem Schritt: Marktbefüllung, Fälligkeitsmarkierung, automatisches Nachrücken, Verfall von Einladungen |
| **M-E9** ✅ entschieden | Eigene Sitzungswelt fürs Einsatzportal? | **Ja**, nach dem `/staff`-Muster (eigenes Cookie, eigener Store, eigener Pfad). Die Vorlage ist geprüft vorhanden — kein Neubau. Siehe 8.5 |

### 8.1 M-E1 — was „schaltbar" konkret heißt, und was offen bleibt

**Gebaut wird:** ein Formweg-Schalter je Vertragsart (`textform` | `schriftform`), Vorgabe
`textform`. Bei `schriftform` wird aus dem Sofort-Abschluss eine Anfrage mit Signaturlauf
auf Mig 084 (`deal_documents_and_signatures`). Der Schalter ist **kein Feature-Flag zum
Ausprobieren**, sondern die Stelle, an der eine Rechtsauskunft ohne Umbau landet.

**Was ausdrücklich offen bleibt** — der Owner hat es benannt und die Lage angenommen:
ob Textform genügt, ist **nicht anwaltlich bestätigt**. Das ist kein Bauhindernis, aber
es ist ein Punkt mit einem **Auslöser**, nicht mit einem Datum:

> **Vor dem ersten Abschluss zwischen zwei echten Kunden gehört die Auskunft eingeholt.**
> Solange nur Pilotkunden und Vorführdaten laufen, trägt der Schalter. Ab dem ersten
> echten Überlassungsvertrag hängt an der Antwort, ob der Vertrag wirksam ist.

Der Schalter macht die Korrektur billig: eine Konfigurationszeile statt eines Umbaus.
**Er macht die Frage nicht kleiner.**

### 8.2 M-E2 — „Konto und Login zum Schnuppern reicht" (Owner-Rückfrage, beantwortet)

**Ja — für die Profile. Und darunter noch eine Stufe, die mehr bringt.**

Warum Konto und Anmeldung die richtige Grenze für den Feed sind: was dort steht, sind
**echte Menschen**, abgeleitet aus dem Live-Bestand. Ein Marktplatz mit Personenprofilen
ohne jede Anmeldung wäre (a) datenschutzrechtlich kaum haltbar, (b) von Suchmaschinen
indexierbar und (c) für jeden Wettbewerber ein kostenloser Marktüberblick über deine
Lieferanten.

Aber die Anmeldung ist eine Hürde, und dein Trichter beginnt davor. Deshalb **drei
Stufen** statt zwei:

| Stufe | Wer | Was er sieht |
|---|---|---|
| **Öffentlich, ohne Konto** | jeder, auch Suchmaschinen | **Zahlen und Kategorien, keine Personen.** „1.240 verfügbare Kräfte in 38 Berufsgruppen · 87 im Raum Münster · Ø Reaktionszeit 4 h". Indexierbar, wirbt für sich selbst, gibt niemanden preis |
| **Konto + Anmeldung** *(deine Entscheidung)* | registriert, DEMO genügt | **Der volle Feed** mit anonymen Profilen, Merkmalen und Verfügbarkeit. Sehen, prüfen, vergleichen |
| **Bezahlt** | ab dem gewählten Plan | **Handeln:** Bedarf anlegen, Angebot abgeben, buchen |

Die Grundlage der ersten Stufe existiert bereits (`GET /marketplace/public/capacity-posts`
entfernt Kontaktdaten ausdrücklich) — sie muss nur aggregieren statt aufzulisten.

**Damit ist die Paywall zum ersten Mal echt:** heute steht auf rund 20 Seiten ein
Schlüssel, der für jeden Plan wahr ist, und der fertig gebaute Paywall-Block kann **nie**
erscheinen.

### 8.3 M-E4 — der Radius, und warum er datensparsam **und** besser ist

**Modell:** Nicht der Wohnort wird veröffentlicht, sondern ein **Einsatzradius**:
10 / 50 / 100 km um einen Anker.

| | Heute | Nach M-E4 |
|---|---|---|
| Was gespeichert wird | Wohnort-PLZ | Anker + gewählter Radius |
| Was **ausgeliefert** wird | dieselbe exakte PLZ | **Radius plus grobe Raumangabe** („Einsatzradius 50 km · Raum Münster") — nie der Anker |
| Wie gesucht wird | Treffer bei Ortsgleichheit | **Abstandsrechnung serverseitig** gegen den Anker, der den Betrachter nie erreicht |
| Reichweite der Kraft | erscheint bei ihrem Ort | **erscheint in jeder Suche, deren Einsatzort im Radius liegt** |

Das ist der Punkt, den der Owner betont hat: *„sodass er auch in weiteren Suchen
erscheint als Radius-Fundstelle, nicht nur Ort."* Die datensparsame Lösung ist hier
zugleich die **reichweitenstärkere** — eine Kraft mit 100-km-Radius wird für zehnmal so
viele Bedarfe gefunden wie eine, die nur an ihrem Ort steht.

**Vorgabe:** 50 km, wenn niemand etwas wählt. Die Kraft selbst kann den Radius im Portal
ändern — das ist zugleich der **Widerspruchshebel** aus M4.3: Radius auf null heißt
„nicht im Markt".

---


### 8.4 M-E7 — was „beidseitig und gegenseitenorientiert“ konkret heißt

**Owner am 2026-09-01:** *„ja kunde als unternehmen und zeitarbeitsfirma schliessen
deals ab. beidseitig und gegenseitenorientiert.“*

Damit ist die größte Lücke des Plans (Abschnitt 5, Rang 1) baubar. Was gilt:

- **Beide Seiten dürfen abschließen.** Kein Vorrecht einer Partei, keine Freigabe
  durch die andere.
- **Die Handlung ist gegenseitenorientiert:** sie richtet sich an die Gegenseite und
  wird ihr sichtbar. Der Abschluss ist keine stille Buchung, sondern eine Mitteilung
  mit Folge.
- **Technisch fehlt danach nur noch ein Aufrufer.** `POST /assignments/:id/complete`
  existiert samt Org-Grenze, Zustandsautomat, Audit und Reputationsnachlauf
  (`routes/assignments.js:147`, `assignmentService.js:246`). Die Oberfläche nennt den
  Schritt sogar schon beim Namen — `dealProgressHelper.js:44` führt
  `ASSIGNMENT_STARTED → „Einsatz abschließen“` als nächste Handlung, gerendert als
  **reiner Text ohne Bedienelement**. Es fehlt ein Knopf, kein Vorgang.
- **Was daran hängt:** Bewertung (`WHERE a.status='completed'`),
  Lieferantenreputation, und die AÜG-Rechnung, die heute Zeiten weiterzählt, die
  längst vorbei sind.

> **Eine Kante bleibt und wird beim Bau von M8 entschieden, nicht jetzt:** was gilt,
> wenn die Gegenseite widerspricht („so war das nicht“). Das Muster dafür existiert
> bereits im Stundenzettel-Weg (bestätigen / ablehnen / Korrekturzustand) und wird von
> dort übernommen, statt neu erfunden zu werden.

### 8.5 M-E9 — die zweite Sitzungswelt ist eine Wiederholung, kein Neubau

**Owner am 2026-09-01: ja.** Das Einsatzportal bekommt eigenes Cookie, eigenen Store
und eigenen Pfad — so wie `/staff` es seit Langem hat.

Warum das kein Umbau ins Ungewisse ist: die Vorlage steht geprüft im Baum.
`api/app.js:255` trägt die Begründung im Kommentar, und `staffSessionSecret` ist als
**HMAC-Ableitung** gebaut, nicht als zusammengeklebte Zeichenkette. Wer M-E9 baut,
wendet dasselbe Muster ein zweites Mal an.

**Was die Messung dazu ergab:** heute teilen Portal und Plattform Cookie (`tc.sid`),
Store und `users`-Tabelle; getrennt sind sie allein durch `users.role`. Genau deshalb
wiegt der Befund aus Zeile 7b so schwer — ein überschriebenes Passwort trifft dann
beide Welten auf einmal.

> **Die Migrationsfrage gehört zur Phase, nicht hierher:** bestehende
> Arbeiter-Sitzungen laufen heute auf `tc.sid`. Ob sie ablaufen dürfen oder umgezogen
> werden, wird beim Bau entschieden — mit einer Messung, wie viele es zum
> Umstellungszeitpunkt überhaupt sind.

---
## 9. Wie gegengeprüft wird

Wer die Liste vorher kennt, baut anders. Das ist der Zweck.

| # | Frage | Wie sie beantwortet wird |
|---|---|---|
| 1 | **Ist die Kette durchgängig?** | Ein Durchlauf von Schritt 1 bis 19 an echten Daten — ein Mensch kommt vom Abo bis zum Dokument im Portal |
| 2 | **Ist etwas doppelt gebaut worden?** | Für jede neue Datei und jede neue Tabelle: gab es das schon? M0.2 muss die Antwort vorher gegeben haben |
| 3 | **Zählt „fertig" wirklich als fertig?** | Jeder Endpunkt braucht einen Aufrufer, jede Seite einen Klickpfad (M-L8) |
| 4 | **Beißt jede Probe?** | Für jede Schutzregel eine Rückmutation. Wird die Suite nicht rot, schützt sie nichts |
| 5 | **Hält die Mandantengrenze?** | Fremde Organisation → 403, nicht 200 mit leerer Liste |
| 6 | **Läuft es wirklich?** | Der Takt-Herzschlag aus M1.1 beantwortet das für jeden Automatismus |
| 7 | **Stimmt die Doku mit dem Code?** | `dokuWaechter`, `uebergabe`, `flaechenZuordnung` grün; Register nachgezogen |

**Eine Phase gilt als nicht abgenommen**, wenn: ein Test durch Abschwächen grün wurde ·
eine Behauptung ohne Beleg im Bericht steht · ein Beleg aus dem Browser gegen einen
laufenden Container stammt, ohne dass die Prozesslaufzeit geprüft wurde · ein Testlauf
durch eine Pipe beurteilt wurde · etwas neu gebaut wurde, das es schon gab · eine Lücke
erfunden statt gefragt wurde.

### Der Bericht je Welle

```
Welle:            M2
Gebaut:           <Dateien>
Gemessen:         <was war vorher da, mit Beleg>
Nachweis:         <Proben, Rückmutationen, Browser-/DOM-Beleg>
Erreichbarkeit:   <Klickpfad>
Org-Grenze:       <geprüft ja/nein, wie>
Offen:            <was bewusst nicht gebaut wurde und warum>
Gefragt:          <welche Owner-Entscheidung noch aussteht>
```

**Was beim Bauen auffällt, gehört in den Bericht — auch und gerade, wenn es den Plan
widerlegt.** In Welle K4 war die geplante Meldung an das Team nicht baubar; das offen zu
sagen war mehr wert, als sie vorzutäuschen.

---

## 10. Arbeitsanweisung

### 10.1 Zuerst lesen

1. `docs/UEBERGABE.md` — der Gesamtstand, per Test erzwungen
2. **dieses Dokument**, vollständig, vor der ersten Änderung
3. `CLAUDE.md`, Abschnitt *„Das Team ist eine Person"*
4. `docs/FLAECHEN.md` — was ins Staff CC gehört, was ins OCC, was ins Support Center

### 10.2 Eiserne Regeln

| Regel | Warum |
|---|---|
| **Nie `git add -A`** | Im Baum liegen ungetrackte Geschäftsunterlagen |
| **Immer `git commit --only <pfade>`** | Mehrere Sitzungen arbeiten parallel |
| **Commit-Freigabe steht, Push nur auf Zuruf** | Owner-Entscheid |
| `Co-Authored-By: Claude <noreply@anthropic.com>` | An jeden Commit |
| **Tests sind die Spezifikation** | Ein roter Test wird nie durch Abschwächen grün gemacht |
| **Kein stiller Skip** | Pfade über `import.meta.url` |

### 10.3 Wie geprüft wird

```bash
cd api && node scripts/run-tests.js
```

**Niemals durch eine Pipe** — `| grep | head` liefert den Rückgabewert von `head`, also 0.
In eine Datei umleiten und die Datei lesen.

DB-gestützte Proben laufen nur im Container:

```bash
docker exec tempconnect_api sh -c "cd /app && node --test --test-force-exit test/integration/<datei>"
```

### 10.4 Vier Fallen, jede teuer bezahlt

1. **`api/.stryker-tmp` ist 124 MB groß** und enthält vollständige Kopien von `routes/`,
   `services/` und `test/` — mit **veralteten Zeilennummern**. Jede rohe `grep -r`-Suche
   findet sie doppelt. Wer dort liest, belegt seine Aussage mit einem Stand von vorgestern.
   **Suchen immer mit ripgrep/Grep (respektiert `.gitignore`) oder mit
   `--exclude-dir=.stryker-tmp`.**
2. **Escape-Zeichen kollabieren** durch Bash, Heredoc, `python -c` und die
   Schreib-Werkzeuge. Inhalte **ohne jedes Escape** erzeugen (`chr(10)`,
   `String.fromCharCode`), Skripte in eine **Datei** schreiben statt `-c`, und **immer das
   Ergebnis ansehen**.
3. **Eine Pipe verschluckt den Rückgabewert.** Siehe 10.3.
4. **Der Browser beweist nichts über das Backend.** Der Container bedient einen
   Prozess-Schnappschuss vom Startzeitpunkt:
   ```bash
   docker exec tempconnect_api sh -c "ps -o etime,args | grep '[n]ode server.js'"
   ```

### 10.5 Die Fehlerklasse dieser Welle

*Etwas ist gebaut, montiert — und niemand benutzt es.* **Siebenmal gemessen**, und
zweimal betrifft es den Kern des Ablaufs: die Marktplatz-Automatik läuft nie, und der
Teilmengen-Weg ist für die handelnde Partei unerreichbar.

**Deshalb bekommt jede Verdrahtung eine Probe, die den echten Handler durchläuft** —
nicht nur den Dienst darunter. In Welle K4 fand genau so eine Probe beim ersten Lauf
einen `ReferenceError`, während alle acht Dienst-Proben grün blieben.

**Und: Wächter, die suchen statt abzuhaken.** Vorbilder im Baum:
`api/test/jedeMailHatEinenAbsender.test.js`, `api/test/statuswertSpiegel.test.js`.

### 10.6 Nach jeder Welle

Register nachziehen: `sql/migrations/NUMBERING.md`, Schema-Momentaufnahme
(`api/scripts/schema-snapshot.js`), `docs/PLATTFORM_REGISTER.md` über den Generator,
dieses Dokument auf den Stand bringen. Dann volles Gate, dann committen.

---

## 11. Was Welle M **nicht** tut

- **TempConnect zur Vertragspartei der Überlassung machen.** Nie. (M-L1)
- **Ein zweites Bedarfs- oder Angebotsmodell bauen.** Der Korb setzt auf
  `demand_requests` und `offers` auf.
- **Einen dritten mehrstufigen Assistenten bauen.** (M-L6)
- **Die Live-Belegschaft oder die Marktplatz-Befüllung neu bauen.** Beide sind Welle E/J
  — M sorgt dafür, dass sie **laufen**.
- **Eine Fläche für die zukünftige Besetzung bauen.** Sie existiert als Monatsplan.
- **Hochverfügbarkeit.** Das ist Welle L.
- **OCC-Module anlegen oder entfernen.** Owner-Entscheid 2026-08-27.
- **Zahlungsflüsse über ein TempConnect-Konto.** (M-L3)
