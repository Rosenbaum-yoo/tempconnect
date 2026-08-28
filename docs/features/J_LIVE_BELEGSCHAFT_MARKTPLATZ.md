# J — Live-Belegschaft als Plattformfläche, Marktplatz aus Unternehmenssicht

> **Stand:** 2026-08-26 · Worktree `brave-sanderson-9e9148` · Branch `claude/brave-sanderson-9e9148`
> **Zweck:** Diese Datei allein genügt, um J in einem neuen Chat ohne Rückfragen
> fortzusetzen. Erst lesen, dann die nächste offene Welle abarbeiten.
> **Status:** Plan — noch nichts gebaut. Owner-Freigabe je Welle abwarten.

> **Owner-Prompt (Abschnitt 19, sinngemäß):** Die Live-Belegschaft-Seite (lief lokal auf
> :8099) soll in die Plattform, unter „Einsätze & Zeiten" als neue Kachel, im
> Plattform-Design, mit DE/EN-Umschalter, intuitiv bedienbar mit Hilfe an den Knöpfen,
> Mouse-over-Erklärungen und kleinen Textboxen — „so bauen, dass wir für die Bedienung
> keinen Support brauchen oder nur minimalistisch". Anbindung an das Staff Control Center
> zum Überwachen und Klären (Beispiel Sperrliste: „Worker darf bei Unternehmen X nicht
> mehr eingesetzt werden"). Alles hart miteinander verdrahtet: Live-Belegschaft, Buchung,
> Marktplatz, Staff Center, Einsatzportal, Benachrichtigungen, Unternehmensseite,
> Zeitarbeitsfirmenseite. **Nur noch nicht Integriertes einbauen.**

> **Owner-Prompt (Abschnitt 20, sinngemäß):** Angebote im Marktplatz konsequent ausbauen.
> Dem Dealabschluss fehlt das Gefühl, etwas gekauft zu haben. Unternehmenssicht: wo, wie
> viele, ab wann → Auswahl noch nicht verbuchter Mitarbeiter erscheint. DSGVO-konformer
> Einblick in die Live-Kapazität der Zeitarbeitsfirmen, **damit die Zeitarbeitsfirma gar
> kein Angebot erstellen muss** — jede Kraft bekommt automatisch einen Buchungsknopf.
> Einsatzbeginn in unter 2 Tagen → Notdienst-Deal. Einzelne Kräfte **und** Bündel, auch
> über verschiedene Zeitarbeitsfirmen hinweg.

> **Owner-Präzisierung:** „Es geht hier um Live-Belegschaft und Marktplatz-Angebote von
> Zeitarbeitsfirmen aus Unternehmenssicht."

---

## 0. Owner-Entscheidungen (2026-08-26, verbindlich)

Die drei offenen Fragen aus §6 sind entschieden, dazu vier neue Vorgaben:

1. **Offener Markt.** Bei leerem `vendor_pool` sehen alle Unternehmen alle freien
   Kräfte (anonymisiert). Empfehlung angenommen.
2. **Buchung in drei Fragen.** Das Unternehmen sucht, findet eine Kraft, klickt
   Buchen — und beantwortet VOR der Buchung drei Fragen:
   **(1) Wie viele** Kräfte mit diesen Fähigkeiten? **(2) Von wann bis wann?**
   **(3) Wie teuer** — mit Preisvorschlägen aus dem Bestand.
   Form: **Modal-Assistent** (Entscheidung Claude: hält den Suchkontext, folgt dem
   Hausmuster des Commit-Assistenten, funktioniert auf kleinen Bildschirmen).
3. **Kein Notdienst-Aufschlag.** Der Notdienst ist das **Hauptverkaufsargument** —
   „unkompliziert eine Kraft in unter 48 Stunden als Ersatz" — und steht im
   Vordergrund, statt bepreist zu werden.
4. **Notdienst-Bereitschaft, zweistufig.** Die Kraft setzt im Einsatzportal bei
   Registrierung/Skill-Pflege eine Checkbox „Ich möchte als Notdienst eingesetzt
   werden" (Wunsch). Die **Zeitarbeitsfirma entscheidet** zusätzlich je Kraft, ob
   sie im Umkreis als Notdienst einsetzbar ist (Freigabe mit Radius) — die Freigabe
   ist maßgeblich („macht mehr Sinn, als es dem Mitarbeiter zu überlassen").
5. **Nur Zeitarbeitskräfte.** Es geht ausschließlich um Kräfte, die in Unternehmen
   eingesetzt werden — nie um interne Mitarbeiter der Zeitarbeitsfirma.
6. **Plattformweites Abbild.** Unternehmen sehen die freien Kräfte der **gesamten
   Plattform** aus der Live-Belegschaft — ohne komplizierte Deals abschließen zu
   müssen. (Der Überlassungsvertrag verschwindet dabei nicht — er entsteht
   automatisch: `agreement_snapshot` + Dokumente existieren, siehe 2.1.)
7. **Abrechnung muss funktionieren.** Rechnung Zeitarbeitsfirma → Unternehmen,
   abrechenbar über die Stundenzettel. → Welle J7 (der Kern existiert
   serverseitig bereits, siehe 2.4).
8. **Bauauftrag erteilt:** „baue das in Perfektion vom inkrementellen Start bis in
   die tiefste Ebene."

---

## 1. Die Leitfrage

Der Marktplatz kennt heute genau eine Richtung: **Jemand stellt ein Angebot ein, jemand
anders sucht danach.** Das setzt voraus, dass Angebote gepflegt werden.

Sie werden nicht gepflegt. Gemessen am 2026-08-26:

| | Zahl |
|---|---|
| Aktive Kräfte in der Datenbank | 33 |
| Davon **heute frei** (kein laufender Einsatz) | **24** |
| Aktive Einzelangebote im Marktplatz | **1** |
| Angebote im Zustand `draft` (nie veröffentlicht) | 10 |

Vierundzwanzig Menschen sind verfügbar. Ein einziges Angebot sagt es. Der Marktplatz ist
nicht leer, weil es keine Kapazität gibt — er ist leer, weil ihn niemand füttert.

**Die Owner-Vision dreht die Richtung um: Verfügbarkeit *ist* das Angebot.** Wer nicht
verbucht ist, steht zur Verfügung — ohne dass jemand einen Datensatz pflegt. Der Marktplatz
wird von einer Pinnwand zu einem Spiegel der Wirklichkeit.

Das ist keine Bequemlichkeitsfunktion. Es ist der Unterschied zwischen einem Marktplatz mit
einem Angebot und einem mit vierundzwanzig.

---

## 2. Ist-Stand — gemessen, nicht vermutet

Alle Angaben an der laufenden Datenbank (`tempconnect_db`) bzw. am Quelltext belegt.

### 2.1 Was bereits vollständig existiert

| Was | Beleg | Bedeutung für J |
|---|---|---|
| **Unternehmens-Live-Tafel, Backend** | `getCompanyLiveWorkforce` — [workforceService.js:484](../../api/services/workforceService.js), Route `GET /company/live-workforce` — [companyTimesheets.js:77](../../api/routes/companyTimesheets.js) | Die Fläche „wer arbeitet gerade bei mir" ist fertig. |
| **Unternehmens-Live-Tafel, Frontend** | Reiter `#tabLive` in [company-timesheets.html:87](../../frontend/public/company-timesheets.html), Logik [companyTimesheets.js:591,626](../../frontend/public/js/pages/companyTimesheets.js) | **Existiert bereits** — vier Kennzahlen (im Einsatz / endet in Kürze / fällt aus / Zeitarbeitsfirmen), Suche, echter Endpunkt. Siehe 2.2d. |
| **Zeitarbeitsfirmen-Live-Tafel** | `getWorkerLiveBoard` — [workforceService.js:675](../../api/services/workforceService.js), Route [workers.js:829](../../api/routes/workers.js); Frontend als Reiter in [mitarbeiter.html:206](../../frontend/public/mitarbeiter.html), 30-Sekunden-Abruf | Berechnet je Kraft `live_status`: `inaktiv`, `abwesend`, `verfuegbar`, `montage`, `endet_bald`, `im_einsatz`. **`verfuegbar` ist die Quelle für „wer ist frei".** |
| **Editorial-Design** | `theme.js:17` — `CONFIGURED_DEFAULT`; Tokens [design-system.css:1925-2290](../../frontend/public/css/design-system.css) | **Editorial ist bereits der Plattform-Standard**, nicht erst herzustellen. Warmes Papier `#f4efe4`, Forstgrün `#1f3a2e`, Wein `#7a2e2e`, Serifen nur für Überschriften. |
| **DE/EN-Umschalter** | `TCi18n` — `i18n.js`; Knopf wird automatisch in die Topbar gehängt ([pageShell.js:416](../../frontend/public/js/pageShell.js)) | Der geforderte Umschalter entsteht von selbst, sobald die Seite dem Seitenmuster folgt. |
| **Sperrliste** | `companyBlocklistService`, Routen `GET/POST /company/blocklist` — [companyTimesheets.js:91](../../api/routes/companyTimesheets.js) | Liegt bereits **direkt neben** der Live-Tafel. Der Owner-Fall „Worker darf bei X nicht mehr" ist gebaut. |
| **Reservierungs-Kopplung** | `workerOfferReservationService` — `BUSY_EXISTS_SQL` / `RESERVE_SQL` / `RELEASE_SQL` | Bindet ein Einsatz eine Kraft, werden ihre Angebote automatisch `paused` + `worker_reserved=TRUE`; wird sie frei, kommen sie zurück. **Idempotent, set-basiert.** |
| **Anonymitäts-Absicht** | `capacity_posts.is_anonymous` — **TRUE bei allen 33 Zeilen**; P8 §3.5 „Anonymität bleibt" | Die Absicht ist entschieden. Der Vollzug fehlt — siehe 2.2e. |
| **Datenschutz-Whitelist** | `PUBLIC_PROFILE_FIELDS` — [workerService.js:127](../../api/services/workerService.js): `name`, `city`, `skill_tags`, `qualifications`, `profile_text`, `availability_note`; `buildWorkerPublicProfile` gibt ohne `profile_public` **null** zurück | Ein fertiges, enges Muster. Filtert auch `document_url` aus Qualifikationen. **J2 baut darauf auf, statt eine zweite Regel zu erfinden.** |
| **Dreischritt-Assistent** | `window.openCommitWizard` — [offer_detail.html:1637-1683](../../frontend/public/offer_detail.html), gespeist aus `commitment-preview` | Schritt 1 **Was** (Leistung, Zeitraum, Menge, Ort, Preis) · Schritt 2 **Wer/Wie** · Schritt 3 **Verbindlichkeit**. Genau die Anatomie, die Abschnitt 20 verlangt — siehe 2.2a. |
| **Konditionen-Einfrierung** | `offers.agreement_snapshot` (JSONB), `buildConditionsSnapshot` — [dealAgreementService.js:39](../../api/services/dealAgreementService.js); Referenz `EV-JJJJ-NNNNNN` | Preis, Zuschläge, Kündigungsregel, Ersatz-SLA werden beim Abschluss eingefroren und als zwei Dokumente abgelegt. |
| **Sichtbarkeitsstufen** | `capacity_posts_visibility_status_check`: `public`, `plan_gated`, `vendor_pool_only`, `private` | `vendor_pool_only` ist genau die Stufe „nur meine Lieferanten sehen das". |
| **Geschäftsbeziehung** | Tabelle `vendor_pool` (client_org_id, supplier_org_id, tier, status, valid_from/until) | Die Rechtsgrundlage für den Einblick. **Aktuell 0 Zeilen.** |
| **Angebotsarten** | `offer_kind`: `legacy`, `single_skill`, `bundle`, `pool_single_skill`, `pool_multi_skill` — Achtung: `bundle` = **eine** Kraft mit mehreren Fähigkeiten ([capacityOfferGeneratorService.js:159,167](../../api/services/capacityOfferGeneratorService.js): `headcount: 1`, ein `worker_profile_id`); **mehrere** Kräfte laufen über `pool_*` + Tabelle `capacity_post_pool_members` | Was der Owner „Bündel" nennt (mehrere Kräfte für eine Position), heißt im Datenmodell `pool_*`. |
| **Notdienst** | `emergencyStaffingService` — fünf Stufen mit SLA-Fenstern (NOTDIENST: 30/15 Min), Migration 180 (Antwortpfad) | Der Mechanismus existiert — aber siehe 2.2f. |
| **Mehrstufige Bestätigung** | `dealCommitmentService`, `GET /marketplace/offers/:id/commitment-preview` + `/cancellation-impact`, Assistent in `offer_detail.html` (P8 Welle D, 2026-08-07) | Ein dreistufiger Assistent **existiert** — siehe 2.2. |
| **72-Stunden-Frist mit Deckelung** | `anfrageFristSql` — [workerService.js](../../api/services/workerService.js), Migrationen 195/197/199 (diese Session) | `GREATEST(LEAST(NOW()+72h, Einsatzbeginn), NOW()+4h)`. Siehe 5.4 — koppelt bereits an den Notdienst-Fall. |

### 2.2 Die drei scharfen Lücken

**(a) Der Kaufmoment ist ein Browser-Systemdialog — obwohl der Dreischritt existiert.**

Der Abschluss hat serverseitig drei saubere Zustandsübergänge
(`pending_confirmation` → `confirmed` → `activated`, Migration 083), und für den
*Bestätigungs*-Schritt der Zeitarbeitsfirma gibt es seit P8 Welle D den dreistufigen
Assistenten `openCommitWizard` (Was → Wer/Wie → Verbindlichkeit).

Aber der **erste Klick des Unternehmens** — der Moment, in dem der Deal entsteht — ist
[capacityExchangeDetail.js:1431](../../frontend/public/js/pages/capacityExchangeDetail.js):

```js
if (!confirm(t("capm.im.confirmAccept"))) {
  return;
}
```

Ein graues `window.confirm()`, ohne Preis, ohne Konditionen, ohne den Namen dessen, was
gekauft wird. Genau der Moment, dem laut Owner „das Gefühl fehlt, etwas gekauft zu haben".
Der Baustein, der das Gefühl erzeugt, ist gebaut, getestet (24 Unit- + 13 E2E-Tests) —
und wird an dieser Stelle nicht benutzt.

**(b) Mehr-Kräfte-Angebote enden an der Firmengrenze.**

Die Pool-Mitglieder-Validierung lässt nur Kräfte **einer** `supplier_org_id` zu
([capacityOfferGeneratorService.js:303-310](../../api/services/capacityOfferGeneratorService.js):
`wp.supplier_org_id = $3`), und `capacity_posts` trägt genau ein `supplier_company_id` und
ein `org_id` — es gibt kein Feld für eine zweite liefernde Firma. Ein Verbund aus Kräften
**zweier** Zeitarbeitsfirmen ist im heutigen Datenmodell nicht abbildbar. Genau das
verlangt Abschnitt 20.

**(c) Die Sperrliste greift im Marktplatz nicht.**

`isWorkerBlockedForCompany` wird aufgerufen aus `companyTimesheets.js`, `workers.js`,
`workerService.js` — **nicht** aus `marketplace.js`. Eine gesperrte Kraft ist heute im
Marktplatz sichtbar und buchbar. Das ist ein Defekt, kein fehlendes Feature.

**(d) Die Live-Belegschaft ist ein Reiter, keine Fläche.**

Beide Sichten existieren im Frontend — aber je als dritter Reiter einer anderen Seite:

| Sicht | Wo | Aufruf |
|---|---|---|
| Unternehmen | `company-timesheets.html:87`, Reiter `#tabLive` | `GET /company/live-workforce` |
| Zeitarbeitsfirma | `mitarbeiter.html:206`, Reiter `data-tab="live"` | `GET /workers/live-board`, Abruf alle 30 s |

Eine eigenständige Datei (`live-belegschaft.html`, `workforce.html`) existiert **nicht**.
In der Kachelliste von „Einsätze & Zeiten"
([worker-submissions-review.html:363-404](../../frontend/public/worker-submissions-review.html))
stehen sechs Kacheln — **keine davon führt zur Live-Belegschaft.**

Das ist der Kern von Abschnitt 19: Die Tafel existiert, aber sie ist versteckt. Und weil
aus ihr heraus der Marktplatz entstehen soll (Abschnitt 20), reicht ein Reiter nicht — sie
braucht eine eigene Adresse, auf die Kacheln, Benachrichtigungen und Deep-Links zeigen
können.

**(e) `is_anonymous` wird geschrieben, aber nie gelesen.**

Der Marktplatz-Feed liefert `cp.*` aus — **alle 47 Spalten**, darunter `worker_profile_id`
(die interne Kennung des Arbeiters), `notes`, `qualification_summary` und die
Anbieter-E-Mail ([capacityExchangeService.js:34-48](../../api/services/capacityExchangeService.js)).
`is_anonymous` steht überall auf TRUE, aber **keine einzige Abfrage filtert darauf.** Die
Anonymität existiert als Absicht, nicht als Vollzug. Solange kein Klarname im Feed steht,
ist das kein akuter Vorfall — aber J2 stellt Arbeiterdaten prominenter aus als je zuvor
und muss diesen Filter **zuerst** scharf schalten.

**(f) Der Notdienst ist reine Handarbeit.**

`emergencyStaffingService` kennt fünf Dringlichkeitsstufen mit SLA-Fenstern — aber der
Auslöser ist ausschließlich ein **manuell gesetztes Feld**. Eine Vorlaufprüfung
(„Einsatzbeginn in unter X Stunden") existiert nirgends im Service; die einzige
Vorlaufberechnung im Haus (`berechneVorlaufStunden`,
[dealAgreementService.js:550](../../api/services/dealAgreementService.js)) bedient Stornos.
Zusätzlich: `POST /emergency/request` wird von **keiner einzigen Frontend-Seite**
aufgerufen — der Kern des Notdienst-Systems ist unverdrahtet. Die Owner-Regel „unter
2 Tagen → Notdienst-Deal" ist damit vollständig neu zu verdrahten, aus vorhandenen Teilen.

### 2.3 Der ungenutzte Vorrat

`vendor_pool` hat null Zeilen. Das heißt: Die Sichtbarkeitsstufe `vendor_pool_only` lässt
heute **niemanden** durch. Wer sie setzt, macht sein Angebot unsichtbar. Für J ist das
zentral — die ganze DSGVO-Architektur des Hauses steht auf einer Tabelle, die nie befüllt
wurde.

### 2.4 Die Abrechnungskette — gemessen am 2026-08-26

Der Owner fragte „habe ich was vergessen?" — die Kette Stundenzettel → Rechnung
existiert serverseitig **vollständig**, ihr fehlt die Oberfläche:

| Was | Beleg | Zustand |
|---|---|---|
| Operative Rechnung ZAF → Unternehmen | `invoice_type='operational'`, Migration 086; `operationalInvoiceService.generateFromTimesheets` — [operationalInvoiceService.js:76](../../api/services/operationalInvoiceService.js) | **fertig**: nur `approved`-Timesheets, Duplikatschutz über `timesheets.invoice_id`, Überstunden +25 %, USt 19 %, Zahlungsziel 14 Tage, Nummernkreis `TC-<Jahr>-<Nr>` |
| Beide Seiten sehen dieselbe Rechnung | `gehoertZurOrg()` — beidseitige Mandantengrenze | fertig |
| Freigabekette | zwei Ketten hintereinander: `worker_time_submissions` (Kraft erfasst → Agentur prüft → Kunde bestätigt → `posted_to_timesheet` erzeugt `timesheets`) → `timesheets` (`submitted` → Kunde `approved`, `ONLY_BUYER_CAN_APPROVE`) | fertig |
| **Oberfläche** | repo-weit: kein Frontend-Aufrufer von `/invoices/operational/*` | **fehlt** |
| **PDF für operative Rechnungen** | nur CSV-Export; die PDF-Route bedient den Abo-Pfad | **fehlt** |
| **Versand** | `issued` ist ein Statuswechsel, keine Zustellung; Mail nur für Mahnungen | fehlt |
| **Satz-Einfrierung** | die Abrechnung liest das **mutable** `assignments.hourly_rate_cents`; der eingefrorene `agreement_snapshot` liegt ungenutzt auf `offers` | Lücke |
| Rate Cards | existieren, werden bei der Abrechnung **nicht** gelesen (eigene 25-%-Konstante) | getrennte Welten |
| **AÜG-Fristen** | Höchstüberlassungsdauer/Equal-Pay: **nirgends modelliert** (nur Dokument-Compliance `aueg_erlaubnis` + Haftungsausschluss „TempConnect ist nicht der Verleiher") | bewusst offen — Owner-Entscheidung, ob die Plattform warnen soll (§6) |

---

## 3. Verbindliche Leitentscheidungen

Diese Entscheidungen habe ich getroffen, weil sie aus dem Bestand folgen. Der Owner kann
jede kippen — dann ändert sich J. Bis dahin gelten sie.

### 3.1 Kein Klarname vor der Buchung

`is_anonymous` steht bei allen 33 Angeboten auf `TRUE`, und P8 §3.5 hält
„Anonymität bleibt" bereits fest. **J ändert das nicht.**

Ein Unternehmen sieht vor der Buchung: Rolle, Qualifikationen, Verfügbarkeitsfenster,
Einsatzort/Radius, Preisrahmen, Zeitarbeitsfirma, Zuverlässigkeitsquote — **kein
Klarname, kein Foto, keine Personalnummer.** Nach bestätigter Buchung erscheint die Person
namentlich in der Live-Belegschaft, wie heute auch.

*Begründung:* Der Kunde braucht zum Buchen die Fähigkeit, nicht die Identität. Der Name ist
für die Auswahl entbehrlich und für den Betroffenen unumkehrbar.

### 3.2 Sichtbar ist der Grundzustand, das Buchen ist eine Anfrage

Zwei getrennte Fragen, zwei getrennte Antworten:

**Sichtbarkeit:** Eine freie Kraft ist sichtbar, sobald ihre Zeitarbeitsfirma die
automatische Marktpräsenz eingeschaltet hat — als **Ausschalter je Kraft**, nicht als
Einschalter. Wäre es ein Einschalter, hätten wir wieder das Pflegeproblem aus §1 und der
Marktplatz bliebe leer.

**Buchung:** Ein Klick des Unternehmens erzeugt **keinen** fertigen Deal, sondern eine
Anfrage, die die Zeitarbeitsfirma bestätigt. Der Mechanismus dafür ist in dieser Session
gebaut worden: `pending_confirmation` mit 72-Stunden-Frist, gedeckelt auf den
Einsatzbeginn, Mindestfrist 4 Stunden, automatischer Verfall mit Kundenmeldung, Rückzug
durch die Zeitarbeitsfirma (Migrationen 195/197/199).

*Begründung:* Die Zeitarbeitsfirma behält die Hoheit über ihre Leute — ohne dass sie
Datensätze pflegen muss, um am Markt zu sein. Das ist der Kern der Owner-Vision.

### 3.3 Bei Doppelbuchung entscheidet die Datenbank, nicht der Mensch

Zwei Unternehmen greifen gleichzeitig nach derselben Kraft: Wer zuerst schreibt, bekommt
sie. `RESERVE_SQL` ist set-basiert und atomar; die zweite Anfrage läuft ins Leere und
bekommt die ehrliche Meldung „inzwischen vergeben" — mit Vorschlägen vergleichbarer Kräfte
im selben Fenster.

*Begründung:* Jede andere Regel (die Zeitarbeitsfirma wählt aus) verlangt eine menschliche
Entscheidung in genau dem Moment, in dem Geschwindigkeit zählt — besonders im Notdienst.

### 3.4 Firmenübergreifende Bündel sind eine Anfrage, kein Angebot

Ein Bündel über mehrere Zeitarbeitsfirmen kann kein `capacity_post` sein (2.2b). Es ist ein
**Bedarf des Unternehmens**, den mehrere Firmen gemeinsam decken: „Ich brauche vier
Elektriker ab Montag" → das System stellt einen Vorschlag aus den freien Kräften mehrerer
Firmen zusammen → jede Firma bestätigt nur ihren Teil.

*Begründung:* Das nutzt `demand_requests` (existiert) statt eine neue Angebotsart zu
erfinden, und es passt zu 3.2 — jede Firma entscheidet nur über ihre eigenen Leute.

### 3.5 Der Notdienst ist eine Eigenschaft, kein eigener Marktplatz

Einsatzbeginn in unter 48 Stunden macht einen Deal zum Notdienst-Deal — als **Kennzeichen
am selben Vorgang**, nicht als getrennte Fläche. Die Frist zieht sich dabei automatisch
zusammen, ohne eine einzige neue Zeile: `LEAST(NOW()+72h, Einsatzbeginn)` liefert bei einem
Einsatz in unter 48 Stunden zwangsläufig eine Frist unter 48 Stunden (siehe 5.4).

### 3.6 Wo die Flächen liegen

Nach der Entscheidungsfrage aus `CLAUDE.md` / `docs/FLAECHEN.md`:

| Fläche | Was hierher gehört |
|---|---|
| **Unternehmensseite** („Einsätze & Zeiten") | Live-Belegschaft (wer arbeitet bei mir), Marktplatzsicht auf freie Kräfte, Buchung, Sperrliste |
| **Zeitarbeitsfirmenseite** | Live-Tafel (existiert), Marktpräsenz-Schalter je Kraft, eingehende Buchungsanfragen |
| **Staff Control Center** | Überwachung: hängende Anfragen, Verfallsquote, Sperrlisten-Konflikte, Angebote ohne Deckung — die Arbeit des **Teams** an der Plattform |
| **Support Center** | Streitfälle **zwischen** Unternehmen und Zeitarbeitsfirma |

Die Sperrliste selbst ist ein Verhältnis zwischen zwei Kunden — sie wird auf der
Unternehmensseite **gepflegt** und im Staff CC **überwacht**, nicht dorthin verschoben.

---

## 4. Wellen

Jede Welle ist einzeln lieferbar, einzeln testbar und einzeln freizugeben. Reihenfolge ist
Absicht: Jede Welle macht die nächste möglich.

### Welle J1 — Die Live-Belegschaft wird eine eigene Fläche ✅ *(erledigt 2026-08-26)*

**Umgesetzt:** `company-live-workforce.html` + `companyLiveWorkforce.js` (Umzug von
Live-Tafel, Meldungen und Sperrliste aus `company-timesheets.html`, die nur den
Stundenzettel-Eingang behält und alte `?einsatz=`/`#live`-Deep-Links mitsamt Kennung
weiterleitet). Kacheln unter „Einsätze & Zeiten": Zeitarbeitsfirmen bekommen die
Live-Kachel (`mitarbeiter.html#live-alle`), Unternehmen bekommen statt der bisherigen
Sackgasse (Sperrtext ohne Weg) drei eigene Einstiege (`companyHubSection`:
Live-Belegschaft, Stundenzettel-Eingang, Meine Deals). Navigation (`pageShell.js`:
match + zwei rollen-getrennte Suchintents — der „Mitarbeiter"-Intent ist jetzt
`org:"agency"`, sonst hätte „Belegschaft" Unternehmen auf die Agenturseite geführt),
Breadcrumb (+ `company-timesheets`, das fehlte), Kontexthinweis (`contextHints.js`),
eingebaute Kurzhilfe (`details`-Kasten), Mouse-over-Hilfe an allen Kennzahlen und
Aktionen. Backend-Deep-Links umgestellt: `kundenDeepLink` + drei `linkPath` in
`notificationMatrix.js`. Register + PAGE_OWNERSHIP nachgeführt.

**Verifiziert:** `h1KundenansichtAusfall` auf die neue Fläche umgezogen und um vier
Prüfungen erweitert (Alt-Hash bleibt gültig, `#meldungen`/`#sperrliste`,
Weiterleitungs-Wächter) — 39/39 grün; `frontendVerdrahtung` + `dokuWaechter` +
`frontendCanonicalPages` + `docsConsistency` 34/34; Benachrichtigungs-/Sichtbarkeits-
Wächter 92/92; DB-gebundener G4b-Fluss 35/35. Browser-Smoke gegen den Worktree-Stand:
alle Ressourcen 200, Paywall-Zustand real, Editorial-Theme aktiv, DE↔EN schaltet live.

**Ursprünglicher Plan:**

**Warum zuerst:** Backend und ein großer Teil der Oberfläche existieren (2.1, 2.2d). Diese
Welle hebt einen versteckten Reiter zu einer Fläche mit eigener Adresse — und das ist die
Voraussetzung dafür, dass J2 daran andocken kann.

**Kein Neubau, ein Umzug.** Der Reiter aus `company-timesheets.html` zieht in eine eigene
Seite `company-live-workforce.html`; der bisherige Reiter verweist dorthin. Keine
Parallelstruktur — die Logik wird verschoben, nicht kopiert.

Konkrete Eintragsstellen (aus der Erhebung, Stand 2026-08-26):

| # | Stelle | Was |
|---|---|---|
| 1 | `frontend/public/company-live-workforce.html` | Neue Seite nach dem Hausmuster: `theme.js` + `i18n.js` im `<head>` **vor** `<meta charset>`, `#tc-shell`, `.ds-page-header` |
| 2 | `frontend/public/js/pages/companyLiveWorkforce.js` | Logik aus `companyTimesheets.js:591-640` + `TCi18n.register('de'/'en', …)` |
| 3 | `worker-submissions-review.html:363-404` | **Die neue Kachel** — siebte in der Liste |
| 4 | `pageShell.js:32` | Pfad ins `match`-Array von `deals_einsaetze` |
| 5 | `pageShell.js:1214-1256` | Suchintent „Belegschaft" (zeigt heute auf `mitarbeiter.html`) |
| 6 | `breadcrumb.js:62-66` | Bereichszuordnung „Einsätze & Zeiten" |

**Design:** Editorial ist bereits Standard — die Seite muss ihn nicht herstellen, nur die
`--ds-*` Tokens benutzen und keine festen Farbwerte setzen. Der Theme- und der
DE/EN-Umschalter erscheinen automatisch in der Topbar.

**Hilfesystem (Owner: „kein Support oder nur minimalistisch"):** Es gibt kein generisches
Tooltip-Bauteil im Design-System. Drei vorhandene Muster tragen die Anforderung:

- `title=` + `data-i18n-title` an jedem Knopf und jedem Zustandszeichen — das Hausmuster
  für Mouse-over-Hilfe (Beispiel `mitarbeiter.html:224`)
- `contextHints.js` — der einklappbare Erklärkasten unten rechts. Für „Einsätze & Zeiten"
  existiert **kein** Eintrag; J1 legt ihn an (Schlüssel = Pfad ohne `/public/` und `.html`)
- Kurze Erklärzeile unter jeder Kennzahl statt eines nackten Zahlenwerts

Jeder der sechs Zustände (`inaktiv`, `abwesend`, `verfuegbar`, `montage`, `endet_bald`,
`im_einsatz`) bekommt eine Erklärung in beiden Sprachen. Das ist der Ort, an dem sonst
Support entsteht.

**Sperrliste:** direkt eingebunden (`GET/POST /company/blocklist`, existiert) — mit einem
Satz, der sagt, was eine Sperre bewirkt und ab wann.

**Fertig, wenn:** Die Fläche über eine Kachel erreichbar ist, jeden Zustand ohne Nachfrage
erklärt, eine Sperre setzen kann, in beiden Sprachen vollständig ist, und alle Zustände
(leer, ladend, Fehler) real auslösbar sind. Konsole ohne Fehler.

### Welle J2 — Der Marktplatz bekommt eine Unternehmenssicht auf freie Kräfte

**Der Kern der Owner-Vision.**

- ~~**Zuerst der Vollzug der Anonymität (behebt 2.2e)**~~ ✅ *(erledigt 2026-08-26)*:
  `capacityPostOeffentlicheSpalten.js` ist die einzige Wahrheit — Positivliste
  `OEFFENTLICH` (46 Spalten) + `NUR_INTERN` (`worker_profile_id`, `created_by`).
  Der Alias-Stern ist aus **vier** Abfragen verschwunden (Feed/Detail/Eigenliste in
  `capacityExchangeService`, Liste/Detail/Matching in `marketplaceService`), die
  Anbieter-E-Mail aus **drei** (Feed-Angebot, Feed-Bedarf, `getDemandMatches` — sie
  ging an die Gegenseite vor dem Deal, kein Frontend hat sie je gelesen). Wächter
  `marktplatzFeldWaechter.test.js`: Listen disjunkt, DB-Abgleich (jede reale Spalte
  klassifiziert — eine neue Migration wird rot, bis sie eingeordnet ist), Quelltext
  ohne Alias-Stern/E-Mail. 8/8 mit DB; Marktplatz-Regressionen 154 + 374 grün.
- ✅ **Die Automatik „Verfügbarkeit ist das Angebot"** *(J2b-Kern, 2026-08-26)*:
  Migration 200 (`worker_profiles.marktpraesenz_deaktiviert` als **Ausschalter**,
  `capacity_posts.quelle` `manuell`/`live_belegschaft`), `marktpraesenzService.js` —
  set-basierter, idempotenter Sweep (Rücknahme → Wiederkehr → Anlage → Lückenmaß),
  eingehängt in den `staffing-maintenance`-Cron **vor** dem Reservierungs-Sweep
  (derselbe Takt, kein neuer Endpunkt). Regeln, testverdrahtet: Rücknahme fasst nur
  `quelle='live_belegschaft'` und nur offene Zustände an (nie `reserved`/`filled`),
  Wiederkehr respektiert `worker_reserved`, Anlage nur mit Katalog-Skill + Ort,
  Dedup über den Index aus Mig 145. `setzeMarktpraesenz` (org-gebunden) ist der
  Schalter für die Agenturtafel (J2c). 8/8 Tests inkl. echtem Schalter-Zyklus an
  der DB. **Produkt-Befund dabei:** nur **3 von 33** Kräften haben Katalog-Skills
  gepflegt — die Automatik misst diese Lücke jetzt mit
  (`unsichtbar_ohne_skill`/`_ohne_ort`) für Aufsicht (J6) und Agentur-Hinweis (J2c).
  Skill-Pflege ist damit der Hebel, der den Marktplatz füllt.
- ✅ **J2c komplett** *(2026-08-26)* — drei Teile:
  **(1) Server:** `marktplatzBuchungService.pruefeBuchungsWuensche` prüft die drei
  Owner-Fragen gegen das Angebot (Europe/Berlin; außerhalb = Verhandlung, Antwort
  trägt den Rahmen); `accept-deal` nimmt sie additiv an und friert einen gewählten
  Preis als Zahl ein. Sperrliste greift: Feed-Ausblendung (`browseFeed`,
  org-gebunden, befristungs-bewusst) + serverseitiger Riegel in `accept-deal`
  (409, **vor** der Angebotserstellung). **Releasekritischer Beifang:** Seit P9/B1
  (46dab6b, 10.08.) brach der GESAMTE Feed für jeden angemeldeten Betrachter —
  der Merk-Parameter fuhr in der Zähl-Query mit (Postgres 08P01); Mock-Pools
  schlucken überzählige Parameter, der neue DB-gated Teil C nicht. Gefixt
  (`countParams` vor dem Merk-Push eingefroren); Feed liefert wieder.
  **→ Muss auf die Release-Linie** (dort weiter kaputt, bis gemergt/gecherry-pickt).
  **(2) Unternehmenssicht:** Reiter „Verfügbare Kräfte" auf der Live-Belegschaft-
  Fläche (`#verfuegbar`): Filter wo/ab wann/wie viele/Rolle (vorhandene
  Feed-Parameter), anonymisierte Liste mit „aus Live-Belegschaft"-Abzeichen,
  Buchen-Knopf → **3-Fragen-Modal** (Vorbelegung: heute/Angebotsfenster,
  Preisvorschlag = Rahmenmitte) → `accept-deal` → Erfolgsansicht mit Referenz +
  Dealakte-Link; jeder Serverfehler wird zur Handlungsanweisung übersetzt.
  **(3) Agenturtafel:** `POST /workers/:profileId/marktpraesenz` (org-gebunden,
  auditiert), Markt-an/aus je Kraft auf der Live-Tafel, Warnabzeichen „Im
  Marktplatz unsichtbar – Katalog-Skills fehlen" mit Erklär-Tooltip;
  `getWorkerLiveBoard` liefert `marktpraesenz_deaktiviert` + `hat_katalog_skill`.
  **Wächter-Lektion:** Der Org-Grenzen-Spion wies die erste Schalter-Fassung ab
  (globaler Sweep nach org-gebundenem UPDATE = unbeweisbare Grenze) —
  `setzeMarktpraesenz` läuft jetzt vollständig kraft- UND org-gebunden; Register
  `wachen.json` (466/163) + `orgGrenzen.json` (`sql-grenze`) gepflegt, 622/622.
  **Offen aus J2c:** E2E-Klickpfad (Playwright) erst nach Merge in die
  Release-Linie sinnvoll (der Docker-Stack fährt das Haupt-Repo).
- Neue Ansicht: „Wer ist frei?" — gespeist aus `live_status IN ('verfuegbar','endet_bald')`
- Filter nach Owner-Vorgabe: **wo, wie viele, ab wann** + Qualifikation
- Darstellung nach 3.1, aufgesetzt auf die vorhandene Whitelist
  (`PUBLIC_PROFILE_FIELDS` / `buildWorkerPublicProfile`) statt einer zweiten Regel
- Sichtbarkeit über `vendor_pool` **und** `visibility_status` — mit einer bewussten
  Entscheidung des Owners, ob bei leerem `vendor_pool` (2.3) alle Firmen füreinander
  sichtbar sind oder nur die verknüpften
- **Sperrlisten-Filter (behebt 2.2c)** — gesperrte Kräfte verschwinden aus der Sicht
- Buchungsknopf je Kraft → **Modal-Assistent mit den drei Owner-Fragen** (§0.2):
  Wie viele? Von wann bis wann? Zu welchem Preis (mit Vorschlägen aus
  `price_min`/`price_max` des Bestands bzw. `smartPricingService`)? → erzeugt die
  Anfrage nach 3.2. Beginn < 48 h → Notdienst-Kennzeichen (J4) prominent im Modal.
- Rollenprüfung nach Hauskonvention des Marktplatzes: `users.role === 'company'` →
  sonst `403 COMPANY_ONLY` (Muster [marketplace.js:518](../../api/routes/marketplace.js));
  eine `org_type`-Spalte auf `users` gibt es nicht

**Fertig, wenn:** Ein Unternehmen die freien Kräfte sieht (heute wären es 24), filtern
kann, eine bucht, die Zeitarbeitsfirma die Anfrage im Einsatzportal bestätigen oder
zurückziehen kann — und kein Feld die Feed-Antwort verlässt, das nicht auf der
ausdrücklichen Liste steht (per Test erzwungen).

### Welle J3 — Der Kaufmoment

Der Dreischritt existiert (`openCommitWizard`, 2.2a) — er wird heute nur beim
*Bestätigen* durch die Zeitarbeitsfirma benutzt, nicht beim *ersten Klick* des
Unternehmens. J3 ist deshalb **Wiederverwendung, kein Neubau**:

- `window.confirm()` an `deal_accept` ersetzen durch denselben Assistenten:
  **Was** (Leistung, Anzahl, Zeitraum, Ort) → **Zu welchen Bedingungen** (Preis aus dem
  `agreement_snapshot`-Vorrat, Zahlungsziel, Notdienst-Aufschlag) → **Verbindlich
  zusagen** (mit Betrag im Knopf, nicht „OK")
- Speist sich aus `dealCommitmentService` / `commitment-preview` — ggf. um eine
  Vor-Abschluss-Vorschau erweitert (heute antwortet der Endpunkt erst, wenn das Angebot
  existiert)
- Danach: Bestätigungsmoment mit Vorgangsnummer (`EV-…`), Dokumenten, nächsten Schritten

**Fertig, wenn:** Der Klickpfad durchgespielt ist, kein Schritt überspringbar ist, der
Betrag aus der Antwort stammt (nicht aus festem Text) und der Serverriegel unverändert hält.

### Welle J4 — Notdienst als Hauptverkaufsargument

Gemessen (2.2f): kein automatischer Auslöser, und `POST /emergency/request` hat keinen
einzigen Frontend-Aufrufer. Owner-Vorgaben (§0.3/0.4): **kein Aufschlag** — der Notdienst
ist das Verkaufsversprechen („Ersatz in unter 48 Stunden, unkompliziert"), und die
Bereitschaft ist zweistufig.

- Schwelle: Einsatzbeginn < 48 Stunden → Vorgang wird als Notdienst-Deal gekennzeichnet,
  serverseitig beim Anlegen/Annehmen berechnet (Europe/Berlin, nicht im Client)
- **Bereitschafts-Modell (Migration nötig):** `worker_profiles.notdienst_wunsch`
  (Checkbox der Kraft im Einsatzportal, Registrierung + Skill-Pflege) und
  `notdienst_freigabe` + `notdienst_radius_km` (Entscheidung der Zeitarbeitsfirma je
  Kraft). **Wirksam ist die Freigabe**; der Wunsch ist ihr Signal und Vorschlagswert.
- Die vorhandene Stufen-Maschine (`URGENCY_CONFIG`, SLA-Fenster) wird angeschlossen statt
  dupliziert; die Frist zieht sich automatisch zusammen (5.4)
- Sichtbar auf beiden Seiten: Notdienst-Kennzeichen prominent im Feed, in der
  Unternehmenssicht (J2), im Kaufmoment (J3), in der Benachrichtigung — als Versprechen,
  nicht als Zuschlag

### Welle J5 — Firmenübergreifende Verbünde

Owner-Wort „Bündel" ≠ Datenmodell-`bundle` (das ist **eine** Kraft mit mehreren
Fähigkeiten). Gemeint sind **mehrere Kräfte für eine Position, notfalls aus mehreren
Firmen** — im Datenmodell heute `pool_*`, und das endet an der Firmengrenze (2.2b).

- Nach 3.4 über `demand_requests`, nicht über eine neue Angebotsart
- Vorschlag aus freien Kräften mehrerer Firmen, je Firma einzeln bestätigt
- Teilbestätigung muss sauber sein: drei von vier bestätigt = drei Kräfte, ein offener Rest

### Welle J6 — Staff-Control-Center-Aufsicht

- Hängende Anfragen (Frist läuft), Verfallsquote je Firma
- Sperrlisten-Konflikte (gesperrte Kraft wurde angefragt)
- Kräfte ohne Marktpräsenz trotz Verfügbarkeit
- **Nur Beobachtung und Klärung** — keine Doppelung der Kundenflächen (3.6)

### Welle J7 — Abrechnung wird bedienbar

> **Ist-Stand am 2026-08-28 gemessen** (nach dem Zusammenfuehren der Release-Linie,
> die mit der E-Rechnung EN 16931 einen Teil der Vorarbeit mitbringt). Drei Befunde
> bestimmen den Zuschnitt dieser Welle — der dritte war nicht geplant:
>
> **Befund 1 — der Nummernkreis ist geteilt UND wird zu frueh vergeben.**
> `nextInvoiceNumber` zieht aus der globalen Sequenz `invoice_number_seq`
> ([operationalInvoiceService.js:47](../../api/services/operationalInvoiceService.js)),
> die sich die operative Rechnung mit der Abo-Rechnung der Plattform teilt
> ([invoiceService.js:44](../../api/services/invoiceService.js)). Jede Abo-Rechnung
> reisst damit eine Luecke in den Kreis der Zeitarbeitsfirma. Zweitens faellt die
> Nummer schon beim ENTWURF (`generateFromTimesheets`, Zeile 187), nicht beim
> Stellen — ein verworfener Entwurf hinterlaesst eine Luecke, die niemand erklaeren
> kann. Gemessen: Sequenzstand **1024**, existierende Rechnungen **0** — es sind also
> bereits 24 Nummern verbraucht, ohne dass eine Rechnung existiert.
>
> **Befund 2 — der Abrechnungssatz ist frei aenderbar.**
> `assignments.hourly_rate_cents` steht in der Update-Whitelist
> ([assignmentService.js:162](../../api/services/assignmentService.js)), und die
> Abrechnung liest genau dieses Feld (`operationalInvoiceService.js:133`). Wer den
> Satz nach geleisteter Arbeit aendert, aendert rueckwirkend die Rechnung. Der
> eingefrorene `agreement_snapshot` existiert — aber auf `offers`, und die
> Abrechnung liest ihn nicht.
>
> **Befund 3 (neu, ungeplant) — die Rechnungsstammdaten sind leer.**
> Migration 187 der Release-Linie hat Anschrift und USt-IdNr. auf `organizations`
> gelegt, weil die Norm sie fuer die Rechtsperson verlangt. Gepflegt werden sie
> nirgends: **0 von 2240 Organisationen** haben eine Anschrift, keine hat USt-IdNr.
> oder Steuernummer. Es gibt weder eine Oberflaeche noch einen Endpunkt dafuer —
> `slaProfil.js` pflegt die Adresse auf `users`, also genau nicht auf der
> Rechtsperson, die Rechnungssteller ist. **Ohne diese Daten ist keine Rechnung
> gueltig (§ 14 UStG), und die ganze Kette endet im Entwurf.** Uebernehmbar waeren
> nur 6 Orgs. Die abrechnungsrelevante Menge ist aber klein: **5 Zeitarbeitsfirmen
> und 17 Unternehmen** haben ueberhaupt Einsaetze — die Pflege ist machbar, sie
> muss nur moeglich sein.
>
> **Guenstiger Umstand:** Es existiert **keine einzige Rechnung** (operativ wie Abo).
> Der Nummernkreis kann deshalb ohne Bestandsmigration eingefuehrt werden.


Owner (§0.7): „hier muss dann aber auch Rechnung vom Zeitarbeitschef und Unternehmen
funktionieren, so dass es abrechenbar ist mit den Stundenzetteln." Der Kern existiert
(2.4) — J7 liefert, was fehlt:

- **Oberfläche beidseitig:** Zeitarbeitsfirma erzeugt aus freigegebenen Stundenzetteln
  die Rechnung (`getBillableTimesheets` → `generateFromTimesheets` → `issue`);
  Unternehmen sieht Eingang, Positionen je Kraft/Woche, Status. Kein neuer Service —
  die Routen unter `/invoices/operational/*` sind fertig und ungenutzt.
- **PDF für operative Rechnungen** (der Abo-Pfad hat es bereits; `invoicePdfService`
  wiederverwenden) und Zustellung als Benachrichtigung + Dokument im Tresor beider Orgs.
- **Satz-Einfrierung:** Beim Aktivieren der Vereinbarung wandert der Stundensatz aus dem
  `agreement_snapshot` unveränderlich an den Einsatz — heute ist
  `assignments.hourly_rate_cents` frei editierbar, die Rechnung würde einen später
  geänderten Satz abrechnen.
- **Eigener Nummernkreis je Zeitarbeitsfirma (Owner-Entscheid 2026-08-26):** Heute
  vergibt `invoice_number_seq` global `TC-<Jahr>-<Nr>`. Rechtlich stellt die
  Zeitarbeitsfirma die Rechnung — sie braucht einen eigenen, **lückenlosen** Kreis je
  `supplier_org_id` (§14 UStG: fortlaufend; Lücken erklären zu müssen ist ein
  Prüfungsrisiko des Kunden, nicht unseres — deshalb Vergabe erst beim `issue`, nie
  beim Entwurf).
- Aus J2 gebuchte Einsätze tragen den Satz aus dem Buchungs-Modal (Frage 3) — damit ist
  jede Marktplatz-Buchung ohne weiteren Schritt abrechenbar.

### Welle J8 — AÜG-Fristen, beidseitig planbar ✅ *(erledigt 2026-08-27)*

**Umgesetzt:** `auegFristService.js` — reiner Rechenkern (keine Uhr, keine DB;
`heute` kommt vom Aufrufer) mit den beiden Regeln, die üblicherweise falsch
gebaut werden: die Frist gilt **je Kraft je Entleiher** (nicht je Einsatz, und
parallele Einsätze zählen nicht doppelt), und **erst mehr als drei Monate**
Unterbrechung setzen die Uhr zurück. Das Fristende wird **kalendergenau**
gerechnet (`plusMonate`, monatsende- und schaltjahrsicher), nicht über einen
Tage-Mittelwert. Nicht angetretene Anfragen (`worker_declined`,
`worker_unavailable`, `expired`, `withdrawn`) zählen nicht mit — dort hat nie
jemand gearbeitet.

**Sichtbar auf beiden Seiten:** Unternehmens-Live-Belegschaft (Konto je Kraft,
eine Sammelabfrage für die ganze Tafel) und Agenturtafel (Konto beim **aktuell
belegenden** Kunden, eine Sammelabfrage je Kunde). **Rechnend im
Buchungsmodal:** `accept-deal` prüft die **geplante** Zeit mit — sonst käme die
Warnung immer zu spät — und liefert bei Überschreitung das **späteste
fristgerechte Enddatum** als Vorschlag. Warnstufen 15 / 17 / 18 Monate; „ok"
bleibt bewusst stumm (ein Abzeichen an jeder Zeile wäre nach zwei Tagen Tapete).

**Warnen, nie blockieren** (Owner-Entscheid): Die Buchung läuft weiter, die
Auskunft fährt in der Antwort mit. TempConnect ist nicht der Verleiher; beide
Texte benennen, wer die Pflicht trägt.

**Am echten Bestand gemessen (2026-08-27):** vier Kräfte über der Grenze — bei
einem Kunden **alle drei** seiner Kräfte, mit Fristende bereits im Juli 2026.
Der Wächter hat also sofort echte Fälle gefunden.

**Verifiziert:** 24/24 eigene Tests (jede Rechtsregel als eigener Fall inkl.
Monatsende-, Schaltjahr- und Genau-drei-Monate-Grenzfall, Anti-N+1-Nachweis,
DB-Parse), berührte Suiten 131/131, Browser-Smoke der drei Stufen.
Der **H1-Datenschutzwächter hat korrekt angeschlagen**, als das neue Feld die
Kundenansicht erreichte — `aueg` ist dort jetzt mit Begründung eingetragen
(es ist die Rechtslage des eigenen Einsatzes, kein Beschäftigtendatum).

**Offen:** Benachrichtigung an die Zeitarbeitsfirma bei Stufenwechsel (Dedupe je
Kraft/Kunde/Stufe) — der Rechenkern dafür steht, es fehlt der Cron-Anschluss.

**Ursprünglicher Plan:**

Owner: „gerne auch die AÜG-Fristen beachten und warnen, wenn mehr oder 18 Monate
knapp sind." Gemessen (2.4): nirgends modelliert — nur Dokument-Compliance und
Haftungsausschluss.

- **Die Regel (§ 1 Abs. 1b AÜG):** Höchstüberlassungsdauer 18 Monate **je Kraft je
  Einsatzunternehmen**, nicht je Einsatz. Unterbrechungen unter 3 Monaten zählen
  nicht als Neubeginn — die Rechnung muss über `worker_assignment_links` hinweg
  addieren (gleicher Mensch, gleiche Kunden-Org, Lücken < 3 Monate überbrücken).
- **Warnen, nicht blockieren:** TempConnect ist nicht der Verleiher (Disclaimer
  bleibt). Drei Stufen: Hinweis ab 15 Monaten kumulierter Dauer, Warnung ab 17,
  Alarm ab 18 — sichtbar auf beiden Live-Tafeln und als Benachrichtigung an die
  Zeitarbeitsfirma (sie trägt die Pflicht) mit Kopie-Hinweis an den Kunden ohne
  Personenbezug über das Nötige hinaus.
- **Mechanik:** set-basierte Prüfung im `staffing-maintenance`-Takt (dasselbe Muster
  wie Marktpräsenz/Reservierung), Meldungstyp mit Dedupe je (Kraft, Kunde, Stufe) —
  keine tägliche Wiederholung derselben Warnung.
- **Equal Pay (9 Monate)** ist eine ANDERE Frist mit Tarif-Ausnahmen — bewusst NICHT
  in J8 (Zuschlagslogik wäre Ratenberatung). Nur die Überlassungsdauer.

### Welle J10 — Schnellstart: zwei Fragen statt eines Formulars ✅ *(erledigt 2026-08-27)*

Owner-Auftrag: „vorgefertigte Anfragen wie ‚suchst du Personal' und mit Ja und
Nein beantworten lassen … vielleicht mit Notdienst-Button oder schneller
liefern als 48 Stunden." **Platzierung 1a** (Owner): überall beim Suchen.

**Umgesetzt:** `frontend/public/js/schnellstart.js` — **eine Datei**, die sich
auf drei Flächen selbst montiert (Muster `contextHints.js`): Marktplatz-Feed,
Personalsuche, „Verfügbare Kräfte". Ablauf: *Suchen Sie Personal?* → *Brauchen
Sie sie in unter 48 Stunden?* → drei Angaben (was, wo, ab wann, wie viele) →
Suche läuft. „Ja, dringend" schaltet den **Notdienst-Weg** (Hinweisfeld +
`availability_window=immediate` bzw. die „sofort"-Checkbox der Personalsuche).

**Zwei Übergabewege, je nach Fläche:** Der Feed bekommt die Antworten über die
**Adresse** — er liest sie beim Start ohnehin selbst aus (`readUrlFilters`), es
brauchte also keinen Eingriff in seine Filterlogik. Die anderen beiden Flächen
werden **direkt befüllt** und die Suche ausgelöst (kein Neuladen, kein
Flackern). Dieselben drei Angaben, die später das Buchungsmodal stellt (§0.2) —
wer sie hier tippt, tippt sie nirgends noch einmal.

**Verhalten:** Nur für Unternehmen (Agenturen bieten Personal an, sie suchen
keins) — wartet notfalls auf `tc:shell-context`. Einmal beantwortet oder
abgewiesen: `localStorage`-Merker, danach still, aber über einen kleinen
`↺ Schnellstart`-Knopf jederzeit wiederholbar. DE/EN im Modul selbst
(sprachneutrale Textausgabe über `TCi18n.locale()`). Datum aus der **Ortszeit**,
nie aus dem UTC-Schnitt (Befundklasse F1).

**Robust gegen Umbenennung:** Die Fläche wird über den Pfad **und** ein
eindeutiges Markup-Kennzeichen erkannt — hinter Proxy, Weiterleitung oder
Verzeichnis-Index stimmt `location.pathname` nicht immer, und ein lautlos
verschwindender Einstieg wäre nicht zu diagnostizieren. Beim Browser-Smoke ist
genau dieser Fall eingetreten und hat den Zweitweg erzwungen.

**Ein Zusammenhang, den eine Parallel-Erhebung zutage gefördert hat:** Die
„sofort"-Checkbox der Personalsuche setzt das Datumsfeld auf heute **und
deaktiviert es**. Die naheliegende Reihenfolge (erst Felder füllen, dann
Kennzeichen setzen) hätte das gerade eingetippte „ab wann" verworfen — der
Nutzer hätte geantwortet, und die Seite hätte es weggeworfen. Jetzt zuerst das
Kennzeichen, dann die Felder, und deaktivierte Felder bleiben unangetastet;
ein eigener Test hält die Reihenfolge fest.

**Verifiziert:** `schnellstart.test.js` 19/19 — Teil A prüft die Verdrahtung
gegen das **echte Markup** (Einbindung in allen drei Seiten, jeder Anker, jedes
befüllte Feld, und dass die Zielseite die übergebenen Parameter kennt), Teil B
fährt den Klickpfad in einer vm-Sandbox wirklich durch. **Mutationsprobe:**
Einbindung entfernt → rot, wiederhergestellt → grün. Browser-Smoke auf
„Verfügbare Kräfte" (zwei Fragen, Notdienst-Hinweis, Filter befüllt, Suche
ausgelöst, Merker, Rückweg, DE↔EN, Agentur sieht nichts) und Sandbox-Nachweis
des Feed-Wegs mit dessen echtem Markup. Wächter-Batterie 91/91.

### Welle J9 — Status-Vermerk des Zeitarbeitschefs (Owner 2026-08-26)

Owner: Der Chef soll je Kraft vermerken können, was ein Unternehmen bei der
Skill-Suche wissen muss — „wirklich verfügbar", „zuverlässig, sehr fleißig,
sauber", aber auch „seit einer Woche abwesend ohne Rückmeldung",
„krankgeschrieben bis…", „längerfristig einsetzbar" — und das soll in die
Angebote fahren, damit **alle drei Seiten planen** können (Monatsplanung der
Agentur, Einsatzplanung des Unternehmens, Selbstauskunft der Kraft).

**Die tragende Trennung (rechtlich zwingend):**

| Klasse | Beispiel | Weg in den Markt |
|---|---|---|
| **Verfügbarkeits-Fakt** | krankgeschrieben bis 12.09., Urlaub | Kommt aus `worker_absences` (existiert seit G1) — die Kraft **verschwindet** aus dem Markt und kehrt am Folgetag des Bis-Datums automatisch zurück. **DASS-nicht-WARUM** (Hauslinie G4b/H1): die Art erreicht den Markt nie. |
| **Positives Merkmal** | zuverlässig · sehr fleißig · arbeitet sauber · langfristig einsetzbar · kurzfristig startklar · flexibel bei Schichten | **Fester Katalog** (ankreuzbar, kein Freitext), gesetzt vom Chef, fährt in die Auto-Angebote, filterbar, zweisprachig. |
| **Interne Einschätzung** | „seit einer Woche abwesend ohne Rückmeldung" | **NUR_INTERN** (Dispo-Notiz der Agentur, Feld-Wächter erzwingt das). Geht NIE an fremde Unternehmen — ein Beschäftigten-Urteil an Dritte wäre DSGVO-/AGG-Risiko (Auskunftsrecht Art. 15). Markt-Folge: die Kraft wird schlicht **nicht angeboten** (Markt-aus-Schalter, J2c). |
| **Horizont** | „längerfristig einsetzbar" | Strukturiertes Feld `einsetzbar_bis` (NULL = unbefristet) → `availability_to` der Auto-Angebote. |

**Teil 1 ✅ *(2026-08-26, sofort gebaut — Defekt gegen „wirklich verfügbar")*:**
Die Automatik bot eine heute wirksam abwesende Kraft als verfügbar an. Jetzt
kennen alle Sweep-Anweisungen (global + Schalter-Pfad) die wirksame
Heute-Abwesenheit: Rücknahme nimmt Abwesende raus, Wiederkehr/Anlage lassen sie
draußen; nur `zustand='wirksam'` zählt (H1-Linie: beantragt ist unentschieden),
`ab.art` kommt im Markt-SQL nicht vor. Testverdrahtet inkl. echtem
Abwesenheits-Zyklus an der DB.

**Teil 2 ✅ *(2026-08-27, Owner-„Ja" zum Katalog)*:** Migration 201
(`markt_merkmale TEXT[]` mit dem Katalog als **DB-CHECK**, `einsetzbar_bis DATE`,
`dispo_notiz TEXT`), Katalog-Modul `workerMerkmalKatalog.js` (doppelte Ratsche:
Modul ↔ CHECK, testerzwungen), Route `POST /workers/:profileId/markt-profil`
(Zod, org-gebunden, auditiert — die Notiz selbst steht NICHT im Audit, nur dass
sie geändert wurde), Horizont-Spiegel `einsetzbar_bis → availability_to` der
Auto-Angebote (sofort beim Setzen + als vierter Sweep-Schritt; neue Angebote
entstehen gleich mit Horizont). Feed liest die Merkmale zur **Lesezeit** über
einen streng geschnittenen Join (Wächter: der Alias darf genau `id` +
`markt_merkmale` tragen — nicht mal ein Kommentar darf das Notiz-Spaltenwort
ausschreiben, der Wächter hat meinen eigenen erwischt) und filtert per
`merkmale=`-Parameter (unbekannter Schlüssel = 400, kein stilles Weniger-Filtern).
UI: „Markt-Profil"-Modal auf der Agenturtafel (Ankreuz-Katalog, Horizont,
Notiz mit „sieht NIE ein Unternehmen"-Beschriftung), Merkmal-Abzeichen in
„Verfügbare Kräfte" + Buchungsmodal, sechs Filter-Chips (sprachwechselfest).
Wächter-Register gepflegt (wachen 467/164, orgGrenzen 36 workers-Routen,
Schema-Snapshot). 44/44 J9-Suiten inkl. echtem Horizont-Zyklus an der DB,
Batterie 811/811.
**Offen (Platzierungsfrage an den Owner):** Selbstauskunft der Kraft im
Einsatzportal — auf welcher Portalseite?

---

## 5. Kontext aus dieser Session — was J erbt

Damit ohne Kontextverlust weitergearbeitet werden kann. Diese Dinge wurden **unmittelbar
vor** J gebaut und tragen J.

### 5.1 Der Anfrage-Mechanismus ist neu und trägt die Buchung

Migrationen 195 (Frist), 197 (Altbestand), 199 (Rückzug). Eine Zuweisung ohne Bestätigung
verfällt nach 72 Stunden, gedeckelt auf den Einsatzbeginn, mit Mindestfrist 4 Stunden. Beim
Verfall wird der Kunde benachrichtigt, der Kapazitätsposten zurückgegeben und die
Reservierung gelöst. Die Zeitarbeitsfirma kann zusätzlich aktiv zurückziehen.

**Für J heißt das:** Welle J2 muss den Buchungsweg *nicht* erfinden. Er existiert,
einschließlich Verfall, Kundenmeldung und Rückzug.

### 5.2 Zustandswerte sind bewacht

`api/test/statuswertSpiegel.test.js` (neu) hält fünf Regeln: keine unbekannten Statuswerte
in der Datenbank, jede Anzeigefläche kennt die Endzustände
(`worker_declined`, `worker_unavailable`, `expired`, `withdrawn`), keine Statusliste ohne
`is_active`, kein INSERT ohne `ON CONFLICT`.

**Für J heißt das:** Jeder neue Statuswert muss dort eingetragen werden, sonst wird die
Suite rot. Das ist Absicht.

### 5.3 `is_active = TRUE` ist der tragende Filter

Verfall und Rückzug setzen Status **und** `is_active` gemeinsam. Deshalb sind alle
Abfragen, die auf `is_active` filtern, automatisch korrekt — auch `BUSY_EXISTS_SQL`, das
den Bestätigungsstatus gar nicht prüft.

**Für J heißt das:** Die Reservierungslogik ist bereits richtig gekoppelt. Nicht anfassen.

### 5.4 Die Frist koppelt bereits an den Notdienst

`GREATEST(LEAST(NOW() + INTERVAL '72 hours', start::date::timestamptz), NOW() + INTERVAL '4 hours')`

Bei einem Einsatz in unter 48 Stunden greift zwangsläufig die Deckelung — die Frist ist dann
kürzer als 48 Stunden, ohne Sonderfall. An der Datenbank über alle 24 Tagesstunden geprüft:
Minimum 4,00 h, Maximum 24,00 h für einen Einsatz am Folgetag, kein Wert unter der
Mindestfrist.

**Für J heißt das:** Welle J4 braucht keine zweite Fristlogik, nur ein Kennzeichen.

### 5.5 Fallen, die diese Session gekostet haben

- **Backtick in Template-Literalen:** Ein `` ` `` in einem SQL- oder HTML-Kommentar
  *innerhalb* eines Template-Literals beendet die Zeichenkette. Zweimal passiert.
- **PowerShell zerstört Sonderzeichen:** `Get-Content`/`Set-Content` haben beim Umbenennen
  einer Migration Umlaute und Gedankenstriche doppelt kodiert. Dateien mit Sonderzeichen
  nur mit dem Write-Werkzeug anfassen.
- **Migrationsnummern kollidieren:** Parallele Sitzungen greifen dieselbe Nummer. Vor jeder
  neuen Migration den Ordner prüfen. **Nächste freie Nummer: 200.**
- **Zeitabhängige Tests:** Eine Prüfung „> 4 Stunden" für einen Einsatz am Folgetag
  scheitert abends, wenn die Mindestfrist greift. Fristprüfungen gegen einen Zeitraum
  prüfen, nicht gegen einen Punkt.
- **Der Datenbank glauben, nicht dem Code:** Drei echte Defekte dieser Session
  (HTTP 500 bei Doppelzuweisung, fehlende Kapazitätsposten, falscher Name in der Meldung)
  wurden erst sichtbar, als gegen die laufende Datenbank gemessen wurde.

---

## 6. Offene Owner-Entscheidungen

~~1. Leerer `vendor_pool`~~ ✅ entschieden: **offener Markt** (§0.1).
~~2. Preisanzeige~~ ✅ entschieden: **drei Fragen vor der Buchung, Preis mit
Vorschlägen, im Modal** (§0.2).
~~3. Notdienst-Aufschlag~~ ✅ entschieden: **keiner** — Notdienst ist das
Verkaufsargument (§0.3).

~~4. AÜG-Fristen~~ ✅ entschieden (Owner 2026-08-26): **Ja, beachten und warnen** —
wenn die 18 Monate überschritten sind **oder knapp werden**. → **Welle J8** (unten).
~~5. Rechnungs-Nummernkreis~~ ✅ entschieden (Owner 2026-08-26): **Ja, eigener
lückenloser Nummernkreis je Zeitarbeitsfirma** (`supplier_org_id`), bevor die erste
echte Rechnung das Haus verlässt. → fest in **Welle J7** verankert.

*Keine offenen Owner-Entscheidungen. Alle Wellen sind freigegeben.*

---

## 7. Was J **nicht** tut

- Kein Umbau der bestehenden Marktplatzseiten, solange die neue Sicht nicht steht
- Keine neue Angebotsart für firmenübergreifende Bündel (3.4)
- Keine zweite Fristlogik (5.4)
- Keine Verschiebung der Sperrliste ins Staff CC (3.6)
- Keine Aufweichung der Anonymität (3.1)
