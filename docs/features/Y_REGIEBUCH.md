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

## 5. Die drei getrennten Flächen — je einzeln durchspielbar *(Y4.1)*

Staff Control Center, Support Center und Owner Control Center sind drei
**getrennte** Flächen mit eigenen Zugängen. Vor Welle Y4 war das nicht
vorführbar: gemessen am 2026-10-02 lagen **alle drei Zugänge auf einem Konto** —
der echten Owner-Adresse. Wer eine Fläche zeigen wollte, musste sich als Owner
anmelden und hatte damit alle drei. Genau dann beweist keine davon mehr etwas:
man sieht überall alles und erfährt nie, ob das an der Berechtigung liegt oder an
deren Abwesenheit.

Jetzt hält **jedes Konto genau eine Fläche**. Das Passwort ist für alle das
gleiche wie für die übrige Bühne (es steht nicht im Repo — es wird beim Laden der
Saat gesetzt, `SEED_PASSWORT`).

### 5a · Staff Control Center — sechs Rollen, sechs Konten

Der Staff-Login ist eine **eigene Sitzung mit eigenem Cookie** (`tc.staff.sid`,
Pfad `/staff`). Du bleibst also als Kunde angemeldet, während du Staff bist —
und umgekehrt. Das ist die tragende Trennung, nicht der fehlende Link.

| Schritt | Was du tust | Was du sehen musst |
|---|---|---|
| 1 | `/staff/` öffnen | Anmeldemaske, **nicht** die Kundenplattform |
| 2 | als `staff.team@probebuehne.tempconnect.de` anmelden | das Kontrollzentrum, alle Fachbereiche |
| 3 | abmelden, als `staff.kommerz@probebuehne.tempconnect.de` anmelden | Kommerz ja — **Betrieb und Support fehlen** |
| 4 | abmelden, als `staff.betrieb@probebuehne.tempconnect.de` anmelden | Betrieb ja — **Kommerz fehlt** |
| 5 | abmelden, als `staff.aufsicht@probebuehne.tempconnect.de` anmelden | alles sichtbar, **jede** schreibende Aktion endet mit `NUR_LESEND` |
| 6 | abmelden, als `staff.admin@probebuehne.tempconnect.de` anmelden | zusätzlich die **Staff-Verwaltung** (Zugänge vergeben) |
| 7 | eine schreibende Aktion versuchen | `428 SCC_STEP_UP_REQUIRED` → Passwort erneut eingeben, dann geht es |

Die sechs Konten und ihre Rolle:

| Konto | Rolle | Was sie darf |
|---|---|---|
| `staff.admin@probebuehne.tempconnect.de` | `staff_admin` | alles, **einschließlich** Zugänge vergeben |
| `staff.team@probebuehne.tempconnect.de` | `staff_member` | alles **außer** Zugänge vergeben |
| `staff.kommerz@probebuehne.tempconnect.de` | `staff_commercial` | Geld, Verträge, Kunden, Piloten, Aufsicht |
| `staff.betrieb@probebuehne.tempconnect.de` | `staff_ops` | Betrieb, Hetzner, Automation, Plattform, Aufsicht |
| `staff.support@probebuehne.tempconnect.de` | `staff_support` | Support, Moderation, Aufsicht |
| `staff.aufsicht@probebuehne.tempconnect.de` | `staff_audit` | sieht alles, **schreibt nichts** |

**Woran du einen Fehler erkennst:** sieht `staff.kommerz@` in Schritt 3 den
Betriebsbereich, wird `BEREICHE_JE_ROLLE` nicht ausgewertet — dann ist die
Rolle eine Spalte ohne Wirkung, und das war sie bis 2026-08-24 wirklich.
Kommt `staff.aufsicht@` in Schritt 5 mit einer schreibenden Aktion durch, ist
die Revision keine Revision mehr, sondern ein zweites Teammitglied. Und kommt
Schritt 7 **ohne** Passwortfrage durch, trägt das Konto `requires_step_up =
FALSE` — die Einstellung des Owners, die die Bühne ausdrücklich nicht erbt.

### 5b · Support Center — zwei Datenreichweiten

| Schritt | Was du tust | Was du sehen musst |
|---|---|---|
| 1 | als `support.leitung@probebuehne.tempconnect.de` auf der **normalen** Anmeldung einloggen | die Kundenoberfläche (das Konto hat keine Organisation) |
| 2 | `/support-ops/` öffnen | das Support Center, Fälle **aller** Warteschlangen |
| 3 | abmelden, als `support.fall@probebuehne.tempconnect.de` anmelden, `/support-ops/` öffnen | **weniger** Fälle — nur die zugewiesenen |

| Konto | Rolle | Datenreichweite |
|---|---|---|
| `support.leitung@probebuehne.tempconnect.de` | `internal_support_lead` | `full_internal` — alles |
| `support.fall@probebuehne.tempconnect.de` | `internal_support_agent` | `assigned_only` — nur zugewiesen |

**Woran du einen Fehler erkennst:** sieht `support.fall@` in Schritt 3 **dieselbe**
Liste wie die Leitung, greift `data_scope` nicht — und `assigned_only` ist dann
ein Wort in einer Spalte. Das ist die zentrale Zusage des Support Centers:
ein Agent sieht nicht alles. Zwei Konten sind der einzige Weg, sie zu prüfen —
mit einem hat man eine Liste und keinen Vergleich.

### 5c · Owner Control Center — die zweite Sicht

| Schritt | Was du tust | Was du sehen musst |
|---|---|---|
| 1 | als `owner.sicht@probebuehne.tempconnect.de` auf der **normalen** Anmeldung einloggen | die Kundenoberfläche |
| 2 | `/owner-control/` öffnen | die Owner-Fläche, Rolle **`co-owner`** |
| 3 | abmelden, als `staff.team@probebuehne.tempconnect.de` auf der **normalen** Anmeldung einloggen, `/owner-control/` öffnen | **403 `OCC_FORBIDDEN`** |

**Woran du einen Fehler erkennst:** kommt Schritt 3 durch, gibt es einen Umweg
über die normale Rolle in die privilegierteste Fläche des Systems — das Tor sagt
ausdrücklich „kein Bypass über normale Rollen". Und erscheint in Schritt 2
`owner` statt `co-owner`, hat die Bühne die echte Eigentümer-Rolle bekommen;
das Tor unterscheidet die beiden nicht, aber die Zeile ist auch ein Protokoll.

### 5d · Die Gegenrichtung — keine dieser Flächen aus der Kundenplattform *(Y4.2)*

| Schritt | Was du tust | Was du sehen musst |
|---|---|---|
| 1 | als `verwaltung@probebuehne.tempconnect.de` anmelden (Kunde) | die Kundenplattform |
| 2 | jede Kachel, jedes Menü, jede Fußzeile durchsehen | **keinen** Weg nach `/staff/`, `/owner-control/`, `/support-ops/` |
| 3 | `/staff/` direkt in die Adresszeile tippen | die Staff-Anmeldung, **nicht** angemeldet — die Kundensitzung gilt dort nicht |

**Woran du einen Fehler erkennst:** findest du in Schritt 2 eine Kachel, ist die
Owner-Vorgabe vom 2026-09-01 gebrochen („das ist nur für mich ein
Kontrollcentrum, kein Kundenzugang. niemals."). Und bist du in Schritt 3 **schon
angemeldet**, teilt sich das Staff Center die Sitzung mit der Plattform — der
schwerere Fehler, weil ihn niemand sieht: dann ist jede angemeldete
Kundensitzung eine halbe Staff-Sitzung, und es braucht gar keinen Link.

Automatisch geprüft wird beides von `api/test/staffNieAusDerPlattform.test.js`
(kein Link, eigene Sitzung) und `api/test/probebuehneFlaechen.test.js` (kein
internes Konto hängt an einer Organisation — die Datenseite, die ein
Link-Prüfer nicht sehen kann).

---

## 6. Die dreizehn Org-Rollen — wer sieht was *(Y6.1)*

`api/services/rbacService.js` hat **63 Rechte auf 13 Rollen**, und
`hasPermission()` erbt über `ROLE_HIERARCHY`. Besetzt waren davon **sechs**.
Sieben Einschränkungen hatte nie jemand getragen — und eine Rolle, die niemand
trägt, hat niemand geprüft.

Gemessen, indem die Entscheidungsfunktion selbst gefragt wurde (nicht die Liste
gelesen — die Vererbung sieht man in den Listen nicht):

| Rolle | Rechte | Konto |
|---|---|---|
| `owner` / `admin` | 63 von 63 | (vorhanden) |
| `platform_admin` | **63 von 63** | `rolle.plattform@probebuehne.tempconnect.de` |
| `program_manager` | 47 | `rolle.programm@probebuehne.tempconnect.de` |
| `hiring_manager` | 28 | (vorhanden) |
| `finance` | 21 | `rolle.finanzen@probebuehne.tempconnect.de` |
| `supplier_manager` | 20 | `rolle.lieferanten@probebuehne.tempconnect.de` |
| `dispatcher` | 18 | (vorhanden) |
| `recruiter` | 15 | `rolle.recruiting@probebuehne.tempconnect.de` |
| `member` / `viewer` | 8 | `rolle.lesend@probebuehne.tempconnect.de` |
| `supplier_user` | 8 | `rolle.lieferantenseite@probebuehne.tempconnect.de` (bei Hanse) |
| `worker` | 0 | (vorhanden — gatet über `arbeiterRiegel`, nicht über Rechte) |

| Schritt | Was du tust | Was du sehen musst |
|---|---|---|
| 1 | als `rolle.lesend@probebuehne.tempconnect.de` anmelden | Nordlicht Logistik, **nur Lesen** — kein Anlegen, kein Ändern |
| 2 | abmelden, als `rolle.finanzen@probebuehne.tempconnect.de` anmelden | Rechnungen und Konditionen ja — **Bedarfe anlegen nein** |
| 3 | abmelden, als `rolle.recruiting@probebuehne.tempconnect.de` anmelden | Bedarfe und Kandidaten ja — **Rechnungen nein** |
| 4 | abmelden, als `rolle.programm@probebuehne.tempconnect.de` anmelden | fast alles, **aber keine Mitgliederverwaltung** |
| 5 | abmelden, als `rolle.plattform@probebuehne.tempconnect.de` anmelden | **alles** — diese Rolle ist owner-gleich |

**Woran du einen Fehler erkennst:** sieht `rolle.lesend@` in Schritt 1 einen
Knopf, der etwas ändert, greift `viewer` nicht — und `viewer` ist die Rolle,
die man jemandem gibt, dem man gerade NICHT vertrauen will. Sieht
`rolle.finanzen@` in Schritt 2 dieselbe Oberfläche wie `rolle.plattform@` in
Schritt 5, wird die Rolle nicht ausgewertet: 21 gegen 63 Rechte müssen sichtbar
verschieden sein. Und wenn Schritt 5 **nicht** alles zeigt, stimmt die Vererbung
nicht — `platform_admin` steht in **keiner** der 63 Rechtelisten direkt drin und
bekommt seine Macht ausschließlich über `ROLE_HIERARCHY`.

### 6a · Die Zustände, die vorher kein Beispiel hatten

Zu jedem dieser Zustände gibt es jetzt genau eine Zeile. Sie sind der Grund,
warum man die Oberfläche überhaupt in diesem Zustand sehen kann:

| Was | Wo du es siehst |
|---|---|
| Rechnung über **0,00 €** (Tarif DEMO) | Rechnungsliste von Nordlicht — die Nullzeile, die die Formatierung beweist |
| Vier Tarife in einer Rechnungshistorie | dieselbe Liste: DEMO → BASIS → PRO → INDIVIDUELL |
| Einladung **angenommen**, mit Zeitpunkt und Person | Einladungsfläche von Hanse |
| Einladung **verfallen** / **zurückgezogen** | dieselbe Fläche |
| Nachweis **wartet auf Prüfung** | Nachweisliste von Jonas Harms |
| Nachweis **abgelehnt, mit Begründung** | dieselbe Liste — der einzige Zustand, in dem ein Grund stehen MUSS |
| Nachweis **archiviert** | dieselbe Liste, als abgelöster Vorgänger |
| Abwesenheit **Urlaub / Termin / Fortbildung** | Abwesenheiten bei Hanse, alle in der Zukunft |
| Abwesenheit **beantragt** (wartet auf Entscheidung) | dieselbe Fläche — hier entscheidet der Disponent |
| Abwesenheit **abgelehnt, mit Begründung** | dieselbe Fläche, mit dem Grund daneben |
| Zustandsgeschichte einer Kraft über fünf Stufen | Piotr Lewandow (HPS-003): verfügbar → im Einsatz → Montage → abwesend → inaktiv → verfügbar |

**Woran du einen Fehler erkennst:** zeigt die Rechnungsliste bei der
Null-Rechnung eine leere Zelle statt „0,00 €", ist die Formatierung nie an einer
Nullzeile geprüft worden. Steht bei der abgelehnten Abwesenheit oder dem
abgelehnten Nachweis **kein Grund**, verschweigt die Fläche genau das, worauf die
Datenbank besteht — beide Tabellen erzwingen die Begründung per CHECK. Und endet
die Zustandsgeschichte von HPS-003 auf etwas anderem als „verfügbar", während die
Belegschaftsfläche ihn als frei zeigt, widersprechen sich zwei Flächen; dann
glaubt der Leser der Historie, und die ist dann die falsche.

**Was die Abwesenheiten absichtlich NICHT tun:** keine davon liegt auf heute.
Eine wirksame Abwesenheit heute verdeckt eine Kraft am Markt und würde die
Zahlen verschieben, die die Wellen Y1.4 und Y2.3 gemessen haben — ohne dass
jemand den Zusammenhang sähe. Eine Notbremse in `sql/seeds/y6-besetzung.sql`
weist die Saat zurück, wenn eine neue Abwesenheit `CURRENT_DATE` berührt.

---

## 7. Was dieses Regiebuch NICHT ist

Keine Testautomatisierung. Die Wege sind für **Menschen** gedacht; was sich
automatisch prüfen lässt, prüfen die Wächter in `api/test/probebuehne*.test.js`
(Form der Saat) und `e2e/tests/*` (Klickpfade). Das Regiebuch schließt die Lücke
dazwischen: **sehen, dass es stimmt.**
