# Welle K — Bounty-Auszahlung, Werbe-Cashback, Monatsplanung

> **Status (2026-08-31): K0 ✅ · K4 ✅ · K1 ✅ · Gate K2.2 ✅ beantwortet · K2.4–K2.7 offen · K3 offen.**
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
| K2.4 | Karenz-Uhr: der Geworbene muss 30 Tage bestehen | Kündigung an Tag 29 → keine Prämie |
| K2.5 | Deckel bei 3 Monaten | vierter geworbener Kunde → keine weitere Prämie |
| K2.6 | Stapelung klären: 100 % neben einem Treuerabatt | Ergebnis nie über 100 %, Treuerabatt geht nicht verloren |
| K2.7 | Eingriffspunkt wie K1.4 | Audit-Probe |

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

| Phase | Inhalt | Nachweis |
|---|---|---|
| K3.1 | **Entwurf nach 3b** — zwei Spuren, keine Zustimmungspflicht. Ein Bild, kein Code. | **Owner-Freigabe des Entwurfs** |
| K3.2 | **Datenlage messen:** Einsätze über Monatsgrenzen, Vorlauf, nachträgliche Änderungen | Zahlen aus der laufenden Datenbank |
| K3.3 | Lesende Fläche: der Monat als Raster aus Live-Belegschaft + Marktplatz | Browser-Nachweis, Zero-State, Org-Grenze |
| K3.4 | **Konflikte nach 3b** — hart und weich getrennt | jede Konfliktart mit echter Zeile belegt |
| K3.5 | Beide Spuren schreibend, ohne Zustimmungspflicht | keine Seite kann Einträge der anderen ändern |
| K3.6 | Härtung: Skalierung (10 → 300), `Europe/Berlin`, Mutation Testing auf der Konfliktlogik | Lastprobe + Mutationsergebnis |

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
 ├── K2 (Werbe-Cashback)     ← Gate K2.2 ✅, K2.3 ✅, K2.4-K2.7 offen   ⏭ laeuft
 └── K3 (Monatsplanung)      ← braucht Welle J vollständig             offen
```

**Empfohlen: K0 → K4 → K1 → K2 → K3.**

---

## 6. Was noch offen ist

| Punkt | Art |
|---|---|
| **Verträgt der Abrechnungsweg 0 €?** (K2.2) | technisch — wird gemessen, nicht entschieden |
| **Stapelung** 100 % neben Treuerabatt (K2.6) | Vorschlag: der höhere gilt, der Treuerabatt bleibt für den Folgemonat erhalten |

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
