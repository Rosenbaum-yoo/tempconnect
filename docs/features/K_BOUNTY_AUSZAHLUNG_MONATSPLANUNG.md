# Welle K — Bounty-Auszahlung sichtbar machen, Monatsplanung bauen

> **Status: geplant, Owner-Entscheidungen getroffen (2026-08-27). Noch nicht gebaut.**
> Owner-Abschnitte **12** und **13**, dazu zwei Punkte aus dem Betrieb.
>
> Vorgänger: [`I_AUDIT_ZUWEISUNG_SUPPORT.md`](I_AUDIT_ZUWEISUNG_SUPPORT.md) (Welle I),
> [`J_LIVE_BELEGSCHAFT_MARKTPLATZ.md`](J_LIVE_BELEGSCHAFT_MARKTPLATZ.md) (Welle J, läuft).

---

## 0. Owner-Vorgaben (2026-08-27, im Wortlaut)

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

### Die vier Entscheidungen vom 27.08.

| Frage | Entscheid |
|---|---|
| **Pilot-Verlängerung** | Ein Monat je geworbenem Kunden — **erst nach 30 Tagen Bestand** des Geworbenen, **gedeckelt auf 3 Monate** |
| **Bounty-Eingriff nach oben** | Erlaubt bis zur Tier-Grenze — **aber mit Missbrauchsschutz**: *„so wäre auch Machtmissbrauch möglich, deshalb begrenzen"* |
| **Monatsplanung** | **Beide planen** — Agentur und Einsatzunternehmen — **ohne Pflicht-Hin-und-Her** |
| **Angebote** | Der Satz war auf den Fehler gemünzt (behoben in `e845c2d`). **Neu dazu:** bei künftigen Fehlern nicht leer anzeigen, sondern die letzte gute Liste |

---

## 1. Die Leitfrage

Abschnitt 12 klingt nach „bauen", ist aber zum größten Teil **schon gebaut** — nur
sieht das niemand. Abschnitt 13 klingt nach „noch eine Liste", ist aber das erste
Stück der Plattform, das etwas **vorausdenkt** statt zurückzuschauen.

Beide teilen dieselbe Frage:

> **Wo endet die Automatik, und wo fängt der Mensch an — ohne dass daraus eine
> Hintertür wird?**

---

## 2. Ist-Stand — gemessen, nicht vermutet

Alles am 2026-08-27 gegen die laufende Datenbank und den Quelltext erhoben.

### 2.1 Bounties: die Auszahlung läuft bereits

| | |
|---|---|
| Katalog-Einträge (`bounties`) | **15** |
| **verdiente Bounties** (`user_bounties`) | **754** |
| Stufen (`bounty_tiers`) | 5 (Bronze 8 % … Diamant 25 %) |
| bezahlte Sichtbarkeit (`profile_bounties`) | 0 — anderes Feature, hier nicht gemeint |

**Die Kette ist vollständig und funktioniert:**

```
user_bounties (754)
  → bountyService.getUserDiscount()   SUM(discount_pct), gedeckelt vom Tier
  → recurringBillingService:231       rabattSatz je Abo-Lauf
  → invoiceService.createInvoice()    berechneRabatt(netto, satz)
  → invoices.discount_pct / discount_amount_cents / discount_source='bounty'
```

Der Satz wird **eingefroren**: *„Der Satz von heute steht in dieser Zeile. Verliert
der Kunde das Bounty nächsten Monat, bleibt diese Rechnung unverändert."*
(`recurringBillingService:251`)

**Es fehlt also kein Auszahlungsmechanismus.** Er ist da, automatisch, monatlich.

### 2.2 Was fehlt: der Eingriffspunkt

**Erstens — ein Ausfall ist nur eine Log-Zeile.**

```js
let rabattSatz = 0;
try {
  rabattSatz = Number(await getUserDiscount(pool, s.user_id)) || 0;
} catch (e) {
  logger?.warn?.({ ... }, "Folgerechnung: Rabattsatz nicht ermittelbar, Rechnung ohne Rabatt");
}
```

Der Kommentar darüber verspricht: *„Fällt er aus, wird trotzdem abgerechnet — aber
**sichtbar, nicht stumm**: eine Rechnung ohne Rabatt ist ein Fehler, den jemand
sehen muss."*

**Ein `logger.warn` ist nicht sichtbar.** Ein Kunde mit 15 % Treuerabatt zahlt den
vollen Preis, die Rechnung ist raus, und der einzige Zeuge ist eine Logdatei, die
niemand liest. Dieselbe Fehlerklasse wie in Welle I — eine Zusage im Kommentar,
die der Code nicht einlöst — nur geht es hier um **Geld auf einer Rechnung**.

**Zweitens — das Staff CC verwaltet den Katalog, nicht den Einzelfall.**

Vorhanden: `GET /bounty-catalog`, `POST /bounty-catalog/update` — Prozente und
Schwellen pflegen, plattformweit. Nicht vorhanden: *„welchen Rabatt bekommt Kunde X
nächsten Monat, warum, und wie greife ich ein?"*

### 2.3 Pilotkunden-Verlängerung durch Empfehlung

| | |
|---|---|
| `referral_codes` | 17 |
| `referrals` | **1** |
| `referral_rewards` | 2 |

Die Empfehlungs-Mechanik existiert. Ob sie eine Pilot-Verlängerung auslösen kann,
ist offen — `referrals.reward_applied_at` stand in Welle I auf der Liste der
Spalten, die geschrieben und nie gelesen werden.

### 2.4 Monatsplanung: es gibt Rückschau, keine Planung

| Was | Wo | Für wen |
|---|---|---|
| Monatsplan als **PDF** | `workforceSchedulePdfService.renderMonthlyPlanPdf`, `workers.js:1921` | Zeitarbeitsfirma, Export |
| Eigener Plan des Arbeiters | `einsatzportal-plan.html` → `/worker/schedule` | Arbeiter |
| **Planungsfläche fürs Büro** | **existiert nicht** — keine HTML-Seite nennt „Monatsplan" | — |

Man kann ablesen, was bereits zugewiesen ist. Man kann nirgends **planen**.

### 2.5 Der Feed-Fehler

Behoben auf dem Release-Branch: `e845c2d` — *„der Marktplatz-Feed warf 500 für JEDEN
angemeldeten Betrachter"*. Kommt mit dem laufenden Merge herüber. Meine erste
Diagnose lief ins Leere, weil der Container einen zwei Tage alten Prozess-Schnappschuss
bedient (siehe [`UEBERGABE.md`](../UEBERGABE.md)).

**Offen bleibt der zweite Teil:** ein künftiger Fehler darf den Feed nicht leeren.

---

## 3. Verbindliche Leitentscheidungen

**L1 — 12 ist keine Bau-, sondern eine Sichtbarmachung.** Die Rechenkette bleibt
unangetastet; sie trägt 754 Fälle. Gebaut wird der Eingriffspunkt.

**L2 — Ein stiller Geldfehler ist ein Befund, kein Log-Eintrag.** Schlägt die
Rabattermittlung fehl, bekommt das dieselbe Aufmerksamkeit wie eine fehlgeschlagene
Zahlung.

**L3 — Der Eingriff darf keine Hintertür sein.** Owner-Entscheid: nach oben nur bis
zur Tier-Grenze **und** mit Missbrauchsschutz. Ausgearbeitet in Abschnitt 3a.

**L4 — 13 wartet auf J.** Die Monatsplanung *ergibt sich aus* Live-Belegschaft und
Marktplatz. Beides ist in Arbeit.

**L5 — Planung ist Vorausschau, nicht noch eine Liste.** Der Unterschied zur
vorhandenen PDF-Rückschau muss im ersten Entwurf sichtbar sein.

**L6 — Gemeinsam planen heißt nicht verhandeln müssen.** Owner-Entscheid: beide
Seiten planen, aber **ohne Pflicht-Hin-und-Her**. Ausgearbeitet in Abschnitt 3b.

**L7 — Ein Fehler darf nie zu einer leeren Liste führen.** Owner-Entscheid: lieber
ein ehrlich datierter alter Stand als eine leere Fläche, die aussieht wie „es gibt
nichts". Ausgearbeitet in Abschnitt 3c.

**L8 — Erst mergen, dann diagnostizieren.** Gilt für alles in dieser Welle.

---

## 3a. Der Eingriff ohne Hintertür

> Owner: *„so wäre aber auch Machtmissbrauch möglich, deshalb begrenzen … schlag was
> vor, das den Missbrauch verhindert."*

Der Kern des Vorschlags ist eine Umkehr: **Ein Eingriff setzt keine Zahl, er nennt
einen Grund — und das System rechnet.**

### Die tragende Idee

Wer eingreifen will, kann **nicht** „22 %" eintippen. Er kann nur sagen:

> *„Bounty ‚Pünktlichkeit 90 Tage' hätte zählen müssen."*

Das System prüft daraufhin **die Schwelle dieses Bounties** gegen die echten Daten
des Kunden und rechnet neu. Erfüllt der Kunde die Bedingung, zählt es; erfüllt er
sie nicht, wird der Eingriff **abgelehnt** — mit der Begründung, welche Schwelle
fehlt.

Damit ist strukturell ausgeschlossen, dass jemand einen Rabatt vergibt, den der
Katalog nie hergeben würde. Der Eingriff wird zur **Wiederholung der Bewertung**,
nicht zu ihrer Übersteuerung.

### Fünf Riegel, jeder für eine andere Missbrauchsart

| Riegel | Verhindert |
|---|---|
| **1 · Kein freier Betrag** — nur „dieses Bounty nachzählen" oder „diesen Rabatt aussetzen" | Der Wunschbetrag. Das Ergebnis ist immer das, was der Katalog ergibt. |
| **2 · Nie in eigener Sache** — wer eingreift, darf nicht zur betroffenen Organisation gehören, und nicht auf das eigene Konto | Selbstbedienung. Der häufigste und einfachste Missbrauch. |
| **3 · Vier Augen ab Schwelle** — eine Erhöhung über **5 Prozentpunkte** braucht die Bestätigung eines zweiten Staff-Mitglieds mit eigener Rolle | Der Alleingang. Sechs Staff-Rollen sind seit `8eb9971` durchgesetzt, die Grundlage ist da. |
| **4 · Verfall statt Dauerzustand** — ein Eingriff gilt für **genau einen Abrechnungslauf**, danach entscheidet wieder die Automatik | Der stille Dauerrabatt, den niemand mehr hinterfragt. |
| **5 · Sichtbar nach oben** — jede Erhöhung erzeugt eine Meldung an die Eigentümer, nicht nur eine Audit-Zeile | Das Audit, das niemand liest. Genau der Fund vom 26.08.: 23 abgewiesene Zugriffe lagen monatelang unsichtbar in einer Tabelle. |

### Was zusätzlich mitläuft

- **Deckel je Mitarbeiter und Monat.** Mehr als eine festzulegende Zahl von
  Eingriffen im Monat geht nur mit Owner-Freigabe. Ein Muster fällt damit auf,
  bevor es zur Gewohnheit wird.
- **Pflichtbegründung im Freitext**, zusätzlich zum strukturierten Grund. Nicht
  als Ersatz für die Riegel, sondern damit später nachvollziehbar ist, *warum*
  jemand nachgezählt hat.
- **Die Reduzierung bleibt einfach.** Nach unten korrigieren ist Fehlerbehebung und
  braucht keine vier Augen — nur Grund und Audit.

> **Der Punkt dahinter:** Missbrauchsschutz durch **Struktur** statt durch
> Vertrauen. Selbst wer alle Rechte hat und es darauf anlegt, kann nur das
> vergeben, was der Katalog dem Kunden ohnehin zugestanden hätte — und nur für
> einen Monat, nicht in eigener Sache, und nie unbemerkt.

---

## 3b. Gemeinsam planen, ohne Pflicht-Hin-und-Her

> Owner: *„beide, ohne Pflicht hin und her."*

Die Gefahr bei gemeinsamer Planung ist ein Genehmigungs-Pingpong: jede Verschiebung
wartet auf eine Bestätigung, und am Ende ruft man wieder an.

**Das Prinzip: Vorschlagen ohne zu blockieren.**

| | Einsatzunternehmen | Zeitarbeitsfirma |
|---|---|---|
| darf in den Monat legen | **Bedarf** („hier brauche ich jemanden") | **Besetzung** („diese Person kommt") |
| sieht | die eigenen Einsätze und Bedarfe | den ganzen eigenen Bestand |
| braucht Zustimmung | **nein** | **nein** |

Beide Seiten schreiben in **ihre eigene Spur**. Ein Bedarf des Kunden ist kein
Auftrag an die Agentur, sondern eine sichtbare Absicht. Eine Besetzung der Agentur
ist keine Bitte, sondern eine Zusage.

**Wo sie sich berühren, entsteht kein Formular, sondern ein Hinweis:** Deckt eine
Besetzung einen offenen Bedarf, verschmelzen die beiden Einträge sichtbar. Passt
etwas nicht zusammen — Bedarf ohne Besetzung, Besetzung ohne Bedarf, zwei
Besetzungen auf einer Person — steht das als **Konflikt** im Plan, ohne dass
jemand etwas bestätigen muss.

**Niemand kann den anderen aussperren.** Eine Änderung der einen Seite ändert nie
die Einträge der anderen; sie erzeugt höchstens einen Konflikt, den beide sehen.

---

## 3c. Der Feed fällt nie auf leer zurück

> Owner: *„bei neuem Fehler abfangen und trotzdem Feed anzeigen … dauerhaft eine
> Kopie der aktuellen letzten Liste, die gesucht wurde."*

**Heute:** Fehler → 500 → leere Fläche. Für den Betrachter ununterscheidbar von
„es gibt gerade keine Angebote" — und das ist die schlimmere Lesart, weil sie
falsch ist und niemanden alarmiert.

**Künftig:** Jeder erfolgreiche Feed-Abruf legt seine Liste als **dauerhafte Kopie**
ab. Schlägt der nächste Abruf fehl, wird die Kopie ausgeliefert — sichtbar
gekennzeichnet.

| Eigenschaft | Entscheidung | Warum |
|---|---|---|
| **Wo abgelegt** | Datenbanktabelle, nicht nur Redis | Der Owner sagt *dauerhaft*. Eine Kopie, die beim Neustart verschwindet, ist genau dann weg, wenn man sie braucht. |
| **Was abgelegt** | die **unbeschränkte erste Seite** — das, was ein Betrachter ohne Filter sieht | Jede Filterkombination zu speichern wäre Verschwendung ohne Nutzen; der Normalfall deckt den Normalbesucher. |
| **Wie gekennzeichnet** | Datum und Uhrzeit des Standes, deutlich über der Liste | Ein alter Stand, den man für aktuell hält, ist schlimmer als gar keiner. |
| **Was passiert nebenbei** | Meldung an das Team beim ersten Rückfall | Sonst ist der Rückfall selbst wieder still — dieselbe Falle wie beim Rabatt-Ausfall. |
| **Wann NICHT** | wenn die Kopie älter als eine festzulegende Frist ist | Ab da ist Schweigen ehrlicher als ein veralteter Stand. Dann Fehlermeldung mit Zeitangabe. |

**Was das ausdrücklich nicht ist:** kein allgemeiner Cache zur Beschleunigung. Die
Kopie wird **nur im Fehlerfall** ausgeliefert. Im Normalbetrieb ändert sich nichts —
sonst hätten wir eine zweite Wahrheit über den Marktplatz.

---

## 4. Wellen und Phasen

### K0 · Vorlauf: erst der gemeinsame Stand *(blockiert alles andere)*

| Phase | Inhalt | Fertig, wenn |
|---|---|---|
| K0.1 | Merge des Release-Standes abschließen (läuft), Container neu starten | `localhost:8080` zeigt den aktuellen Stand |
| K0.2 | Gegenprüfung: Naht I↔J, Registerzahlen, volles Gate | Gate grün, Naht-Probe und `statuswertSpiegel` grün |
| K0.3 | Feed-Fehler am gemergten Stand nachprüfen (`e845c2d`) | bestätigt behoben — oder mit Ursache benannt |

---

### K1 · Abschnitt 12a: der Rabatt wird sichtbar *(unabhängig von J)*

| Phase | Inhalt | Nachweis |
|---|---|---|
| K1.1 | **Der stille Ausfall wird laut.** Scheitert `getUserDiscount`, entsteht eine Meldung an das Team mit Kunde, Monat, Grund. | Rückmutation: Fehler erzwingen → Meldung entsteht |
| K1.2 | **Einzelfall-Ansicht im Staff CC.** Pro Kunde: aktive Bounties, Satz, Tier-Grenze, letzte Rechnung. | Probe gegen einen der 754 echten Fälle |
| K1.3 | **Vorschau auf den nächsten Lauf** — was würde angesetzt, bevor es läuft. | Vorschau = tatsächlicher Lauf |
| K1.4 | **Eingriff nach Abschnitt 3a** — Riegel 1, 2, 4, 5 | je Riegel eine Probe; Rückmutation je Riegel |
| K1.5 | **Vier Augen (Riegel 3)** — Bestätigung durch zweite Rolle über 5 Prozentpunkten | Alleingang → abgelehnt; zweite Rolle → durchgelassen |

---

### K2 · Abschnitt 12b: Pilot-Verlängerung durch Empfehlung

**Regel steht:** ein Monat je geworbenem Kunden, **erst nach 30 Tagen Bestand**,
**höchstens 3 Monate**.

| Phase | Inhalt | Nachweis |
|---|---|---|
| K2.1 | **Erhebung:** ist `referrals` → Pilot heute verdrahtet? `reward_applied_at` prüfen. | Befund, nicht Vermutung |
| K2.2 | Karenz-Uhr: der geworbene Kunde muss 30 Tage bestehen | Probe mit Kündigung an Tag 29 → keine Verlängerung |
| K2.3 | Verlängerung + Deckel bei 3 Monaten | vierter geworbener Kunde → keine weitere Verlängerung |
| K2.4 | Eingriffspunkt wie K1.4 — sehen, korrigieren, begründen | Audit-Probe |

---

### K3 · Abschnitt 13: Monatsplanung *(setzt K0 und Welle J voraus)*

| Phase | Inhalt | Nachweis |
|---|---|---|
| K3.1 | **Entwurf nach Abschnitt 3b** — zwei Spuren, keine Zustimmungspflicht. Ein Bild, kein Code. | **Owner-Freigabe des Entwurfs** |
| K3.2 | **Datenlage messen:** Einsätze über Monatsgrenzen, Vorlauf bei Zuweisungen, nachträgliche Änderungen | Zahlen aus der laufenden Datenbank |
| K3.3 | Lesende Fläche: der Monat als Raster, gespeist aus Live-Belegschaft + Marktplatz | Browser-Nachweis, Zero-State, Org-Grenze |
| K3.4 | Konflikte sichtbar: Doppelbelegung, Abwesenheit, ablaufende Nachweise, AÜG-Frist | jede Konfliktart mit echter Zeile belegt |
| K3.5 | Beide Spuren schreibend — Bedarf und Besetzung, ohne Zustimmungspflicht | jede Handlung mit Audit; keine Seite kann die andere ändern |
| K3.6 | Härtung: Skalierung (10 → 300), `Europe/Berlin`, Mutation Testing auf der Konfliktlogik | Lastprobe + Mutationsergebnis |

---

### K4 · Der Feed fällt nie auf leer *(unabhängig, klein)*

| Phase | Inhalt | Nachweis |
|---|---|---|
| K4.1 | Kopie der letzten guten Liste dauerhaft ablegen | Tabelle gefüllt nach erstem Abruf |
| K4.2 | Im Fehlerfall ausliefern, mit Datum des Standes | erzwungener Fehler → Liste erscheint, datiert |
| K4.3 | Meldung an das Team beim Rückfall | Rückmutation: Fehler → Meldung |
| K4.4 | Altersgrenze: zu alte Kopie wird nicht mehr ausgeliefert | Kopie künstlich altern → ehrliche Fehlermeldung |

---

## 5. Reihenfolge und Abhängigkeiten

```
K0 (Merge + Gegenprüfung + Feed-Fehler nachprüfen)
 ├── K1 (Rabatt sichtbar + Eingriff)   ← unabhängig
 ├── K2 (Pilot-Verlängerung)           ← unabhängig
 ├── K4 (Feed-Rückfall)                ← unabhängig, klein
 └── K3 (Monatsplanung)                ← braucht Welle J vollständig
```

**Empfohlene Reihenfolge: K0 → K4 → K1 → K2 → K3.**
K4 ist klein und schützt sofort die sichtbarste Fläche. K1 behebt einen Geldfehler.
K3 ist der eigentliche Produktschritt und braucht J.

---

## 6. Was noch offen ist

| Punkt | Art |
|---|---|
| **Deckel je Mitarbeiter und Monat** (Riegel aus 3a) — welche Zahl? | Owner, klein — kann bei K1.4 nachgereicht werden |
| **Altersgrenze der Feed-Kopie** — ab wann ist ein alter Stand unehrlich? | Owner, klein — Vorschlag: 24 Stunden |
| **Vier-Augen-Schwelle** — 5 Prozentpunkte ist mein Vorschlag | Owner, bestätigen oder ändern |

---

## 7. Was Welle K **nicht** tut

- **Die Rabatt-Rechenkette anfassen.** Sie funktioniert und trägt 754 Fälle.
- **Einen zweiten Bounty-Katalog bauen.** Der im Staff CC bleibt der einzige.
- **Einen allgemeinen Feed-Cache einführen.** Die Kopie greift nur im Fehlerfall.
- **Die Monatsplanung vor Welle J beginnen.**
- **OCC-Module anlegen oder entfernen** — siehe Owner-Entscheid vom 27.08. in
  [`FLAECHEN.md`](../FLAECHEN.md). Die Bounty-Verwaltung gehört ohnehin ins
  **Staff CC**: sie betrifft die Plattform als Ganzes, nicht einen einzelnen Kunden.
