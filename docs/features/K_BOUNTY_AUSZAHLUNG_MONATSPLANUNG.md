# Welle K — Bounty-Auszahlung, Werbe-Cashback, Monatsplanung

> **Status (2026-08-29): K0 ✅ · K4 ✅ gebaut · K1 als Nächstes · K2, K3 offen.**
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

### K1 · Der Rabatt wird sichtbar *(unabhängig)*

| Phase | Inhalt | Nachweis |
|---|---|---|
| K1.1 | **Der stille Ausfall wird laut.** Scheitert `getUserDiscount`, entsteht eine Meldung mit Kunde, Monat, Grund. | Rückmutation: Fehler erzwingen → Meldung entsteht |
| K1.2 | **Einzelfall-Ansicht im Staff CC:** aktive Bounties, Satz, Tier-Grenze, letzte Rechnung. | Probe gegen einen der 754 echten Fälle |
| K1.3 | **Vorschau auf den nächsten Lauf** — was würde angesetzt, bevor es läuft. | Vorschau = tatsächlicher Lauf |
| K1.4 | **Eingriff nach 3a:** kein freies Feld, Wirkungsvorschau in Euro, Verfall, nie in eigener Sache, Quelle auf der Rechnung. | je Riegel eine Probe **und** eine Rückmutation |
| K1.5 | **Monatsübersicht der Eingriffe** | Summe stimmt mit den Einzelfällen überein |

---

### K2 · Werbe-Cashback *(unabhängig)*

**Regel:** ein 100 %-Bounty je geworbenem Kunden, **nach 30 Tagen Bestand**,
**höchstens 3 Monate**, **nächste Rechnung frei** (keine Rückerstattung). Der
Geworbene bekommt **nichts extra**.

| Phase | Inhalt | Nachweis |
|---|---|---|
| K2.1 | **Erhebung:** ist `referrals` → Prämie heute verdrahtet? `reward_applied_at` prüfen. | Befund, nicht Vermutung |
| K2.2 | **Vertragen 0-€-Rechnungen den Weg?** `berechneRabatt(netto, 100)` → netto 0, Steuer 0, gesamt 0 — durch `createInvoice`, den Zahlungsweg und den PDF-Beleg. | **Bevor** irgendetwas gebaut wird |
| K2.3 | **Ausnahme von der Tier-Deckelung** für den Cashback-Typ (siehe 2.3) | Bronze-Kunde bekommt 100 %, nicht 8 % |
| K2.4 | Karenz-Uhr: der Geworbene muss 30 Tage bestehen | Kündigung an Tag 29 → keine Prämie |
| K2.5 | Deckel bei 3 Monaten | vierter geworbener Kunde → keine weitere Prämie |
| K2.6 | Stapelung klären: 100 % neben einem Treuerabatt | Ergebnis nie über 100 %, Treuerabatt geht nicht verloren |
| K2.7 | Eingriffspunkt wie K1.4 | Audit-Probe |

> **K2.2 ist ein Gate, keine Phase.** Verträgt der Abrechnungsweg keine 0-€-Rechnung,
> ändert das den ganzen Entwurf — dann ist die Prämie z. B. 99 % plus ein
> Restbetrag, oder ein Gutschriftsweg. Das muss vor dem Bau feststehen.

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
 ├── K1 (Rabatt + Eingriff)  ← behebt einen Geldfehler                 ⏭ als Nächstes
 ├── K2 (Werbe-Cashback)     ← Gate K2.2 zuerst                        offen
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
