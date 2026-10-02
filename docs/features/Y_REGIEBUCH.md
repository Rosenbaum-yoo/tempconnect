# Y5 · Das Regiebuch — jede Richtung in Minuten prüfbar

> **Zweck.** Ein Mensch **ohne Vorwissen** soll jede Richtung der Plattform in
> Minuten prüfen können: *„melde dich an als … → klicke … → du musst sehen …"*.
> Das erwartete Ergebnis steht dabei, nicht nur der Klickpfad — wer etwas anderes
> sieht, erkennt es sofort als Fehler.
>
> **Grundlage.** Die Besetzung aus Welle Y1–Y3 (`sql/seeds/y1-*.sql`,
> `y2-*.sql`, `y3-*.sql`). Ohne sie führen die Wege unten ins Leere; das ist kein
> Mangel des Regiebuchs, sondern der Grund, warum es Y1 vor Y5 gibt.
>
> **Laden:**
>
> ```bash
> SEED_DEMO_WORLD=true SEED_PASSWORT=<mindestens 12 Zeichen> \
>   ./scripts/dev/seed-data.sh
> ```
>
> Alle Bühnen-Konten tragen **dasselbe** Passwort — das, das beim Laden gesetzt
> wurde. Es steht **nicht** im Repo (Y6.3): die Saaten hashen beim Laden mit
> `pgcrypto`. Wer es nicht mehr weiß, lädt neu.

---

## 1. Die Besetzung — wer ist wer

### Nordlicht Logistik GmbH · Kunde · PLUS · drei Standorte *(Y1.2)*

| Konto | Rolle | sieht |
|---|---|---|
| `verwaltung@probebuehne.tempconnect.de` | `admin`, ohne Standortbindung | **alle drei** Standorte |
| `disposition@probebuehne.tempconnect.de` | `hiring_manager`, ohne Bindung | **alle drei** Standorte |
| `standort.hamburg@probebuehne.tempconnect.de` | `member`, gebunden an Hamburg | **nur Hamburg** |

Standorte: Hamburg Hafen *(Hauptsitz)* · Berlin Schoenefeld · Muenchen Nord.
Je Standort eine Abteilung.

### Hanse Personal Service GmbH · Lieferant · PRO · zwölf Kräfte *(Y1.4)*

| Konto | Rolle |
|---|---|
| `disponent@hanse.probebuehne.tempconnect.de` | `dispatcher` — **ohne ihn entsteht kein einziges Angebot** |
| `kraft01@hanse.probebuehne.tempconnect.de` | Jonas Harms — im Markt **und** im Sammelangebot *(Y2.4)* |
| `kraft07@hanse.probebuehne.tempconnect.de` | Tomasz Nowak — **im Einsatz** bei Nordlicht/Hamburg |
| `kraft08@hanse.probebuehne.tempconnect.de` | Amina Toure — **im Einsatz** bei Nordlicht/Hamburg |

Die übrigen acht Kräfte haben **kein** Portalkonto, nur eine Personalnummer
(`HPS-002`…`HPS-012`) — der häufigere echte Fall.

**Wer im Markt steht und wer nicht, und warum:**

| Kraft | im Markt? | Grund |
|---|---|---|
| Jonas Harms, Leyla Demir, Piotr Lewandow, Sanna Virtanen | **ja** | vollständig |
| Mehmet Kaya | **ja** | heute **verspätet** — Verspätung verdeckt nicht |
| Greta Olsen | nein | heute **krank** (Bedingung 4) |
| Tomasz Nowak, Amina Toure | nein | **gebunden** (im Einsatz) |
| Dennis Brinkmann, Ivana Horvat, Samuel Addo, Yuki Tanaka | nein | **keine Katalog-Fähigkeit** (Bedingung 6) |

### Zwölf Organisationen in je einem Sonderzustand *(Y1.3)*

**Der Zweck steht im Namen** — und die Adresse steht voll da, damit man sie
kopieren kann:

- `pilot-beendet@probebuehne.tempconnect.de`
- `pilot-uebernommen@probebuehne.tempconnect.de`
- `pilot-gesperrt@probebuehne.tempconnect.de`
- `pilot-ausnahme@probebuehne.tempconnect.de`
- `zahlungsausfall@probebuehne.tempconnect.de`
- `manuell-gesperrt@probebuehne.tempconnect.de`
- `sicherheitssperre@probebuehne.tempconnect.de`
- `kuendigung@probebuehne.tempconnect.de`
- `individuell-s@probebuehne.tempconnect.de`
- `individuell-l@probebuehne.tempconnect.de`
- `demo-phase@probebuehne.tempconnect.de`
- `ablauf-drei-tage@probebuehne.tempconnect.de`


---

## 2. Die sieben Wege — einer je Kreislauf

Die Kreisläufe sind in `docs/features/V_SCHNITTSTELLEN.md`, Abschnitt 3b
definiert. Jeder hat hier **mindestens einen** Weg.

### K-1 · Verfügbarkeit — vom Skill ins Schaufenster und zurück

| Schritt | Melde dich an als | Öffne | Du musst sehen |
|---|---|---|---|
| 1 | `disponent@hanse…` | `/mitarbeiter.html` | **12** Kräfte. Acht mit Fähigkeit, vier ohne. Greta Olsen als **heute abwesend**, Mehmet Kaya als **verspätet**. |
| 2 | *(dasselbe Konto)* | `/capacity_exchange_manage.html` | **Fünf** aktive Einzelangebote — Harms, Demir, Lewandow, Virtanen, Kaya. Dazu **zwei** Sammelangebote. Greta Olsen **nicht**. |
| 3 | `verwaltung@probebuehne…` | `/capacity_search.html` | Dieselben fünf Kräfte als Angebot der Hanse Personal. **Greta Olsen darf nicht erscheinen** — sie ist heute krank. |
| 4 | *(dasselbe Konto)* | `/company-live-workforce.html` | Tomasz Nowak und Amina Toure **im Einsatz**, Standort **Hamburg Hafen**. |

**Woran du einen Fehler erkennst:** erscheinen in Schritt 3 sechs Kräfte, greift
Bedingung 4 nicht (Abwesenheit verdeckt nicht). Erscheinen vier, ist Mehmet Kaya
verschwunden — dann verdeckt eine **Verspätung**, was sie nicht verdecken darf.

### K-2 · Zeit und Geld — vom Stundenzettel in die Mahnstrecke

| Schritt | Melde dich an als | Öffne | Du musst sehen |
|---|---|---|---|
| 1 | `disponent@hanse…` | `/timesheets.html` | Stundenzettel in mehreren Zuständen, darunter **einen stornierten**. |
| 2 | `verwaltung@probebuehne…` | `/company-timesheets.html` | Den Eingang auf Kundenseite. |
| 3 | *(dasselbe Konto)* | `/sla_abo.html` | Die **Abo-Rechnung**: eine stornierte über 177,31 €. |
| 4 | `zahlungsausfall@probebuehne…` | `/sla_abo.html` | **Überfällig, Mahnstufe 2**: 3748,50 € brutto, fällig vor 30 Tagen. Dieselbe Organisation ist **wegen Zahlungsausfall gesperrt**. |

**Woran du einen Fehler erkennst:** stimmen netto + MwSt nicht mit der Summe
überein, rechnet die Oberfläche falsch — die Saat ist Zeile für Zeile
durchgerechnet (5 von 5). Zeigt Schritt 4 keine Mahnstufe, ist die Mahnstrecke
nicht verdrahtet.

### K-3 · Ausfall — Krankmeldung bis in die Belegschaft

| Schritt | Melde dich an als | Öffne | Du musst sehen |
|---|---|---|---|
| 1 | `kraft07@hanse…` | `/einsatzportal-einsaetze.html` | **Einen** laufenden Einsatz bei Nordlicht Logistik, Standort Hamburg Hafen. |
| 2 | *(dasselbe Konto)* | `/einsatzportal-abwesenheit.html` | Die Maske zum Melden — **mit heutigem Bezug**. |
| 3 | `disponent@hanse…` | `/mitarbeiter.html` | Greta Olsen **heute abwesend** (krank, bis in zwei Tagen) und Mehmet Kaya **45 Minuten verspätet**. |
| 4 | `verwaltung@probebuehne…` | `/company-live-workforce.html` | Dieselbe Lage aus Kundensicht. |

**Woran du einen Fehler erkennst:** verschwindet Mehmet Kaya in Schritt 3 oder 4
aus dem Markt, verwechselt die Plattform **Verspätung** mit **Abwesenheit**.

### K-4 · Vertrauen — Bewertung, Sperre, Sichtbarkeit

| Schritt | Melde dich an als | Öffne | Du musst sehen |
|---|---|---|---|
| 1 | `verwaltung@probebuehne…` | `/supplier_scorecard.html` | Hanse Personal Service als Lieferant mit Bewertung. |
| 2 | *(dasselbe Konto)* | `/company-live-workforce.html` | **Jonas Harms gesperrt** — befristet, mit Grund, vermittelt von Hanse Personal. |
| 3 | `disponent@hanse…` | `/capacity_exchange_manage.html` | **Jonas Harms steht weiter im Markt.** Die Sperre gilt nur bei Nordlicht. |
| 4 | `verwaltung@probebuehne…` | `/vendor_pool.html` | Hanse Personal im Lieferantenpool. |

**Woran du einen Fehler erkennst:** ist Jonas Harms in Schritt 3 verschwunden,
wirkt eine **kundenspezifische** Sperre plattformweit — das ist die zentrale
Zusage der Sperrliste, und sie wäre gebrochen.

### K-5 · Hilfe — Frage bis Lösung

| Schritt | Melde dich an als | Öffne | Du musst sehen |
|---|---|---|---|
| 1 | `verwaltung@probebuehne…` | `/hilfe.html` | Das Help Center mit Artikeln und dem Weg zur Support-Anfrage. |
| 2 | `disponent@hanse…` | `/sla_hilfe.html` | Dieselbe Hilfe aus Lieferantensicht. |

**Woran du einen Fehler erkennst:** zeigt eine der beiden Seiten eine leere
Liste, ist der Hilfe-Katalog nicht verdrahtet.

### K-6 · Nachweis — jede Handlung hat einen Urheber

| Schritt | Melde dich an als | Öffne | Du musst sehen |
|---|---|---|---|
| 1 | `verwaltung@probebuehne…` | `/organization.html` | Das **Audit-Protokoll** der Organisation: Wer, Was, Wann. |
| 2 | *(dasselbe Konto)* | `/compliance_overview.html` | Die Compliance-Übersicht. |
| 3 | `disponent@hanse…` | `/documents-center.html` | Dokumente und PDFs der Zeitarbeitsfirma. |

**Woran du einen Fehler erkennst:** steht in Schritt 1 eine Handlung **ohne
Urheber**, fehlt dem Audit die Zuordnung. *(Offener Befund: 9 Audit-Zeilen ohne
Organisation — siehe `docs/UEBERGABE.md`, Abschnitt „Welche Organisation trägt
eine Audit-Zeile".)*

### K-7 · Anbindung — das Fremdsystem und zurück

| Schritt | Melde dich an als | Öffne | Du musst sehen |
|---|---|---|---|
| 1 | `verwaltung@probebuehne…` | `/integrations.html` | Die Übersicht der Schnittstellen und Adapter. |
| 2 | *(dasselbe Konto)* | `/api-docs.html` | Die API-Dokumentation. |

**Woran du einen Fehler erkennst:** nennt die Seite eine Anbindung als „aktiv",
für die kein Adapter konfiguriert ist, behauptet sie eine Verbindung.

---

## 3. Die Standortgrenze — der Weg, für den Welle U gebaut wurde

Dieser Weg steht getrennt, weil er vor Y1.2 **nicht herstellbar** war: es gab
keine zweite Person in derselben Firma an einem anderen Standort.

| Schritt | Melde dich an als | Öffne | Du musst sehen |
|---|---|---|---|
| 1 | `verwaltung@probebuehne…` | `/organization.html` | **Drei** Standorte: Hamburg Hafen, Berlin Schoenefeld, Muenchen Nord. |
| 2 | `standort.hamburg@probebuehne…` | `/organization.html` | **Nur Hamburg Hafen.** Berlin und München dürfen nicht erscheinen. |
| 3 | `standort.hamburg@probebuehne…` | `/company-live-workforce.html` | Den Einsatz bei **Hamburg Hafen** — er läuft an ihrem Standort. |
| 4 | `disposition@probebuehne…` | `/organization.html` | Wieder **alle drei** — diese Rolle ist nicht standortgebunden. |

**Woran du einen Fehler erkennst:** sieht Schritt 2 mehr als einen Standort, ist
die Standortbindung der Mitgliedschaft (`org_memberships.location_id`) nicht
wirksam. Sieht Schritt 4 nur einen, wirkt eine Bindung, die es nicht gibt.

---

## 4. Die Sonderzustände — zwölf Anmeldungen, zwölf Oberflächen

Je Konto **eine** Anmeldung und **eine** Frage. Der Zweck steht im Namen, die
erwartete Oberfläche hier.

| Melde dich an als | Du musst sehen |
|---|---|
| `pilot-beendet@probebuehne.tempconnect.de` | Pilot **beendet** — kein laufender Pilot, Historie vorhanden |
| `pilot-uebernommen@probebuehne.tempconnect.de` | Pilot **übernommen**, Kunde im Zustand **live** |
| `pilot-gesperrt@probebuehne.tempconnect.de` | Pilot **gesperrt** — kein neuer Pilot möglich |
| `pilot-ausnahme@probebuehne.tempconnect.de` | Pilot **mit Ausnahme**, Begründung sichtbar |
| `zahlungsausfall@probebuehne.tempconnect.de` | Zugang **gesperrt wegen Zahlungsausfall**, Rechnung überfällig |
| `manuell-gesperrt@probebuehne.tempconnect.de` | Zugang **manuell** stillgelegt |
| `sicherheitssperre@probebuehne.tempconnect.de` | Zugang wegen **Sicherheitsverdacht** gesperrt |
| `kuendigung@probebuehne.tempconnect.de` | **Gekündigt, läuft noch** — Zugang bis Periodenende |
| `individuell-s@probebuehne.tempconnect.de` | INDIVIDUELL, Größenstufe **S** |
| `individuell-l@probebuehne.tempconnect.de` | INDIVIDUELL, Größenstufe **L** |
| `demo-phase@probebuehne.tempconnect.de` | Zustand **demo** |
| `ablauf-drei-tage@probebuehne.tempconnect.de` | Abo **läuft in drei Tagen ab** |

**Woran du einen Fehler erkennst:** zeigen zwei dieser Konten dieselbe
Oberfläche, unterscheidet die Plattform die Zustände nicht — und dann ist einer
der zwölf nur in der Datenbank verschieden, nicht im Produkt.

---

## 5. Was dieses Regiebuch NICHT ist

Keine Testautomatisierung. Die Wege sind für **Menschen** gedacht; was sich
automatisch prüfen lässt, prüfen die Wächter in `api/test/probebuehne*.test.js`
(Form der Saat) und `e2e/tests/*` (Klickpfade). Das Regiebuch schließt die Lücke
dazwischen: **sehen, dass es stimmt.**
