# Ursprungsprompt — Punkt-für-Punkt-Audit

> **Stand:** 2026-08-06 · Branch `release/enterprise-premium-market-ready`
> **Frage, die dieses Dokument beantwortet:** Ist aus dem Ursprungsprompt wirklich alles
> erledigt?
> **Methode:** Nicht „gibt es die Datei", sondern „macht sie, was da steht". Jeder Punkt
> trägt einen Dateibeleg. Was ich nicht selbst laufen sehen konnte, steht als
> **ungeprüft** — nicht als erfüllt.

| Zeichen | Bedeutung |
|---|---|
| ✅ | erfüllt, Beleg vorhanden |
| 🟡 | teilweise / Entscheidung offen / nicht live verifiziert |
| ❌ | fehlt |

---

## A — Einladungsverfahren nach Vertragsunterzeichnung

| # | Anforderung | Stand | Beleg |
|---|---|---|---|
| A1 | Chef lädt Mitarbeiter über TempConnect ein | ✅ | `POST /worker-invites` + `/bulk` + `/:id/resend` + `/:id/revoke` — `api/routes/workers.js:777` |
| A2 | Einladung per E-Mail | ✅ | Mailversand im Invite-Service |
| A2b | …oder WhatsApp / SMS | 🟡 | Entscheidungsschicht gebaut und getestet, Versand-Adapter offen — siehe unten |

### Nachgerüstet: zweiter Einladungskanal (Entscheidungsschicht)

`api/services/smsProviderService.js` spiegelt bewusst das vorhandene Muster aus
`emailProviderService.js` / `billingProviderService.js` (`resolve` / `describe`,
console-first). Damit ist der Kanal **ohne neue Abhängigkeit und ohne Vertrag** baubar,
testbar und vorführbar; der Anbieter ist später eine einzige Umgebungsvariable.

- Ohne Konfiguration: `console` — es geht **nichts** nach draußen. Ein stiller
  Fehlversand ist damit ausgeschlossen.
- `SMS_PROVIDER=twilio` **ohne** Zugangsdaten ist die teuerste Fehlkonfiguration: sieht
  richtig aus, versendet nichts. Genau die **warnt** jetzt, statt zu schweigen.
- `canSendInvite()` trennt „Anbieter aktiv" von „Mobilnummer vorhanden" — ohne Nummer ist
  der beste Anbieter wertlos, und diese Prüfung gehört an eine Stelle.
- WhatsApp ist nur dort als Fähigkeit gemeldet, wo es sie real gibt (Twilio).

**Ergänzt 2026-08-06 — die Zustellung ist jetzt verdrahtet.** Mig 161 gibt der Einladung
eine Mobilnummer (nullable, ohne Nummer bleibt es beim E-Mail-Weg) und einen Stempel
`sms_sent_at` — sonst ließe sich „nicht versucht“ nicht von „fehlgeschlagen“ unterscheiden.
Die 1-Klick-Einladung aus der Mitarbeiterliste gibt die Nummer aus dem Profil mit.

Die wichtigste Eigenschaft ist nicht, dass eine SMS rausgeht, sondern dass ihr Ausbleiben
**nichts kaputt macht**: Die SMS läuft nach der E-Mail, in eigenem `try`, und `sendSms`
wirft unter keinen Umständen. Eine Einladung, die scheitert, weil kein SMS-Anbieter
konfiguriert ist, wäre eine Verschlechterung gegenüber vorher.

**Was bewusst noch fehlt:** der Netzaufruf zum Anbieter. Ohne gewählten Anbieter wäre das
ungetesteter Code mit Kostenrisiko — der Adapter meldet stattdessen ehrlich
`reason: NO_ADAPTER`. Sobald du Twilio oder MessageBird sagst, kommt genau **ein** Fall
in `sendSms` dazu. `api/test/smsProvider.test.js` (11) + `smsInviteDelivery.test.js` (14).
| A3 | Link führt ins Einsatzportal | ✅ | `GET /auth/worker/invite/:token`, `POST /auth/worker/accept-invite` — `api/routes/auth.js:405` |
| A4 | Skills werden **bei der Registrierung** abgefragt | ✅ | siehe unten — war besser gebaut, als mein erster Durchgang erkannt hat |

### Richtigstellung: die Aufnahme fragt Fähigkeiten bereits ab

Mein erster Audit-Durchgang hat den Aufnahme-Weg zu eng geprüft. Er ist vollständig:

1. `worker-login.html` leitet nach Annahme der Einladung bewusst **ins Profil**, nicht
   aufs Dashboard — mit `?willkommen=1` („Wer gerade erst eingeladen wurde, hat ein
   leeres Profil. Das Dashboard zeigt ihm leere Listen und keinen Weg nach vorn.").
2. `GET /worker/me/onboarding` (`api/services/workerOnboardingService.js`) ist die **eine**
   Wahrheit über den Fortschritt — bewusst im Backend, damit Assistent, Dashboard und
   Disposition nicht drei verschiedene Antworten geben.
3. Vier Schritte, **Fähigkeiten ist Pflicht**: Person → Fähigkeiten → Verfügbarkeit →
   Nachweise (letztere bewusst optional, weil die nötigen Papiere je Branche variieren).
4. Offene Schritte sind **Sprungziele** (`href="#skills"`) — „ein Hinweis, der nicht
   hinführt, ist eine Sackgasse".

**Seit 2026-08-06 ist die Aufnahme verbindlich** (Owner-Freigabe). Wer die
Pflichtschritte nicht abgeschlossen hat, landet beim Öffnen einer Portalseite auf dem
Profil (`?willkommen=1&aufnahme=1`, mit Erklärung statt kommentarloser Umleitung).

**Die Ausnahme ist der wichtigere Teil.** Gesperrt wird ausschließlich, wer **noch nie
einen Einsatz hatte** (`zugang_beschraenkt` im Backend). Denn wer bereits gearbeitet
hat, muss seinen **Stundenzettel einreichen können — auch mit halbem Profil**. Eine
Sperre würde ihn nicht von einem Angebot abschneiden, sondern von einer Pflicht, an der
sein Geld hängt. Ebenfalls immer offen: das Profil selbst (sonst gäbe es keinen Weg aus
der Sperre) und Kontakt & Hilfe (wer nicht weiterkommt, muss fragen können). Schlägt der
Abruf fehl, wird **niemand** ausgesperrt.

Die Regel steht im Backend, nicht in der Seite — sonst gäbe es wieder mehrere Antworten
auf dieselbe Frage. Durchgesetzt wird sie zentral in `portalShell.initShell()`.
`api/test/workerOnboardingGate.test.js` (7 Tests) sichert vor allem die Ausnahme.
| A6 | Skills plattformweit verwendbar | ✅ | Katalog → Angebotsgenerator → Marktplatz/Suche (siehe C) |

**Offen:** A2b — zweiter Einladungskanal. Für Zeitarbeit relevant: Gewerbliche
Arbeitskräfte lesen häufiger WhatsApp als E-Mail. Ohne zweiten Kanal verlierst du
Registrierungen genau bei der Zielgruppe, die den Marktplatz füllt.

---

## B — Formular & Skill-Erfassung im Einsatzportal

| # | Anforderung | Stand | Beleg |
|---|---|---|---|
| B7 | Formular nimmt die **vermittlungsrelevanten** Daten auf | ✅ | **Nachgerüstet 2026-08-06** (Mig 162), siehe unten |
| B8 | Fähigkeiten per Checkbox | ✅ | `renderSkillCatalog()` → `<input type="checkbox">` je Skill |
| B9 | Kategorie-Katalog (z. B. Pflege → Pflege-Skills) | ✅ | `GET /skills/catalog`, `api/services/skillCatalogService.js`; UI als aufklappbare `<details>` je Kategorie |
| B10 | Skills **manuell** eingeben / erweitern / ändern | ✅ | **Nachgerüstet 2026-08-06**, siehe unten |

### Nachgerüstet: eigene Fähigkeiten (Mig 160)

Bis 2026-08-06 konnten Arbeiter ausschließlich Katalog-Skills ankreuzen, und die
Oberfläche sendete stumm `proficiency: 'intermediate'` — ein Spezialist sah damit aus
wie jemand mit Grundkenntnissen, obwohl das Backend die vier Stufen seit Mig 145 kennt.

**Warum kein einfaches Freitextfeld in den Katalog:** `platform_skills` ist die
gemeinsame Matching-Achse. Dürfte jeder Arbeiter Zeilen anlegen, zerfiele
„Gabelstaplerfahrer" binnen Wochen in vier Schreibweisen — und ein Unternehmen, das nach
einer davon sucht, fände drei Viertel der passenden Arbeiter **nicht** mehr. Der Katalog
würde die Suche zerstören, die er ermöglichen soll.

**Gebaut wurde deshalb: erst suchen, dann anlegen.**

| Eingabe | Ergebnis |
|---|---|
| „Krankenschwester" | → **Gesundheits- und Krankenpflege** (Alias-Treffer, sofort auffindbar) |
| „ITS" | → **Intensivpflege** (Alias-Treffer) |
| „altenPFLEGE" | → **Altenpflege** (Namenstreffer, Groß-/Kleinschreibung egal) |
| „Hubarbeitsbühne" | → neuer Vorschlag `status='proposed'`, wartet auf Kuratierung |

Die ersten drei Zeilen sind **an echten Katalogdaten verifiziert**, nicht konstruiert.

Ein Vorschlag gehört dem Arbeiter, ist für seine Agentur sichtbar und trägt am Profil
das Kennzeichen „in Prüfung" — er erscheint aber **weder** im Auswahlkatalog der anderen
**noch** erzeugt er automatische Marktplatz-Angebote (`loadWorkerSkills` filtert auf
`status='approved'`). Sonst stünde im Marktplatz eine Fähigkeit, nach der niemand suchen
kann, und die Angebotszahl wäre aufgebläht statt echt.

Dazu die Niveau-Auswahl (Grundkenntnisse / Geübt / Erfahren / Spezialist) in einer
Liste „Ihre Fähigkeiten" — dort finden sich auch selbst eingetragene Fähigkeiten wieder,
die in keiner Katalog-Kategorie stehen.

**Dateien:** `sql/migrations/160_worker_proposed_skills.sql`,
`api/services/skillCatalogService.js` (`proposeSkill`), `api/routes/skills.js`
(`POST /skills/propose`), `api/services/capacityOfferGeneratorService.js`,
`api/services/workerService.js`, `frontend/public/einsatzportal-profil.html`,
`api/test/skillPropose.test.js` (10 Tests).

### Nachgerüstet: Einsatzfähigkeit (Mig 162)

Owner-Entscheidung 2026-08-06 — alle vier Felder, Alter als Ja/Nein, keine Lohndaten,
alles optional.

| Feld | Warum es eine Vermittlungsentscheidung ändert |
|---|---|
| **Über 18 (Ja/Nein)** | Jugendarbeitsschutz: keine Nachtarbeit, keine Gefahrstoffe, begrenzte Stunden. **Kein Geburtsdatum** — für die Vermittlung zählt genau diese eine Schwelle, das exakte Datum beantwortet keine weitere Frage. `NULL` heißt „nicht beantwortet", nicht „minderjährig": eine unbeantwortete Frage darf niemanden ausschließen. |
| **Schichtbereitschaft** | Früh / Spät / Nacht / Wochenende / Feiertag. Ohne sie schlägt das Matching Einsätze vor, die die Kraft gar nicht annehmen kann — der teuerste Fehlvorschlag, weil er beide Seiten Zeit kostet. |
| **Führerschein + Fahrzeug** | 17 Klassen inkl. Stapler- und Kranschein. Entscheidet bei Logistik, Fahrdienst und Bau direkt über die Vermittelbarkeit. |
| **Notfallkontakt** | Arbeitsschutz: Bei einem Unfall auf fremdem Werksgelände weiß sonst niemand, wen man anruft. Sichtbar nur für die eigene Zeitarbeitsfirma. |

**Geschlossene Mengen statt Freitext.** „CE", „C/E" und „Lkw" meinen dasselbe — als
Freitext würden sie das Matching in Schreibvarianten zerlegen, derselbe Grund, aus dem
der Skill-Katalog kuratiert ist. Beide Spalten tragen einen GIN-Index, damit „wer hat
CE?" und „wer kann Nachtschicht?" Abfragen sind und keine Textsuche.

**Die Arbeitserlaubnis bekam bewusst keine eigene Spalte.** Sie läuft über die vorhandene
Nachweis-Verwaltung (Kategorie `permit`) — dort hat sie bereits Gültigkeitsdatum,
Ablauf-Erinnerung und Prüfstatus. Eine zweite Wahrheit daneben wäre genau der Fehler, den
dieses Projekt sonst vermeidet.

**Keine Lohndaten.** IBAN, Sozialversicherungsnummer und Steuer-ID bleiben draußen und
sind **per Test festgeschrieben** — der Punkt, den ein späterer Ausbau am leichtesten
aufweicht („das eine Feld noch"). Sie verbessern die Vermittlung um null und machen ein
Datenleck meldepflichtig.

**Als fünfter Aufnahme-Schritt sichtbar, aber nicht blockierend.** Er zählt in den
Fortschritt und ist Sprungziel. Der **Führerschein zählt bewusst nicht** in die
Erledigung: Eine Lagerkraft ohne Fahrerlaubnis wäre sonst dauerhaft „unvollständig",
obwohl ihr nichts fehlt — und ein Hinweis, der bei der Hälfte der Leute falsch ist, wird
ignoriert und entwertet alle anderen.

**Dateien:** `sql/migrations/162_worker_placement_facts.sql`,
`api/routes/workerPortal.js`, `api/services/workerService.js`,
`api/services/workerOnboardingService.js`, `frontend/public/einsatzportal-profil.html`,
`api/test/workerPlacementFacts.test.js` (15 Tests).

**B7 im Detail — vorhanden:** Vor-/Nachname, E-Mail, Personalnummer, Telefon, Straße,
PLZ, Ort, verfügbar ab, Wochenstunden, Einsatzradius, Profilfoto, Dokumente/Zertifikate
inkl. Aussteller und Gültigkeitszeitraum.

**B7 — nicht erfasst:** Geburtsdatum, Staatsangehörigkeit, Sozialversicherungsnummer,
Steuer-ID, Bankverbindung, Führerscheinklassen, Notfallkontakt, Arbeitserlaubnis.

> **Das ist eine Entscheidung, kein Bug.** Der Prompt sagt „alles Wichtige, das soll
> lange dauern". Dagegen steht Datenminimierung (DSGVO Art. 5): Lohndaten wie IBAN und
> SV-Nummer gehören üblicherweise ins Lohnsystem der Zeitarbeitsfirma, nicht in eine
> Vermittlungsplattform — sie erhöhen deine Haftung, ohne die Vermittlung zu verbessern.
> **Empfehlung:** Vermittlungsrelevantes aufnehmen (Führerscheinklassen, Arbeitserlaubnis,
> Schichtbereitschaft, Notfallkontakt), Abrechnungsdaten bewusst draußen lassen.
> Owner-Entscheidung nötig.

**B10** ist die härtere Lücke: Ein Katalog kann nie vollständig sein. Ohne Freitext geht
genau das Wissen verloren, das einen Arbeiter unterscheidbar macht — und das ist der
Rohstoff des Multi-Skill-USP.

**Nebenbefund:** Trotz P6-Migration stehen in `einsatzportal-profil.html` noch harte
deutsche Strings im JS (`' gewählt'`, `'Speichern…'`, `'Bitte Auswahl prüfen.'`,
`'Speichern fehlgeschlagen.'`). Die i18n-Gates prüfen Marker und Parität, nicht
vergessene Literale.

---

## C — Multi-Skill-Angebotsmanagement (USP)

**Vollständig gebaut, und zwar gut.** `api/services/capacityOfferGeneratorService.js`

| # | Anforderung | Stand | Beleg |
|---|---|---|---|
| C11 | Je Skill ein Angebot pro Arbeiter | ✅ | `buildSingleSkillOfferData()` |
| C12 | Zusätzlich ein Gesamt-Skill-Angebot (N+1) | ✅ | `buildBundleOfferData()` |
| C13 | Premium-Versionen | ✅ | `PREMIUM_BOOST_LEVEL`, `premium: boolean` im Schema |
| C15 | Kein zweites Angebot für denselben Skill | ✅ | **DB-Unique-Index** `capacity_posts_single_skill_unique_idx` — atomar erzwungen, nicht nur App-Logik; Duplikat wird als `already_exists` übersprungen |
| C16 | Viele Arbeiter mit gleichem Skill gebündelt | ✅ | `POST /capacity-exchange/pool/generate` — bis 500 Arbeiter × 20 Skills |
| C18 | Pauschales Helfer-Sammelangebot | ✅ | dieselbe Route ohne Skill-Filterung |
| C19 | Keine eigene Kachel, bestehende Bereiche erweitert | ✅ | integriert in `capacity_exchange` |

Der Generator nutzt `todayDE()` (DACH-Zeit) und erzeugt als `draft` — die Aktivierung
bleibt der plan-gated Sichtbarkeitshebel. Sauber gedacht.

---

## D — Angebotsformulare

| # | Anforderung | Stand | Beleg |
|---|---|---|---|
| D21 | Standard / Notdienst / Premium-Standard / Premium-Notdienst | ✅ | `priority_level: normal\|notdienst` × `premium: boolean` |
| D22 | Vorschläge wie eine Suchleiste | ✅ | `buildOfferSuggestions()`, `buildPoolSuggestion()` |
| D23 | Anzahl, Reservierung, Konflikt bei bereits zugewiesen | ✅ | `api/services/workerOfferReservationService.js` |

---

## E — Unternehmensseite

| # | Anforderung | Stand | Beleg |
|---|---|---|---|
| E24 | Arbeitsplatzangebote mit 1+ Mitarbeitern / 1+ Skills | ✅ | Requisitions |
| E25 | Zeitarbeitsfirma bucht bei Zeitarbeitsfirma (Trust Center) | ✅ | `is_inter_agency` im Feed, **plan-gesteuert** über `planCatalog.js`/`planFeatures.js`, einstellbar via `settings.js`/`orgControlCenter.js`, getestet (`pilotModel`, `capacityFeedRanking`) |

---

## F — Bilder & Leben

| # | Anforderung | Stand | Beleg |
|---|---|---|---|
| F26 | Landing: KI-Bilder + Video | ❌ | Drop-in gebaut, Bilddateien fehlen — **Owner-Aufgabe** (P7c) |
| F27 | Upload-Bereiche frei von KI-Bildern | ✅ | Profilfoto (Einsatzportal), Firmenfoto, Angebotsfoto |
| F28 | Landing-Layout links/rechts, Preview zuerst | ⛔ | blockiert durch F26 — ein Wechsel-Layout ohne die Bilder ist nicht bewertbar. Owner-Aufgabe zuerst. |

---

## G — Ersatz, Zeit, Stundenzettel

| # | Anforderung | Stand | Beleg |
|---|---|---|---|
| G29 | Krankmeldung → Ersatz zuweisen, voll verdrahtet | ✅ | `api/services/assignmentStaffingService.js` |
| G30 | DACH-Zeit statt UTC (Datum war ein Tag zu weit) | ✅ | `api/utils/dateDE.js` → `todayDE()`, plattformweit |
| G31 | Frist für Einreichung | ✅ | `submission_deadline` |
| G31b | Eingereichte nicht mehr änderbar (nur nach Ablehnung) | ✅ | `EDITABLE = ['draft','needs_correction']` |
| G32/33 | Nach Auftragsende zurück in Live-Belegschaft & Marktplatz | ✅ | Code korrekt — **aber der Auslöser fehlte**, siehe unten |

### Gemessen 2026-08-06: der Code war richtig, gerufen hat ihn niemand

Die Logik ist besser gebaut, als der Prompt verlangt hat — **ohne Cron und damit ohne
Drift**:

- **Verfügbarkeit** wird beim Lesen hergeleitet (`workerAvailabilityService`): aus
  `worker_assignment_links.end_date` ergibt sich „verfügbar ab dem Tag danach"; liegt das
  Ende in der Vergangenheit, ist die Kraft heute frei. Ein Einsatz **ohne** Enddatum
  liefert ehrlich „unbekannt" statt einer Schätzung — „ein falsches ‚ab morgen' erzeugt
  Angebote, die die Agentur nicht halten kann".
- **Marktplatz-Sichtbarkeit** über `workerOfferReservationService`: Angebote eingesetzter
  Kräfte werden pausiert (`worker_reserved=TRUE`) und **am Tag nach `end_date`
  automatisch reaktiviert**. Set-basiert, idempotent, Europe/Berlin.

**Der Defekt lag daneben, nicht darin.** Dieser Sweep hängt an
`POST /api/internal/staffing-maintenance` — und dieser Endpunkt stand **in keinem
Cron-Plan**. Im Betrieb wäre also nie ein Angebot wieder freigegeben worden: Die Kraft
verschwindet bei Zuweisung aus dem Marktplatz und taucht **nie wieder auf**.

Der Abgleich Code ↔ Plan ergab **16 von 25 internen Endpunkten ohne Eintrag**, darunter
die Notdienst-Eskalation und der DSGVO-Aufbewahrungslauf. In die Gegenrichtung taktete
der Plan `run-search-jobs` — **einen Endpunkt, den es im Code nie gab**; ein Cron darauf
lief seit jeher ins Leere.

Beides behoben in `docs/SCHEDULER.md`. Damit es nicht wiederkommt, wacht jetzt
`api/test/schedulerConsistency.test.js` darüber: Jeder `/internal/*`-Endpunkt muss
entweder getaktet **oder** mit Begründung ausgenommen sein — und der Plan darf keine
Endpunkte erfinden. **Diese Lücke lag zwischen Code und Betrieb, nicht im Code — deshalb
war die gesamte Suite dabei grün.**
| G34 | Monatsplanung vorausplanen | ✅ | `api/routes/workers.js` |
| G35 | Downloadbare Planungs-PDFs | ✅ | `api/services/workforceSchedulePdfService.js` |

---

## H — Live-Überwachung & Beschwerden

| # | Anforderung | Stand | Beleg |
|---|---|---|---|
| H36 | Unternehmen verfolgt live, wer arbeitet | ✅ | `GET /company/live-workforce` |
| H37 | Beschwerde melden, Ersatz anfordern | ✅ | `GET/POST /company/complaints`, `companyComplaintService.js` |
| H38 | Sperrliste, Chef kann nicht mehr zuweisen + Benachrichtigung | ✅ | `companyBlocklistService.js`, `test/workerBlockNotification.test.js` |
| H39 | Unternehmen entscheidet: nie / in 3 Monaten / wieder | ✅ | Blocklist mit Ablauf |

---

## I — Matching & Activity

| # | Anforderung | Stand | Beleg |
|---|---|---|---|
| I40 | Bidirektionales Sofort-Matching + Benachrichtigungen | ✅ | `api/services/matchTriggerService.js`, Mig 151 |
| I41 | Activity Center voll verdrahtet | ✅ | `activityFeedService.js`, `GET /activity-feed` |

---

## J — Einsatzportal

| # | Anforderung | Stand | Beleg |
|---|---|---|---|
| J42 | Bugs fixen | 🟡 | **2 heute gefunden und behoben** (siehe unten); weitere nicht ausgeschlossen |
| J45 | Unternehmen nimmt Stundenzettel entgegen | ✅ | `GET /company/submissions`, `POST /:id/confirm` |
| J46 | Live-Belegschaft zur Einsatzüberwachung | ✅ | siehe H36 |

**Heute behoben in `einsatzportal-stundenzettel.html`:**
1. `closeEditor()` füllte die Detailansicht, **schaltete aber nie auf sie um** und kehrte
   vorher zurück → „← Zurück" ließ den Nutzer im geleerten Editor stehen.
2. Kartenklick führte auf eine Status-Zwischenansicht statt ins Ausfüllen. Jetzt: bei
   `draft`/`needs_correction` direkt in den Editor.
3. Karten waren `<div>` mit `onclick` — jetzt `role="button"`, `tabindex`, Enter/Leertaste,
   sichtbarer Fokusring.

---

## K — Session & Sicherheit

| # | Anforderung | Stand | Beleg |
|---|---|---|---|
| K47 | Ausloggen beim Fenster-Schließen? Mehrere Tabs? Härtung | ✅ | gemessen und ergänzt — siehe unten |

### Gemessen 2026-08-06: Session — die Antwort auf beide Fragen

**Mehrere Tabs:** funktionieren, bauartbedingt. Die Sitzung hängt am Cookie, nicht am Tab.

**Fenster schließen = ausloggen:** war **nicht** der Fall — und sollte es als Grundregel
auch nicht sein. Ein versehentlich geschlossener Tab darf einen Disponenten nicht mitten
in der Disposition hinauswerfen.

Bereits vorhanden war eine ungewöhnlich saubere Härtung (P5.1, Owner-Entscheidung
2026-08-01): Leerlauf-Frist 8 Stunden (rollend), **absolutes Höchstalter 7 Tage**
(`enforceAbsoluteLifetime` — `express-session` kann das nicht), Session-Rotation bei
jedem Login gegen Fixation, getrennte Cookie-Pfade für Plattform und Staff,
Staff-Sitzung 4 Stunden, Fernabmeldung aller Geräte.

**Ergänzt:** Genau ein Ort widerspricht der Grundregel — der **geteilte Rechner**.
Lagerbüro, Pförtnerloge, Werkstatt-PC sind bei gewerblichen Einsatzkräften die Regel.
Bleibt dort eine Sitzung acht Stunden offen, sieht der Nächste fremde Stundenzettel.
Deshalb entscheidet jetzt der Anmeldende: Ohne „Auf diesem Gerät angemeldet bleiben"
bekommt das Cookie keine Ablaufzeit und stirbt mit dem Fenster. Im Worker-Portal ist die
Wahl sichtbar und **bewusst nicht vorangekreuzt**.

Die Wahl kann die serverseitigen Fristen nur **verkürzen, nie verlängern** — sonst wäre
sie ein Weg, die Sicherheitsentscheidung auszuhebeln. Ohne Angabe bleibt es beim
Bestandsverhalten, damit das Update niemanden überraschend abmeldet.
`api/test/sessionDeviceBinding.test.js` (8 Tests).

---

## L — CSV-Import

| # | Anforderung | Stand | Beleg |
|---|---|---|---|
| L48 | CSV-Import geprüft und perfektioniert | ✅ | 4-Schritt-Assistent: Upload → Mapping → Validierung → Import |
| L49 | E-Mail automatisch in die Einladung vorbefüllt | ✅ | `inviteFromRow()` — 1-Klick-Einladung aus der Mitarbeiterliste; Bulk dedupliziert über `listInvitableWorkers` + `ON CONFLICT DO NOTHING` auf dem partiellen Unique-Index aus Mig 159 (race-sicher bei parallelen Klicks) |
| L50 | „Alle einladen" für noch nicht Registrierte, ohne Kollision | ✅ | `mit.list.inviteAll` — „Alle noch nicht registrierten Mitarbeiter einladen" |

---

## M — Zuletzt genannte Punkte

| # | Anforderung | Stand |
|---|---|---|
| M51 | Umschalter Deutsch / Englisch | ✅ P6 abgeschlossen, jede Seite mit `i18n.js` hat ein Wörterbuch |
| M52 | Stundenzettel im Einsatzportal bearbeitbar | ✅ heute behoben |
| M53 | Wochenkarte anklickbar → führt ins Ausfüllen | ✅ heute behoben |

---

## Bilanz

**36 erfüllt · 5 ungeprüft (brauchen E2E) · 1 offen (Owner) · 1 blockiert**
*(Stand nach der Nachrüstung vom 2026-08-06.)*

**Die verbleibenden Lücken:**
1. **A2b** — kein zweiter Einladungskanal (WhatsApp/SMS). Trifft die Registrierungsquote
   genau bei gewerblichen Arbeitskräften. Nach der Config-Taxonomie des Projekts wäre
   das ein Tier-1-Provider (`SMS_PROVIDER`, console-first) — ohne externen Vertrag baubar.
2. **F26** — Landing-Bilder. Owner-Aufgabe, kein Code offen.

**Geschlossen am 2026-08-06:** B10 (eigene Fähigkeiten + Niveau, Mig 160).

**Ebenfalls behoben (i18n-Reste auf derselben Seite):** `einsatzportal-profil.html`
trug trotz P6-Migration noch harte deutsche Literale im JS. Dabei kam heraus, dass
`ep.profil.skillsCountFmt`, `ep.profil.saving` und `ep.profil.saveFailed` **längst
existierten**, der Code sie aber nicht benutzte — und dass ich beim Nachrüsten selbst
Duplikate angelegt hatte. Beides bereinigt: vorhandene Schlüssel werden wiederverwendet
statt verdoppelt.

**Die Wahrheit über die 🟡:** Das sind keine bekannten Defekte, sondern **ungemessene
Stellen**. Die beiden heute gefundenen Einsatzportal-Bugs waren vor der Messung ebenfalls
„grün" — gebaut, verdrahtet, getestet, und trotzdem kam man nicht ins Ausfüllen. Für
9 Punkte gilt derselbe Vorbehalt.

### E2E ist seit 2026-08-06 lauffähig — und hat sofort geliefert

Owner-Freigabe erteilt, Playwright installiert.
`e2e/tests/einsatzportal-aufnahme-gate.spec.js` (7 Tests, alle grün) beweist im **echten
Browser**, was Unit-Tests grundsätzlich nicht können:

- Der Aufnahme-Riegel greift (Umleitung aufs Profil mit `aufnahme=1`) — **und** Profil
  und Kontakt bleiben erreichbar.
- Die Wochenkarte öffnet bei einem Entwurf **direkt den Editor** statt einer
  Zwischenansicht — genau der gemeldete Befund „es lassen sich keine Stundenzettel
  bearbeiten".
- „← Zurück" führt wirklich zurück und nicht in den geleerten Editor.

**Zwei Test-Entwurfsfehler dabei gefunden — an der eigenen Suite:**

1. Die Klickpfad-Fixture legte dem Riegel-Worker einen Einsatz an und hob den Riegel
   damit **dauerhaft** auf (die Datenbank bleibt über Läufe hinweg bestehen). Nach dem
   ersten grünen Lauf wären die Riegel-Tests für immer rot gewesen. → zwei getrennte
   Test-Kräfte.
2. Die Fixture legte bei jedem Test neu an und lief in Plan-/Rate-Grenzen (403).
   → wiederverwenden statt neu anlegen. Eine Suite, die zufällig rot wird, ist schlimmer
   als keine.

Die bestehende Smoke-Suite hätte beide Befunde **nicht** gefangen: Sie prüft nur, dass
nicht auf `worker-login.html` umgeleitet wird — eine Umleitung aufs Profil sieht für sie
wie ein Erfolg aus.

**Was das kostet, sie zu schließen:** Eine authentifizierte E2E-Fahrt. Die Suite legt sich
ihren Test-Worker selbst an (`e2e/tests/einsatzportal-worker-flow.spec.js`), es fehlt nur
`npm install` + Playwright-Browser. Damit werden aus 9 Vermutungen 9 Messwerte — und die
Prüfungen bleiben als Regressionsschutz für die Folgeprojekte liegen.
