# P8 — Deal-Verbindlichkeit: Rücknahme, Folgen, Besetzbarkeit

> **Stand:** 2026-08-06 · Branch `release/enterprise-premium-market-ready` · letzter Commit `69f9a96`
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

| # | Frage | Empfehlung |
|---|---|---|
| **E1** | Ab welchem Vorlauf zählt ein Storno „kurzfristig"? | **< 48 h vor Einsatzbeginn = doppeltes Gewicht; ≥ 14 Tage = zählt nicht in die Quote.** Dazwischen einfach. |
| **E2** | Welche Stornogründe zählen **nicht** gegen die Quote? | „Kunde hat abgesagt" (bei der Agentur) und „Kraft erkrankt" mit Nachweis. Alles andere zählt. |
| **E3** | Höhe des Zuverlässigkeits-Bounty | **3 %** (Kategorie `performance`), Fenster 90 Tage ohne Storno. |
| **E4** | Wird die Quote der Gegenseite **angezeigt** oder wirkt sie nur im Ranking? | Anzeigen — Transparenz ist der Wirkmechanismus. Aber erst ab einer Mindestzahl Deals (z. B. 5), sonst bestraft sie Neulinge. |

> Ohne E1 und E2 kann Welle B nicht abgeschlossen werden — die Gewichtung ist sonst geraten.

---

## 5. Wellen

### Welle A — Storno-Erfassung schärfen *(Fundament, keine Sichtbarkeit)*

**Ziel:** Ein Storno wird auswertbar. Noch ohne Folgen — die kommen in B.

- Migration: `offer_cancellations` (oder Spalten an `offers`) mit
  `reason_code` (Enum), `cancelled_by_user_id`, `cancelled_by_side` (company/agency),
  `assignment_start_date`, `lead_time_hours` (berechnet), `note` (frei, optional)
- `reason_code` als **geschlossene Liste**: `customer_cancelled`, `worker_sick`,
  `worker_quit`, `date_moved`, `mistake`, `other`
- `cancelAgreement` nimmt den Grund **verpflichtend** entgegen (Route bricht ohne ihn ab)
- Audit-Eintrag trägt Grund und Vorlauf

**Gate A:** Ein Storno ohne gültigen `reason_code` wird abgelehnt (400). Vorlauf wird
korrekt aus `Europe/Berlin` gerechnet (nicht UTC — siehe `todayDE`).

### Welle B — Zuverlässigkeitsquote beleben

**Ziel:** `deal_success_rate` bekommt endlich einen Wert und wirkt im Ranking.

- Service, der die Quote je Org berechnet: abgeschlossene Deals gegen stornierte,
  gewichtet nach E1/E2
- Schreibpfad (Cron oder ereignisgetrieben beim Storno/Abschluss)
- **Wichtig:** Der Cron-Endpunkt muss in `docs/SCHEDULER.md` eingetragen werden —
  `api/test/schedulerConsistency.test.js` wird sonst zu Recht rot
- Mindestzahl Deals, bevor die Quote wirkt (E4)

**Gate B:** Eine Org ohne Deals hat keine Quote (nicht 0 %, sondern `NULL` —
„keine Daten" ist nicht „schlecht"). Ranking ändert sich nachweisbar.

### Welle C — Zuverlässigkeits-Bounty

**Ziel:** Der positive Anreiz aus 3.2.

- Neuer Katalog-Eintrag `zuverlaessiger_partner`, Kategorie `performance`
- Vergabe: N Tage ohne gewichteten Storno
- Entzug beim Storno, Neuaufbau ab dem Tag danach
- Sichtbar im Bounty-Bereich mit Klartext, warum es entfallen ist

**Gate C:** Entzug und Neuaufbau sind idempotent (mehrfacher Lauf ändert nichts).

### Welle D — Mehrstufige Bestätigung

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

### Welle E — Besetzbarkeits-Vorschau beim Überfahren

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

## 6. Reihenfolge und Begründung

**A → B → C → D**, E jederzeit unabhängig.

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
