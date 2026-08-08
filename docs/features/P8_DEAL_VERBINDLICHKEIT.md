# P8 — Deal-Verbindlichkeit: Rücknahme, Folgen, Besetzbarkeit

> **Stand:** 2026-08-07 · Branch `release/enterprise-premium-market-ready` · **Wellen A–E erledigt** (uncommitted)
> **Zweck:** Diese Datei allein genügt, um P8 in einem neuen Chat ohne Rückfragen
> fortzusetzen. Erst lesen, dann die offene Welle abarbeiten.
> **Owner-Prompt (sinngemäß):** „Beide Seiten sollen Deals zurücknehmen bzw. abbrechen
> können — Strafen? Bounties? Deals verpflichtend wie Artikelverkauf? Abschluss in drei
> Schritten bestätigen? Und: Die Zeitarbeitsfirma soll beim Überfahren eines Angebots
> sehen, ob sie es besetzen könnte."

---

## 1. Die Leitfrage

Ein Deal, den beide Seiten folgenlos abbrechen können, ist kein Deal, sondern eine
Absichtserklärung. Ein Deal ohne Abbruchweg erzeugt dagegen **Lügen statt Stornos** —
„die Kraft ist krank" statt „ich habe besser vermittelt".

**P8 baut nicht den Abbruch (den gibt es), sondern seine Folgen.**

---

## 2. Ist-Stand — gemessen am 2026-08-06

### Vorhanden und gut gebaut

| Was | Beleg |
|---|---|
| Angebot **zurückziehen** (vor Annahme) | `POST /marketplace/offers/:id/withdraw` — [marketplace.js:1302](../../api/routes/marketplace.js), begrenzt auf `draft/sent/countered` |
| Vereinbarung **stornieren** (nach Annahme) | `POST /marketplace/offers/:id/cancel-agreement` — [marketplace.js:1556](../../api/routes/marketplace.js); nur Beteiligte (403 sonst) |
| Storno-Logik | `dealAgreementService.cancelAgreement` — Zustandsprüfung, Audit-Log, und **Rollback der Nebenwirkungen**: Einsatz → `cancelled`, Reservierungen → `released`, Einladungen → `cancelled`, danach Re-Sync von `capacity_posts`/`demand_requests` |
| Zustandsautomat | `AGREEMENT_TRANSITIONS` in `api/services/stateMachine.js:89` — `pending_confirmation`/`confirmed`/`activated` → `cancelled`, `cancelled` ist Endzustand |
| Reputation | Tabelle `supplier_reputation`: `deal_success_rate`, `completed_deals`, `total_deals`, `reputation_score`, `grade` |
| Bounties | Tabellen `bounties`, `user_bounties`, `bounty_tiers`; Kategorien `activity`, `community`, `loyalty`, `performance`; Rabatt als `discount_pct` |
| Besetzbarkeit (Rohstoff) | `capacityOfferMatchService`, `worker_profile_skills`, `workerOfferReservationService` (wer ist gebunden), `workerAvailabilityService` (ab wann frei) |

### Die Lücke — und sie ist scharf

**`deal_success_rate` wird nur gelesen, nie geschrieben.** Die Spalte ist immer `NULL`.
Sie fließt aber ins Feed-Ranking ein ([capacityExchangeService.js:843](../../api/services/capacityExchangeService.js):
`deal_success_rate / 30`). Eine Kennzahl, die die Sichtbarkeit steuern soll, hat noch nie
einen Wert gehabt.

Daraus folgt der eigentliche Befund:

- **Ein Storno kostet heute exakt nichts.** Kein Reputationsverlust, kein Ranking-Effekt.
- Die **Gegenseite sieht es nicht** — weder vor noch nach Vertragsschluss.
- Der **Grund ist optional** (`req.body?.reason`) und Freitext → nicht auswertbar.
- Es gibt **keine Zeitdimension**: Storno 4 Wochen vorher zählt wie 12 Stunden vorher.
- Bounties sind **ausschließlich positiv** — kein Mechanismus für Zuverlässigkeit.

---

## 3. Verbindliche Leitentscheidungen

Diese Entscheidungen sind die Grundlage aller Wellen. Wer sie ändert, ändert P8.

### 3.1 Keine Geldstrafen

1. TempConnect ist **Vermittler, nicht Vertragspartei** — eine Vertragsstrafe zwischen
   zwei Dritten ist nicht durchsetzbar.
2. AGB-rechtlich heikel (Verzugsschaden nachweisen).
3. **Der entscheidende Grund:** Strafen erzeugen Ausweichverhalten. Wer für ein Storno
   zahlt, storniert nicht — er schickt jemanden, der nicht passt. Das ist für die
   Plattform schlimmer als der Abbruch.

### 3.2 Verlust einer Belohnung statt Strafe

Ein Zuverlässigkeits-Bounty, das beim Storno **entfällt** und sich neu aufbaut. Es wird
niemandem Geld genommen, es wird nur nicht gegeben — rechtlich sauber, und Verlustaversion
wirkt nachweislich stärker als eine gleich hohe Strafe.

### 3.3 Deals sind NICHT verpflichtend wie ein Artikelverkauf

Zeitarbeit hat legitime Stornogründe (Krankheit, Kunde sagt ab, Auftrag verschoben). Ein
Verbot erzeugt keine Verbindlichkeit, sondern Falschangaben.

**Stattdessen: Storno ≠ Storno.** Zwei Achsen entscheiden über das Gewicht:

- **Grund** — aus geschlossener Liste, nicht Freitext (sonst nicht auswertbar)
- **Vorlauf** — Abstand zwischen Storno und Einsatzbeginn

### 3.4 Die Folge muss benannt werden, sonst wirkt sie nicht

Drei Bestätigungsschritte ohne benannte Konsequenz sind Bürokratie und erzeugen
Klick-Blindheit. Der Hebel ist **Schritt 3**, der sagt, was ein Storno kostet.

### 3.5 Anonymität bleibt

Die Besetzbarkeits-Vorschau nennt **keine Namen** — passend zum bestehenden
`is_anonymous`-Prinzip bei `capacity_posts`. Sie nennt Zahlen und Rollen.

---

## 4. Offene Owner-Entscheidungen

**Alle vier am 2026-08-06 vom Owner entschieden — wie vorgeschlagen:**

| # | Frage | Entscheidung |
|---|---|---|
| **E1** | Ab welchem Vorlauf zählt ein Storno „kurzfristig"? | ✅ **< 48 h vor Einsatzbeginn = doppeltes Gewicht; ≥ 14 Tage = zählt nicht.** Dazwischen einfach. |
| **E2** | Welche Stornogründe zählen **nicht** gegen die Quote? | ✅ `customer_cancelled` (bei der Agentur) und `worker_sick` mit Nachweis. Alles andere zählt. |
| **E3** | Höhe des Zuverlässigkeits-Bounty | ✅ **3 %** (Kategorie `performance`), Fenster 90 Tage ohne Storno. |
| **E4** | Quote anzeigen oder nur im Ranking? | ✅ **Anzeigen**, aber erst ab **5 Deals** — sonst bestraft sie Neulinge. |
| **E5** | Rabatt der oberen Leiterstufe (`zero_complaint`, 365 Tage)? | ✅ *(2026-08-07)* **Bleibt bei 3 %.** Die lange Stufe trägt Prestige, nicht mehr Geld. |

---

## 5. Wellen

### Welle A — Storno-Erfassung schärfen ✅ *(erledigt 2026-08-06)*

**Ziel:** Ein Storno wird auswertbar. Noch ohne Folgen — die kommen in B.

**Umgesetzt:** Migration 163 (`offer_cancellations`), `reason_code` als Pflicht-Enum,
`cancelled_by_side` **aus der Sitzung** (nicht aus dem Rumpf — sonst könnte sich der
Stornierende als die andere Partei ausgeben), `lead_time_hours` in `Europe/Berlin`,
`api/test/offerCancellation.test.js` (18 Tests).

> **Der Test hat sofort einen echten Fehler gefangen.** Die erste Fassung der
> Vorlaufberechnung nutzte den bequemen Einzeiler
> `new Date(d.toLocaleString("en-US", { timeZone }))`. Der misst aber die Differenz
> zwischen Zielzone und **Zeitzone des Rechners** — auf einem deutschen Rechner also
> konstant 0. Der Fehler wäre in der Entwicklung nie aufgefallen und erst auf einem
> UTC-Server zugeschlagen, mit zwei Stunden Versatz an der 48-Stunden-Schwelle.
> Ersetzt durch `Intl.formatToParts`. **Merksatz: Zeitzonen nie über die Maschinenzeit
> herleiten.**

**Signaturwechsel:** `cancelAgreement(pool, offerId, actorId, { reason_code, note, side })`
statt eines Freitext-Strings. Ein einziger produktiver Aufrufer (die Route) — die neun
roten Bestandstests waren reine Aufruf- und Mock-Pflege, alle Zusicherungen unverändert.

- Migration: `offer_cancellations` (oder Spalten an `offers`) mit
  `reason_code` (Enum), `cancelled_by_user_id`, `cancelled_by_side` (company/agency),
  `assignment_start_date`, `lead_time_hours` (berechnet), `note` (frei, optional)
- `reason_code` als **geschlossene Liste**: `customer_cancelled`, `worker_sick`,
  `worker_quit`, `date_moved`, `mistake`, `other`
- `cancelAgreement` nimmt den Grund **verpflichtend** entgegen (Route bricht ohne ihn ab)
- Audit-Eintrag trägt Grund und Vorlauf

**Gate A:** Ein Storno ohne gültigen `reason_code` wird abgelehnt (400). Vorlauf wird
korrekt aus `Europe/Berlin` gerechnet (nicht UTC — siehe `todayDE`).

### Welle B — Zuverlässigkeitsquote beleben ✅ *(erledigt 2026-08-07)*

**Ziel:** `deal_success_rate` bekommt endlich einen Wert und wirkt im Ranking.

**Umgesetzt:** Migration 164 (`deal_reliability` + `offer_cancellations.from_status`),
`api/services/dealReliabilityService.js`, Cron `POST /api/internal/recompute-deal-reliability`
(täglich 4:45, in `docs/SCHEDULER.md`), ereignisgetriebener Nachlauf direkt nach dem Storno,
`api/test/dealReliability.test.js` (38 Tests) + 2 Ranking-Tests in `capacityFeedRanking.test.js`.

**Die Formel:** `Quote = (verbindliche Deals − gewichtete Stornos) / verbindliche Deals`,
geklemmt auf 0–100, `NULL` unter 5 Deals. Fenster: rollierende 365 Tage — kein Kalenderjahr,
sonst wäre jeder 1. Januar ein Reset.

**Drei Entscheidungen, die über den Wellenplan hinausgehen:**

1. **`from_status` musste nachgezogen werden.** Welle A hat den Vorzustand nicht erfasst.
   Ohne ihn hätte ein Rückzug *vor* der beidseitigen Bestätigung genauso gezählt wie ein
   Wortbruch danach — das wäre eine Kennzahl, die legitimes Verhandeln bestraft. Der
   Vorzustand stand bis dahin nur im Audit-Log als JSONB-Detail und war nicht aggregierbar.
2. **Eigene Tabelle statt nur der Spalte.** `supplier_reputation` ist per Name und Semantik
   anbieterseitig — auch Unternehmen stornieren (Welle A erfasst `cancelled_by_side` genau
   deswegen). Dazu kommt: eine nackte Prozentzahl lässt sich einem Kunden nicht erklären.
   `deal_reliability` hält Zähler, Nenner, Fenster und die Zahl der entschuldigten Fälle —
   genau das, was Welle D in Schritt 3 mit echten Werten benennen muss.
   `supplier_reputation.deal_success_rate` bleibt als **Spiegel** für den heißen Lesepfad
   (dasselbe Muster wie `worker_profiles.skill_tags[]` zu `worker_profile_skills`). Dadurch
   wirkt die Quote sofort im Ranking und in allen sechs bestehenden Anzeigen, ohne dass eine
   davon angefasst werden musste.
3. **E2 gilt seitenabhängig.** `customer_cancelled` und `worker_sick` entlasten *nur* die
   Agentur. Für das Unternehmen zählen sie — sonst wäre „die Kraft ist krank" ein
   Freifahrtschein für jede Seite.

**Gemessen, nicht behauptet:** Vor dem ersten Lauf hatte `deal_success_rate` im Entwicklungs­
bestand **0 gesetzte Zeilen** — die Lücke aus Abschnitt 2 ist damit am echten Datenbestand
bestätigt, nicht nur aus dem Code geschlossen. Nach dem Lauf: 5 Parteien gerechnet
(2 Agenturen, 3 Unternehmen), 2 Spiegelwerte gesetzt, die Partei mit einem einzigen Deal
korrekt auf `NULL`. Zweiter Lauf identisch.

**Gate B:** ✅ Eine Org ohne Deals hat keine Quote (`NULL`, nicht 0 %) — im Service, im
Spiegel und in der Oberfläche. Ranking nachweisbar verändert (`capacityFeedRanking.test.js`:
gleicher Eintrag, unterschiedliche Quote → unterschiedlicher `rank_score`).

> **Nachgezogen: die Beschriftung.** Die Zahl hieß in vier Oberflächen „Erfolgsrate" bzw.
> „Deal Success" mit dem Tooltip „Anteil erfolgreich abgeschlossener Deals". Das war nach
> der Umstellung schlicht falsch beschrieben. Jetzt „Zuverlässigkeit" (DE/EN), und der
> Tooltip nennt die Regel im Klartext: Gewichtung, Ausnahmen, Sichtbarkeitsschwelle. Eine
> Kennzahl, deren Regel der Nutzer nicht kennt, erzeugt Misstrauen statt Verbindlichkeit.

#### Gegenprüfung — was sie gefunden hat

Vier unabhängige Perspektiven (Kennzahl, SQL/Isolation, Skalierung, Regression) haben
30 Rohbefunde geliefert; nach Deduplizierung gingen 8 in eine adversarische Widerlegung,
5 haben standgehalten. Sie liefen auf drei echte Defekte hinaus — alle behoben:

**1. E1 hat nie gezündet (schwer, aus Welle A geerbt).**
`cancelAgreement` löste den Einsatzbeginn über `offer.start_confirmed || offer.assignment_start_date`
auf. **Die zweite Spalte existiert auf `offers` nicht** — es gibt sie nur auf
`offer_cancellations`, als Zielspalte. Der Fallback war eine tote Zeile, die richtig aussah.
Folge: `lead_time_hours` blieb `NULL`, sobald kein bestätigtes Startdatum vorlag, der Storno
landete in der Klasse „unbekannt" und wog einfach statt doppelt.

Im Entwicklungsbestand betrifft das **8 von 15** bestätigten Angeboten — bei über der Hälfte
wäre die Kernregel der Welle wirkungslos gewesen. Kein Test war rot; die Vorlaufberechnung
selbst war korrekt und getestet, nur ihr *Eingabewert* kam nie an. Behoben durch denselben
Join, den `activateAgreement` längst benutzt: `demand_requests.start_date` ist `NOT NULL` und
über `offers.demand_request_id` (ebenfalls `NOT NULL`) immer erreichbar.

*Kein Backfill nötig:* `offer_cancellations` enthält **null Zeilen** (Tabelle stammt aus
Migration 163 derselben Arbeitsphase, P8 war nie ausgerollt). Es gibt also keinen Altbestand,
der mit `lead_time_hours = NULL` erfasst wurde. Ab jetzt löst der Join immer auf.

**2. Wer aus dem Fenster fällt, behielt seine Quote für immer.**
Beide Ladeabfragen liefern nur Parteien *mit* Deals im Fenster. Wer seit 366 Tagen keinen
bestätigten Deal mehr hat, tauchte in keiner Gruppe auf — und behielt seine alte Quote samt
gespiegeltem Ranking-Vorteil unbefristet. Eine Kennzahl, die sich nur nach oben korrigieren
lässt, ist ein Besitzstand. Behoben durch einen mengenbasierten `NOT EXISTS`-Sweep, der auf
`NULL` zurücksetzt (nicht auf 0) und den Spiegel mitnimmt — und der **ausschließlich beim
vollen, ungekürzten Lauf** greift, weil er sonst bei einem eingegrenzten oder am Batch-Limit
abgeschnittenen Lauf fremde Zeilen leeren würde.

**3. Der Batch-Tail wäre verhungert.**
Sortierung nach `binding_deals DESC` hätte am Limit in *jedem* Lauf dieselbe Spitzengruppe
gerechnet. Jetzt entscheidet die Frische (`computed_at`, nie gerechnete zuerst), Größe ist nur
noch Tiebreak — die Menge rotiert, jede Partei kommt garantiert dran. Nutzt den in
Migration 164 ohnehin angelegten `deal_reliability_computed_idx`.

Drei weitere Befunde wurden von den Skeptikern **widerlegt** und bewusst nicht umgesetzt,
u. a. „der Spiegel legt `grade='UNRATED'` an und blendet die Quote im Feed aus" (die
Einzelfakten stimmen, die Kausalkette nicht) und zweimal „Batch-Limit bricht bei 300 Kunden"
(Parteienzahl skaliert mit der Kundenzahl, nicht unbegrenzt — bei 300 Kunden liegt sie unter
dem Deckel von 1000). 22 Befunde niedriger Schwere wurden nicht verifiziert (Kappung).

**Verifikation nach den Fixes:** Vollsuite **7927 / 0 Fehler / 13 übersprungen**;
DB-gestützter Smoke 10/10 gegen das echte Schema; zwei Mutationsproben (Gewicht `unkritisch`
0→1 und Entfernen der Truncation-Schutzbedingung) machen die Suite jeweils rot — die Tests
laufen also wirklich.

### Welle C — Zuverlässigkeits-Bounty ✅ *(erledigt 2026-08-07)*

**Ziel:** Der positive Anreiz aus 3.2.

**Umgesetzt:** Migration 165, `dealReliabilityService.ladeZuverlaessigkeitsStreak`,
neuer Bedingungstyp `reliability_streak` in `bountyService`, Begründungstexte bis in die
Kachel, `api/test/dealReliability.test.js` (+9) und `bountyService.coverage.test.js` (+8).

#### Der zweite geerbte Defekt: das Bounty maß den falschen Storno-Kanal

Es gab bereits ein Bounty `zero_complaint` („Null-Beschwerde-Streak", 3 % Rabatt,
*„12 Monate ohne Beanstandung oder Storno"*). Seine Bedingung zählt
`requests.status = 'CANCELED'`.

`requests` ist der **Alt-Pfad** (Anfrage + Reservierung). Dort wird `CANCELED` durchaus
geschrieben — über `PATCH /api/requests/:id` → `capacityService.releaseReservationAndSetStatus`
([requests.js:421](../../api/routes/requests.js)). Der heutige Deal-Flow läuft dagegen über
`offers.agreement_status`, und `dealAgreementService.cancelAgreement` fasst die Tabelle
`requests` **nie** an: es ändert `offers`, `assignments`, `assignment_staffing_*`,
`demand_requests`, `capacity_posts`.

**Folge:** Wer eine Einsatzvereinbarung zwölf Stunden vor Beginn platzen lässt — genau das
Verhalten, um das es in P8 geht — lässt `requests.status` unberührt und behält die 3 % Rabatt
für „null Stornos". Die Plattform belohnt ausgerechnet den Kanal, den sie eindämmen will.

> **Korrektur an eigener Arbeit.** Die erste Fassung dieses Abschnitts behauptete, den Status
> schreibe *kein Codepfad*. Das war falsch und wurde von der adversarischen Gegenprüfung am
> Code widerlegt: Die zugrunde liegende Suche verlangte Status-Literal und `UPDATE` in
> derselben Zeile und übersah damit systematisch parametrisierte Statements
> (`SET status = $1` nennt den Wert nicht). Der Defekt bleibt bestehen, seine Beschreibung
> ist jetzt präziser — falscher Kanal, nicht toter Status. Die gebaute Lösung ändert sich
> dadurch nicht.

Ein zweites Bounty danebenzustellen und das erste stehen zu lassen wäre die schlechteste
Variante gewesen: zwei Kacheln mit demselben Versprechen, eine davon am falschen Kanal
gemessen, zusammen 6 %. Stattdessen wurde `zero_complaint` auf dieselbe Quelle umgestellt
und beide zu einer Leiter verbunden:

| Stufe | Bedingung | Rabatt | |
|---|---|---|---|
| `zuverlaessiger_partner` | 90 Tage ohne gewichteten Storno | 3 % | Einstieg |
| `zero_complaint` | 365 Tage ohne gewichteten Storno | 3 % | **löst den Einstieg ab** |

Die Ablösung nutzt das `replaces`-Muster, das seit Migration 053 für `loyalty_2y → loyalty_1y`
existiert — dort allerdings fest verdrahtet in einer If-Kette. Das wurde auf den Katalog
verallgemeinert; ein zweites Paar hätte den Rabatt sonst still verdoppelt. Die Rabatthöhe von
`zero_complaint` blieb bei 3 %: Preise sind Owner-Entscheidung, E3 hat nur den neuen Eintrag
beziffert. Die Leiter trägt heute Prestige, nicht mehr Geld — ob die lange Stufe 5 % wert sein
soll, ist eine offene Owner-Frage.

Bestehende `zero_complaint`-Vergaben werden in der Migration deaktiviert (nicht gelöscht — die
Zeile trägt `earned_at` und damit die Historie). Ohne diesen Schritt liefe der am falschen
Kanal gemessene Rabatt weiter, bis der Nutzer zufällig seine Bounty-Seite öffnet.

Der alte Bedingungstyp `zero_complaints_12m` ist **ersatzlos** entfernt: Läuft eine Datenbank
ohne Migration 165, fällt das Bounty dadurch weg, statt weiter am falschen Kanal gemessen zu
werden. Die sichere Richtung im Fehlerfall.

#### Was der Lauf gegen echte Daten korrigiert hat

Der erste Entwurf zählte die Mindestzahl an Abschlüssen **im jeweiligen Streak-Fenster**.
Ergebnis am realen Bestand: Eine Firma hielt den 365-Tage-Orden, während die 90-Tage-Stufe
„gesperrt — noch 2 Abschlüsse" anzeigte. **Die Leiter lief rückwärts** und bestrafte genau die
geringe Geschäftsfrequenz, die E4 ausdrücklich schonen wollte. Behoben durch zwei getrennte
Zeiträume: der *Streak* misst 90 bzw. 365 Tage, der *Nachweis „es gab überhaupt Geschäft"*
läuft über ein festes Jahr. Damit ist die Leiter monoton — wer die lange Stufe hält, erfüllt
die kurze zwangsläufig mit.

**Gate C:** ✅ Entzug und Neuaufbau sind idempotent — der Upsert überschreibt, er addiert
nicht; zwei Läufe hintereinander liefern am echten Bestand identische Ergebnisse. Die Ablösung
ist ebenfalls idempotent (sie deaktiviert nur, was aktiv ist).

**Zusätzlich zu den Wellenpunkten:** Die Kachel nennt jetzt den Grund im Klartext —
„Entfallen durch Storno am 12.08. Baut sich neu auf und ist ab 10.11. wieder verfügbar",
„Noch 2 verbindliche Abschlüsse bis zur Freischaltung" oder „90 Tage ohne gewichteten Storno
bei 8 verbindlichen Abschlüssen". Der Text kommt fertig formuliert vom Server, damit
Bounty-Regel und Erklärung nicht auseinanderlaufen können. Eine graue Kachel ohne Begründung
erzieht niemanden — der Anreiz wirkt nur, wenn die Folge benannt ist (Leitentscheidung 3.4).

**Aus der Gegenprüfung übernommen:** Die abgelöste Stufe erschien als *„In Arbeit, 100 %"* mit
Erfolgstext — bei 0 % Rabatt. Das liest sich wie einbehaltenes Geld. Sie bekommt jetzt den
eigenen Status `superseded` (DE „Abgelöst" / EN „Superseded") und den Satz „Abgelöst durch
*Null-Beschwerde-Streak* — der Rabatt steckt dort." Die Skeptiker hatten den Punkt als
kosmetisch verworfen; bei der alten `loyalty`-Leiter war er selten, mit der
Zuverlässigkeits-Leiter sieht ihn künftig jeder saubere Partner.

> **Eine Regel, ein Ort.** `bountyService` rechnet nicht selbst, was ein Storno ist, sondern
> ruft `dealReliabilityService.gewichteStorno` auf — dieselbe Funktion, aus der die
> Zuverlässigkeitsquote entsteht. Ein Bounty mit eigener Storno-Definition würde beim ersten
> Regelwechsel von der angezeigten Quote wegdriften, und dieselbe Oberfläche behauptete zwei
> Wahrheiten über denselben Vorgang.

> **E5 — entschieden am 2026-08-07:** ✅ **Beide Stufen bleiben bei 3 %.** Die lange Stufe
> (365 Tage sauber) trägt damit bewusst Prestige, nicht mehr Geld. Wer sie später anheben
> will, ändert `discount_pct` in einer neuen Migration — die Ablösung über `replaces` sorgt
> weiterhin dafür, dass sich beide Stufen nie stapeln. **Nicht erneut zur Entscheidung
> stellen.**

### Welle D — Mehrstufige Bestätigung ✅ *(erledigt 2026-08-07)*

**Umgesetzt:** `api/services/dealCommitmentService.js`, zwei lesende Endpunkte
(`GET /marketplace/offers/:id/commitment-preview` und `/cancellation-impact`), ein
Assistent in [offer_detail.html](../../frontend/public/offer_detail.html) für beide Abläufe,
`api/test/dealCommitment.test.js` (24 Tests) und `e2e/tests/deal-commitment-guards.spec.js`.

#### Der dritte geerbte Defekt: der Storno-Button war tot

Welle A hat den Storno-Vertrag auf `reason_code` aus einer geschlossenen Liste umgestellt.
Der **einzige** Aufrufer im Frontend schickte aber weiter Freitext:

```js
var reason = window.prompt('Grund für die Stornierung (optional):', '');
body.reason = reason;                       // → zod: reason_code Required → 400
```

Seit Welle A lief jede Stornierung über `offer_detail.html` damit in eine
Validierungs-Fehlermeldung. Kein Test hat es bemerkt: die Route-Tests benutzen die neue
Form, und für den Button gab es keinen Klickpfad. Welle D ersetzt den Prompt ohnehin durch
eine echte Grund-Auswahl — der tote Pfad verschwindet dabei.

#### Die Folgen sind gerechnet, nicht getextet (Gate D)

`berechneStornoFolgen` liefert für **jeden** Grund das Gewicht und die Quote *danach*, dazu
den Rabatt, der am Streak hängt, und ab wann er wiederkommt. Am echten Bestand gemessen:

| | Agentur | Unternehmen |
|---|---|---|
| `customer_cancelled` | Gewicht 0 → Quote bleibt 100 % | Gewicht 1 → 80 % |
| `worker_quit` | Gewicht 1 → 85,71 % | Gewicht 1 → 80 % |
| Rabatt in Gefahr | 3 % (`zero_complaint`, wieder ab 07.08.2027) | keiner |

Dieselbe Spreizung ist der erzieherische Teil: Der Nutzer sieht schwarz auf weiß, dass ein
unverschuldeter Grund ihn nichts kostet — und dass eine kurzfristige Absage doppelt zählt.

**Gate D:** ✅ Kein Schritt lässt sich überspringen (die Prüfung steht vor dem *Weiter*, ohne
Grund kein zweiter Schritt). Abbruch sendet nichts und verwirft nur die Auswahl. Die Folge in
Schritt 3 stammt aus der Antwort, nicht aus festem Text.

> **Wichtige Einordnung:** Die Schrittführung im Modal ist **Führung, kein Schutz.** Der
> Riegel ist der Server — `reason_code` ist dort Pflicht, und die Vorschauen antworten nur
> Beteiligten. Die E2E-Spec prüft genau diesen Riegel; der Klickpfad durch den Assistenten
> ist bislang nur durch Strukturtests abgedeckt (siehe „Offen" unten).

#### Nebenbefund: die Vorlaufberechnung verstand keine Date-Objekte

Beim Lauf gegen echte Daten fiel auf, dass `berechneVorlaufStunden` für ein `Date`-Objekt
`null` liefert — `String(date)` ergibt „Sat Jun 11 2026 …", der Tages-Regex verwirft das,
und E1 fällt lautlos auf Gewicht 1 zurück. In der App **latent**, weil `db/pool.js` den
Typ-Parser lädt und DATE-Spalten als Zeichenkette ankommen; scharf wird es für jeden eigenen
Pool (Worker, Wartungsskript). Behoben, mit Test.

#### Der Klickpfad ist nachgewiesen ✅ *(2026-08-07)*

`e2e/tests/deal-commitment-wizard.spec.js` baut die Fixture über die echte API auf und klickt
sich durch — **13 Tests grün** (zusammen mit den Riegeln aus `deal-commitment-guards.spec.js`).

Die Fixture nimmt bewusst den produktiven Weg: **Company legt den Bedarf an → Agentur stimmt
über `accept-deal` zu** (das Angebot entsteht dabei direkt als `accepted` und die Vereinbarung
gleich mit) **→ Agentur bestätigt**. Der naheliegende Weg über
`POST /demand-requests/:id/offers` funktioniert *nicht*: Er legt das Angebot als `draft` an,
und es gibt keine Route, die es auf `sent` hebt — `acceptOffer` scheitert dort folgerichtig
mit `INVALID_TRANSITION`. Das ist beim Bauen aufgefallen und im Spec-Kopf dokumentiert.

**Gate D ist damit verhaltensmäßig belegt, nicht mehr nur strukturell:**

| Zusicherung | Nachweis |
|---|---|
| Kein Schritt überspringbar | „Weiter" ohne Grund → Fehlerhinweis, weiterhin Schritt 1 |
| Abbruch ändert nichts | bis Schritt 2 vorgedrungen, abgebrochen → `agreement_status` weiterhin `confirmed` |
| Folge aus echten Werten | Schritt 2 zeigt den gerechneten Block, nicht Fixtext |
| Grund ist Pflicht-Enum | sechs Auswahlmöglichkeiten aus der Serverliste, kein Freitextfeld |
| Zurück verliert nichts | gewählter Grund ist nach „Zurück" noch markiert |

**Die Kette bis in die Datenbank, ausgelöst von einem Browser-Klick:**

```
reason_code = worker_sick | cancelled_by_side = agency | from_status = confirmed
lead_time_hours = 705     | assignment_start_date = 2026-09-06
→ 113 ms später: binding_deals 1 · weighted_cancellations 0.00 · reliability_rate NULL
```

Zwei Dinge stehen darin, die ohne die Reparaturen dieser Sitzung fehlen würden:
`lead_time_hours` wäre **NULL** (accept-deal setzt kein `start_confirmed`; erst der Join auf
`demand_requests.start_date` liefert den Beginn), und `weighted_cancellations` ist **0,00**,
weil E2 die Agentur bei Krankheit entlastet — während `reliability_rate` **NULL** bleibt, weil
E4 unter fünf Deals keine Behauptung zulässt.

#### Drei Stolpersteine, die der Klickpfad zutage gefördert hat

1. **Der Cookie-Banner** (`#tc-cc`, `z-index: 2147483000`) fängt Klicks auf jeden Dialog ab.
   Jeder künftige UI-Test muss ihn zuerst wegklicken — „Nur notwendige", also die
   datenschutzfreundliche Wahl. Der Fehler sieht wie ein Klick-Timeout aus und verrät seine
   Ursache nicht.
2. **`waitForLoadState("networkidle")` erreicht diese Plattform nie** — die Seiten pollen
   Benachrichtigungen. Auf das fachliche Ergebnis pollen, nicht auf Netzruhe.
3. **Die Sprache ist nicht garantiert Deutsch** (`localStorage: tempconnect-lang`). Wer gegen
   Text prüft, setzt sie vorher — das ist ehrlicher, als die Prüfung so weit aufzuweichen,
   dass sie beide Sprachen durchlässt und nichts mehr aussagt.

---

### Welle D — ursprünglicher Plan

**Ziel:** Verbindlichkeit im Moment des Abschlusses spürbar machen.

**Abschluss (3 Schritte):**

| Schritt | Inhalt | Warum |
|---|---|---|
| 1 — **Was** | Leistung, Zeitraum, Menge, Ort, Preis als Zusammenfassung | Der häufigste Streit ist „das habe ich anders verstanden" |
| 2 — **Wer & Wie** | Wie viele Kräfte bestätigt, nötige Nachweise, Ansprechpartner beider Seiten | Hier fällt auf, wenn nicht besetzt werden kann — **vor** der Zusage |
| 3 — **Verbindlichkeit** | Zusage mit **benannter Folge**: „Ein Storno nach dieser Zusage zählt in Ihre Zuverlässigkeitsquote und kostet Ihr Zuverlässigkeits-Bounty." | Der eigentliche Hebel (3.4) |

**Storno (2 Schritte):** Grund aus Liste → Auswirkung zeigen („betrifft 3 zugewiesene
Kräfte und einen Einsatz ab 12.08.") → bestätigen.

**Gate D:** Kein Schritt lässt sich überspringen; Abbruch im Modal ändert nichts am
Zustand; die Folge in Schritt 3 stammt aus den echten Werten der Welle B, nicht aus
festem Text.

### Welle E — Besetzbarkeits-Vorschau beim Überfahren ✅ *(erledigt 2026-08-07)*

**Umgesetzt:** `capacityOfferMatchService.fasseDeckungAnonymZusammen` (rein rechnend),
`GET /api/capacity-exchange/demands/:id/coverage`, Hover-Vorschau in
[marketplaceFeed.js](../../frontend/public/js/pages/marketplaceFeed.js) + CSS,
`api/test/capacityCoveragePreview.test.js` (16 Tests).

**Nichts neu gebaut, was es schon gab.** Die Rechenmaschine ist `checkOfferCoverage` aus
Multi-Skill Welle 6 — dieselbe Abfrage, dieselbe Überlappungsregel wie
`findWorkerScheduleConflicts`. Eine zweite Deckungslogik wäre beim ersten Regelwechsel
auseinandergelaufen und hätte Vorschau und Zuweisungs-Guard in Widerspruch gebracht.

**Was neu ist, ist die Anonymität.** `checkOfferCoverage` liefert Namen, Wohnort und
Profil-Ids — richtig für das eigene Angebotsformular, wo der Disponent seine eigenen Leute
sieht. Am **fremden** Bedarf wäre das ein Bruch von Leitentscheidung 3.5. Die neue Funktion
verdichtet zu Zahlen, Katalog-Rollen und Datumsangaben. Sie ist bewusst DB-frei und einzeln
testbar, damit die Regel „keine Person" nicht in einer Route versteckt ist.

Am echten Bestand gegengeprüft: Das Rohergebnis enthielt „Anna Kraft" und „Max Mustermann",
die ausgelieferte Fassung in allen sechs geprüften Kombinationen **null Namenslecks**.

**Gate E:** ✅ Beim Rendern läuft keine einzige Abfrage — das Fach entsteht leer
(`.ce-card__coverage:empty { display: none }`), geladen wird an `mouseenter`/`focusin`, und
jede Antwort wird gemerkt. Ohne passende Kraft erscheint eine ehrliche Leermeldung
(`keine_passende_kraft` bzw. `keine_auswertbare_faehigkeit` samt der nicht auflösbaren
Suchbegriffe), kein leeres Kästchen.

**Zwei Entscheidungen über den Plan hinaus:**

1. **Bezugsgröße ist die noch offene Kopfzahl**, nicht die ursprüngliche. Bei einem zur
   Hälfte gedeckten Bedarf wäre „0 von 10" eine Sackgassen-Anzeige, die einen lieferfähigen
   Anbieter vertreibt.
2. **Ohne Enddatum wird nicht geraten.** Eine Kraft in einem unbefristeten Einsatz zählt
   nicht in „vollständig besetzbar ab", sondern erscheint als „gebunden, Ende offen" — dieselbe
   Rangfolge wie in Multi-Skill Welle 2. Genau dieser Fall trat im Dev-Bestand auf.

---

### Welle E — ursprünglicher Plan

**Ziel:** Die Zeitarbeitsfirma sieht am Angebot sofort, ob sie liefern kann.

Inhalt der Box — **die Zahl, die die Entscheidung trägt**, nicht alles Mögliche:

```
3 von 5 Kräften sofort verfügbar
2× Gabelstaplerfahrer, 1× Lagerhelfer
Vollständig besetzbar ab 12.08.
⚠ 1 Kraft bis 20.08. gebunden
```

- Endpunkt: leichte Abfrage je Angebot, **nicht** beim Feed-Rendern (N+1!)
- **Erst beim Überfahren laden**, Ergebnis zwischenspeichern
- Keine Namen (3.5)
- Quellen: `worker_profile_skills` (Skill-Treffer), `workerOfferReservationService`
  (gebunden?), `workerAvailabilityService` (ab wann frei)

**Gate E:** Feed mit 50 Angeboten erzeugt beim Rendern **keine** zusätzliche Abfrage.
Ohne passende Kraft erscheint eine ehrliche Leermeldung, kein leeres Kästchen.

---

## 5b. Nachprüfung des Ursprungsauftrags (2026-08-07)

Der Owner-Auftrag wurde nach Abschluss aller Wellen noch einmal Satz für Satz gegen den
gebauten Stand gehalten. Alles erfüllt — mit **einer** Einschränkung, die hier festgehalten
gehört, weil sie beim ersten Durchgang nicht auffiel.

| Ursprungssatz | Stand |
|---|---|
| „Möglichkeiten für beide Seiten, Deals zurückzunehmen bzw. abzubrechen" | ✅ Welle A, beidseitig, Seite aus der Sitzung |
| „Sollten wir dazu Strafen aufstellen?" | ✅ entschieden: nein (3.1) — Strafen erzeugen Ausweichverhalten |
| „Oder in den Bountys verankern (bei 0 Rücknahmen = -%)" | ⚠️ **siehe unten** |
| „Deals verpflichtend wie Artikelverkauf?" | ✅ entschieden: nein (3.3) — erzeugt Falschangaben statt Verbindlichkeit |
| „Deal-Abschluss mit mehreren Schritten im Modal" | ✅ Welle D, 3 Schritte + 2 beim Storno |
| „Was sollte in 3 Schritten abgefragt werden?" | ✅ Was / Wer & Wie / Verbindlichkeit — Begründung in 3.4 |
| „Beim Überfahren sehen, welcher Worker frei ist, ob voll besetzbar" | ✅ Welle E, anonym, 0 Feed-Kosten |

### Die Einschränkung: „-% auf das Konto bzw. nächste Abrechnung"

Der Ursprungsauftrag verlangt den Rabatt **auf der Abrechnung**. Gebaut ist er als
Rabattprozent im Bounty-System — und dort endet er auch:

`getUserDiscount()` wird ausschließlich von Anzeige-Pfaden aufgerufen
(`GET /api/bounties/discount`, Wertbericht, Bounty-Statusseite). Im gesamten Geldpfad —
`invoiceService`, `recurringBillingService`, `paymentService`, `planCatalog` — kommt
`discount` **kein einziges Mal** vor; `createInvoice(pool, {amountCents})` nimmt einen rohen
Betrag und zieht nichts ab.

**Die Plattform zeigt einen Rabatt an und stellt die volle Summe in Rechnung.** Dieselbe
Fehlerklasse wie `deal_success_rate` vor Welle B — diesmal aber mit Geld statt Sichtbarkeit,
und damit die unangenehmere Variante: Ein Kunde, der „6 % Rabatt" liest und eine ungekürzte
Rechnung bekommt, hat recht, wenn er sich beschwert.

Das ist **bewusst nicht in P8 repariert**: Es gehört in die Abrechnungskette, nicht in die
Deal-Verbindlichkeit, und es berührt eine offene Preisfrage (jede Rechnung oder nur der
Jahresvertrag?). Übergeben an
**[P9 Spur A, Welle A4](P9_BOUNTY_MERKLISTE_ENTITLEMENTS.md)** samt Owner-Entscheidung A-E1.

---

## 6. Reihenfolge und Begründung

**A → B → C → D**, E jederzeit unabhängig. — *So gebaut; alle fünf Wellen liegen vor.*

Das Modal (D) zuletzt, weil es die Folge **benennen** muss — und das kann es erst, wenn
B und C sie wirklich erzeugen. Ein Modal, das eine Konsequenz androht, die es nicht gibt,
ist schlimmer als keins: Beim ersten folgenlosen Storno lernt der Nutzer, dass die Warnung
gelogen war.

E ist unabhängig und liefert sofort sichtbaren Nutzen — vorziehbar, wenn schneller Effekt
gewünscht ist.

---

## 7. Regeln, die in jeder Welle gelten

- **Vollsuite vor jedem Commit:** `cd api && node scripts/run-tests.js` — **ohne Pipe**,
  sonst verschluckt die Shell den Exit-Code. Die i18n-Gates allein reichen nicht.
- **Zeit ist `Europe/Berlin`** (`todayDE`), nie roher UTC-Slice — bei Vorlaufberechnung
  ist das ein Off-by-one mit Geldfolge.
- **Neue Cron-Endpunkte** gehören in `docs/SCHEDULER.md`, sonst wird
  `schedulerConsistency.test.js` rot (zu Recht).
- **Neue Doku** muss aus `docs/README.md` verlinkt sein, sonst wird
  `docsConsistency.test.js` rot.
- **Zweisprachigkeit:** Jede neue sichtbare Zeichenkette braucht DE **und** EN mit
  identischen Schlüsseln — Regeln in `docs/features/P6_I18N_UEBERGABE.md`.
- **Kein Storno-Grund als Freitext in Auswertungen.** Freitext ist für Menschen, Enums
  sind für Statistik.

---

## 8. Merksatz aus dem Ist-Stand

Die Storno-**Mechanik** war vollständig und sauber gebaut — inklusive Rollback der
Nebenwirkungen. Trotzdem war das Feature wirkungslos, weil die Kennzahl, die es tragen
sollte, nie geschrieben wurde. **Eine Funktion ist erst fertig, wenn ihre Wirkung
gemessen wird, nicht wenn ihr Code läuft.**
