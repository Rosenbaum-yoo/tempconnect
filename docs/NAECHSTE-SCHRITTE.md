# Nächste Schritte — Übergabe für einen neuen Chat

> **Stand:** 2026-08-07 · Branch `release/enterprise-premium-market-ready` · letzter Commit `67b0282`
> · **P8 abgeschlossen und committet** · **P9 geplant, noch nicht begonnen** — siehe Abschnitt 4
> · nicht gepusht
> **Zweck:** Einstiegspunkt. Diese Datei sagt, wo etwas steht und wo es weitergeht —
> sie wiederholt die Detailpläne **nicht**, sondern verweist auf sie.

---

## 1. Zuerst lesen (in dieser Reihenfolge)

| Datei | Wofür |
|---|---|
| `AGENTS.md`, `.agents/skills/tempconnect-project/SKILL.md`, `CLAUDE.md` | Pflicht vor dem ersten Edit |
| [features/P9_BOUNTY_MERKLISTE_ENTITLEMENTS.md](features/P9_BOUNTY_MERKLISTE_ENTITLEMENTS.md) | **Aktuelle Arbeit.** Spuren A/B/C mit Wellen und Gates — hier weitermachen |
| [features/P8_DEAL_VERBINDLICHKEIT.md](features/P8_DEAL_VERBINDLICHKEIT.md) | Abgeschlossen. Wellen A–E, Leitentscheidungen, Nachprüfung des Ursprungsauftrags |
| [features/URSPRUNGSPROMPT_AUDIT.md](features/URSPRUNGSPROMPT_AUDIT.md) | Punkt-für-Punkt-Stand des großen Ursprungsprompts |
| [features/P6_I18N_UEBERGABE.md](features/P6_I18N_UEBERGABE.md) | Zweisprachigkeit: Regeln für jede neue sichtbare Zeichenkette |
| [TWILIO-EINRICHTEN.md](TWILIO-EINRICHTEN.md) | SMS-Kanal: was der Owner tut, was im Code fehlt (~20 Zeilen) |

---

## 2. Arbeitsumgebung

- **Arbeitskopie:** `C:\Users\DennisStegemann\Desktop\12_tempconnect_docker(D)` — die
  OneDrive-Kopie ist nur Backup, dort niemals arbeiten.
- **Frontend sichtbar machen:** `docker restart tempconnect_frontend`
- **API neu laden:** `docker restart tempconnect_api` — braucht danach mehrere Minuten
  (kalter Windows-Bind-Mount). Mit `curl http://localhost:8080/api/health` prüfen.
- **Datenbank:** `docker exec -i tempconnect_db psql -U tempconnect -d tempconnect`
- **Migration einspielen:** `... psql ... -v ON_ERROR_STOP=1 -f - < sql/migrations/<datei>.sql`
- **E2E:** `npx playwright test --config e2e/playwright.config.js <spec>` (installiert)
- **Commit/Push:** nur nach ausdrücklicher Owner-Freigabe. Immer gezielt `git add <dateien>`,
  **nie** `git add -A` — im Baum liegen unversionierte Geschäftsdokumente
  (`docs/launch/`, UG-PDF, `docs/aktuellesitzung/`).

---

## 3. Die fünf Regeln, die in dieser Sitzung Geld gespart hätten

1. **Vollsuite vor jedem Commit:** `cd api && node scripts/run-tests.js` — **ohne Pipe**,
   sonst verschluckt die Shell den Exit-Code. Die i18n-Gates decken ~2 % ab; drei Wellen
   wurden gegen sie freigegeben und hinterließen 7 rote Tests.
2. **Zeitzonen nie über die Maschinenzeit herleiten.**
   `new Date(d.toLocaleString("en-US", {timeZone}))` misst die Zeitzone des *Rechners* —
   auf einem deutschen Gerät konstant 0, auf dem Server falsch. `Intl.formatToParts` nutzen.
3. **Neuer Cron-Endpunkt → `docs/SCHEDULER.md`**, sonst wird
   `api/test/schedulerConsistency.test.js` rot. 16 Endpunkte liefen nie, weil sie dort fehlten.
4. **Neue Doku → aus `docs/README.md` verlinken**, sonst wird `docsConsistency.test.js` rot.
5. **Seiten-JS, das in einer vm-Sandbox läuft, braucht die lokale i18n-Brücke**
   (Vorbild `js/pages/marketplaceFeed.js`) und einen Guard um `document.addEventListener`.

> **Bekannter Flake:** Erscheint im Volllauf
> `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING) … src\win\async.c:76`, ist der
> Lauf zu **wiederholen** — das ist ein libuv-Abbruch beim Prozessende unter Windows,
> kein fehlgeschlagener Test. Ein Lauf, der **ohne** diese Zeile rot ist, ist echt.

---

## 4. Wo es weitergeht

### Sofort: P10 — drei Spuren aus den Owner-Abschnitten 5–7

**Arbeitsanweisung: [features/P10_IMPORT_LIVE_ZEIT.md](features/P10_IMPORT_LIVE_ZEIT.md)** —
dort stehen Ist-Stand, Wellen und Gates. Ein neuer Chat liest diese Datei und dann P10, mehr nicht.

| Spur | Abschnitt | Kern | Beginnen mit |
|---|---|---|---|
| **D** | 5 | CSV-Import und Mitarbeiterverwaltung reparieren | **D1 — der Import sagt, was los ist** |
| **E** | 6 | Live-Belegschaft echt verfolgbar (Reiter je Zustand) | E1 — welche Zustände es überhaupt gibt |
| **F** | 7 | Systemzeit im Einsatzportal (falscher Tag markiert) | F1 — alle UTC-Schnitte finden |

**Warum D1 zuerst:** Der Import bricht heute mit dem nackten Wort „VALIDATION" ab, obwohl der
Server im Feld `details` genau sagt, welche Zeile und welche Spalte schuld sind
(`api/routes/workers.js:320`). Solange das nicht sichtbar ist, sucht jede weitere Welle blind.

**Fünf belegte Gründe, warum der Import scheitert** (alle am Code, nicht vermutet):
eine einzige schlechte Zeile verwirft alles (`z.array`), `email` ist Pflicht, `date_of_birth`
akzeptiert nur `JJJJ-MM-TT` (deutsche Exporte liefern `TT.MM.JJJJ`), `country` erlaubt drei
Zeichen („Deutschland" scheitert), und die Fehlerdetails werden nicht angezeigt.

**Spur F ist ein Wiedergänger:** derselbe UTC-Off-by-one, der in P9/A4 auf der **Rechnung**
gefunden wurde (Abrechnungszeitraum begann einen Tag zu früh). Werkzeug und Regel existieren
längst — `api/utils/dateDE.js` und die DACH-first-Direktive. Sie werden nur nicht überall benutzt.
Der Owner will das ausdrücklich auch auf die Folgeprojekte übertragen.

**Zwei Owner-Entscheidungen offen:** D-E1 (Import ohne E-Mail, wenn Personalnummer vorhanden?)
und E-E1 (welche Zustände die Live-Belegschaft führt — erst nach E1 beantwortbar).

---

### Erledigt: P9 — drei Spuren aus den Owner-Abschnitten 2–4 *(vollständig, 2026-08-11)*

**Alle drei Spuren abgeschlossen und committet:** A1–A5, B1–B3, C1–C3.
Kurzbilanz der Funde, die dabei ans Licht kamen — jeder einzelne war unsichtbar, weil eine
ausbleibende Wirkung keine Fehlermeldung erzeugt:

| Fund | Wirkung, wenn unentdeckt |
|---|---|
| Referral-Gutschrift ohne Sperrvermerk | ein geworbener Kunde hätte **6 Gutschriften statt einer** ausgelöst |
| Doppelte Abo-Zeilen (C2) | **27 Kunden zwei Rechnungen** für denselben Monat |
| Bounty-Rabatt erreichte keine Rechnung (A4) | Rabatt angezeigt, voller Betrag berechnet |
| Abgelehnte Bewertungen zählten weiter (A3) | Fälschungen erhöhten dauerhaft den Rabatt |
| Abrechnungszeitraum einen Tag zu früh (A4) | falsches Datum auf jedem Beleg |
| Merken-Knopf auf Bedarfen wirkungslos (B1) | eine ganze Marktseite konnte nichts merken |
| 5 von 17 Matrix-Zeilen zeigten auf Geister (C3) | jeder Test darauf prüfte Nicht-Existentes |

**Neue Wächter, die das künftig rot machen:** `docs/FLAECHEN.md` + `flaechenZuordnung.test.js`
(Modul in falscher Fläche), `bountyZeitfenster.test.js` (Text ↔ Schwelle ↔ Messung),
`benachrichtigungsSpiegel.test.js` (Server ↔ Oberfläche), `visibilityMatrix.test.js`
(Seiten-Existenz + leere Feature-Matrix), `invoices_rabatt_stimmig` +
`subscriptions_ein_aktives_je_nutzer_idx` (Datenbank-Invarianten).

Details: **[features/P9_BOUNTY_MERKLISTE_ENTITLEMENTS.md](features/P9_BOUNTY_MERKLISTE_ENTITLEMENTS.md)**

<details>
<summary>Ursprüngliche P9-Übersicht (Verlauf)</summary>

Vollständige Arbeitsanweisung mit Wellen und Gates:
**[features/P9_BOUNTY_MERKLISTE_ENTITLEMENTS.md](features/P9_BOUNTY_MERKLISTE_ENTITLEMENTS.md)**

| Spur | Abschnitt | Kern | Beginnen mit |
|---|---|---|---|
| **A** | 2 | Bounty-System wahrheitsfähig, zuschaltbar, voll verdrahtet | **A1 — Wahrheitsprüfung aller 15 Bedingungen** |
| **B** | 3 | ✅ **erledigt** — Merkliste beidseitig, Reiter bei „Meine Deals" | — |
| **C** | 4 | Freischaltung nach Zahlung, Feature-Gates plattformweit härten | C1 — den konkreten Preisrahmen-Fall klären |

Eine Spur nach der anderen, nicht parallel. **A1 zuerst** — jede spätere Welle baut sonst
auf einer Bedingung auf, die vielleicht nichts misst.

> **A1 ist erledigt** *(2026-08-08)*. Die Wahrheitstabelle über alle 15 Bedingungen steht in der
> P9-Datei. Kurzfassung von 15: **7** messen richtig, **3** messen den falschen Pfad, **2** behaupten
> ein Zeitfenster, das sie nicht prüfen, **2** hatten eine tote Quelle, **1** verlangte eine andere
> Zahl als beworben. `top_supplier` (5 % Rabatt) war für jeden Nutzer
> **rechnerisch unerreichbar** und ist jetzt abgeschaltet — nicht gelöscht. Beim zweiten toten
> Bounty hing mehr dran als ein Abzeichen: der Referral-Belohnungsschritt schrieb einen Status,
> den die Datenbank per CHECK verbietet, wodurch die Wiederholungssperre nie gesetzt wurde —
> **ein geworbener Kunde hätte bis zu 6 Gutschriften statt einer ausgelöst**. Der Pfad hängt live
> im Zahlungsfluss. Behoben, in eine Transaktion gefasst, mit Test abgesichert.

> **A2 ist erledigt** *(2026-08-08)*. Bounties lassen sich jetzt im **Staff Control Center →
> Rabatt-Katalog** schalten: an/aus, Kampagnenzeitraum, Rabattsatz — ein Klick, kein Deploy.
> Zwei Hebel mit bewusst verschiedener Wirkung: der **Not-Aus** beendet sofort alles und entzieht
> laufende Vergaben (Trigger in der Datenbank, greift auch bei Hand-SQL); der **Zeitraum** steuert
> nur, wann man ein Bounty verdienen kann — Verdientes bleibt. Vor dem Abschalten steht die Zahl
> der betroffenen Kunden im Dialog.
> Nebenbei drei Defekte gefunden: die Stufen-Berechnung zählte verwaiste Vergaben mit (hob die
> Rabatt-Obergrenze), der Storno-Dialog drohte mit einem abgeschalteten Rabatt, und mein eigener
> A1-Filter ließ verdiente Abzeichen kommentarlos verschwinden.
> **Wichtige Korrektur:** A2 wurde zuerst im OCC gebaut und auf Owner-Hinweis ins Staff Control
> Center umgezogen — plattformweite Kataloge sind Team-Verwaltung. Damit das nicht wiederkommt,
> gibt es jetzt `docs/FLAECHEN.md` (Zuständigkeiten + Entscheidungsfrage + Registry) und
> `api/test/flaechenZuordnung.test.js`, der jedes nicht eingetragene Modul rot macht.
> **Adversarische Gegenprüfung danach:** 20 Befunde, 12 haben die Widerlegung überstanden, alle
> geschlossen. Der schwerste war eine Folge des Triggers selbst: er entzieht die Vergabe, aber die
> daraus abgeleitete **Stufe** (= Rabatt-Obergrenze) blieb stehen, weil sie bis dahin immer
> beiläufig im selben Request neu berechnet wurde. Übertragbare Lehre in `SKILL.md`: wer einen
> Effekt an einen neuen Auslöser hängt, muss suchen, welcher *materialisierte abgeleitete*
> Zustand bisher nur deshalb stimmte, weil der alte Pfad ihn mitgenommen hat.

> **A3 ist erledigt** *(2026-08-09)*. Sieben Bounty-Texte sagen jetzt dasselbe wie ihre Messung:
> vier werden **gemessen** (6-Monats-Fenster bei Bewertungen, beide Deal-Kanäle bei „erfolgreichen
> Abschlüssen", echte Antwortzeit im Marktplatz-Kanal, Notdienst im lebenden Kanal), zwei wurden
> **umgeschrieben**, weil das Versprochene nachweislich nicht messbar ist. Das siebte hat der
> Wächter selbst gefunden, nachdem ich die bekannten fünf abgearbeitet hatte.
> **Drei Funde wiegen schwerer als die Zeitfenster:** eine als Fälschung **abgelehnte** Bewertung
> zählte weiter auf den Rabatt (der Bounty-Pfad kannte die Moderation nicht); das **Ignorieren**
> einer Anfrage verbesserte die eigene Antwortzeit; und der Wertbericht zählte „erfolgreiche
> Matches" anders als das Bounty. Alles behoben, alles mit Test.
> **Gemeldet, nicht behoben:** der Notdienst-Antwortpfad liefert produktiv 500, weil zwei Spalten
> abgefragt werden, die es nicht gibt — `OPEN_BLOCKERS.md`, P1-15.
> Nächste Welle: **A4** (Rabatt erreicht die Rechnung — monatlich, wie entschieden).

> **A4 ist erledigt** *(2026-08-09)*. Der schwerste Einzelbefund ist geschlossen: Die Rechnung
> weist den Treue-Rabatt jetzt **getrennt** aus (Brutto, Satz, Abzug, Quelle — Migration 170) und
> die monatliche Folgerechnung zieht ihn wirklich ab. Der Satz ist **eingefroren**: ein späterer
> Bounty-Verlust ändert keine gestellte Rechnung. Rückwärtsprobe erfüllt — ohne Bounty ist der
> Betrag identisch zu vorher.
> **Bewusst nicht** im Stripe-Checkout eingerechnet: der läuft im Abo-Modus mit festem Preis, ein
> Rabatt dort gälte für immer und widerspräche „monatlich neu bewertet". Begründung steht im Code
> und wird per Test gehalten; bei scharfem Stripe-Recurring ist ein Coupon je Rechnung der Weg.
> **Nebenbei gefunden:** jede Rechnung trug einen Abrechnungszeitraum, der **einen Tag zu früh**
> begann (der klassische UTC-Off-by-one, den die DACH-first-Regel benennt) — behoben. Und ein
> Datenbank-Trigger schützt jetzt die fremden Schreibpfade (operative Rechnungen, Korrekturläufe),
> die an der neuen Prüfregel gebrochen wären.
> Nächste Welle: **A5** (selbstlaufende Anstupser — per E-Mail erlaubt, A-E2).

> **Spur B ist erledigt** *(2026-08-09)*. Der Merken-Knopf ist ein **Schalter** (zeigt seinen
> Zustand, lässt sich zurücknehmen), es gibt eine **Merkliste** über beide Marktseiten
> (`GET /marketplace/watchlist`) und einen **Reiter** bei „Meine Deals" mit Zähler, Quicklink und
> Deep-Link je Eintrag. Geschlossene Einträge werden als *vergeben* / *abgelaufen* ausgewiesen,
> nicht ausgeblendet.
> **Zwei Defekte dabei gefunden:** Auf Bedarfs-Karten war der Knopf seit jeher wirkungslos — er
> schickte an den Kapazitäts-Endpunkt, bekam 404, und der Fehler wurde stumm verschluckt. Und die
> 10-Minuten-Entdopplung hätte den Schalter unbrauchbar gemacht: merken, entfernen, sofort erneut
> merken wäre verschluckt worden. Migration 172 macht „Merken" zu einem Zustand.
> **C2 ist erledigt** *(2026-08-09)*. **C-E1 entschieden: automatisch nach Zahlung**, ohne
> Staff-Freigabe; der Kill-Switch bleibt unberührt. Der Automatismus lief bereits — aber der
> **Zustand danach war falsch**: `activatePlan` fügte nur ein und ließ das bisherige Abo auf
> `active` stehen (341 Zeilen für 312 Nutzer). Sichtbar war nichts, weil überall die neueste
> Zeile gewinnt — **die monatliche Folgerechnung hätte 27 Kunden zwei Rechnungen für denselben
> Monat geschickt.** Behoben: Schließen und Anlegen in einer Transaktion, der Pilotpfad benutzt
> denselben Weg, Migration 173 bereinigt den Bestand und sichert „ein aktives Abo je Nutzer" mit
> einem eindeutigen Index. Gemessen: Rechnungslauf vorher 290 Zeilen/263 Nutzer → jetzt 263/263.
> **Offen bleibt nur noch C3** (plattformweite Härtung der Feature-Gates): keine Fläche sichtbar,
> die beim Klick 403 liefert; keine gesperrt, für die bezahlt wurde. Grundlage sind die
> vorhandene `visibilityMatrix` und `entitlementRouteGates.test.js`.

> **A5 ist erledigt** *(2026-08-09)* — damit ist **Spur A vollständig**. Drei Anlässe (kurz davor,
> verdient, entfallen) über den bestehenden Benachrichtigungspfad, mit täglichem Lauf
> `POST /api/internal/bounty-nudges` (in `docs/SCHEDULER.md` getaktet). Der eigene Lauf war nötig,
> weil „verdient" und „entfallen" sonst nur entstehen, wenn jemand ohnehin auf seine Bounty-Seite
> schaut. Höchstens **eine Mail pro Nutzer und Woche**; „kurz davor" geht nie per Mail.
> **Am echten Bestand zweimal ausgeführt:** beim ersten Mal zugestellt, beim zweiten nichts erneut.
> Der erste echte Lauf deckte zwei Fehler in meinem Entwurf auf, die alle Attrappen durchgelassen
> hatten: eine UUID-Spalte bekam einen Schlüssel (49 von 50 Nutzern mit Fehler), und ein
> Fehlschlag hätte die Wochensperre gesetzt, ohne dass etwas ankam. Beides behoben.
> Neuer Wächter `benachrichtigungsSpiegel.test.js`: ein Benachrichtigungstyp muss an **drei** Orten
> stimmen (DB-CHECK, Surface-Map, handgepflegte Kopie im Frontend) — das war bisher eine Bitte im
> Kommentar, jetzt ist es eine Zusicherung.
> **Offen in Spur A:** nichts. Als Nächstes **Spur B** (Merkliste) oder **Spur C2/C3**
> (Freischaltung nach Zahlung, plattformweite Härtung).
> Nächste Welle: **A3** (falsche Pfade und Zeitfenster) oder **A4** (Rabatt erreicht die Rechnung).

> **Der schwerste Einzelbefund aus der Bestandsaufnahme:** Der Bounty-Rabatt erreicht keine
> Rechnung. `getUserDiscount()` wird nur von Anzeige-Pfaden aufgerufen; im gesamten Geldpfad
> (`invoiceService`, `recurringBillingService`, `paymentService`, `planCatalog`) kommt
> `discount` nicht ein einziges Mal vor. Die Plattform zeigt „6 % Rabatt" und stellt die
> volle Summe in Rechnung. Das ist **P9 Spur A, Welle A4** — und es hängt an der offenen
> Owner-Frage A-E1 (jede Rechnung oder nur Jahresvertrag?).

**Owner-Entscheidungen:** A-E1 (Rabatt **monatlich**, auf jede Rechnung) und A-E2 (Anstupser
**auch per E-Mail**) sind beantwortet. Offen ist nur noch **C-E1** — automatische Freischaltung
nach Zahlung oder erst nach Freigabe im Staff-Center.

Die frühere Notiz „das Konto `elmiraaaa@…` existiert lokal nicht" war **falsch** und ist gestrichen:
die prüfende Abfrage lief gegen `org_members` statt `org_memberships`, brach ab, und die leere
Ausgabe wurde als Befund gelesen. Das Konto existiert (company/owner/INDIVIDUELL) und war die
Grundlage für C1.

</details>

### Erledigt: P8 Welle B *(2026-08-07, committet)*

`deal_success_rate` lebt. Migration 164 (`deal_reliability` + `offer_cancellations.from_status`),
`dealReliabilityService.js`, Cron `POST /api/internal/recompute-deal-reliability` (täglich 4:45)
plus ereignisgetriebener Nachlauf direkt nach dem Storno. Am echten Entwicklungsbestand
gemessen: vorher **0** gesetzte Werte, nachher 5 gerechnete Parteien und 2 Spiegelwerte.
Details und die drei Entscheidungen über den Wellenplan hinaus: P8, Abschnitt 5.

### Erledigt: P8 Welle C *(2026-08-07, committet)*

Zuverlässigkeits-Bounty als **Leiter**: `zuverlaessiger_partner` (90 Tage sauber, 3 %) wird
von `zero_complaint` (365 Tage sauber, 3 %) abgelöst — kein doppelter Rabatt für dieselbe
Tugend. Migration 165. Dabei hat sich `zero_complaint` als zweiter geerbter Defekt entpuppt:
es zählt `requests.status='CANCELED'` — den **falschen Storno-Kanal**. Der Agreement-Storno
(`cancelAgreement`) fasst `requests` nie an, also behält ein notorischer Kurzfrist-Stornierer
seine 3 % Rabatt für „null Stornos". Mitrepariert. Details in P8, Abschnitt 5.

### Erledigt: P8 Welle D *(2026-08-07, committet)*

Assistent mit 3 Schritten beim Abschluss, 2 beim Storno; die Folgen kommen aus zwei neuen
lesenden Endpunkten und sind **gerechnet, nicht getextet**. Dabei kam der dritte geerbte
Defekt heraus: Der Storno-Button war seit Welle A **tot** — er schickte Freitext `reason`,
die Route verlangt seither `reason_code` aus einem Enum → 400.

**Klickpfad nachgewiesen:** `e2e/tests/deal-commitment-wizard.spec.js` baut die Fixture über
die echte API auf und klickt sich durch — 13 Tests grün. Gate D ist damit verhaltensmäßig
belegt (ohne Grund kein zweiter Schritt, Abbruch ändert nichts am Zustand), und ein
Browser-Klick erzeugt nachweislich einen auswertbaren Storno samt sofortiger Neuberechnung.
Details in P8, Abschnitt 5.

### Erledigt: P8 Welle E *(2026-08-07, committet)*

Besetzbarkeits-Vorschau beim Überfahren einer Bedarfs-Karte. Nutzt die **bestehende**
Rechenmaschine `checkOfferCoverage` (Multi-Skill Welle 6) und verdichtet sie **anonym** —
Zahlen, Katalog-Rollen, Datumsangaben, keine Person. Gate E gehalten: 0 Abfragen beim
Rendern, Laden erst am `mouseenter`, jede Antwort gemerkt.

> **P8 ist komplett: alle fünf Wellen gebaut, alle Gates A–E nachgewiesen.**

### Fallstricke für künftige UI-Tests (teuer gelernt)

1. **Cookie-Banner zuerst wegklicken** (`#tc-cc-reject`, „Nur notwendige"). Er liegt mit
   `z-index: 2147483000` über allem; der Fehler sieht wie ein Klick-Timeout aus.
2. **Nie `waitForLoadState("networkidle")`** — die Seiten pollen Benachrichtigungen, der
   Zustand tritt nie ein. Auf das fachliche Ergebnis pollen.
3. **Sprache festnageln** (`tempconnect-lang`), bevor gegen Text geprüft wird.
4. **Deals über `accept-deal` aufbauen**, nicht über `POST /demand-requests/:id/offers` —
   letzteres erzeugt ein `draft`-Angebot, das keine Route auf `sent` heben kann.

### Wartet auf den Owner

| | |
|---|---|
| **Twilio** | Owner richtet den Account ein; danach ~20 Codezeilen an der markierten Stelle in `api/services/smsService.js` |
| **Landing-Bilder** | Owner liefert kurz vor Live; Prompts in `docs/mockups/LANDING_KI_BILD_PROMPTS.md` |
| **Bugfix-Liste** | Owner hat eine angekündigt — noch nicht übergeben |

### Bekannte offene Punkte

- `docs/releases/OPEN_BLOCKERS.md` — **vollständig abgeglichen am 2026-08-08**, Ergebnis steht
  oben in der Datei. 19 Punkte: 6 erledigt · 5 offen · 5 zurückgestuft · 3 owner-gated.
  Die Vermutung „führt Erledigtes als offen" war nur zur Hälfte richtig — von 7
  „erledigt"-Urteilen hielten nach adversarischer Gegenprüfung **nur 2**.
  **Drei Dinge, die du wissen solltest:**
  (a) **`.claude/` liegt im Release-Artefakt** — 8 Dateien sind versioniert, obwohl
  `.gitignore` sie listet (Ignore greift nicht rückwirkend). Deshalb ist `release-verify.sh`
  rot und der dokumentierte Release-Weg blockiert. Kein Leck (Inhalt geprüft), aber ein
  Blocker. (b) In der **Git-Historie liegt ein Web3Forms-Key**; das Repo ist öffentlich —
  nur Rotation beim Anbieter hilft. (c) `docker-compose.demo.yml` ist seit P0-08
  **startunfähig** (`NODE_ENV=production` + Bypass).
- **13 Tests laufen im Normallauf nicht** (`skipped`) — die DB-gebundenen, darunter
  Org-Boundary und Cross-Tenant-Isolation. Sie brauchen `DATABASE_URL`.
  „Übersprungen" ist nicht „grün".

---

## 5. Was in dieser Sitzung entstand (Commits auf `release/enterprise-premium-market-ready`)

| Commit | Inhalt |
|---|---|
| `f6a9dd8` | P6 Welle D: letzte 10 Seiten zweisprachig · eigene Fähigkeiten (Mig 160) · 5 echte Defekte (u. a. leerer CSRF-Token) |
| `6fd8eaa` | Verbindliche Aufnahme (nur ohne bisherigen Einsatz) · SMS-Provider-Entscheidungsschicht |
| `cf4ad10` | **16 interne Endpunkte ohne Cron-Plan** + Phantom-Endpunkt `run-search-jobs` |
| `dd30325` | „Angemeldet bleiben" · vier Audit-Punkte gemessen |
| `d19673d` | Zweiter Einladungsweg verdrahtet (Mig 161) |
| `3d0e195` | Vermittlungsrelevante Angaben (Mig 162) |
| `e44d893` | Twilio-Anleitung |
| `69f9a96` | E2E: Aufnahme-Riegel + Stundenzettel-Klickpfad |
| `ff88098` | P8-Wellenplan |
| `cfe9ff3` | **P8 Welle A**: Storno-Erfassung (Mig 163) |

Vollsuite zuletzt: **7927 Tests, 0 Fehler, 13 übersprungen** (2026-08-07, nach Welle B
inkl. der Fixes aus der Gegenprüfung).

## 6. Uncommitted im Baum (Stand 2026-08-07)

P8 Welle B ist vollständig, verifiziert und wartet auf Owner-Freigabe zum Commit:

| Datei | Art |
|---|---|
| `sql/migrations/164_deal_reliability.sql` | neu · **im Dev-Stand bereits eingespielt** |
| `api/services/dealReliabilityService.js` | neu |
| `api/test/dealReliability.test.js` | neu (46 Tests) |
| `api/test/integration/deal-reliability.flow.test.js` | neu (10 Tests, DB-gated) |
| `api/services/dealAgreementService.js` | `from_status` · Nachlauf nach dem Storno · **Join auf `demand_requests` (E1-Fix)** |
| `api/services/reputationService.js` | Vorrang für die neue Quelle · Label „Zuverlässigkeit" |
| `api/routes/internal.js` | Cron-Endpunkt |
| `api/test/capacityFeedRanking.test.js` | 2 Gate-B-Tests + `reputations`-Parameter im Mock |
| `api/test/{dealAgreement,welle7DealStaffingHardening,dealAgreementService.coverage}.test.js` | reine Fixture-Pflege: Mock-Matcher auf die neue Storno-Abfrage |
| `docs/SCHEDULER.md` | Takt + Crontab-Zeile |
| `frontend/public/js/pages/{marketplaceFeed,capacityExchangeDetail,vendorPool}.js` | Beschriftung DE/EN |
| `sql/migrations/165_reliability_bounty.sql` | neu (Welle C) · **im Dev-Stand eingespielt** |
| `api/services/bountyService.js` | `reliability_streak` · Ablösung katalog-gesteuert · Begründungstexte |
| `api/routes/bounties.js` | reicht die Begründungen durch |
| `api/test/bountyService.coverage.test.js` | 8 neue Tests · 2 alte ersetzt (kodierten den Defekt als Soll) |
| `frontend/public/bounties.html`, `js/pages/bounties.js` | Begründungs-Kachel |
| `api/services/dealCommitmentService.js` | neu (Welle D) — Vorschau-Aggregator |
| `api/test/dealCommitment.test.js` | neu (24 Tests) |
| `e2e/tests/deal-commitment-guards.spec.js` | neu — Server-Riegel der Vorschauen |
| `e2e/tests/deal-commitment-wizard.spec.js` | neu — Fixture + Klickpfad (13 Tests) |
| `api/routes/marketplace.js` | 2 lesende Vorschau-Endpunkte |
| `api/services/dealAgreementService.js` | zusätzlich: `berechneVorlaufStunden` versteht Date-Objekte |
| `frontend/public/offer_detail.html` | Assistent (3/2 Schritte), DE+EN, ersetzt den toten `window.prompt` |
| `api/services/capacityOfferMatchService.js` | Welle E: anonyme Verdichtung (`fasseDeckungAnonymZusammen`) |
| `api/routes/capacityExchange.js` | Welle E: `GET /demands/:id/coverage` (lesend, agency-only) |
| `api/test/capacityCoveragePreview.test.js` | neu (16 Tests) |
| `frontend/public/js/pages/marketplaceFeed.js`, `css/pages/marketplace-feed.css` | Hover-Vorschau, DE+EN |
| `docs/features/P8_DEAL_VERBINDLICHKEIT.md`, diese Datei | Doku |

> **Der wichtigste Fund der Welle steckt in `dealAgreementService.js`:** Der Fallback für den
> Einsatzbeginn zeigte auf `offer.assignment_start_date` — eine Spalte, die es auf `offers`
> gar nicht gibt. Dadurch blieb der Vorlauf bei **8 von 15** bestätigten Angeboten `NULL` und
> die 48-Stunden-Regel zündete dort nie. Der Defekt stammt aus Welle A und war bis zur
> adversarischen Gegenprüfung unsichtbar, weil die Vorlaufberechnung selbst korrekt und
> getestet war — nur ihr Eingabewert kam nie an. Details in P8, Abschnitt 5.

Getrennt davon liegen weiter die unversionierten Geschäftsdokumente
(`docs/launch/`, UG-PDF, `docs/aktuellesitzung/`) — deshalb beim Commit **immer**
gezielt `git add <dateien>`, nie `git add -A`.
