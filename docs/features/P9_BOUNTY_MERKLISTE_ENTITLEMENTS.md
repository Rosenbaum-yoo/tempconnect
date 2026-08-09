# P9 — Bounty-System, Merkliste, Freischaltung

> **Stand:** 2026-08-07 · Branch `release/enterprise-premium-market-ready`
> **Zweck:** Arbeitsanweisung für die Owner-Abschnitte 2–4. Diese Datei allein genügt, um
> in einem neuen Chat ohne Rückfragen weiterzuarbeiten. Erst lesen, dann die offene Welle.
> **Vorgänger:** [P8 — Deal-Verbindlichkeit](P8_DEAL_VERBINDLICHKEIT.md) (Abschnitt 1, erledigt)

Drei Spuren, die sich nicht gegenseitig blockieren. Sie werden **nicht** parallel gebaut —
eine Spur nach der anderen, weil jede für sich einen geschlossenen Nutzen liefert.

| Spur | Owner-Abschnitt | Kern |
|---|---|---|
| **A** | 2 | Bounty-System plausibel machen, voll verdrahten, zuschaltbar |
| **B** | 3 | Merkliste für Angebote, beidseitig, als Reiter bei „Meine Deals" |
| **C** | 4 | Abo-Features: sofort aktiv nach Zahlung, plattformweit gehärtet |

---

## Spur A — Bounty-System

### A.0 Die Leitfrage

Ein Belohnungssystem, das Prozente anzeigt und nie auszahlt, ist schlimmer als keins: Der
Kunde merkt es beim ersten Rechnungsvergleich, und danach glaubt er auch den ehrlichen Teil
der Plattform nicht mehr. **Die Frage ist nicht „welche Bounties fehlen", sondern „welche
Versprechen hält das System heute wirklich".**

### A.1 Ist-Stand — gemessen am 2026-08-07

15 Bounties in vier Kategorien. Der Katalog ist datengetrieben (`bounties.threshold_type` +
`threshold_value` JSONB) — die Architektur ist gut. Die Wahrheit darunter nicht.

#### Befund 1 — der Rabatt erreicht keine Rechnung (schwer, Geldversprechen)

`getUserDiscount()` wird an **drei** Stellen aufgerufen: dem Anzeige-Endpunkt
`GET /api/bounties/discount`, dem Wertbericht und der Bounty-Statusseite. Im gesamten
Geldpfad — `invoiceService`, `recurringBillingService`, `paymentService`, `planCatalog` —
kommt das Wort `discount` **kein einziges Mal** vor. `createInvoice(pool, {amountCents})`
nimmt einen rohen Betrag entgegen und zieht nichts ab.

Die Plattform zeigt heute „Ihr aktueller Bounty-Rabatt: 6 %", einen Jahresplan-Rechner mit
ausgerechneter Ersparnis und ein Status-Abzeichen mit „max. 25 % Rabatt möglich" — und
stellt die volle Summe in Rechnung. Das ist dieselbe Fehlerklasse wie `deal_success_rate`
in P8, nur mit Geld statt Sichtbarkeit.

#### Befund 2 — mehrere Bedingungen messen den falschen Pfad

Dieselbe Ursache wie beim in P8 reparierten `zero_complaint`: Sie lesen die Alt-Tabelle
`requests`, nicht den heutigen Angebots-/Agreement-Flow.

| Bounty | Bedingung | Quelle | Verdacht |
|---|---|---|---|
| `power_user` | 50 erfolgreiche Matches | `requests.status IN (FINALIZED,COMPLETED)` | zu prüfen |
| `emergency_hero` | 10 Notdienst-Einsätze | `requests.priority = NOTDIENST` | zu prüfen |
| `blitz_responder` | Ø Antwortzeit < 30 Min | `requests.updated_at - created_at` | zu prüfen |
| `top_supplier` | Top 10 % im Leaderboard | `supplier_reputation.reputation_score` | **wird kaum geschrieben** |

`reputation_score` hat dasselbe Problem wie `deal_success_rate` vor P8: Die einzige
Schreibstelle `recomputeReputation` hat keinen produktiven Aufrufer. Das Top-Supplier-Bounty
misst damit eine Rangliste, die nie berechnet wird.

#### Befund 3 — Zeitfenster werden behauptet, aber nicht gemessen

Die Beschreibungen versprechen Zeiträume, die der Code nicht prüft:

- `reliability_seal`: „**6 Monate durchgehend** Ø 4.5+" → geprüft wird der **Gesamtdurchschnitt**
  aller Bewertungen, ohne jedes Zeitfenster.
- `marketplace_active`: „mind. 5 aktive Kapazitäten **pro Monat über 6 Monate**" → gezählt
  werden die **aktuell** aktiven Listings. Wer heute fünf einstellt, hat es sofort.
- `top_percentile_12m`, `avg_reliability_6m`: dasselbe Muster.

Ein Bounty, das „6 Monate Durchhaltevermögen" verspricht und bei einem Nachmittag Arbeit
anspringt, entwertet die ganze Kategorie.

#### Befund 4 — nicht zuschaltbar

Es gibt keine Spalte, die ein Bounty ein- oder ausschaltet. Ein Katalogeintrag ist immer
aktiv, sobald er in der Tabelle steht. Neue Ideen erproben heißt heute: Migration schreiben,
ausrollen, und bei Nichtgefallen wieder eine Migration.

#### Was gut ist und bleibt

Der datengetriebene Katalog, die Tier-Deckelung (`bountyTierService`), das
`replaces`-Muster für Leitern (P8 Welle C hat es generalisiert), die Idempotenz von
`evaluateBounties`, und die Begründungstexte (`note`) samt Status `superseded`.

### A.2 Wellen

#### Welle A1 — Wahrheitsprüfung aller Bedingungen *(zuerst, nicht verhandelbar)*

Jeden der 15 Katalogeinträge gegen den echten Code prüfen: Welchen Pfad liest die Bedingung,
wird dieser Pfad heute geschrieben, und misst sie das, was die Beschreibung verspricht?
Ergebnis ist eine Tabelle mit vier Urteilen je Bounty: *misst richtig* / *falscher Pfad* /
*Zeitfenster fehlt* / *Quelle tot*.

**Gate A1:** Für jedes Bounty steht ein Dateibeleg in der Tabelle. Kein „vermutlich".
Bounties mit toter Quelle werden **deaktiviert, nicht gelöscht** — die Vergabehistorie in
`user_bounties` bleibt erhalten (dasselbe Vorgehen wie bei `zero_complaint` in P8).

### A1 ist erledigt — die Wahrheitstabelle *(2026-08-08)*

Geprüft wurde nicht bei den Bedingungen, sondern bei ihren **Quellen**. Die Frage ist nicht,
ob eine Bedingung richtig rechnet — das tun fast alle —, sondern ob ihre Eingabe je entsteht.

| # | Bounty | Rabatt | Quelle (Dateibeleg) | Urteil |
|---|---|---|---|---|
| 1 | `zuverlaessiger_partner` | 3 % | `dealReliabilityService.ladeZuverlaessigkeitsStreak` ← `offer_cancellations` | **misst richtig** (P8) |
| 2 | `zero_complaint` | 3 % | dieselbe Quelle, Fenster 365 Tage | **misst richtig** (P8) |
| 3 | `reliability_seal` | 3 % | `bountyService.js:145` `FROM ratings WHERE rated_id` — **ohne Zeitfilter** | Zeitfenster fehlt |
| 4 | `communication_pro` | 2 % | `bountyService.js:145`, dieselbe Abfrage | misst richtig (kein Zeitversprechen) |
| 5 | `top_supplier` | 5 % | `bountyService.js:198` ← `supplier_reputation.reputation_score` | **Quelle tot** |
| 6 | `power_user` | 2 % | `bountyService.js:156` `FROM requests` — Angebotskanal fehlt | falscher Pfad |
| 7 | `blitz_responder` | 3 % | `bountyService.js:168` `AVG(updated_at - created_at)` über **alle** Anfragen | misst falsch |
| 8 | `emergency_hero` | 2 % | `bountyService.js:160` `priority='NOTDIENST' AND status IN (FINALIZED,COMPLETED)` | falscher Pfad |
| 9 | `marketplace_active` | 2 % | `bountyService.js:181` — aktueller Bestand statt 6 Monate | Zeitfenster fehlt |
| 10 | `loyalty_1y` | 5 % | `data.firstSubDate` ← `subscriptions` | misst richtig |
| 11 | `loyalty_2y` | 8 % | dieselbe Quelle, löst `loyalty_1y` ab | misst richtig |
| 12 | `founding_member` | 3 % | `users.created_at` gegen Stichtag 2027-01-01 | misst richtig |
| 13 | `network_builder` | 5 % | `referralProgramService.js:335` zählt `status='active'` | **Quelle tot** (Statusdrift) |
| 14 | `rating_champion` | 2 % | `ratings WHERE rater_id` | misst richtig |
| 15 | `onboarding_mentor` | 2 % | `mentoring_sessions`, Route `routes/mentoring.js` | Schwelle falsch |

**Empirische Gegenprobe.** In der Entwicklungsdatenbank haben genau die fünf wiederkehrenden,
nie verdienten Bounties **keine einzige** `user_bounties`-Zeile, während alle anderen sieben haben.
Das war kein Zufall, sondern der Beweis für Befund 6 weiter unten.

#### Die zwei toten Quellen im Einzelnen

**`top_supplier` ist rechnerisch unerreichbar.** Die Bedingung liest `supplier_reputation.reputation_score`.
Geschrieben wird diese Spalte nur von `reputationService.recomputeReputation` (Zeile 377/497) —
gerufen ausschließlich von `batchRecompute` (Zeile 554), und **das hat außerhalb der Tests keinen
einzigen Aufrufer**: keine Route, kein Cron, kein Job. Gemessen: 5 Zeilen in `supplier_reputation`,
davon 0 mit `reputation_score`, `grade` überall `UNRATED`. In `gatherUserData` ist damit der
Perzentil-Nenner (`WHERE grade != 'UNRATED'`) gleich 0, der Zweig fällt auf `percentileRank = 100`,
und `pct <= 10` ist für jeden Nutzer dauerhaft falsch. Ein mit 5 % beworbenes Bounty, das niemand
je bekommen kann. → **abgeschaltet** (Migration 166), nicht gelöscht.

Nebenbefund derselben Spur: `assignmentService.js:277` schreibt bei jedem Einsatz-Abschluss in
`supplier_reputation` — aber in die Spalten `supplier_org_id`/`score`, **die es in der Tabelle nicht
gibt**. Der Aufruf steckt in `try/catch` mit dem Kommentar „should not block completion". Dieser
Schreibvorgang ist folglich noch nie gelungen. Aufräumen gehört in A3.

**`network_builder` zählte einen Status, den kein Codepfad je gesetzt hat.** `getActiveReferralCount`
zählt `referrals WHERE status = 'active'`. Der Lebenszyklus schreibt aber `pending` → `registered`,
und der Belohnungsschritt setzte `'qualified'` — einen Wert, den `referrals_status_check` gar nicht
erlaubt (zulässig: `pending, registered, survey_done, active, expired`). An der echten Datenbank
nachgestellt: Fehler 23514.

Die Folge war schlimmer als ein nicht vergebenes Bounty. In `qualifyReferralReward` wird **zuerst**
die Gutschrift in `referral_rewards` gebucht und **danach** `reward_applied = TRUE` gesetzt — beides
ohne Transaktion. Der zweite Schritt brach immer ab, also blieb die Wiederholungssperre aus Schritt 1
(`reward_applied = FALSE`) dauerhaft offen: **derselbe geworbene Kunde hätte bis zu 6 Gutschriften
statt einer ausgelöst** (begrenzt nur durch 1/Monat und 6 gesamt). Der Aufruf hängt live im
Zahlungsfluss (`routes/payment.js:632`) und war dort in ein stummes `catch {}` gewickelt — deshalb
hat es nie jemand gesehen. Vor dem Marktstart gefunden, nicht danach.

#### Was A1 geliefert hat

| # | Befund | Behandlung |
|---|---|---|
| 1 | `top_supplier` unerreichbar | abgeschaltet mit Begründung (Mig 166) |
| 2 | Referral-Status schreibt illegalen Wert | schreibt jetzt `'active'` — den Wert, den die DB erlaubt **und** der Zähler sucht |
| 3 | Gutschrift ohne Sperrvermerk möglich | beide Schreibvorgänge in `withTransaction` |
| 4 | stummes `catch {}` im Zahlungsfluss | loggt jetzt, blockiert die Zahlung weiterhin nicht |
| 5 | `onboarding_mentor`: 3 beworben, 5 verlangt | Code liest `min_mentored` aus dem Katalog |
| 6 | wiederkehrende Bounties ohne Fortschritt | Upsert statt reinem UPDATE — 85 % zeigen jetzt 85 %, nicht 0 % |
| 7 | Katalog ohne Aus-Schalter | `bounties.is_active` + `inactive_reason` (Mig 166) |

Befund 6 im Klartext: für ein wiederkehrendes Bounty lief bei Nichterfüllung ein reines `UPDATE`.
Das trifft nichts, solange keine Zeile existiert — und eine Zeile entstand nur beim ersten Verdienen.
Wer ein solches Bounty noch nie erreicht hatte, sah dauerhaft „0 %", auch kurz vor dem Ziel.

Belege: `api/test/bountyKatalogWahrheit.test.js` (9 Prüfungen), Migration
`sql/migrations/166_bounty_schaltbarkeit.sql`.

**Gate A1 erfüllt.** Jede Zeile trägt einen Dateibeleg; keine Einstufung beruht auf Vermutung.
Die beiden Urteile „Quelle tot" wurden an der Datenbank nachgemessen, nicht aus dem Code geschlossen.

**Was A1 bewusst offen lässt:** die Urteile *falscher Pfad* (6, 7, 8) und *Zeitfenster fehlt* (3, 9)
sind Fachentscheidungen über die Messregel, keine Defekte im engeren Sinn — sie gehören nach A3.

#### Welle A2 — Zuschaltbarkeit

> **Teilweise vorweggenommen durch A1.** Der Gate von A1 verlangte „deaktivieren, nicht löschen" —
> das war ohne Schalter unmöglich. Migration 166 liefert daher bereits `bounties.is_active`
> (Default TRUE) und `inactive_reason`; `getBountyCatalog`, `getUserBounties` und `getUserDiscount`
> filtern darauf. **Offen für A2:** `available_from`/`available_until` für Kampagnen-Bounties,
> der Entzug laufender Vergaben beim Abschalten, und die Bedienoberfläche im Staff-Center.

`bounties.is_active` (Default TRUE) plus `available_from`/`available_until` für
Kampagnen-Bounties. `getBountyCatalog` filtert; `evaluateBounties` vergibt inaktive nicht
mehr und **entzieht** sie bei wiederkehrenden.

**Gate A2:** Ein Bounty abzuschalten ist ein `UPDATE` — kein Deploy. Ein abgeschaltetes
Bounty verschwindet aus der Vergabe, bleibt aber in der Historie sichtbar und erklärt sich
in der Oberfläche („nicht mehr verfügbar"), statt kommentarlos zu fehlen.

### A2 ist erledigt *(2026-08-08)*

Ein Bounty zu schalten ist jetzt ein Klick im **Staff Control Center → Rabatt-Katalog**, kein Deploy.

**Zwei Hebel mit bewusst verschiedener Wirkung.** Das war die eigentliche Entwurfsfrage:

| Hebel | Wirkung |
|---|---|
| **Not-Aus** (`is_active`) | beendet sofort alles — keine Vergabe, kein Rabatt, **laufende Vergaben werden entzogen** |
| **Zeitraum** (`available_from`/`until`, Mig 167) | steuert nur, **wann** man es verdienen kann. Wer es im Fenster verdient hat, behält es |

Die Trennung ist kein Detail: einem zahlenden Kunden einen bereits gewährten Rabatt still
wegzunehmen, weil eine Aktion ausgelaufen ist, wäre ein Support-Vorfall. Wer eine Aktion wirklich
sofort beenden muss, hat den Not-Aus — und der sagt genau das, was er tut. Beides steht
ausgeschrieben in der Oberfläche, samt der Zahl der betroffenen Kunden **vor** dem Klick.

**Der Entzug hängt an der Datenbank, nicht am Dienst** (Mig 168, Trigger). Gate A2 verlangt
„Abschalten ist ein `UPDATE` — kein Deploy". Genau dann kann das Abschalten auch aus Hand-SQL,
einer Migration oder einem künftigen zweiten Bedienweg kommen. Ein Entzug, der nur im
Anwendungsdienst steht, greift dort nicht. Am echten Bestand nachgemessen: 3 laufende Vergaben →
0 beim Abschalten, und beim Wiedereinschalten bleibt es bei 0 — zurückgegeben wird nichts, das
entscheidet die Bedingung bei der nächsten Auswertung.

#### Drei Defekte, die A2 nebenbei gefunden hat

| Fund | Warum es zählt |
|---|---|
| `bountyTierService.js:103` zählt `user_bounties` **ohne Join** auf `bounties` | Eine verwaiste Vergabe zählt weiter für die Stufen-Beförderung — und die Stufe hebt die Rabatt-**Obergrenze**. Ein abgeschaltetes Bounty hätte also indirekt weiter Geld gekostet. |
| `dealCommitmentService.js:133` filtert nicht auf `b.is_active` | Der Storno-Dialog drohte mit einem Rabatt, den es seit Mig 166 nicht mehr gibt. Eine Warnung, die übertreibt, verliert beim zweiten Mal ihre Wirkung. (Eigener P8-Code, durch Mig 166 veraltet.) |
| Gate-Verstoß in meiner eigenen A1-Arbeit | Mein A1-Filter ließ ein **verdientes** Abzeichen kommentarlos verschwinden, sobald das Bounty abgeschaltet wurde. Gate A2 verlangt wörtlich, dass es „in der Historie sichtbar bleibt und sich erklärt". Korrigiert: neue Status `retired` und `unavailable`, beide zweisprachig. |

**Kein Cron für `evaluateBounties`** — bestätigt, nicht vermutet: einziger Aufrufer ist
`GET /api/bounties/me`. Deshalb wirkt der Zeitraum **lesend** (jede Anzeige und jede
Rabattsumme prüft ihn), statt auf eine Neubewertung zu warten, die nie käme.

**Gate A2 erfüllt.** Abschalten ist ein `UPDATE`; ein abgeschaltetes Bounty verschwindet aus der
Vergabe, bleibt in der Historie sichtbar und erklärt sich in der Oberfläche.

#### Die Fehlplatzierung — und was dagegen jetzt greift

A2 wurde zuerst im **Owner Control Center** gebaut. Die Ableitung „Rabatt = Preishebel =
Owner-Schicht" wirkte aus dem Code plausibel; das Produktmodell des Owners sagt etwas anderes:
Staff Control Center = Verwaltung durch das Team, OCC = **kundenspezifischer** Aufwand, Support
Center = Anfragen von außen und zwischen Kunden. Ein plattformweiter Katalog ist Team-Verwaltung.

Die Ursache war keine Unachtsamkeit, sondern eine Lücke: `CLAUDE.md` verlangte, dass die Flächen
getrennt bleiben, sagte aber nirgends, **was** in welche gehört. Es gab nichts, wogegen die
Ableitung prüfbar gewesen wäre. Geschlossen durch:

- `docs/FLAECHEN.md` — Zuständigkeiten, Entscheidungsfrage, Registry aller Module, Namenskollisionen
- Dieselbe Regel in `CLAUDE.md` (Kritische Produkt-Abgrenzung) und `SKILL.md`
- `api/test/flaechenZuordnung.test.js` — jedes Modulverzeichnis muss in der Registry stehen, sonst rot.
  Der Test kann die richtige Antwort nicht kennen, aber er verhindert, dass die Frage
  stillschweigend übergangen wird. Gegenprobe gelaufen: ein undokumentiertes Modul macht ihn rot.

Umgezogen statt doppelt gebaut. Dienst und Datenbank waren platzierungsneutral — nur Route,
Modul und Navigation hingen an der Fläche.

**Belege:** `api/test/staffBountyKatalog.test.js` (20 Prüfungen, inkl. struktureller Zusicherung,
dass Step-up und Begründungspflicht **vor** dem Handler hängen), `api/test/flaechenZuordnung.test.js`,
Migrationen 167 und 168.

**Offen aus A2:** eine Bedienoberfläche zum **Anlegen** neuer Bounties gibt es bewusst nicht —
jede Bedingung braucht Auswertungscode. Was schaltbar ist, ist Konfiguration: an/aus, Zeitraum,
Rabattsatz.

#### Adversarische Gegenprüfung — 12 bestätigte Befunde, alle geschlossen

Nach dem Bau lief eine Prüfung mit fünf unabhängigen Blickwinkeln (Geld, Datenbank,
Zugriff, Semantik, Verdrahtung); jeder Befund wurde anschließend von einem weiteren
Durchgang zu **widerlegen** versucht. 20 Befunde, 12 haben die Widerlegung überstanden.
**Acht davon gingen auf die A2-Arbeit selbst zurück.**

Der schwerste ist der lehrreichste — und war eine **Folge des Triggers**:

> Der Trigger entzieht die Vergabe. Die daraus abgeleitete **Stufe** (Bronze … Diamant) liegt
> aber materialisiert in `user_bounty_tiers`, und die Stufe bestimmt die Rabatt-**Obergrenze**.
> Bis A2 hielt das nur zufällig: eine Vergabe wurde ausschließlich innerhalb von
> `evaluateBounties` entzogen, und im selben Request folgte immer die Stufen-Neubewertung.
> Der Trigger ist der **erste Pfad, der außerhalb dieses Requests entzieht** — und hat die
> stillschweigende Kopplung gebrochen. Folge: ein Kunde behält die zu hohe Obergrenze, bis er
> zufällig seine Bounty-Seite öffnet. Behoben, indem der Schaltvorgang die Stufen der
> Betroffenen nachzieht; die Halter werden **vor** dem Schreiben gelesen, weil der Trigger die
> Information im selben Moment löscht.

| # | Befund | Behandlung |
|---|---|---|
| 1 | Stufe/Obergrenze blieb nach dem Not-Aus stehen | Schaltvorgang zieht die Stufen der Betroffenen nach, Zahl steht im Audit |
| 2 | Unmögliche Daten (`2026-13-01`) passierten die Prüfung und **löschten die Grenze still** — aus dem Tippfehler wurde „unbefristet" bei Antwort 200 | Kalender-Prüfung mit Rückvergleich statt bloßer Formprüfung |
| 3 | Teil-Update des Zeitraums lief in den DB-CHECK → 500 | Prüfung gegen den **Endstand**: Bestand wird vor der Prüfung geladen |
| 4 | `discount_pct: null` setzte den Rabatt still auf 0 % (`Number(null) === 0`) | Typprüfung wie bei `is_active`; null/bool/Array werden abgewiesen |
| 5 | Jede Änderung an einem aktiven Bounty wurde als „eingeschaltet" protokolliert | Aktion aus der **tatsächlichen** Änderung abgeleitet, nicht aus dem Vorhandensein des Feldes |
| 6 | Rabattänderung an einem abgeschalteten Bounty überschrieb den Abschaltgrund | Begründung wird nur beim echten Abschalten übernommen |
| 7 | Oberfläche sendete auch unveränderte Felder | Nur geänderte Felder gehen raus |
| 8 | Storno-Dialog drohte mit einem Rabatt außerhalb des Zeitraums | Zeitraum-Filter ergänzt |
| 9 | `total_discount_pct` (alte Obergrenze) neben `max_discount_pct` (neue) in derselben Antwort — Balken mit 126 % Breite | Reihenfolge gedreht: erst Stufe, dann Rabatt |
| 10 | Downgrade-Warnung „Sie verlieren X % Rabatt" las ein Feld, das der Endpunkt nicht liefert — erschien **nie** | Feldname korrigiert |
| 11 | Öffentliches Firmenprofil zeigte die Abzeichen des **Betrachters** als die der fremden Firma | Anzeige auf fremden Profilen entfernt; ein öffentlicher Endpunkt ist eine Produktentscheidung, keine Fußnote |
| 12 | `scc-pill--ok` / `.superseded .bounty-progress` existierten nicht | vorhandene Klassen bzw. Regel ergänzt |

Befunde 9–12 waren **nicht** von A2 verursacht, sondern lagen schon vorher — A2 hat sie
sichtbar gemacht. Sie sind trotzdem geschlossen, weil sie in denselben Dateien liegen und
jeweils eine Zeile kosten.

**Bekannter Flatterfehler (nicht von A2):** `test/me.route.coverage.test.js` bringt den
Testläufer unter Windows gelegentlich mit `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`
(libuv, `src/win/async.c`) zum Absturz — ein Teardown-Rennen. Zweimal hintereinander gemessen:
Lauf 1 Absturz, Lauf 2 68/68 grün, unveränderter Code. Betrifft `/me`-Routen, nichts aus P9.

#### Welle A3 — Zeitfenster ehrlich machen

Für jede Bedingung, die einen Zeitraum verspricht, entweder den Zeitraum **messen** oder die
Beschreibung **korrigieren**. Beides ist zulässig; Schweigen ist es nicht.

**Gate A3:** Kein Bounty-Text behauptet einen Zeitraum, den die Bedingung nicht prüft. Ein
Test hält das fest (Beschreibung ↔ `threshold_value` ↔ ausgewertete Felder).

#### Welle A4 — Der Rabatt erreicht die Rechnung

Der Kern von „voll verdrahten". `createInvoice` bekommt den Rabatt als eigenes Feld
(Bruttobetrag, Rabattprozent, Rabattbetrag, Nettobetrag) — **nicht** als stillen Abzug am
`amountCents`, sonst ist später nicht mehr nachvollziehbar, warum eine Rechnung niedriger
war. Der Rabattsatz wird zum Rechnungszeitpunkt **eingefroren** (dasselbe Prinzip wie
`quote_snapshot`): Wer im Mai 6 % hatte, behält sie auf der Mai-Rechnung, auch wenn das
Bounty im Juni entfällt.

**Gate A4:** Eine Rechnung weist den Rabatt getrennt aus. Ein späterer Bounty-Verlust ändert
keine bereits gestellte Rechnung. Rückwärtsprobe: ohne aktive Bounties ist der Betrag
byte-identisch zu heute.

> **A-E1 — entschieden am 2026-08-08:** ✅ **Monatlich.** Der Rabatt gilt auf **jede**
> Rechnung, nicht nur auf den Jahresvertrag. Der Jahresplan-Rechner auf der Bounty-Seite
> bleibt als Zusatzargument bestehen, ist aber nicht mehr die einzige Wirkstelle.

#### Welle A5 — Selbstlaufende Anstupser

Benachrichtigungen zum Bounty-Status über den bestehenden `dispatch()`-Pfad und die
`notificationMatrix` — kein neuer Kanal. Drei Anlässe, mehr nicht:

1. **Kurz davor:** „Noch 2 Abschlüsse bis *Zuverlässiger Partner* — 3 % Rabatt."
2. **Verdient:** „*Zuverlässiger Partner* freigeschaltet. Ab der nächsten Rechnung 3 %."
3. **Entfallen:** „*Zuverlässiger Partner* entfallen durch den Storno vom 12.08. Ab 10.11.
   wieder verfügbar." (Text kommt bereits aus P8 Welle C.)

**Gate A5:** Jeder neue Typ steht im `notifications.type`-CHECK **und** in der Surface-Map
(sonst scheitert `dispatch()` still — die Lehre aus Mig 139). Höchstens eine Anstupser-Mail
pro Nutzer und Woche; die In-App-Benachrichtigung darf häufiger sein. Idempotent über einen
Schlüssel pro (Nutzer, Bounty, Anlass, Woche).

> **A-E2 — entschieden am 2026-08-08:** ✅ **Auch per E-Mail.** Damit gilt zwingend:
> `notification_preferences` wird respektiert (`isEmailPreferred`), jede Mail trägt einen
> Abmeldeweg, und das Wochenlimit greift für den Mailkanal. „Kurz davor" bleibt nach meiner
> Empfehlung In-App-only — eine Mail für „noch 2 Deals" ist der Anlass, mit dem man sich
> Abmeldungen einhandelt. Falls du sie doch als Mail willst, sag Bescheid.

### A.3 Reihenfolge

**A1 → A2 → A3 → A4 → A5.** A1 zuerst, weil jede spätere Welle sonst auf einer Bedingung
aufbaut, die vielleicht nichts misst. A4 vor A5, weil ein Anstupser, der einen Rabatt
verspricht, den es nicht gibt, genau der Fehler ist, den P8 Leitentscheidung 3.4 beschreibt.

---

## Spur B — Merkliste

### B.0 Die Leitfrage

Ein Merken-Knopf ohne Liste ist ein Knopf, der nichts tut. Er erzeugt heute einen
Datensatz, den niemand je wiedersieht.

### B.1 Ist-Stand — gemessen am 2026-08-07

- **Der Knopf existiert** (`ce-card__save` im Feed) und schickt
  `POST /capacity-exchange/entries/:id/interactions` mit `interaction_type: "save"`.
- **Er ist einmalig.** Nach dem Klick wird er deaktiviert und umbeschriftet. Es gibt kein
  „nicht mehr merken".
- **Es gibt keine Liste.** Kein Endpunkt, keine Seite, kein Reiter zeigt gemerkte Angebote.
- **Eine echte Merkliste existiert bereits — für etwas anderes:**
  `POST/DELETE /profile-visibility/:orgId/favorite` + `GET /profile-visibility/favorites`
  merkt **Firmenprofile** (PLUS/PRO/INDIVIDUELL). Das Muster ist gut und wiederverwendbar,
  der Gegenstand ist ein anderer.

### B.2 Wellen

#### Welle B1 — Der Knopf wird ein Schalter

`interaction_type: "save"` bleibt der Speicherweg (keine Parallelstruktur), bekommt aber
einen Gegenweg: `DELETE`. Der Knopf zeigt den Zustand statt ihn zu verbrauchen, und der
Feed liefert beim Rendern mit, was bereits gemerkt ist — **in der bestehenden Batch-Abfrage**,
nicht als Abfrage pro Karte (dieselbe Regel wie P8 Gate E).

**Gate B1:** Zweimal klicken hebt sich auf. Ein Neuladen des Feeds zeigt den Zustand
korrekt. 50 Karten erzeugen keine zusätzliche Abfrage.

#### Welle B2 — Die Liste

Endpunkt `GET /marketplace/watchlist` liefert die gemerkten Einträge **beider Richtungen**:
Ein Unternehmen sieht gemerkte Kapazitäten, eine Zeitarbeitsfirma gemerkte Bedarfe. Die
Gegenseitenlogik gilt wie im Feed.

Angereichert mit dem, was eine Merkliste erst nützlich macht: Ist der Eintrag noch offen,
schon vergeben, abgelaufen? Ein gemerkter Bedarf, der längst besetzt ist, gehört sichtbar
als solcher markiert — nicht stillschweigend weiter angezeigt.

**Gate B2:** Ein gemerkter, inzwischen geschlossener Eintrag wird als geschlossen angezeigt
und nicht ausgeblendet — sonst wirkt die Liste kaputt. Org-Grenze: niemand sieht fremde
Merklisten.

#### Welle B3 — Der Reiter

Neuer Reiter „Merkliste" bei **Meine Deals** (`deal_management.html`), mit Quicklink auf die
Marktplatz-Seite und Deep-Link je Eintrag auf das konkrete Angebot (nicht auf die Übersicht
— Regel aus `CLAUDE.md`: keine Sackgassen). Zähler am Reiter.

**Gate B3:** Der Reiter ist für beide Marktseiten sichtbar und sinnvoll beschriftet.
Leerzustand erklärt, wie man etwas merkt, statt nur „keine Einträge" zu zeigen.
DE + EN, gleiche Schlüssel.

### B.3 Reihenfolge

**B1 → B2 → B3.** Der Schalter zuerst, weil eine Liste, die man nicht leeren kann, den
Nutzer schneller verärgert als eine fehlende Liste.

---

## Spur C — Freischaltung und Abo-Features

### C.0 Die Leitfrage

Wer bezahlt hat, muss die Funktion haben. Alles andere ist ein Supportfall — und beim
ersten Kunden ein Vertrauensschaden.

### C.1 Ist-Stand — gemessen am 2026-08-07

Der konkrete Anlass (Preisrahmen für ein bestimmtes Konto gesperrt) hat **drei mögliche
Ursachen**, die alle gleichzeitig greifen müssen, damit die Fläche freigeht:

1. **Org-Typ:** `enterpriseSurfaceAccessService` setzt `rate_cards: surface("org_locked")`
   für Agenturen. Rate Cards sind fachlich käuferseitig.
2. **Plan:** `planFeatures.rate_card_management: ["PRO", INDIVIDUELL]` — unter PRO
   `plan_locked`.
3. **Rolle:** Schreibrechte nur mit `rate_card.create`/`rate_card.update`.

### C1 ist erledigt — und die Antwort war keine der drei *(2026-08-08)*

> **Korrektur an eigener Arbeit:** Die erste Fassung dieses Abschnitts behauptete, das Konto
> `elmiraaaa@gmail.co` existiere lokal nicht. Falsch — meine Abfrage lief in einen
> SQL-Fehler (Tabelle heißt `org_memberships`, nicht `org_members`), dessen Ausgabe ich nach
> `/dev/null` geschickt hatte. Die leere Antwort habe ich als „gibt es nicht" gelesen.
> Genau der stille Fehlschlag, gegen den dieses ganze Programm anarbeitet.

**Am echten Konto gemessen:** `company` / Rolle `owner` / Org-Typ `company` / Plan
`INDIVIDUELL` / Pilot aktiv / nicht gesperrt. **Alle drei Bedingungen sind erfüllt**, und das
Backend gibt entsprechend frei:

- `resolveEnterpriseSurfaceAccess(...)` → `rate_cards: { mode: "full", canRead, canWrite, canPublish, canExport }`
- `entitlementService.canUseFeature(org, "rate_card_management")` → `{ allowed: true, code: "OK" }`

**Gesperrt hat ausschließlich das Frontend — und zwar für alle.**

`rate-cards.html` hat die Zugriffsregel neben dem Server nachgebaut
(`resolveRateCardAccess`) und dafür `PlanFeatures.hasFeature()` benutzt. Diese Funktion liest
aus einer Matrix, die erst `PlanFeatures.load()` über `/api/plan-features` füllt. **Die Seite
ruft `load()` nie auf** und bindet auch `slaGuard.js` nicht ein — den einzigen
seitenübergreifenden Aufrufer. Die Matrix blieb dauerhaft leer:

```js
var allowed = planFeatures[featureKey];          // undefined
if (!allowed || !Array.isArray(allowed)) return false;   // → immer false
```

→ `planAllowed = false` → `mode: 'plan_locked'` → `init()` bricht bei
`if (!rateCardAccess.canRead) return;` ab, bevor irgendetwas geladen wird.

**Die Preisrahmen-Seite war für jeden Nutzer auf jedem Plan gesperrt.** Kein Konto-Problem —
eine Seite, die nie funktioniert hat. `hasFeature` kann „nicht erlaubt" nicht von „noch nicht
geladen" unterscheiden; das Fehlschlagen nach *gesperrt* ist sicherheitstechnisch die
richtige Richtung und fachlich hier die falsche.

**Behoben:** Die Seite liest jetzt `me.surface_access.rate_cards` — dieselbe Wahrheit, die
auch die Backend-Guards benutzen — und bildet alle fünf Modi ab. Der Ersatzweg für alte
Sitzungen kommt bewusst **ohne** `hasFeature` aus. Test: `api/test/rateCardAccessGate.test.js`
(7), der auch verhindert, dass die kaputte Ableitung zurückkommt.

**Gate C1 erfüllt** — mit einer Verschiebung: Es war nicht „korrekt gesperrt, nur zu leise",
sondern schlicht falsch gesperrt.

> **Damit wird Welle C3 dringender als geplant.** Wenn eine Fläche die Zugriffsregel
> danebengestellt nachbaut, tun es andere vermutlich auch. C3 sucht gezielt nach weiteren
> Seiten mit eigener Ableitung statt `surface_access` — und nach jedem weiteren
> `hasFeature`-Aufruf ohne vorheriges `load()`.

### C.2 Wellen

#### Welle C1 — Der konkrete Fall

Feststellen, welche der drei Bedingungen greift, und ob das **richtig** ist. Ergebnis ist
entweder „korrekt gesperrt, und die Oberfläche sagt es zu leise" oder „falsch gesperrt".

**Gate C1:** Der Nutzer sieht **warum** eine Fläche gesperrt ist und was er dagegen tun kann
— nicht nur, dass sie gesperrt ist. Ein `org_locked` braucht einen anderen Text als ein
`plan_locked` mit Upgrade-Pfad.

#### Welle C2 — Freischaltung nach Zahlung

Heute setzt `applyApprovedChange` den Plan — ausgelöst von einer **Staff-Aktion**. Der
Stripe-Webhook aktiviert bei INDIVIDUELL über `handleIndividuellActivation`. Zu klären ist,
ob eine bezahlte Standard-Buchung ohne Staff-Zutun sofort greift.

**Gate C2:** Zwischen bestätigter Zahlung und nutzbarer Funktion liegt keine manuelle
Handlung — es sei denn, der Owner will sie ausdrücklich (siehe C-E1). Der Betreiber-
Kill-Switch (`access_suspended_at`) bleibt in jedem Fall wirksam; er wurde am 2026-06-16
eigens dafür eingebaut.

> **Offene Owner-Entscheidung C-E1 — die eine, die wirklich zählt:**
> **Automatisch nach Zahlung** oder **erst nach Freigabe im Staff Center?**
>
> Meine Empfehlung: **automatisch, mit Ausnahmen.** Standardpläne (BASIS/PLUS/PRO) schalten
> sich nach bestätigter Zahlung selbst frei — dort ist der Preis fix und es gibt nichts zu
> verhandeln. `INDIVIDUELL` und Pilotzugänge bleiben staff-gebunden, weil dort Preis,
> Laufzeit und Funktionsumfang ausgehandelt werden und ein Automatismus echten Schaden
> anrichten könnte. Der Kill-Switch überstimmt beides.
>
> Begründung: Eine manuelle Freigabe für einen 150-€-Standardplan kostet dich pro Kunde
> Zeit und den Kunden Geduld — und sie schützt vor nichts, was der Kill-Switch nicht
> ohnehin abdeckt.

#### Welle C3 — Plattformweite Härtung

Alle Feature-Gates einmal systematisch durchgehen: Sperrt jede Fläche aus dem **richtigen**
Grund, und stimmt das Frontend-Lock mit dem Backend-Gate überein? Grundlage ist die
vorhandene `visibilityMatrix` und `entitlementRouteGates.test.js`.

**Gate C3:** Keine Fläche ist sichtbar, die beim Klick 403 liefert; keine ist gesperrt, für
die der Kunde bezahlt hat. Beides ist heute nur teilweise getestet.

### C.3 Reihenfolge

**C1 → C2 → C3.** Der konkrete Fall zuerst, weil er zeigt, ob das Problem in der Regel oder
in ihrer Anwendung liegt.

---

## Regeln, die in jeder Welle gelten

Übernommen aus P8, weil sie sich bewährt haben:

- **Vollsuite vor jedem Commit:** `cd api && node scripts/run-tests.js` — **ohne Pipe**.
- **Erst suchen, dann bauen.** Jede Lückenbehauptung wird am Code verifiziert. Audit-Notizen
  überschätzen Lücken systematisch — und meine eigenen Behauptungen genauso.
- **Schreibpfad prüfen, nicht nur Lesepfad.** Bei jeder Bedingung über einen Status oder eine
  Kennzahl: Welcher Flow füllt sie? Ein `grep` nach dem Literalwert findet parametrisierte
  Statements nicht.
- **Neue Cron-Endpunkte** gehören in `docs/SCHEDULER.md`.
- **Neue Doku** muss aus `docs/README.md` verlinkt sein.
- **Zweisprachigkeit:** Jede sichtbare Zeichenkette DE **und** EN mit identischen Schlüsseln.
- **Kein toter Pfad.** Ein Knopf, der nichts auslöst, oder eine Zahl, die nirgends ankommt,
  gilt als Defekt — nicht als „später".
- **Fallstricke für UI-Tests** stehen in `docs/NAECHSTE-SCHRITTE.md` (Cookie-Banner,
  `networkidle`, Sprache, Deal-Aufbau über `accept-deal`).

---

## Offene Owner-Entscheidungen auf einen Blick

| # | Spur | Frage | Stand |
|---|---|---|---|
| **A-E1** | A | Rabatt auf jede Rechnung oder nur Jahresvertrag? | ✅ **monatlich, jede Rechnung** (2026-08-08) |
| **A-E2** | A | Anstupser auch per E-Mail? | ✅ **ja** (2026-08-08) — „kurz davor" bleibt In-App-only, sofern nicht widersprochen |
| **C-E1** | C | Freischaltung automatisch nach Zahlung oder per Staff? | ⏳ **vorläufig: automatisch für BASIS/PLUS/PRO, Staff für INDIVIDUELL/Pilot** — als Empfehlung umgesetzt, Owner-Bestätigung steht aus |
| — | C | Wo lebt das Konto `elmiraaaa@…`? | ✅ erledigt — lokal vorhanden, C1 abgeschlossen |
