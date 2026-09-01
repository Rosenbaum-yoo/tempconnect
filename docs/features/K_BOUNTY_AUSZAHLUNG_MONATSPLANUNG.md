# Welle K — Bounty-Auszahlung, Werbe-Cashback, Monatsplanung

> **Status (2026-08-31): K0 ✅ · K4 ✅ · K1 ✅ · K2 ✅ vollständig · K3 offen.**
> Alle Owner-Entscheidungen getroffen (2026-08-27).
> Owner-Abschnitte **12** und **13**, dazu zwei Punkte aus dem Betrieb.
>
> Vorgänger: [`I_AUDIT_ZUWEISUNG_SUPPORT.md`](I_AUDIT_ZUWEISUNG_SUPPORT.md) (Welle I),
> [`J_LIVE_BELEGSCHAFT_MARKTPLATZ.md`](J_LIVE_BELEGSCHAFT_MARKTPLATZ.md) (Welle J).

---

## 0. Owner-Vorgaben und Entscheidungen

**Abschnitt 12 — Bounty-Verwaltung:**

> „Bounty Verwaltung mit ins Staff Center damit man die Prozente auszahlen kann
> mit der Abrechnung auf nächsten Monat. Das muss automatisch passieren, aber es
> soll trotzdem einen Punkt geben wo man eingreifen kann falls etwas nicht läuft.
> Genauso mit der Pilotkunden Verlängerung wenn Pilotkunden einen regulären
> Kunden bringen sollen sie einen weiteren Monat Pilot sein können."

**Abschnitt 13 — Monatsplanung:**

> „Monatsplanung für Mitarbeiter, welche sich zunächst aus Live Belegschaft und
> Marktplatz ergibt. Das muss wirklich hart laufen und extrem perfekt ausgebaut
> werden."

**Aus dem Betrieb:**

> „Fehler beim Laden des Personals" / 500 im Kapazitäts-Feed. Dazu: *„können wir
> bei neuem Fehler abfangen und trotzdem Feed anzeigen — dauerhaft eine Kopie der
> aktuellen letzten Liste, die gesucht wurde."*

### Die Entscheidungen (2026-08-27)

| Frage | Entscheid |
|---|---|
| **Werbeprämie** | Kein eigener „Pilot-Verlängerungs"-Mechanismus, sondern ein **100 %-Cashback-Bounty**: die **nächste Rechnung ist frei** (keine Rückerstattung) |
| **Bedingung** | Der Geworbene muss **30 Tage** Bestand haben |
| **Deckel** | höchstens **3 Monate** insgesamt |
| **Der Geworbene** | bekommt **nichts extra** — nur die üblichen Bounties. Sein Pilotmonat ist die Prämie, die er ohnehin hat |
| **Bounty-Eingriff** | nach oben erlaubt, aber **strukturell begrenzt** — kein Vier-Augen-Prinzip möglich (siehe unten) |
| **Monatsplanung** | **beide planen**, ohne Pflicht-Hin-und-Her; Konflikte werden **gezeigt**, nie zum Abstimmen gezwungen |
| **Feed** | Kopie der letzten guten Liste, **in derselben Datenbank** — keine Mehr-Server-Hochverfügbarkeit |

### Die Feststellung, die alles andere prägt

**Es gibt keine zweite Staff-Rolle. Der Owner ist das Staff — und Claude faktisch
auch.** Vollständig in [`CLAUDE.md`](../../CLAUDE.md), Abschnitt *„Das Team ist eine
Person"*, und in [`FLAECHEN.md`](../FLAECHEN.md).

Das hat meinen ersten Entwurf des Eingriffs erledigt: ein Vier-Augen-Prinzip ist
nicht bloß unpraktisch, es wäre **dauerhaft blockiert** — es gibt niemanden, der
bestätigen könnte. Der Schutz musste neu gedacht werden (Abschnitt 3a).

---

## 1. Die Leitfrage

Abschnitt 12 klingt nach „bauen", ist aber zum größten Teil **schon gebaut** — nur
sieht das niemand. Abschnitt 13 klingt nach „noch eine Liste", ist aber das erste
Stück der Plattform, das **vorausdenkt** statt zurückzuschauen.

> **Wo endet die Automatik, und wo fängt der Mensch an — wenn dieser Mensch
> allein ist?**

---

## 2. Ist-Stand — gemessen, nicht vermutet

Alles am 2026-08-27 gegen die laufende Datenbank und den Quelltext erhoben.

### 2.1 Die Auszahlung läuft bereits

| | |
|---|---|
| Katalog-Einträge (`bounties`) | **15** |
| **verdiente Bounties** (`user_bounties`) | **754** |
| Stufen (`bounty_tiers`) | 5 (Bronze 8 % … Diamant 25 %) |

```
user_bounties (754)
  → bountyService.getUserDiscount()   SUM(discount_pct), gedeckelt vom Tier
  → recurringBillingService:231       rabattSatz je Abo-Lauf
  → invoiceService.createInvoice()    berechneRabatt(netto, satz)
  → invoices.discount_pct / discount_amount_cents / discount_source='bounty'
```

Der Satz wird **eingefroren**: *„Der Satz von heute steht in dieser Zeile."*
(`recurringBillingService:251`)

**Es fehlt kein Auszahlungsmechanismus.** Er ist da, automatisch, monatlich.

### 2.2 Was fehlt: der Eingriffspunkt

**Ein Ausfall ist heute nur eine Log-Zeile:**

```js
catch (e) {
  logger?.warn?.({ ... }, "Folgerechnung: Rabattsatz nicht ermittelbar, Rechnung ohne Rabatt");
}
```

Der Kommentar darüber verspricht *„sichtbar, nicht stumm — eine Rechnung ohne
Rabatt ist ein Fehler, den jemand sehen muss."* **Ein Log ist nicht sichtbar.** Ein
Kunde mit 15 % zahlt den vollen Preis, und der einzige Zeuge ist eine Datei, die
niemand liest. Dieselbe Fehlerklasse wie in Welle I — nur geht es hier um **Geld
auf einer Rechnung**.

Und: das Staff CC verwaltet den **Katalog** (`GET/POST /bounty-catalog`), nicht den
**Einzelfall**. Es gibt keine Antwort auf *„welchen Rabatt bekommt Kunde X nächsten
Monat, warum, und wie greife ich ein?"*

### 2.3 Die Deckelung würde den Cashback zerstören

`bountyService.getUserDiscount` endet mit:

```js
return Math.min(maxPct, raw);
```

Ein 100 %-Bounty würde bei einem Bronze-Kunden auf **8 %** gestutzt — die Prämie
schrumpft lautlos auf ein Zwölftel. **Der Cashback braucht eine Ausnahme von der
Tier-Deckelung.** Das ist die einzige Änderung an der bestehenden Rechenkette in
dieser ganzen Welle, und sie muss bewusst passieren.

### 2.4 Empfehlungen: die Mechanik existiert, die Verdrahtung ist offen

| | |
|---|---|
| `referral_codes` | 17 |
| `referrals` | **1** |
| `referral_rewards` | 2 |

`referrals.reward_applied_at` stand in Welle I auf der Liste der Spalten, die
geschrieben und nie gelesen werden. Vor dem Bau zu klären, nicht danach.

### 2.5 Monatsplanung: Rückschau ja, Planung nein

| Was | Wo | Für wen |
|---|---|---|
| Monatsplan als **PDF** | `workforceSchedulePdfService`, `workers.js:1921` | Zeitarbeitsfirma |
| Eigener Plan des Arbeiters | `einsatzportal-plan.html` → `/worker/schedule` | Arbeiter |
| **Planungsfläche fürs Büro** | **existiert nicht** | — |

### 2.6 Der Feed-Fehler

Behoben in `e845c2d` — *„der Marktplatz-Feed warf 500 für JEDEN angemeldeten
Betrachter"*, inzwischen hereingemergt. Offen bleibt der zweite Teil: ein künftiger
Fehler darf den Feed nicht leeren.

---

## 3. Verbindliche Leitentscheidungen

**L1 — 12 ist Sichtbarmachung, kein Neubau.** Die Rechenkette trägt 754 Fälle und
bleibt unangetastet — mit der **einen** Ausnahme aus 2.3.

**L2 — Ein stiller Geldfehler ist ein Befund, kein Log-Eintrag.**

**L3 — Die Werbeprämie ist ein Bounty, kein zweiter Mechanismus.** Eine
„Pilot-Verlängerung" hätte eigenes Enddatum, eigene Automatik und eigenen
Eingriffspunkt gebraucht — die Parallelstruktur, die die `CLAUDE.md` verbietet.

**L4 — Schutz durch Struktur, nicht durch Kontrolle.** Es gibt keine zweite Person.
Ausgearbeitet in 3a.

**L5 — Gemeinsam planen heißt nicht verhandeln müssen.** Ausgearbeitet in 3b.

**L6 — Ein Fehler darf nie zu einer leeren Liste führen.** Ausgearbeitet in 3c.

**L7 — 13 wartet auf J.**

---

## 3a. Der Eingriff, wenn niemand gegenzeichnen kann

Mein erster Entwurf sah ein Vier-Augen-Prinzip vor. Das ist hinfällig: **es gibt
keine zweite Person.** Ein solcher Weg wäre nicht streng, sondern tot.

Und das Bedrohungsmodell ändert sich ehrlich gesagt komplett: Wenn eine Person
allein handelt, ist „Machtmissbrauch durch Staff" gleichbedeutend mit *„der Owner
missbraucht seine eigene Plattform"* — kein realistisches Risiko, denn er kann
ohnehin den Katalog ändern oder direkt in die Datenbank schreiben.

**Die realen Risiken sind andere:**

| Risiko | Riegel | Warum er ohne zweite Person trägt |
|---|---|---|
| **Das Versehen, das Geld kostet** *(das wahrscheinlichste)* | **Wirkungsvorschau statt Bestätigungsklick.** Vor dem Wirksamwerden steht da: *„die nächste Rechnung wird um 143,50 € niedriger."* Bestätigt wird **diese Zahl**, nicht eine abstrakte Handlung. | Ein Mensch übersieht eine Handlung, aber selten einen falschen Betrag in Euro |
| **Der Wunschbetrag** | **Kein freies Feld.** Man wählt *„dieses Bounty hätte zählen müssen"*; das System prüft **die Schwelle gegen die echten Daten** und **lehnt ab**, wenn sie nicht erfüllt ist — mit Angabe, welche Bedingung fehlt. | Struktur, nicht Vertrauen: es lässt sich nur vergeben, was der Katalog ohnehin hergäbe |
| **Der stille Dauerrabatt** | **Verfall nach genau einem Abrechnungslauf.** Danach entscheidet wieder die Automatik. | Kein Eingriff überlebt unbemerkt |
| **Später, mit mehr Staff** | **„Nie in eigener Sache"** bleibt drin — nicht die eigene Organisation, nicht das eigene Konto. | Kostet heute nichts und greift ab der zweiten Person automatisch |
| **Nachvollziehbarkeit nach außen** | **Die Rechnung trägt die Quelle**: Automatik oder Eingriff. | Das ist das Audit, das den Kunden und die Buchhaltung erreicht |

**Statt Einzelmeldung eine Monatsübersicht.** Sich selbst zu benachrichtigen wäre
Lärm. Was zählt: *„August: 3 Eingriffe, zusammen 412 €"* — zur Durchsicht und für
die Buchhaltung.

> **Der Kern in einem Satz:** Ein Eingriff setzt keine Zahl, er nennt einen Grund —
> und das System rechnet. Damit kann selbst der, der alle Rechte hat, nur das
> vergeben, was dem Kunden ohnehin zugestanden hätte.

---

## 3b. Gemeinsam planen, ohne Pflicht-Hin-und-Her

Die Gefahr bei gemeinsamer Planung ist ein Genehmigungs-Pingpong. **Das Prinzip:
Vorschlagen ohne zu blockieren.**

| | Einsatzunternehmen | Zeitarbeitsfirma |
|---|---|---|
| legt in den Monat | **Bedarf** („hier brauche ich jemanden") | **Besetzung** („diese Person kommt") |
| sieht | eigene Einsätze und Bedarfe | den ganzen eigenen Bestand |
| braucht Zustimmung | **nein** | **nein** |
| kann Einträge der Gegenseite ändern | **nein** | **nein** |

Beide schreiben in **ihre eigene Spur**. Ein Bedarf ist kein Auftrag, sondern eine
sichtbare Absicht. Eine Besetzung ist keine Bitte, sondern eine Zusage.

### Konflikte: Information plus Hebel, nie eine Bitte

Ein Konflikt erzeugt **kein Formular und keine Aufforderung an die Gegenseite**.
Er nennt, was kollidiert, und bietet die Handlung an, die **auf der eigenen Seite**
löst:

> *„Meier ist am 12.–14. schon bei Nordbau."* → die Agentur besetzt anders, ohne zu fragen.
> *„Ihr Bedarf am 12. ist unbesetzt."* → der Kunde ändert seinen Bedarf, ohne zu fragen.

**Zwei Härtegrade:**

| Grad | Beispiel | Darstellung |
|---|---|---|
| **hart** | eine Person, zwei Orte gleichzeitig; Abwesenheit im Zeitraum; AÜG-Frist überschritten | unübersehbar — physisch oder rechtlich unmöglich |
| **weich** | Bedarf unbesetzt; Nachweis läuft im Zeitraum ab | offener Punkt, keine Warnung |

Niemand wartet auf niemanden. Der Unterschied zur Variante *„jeder allein ohne
Abklärung"*: die Doppelbelegung fällt **beim Planen** auf, nicht am Einsatztag.

---

## 3c. Der Feed fällt nie auf leer zurück

**Heute:** Fehler → 500 → leere Fläche. Für den Betrachter ununterscheidbar von
„es gibt gerade keine Angebote" — und das ist die schlimmere Lesart, weil sie
falsch ist und niemanden alarmiert.

**Künftig:** Jeder erfolgreiche Abruf legt seine Liste als dauerhafte Kopie ab.
Schlägt der nächste fehl, wird die Kopie ausgeliefert — sichtbar datiert.

| Eigenschaft | Entscheidung | Warum |
|---|---|---|
| **Wo** | Datenbanktabelle, **derselbe Server** | Wovor wir schützen, ist ein **Fehler in einer Abfrage** — genau das ist passiert. Dagegen schützt eine Kopie in derselben Datenbank vollständig, weil sie über eine andere, viel einfachere Abfrage gelesen wird. |
| **Nicht mehrere Server** | bewusst **nein** | Mehrere Datenbankserver schützen gegen **Serverausfall**. Ist die Datenbank weg, ist die ganze Plattform weg — keine Anmeldung, keine Sitzung. Eine überlebende Feed-Kopie erreichte dann niemand. Bei 22 aktiven Firmen wären das laufende Kosten, Replikation, Failover und Betriebslast für einen Schutz, der auf den tatsächlichen Fehler nicht wirkt. **Hochverfügbarkeit ist eine plattformweite Entscheidung an einer Skalierungsstufe**, nicht Teil einer Feed-Funktion. |
| **Was** | die **unbeschränkte erste Seite** | Jede Filterkombination zu speichern wäre Verschwendung; der Normalfall deckt den Normalbesucher |
| **Kennzeichnung** | Datum und Uhrzeit des Standes, deutlich über der Liste | Ein alter Stand, den man für aktuell hält, ist schlimmer als gar keiner |
| **Nebenwirkung** | Meldung an das Team beim ersten Rückfall | Sonst ist der Rückfall selbst wieder still |
| **Grenze** | Kopie älter als **24 h** wird nicht mehr ausgeliefert | Ab da ist Schweigen ehrlicher — dann Fehlermeldung mit Zeitangabe |

**Ausdrücklich kein allgemeiner Cache.** Die Kopie greift **nur im Fehlerfall**.
Sonst hätten wir eine zweite Wahrheit über den Marktplatz.

---

## 4. Wellen und Phasen

### K0 · Vorlauf *(erledigt sich mit dem Merge)*

| Phase | Inhalt | Fertig, wenn |
|---|---|---|
| K0.1 | Merge des Release-Standes | ✅ durch (`297554c`, 13 Commits, sechs Konflikte) |
| K0.2 | Gegenprüfung: Naht I↔J, Registerzahlen, volles Gate | ✅ Gate grün — Host **10176/10162/0 Fehlschläge**, Container **369/369** DB-gestützt. Drei Befunde, **keiner im Produktcode** |
| K0.3 | Feed-Fehler nachprüfen (`e845c2d`) | ✅ bestätigt behoben — und mit K4 zusätzlich abgefangen |

---

### K1 · Der Rabatt wird sichtbar — ✅ **gebaut 2026-08-29**

| Phase | Inhalt | Stand |
|---|---|---|
| K1.1 | **Der stille Ausfall wird laut.** | ✅ Migration 206, `rabattAusfallService`, **zwei** Ausfallpfade statt einem (siehe unten) |
| K1.2 | **Einzelfall-Ansicht im Staff CC** | ✅ Modul `rabatt-faelle`, `rabattFallService` — Bounties, Satz, Obergrenze, Rechnungen, Ausfälle, Eingriffe |
| K1.3 | **Vorschau auf den nächsten Lauf** | ✅ `vorschauRecurringInvoices` — *dieselbe* Auswahl und *dieselbe* Entscheidung wie der Lauf, ohne Folgen |
| K1.4 | **Eingriff nach 3a** | ✅ `rabattEingriffService` — alle sechs Riegel, jeder einzeln rückmutiert |
| K1.5 | **Monatsübersicht der Eingriffe** | ✅ `eingriffeImMonat` — die Summe stammt aus genau den gelieferten Zeilen |

**Belege:** `api/test/rabattWirdSichtbar.test.js` (75 Proben, davon **11 am echten
Handler**), **14 Rückmutationen an der Produktionsquelle — jede von genau der
zuständigen Probe gefangen.** Migration 206 (`rabatt_ausfaelle`,
`rabatt_eingriffe`), Staff-CC-Modul `frontend/src/staff/modules/rabatt-faelle/`.

> **Der Befund, der die Welle größer gemacht hat als geplant: es sind ZWEI stille
> Ausfallpfade, nicht einer.**
>
> Der Plan nannte den `catch` in `recurringBillingService:231` — die Summen-Abfrage
> wirft, die Rechnung geht ohne Rabatt raus, einziger Zeuge ist eine `logger.warn`-Zeile.
> Beim Messen kam ein **zweiter** heraus, der schwerer wiegt: `getUserTier` fängt
> seinen eigenen Datenbankfehler ab und liefert `null`; `getUserMaxDiscount` macht
> daraus die Voreinstellung 8 %. Das ist **nicht von „hat noch keine Stufe“ zu
> unterscheiden** — kein Log, kein Eintrag, nichts. Ein Diamant-Kunde (Deckel 25 %)
> wird dabei auf 8 % gestutzt.
>
> Nebenbefund: weil `getUserTier` nie wirft, ist der Sicherheitsnetz-Wert
> `FALLBACK_MAX_DISCOUNT_PCT = 25` in `bountyService` **unerreichbar**. Ein
> bestehender Test (`bountyService.coverage.test.js`) hält genau das seit jeher
> fest, ohne dass jemand die Folge gezogen hätte.
>
> **Die Rechenkette wurde nicht angefasst** (Leitentscheidung L1): jede Zahl bleibt,
> was sie war. Neu ist nur, dass beide Ausfälle einen Befund hinterlassen.

> **Wie K1.1 mit `K4-B1` umgeht.** Es gibt weiterhin keinen Kanal, der das Team
> erreicht. Statt einen zu erfinden, wird der Ausfall **festgehalten** — mit Kunde,
> Monat, Grund, angesetztem Ersatzwert, Nettobetrag und der Rechnung, die trotzdem
> entstanden ist — und in der Fläche aus K1.2 gezeigt. Eine Zeile je Kunde, Monat
> und Stelle (UPSERT mit Vorfall-Zähler): sonst wüchse das Protokoll mit dem Fehler
> mit und wäre genau dann am größten, wenn die Datenbank ohnehin leidet.

> **Was der Eingriff strukturell kann und was nicht.** Der Zuschlag ist
> `min(Deckel, Satz + Bounty) − min(Deckel, Satz)` — exakt das, was
> `getUserDiscount` geliefert hätte, wäre das Bounty automatisch vergeben worden.
> Damit lässt sich per Hand nur vergeben, was der Katalog ohnehin hergibt; wer schon
> auf der Obergrenze seiner Stufe sitzt, bekommt **null**, und ein wirkungsloser
> Eingriff wird abgelehnt statt still angelegt. Bestätigt wird die **Zahl in Euro**;
> weicht sie beim Anlegen von der neu berechneten ab, wird abgelehnt statt gerechnet.

> **Ein Fund beim Bauen, festgehalten statt übertüncht.** Die erste Fassung der
> Einzelfall-Ansicht addierte die Rohsumme aus der **Bounty-Liste** statt aus der
> Abfrage, die auch die Rechnung benutzt. Das ergibt fast immer dieselbe Zahl —
> FAST: die Liste enthält bewusst auch beendete Vergaben. Die Fläche hätte eine
> Wahrheit behauptet, die auf keinem Beleg steht. Gefangen hat es die Probe
> „benutzt DIESELBE Funktion wie die Rechnung“; die Lösung ist
> `getUserDiscountDetail` — eine Abfrage, zwei Sichten darauf.

---

### K2 · Werbe-Cashback *(unabhängig)*

**Regel:** ein 100 %-Bounty je geworbenem Kunden, **nach 30 Tagen Bestand**,
**höchstens 3 Monate**, **nächste Rechnung frei** (keine Rückerstattung). Der
Geworbene bekommt **nichts extra**.

| Phase | Inhalt | Stand |
|---|---|---|
| K2.1 | **Erhebung:** ist `referrals` → Prämie heute verdrahtet? | ✅ **gemessen** — siehe unten |
| K2.2 | **Gate: vertragen 0-€-Rechnungen den Weg?** | ✅ **beantwortet** — Rechenkette ja, drei andere Schichten nein; alle drei behoben (Mig 208) |
| K2.3 | **Ausnahme von der Tier-Deckelung** für den Cashback-Typ (siehe 2.3) | ✅ `bounties.deckel_frei` — Bronze-Kunde bekommt 100 %, nicht 8 % |
| K2.4 | Karenz-Uhr: der Geworbene muss 30 Tage bestehen | ✅ `faellig_ab` + **Bestandsprüfung im WHERE** — kein Widerrufs-Job nötig |
| K2.5 | Deckel bei 3 Monaten | ✅ `MAX_PRAEMIEN = 3` (war 6), gezählt werden die **angewandten** |
| K2.6 | Stapelung: 100 % neben einem Treuerabatt | ✅ alle drei Quellen addieren sich, bei 100 gekappt; der Treuerabatt wird **nie** verbraucht |
| K2.7 | Eingriffspunkt wie K1.4 | ✅ die Prämie lässt sich **nicht** von Hand herbeireden — der Eingriff prallt mit Begründung ab |

**Die Prämie erreicht jetzt die Rechnung.** Sie fährt auf **derselben Schiene wie
der Eingriff aus K1.4** — vor der Transaktion gelesen, darin verbraucht, danach
belegt. Kein zweiter Mechanismus (L3), nur eine zweite Herkunft: der Eingriff
kommt von einem Menschen, die Prämie aus dem Werbe-Buch. Beide enden im selben
`discount_pct`.

**Warum die Bedingungen beim VERBRAUCHEN geprüft werden, nicht beim Buchen.**
Der naheliegende Weg wäre ein Widerrufs-Job: kündigt der Geworbene an Tag 29,
nimm die Prämie zurück. Das bräuchte einen nächtlichen Lauf, einen
Kündigungs-Haken und die Annahme, dass beide immer feuern — drei Stellen, an
denen es still schiefgehen kann, und genau die Sorte Automatik, die in diesem
Repo schon einmal **nie gelaufen ist** (der nächtliche Mutations-Job, TRIAGE.md).
Stattdessen stehen Karenz und Bestand des Geworbenen **im `WHERE`** der einen
Abfrage, die im Moment der Rechnung läuft. Kündigt er, findet sie die Prämie nie.

**Warum die Prämie keine `user_bounties`-Zeile erzeugt.** `evaluateBounties`
läuft, wenn der **Kunde seine Bounty-Seite besucht**. Zwischen dem Fälligwerden
und dem nächsten Besuch können Wochen liegen — für eine Anzeige hinnehmbar, für
eine Rechnung nicht. `referral_rewards` ist deshalb die Wahrheit fürs Geld, und
der Abrechnungslauf fragt sie **direkt**. Die Katalog-Kachel `werbe_cashback`
liefert Satz und Not-Aus und **erklärt sich** (`referral_cashback`), vergibt aber
ausdrücklich nichts: wäre `earned: true`, sähe `getUserDiscount` die 100 % ein
zweites Mal und der Rabatt wäre doppelt.

> **Ein Fund beim Bauen der eigenen Probe.** Die erste Fassung von
> `praemienKonfiguration` fing den Datenbankfehler ab und meldete schlicht
> „Programm aus". Damit war **ein Ausfall nicht von einer Owner-Entscheidung zu
> unterscheiden** — Zeichen für Zeichen der Defekt, den K1.1 bei `getUserTier`
> gefunden hat, in neuem Code reproduziert. Die Probe hat ihn gefangen; der
> Fehler wird jetzt benannt statt verkleidet.

**Belege:** Migration 209, `api/services/werbepraemieService.js`,
`api/test/werbepraemie.test.js` (26 Proben), **16 Rückmutationen** an der
Produktionsquelle, `test/integration/rabattWirdSichtbar.flow.test.js` 34/34 im
Container.

> **K2.2 war ein Gate, keine Phase** — und es hat sich gelohnt.

### Das Ergebnis des Gates *(gemessen 2026-08-30/31)*

**Die Rechenkette trug es auf Anhieb. Drei andere Schichten nicht.**

| Schicht | Trägt 0 €? | Befund |
|---|---|---|
| `berechneRabatt(netto, 100)` | ✅ | Abzug = netto, Rest 0 — bei jedem Betrag, auch bei 1 Cent |
| `createInvoice` | ✅ | amount 0, Steuer 0, gesamt 0, brutto 15000, Rabatt 15000 |
| DB-Prüfregeln | ✅ | alle `>= 0`; `invoices_rabatt_stimmig` geht auf. Keine verlangt einen positiven Betrag |
| **Tier-Deckelung** | ❌ | Diamant-Kunde bekam **25 % statt 100 %** — die Vorhersage aus 2.3, jetzt am Code belegt |
| **Katalog-Grenze** | ❌ | `discount_pct <= 20` — ein 100-%-Eintrag war **gar nicht anlegbar**. Stand nicht im Plan |
| **Lebenszyklus** | ❌ | **der schwerste** — siehe unten |
| **Mahnlauf** | ❌ | hätte eine Zahlungserinnerung über **0,00 €** verschickt |

> **Der Freimonat führte in die Sperre statt in die Freude.** Der Lauf setzt das
> Abo auf `past_due`. Eine 0-€-Rechnung bezahlt niemand — es gibt nichts zu
> zahlen. `applyRenewalPayment`, das aus `past_due` zurückführt, hat **keinen
> einzigen Aufrufer**. Nach 14 Tagen greift `applyHardLocks`: Abo `canceled`,
> Organisation auf DEMO. **Der Kunde, dem die nächste Rechnung geschenkt wurde,
> wäre ausgesperrt worden.**
>
> Das trifft nicht nur den Cashback: **jede** Rechnung, die auf null fällt, lief
> hinein — auch ein Eingriff nach K1.4, der die 100 % erreicht.

**Die Entscheidung: keine 99-%-Krücke, kein Gutschriftsweg.** Die im Plan
genannten Auswege lösen das Problem an der falschen Stelle. Eine Forderung über
null ist in dem Moment erfüllt, in dem sie entsteht — das ist keine Umgehung,
sondern die richtige Buchung. Der Lauf bucht sie deshalb sofort als bezahlt und
rollt die Periode weiter, **in derselben Transaktion** wie der Status-Flip (sonst
gäbe es ein Fenster, in dem der Härte-Riegel zuschlagen könnte). Damit bleibt der
Owner-Entscheid unverändert gültig: 100 %, die nächste Rechnung ist frei, keine
Rückerstattung.

**Die 20-%-Katalogregel ist nicht gefallen, sondern genauer geworden:**
`CHECK (discount_pct <= CASE WHEN deckel_frei THEN 100 ELSE 20 END)`. Für jeden
normalen Eintrag gilt exakt dieselbe Grenze wie vorher — dieselbe Überlegung, aus
der Migration 170 auf eine negative `invoice_items`-Zeile verzichtet hat.

**Belege:** Migration 208, `api/test/nullEuroRechnung.test.js` (15 Proben),
**9 Rückmutationen an der Produktionsquelle**, `test/integration/rabattWirdSichtbar.flow.test.js`
26/26 im Container gegen das echte Schema.

### Das Ergebnis von K2.1 *(gemessen 2026-08-30)*

| | Zahl |
|---|---|
| `referral_codes` | 17 |
| `referrals` | 1 |
| `referral_rewards` | 2 — **beide `pilot_base`**, keine einzige `free_month`/`cashback` |
| `reward_applied_at` gesetzt | **0** |

**Die Mechanik existiert und ist verdrahtet — nur nicht ans Geld.**
`qualifyReferralReward` wird aus `routes/payment.js:683` gerufen, sobald der
geworbene Kunde zahlt, und schreibt eine `referral_rewards`-Zeile. Aber: **keine
einzige Datei des Geldpfads** (`invoiceService`, `recurringBillingService`,
`paymentService`, `planCatalog`) erwähnt `referral` überhaupt. Die Prämie wird
gebucht und **nie angewandt** — dieselbe Fehlerklasse wie der Treue-Rabatt vor
Migration 170: *ein Preisversprechen ohne Wirkung.*

Migration 208 legt die fehlende Hälfte an: `faellig_ab` (Karenz), `angewandt_am`
und `rechnung_id` (der Beleg).

> **Zwei Stellen, an denen der Code dem Owner-Entscheid widerspricht** — für
> K2.4/K2.5 zu korrigieren, nicht neu zu verhandeln:
> `MAX_REFERRAL_REWARDS = 6` (Owner: **höchstens 3**) und die Qualifikation
> feuert **sofort** beim Zahlungseingang (Owner: **30 Tage Bestand**).

---

### K3 · Monatsplanung *(setzt Welle J voraus)*

| Phase | Inhalt | Stand |
|---|---|---|
| K3.1 | **Entwurf nach 3b** | ✅ **freigegeben 2026-08-31** (E-K3-1 bis E-K3-4) |
| K3.2 | **Datenlage messen** | ✅ **gemessen 2026-08-31** — siehe unten |
| K3.3 | Lesende Fläche: der Monat als Raster | ✅ **vollständig** — `monatsplanService`, `GET /workforce/monatsplan`, `monatsplan.html`; im Browser belegt (Raster, Leerzustand, Fehlerzustand) |
| K3.4 | **Konflikte nach 3b** — hart und weich getrennt | ✅ **alle fünf Arten**, inkl. AÜG |
| K3.5 | Beide Spuren schreibend, ohne Zustimmungspflicht | ✅ **vollständig** — beide Schreibwege existierten bereits; neu ist die **Konfliktvorschau vor dem Schreiben**, auf der Fläche verdrahtet |
| K3.7 | **Der Monat je Mitarbeiter** | ✅ **neu** — das Einsatz-Raster zeigte 4 von 31 Mitarbeitern; die zweite Achse zeigt alle, mit freier Spanne und Auslastung |
| K3.6 | Härtung: Skalierung (10 → 300), `Europe/Berlin`, Mutation Testing auf der Konfliktlogik | ✅ **abgeschlossen** — Indizes geprüft (keine Lücke), Zeitzone gewächtert, 957 Mutanten gefahren; AÜG-Kern 78,04 → **80,95 %** |

---

## K3.8 — 90 % je Bereich, fest vorgeschrieben

Owner-Vorgabe 2026-09-01: **90 % Mutations-Punktzahl je Bereich**, und fest
vorgeschrieben auch für jeden künftigen.

| Lauf | gesamt | `auegService` | `monatsplanService` |
|---|---:|---:|---:|
| K3.6, Ausgangslage | 65,83 % | 78,04 % | 61,40 % |
| K3.6, nach den Grenzproben | 70,44 % | 80,95 % | 66,67 % |
| **K3.8** | **90,57 %** | **90,87 %** | **90,46 %** |

### Wie — ohne eine einzige Ausnahme

Die naheliegende Abkürzung wäre gewesen, Mutatoren auszuschließen. Sie wurde
nicht genommen: eine Punktzahl, die durch Wegdefinieren entsteht, misst nichts.
Stattdessen drei Arten von Proben, die alle **einen Vertrag festhalten**, den es
vorher nur im Kopf gab:

**Die Form der Abfrage.** Je Abfrage die Bestandteile, ohne die sie etwas anderes
bedeutet — Verbund, Bedingung, Sortierung. Der Muster-Pool führt nichts aus, also
muss die Form wörtlich festgehalten werden. Dass sie auch gültiges Postgres ist,
beweist der Container-Lauf: **beide Schichten zusammen, keine allein.**

**Die Bindungen.** `assert.deepEqual(call.params, [...])` für jede Abfrage. `$1`
ist die Mandantengrenze; eine vertauschte Bindung ist kein Formfehler, sondern
ein Datenleck.

**Die Gestalt der Antwort.** `deepEqual` auf das ganze Objekt statt einzelner
Felder. Der Unterschied ist nicht Gründlichkeit, sondern Richtung: eine
Feldprobe sagt, was da sein **muss**; eine Gestaltprobe sagt zusätzlich, was
**nicht** da sein darf. Ein zusätzliches Feld ist auf einer Fläche unsichtbar —
in einer Antwort über die Mandantengrenze ist es der Schaden.

### Die stärkste Probe rechnet dieselbe Frage zweimal

`freieSpannen` ist rein — keine Datenbank, keine Zeit, kein Zufall. Sie wird
gegen eine **unabhängig gerechnete Referenz** geprüft: Tag für Tag, mit einer
Menge, absichtlich naiv. Der zweite Weg kennt kein Zusammenlegen, keine
Sortierung, keine Zeiger — genau deshalb kann er nicht denselben Fehler machen.

**10 900 Fälle** laufen so durch (900 Ein-Spannen-, 10 000
Zwei-Spannen-Kombinationen). Jede Abweichung an jeder Kante fällt auf, ohne dass
jemand vorher wissen muss, wo die Kanten liegen.

### Und was die Reihenfolge angeht

Zwei Sortierungen waren völlig unbewacht — in `freieSpannen` und in `ketten()`.
Beide entscheiden, welcher Tag als **Beginn** gilt, und daran hängt in einem Fall
die freie Spanne, im anderen die AÜG-Frist. Geprüft wird jetzt über **alle
Anordnungen** einer dreielementigen Liste: bei zwei Elementen passt jede
Vergleichsrichtung zufällig, erst bei drei trennt sich das.

### Was übrig bleibt, und warum

90 Überlebende, überwiegend **äquivalente Mutanten**: `x || null` auf einem Feld,
das nie fehlt; `<` gegen `<=` bei durchweg verschiedenen Werten; ein `heute`, das
in `planungsVorschau` nachweislich kein Ergebnis verändert. Sie zu „töten" hieße,
Proben zu schreiben, die nichts behaupten.

> **Der Stryker-Bericht ist ein Hinweis, kein Urteil.** Von sechs als „überlebt"
> gemeldeten Entscheidungspunkten waren nach Prüfung von Hand **fünf längst
> gefangen** — Stryker mutiert Teilausdrücke, nicht ganze Ausdrücke. Vor jeder
> Probe, die einen Mutanten töten soll: von Hand rückmutieren und prüfen, dass
> die Suite dabei wirklich rot wird.

### Alle drei Bereiche, gemessen

Die Vorgabe gilt nicht nur für den Bereich dieser Welle. Gemessen am 2026-09-01,
jeweils ohne Zwischenspeicher:

| Bereich | vorher | nachher |
|---|---:|---:|
| `monatsplan` | 65,83 % | **90,57 %** |
| `rbac` | 95,94 % ¹ | **97,47 %** |
| `subscription` | 41,03 % | **94,85 %** |

¹ *Die 95,94 % waren selbst schon eine Falschmeldung — siehe unten.*

**`rbac`** hielt im Mittel die Latte, aber zwei Middleware-Dateien lagen darunter
(`rbac.js` 88,46 %, `orgContext.js` 89,80 %). „Je Bereich" heißt je Datei;
gemittelt versteckt sich jede Lücke. Nach 37 Proben: **99,36 %** und **98,98 %**.

**`subscription`** stand bei 41,03 % — und der Grund war struktureller Natur: der
Läufer fuhr **zwei von acht** vorhandenen Testdateien. Alle acht bringen nur
+2,5 Punkte; der Dienst war wirklich kaum abgedeckt. 183 neue Proben in sechs
Dateien haben ihn auf **94,85 %** gebracht (920 von 970 Mutanten getötet).

### Der Zwischenspeicher, der eine Stunde gekostet hat

Nach den 37 RBAC-Proben meldete der Lauf **auf die Kommastelle dasselbe
Ergebnis** wie vorher. Der naheliegende Schluss wäre gewesen, die Proben taugten
nichts — jede war einzeln durch Rückmutation als wirksam belegt.

Die Ursache: `"incremental": true`. Stryker schlüsselt seinen Zwischenspeicher
auf Änderungen am **Quelltext**, nicht auf die der **Tests**. Die Quelle war
unverändert, also spielte er alles ab.

**Erste Abhilfe war zu schwach:** die npm-Skripte räumten den Speicher weg — aber
ein direkter `npx stryker run`, also genau das, was man beim Iterieren tippt, las
ihn weiter. Auf Owner-Anweisung („sorge dafür das er nicht mehr unzufällig aus
dem zwischenspeicher liest, auch global und lokal") steht die Regel jetzt in der
**Konfiguration**: `incremental: false`, kein `incrementalFile`. Kein Aufrufweg
kann noch eine alte Zahl liefern — erzwungen von `mutationsSchwelle.test.js`,
samt Selbsttest.

**Global** trug die Vorlage im projektübergreifenden `MUTATION_TESTING_PLAYBOOK.md`
genau dieselben zwei Fehler: `incremental: true` und `"break": 0` mit dem Rat
*„bis der Bereich sauber ist"*. Beide sind ersetzt.

### Was die Gegenprüfung gefunden hat

Jedes Bündel wurde von einem unabhängigen Skeptiker geprüft. Alle bestätigten:
Produktionscode unverändert, Tests grün. Vier konkrete Einwände waren berechtigt
und sind abgearbeitet:

* **Eine Probe behauptete mehr, als sie zeigte.** „Der Zielstatus des Verlaufs
  stammt aus der Zeile, nicht aus der Eingabe" — beide Quellen waren im Aufbau
  deckungsgleich gesetzt, die Probe konnte sie gar nicht trennen. Jetzt gehen sie
  auseinander.
* **Eine Probe war eine Kopie** der Gestaltprobe darüber. Sie hat jetzt eine
  eigene Aufgabe: *ausdrücklich leere* Angaben gegen *fehlende*.
* **Eine Gleichwertigkeits-Behauptung war falsch.** `details || {}` galt als
  nicht tötbar, weil „keine der acht Aufrufstellen `details` weglässt" — das
  übersieht, dass `transitionStatus` **exportiert** ist und sein Vorgabewert nur
  bei `undefined` greift, nicht bei `null`. Ohne den Rückfall stünde die
  Zeichenkette `"null"` in einer jsonb-Spalte. Die Probe ist geschrieben und
  tötet den Mutanten (von Hand belegt).
* Ein vierter Einwand (toter Querverweis im Dateikopf) traf **nicht** zu — die
  genannten Kommentare gibt es, an vier Stellen.

---

### Fest vorgeschrieben

`api/test/mutationsSchwelle.test.js` erzwingt für **jede** `stryker.*.conf.json`:
`thresholds.break >= 90`, echte Ziele, ein Testbefehl, und ein npm-Skript, das
sie startet. Gemessen am 2026-09-01 standen die drei Bereiche auf **drei
verschiedenen Latten** — `subscription` sogar auf `break: 0`, also gar keinem
Tor. Eine gesenkte Schwelle sieht aus wie eine Einstellung und ist eine
zurückgenommene Zusage; deshalb steht sie jetzt in einem Test und nicht nur in
einer Konfigurationsdatei.

---

## K3.6 — die Härtung

### Skalierung 10 → 300: gemessen, keine Lücke

Zwei Wächter zählen bereits Abfragen statt Zeilen — `monatsplan` mit 3 gegen 300
Einsätzen, `mitarbeiterMonat` mit 3 gegen 300 Mitarbeitern. Beide fordern
**dieselbe** Abfragezahl. Was fehlte, war der Blick auf die Indizes: bei 24
Zuordnungen wählt Postgres ohnehin Sequenzsuche, ein `EXPLAIN` sagt hier also
nichts. Aussagekräftig ist, ob es die Indizes überhaupt gibt.

| Abfrage | Prädikat | Index |
|---|---|---|
| `belegungenImFenster` | `worker_user_id = ANY(…) AND is_active` | `(worker_user_id, is_active)` ✓ |
| `mitarbeiterDerFirma` | `supplier_org_id = $1 AND is_active` | `(supplier_org_id, is_active)` ✓ |
| `abwesenheitenImFenster` | `worker_profile_id = ANY(…)` | `(worker_profile_id, von DESC)` ✓ |
| `nachweiseImFenster` | `worker_user_id = ANY(…)` | `(worker_user_id, …)` ✓ |
| `vorschauDoppelbelegung` | `worker_user_id = $1` | `(worker_user_id, is_active)` ✓ |
| `bedarfe` (neu) | `IN (SELECT id FROM users WHERE org_id = $1)` | `users(org_id)` ✓ |

Der letzte war der interessante: `users` wächst mit **allen** Plattformnutzern,
nicht nur denen einer Firma — genau die Form „läuft bei 10, bricht bei 300".
Gegengeprüft mit `EXPLAIN`: der Planer nimmt `users_org_id_idx`. **Keine
Migration nötig.**

### Europe/Berlin: die Bitte war da, die Zusage nicht

`dateDE.js` bittet um `timeZone: "Europe/Berlin"`. **Dass die Bitte erfüllt wird,
hängt an der ICU-Datenbank in Node** — nicht an der Systemzeitzone. Gemessen im
API-Container: `TZ=Europe/Berlin` ist gesetzt, aber `date` meldet UTC, weil dem
Abbild die tzdata fehlt. Node hat volles ICU (77.1) und rechnet trotzdem richtig.

Das ist eine dünne Stelle: ein Abbild mit `small-icu`, ein schlankeres
Basis-Abbild, ein Node-Wechsel — und `Intl` fällt still auf UTC zurück. Kein
Fehler, keine Warnung; nur jeder Kalendertag der Plattform rückt nachts um einen
Tag.

Der Wächter steht in `kalendertagDE.test.js` und prüft an den Zeitpunkten, die
**genau dann** falsch werden: 23:30 UTC ist in Berlin bereits der Folgetag — im
Winter (+1) wie im Sommer (+2).

> **Beim Rückmutieren fiel er zuerst durch die eigene Lücke.** `timeZone:
> undefined` blieb grün, weil `Intl` dann die **System**zeitzone nimmt — und die
> ist auf diesem Rechner zufällig Berlin. Der Unterschied zwischen
> „ausdrücklich Berlin" und „zufällig Berlin" ist im laufenden Prozess nicht
> messbar. Die Probe startet dafür jetzt einen **Kindprozess mit `TZ=UTC`**;
> dort trennt sich beides.

### Mutation Testing: 957 Mutanten gegen die Konfliktlogik

`npm run test:mutation:monatsplan` (`stryker.monatsplan.conf.json`).

| Lauf | gesamt | `auegService` | `monatsplanService` |
|---|---:|---:|---:|
| zu Beginn | 65,83 % | 78,04 % | 61,40 % |
| nach den Grenzproben | **70,44 %** | **80,95 %** | 66,67 % |

**Die Punktzahl ist nicht der Maßstab** — die Projektregel verlangt *null
Überlebende im Entscheidungs-Zweig*. Dort saßen drei Klassen, die keine Probe sah:

1. **Welche Spalte die Mandantengrenze zieht.** Vier Abfragen wählen zwischen
   `supplier_org_id` (Agentur) und `org_id` (Kunde). Ein stiller Flip liefert die
   Einsätze der **fremden** Seite — und die Suite blieb grün, weil die Proben nur
   prüften, *dass* gefiltert wird, nicht *womit*.
2. **Was die Kundenspur nicht erfahren darf.** Abwesenheitsgrund und Art des
   Nachweises gehören der Zeitarbeitsfirma. Ein Flip gibt beides weiter.
3. **Die Grenzen der AÜG-Kettenbildung** — die Pausengrenze auf den Tag genau,
   die Klemme am Stichtag, „am Überschreitungstag erreicht" gegen „danach", und
   ob eine Kette offen ist.

**Ein echter Fund nebenbei:** in `ketten()` endeten beide Zweige einer Bedingung
mit `continue` — die Bedingung war wirkungslos. Aufgefallen ist sie nicht beim
Lesen, sondern daran, dass drei Mutanten an dieser Zeile überlebten, **ohne dass
eine Probe sie hätte töten können**. Entfernt.

**Die Schwelle steht jetzt auf dem gemessenen Stand (70 %)** — eine Ratsche: sie
kann nur noch steigen. Die verbleibenden 282 Überlebenden sind überwiegend
strukturell unerreichbar: eine **DB-freie** Suite kann keinen Mutanten in einem
SQL-Text töten, weil der Muster-Pool die Abfrage nie ausführt (dafür gibt es die
wörtlichen SQL-Proben und den Container-Lauf), und ein `x || null` auf einem
Feld, das nie fehlt, ist ein äquivalenter Mutant.

> **Vorsicht bei Stryker-Meldungen.** Von sechs Entscheidungspunkten, die der
> Bericht als „überlebt" führte, waren nach Prüfung von Hand **fünf bereits
> gefangen** — Stryker mutiert dort enger, als der Bericht vermuten lässt
> (`ConditionalExpression → true` trifft einen Teilausdruck, nicht den ganzen).
> Der Bericht ist ein Hinweis, kein Urteil: **nachrechnen, nicht glauben.**

---

## K3.7 — der Monat je Mitarbeiter

**Das Einsatz-Raster zeigt die Minderheit.** Gemessen am 2026-08-31:

| Zeitarbeitsfirma | Mitarbeiter | im April-Raster sichtbar |
|---|---:|---:|
| Demo Zeitarbeit GmbH | 12 | 4 |
| E2E Zeitarbeit GmbH | 7 | **0** |
| Zeitarbeit | 7 | **0** |
| ElektroStaff GmbH | 3 | **0** |
| **über alle Agenturen** | **31** | **4** |

87 % fehlen — und zwar **genau die, die man verplanen will.** Ein Raster mit
Einsätzen als Zeilen kann niemanden zeigen, der gerade keinen Einsatz hat. Ein
Planungswerkzeug, das die freien Leute verschweigt, beantwortet die Frage nicht,
wegen der man es aufschlägt.

`GET /workforce/monatsplan/mitarbeiter` dreht die Achse: **Zeilen sind
Menschen.** Die freie Spanne wird ausgerechnet und benannt, statt sie dem Auge
als Lücke zwischen zwei Balken zu überlassen.

**Belegt heißt: im Einsatz ODER abwesend.** Für die Planung ist beides dasselbe —
die Person steht an dem Tag nicht zur Verfügung. Die Unterscheidung bleibt in den
Listen erhalten, nur die freie Spanne fasst sie zusammen.

**`freieSpannen()` ist eine reine Funktion.** Die Rechnung „was ist frei" ist der
Kern dieser Ansicht und muss einzeln prüfbar sein. Überlappende Spannen werden
zusammengelegt, **bevor** invertiert wird: sonst entstünde zwischen zwei
überlappenden Einsätzen eine freie Spanne, die es nicht gibt — und ein Disponent
besetzte Tage doppelt, weil das Raster sie als frei anbot.

**Wer kein Konto hat, ist trotzdem Mitarbeiter.** `worker_profiles.user_id` ist
seit Migration 175 nullbar: der Mensch existiert, bevor er sich anmeldet. Ein
Verbund über `users` verschluckte genau die frisch importierte Belegschaft. Die
Zeile trägt dann die Personalnummer und ein Kennzeichen.

**Vier Abfragen für beliebig viele Mitarbeiter**, nicht vier je Mitarbeiter.
`workerAvailabilityService.resolveAvailability()` beantwortet **eine** Kraft und
ist punktbezogen („ab wann frei"); darüber zu schleifen wären bei 300
Mitarbeitern 300 Abfragen je Seitenaufruf — die Skalierungsregel des Projekts in
Reinform. Ein Test vergleicht die Abfragezahl für 3 und für 300 Mitarbeiter.

### Und die Fläche kann jetzt gefunden werden

`monatsplan.html` war end-to-end gebaut, im Browser belegt, im Register als
`aktiv` geführt — und über **keine Navigation** erreichbar. Gemessen war sie die
einzige *lebende* Seite von 80, auf die das zutraf; die übrigen neun sind laut
Register tot oder ausdrücklich ohne Navigation.

Sie steht jetzt unter *Deals & Einsätze*. Damit das nicht von Aufmerksamkeit
abhängt, erzwingt es `api/test/erreichbarkeit.test.js`: **was das Register `aktiv`
oder `teilweise` nennt, muss erreichbar sein.** Das Register ist dabei die
Wahrheit, nicht eine zweite Liste — Ausnahmen müssen *dort* stehen und ihren
Grund nennen („bewusst ohne Navigation"). Der Wächter prüft sich selbst: er
erfindet eine unerreichbare Seite und muss sie finden, und er muss eine tote
Seite in Ruhe lassen.

**Im Browser belegt** (echte Antworten aus der laufenden Datenbank): der
Umschalter, das Mitarbeiter-Raster mit **12 Zeilen statt 4** (8 ganzen Monat
frei, 2 teilweise, 2 belegt), *Besetzung prüfen* mit nach freien Tagen sortierten
Kandidaten, und ein echter Befund — Doppelbelegung samt Hebel und AÜG-Frist mit
dem Zusatz *„Diese Besetzung verursacht die Überschreitung."* Dazu Leerzustand
und Fehlerzustand. Konsole ohne Fehler.

**Nachweis:** `api/test/monatsplan.test.js` — 83 Proben (20 zu K3.7, davon 8 zur
reinen Rechnung und 3 am echten Handler). `api/test/erreichbarkeit.test.js` — 5
Proben inkl. Selbsttest und Gegenprobe. **Rückmutationen:** beide Wege des
Erreichbarkeits-Wächters gefangen.

**Eine Datenanomalie, benannt statt geraten:** **6 von 24 Zuordnungen** tragen die
Zeitarbeitsfirma **selbst** als Entleiher (`org_id = supplier_org_id`) —
konsistent zwischen Zuordnung und Einsatz. In der Vorschau erscheint dann die
eigene Firma als Gegenseite. Der Konflikt ist trotzdem wahr (die Kraft ist
gebunden); nur das Etikett ist sinnlos. Welcher Entleiher gemeint war, steht
nirgends — raten wäre das Gegenteil von vorsichtig.

---

## K3.5 — beide Spuren schreibend

**Der wichtigste Befund: beide Schreibwege gab es längst.**

| Spur | Weg | Zustand |
|---|---|---|
| Einsatzunternehmen · Bedarf | `POST /marketplace/demand-requests` | vollständig — Zod-Prüfung, `createDemandRequest`, SLA |
| Zeitarbeitsfirma · Besetzung | `POST /workers/staffing-assignments/:id/quick-assign` | vollständig — `quickAssignSuggestedWorkers`, Rechte, Benachrichtigung, Audit |

K3.5 ist damit **Verdrahtung, kein Neubau** — und ein einziges fehlendes Stück.

**E-K3-2 war bereits erfüllt.** Der Owner hat entschieden, dass in vergangene
Monate geplant werden darf. Gemessen: **keines** der beiden Schemata kennt eine
Vergangenheitssperre (`start_date` trägt nur eine Formatprüfung, `quick-assign`
kennt gar kein Datum). Es war nichts zu lockern — und es wurde auch keine
Beschränkung eingebaut, um sie danach wieder zu entfernen.

### Was fehlte: die Antwort VORHER

Beide Endpunkte sagen erst **nach** dem Schreiben, ob etwas kollidiert. Abschnitt
3b verspricht aber genau das Gegenteil: *„die Doppelbelegung fällt beim Planen
auf, nicht am Einsatztag."* Das ist der Unterschied zwischen einer Warnung, die
noch etwas ändert, und einer, die nur noch erklärt.

`GET /workforce/monatsplan/vorschau?worker_user_id=…&assignment_id=…` beantwortet
für eine **geplante** Besetzung dieselben vier Konfliktarten wie der Monatsplan
für den Bestand — Doppelbelegung, Abwesenheit, AÜG-Höchstdauer, ablaufender
Nachweis.

**Sie schreibt nichts**, und das ist kein Detail: geschrieben wird weiterhin über
`quick-assign`, mit dessen Rechten, dessen CSRF und dessen Audit. Eine zweite
Schreibtür daneben wäre eine Schattenwahrheit. Ein Test prüft, dass in keiner
Abfrage der Vorschau ein `INSERT`, `UPDATE` oder `DELETE` steht.

**Nur die Agenturspur.** Ein Bedarf ist eine Absicht — er bindet niemanden und
kollidiert mit niemandem. Eine Besetzung ist eine Zusage über einen Menschen. Die
Kundenspur bekommt deshalb `400 NUR_AGENTURSPUR`, **nicht** eine leere Liste:
leer wäre von „keine Konflikte" nicht zu unterscheiden.

### Zwei Riegel, beide nötig

| Riegel | Prüfung | Ohne ihn |
|---|---|---|
| der Einsatz gehört der Firma | `assignments.supplier_org_id` | fremde Einsatzpläne einsehbar |
| **die Kraft gehört der Firma** | `worker_profiles.supplier_org_id` | ein Auskunftsdienst: *„nenne mir eine beliebige Personenkennung, ich sage dir, wann sie gebucht ist"* |

Beide antworten mit **403 und ohne Zusatzangabe**. Ein 404 für das eine und ein
403 für das andere wäre selbst schon eine Auskunft darüber, welche Kennungen es
gibt.

### Die AÜG-Frist wird gedanklich neu gerechnet

Der geplante Zeitraum wird an die echte Geschichte **gehängt** und die Kette neu
gebildet — genau die gesetzliche Frage aus § 1 Abs. 1b AÜG. Gemeldet wird mit dem
Feld `durch_diese_besetzung`, ob **diese Handlung** die Überschreitung verursacht
oder ob sie schon vorlag. Ohne diese Unterscheidung wäre die Meldung nicht
handlungsleitend: „ist ohnehin schon gerissen" verlangt etwas anderes als „wird
durch Ihre Besetzung reißen".

**Eine bewusste Abgrenzung, im Test festgehalten:** eine Frist, die **erst nach**
dem geplanten Einsatz reißt, meldet die Vorschau **nicht**. Das ist eine Aussage
über den Bestand, und die steht im Monatsplan. Dieselbe Sache an zwei Stellen zu
führen heißt: wer sie einmal als „kenne ich schon" wegklickt, klickt sie überall
weg.

**Nachweis:** `api/test/monatsplan.test.js` — 62 Proben, davon 16 zur Vorschau
(4 am echten Handler). **Zwölf Rückmutationen an der Produktionsquelle, alle
zwölf gefangen.** `api/test/integration/monatsplan.flow.test.js` — **26/26 im
Container gegen das echte Schema**, darunter ein echter fremder Einsatz und eine
echte firmenfremde Kraft, beide abgewiesen.

**Offen:** die Bedienelemente auf `monatsplan.html`. Der Endpunkt trägt, die
Fläche ruft ihn noch nicht.

---

## K3.5 — die Vorarbeit: drei Befunde, einer davon meiner

Bevor die Fläche schreiben darf, muss sie stimmen. Beim Nachsehen, wie die
Schreibwege an die bestehende Domäne andocken (`createDemandRequest`,
`createWorkerAssignmentLink`), sind drei Dinge herausgefallen — **keines davon
war im Browser sichtbar**, und das ist ihr gemeinsames Merkmal.

### 1. Die Bedarfsliste konnte nie etwas finden — echter Ausfall

`demand_requests.requester_company_id` trägt eine **Nutzer**kennung. Gemessen:
40 von 40 Zeilen verbinden sich mit `users`, **null** mit `organizations`. Jeder
andere Dienst im Repo verbindet entsprechend (`JOIN users u ON u.id =
dr.requester_company_id`) — `monatsplanService` war die einzige Abweichung und
filterte mit der **Org**kennung:

```
Filter von heute (orgId gegen requester_company_id) …  0 Zeilen im GANZEN Bestand
korrigiert über users.org_id ……………………………………………………  25 von 40 Zeilen
```

Die Folge war nicht nur eine leere Liste. `offeneBedarfe()` leitet den weichen
Konflikt **aus dieser Liste** ab — die fünfte Konfliktart konnte damit
strukturell nie feuern, während K3.4 „alle fünf Arten" meldete. Nach der
Korrektur liefert die Kundenspur im September 2026 drei Bedarfe und **einen**
offenen-Bedarf-Konflikt.

Warum es keiner sah: der Browser-Nachweis der Fläche lief auf der **Agentur**spur,
und dort gibt `bedarfe()` planmäßig sofort `[]` zurück. Eine leere Liste sieht aus
wie kein Bedarf — dieselbe Fehlerklasse, die diese ganze Welle behandelt.

### 2. Eine nicht mehr geltende Zuordnung band trotzdem — latent

Gemessen: **9 von 24 Zuordnungen** stehen auf `is_active = FALSE`, eine auf
`worker_unavailable`. Die vier Abfragen über `worker_assignment_links` prüften
diesen Zustand nicht. Der Plan hätte eine Absage als Besetzung geführt und aus
ihr eine Doppelbelegung gebaut.

**Wirkung im heutigen Bestand: null** — es gibt derzeit keine einzige
Doppelbelegung. Der Defekt ist latent; mit K3.5 wird er scharf, denn dann ist der
Plan die Fläche, aus der heraus jemand schreibt.

Die Domäne prüft in `getWorkerSchedulingConflicts` genau so. **Nicht** übernommen
wird ihr Lebenszyklus-Prädikat (`buildAssignmentActivePredicateSql`): das misst
gegen `CURRENT_DATE` und beantwortet *„wer ist gerade im Einsatz"*. Der Plan fragt
*„wer ist in DIESEM Fenster gebunden"* — für einen Monat in der Zukunft wäre die
Heute-Frage die falsche und würde jede Vorausplanung leerräumen. Ein Test hält
fest, dass `CURRENT_DATE` hier **nicht** auftaucht.

### 3. Ein Fehlalarm aus meinem eigenen Prüfstand — und was er trotzdem wert war

Eine Messung zeigte scheinbar, dass Datumswerte als Zeitstempel herausgehen
(`"2026-03-10T23:00:00.000Z"` statt `"2026-03-11"`), was auf der Fläche den
**Vortag** ergeben hätte. Das war **kein Produktfehler**: mein Messskript hatte
sich einen eigenen `pg.Pool` gebaut, ohne `api/db/typeParsers.js` zu laden. Der
echte Pool lädt ihn (`api/db/pool.js:7`), und `pg` hält Typparser modulweit — die
Zusage steht plattformweit. Ein bereits eingebauter `TO_CHAR`-Riegel wurde
deshalb **wieder entfernt**: eine zweite Mechanik für dieselbe Zusage ist keine
doppelte Sicherheit, sondern die Garantie, dass beim nächsten Umbau nur eine von
beiden nachgezogen wird.

Der Fehlalarm hat trotzdem eine echte Lücke aufgedeckt: **jeder Kalendertag der
Plattform hängt an dieser einen Importzeile, und nichts hielt sie fest.** Wer sie
beim Aufräumen entfernt — sie sieht aus wie ein unbenutzter Import — dreht in
einem Schritt jedes Datum auf den Vortag zurück: Vertragsende, Sperrdatum,
Abrechnungswoche. Der Wächter dafür steht jetzt in `api/test/kalendertagDE.test.js`.

> **Beim Rückmutieren fiel dieser neue Wächter zunächst selbst durch** — auf die
> Falle, vor der dieselbe Datei weiter oben warnt: `// import "./typeParsers.js";`
> enthält den gesuchten Text weiterhin, ein Muster ohne Kommentarstreifen hält das
> für einen gültigen Import. Ein Wächter, der ein Auskommentieren nicht bemerkt,
> bewacht nichts.

### Und eine Probe, die sich selbst als blind erwies

Die erste Fassung der Integrationsprobe für Kalendertage lief über
`plan.eintraege` und bestand auch bei leerem Monat — eine grüne Zusage über null
Werte. Sie zählt jetzt mit, wie viele Felder sie tatsächlich angesehen hat, und
fällt durch, wenn sie nichts zu prüfen bekam.

**Nachweis:** `api/test/monatsplan.test.js` (46 Proben), `api/test/kalendertagDE.test.js`
(7, davon 3 neu), `api/test/integration/monatsplan.flow.test.js` — **22/22 im
Container gegen das echte Schema**. **Neun Rückmutationen an der Produktionsquelle,
jede von genau der zuständigen Probe gefangen** (im ersten Durchgang acht von
neun — die Lücke ist oben beschrieben und geschlossen).

**Offene Datenlücke, benannt statt geschluckt:** 15 der 40 Bedarfe gehören einem
Besteller **ohne Organisation** (`users.org_id IS NULL`). Sie erscheinen in keiner
Kundenspur. Das ist keine Lücke im Code, sondern in den Daten — wie die 49
ankerlosen Einsätze aus E-K3-4 wird sie benannt und nicht geraten.

---

## K3.3 — die Fläche

`GET /workforce/monatsplan` in `api/routes/workforce.js`, Seite `monatsplan.html`
mit `js/pages/monatsplan.js`.

**Die Spur wird abgeleitet, nicht erfragt.** `organizations.type` ist `company`
oder `agency`; daraus folgt die Spur. Käme sie aus dem Browser, könnte ein
Einsatzunternehmen die Agentur-Sicht anfordern — und die zeigt bei einer
Doppelbelegung den Namen der Gegenseite. Im Zweifel gilt die Kundenspur, weil
sie die engere ist.

**Das Raster schneidet an, statt zu kürzen.** Ein Balken, der vor dem Monat
begann, läuft ohne linke Rundung aus dem Bild und trägt ein `←`; einer ohne
Enddatum reicht bis zum Monatsrand und trägt „läuft noch →" (E-K3-3). Der
Vermerk kommt vom Server — eine Fläche, die ihn selbst erfindet, nennt ihn beim
nächsten Mal anders.

**Konflikte sind Information plus Hebel.** Jeder nennt, was kollidiert, und die
Handlung, die auf der **eigenen** Seite löst — bei einer Doppelbelegung sagt die
Agentur-Ansicht *„besetzen Sie einen der beiden Einsätze anders, ohne
Rückfrage"*, die Kundenansicht *„fordern Sie eine andere Einsatzkraft an"*. Es
geht keine Aufforderung an die Gegenseite raus.

**Im Browser belegt** (Vorschau-Server des Worktrees, echte Dienst-Antwort aus
der laufenden Datenbank): Raster mit vier angeschnittenen Balken, drei mit
„läuft noch", zwei harte AÜG-Befunde mit Datum und Hebel, der Hinweis auf die
Grenze der Datenlage. Dazu der **Leerzustand** („In diesem Monat ist nichts
geplant") und der **Fehlerzustand**. Konsole ohne Fehler.

> **Was der Browser hier NICHT beweist.** Der API-Container läuft einen
> Prozess-Schnappschuss vom Startzeitpunkt und kennt die neue Route nicht — die
> Fläche wurde deshalb gegen eine **echte, aus der laufenden Datenbank gezogene**
> Dienst-Antwort geprüft, nicht gegen den laufenden Server. Dass die Route selbst
> trägt, belegen die Proben am echten Handler und die Container-Tests.

---

## K3.2 — die Datenlage, gemessen *(2026-08-31, laufende Datenbank)*

| Was | Zahl |
|---|---|
| Einsätze | **68** — 52 geplant, 14 aktiv, 2 abgeschlossen |
| davon mit Enddatum | 45 |
| **über eine Monatsgrenze hinweg** | **41 von 45 — 91 %** |
| Spannweite | 34 spannen **drei** Monate; nur **5** bleiben in einem einzigen |
| Dauer | Ø **98 Tage**, kürzester 4, längster 550 |
| Vorlauf (Anlage → Beginn) | Ø **10 Tage**, höchstens 40 |
| **rückwirkend angelegt** | **17 von 68 — 25 %** (Beginn liegt vor der Anlage, bis zu 426 Tage) |
| später geändert | 7 |
| Bedarfe | 40, davon **26 über eine Monatsgrenze** |
| Angebote | 38, davon 22 bestätigt |
| Kraft-Zuordnungen | 24 auf 15 Kräfte und 15 Einsätze |
| Doppelbelegung im Bestand | **0 echte** — die zuerst gemeldete war ein Phantom, siehe Korrektur unten |
| **Zuordnungen, die nie geschlossen wurden** | **3** — `end_date IS NULL`, obwohl der Einsatz beendet ist |
| Abwesenheiten | **0** — `worker_absences` existiert und ist leer |
| AÜG-Überlassungsdauer | **kein Feld im Schema** |

**Drei Befunde, die den Entwurf bestimmen:**

**(1) Der Monat ist ein Fenster, kein Kasten.** 91 % der Einsätze überschreiten
eine Monatsgrenze, 34 von 45 spannen drei Monate. Ein Raster, das den Monat als
abgeschlossene Einheit behandelt, wäre für **neun von zehn Zeilen falsch** — es
würde entweder Einsätze weglassen, die im Vormonat begannen, oder sie so
darstellen, als begännen sie am Ersten. Beides ist eine Unwahrheit über einen
laufenden Einsatz.

**(2) Ein Viertel wird rückwirkend angelegt.** 17 von 68 Einsätzen haben einen
Beginn, der vor ihrer Anlage liegt — bis zu 426 Tage. Die Fläche ist also nicht
nur ein Planungswerkzeug, sondern auch ein Nachtragewerkzeug. Ein Raster, das
nur in die Zukunft zeigt, träfe ein Viertel der Wirklichkeit nicht.

**(3) Der harte Konflikt ist kein Fund — aber die Datenhygiene ist einer.**

> **Korrektur (2026-08-31, beim Bauen von K3.4).** Die erste Fassung dieses
> Abschnitts meldete *„eine echte Doppelbelegung liegt im Bestand"*. **Das war
> falsch.** Die Zählung las nur `worker_assignment_links` — und dort steht bei
> **drei** Zuordnungen `end_date IS NULL`, obwohl ihr Einsatz längst beendet ist.
> Einer davon endete am **31.03.2025**; er erzeugte eine Überschneidung mit einem
> Einsatz ab dem 01.04.2026, die es in Wirklichkeit nie gab.
>
> **Gegen die wirksame Zeitspanne gerechnet — Link-Ende, begrenzt vom Ende des
> Einsatzes — gibt es null Doppelbelegungen.**

Der Befund ist damit ein anderer, aber kein kleinerer: **Zuordnungen werden beim
Abschluss eines Einsatzes nicht geschlossen.** Eine naive Konfliktprüfung hätte
daraus einen **dauerhaften Fehlalarm** gemacht — und ein Konflikt, der immer da
ist, wird weggeklickt; danach übersieht man den echten. Die Prüfung rechnet
deshalb gegen die wirksame Spanne, nicht gegen den Link
(`WIRKSAMES_ENDE` in `monatsplanService.js`).

---

## K3.1 — der Entwurf *(wartet auf Owner-Freigabe)*

### Das Leitbild

> **Der Monat ist die Ansicht, der Einsatz ist die Sache.**

Ein Einsatz, der im Vormonat begann, wird **am linken Rand angeschnitten**
dargestellt — mit dem Hinweis, seit wann er läuft. Ein Einsatz ohne Enddatum
läuft **über den rechten Rand hinaus**. Nichts wird auf den Monat zurechtgestutzt.

### Zwei Spuren, kein Pingpong *(Owner-Entscheid 2026-08-27)*

| | Einsatzunternehmen | Zeitarbeitsfirma |
|---|---|---|
| legt an | **Bedarf** — „hier brauche ich jemanden" | **Besetzung** — „diese Person kommt" |
| sieht | eigene Einsätze und Bedarfe | den ganzen eigenen Bestand |
| braucht Zustimmung | **nein** | **nein** |
| ändert Einträge der Gegenseite | **nein** | **nein** |

Ein Bedarf ist kein Auftrag, sondern eine sichtbare Absicht. Eine Besetzung ist
keine Bitte, sondern eine Zusage.

### Die Konflikte, nach Härtegrad getrennt

| | Konflikt | Grad | Datenlage heute |
|---|---|---|---|
| **H1** | eine Person, zwei Orte gleichzeitig | hart | ✅ berechenbar — **0 echte Fälle**, gegen die wirksame Spanne gerechnet |
| **H2** | Abwesenheit im Zeitraum | hart | ⚠️ Tabelle vorhanden, **0 Zeilen** — prüfbar, aber ungenutzt |
| **H3** | AÜG-Überlassungshöchstdauer überschritten | hart | ✅ **gebaut** (Mig 211, `auegService`) — hart bei erreichter Frist, weich drei Monate vorher |
| **W1** | Bedarf unbesetzt | weich | ✅ berechenbar (Bedarf ohne Besetzung im Zeitraum) |
| **W2** | Nachweis läuft im Zeitraum ab | weich | ✅ berechenbar aus `compliance_documents` |

**Ein Konflikt erzeugt kein Formular und keine Aufforderung an die Gegenseite.**
Er nennt, was kollidiert, und bietet die Handlung an, die **auf der eigenen
Seite** löst. Niemand wartet auf niemanden.

### Was der Entwurf bewusst NICHT tut

- **Keine Zustimmungspflicht**, in keiner Richtung.
- **Keine Benachrichtigung an die Gegenseite** bei einem Konflikt — sonst wäre
  aus der Information doch wieder eine Bitte geworden.
- **Kein Schreiben in die Spur der Gegenseite** — auch nicht „hilfsweise".
- **Keine eigene Terminverwaltung.** Der Monat liest aus Live-Belegschaft und
  Marktplatz; er legt keine dritte Wahrheit über Einsätze an.

### Die Entscheidungen — **beantwortet am 2026-08-31**

| | Frage | Entscheid | Stand |
|---|---|---|---|
| **E-K3-1** | AÜG-Höchstdauer prüfen? | **ja — prüfen und darstellen** | ✅ gebaut, Mig 211 + `auegService` |
| **E-K3-2** | in vergangene Monate planen? | **ja** — *„alleine wegen fehlenden Stundenzetteln"* | ⏭ gilt für K3.5 |
| **E-K3-3** | offene Einsätze am Rand? | **bis zum Monatsrand, mit Vermerk „läuft noch"** | ✅ `randvermerk` im Dienst |
| **E-K3-4** | Zuordnungen aufräumen? | **ja, aber vorher mehrfach prüfen** | ✅ Mig 210, acht Wege geprüft |

### Was aus E-K3-1 geworden ist

**§ 1 Abs. 1b AÜG**, gerechnet je Paar *(Kraft, Entleiher)* — nicht je Vertrag:
18 aufeinander folgende Monate, wobei frühere Überlassungen an **denselben
Entleiher** vollständig angerechnet werden, wenn dazwischen **nicht mehr als
drei Monate** liegen. Auch die eines **anderen Verleihers**.

Drei Vorsichtsmaßnahmen, weil die Rechtsfolge erheblich ist (§ 9 Abs. 1 Nr. 1b,
§ 10 Abs. 1 — fingiertes Arbeitsverhältnis beim Entleiher, dazu Bußgeld):

1. **Die Frist ist konfigurierbar** (`aueg_konfiguration`). 18 ist die
   Voreinstellung, nicht das Gesetz in Stein: Tarifverträge der Einsatzbranche
   dürfen abweichen, in der Metall- und Elektroindustrie sind 24, 36 oder 48
   Monate üblich. Wer abweicht, **muss die Grundlage benennen** — das erzwingt
   die Datenbank, nicht der Code.
2. **Die Kettenbildung ist eine reine Funktion.** `ketten()` bekommt Zeiträume
   und gibt Ketten zurück, ohne Datenbank — der rechtliche Kern ist damit
   einzeln prüfbar, und er *ist* einzeln geprüft.
3. **Die Grenze der Datenlage steht in jeder Antwort** (`nur_plattformdaten`).
   Lief dieselbe Kraft zuvor über einen Verleiher, der TempConnect nicht
   benutzt, fehlt die Zeit — obwohl das Gesetz sie anrechnen würde. Eine Frist,
   die sich sicherer gibt, als sie ist, wäre die schlechtere Variante von gar
   keiner.

> **Zwei Falschalarme, beim Bauen gefangen — und beide hätten die Prüfung
> wertlos gemacht.** Ein Alarm, den man einmal als falsch erlebt hat, wird beim
> nächsten Mal nicht geglaubt.
>
> **(1)** Eine Kette vom 12.03. bis 12.04.2026 hat ihren rechnerischen
> 18-Monats-Punkt am 12.09.2027. Wer den September 2027 aufschlug, bekam eine
> Überschreitung gemeldet — für eine Überlassung, die anderthalb Jahre vorher
> geendet hatte. Ursache: ein Rückfall auf „die letzte Kette".
>
> **(2)** `ueberschritten` rechnete gegen **heute**, der Härtegrad gegen das
> **Fenster**. Dieselbe Zeile sagte „hart" und „nicht überschritten".
>
> **Und ein dritter Fund beim Prüfen der Prüfung:** die beiden Riegel gegen
> diese Falschalarme **deckten sich gegenseitig** — einzeln entfernt blieb die
> Suite grün. Zwei Riegel, die einander verdecken, sind beim nächsten Umbau
> einer zu viel und einer zu wenig. Es gibt jetzt für jeden einen eigenen,
> isolierten Testfall.

### Was aus E-K3-4 geworden ist

**Acht unabhängige Wege**, zwei Funde:

| Weg | | Vorher | Nachher |
|---|---|---|---|
| A | Link offen, Einsatz beendet | 3 | 0 |
| B | Link endet nach dem Einsatz | 0 | 0 |
| C | Link offen, Einsatz abgeschlossen | 1 | 0 |
| D | verwaist (Einsatz fehlt) | 0 | 0 |
| E | Ende vor Beginn | 0 | 0 |
| F | Link beginnt vor dem Einsatz | 0 | 0 |
| G | doppelter Link | 0 | 0 |
| H | Org weicht vom Einsatz ab | 2 | 0 |

Weg **H** stellte sich als etwas anderes heraus als gedacht: kein Widerspruch,
sondern eine **Lücke** — `assignments.supplier_org_id` war NULL, während die
Zuordnung den Lieferanten kannte. Nachgemessen: **51 von 68 Einsätzen tragen
überhaupt keinen Lieferanten**, und für **49** davon gibt es *keinerlei* Anker
(kein Angebot, kein Vertrag, keine Ausschreibung, keine Zuordnung).

**Migration 210 fasst nur an, was in allen Wegen übereinstimmt:** drei
Zuordnungen geschlossen, zwei Lieferanten nachgetragen. Die 49 ankerlosen
bleiben unberührt — sie zu raten wäre das Gegenteil von vorsichtig. Die
Migration **zählt vorher nach und bricht ab**, wenn sie eine Größenordnung mehr
findet als gemessen, und legt das **Vorher-Bild** in `zuordnung_bereinigung_210`
ab: eine Bestandsänderung ohne Rückweg ist keine.

> **Ein eigener Befund, der bleibt:** 49 Einsätze ohne jeden Lieferanten. Die
> Agentur-Spur der Monatsplanung sieht sie deshalb nicht. Das ist keine Lücke
> im Code, sondern in den Daten — und sie ist hier festgehalten, statt still
> zu bleiben.

---

### K4 · Der Feed fällt nie auf leer — ✅ **gebaut 2026-08-28** (`eb46707`)

| Phase | Inhalt | Stand |
|---|---|---|
| K4.1 | Kopie der letzten guten Liste dauerhaft ablegen | ✅ Migration 204, `marktplatz_feed_kopie` (genau eine Zeile, `CHECK (id = 1)`, UPSERT) |
| K4.2 | Im Fehlerfall ausliefern, mit Datum des Standes | ✅ `aus_kopie: true` + `kopie_stand` in `GET /capacity-exchange/feed` |
| K4.3 | Meldung an das Team beim Rückfall | ⚠️ **nicht baubar — siehe unten.** Ersatz: gezählt (`rueckfaelle`, `letzter_rueckfall`) und auf `error` protokolliert |
| K4.4 | 24-Stunden-Grenze | ✅ darüber wird geschwiegen statt gealtert ausgeliefert |
| **K4.5** | *(dazugekommen)* **Eine leere Liste wird nicht aufgehoben** | ✅ sonst könnte ein einzelner leerer Moment zur dauerhaften Rückfall-Antwort werden — der Rückfall zeigte dann genau das, was er verhindern soll |

**Belege:** `api/services/feedKopieService.js`, `api/test/feedKopie.test.js`
(18 Proben, davon **3 am echten Handler**), vier Rückmutationen — Filter ignoriert,
leere Liste doch aufgehoben, 24-Stunden-Grenze entfernt, Rückfall aus dem `catch`
entfernt — **jede von genau der zuständigen Probe gefangen**.

> **Zwei Funde beim Bauen, festgehalten statt übertüncht.**
>
> **(a) K4.3 war nicht baubar.** `notificationMatrix.dispatch()` kennt nur org- und
> vorgangsbezogene Empfänger und **überspringt einen unbekannten Ereignis-Schlüssel
> wortlos** (`sent: 0`, kein Fehler); `writeStaffAudit()` verlangt zwingend eine
> handelnde Person und wirft ohne sie — ein Systemereignis hat keine. Mein erster
> Entwurf wäre still versickert, also genau die Fehlerklasse, gegen die diese Welle
> antritt. Einen Kanal zu erfinden wäre hier der falsche Ort gewesen. **Die Lücke
> trifft K1.1 erneut** und ist in der Übergabe als `K4-B1` geführt.
>
> **(b) Die Verdrahtungs-Probe hat sich sofort bezahlt gemacht.** Sie fand beim
> ersten Lauf einen `ReferenceError`: `opts` war mit `const` **innerhalb** des `try`
> deklariert und im `catch` nicht sichtbar. Der Rückfall hätte in der Praxis **nie
> gegriffen** — und alle acht Dienst-Proben wären trotzdem grün gewesen.

---

## 5. Reihenfolge

```
K0 (erledigt sich mit dem Merge)          ✅ durch
 ├── K4 (Feed-Rückfall)      ← klein, schützt die sichtbarste Fläche   ✅ eb46707
 ├── K1 (Rabatt + Eingriff)  ← behebt einen Geldfehler                 ✅ gebaut
 ├── K2 (Werbe-Cashback)     ← Gate + alle Phasen                     ✅ gebaut
 └── K3 (Monatsplanung)      ← braucht Welle J vollständig             ⏭ als Nächstes
```

**Empfohlen: K0 → K4 → K1 → K2 → K3.**

---

## 6. Was noch offen ist

| Punkt | Art |
|---|---|
| ~~**Verträgt der Abrechnungsweg 0 €?** (K2.2)~~ | ✅ **gemessen und behoben** — Ergebnis im Abschnitt „Das Ergebnis des Gates" |
| ~~**Stapelung** 100 % neben Treuerabatt (K2.6)~~ | ✅ **entschieden und gebaut**: die Quellen addieren sich und werden bei 100 gekappt. Der Treuerabatt geht nicht verloren — verbraucht wird immer nur die Prämie, seine Bounties bleiben aktiv und wirken im Folgemonat weiter. |

---

## 7. Was Welle K **nicht** tut

- **Die Rabatt-Rechenkette umbauen.** Eine einzige Ausnahme: die Deckelung für den
  Cashback-Typ (2.3).
- **Einen zweiten Bounty-Katalog bauen.**
- **Einen „Pilot-Verlängerungs"-Mechanismus bauen.** Die Prämie ist ein Bounty.
- **Einen allgemeinen Feed-Cache einführen.** Die Kopie greift nur im Fehlerfall.
- **Hochverfügbarkeit über mehrere Server.** Eigene Entscheidung, eigene Skalierungsstufe.
- **Genehmigungswege zwischen Staff-Rollen bauen.** Es gibt nur eine Person.
- **OCC-Module anlegen oder entfernen** — siehe [`FLAECHEN.md`](../FLAECHEN.md). Die
  Bounty-Verwaltung gehört ins **Staff CC**: sie betrifft die Plattform als Ganzes.
