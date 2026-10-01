# Welle Y — Die Probebühne: jede Rolle, jedes Abo, jede Richtung

> **Status: Bauanweisung.** Erstellt 2026-09-24, Ist-Stand gegen die laufende
> Entwicklungsdatenbank gemessen.
> **Gebaut von der bauenden Sitzung, gegengeprüft von der planenden** — siehe
> [`../UEBERGABE.md`](../UEBERGABE.md), Abschnitt „Wer baut, wer prüft".

---

## 1. Die Owner-Vorgabe

> *„wir sollten sowieso mehrere Accounts anlegen, um alles in alle Richtungen durchzuspielen —
> selbst jedes Abo usw., dann auch das Einsatzportal usw."*

Vor dem Livegang im Dezember ist das keine Fleißaufgabe, sondern **die einzige Art, die Zusagen
zu prüfen, die kein Test abdeckt**: dass ein Mensch mit einem bestimmten Abo auf einer bestimmten
Fläche das Richtige sieht — und das Falsche nicht.

---

## 2. Ist-Stand, gemessen am 2026-09-24

| Gemessen | Zahl | Was das bedeutet |
|---|---|---|
| Organisationen | **2566** (1872 Unternehmen, 694 Zeitarbeitsfirmen) | Masse ist reichlich da |
| Abos aktiv | DEMO 10 · BASIS 16 · PLUS 266 · **PRO 3** · INDIVIDUELL 17 | alle fünf Stufen vorhanden, PRO dünn |
| **Organisationen mit mehr als einem Standort** | **1** | Welle U ist in Daten praktisch **nicht** durchspielbar |
| Organisationen mit mehr als einem Mitglied | 15 | Rollenverwaltung kaum belegbar |
| Arbeiterprofile | 33, **alle mit Portalkonto** | die Zugänge gibt es |
| Arbeiter **mit Fähigkeiten** | **3 von 33** | der Marktplatz kann gar nicht voll wirken |
| Demo-Welt (Mig 052) | vorhanden und **gegatet** über `app.seed_demo_world` | die Schiene existiert, sie ist nur dünn besetzt |

> **Y0.2 ausgeführt — Stand 2026-10-01, und die aufschlussreichste Zahl ist die, die sich NICHT
> bewegt hat.**
>
> | Gemessen | 2026-09-24 | **2026-10-01** | Veränderung |
> |---|---|---|---|
> | Organisationen | 2566 | **2940** (2136 Unternehmen, 804 Zeitarbeitsfirmen) | **+374** |
> | Abos aktiv | DEMO 10 · BASIS 16 · PLUS 266 · PRO 3 · INDIVIDUELL 17 | DEMO **11** · BASIS 16 · PLUS 266 · **PRO 3** · INDIVIDUELL 17 | +1 DEMO |
> | Organisationen mit mehr als einem **Standort** | 1 | **1** | **unverändert** |
> | Organisationen mit mehr als einem **Mitglied** | 15 | **15** | **unverändert** |
> | Arbeiterprofile | 33 (alle mit Portalkonto) | **33** (alle mit Portalkonto) | unverändert |
> | Arbeiter **mit Fähigkeiten** | 3 von 33 | **3 von 33** | **unverändert** |
>
> **In einer Woche sind 374 Organisationen dazugekommen, und keine einzige strukturelle Lücke hat
> sich geschlossen.** Die Masse wächst durch Testläufe; die Bühne wächst nicht mit. Das ist der
> Beleg dafür, dass Y1 keine Fleißaufgabe ist: **mehr Organisationen machen die Plattform nicht
> durchspielbar.** PRO steht weiter bei **drei** Abos, ein multistandortiger Kunde ist weiter
> **einer**, und der Marktplatz kann mit **3 von 33** Kräften mit Fähigkeiten nicht voll wirken.
>
> *Nachtrag zur Methode: zwei meiner Abfragen schlugen zuerst fehl, weil ich Namen geraten habe —
> `subscriptions.plan_key` (heißt `plan`) und `worker_skills` (heißt `worker_profile_skills`).
> Nachgesehen statt weitergeraten; die Zahlen oben stehen auf den echten Namen.*

> **Nachmessung 2026-10-01 (zweite Sitzung, unabhängig): jede Zahl oben bestätigt — und vier
> Fakten dazu, die Y1 unmittelbar betreffen.**
>
> Die Zahlen der Erstmessung halten ohne Abstrich: 2940 (2136/804), DEMO 11 · BASIS 16 · PLUS 266
> · PRO 3 · INDIVIDUELL 17, ein Kunde mit mehr als einem Standort, 15 mit mehr als einem Mitglied,
> 33 Profile, 3 mit Fähigkeiten. Nachgerechnet, nicht übernommen.
>
> **(1) Die Standortgrenze hat NULL lebende Daten — nicht nur dünne.**
> `org_memberships.location_id IS NOT NULL` ergibt **0** von 252 Mitgliedschaften. Keine einzige
> Person im gesamten Bestand ist an einen Standort gebunden. Welle U hat die Grenze gebaut; im
> Bestand übt sie niemand aus.
>
> **(2) Und sie ist nicht nur dünn, sondern NICHT VORFÜHRBAR.**
> Organisationen mit mehr als einem Standort **und** mehr als einem Mitglied: **keine**. Der
> Vorgang *ich melde mich als Standortleitung Hamburg an und darf Berlin nicht sehen* lässt sich
> heute nicht einmal herstellen — es gibt keine zweite Person in derselben Firma an einem anderen
> Standort. Das ist der eigentliche Grund, warum Y1.2 vor allem anderen in Y1 steht.
>
> **(3) Es gibt ZWEI Standort-Tabellen, und eine Saat könnte die falsche füllen.**
> `org_locations` ist die Wahrheit: **alle sieben** `location_id`-Fremdschlüssel (`assignments`,
> `capacity_posts`, `org_departments`, `org_memberships`, `rate_cards`, `requisitions`,
> `vendor_pool`) zeigen dorthin, und zwar **zusammengesetzt mit `org_id`**. `company_locations`
> hängt an `user_id` statt an `org_id`, trägt **eine** Zeile und ist das Modell von vor den
> Organisationen. Eine Saat, die `company_locations` füllt, sähe richtig aus und würde nichts
> beweisen.
> *Nebenbei: `locations` und `departments` — die Namen, die man intuitiv schreibt — existieren
> überhaupt nicht. Sie heißen `org_locations` und `org_departments`.*
>
> **(4) `vendor_pool` hat 0 Zeilen.**
> Der Lieferantenpool ist leer. Welle U6 hat dafür eine Wirkungsvorschau vor dem Entfernen gebaut
> (`wirkungDesEntfernens`) — gegen eine Tabelle, in der nichts steht. Das ist kein Fehler der
> Welle, aber es heißt: der Pool gehört in Y1 besetzt, sonst bleibt auch dieser Weg unbegehbar.
> Ebenso dünn: `contracts` 3, `rate_cards` 4, `timesheets` 10 — und in der Rollenverteilung steht
> **`admin` bei 1** von 252.

> **Y0.1 AUSGEFÜHRT — Stand 2026-10-01. Die Sperre hielt für die Migrationskette und NICHT für die
> drei Saat-Dateien daneben.**
>
> Der Plan fragte: *läuft Mig 052 wirklich nur mit gesetztem Schalter, und gilt dasselbe für die
> neue Saat?* Die erste Hälfte: ja, lückenlos — der ganze Rumpf (Zeile 29–615 von 616) liegt im
> gegateten Block, `migrate.sh` reicht den Schalter per `PGOPTIONS` an jede Sitzung, Vorgabe
> `false`, Produktions-compose ausdrücklich `false`. Mig 125 räumt den Altbestand auf.
>
> Die zweite Hälfte war das Problem — und zwar schon für die **bestehende** Saat. Unter
> `sql/seeds/` lagen drei Dateien, die **fünf anmeldbare Konten mit echtem bcrypt-Hash** anlegen,
> und sie hatten **keine** Sperre in der Datei. `dev-data.sql` hatte zusätzlich **keine
> Transaktionsklammer**, ein Abbruch hätte die Anweisungen darunter also nicht gestoppt. Als
> einziger Schutz stand ein `NODE_ENV`-Vergleich im ladenden Skript — **und der prüft die Umgebung
> der SHELL, während in die Datenbank des CONTAINERS geschrieben wird.** Auf einem
> Produktions-Host hat die Shell eines Betreibers üblicherweise kein `NODE_ENV`; der Riegel fiel
> auf *development* zurück und ließ durch. Dazu dokumentierte `docs/SALES_DEMO_PATH.md`
> **zweimal** `psql $DATABASE_URL < sql/seeds/demo-sales.sql` — ein Befehl, der am Skript und
> damit an jeder Prüfung vorbeigeht.
>
> **Gebaut:** die Sperre sitzt jetzt in der Datei, die die Zeilen anlegt (`DO $sperre_saat# Welle Y — Die Probebühne: jede Rolle, jedes Abo, jede Richtung

> **Status: Bauanweisung.** Erstellt 2026-09-24, Ist-Stand gegen die laufende
> Entwicklungsdatenbank gemessen.
> **Gebaut von der bauenden Sitzung, gegengeprüft von der planenden** — siehe
> [`../UEBERGABE.md`](../UEBERGABE.md), Abschnitt „Wer baut, wer prüft".

---

## 1. Die Owner-Vorgabe

> *„wir sollten sowieso mehrere Accounts anlegen, um alles in alle Richtungen durchzuspielen —
> selbst jedes Abo usw., dann auch das Einsatzportal usw."*

Vor dem Livegang im Dezember ist das keine Fleißaufgabe, sondern **die einzige Art, die Zusagen
zu prüfen, die kein Test abdeckt**: dass ein Mensch mit einem bestimmten Abo auf einer bestimmten
Fläche das Richtige sieht — und das Falsche nicht.

---

## 2. Ist-Stand, gemessen am 2026-09-24

| Gemessen | Zahl | Was das bedeutet |
|---|---|---|
| Organisationen | **2566** (1872 Unternehmen, 694 Zeitarbeitsfirmen) | Masse ist reichlich da |
| Abos aktiv | DEMO 10 · BASIS 16 · PLUS 266 · **PRO 3** · INDIVIDUELL 17 | alle fünf Stufen vorhanden, PRO dünn |
| **Organisationen mit mehr als einem Standort** | **1** | Welle U ist in Daten praktisch **nicht** durchspielbar |
| Organisationen mit mehr als einem Mitglied | 15 | Rollenverwaltung kaum belegbar |
| Arbeiterprofile | 33, **alle mit Portalkonto** | die Zugänge gibt es |
| Arbeiter **mit Fähigkeiten** | **3 von 33** | der Marktplatz kann gar nicht voll wirken |
| Demo-Welt (Mig 052) | vorhanden und **gegatet** über `app.seed_demo_world` | die Schiene existiert, sie ist nur dünn besetzt |

> **Y0.2 ausgeführt — Stand 2026-10-01, und die aufschlussreichste Zahl ist die, die sich NICHT
> bewegt hat.**
>
> | Gemessen | 2026-09-24 | **2026-10-01** | Veränderung |
> |---|---|---|---|
> | Organisationen | 2566 | **2940** (2136 Unternehmen, 804 Zeitarbeitsfirmen) | **+374** |
> | Abos aktiv | DEMO 10 · BASIS 16 · PLUS 266 · PRO 3 · INDIVIDUELL 17 | DEMO **11** · BASIS 16 · PLUS 266 · **PRO 3** · INDIVIDUELL 17 | +1 DEMO |
> | Organisationen mit mehr als einem **Standort** | 1 | **1** | **unverändert** |
> | Organisationen mit mehr als einem **Mitglied** | 15 | **15** | **unverändert** |
> | Arbeiterprofile | 33 (alle mit Portalkonto) | **33** (alle mit Portalkonto) | unverändert |
> | Arbeiter **mit Fähigkeiten** | 3 von 33 | **3 von 33** | **unverändert** |
>
> **In einer Woche sind 374 Organisationen dazugekommen, und keine einzige strukturelle Lücke hat
> sich geschlossen.** Die Masse wächst durch Testläufe; die Bühne wächst nicht mit. Das ist der
> Beleg dafür, dass Y1 keine Fleißaufgabe ist: **mehr Organisationen machen die Plattform nicht
> durchspielbar.** PRO steht weiter bei **drei** Abos, ein multistandortiger Kunde ist weiter
> **einer**, und der Marktplatz kann mit **3 von 33** Kräften mit Fähigkeiten nicht voll wirken.
>
> *Nachtrag zur Methode: zwei meiner Abfragen schlugen zuerst fehl, weil ich Namen geraten habe —
> `subscriptions.plan_key` (heißt `plan`) und `worker_skills` (heißt `worker_profile_skills`).
> Nachgesehen statt weitergeraten; die Zahlen oben stehen auf den echten Namen.*

 mit
> `RAISE EXCEPTION`, Bedingung `IS DISTINCT FROM 'true'`), damit sie für **jeden** Ladeweg gilt —
> auch für einen, den es heute noch nicht gibt. `dev-data.sql` bekam `BEGIN;`/`COMMIT;`.
> `scripts/dev/seed-data.sh` setzt den Schalter per `PGOPTIONS`, **verlangt** ihn ausdrücklich
> statt ihn aus der Umgebung zu erraten, und nutzt `ON_ERROR_STOP=1` (ohne das endete psql mit 0,
> auch wenn die ganze Transaktion abgebrochen war — das Skript meldete Erfolg ohne eine Zeile).
> `--list` bleibt ohne Schalter nutzbar, `--clean` mit seinem `TRUNCATE users CASCADE` nicht.
> Vier Dokumentationsstellen auf den erlaubten Befehl nachgezogen; zwei nannten Skripte, die es
> nicht gibt (`sql/seed.sh`; `scripts/verify_release_dir.sh` heißt wirklich
> `scripts/release-verify.sh`).
>
> **Gemessener Beweis an der laufenden Datenbank:** ohne Schalter brechen alle drei Dateien mit
> `SEED_DEMO_WORLD nicht aktiv` ab, **6** Folge-Anweisungen werden mit `current transaction is
> aborted` blockiert, **0** Einfügungen laufen durch, psql endet mit `ROLLBACK` — das eigene
> `COMMIT;` der Datei wird zur Rücknahme. `users` steht vorher und nachher auf 409.
>
> **Wächter:** `api/test/saatSperreHaelt.test.js`, 17 Zusicherungen über alle vier Ladewege,
> **18 Rückmutationen, alle rot und jede an der gemeinten Stelle.** Die wichtigste ist D1: den
> `psql`-Direktaufruf zurück in die Vertriebsdoku → rot. Damit ist belegt, dass der Wächter den
> Befund vom 2026-10-01 gefangen **hätte**.
>
> *A2 blieb beim ersten Lauf grün: die Zusicherung suchte den Schalternamen und fand ihn in der
> **Begründung** über dem Block statt in der Anweisung. Zehnter Fall dieser Klasse an einem Tag.
> Jetzt wird auf `current_setting(…)` verankert, auf kommentarfreien Zeilen.*
>
> **Offen und dem Owner vorgelegt, nicht entschieden:** drei Klartext-Passwörter stehen weiter im
> Repo (`DemoPass2026!` in Mig 052, `Demo2026!` in `demo-sales.sql`, `password123` in
> `dev-data.sql` und in der Schlusszusammenfassung von `seed-data.sh`). Die Sperre macht sie
> außerhalb von dev wirkungslos, sie **entfernt** sie aber nicht. Das ist Y6.3 und betrifft einen
> Anmeldeweg — die Entscheidung gehört dem Owner.

**Der Befund in einem Satz: es fehlen keine Daten, es fehlt eine BENANNTE BESETZUNG.**
2566 Organisationen nützen nichts, wenn man sich in keine davon anmelden kann und von keiner
weiß, wofür sie steht. Durchspielen heißt: *„ich melde mich als X an, klicke Y, und muss Z
sehen."* Genau das ist heute nicht möglich.

---

## 3. Entscheidungen (in dieser Welle getroffen)

| Frage | Entscheidung | Warum |
|---|---|---|
| Masse oder Besetzung? | **Eine benannte Besetzung von etwa 16 Konten**, jedes mit dokumentiertem Zweck | Ein Konto ohne Zweck wird beim Durchspielen übersprungen |
| Passwörter? | **Nie im Repository.** Das Entwicklungs-Passwort kommt aus der Umgebung (`DEMO_PASSWORT`), die Saat legt nur den Hash an | Ein eingechecktes Passwort ist ein Geheimnis, auch wenn „nur Demo" daneben steht |
| Wiederholbarkeit? | **Idempotent**: ein erneuter Lauf repariert die Besetzung, er verdoppelt sie nicht | Sonst hat man nach dem dritten Lauf drei „Musterfirma GmbH" |
| Zeitbezug? | **Alle Daten relativ zu heute** (`todayDE()`), nie feste Kalenderdaten | Eine Bühne mit festen Daten ist nach zwei Wochen unbrauchbar: „überfällig" wird zu „uralt" |
| Trennung zur Masse | Besetzungskonten sind **erkennbar** und vollständig entfernbar | Wer aufräumt, muss Bühne von echten Prüfdaten unterscheiden können |
| Produktion? | Die bestehende Sperre (`app.seed_demo_world`) bleibt, **plus Wächter** | Demo-Daten in der Produktion wären der peinlichste denkbare Fehler |

---

## 4. Wellen und Phasen

### Y0 · Messen und absichern

| Phase | Inhalt | Nachweis |
|---|---|---|
| Y0.1 ✅ | **Zuerst die Sperre prüfen:** läuft Mig 052 wirklich nur mit gesetztem Schalter, und gilt dasselbe für die neue Saat? | Ohne Schalter entsteht keine Zeile. **Rückmutation:** Schalterprüfung entfernen → rot |
| Y0.2 ✅ | Zahlen von heute erheben und die Tabelle oben fortschreiben | Tabelle mit Datum, damit niemand gegen einen alten Stand baut |

### Y1 · Die Besetzung

| Phase | Inhalt | Nachweis |
|---|---|---|
| Y1.1 ✅ | **Je Abo eine Zeitarbeitsfirma und ein Unternehmen** — DEMO, BASIS, PLUS, PRO, INDIVIDUELL; bei INDIVIDUELL zusätzlich die Größenstufen S und Enterprise, weil sie andere Grenzen tragen | **Gemessen 2026-10-01: alle zehn Kombinationen Plan × Art existierten schon** (dünnste: 2 Orgs). Was fehlte, waren die Größenstufen `individuell_s`/`individuell_l` — sie stehen in `y1-3-sonderzustaende.sql`, zusammen mit 18 anmeldbaren Konten mit Zweck im Namen |
| Y1.2 ✅ | **Eine Firma mit drei Standorten und drei Menschen** (Verwaltung, Disposition, Standortleitung) — heute gibt es **eine** solche Organisation unter 2566 | Welle U wird damit überhaupt erst durchspielbar |
| Y1.3 ✅ | **Je ein Konto im Sonderzustand:** Pilotkunde, gekündigt, wegen Zahlungsausfall gesperrt, Abo läuft in drei Tagen ab | Jeder Zustand ist anmeldbar und zeigt genau seine Oberfläche |
| Y1.4 ✅ | **Eine Zeitarbeitsfirma mit vollständiger Belegschaft:** 12 Kräfte, davon 8 mit Katalog-Fähigkeiten, 2 im Einsatz, 1 krank, 1 verspätet | Erst damit kann der Marktplatz voll wirken (heute: 3 von 33 mit Fähigkeiten) |

> **Y1.2 GEBAUT — Stand 2026-10-01. Beide Nullen stehen jetzt auf 1.**
>
> `sql/seeds/y1-2-standorte.sql` legt **Nordlicht Logistik GmbH** an (PLUS) mit
> drei Standorten (Hamburg Hafen als Hauptsitz, Berlin Schoenefeld, Muenchen
> Nord), drei standortgebundenen Abteilungen und **drei Menschen mit drei
> Sichtweiten**:
>
> | Konto | Rolle | sieht |
> |---|---|---|
> | `verwaltung@probebuehne.tempconnect.de` | `admin` | alle drei Standorte |
> | `disposition@probebuehne.tempconnect.de` | `hiring_manager` | alle drei Standorte |
> | `standort.hamburg@probebuehne.tempconnect.de` | `member`, gebunden an Hamburg | **nur Hamburg** |
>
> Die dritte Zeile ist der ganze Zweck. Gemessen an der laufenden Datenbank,
> vorher → nachher:
>
> | | vorher | nachher |
> |---|---|---|
> | Organisationen mit >1 Standort **und** >1 Mitglied | **0** | **1** |
> | Mitgliedschaften mit Standortbindung | **0** von 252 | **1** |
> | Abteilungen mit Standortbindung | 4 | 7 |
>
> **Vorher war der Vorgang nicht herstellbar** — es gab keine zweite Person in
> derselben Firma an einem anderen Standort. Ab jetzt lässt sich die Grenze aus
> Welle U zum ersten Mal von Hand durchspielen.
>
> **KEIN PASSWORT IM REPO, und das ist der Unterschied zu den drei älteren
> Saaten.** Mig 052 trägt `DemoPass2026!`, `demo-sales.sql` trägt `Demo2026!`,
> `dev-data.sql` trägt `password123` — im Klartext, in einem öffentlichen Repo.
> Die neue Saat nimmt das Passwort aus dem Schalter `app.seed_passwort` und
> hasht **erst beim Laden** mit `pgcrypto`
> (`crypt(…, gen_salt('bf', 10))` → `$2a$10$…`, dasselbe Format, das 71
> bestehende Konten tragen und das `bcryptjs.compare` prüft). Ohne Schalter:
> Abbruch. Es gibt **keine Vorgabe** — eine Vorgabe wäre genau das Passwort im
> Repo, das vermieden werden soll. Zusätzlich abgelehnt: leer, kürzer als 12
> Zeichen, mit Leerzeichen oder Anführungszeichen (`PGOPTIONS` ist
> leerzeichengetrennt — ein solcher Wert würde die Option zerlegen und
> **unbemerkt** ein anderes Passwort setzen). Y6.3 ist damit für die Datei
> vorweggenommen, die ab heute dazukommt; die drei alten bleiben eine
> Owner-Entscheidung.
>
> **Aufruf:**
>
> ```bash
> SEED_DEMO_WORLD=true SEED_PASSWORT=<mindestens 12 Zeichen> \
>   ./scripts/dev/seed-data.sh --file=y1-2-standorte.sql
> ```
>
> **Gemessen in fünf Richtungen:** Skript ohne Schalter → verweigert; Skript mit
> Schalter, ohne Passwort → verweigert; SQL ohne Schalter (also **jeder** andere
> Ladeweg) → verweigert; Passwort zu kurz → verweigert; mit beidem → geladen,
> alle drei Konten anmeldbar (`crypt`-Verifikation `true`). **Zweiter Lauf
> idempotent:** `users` 412 → 412, `org_locations` 7 → 7, `org_memberships`
> 255 → 255.
>
> **Wächter:** `api/test/probebuehneY1.test.js`, 7 Zusicherungen über die Form
> der Saat, **15 Rückmutationen, alle rot und jede an der gemeinten Stelle** —
> darunter die wichtigste: die Standortbindung der dritten Mitgliedschaft
> entfernen → rot. Dazu zwei gegen die Falle, die falsche Tabelle zu füllen
> (`company_locations` statt `org_locations`) und zwei gegen ein Passwort in der
> Datei. Geprüft wird die **Form**, nicht die Datenbank: das Tor lädt keine Saat,
> und eine DB-gebundene Zusicherung wäre auf jedem Rechner rot, auf dem die Bühne
> nicht geladen ist.

> **Y1.4 GEBAUT — Stand 2026-10-01. Der Marktplatz wirkt zum ersten Mal, und die
> rote Zusicherung hat sich selbst geschlossen.**
>
> `sql/seeds/y1-4-belegschaft.sql` legt **Hanse Personal Service GmbH** an (PRO —
> von diesem Plan gab es im Bestand nur drei) mit einem Disponenten und **zwölf
> Kräften**. Gemessen nach dem Laden:
>
> | | Zahl |
> |---|---|
> | Kräfte | 12 |
> | davon mit freigegebener Katalog-Fähigkeit | **8** |
> | heute krank | 1 |
> | heute verspätet | 1 |
> | im Einsatz (gebunden) | 2 |
> | **automatische Angebote im Markt** | **5, aktiv** |
>
> Die fünf sind genau die vorhergesagten — Jonas Harms, Leyla Demir, Piotr
> Lewandow, Sanna Virtanen, Mehmet Kaya. Nicht im Markt: die Kranke (Bedingung
> 4), die zwei Gebundenen, die vier ohne Fähigkeit (Bedingung 6). **Jede
> Abwesenheit hat einen Grund mit Namen** — das ist der Gegenstand, den „Deine
> Kräfte, die niemand findet" (N7.3) braucht und bisher nicht hatte.
>
> **Die absichtlich rote Zusicherung in `api/test/marktpraesenz.service.test.js`
> ist damit grün** (10/10 statt 9/10). Der Schalter-Zyklus dort — Marktpräsenz
> abschalten, Angebote müssen verschwinden, wieder einschalten, sie müssen
> zurückkommen — ist zum ersten Mal **wirklich gelaufen**.
>
> **Die sechs Bedingungen, gemessen aus `PRAESENZ_BEDINGUNGEN`:** aktiv,
> Marktpräsenz an, Wohnort gesetzt, heute nicht abwesend, **die Organisation hat
> ein aktives Mitglied mit `role_key <> 'worker'`**, mindestens eine Fähigkeit mit
> `is_active AND status = 'approved'`.
>
> Die fünfte errät man nicht: **eine Agentur ohne Disponenten erzeugt KEIN
> einziges Angebot**, auch wenn jede Kraft vollständig ist — es gäbe niemanden,
> der antwortet. Eine Rückmutation hält das fest.
>
> **Die Bühne hängt zusammen.** Der Einsatz der beiden gebundenen Kräfte läuft
> bei **Nordlicht Logistik am Standort Hamburg Hafen** — der Organisation aus
> Y1.2. Damit trägt die Standortgrenze aus Welle U zum ersten Mal einen echten
> Geschäftsvorgang: die Standortleitung Hamburg sieht diesen Einsatz, eine
> Standortleitung Berlin würde ihn nicht sehen.
>
> **Zwei Dinge, die erst das Laden gezeigt hat:**
> `worker_profiles_identitaet_chk` verlangt `user_id` **oder** eine
> `personnel_number` — zehn der zwölf haben kein Portalkonto, und das ist der
> häufigere echte Fall (alle 33 bestehenden Profile haben eines). Und
> `assignments` hat kein `end_date`, sondern `planned_end_date`.
>
> **Ladereihenfolge ausdrücklich nummeriert.** `y1-belegschaft.sql` sortierte
> **vor** `y1-probebuehne.sql`, brauchte sie aber — der Läufer führt
> `sql/seeds/*.sql` sortiert aus. Jetzt: `y1-2-standorte.sql` und
> `y1-4-belegschaft.sql`, mit Platz für Y1.1 und Y1.3. Zusätzlich prüft die Saat
> selbst, ob die Kundenorganisation da ist, und sagt es — statt an einem
> Fremdschlüssel zu scheitern.
>
> **Aufruf:**
>
> ```bash
> SEED_DEMO_WORLD=true SEED_PASSWORT=<mindestens 12 Zeichen> \
>   ./scripts/dev/seed-data.sh
> ```
>
> **Wächter:** `api/test/probebuehneBelegschaft.test.js`, 9 Zusicherungen,
> **18 Rückmutationen, alle rot und jede an der gemeinten Stelle.** Drei davon
> deckten echte Lücken in meiner eigenen Probe auf: ich hatte dreimal die
> **Meldung** einer Notbremse geprüft statt ihre **Bedingung** — `IF false` ließ
> den Text stehen und die Zusicherung grün. Und ein Muster war ein Präfix:
> `'krank', CURRENT_DATE` passte auch auf `CURRENT_DATE + 1`, also auf eine
> Abwesenheit, die erst morgen beginnt. Alle drei korrigiert und nachgewiesen.

> **Y1.3 GEBAUT — Stand 2026-10-01. Der Plan verlangte vier Zustände; gemessen
> waren es ZWÖLF, und alle zwölf stehen jetzt.**
>
> So viele legale Zustände hatten in **2940 Organisationen und 344 Abonnements**
> kein einziges Beispiel:
>
> | Feld | war unbesetzt | jetzt |
> |---|---|---|
> | `organizations.pilot_status` | `ended` · `converted` · `blocked` · `exception` | je 1 |
> | `organizations.access_suspended_kind` | `non_payment` · `manual` · `security` | je 1 |
> | `subscriptions.status` | `past_due` · `canceling` | je 1 |
> | `organizations.individual_tier_auto` | `individuell_s` · `individuell_l` | je 1 |
> | `organizations.customer_stage` | `demo` · **`live`** | 2 · 8 |
> | Abo läuft in ≤ 7 Tagen ab | **0** | 2 |
>
> **`customer_stage = 'live'` ist der auffälligste Eintrag: keine einzige
> Organisation stand im Zustand „live".** Der Zustand, in dem ein zahlender
> Kunde die meiste Zeit verbringt, hatte kein Beispiel. Jeder unbesetzte Zustand
> ist eine Oberfläche, die niemand je gesehen hat, und ein Codepfad, den kein
> Mensch je ausgelöst hat.
>
> `sql/seeds/y1-3-sonderzustaende.sql` legt **zwölf Organisationen** an, jede mit
> genau einem Zweck — und **der Zweck steht im Namen**: „Pilot beendet GmbH",
> „Zahlungsausfall GmbH", „Sicherheitssperre GmbH", „Ablauf in drei Tagen GmbH".
> Wer die Liste in der Verwaltung sieht, weiß ohne Nachschlagen, wofür jede Zeile
> da ist.
>
> **Zwei Organisationen tragen bewusst zwei Zustände**, weil die Kombination die
> realistische ist: „wegen Zahlungsausfall gesperrt" geht mit einem Abonnement in
> `past_due` einher, und „Pilot übernommen" ist genau der Übergang nach
> `customer_stage = 'live'`. Ein `past_due` ohne Sperre und eine Sperre ohne
> offenes Abo wären beide Zustände, die es so nie gibt.
>
> **Alle Datumswerte sind RELATIV** (`CURRENT_DATE ± n`, `now() - interval`). Ein
> festes Datum ist in drei Wochen „vor zwei Jahren" und die Mahnstrecke zeigt
> wieder nichts — Y2.3 verlangt dasselbe ausdrücklich, hier ist es vorweggenommen.
>
> **Y1.1 ist damit mit erledigt, und der Grund ist eine Messung:** dessen
> wörtliche Forderung — je Abo eine Zeitarbeitsfirma und ein Unternehmen — war
> durch die Masse schon erfüllt. Alle **zehn** Kombinationen aus Plan und Art
> (DEMO/BASIS/PLUS/PRO/INDIVIDUELL × company/agency) existierten bereits, die
> dünnste mit 2 Organisationen. Was fehlte, waren die INDIVIDUELL-Größenstufen;
> `individuell_s` und `individuell_l` stehen in dieser Saat.
>
> **18 von 18 Bühnen-Konten sind anmeldbar** (Y1.2 + Y1.3 + Y1.4), gemessen über
> `crypt()`-Verifikation gegen den Hash. Zweiter Lauf idempotent: `users`,
> `organizations`, `subscriptions` unverändert bei 427 / 2954 / 350.
>
> **Wächter:** `api/test/probebuehneSonderzustaende.test.js`, 8 Zusicherungen,
> **13 Rückmutationen, alle rot und jede an der gemeinten Stelle.** Fünf davon
> waren zuerst GRÜN und haben echte Lücken in meiner eigenen Probe gezeigt — alle
> fünf dieselbe Familie: **die Zusicherung suchte in einem zu weiten Text.**
>
>   - Zwei fanden den Zustand in meiner **eigenen Notbremse** am Dateiende, die
>     jeden der zwölf Werte ja nennt. Geprüft wird jetzt nur der Teil der Datei,
>     der Zeilen anlegt.
>   - Eine traf das falsche Datum in einem 200-Zeichen-Fenster.
>   - Eine zählte ein **dupliziertes** Konto doppelt und kam auf zwölf, während
>     eine Organisation ohne Konto zurückblieb.
>   - Eine zählte **auskommentierte** `ON CONFLICT`-Klauseln mit.

### Y2 · Die Zustände, die sonst niemand herstellt

| Phase | Inhalt | Nachweis |
|---|---|---|
| Y2.1 | **Deals in jedem Zustand**: angefragt, verhandelt, abgeschlossen, laufend, beendet, zurückgenommen | Jeder Zustand einmal sichtbar, auf **beiden** Seiten |
| Y2.2 | **Stundenzettel in jedem Zustand**: offen, eingereicht, abgelehnt mit Korrekturbitte, genehmigt, an den Kunden gesendet, abgerechnet | Der ganze Weg des Kreislaufs K-2 ist an einem Tag durchklickbar |
| Y2.3 ✅ | **Rechnungen**: offen, fällig, überfällig, gemahnt, bezahlt — mit **relativen** Datumswerten | Die Mahnstrecke zeigt echte Fälligkeiten statt „vor zwei Jahren" |
| Y2.4 | **Ein Mensch für den Betrugsriegel** (M4c.3): eine Kraft, die als Einzelangebot **und** im Sammelangebot steht | Die wichtigste Probe aus M4c lässt sich von Hand nachvollziehen |
| Y2.5 ✅ | **Eine Sperre**: dieselbe Kraft bei Kunde A gesperrt, bei Kunde B sichtbar | Die zentrale Zusage der Sperrliste wird vorführbar |
| Y2.6 ✅ | **Ein offener Fähigkeits-Vorschlag** und **eine katalogfremde Schreibvariante** | Die Kuratierfläche aus b-6/b-7 ist nicht leer, wenn man sie zeigt |
| Y2.7 | **Sammelangebote mit eigenen Mitgliedern.** Gemessen am 2026-09-24: die beiden vorhandenen Sammelangebote teilen sich **dieselben zwei Menschen**, und einer davon steht zusätzlich in einem Einzelangebot. Eine Bühne, die Sammelangebote vorführen soll, braucht Mitglieder, die sonst nirgends stehen — sonst führt sie genau die Doppelbuchung vor, die sie widerlegen soll | Ein Sammelangebot mit 4 Mitgliedern, die in keinem Einzelangebot vorkommen; dazu **ein** bewusst doppelt geführter Mensch für die Probe aus M4c.3 |

> **Y2.3 · Y2.5 · Y2.6 GEBAUT — Stand 2026-10-01. Drei Gegenstände fehlten nicht
> teilweise, sondern GANZ.**
>
> | Gemessen | vorher | nachher |
> |---|---|---|
> | `invoices` | **0 Zeilen** — alle fünf Zustände unbesetzt | 5, jeder Zustand einmal |
> | `company_worker_blocklist` | **0 Zeilen** | 1 (mit sichtbarer Gegenseite) |
> | Fähigkeits-Vorschläge | **0** — alle 162 auf `approved` | 1 `proposed` + 1 `merged` |
>
> **Eine leere Tabelle ist schlimmer als ein unbesetzter Zustand:** beim Zustand
> sieht man wenigstens die Liste. Bei der leeren Tabelle sieht man nichts und
> weiß nicht, ob die Fläche kaputt ist oder nur leer.
>
> **Y2.3 — die Mahnstrecke.** Fünf Rechnungen: Entwurf (noch nicht fällig),
> gestellt (fällig in acht Tagen), **überfällig mit Mahnstufe 2** (30 Tage, letzte
> Mahnung vor neun Tagen), bezahlt (drei Tage vor Fälligkeit), storniert. Vier
> operative Rechnungen und **eine Abo-Rechnung**, weil beide Wege getrennt
> gezeigt werden.
>
> Die überfällige hängt an **der Organisation, die wegen Zahlungsausfall gesperrt
> ist** (Y1.3). Überfälligkeit und Sperre gehören zusammen; getrennt zeigen sie
> zwei Zustände, die nichts miteinander zu tun haben.
>
> **Alle Fälligkeiten relativ, gemessen null feste Kalenderdaten in der Datei.**
> Y2.3 verlangt das wörtlich: *„die Mahnstrecke zeigt echte Fälligkeiten statt
> ,vor zwei Jahren'"*.
>
> **DIE SUMMEN RECHNEN AUF, Zeile für Zeile:** gemessen 5 von 5. Die Datenbank
> erzwingt `brutto − Rabatt = netto` (CHECK); `netto + MwSt = Summe` erzwingt sie
> **nicht**, und genau deshalb prüft der Wächter es. Eine Bühne für Geldwege mit
> falscher Summe zeigt einen Rechenfehler als Produkt. Eine Rechnung trägt
> **10 % Rabatt**, sonst bliebe der Rabattpfad ohne Beispiel.
>
> **Y2.5 — die Sperre, und beide Seiten.** Jonas Harms ist bei Nordlicht
> gesperrt (befristet, `CURRENT_DATE + 90`, mit Grund und vermittelndem
> Lieferanten) und steht **gleichzeitig weiter mit einem offenen Angebot im
> Markt**. Das ist die ganze Zusage der Sperrliste — und sie lässt sich nur
> zeigen, wenn beide Seiten da sind. Eine Sperre ohne sichtbares Angebot wäre die
> halbe Hälfte.
>
> **Y2.6 — zwei verschiedene Fälle.** Ein `proposed` (eine Firma schlägt
> „Kaltlager-Kommissionierung (−25 Grad)" vor, noch nicht entschieden, `is_active
> = FALSE`) und ein `merged` („Lagerhelfer/in (m/w/d)" → zusammengeführt auf
> „Lagerhelfer:in"). Das Ziel wird **aus** `platform_skills` gelesen, nicht
> getippt: ein Tippfehler ließe `merged_into_skill_id` ins Leere zeigen, und die
> `INSERT..SELECT` legte lautlos keine Zeile an.
>
> **Wächter:** `api/test/probebuehneGeldwege.test.js`, 9 Zusicherungen,
> **19 Rückmutationen, alle rot und jede an der gemeinten Stelle** — darunter die
> drei wichtigsten: MwSt falsch rechnen, Rabatt falsch rechnen, Rabatt ganz
> entfernen.
>
> **Noch offen in Y2:** Y2.1 (Deals in jedem Zustand — gemessen **7 von 11**
> `requests.status`-Werten unbesetzt), Y2.2 (Stundenzettel — nur `cancelled`
> fehlt), Y2.4 und Y2.7 (Sammelangebote mit eigenen Mitgliedern; gemessen teilen
> sich die beiden vorhandenen dieselben zwei Menschen).

### Y3 · Das Einsatzportal

| Phase | Inhalt | Nachweis |
|---|---|---|
| Y3.1 ✅ | **Vier Arbeiter in vier Stadien**: eingeladen aber nicht registriert · registriert ohne Fähigkeiten · vollständig mit Nachweisen · im Einsatz | Jeder Schritt der Kette aus M2/M3 ist von außen nachvollziehbar |
| Y3.2 ✅ | **Krankmeldung und Verspätung** je einmal gesetzt, mit heutigem Bezug | **Mit Y1.4 erfüllt:** `worker_absences` art='krank' ab `CURRENT_DATE`, `worker_delays` `gilt_fuer = CURRENT_DATE` — an ZWEI verschiedenen Kräften, sonst lässt sich nicht zeigen, dass das eine den Markt verdeckt und das andere nicht |
| Y3.3 ✅ | **Ein hochgeladener Nachweis mit Katalogbezug** (seit N8.1b Pflicht) | Der Nachweis belegt eine Katalog-Fähigkeit, keinen freien Text |
| Y3.4 ✅ | **Die harte Trennung bleibt:** kein Arbeiterkonto erreicht die Plattform, kein Firmenkonto das Portal | Bestehende Wächter bleiben grün — **diese Zusage darf die Bühne nicht aufweichen** |

> **Y3 GEBAUT — Stand 2026-10-01. Von vier Stadien hatten ZWEI kein Beispiel.**
>
> | Stadium | vorher | nachher |
> |---|---|---|
> | 1 · eingeladen, nicht registriert | **0** — sechs Einladungen, **alle abgelaufen** | 1 |
> | 2 · registriert ohne Fähigkeiten | 34 | 34 |
> | 3 · vollständig **mit Nachweis** | **0** — `worker_profile_documents` war LEER | 1 |
> | 4 · im Einsatz | 15 | 15 |
>
> **Stadium 1 ist der aufschlussreichere Befund:** Einladungen *gab* es, sie waren
> nur alle verfallen. Der Zustand „eingeladen, wartet" — der einzige, in dem die
> Einladungsfläche überhaupt etwas zeigt — hatte kein Beispiel. Dieselbe Klasse
> wie die zwölf unbesetzten Zustände aus Y1.3: nicht fehlende Daten, ein
> fehlender **Zustand**.
>
> **Stadium 3 ist härter:** im ganzen Bestand existierte **kein einziger
> Arbeiter-Nachweis**. Seit N8.1b muss ein Nachweis einen Katalogbezug tragen,
> geprüft über `qualification_name` gegen `platform_skills` — und es gab keinen
> Fall, an dem sich das zeigen ließ.
>
> `sql/seeds/y3-arbeiterstadien.sql` legt beides an. Der Nachweis belegt dabei die
> **eigene** Fähigkeit der Kraft: Jonas Harms trägt „Lagerhelfer:in", und sein
> geprüfter Nachweis nennt genau diesen Katalognamen — gelesen **aus**
> `platform_skills`, nicht getippt. Ein Nachweis über eine fremde Fähigkeit wäre
> formal gültig und inhaltlich sinnlos; eine Rückmutation hält das fest.
>
> **Der Einladungs-Token ist heikler als ein Passwort.** `worker_invites.token`
> ist der **rohe** Token, mit dem jemand ein Konto anlegt — in einem öffentlichen
> Repo wäre er ein gültiger Zugangsschlüssel, der ohne Anmeldung wirkt. Er
> entsteht deshalb beim Laden aus `gen_random_bytes(32)`; `token_hash` ist sein
> SHA-256, genau wie `orgInviteService` ihn bildet. Gemessen: 64 Zeichen, Hash
> stimmt, Token steht nicht in der Datei. **Ein zweiter Lauf lässt ihn
> unverändert** — sonst würde ein schon verschickter Link ungültig, ohne dass
> jemand es merkt. Die Laufzeit wird dagegen aufgefrischt, damit die Einladung
> nicht mit der Zeit verfällt und Stadium 1 wieder verliert.
>
> **Y3.2 war mit Y1.4 schon erfüllt:** Krankmeldung und Verspätung je einmal
> gesetzt, mit heutigem Bezug (`worker_absences` art='krank' ab `CURRENT_DATE`,
> `worker_delays` `gilt_fuer = CURRENT_DATE`) — und zwar an **zwei
> verschiedenen** Kräften, sonst ließe sich nicht zeigen, dass das eine den Markt
> verdeckt und das andere nicht.
>
> **Y3.4 ist eine Zusage, keine Daten** — und sie wird jetzt bewacht. Die Gefahr
> ist konkret: wer einem Arbeiterkonto eine Mitgliedschaft mit Firmenrolle gibt,
> damit „man alles sieht", hebelt `hidden_worker` **in den Daten** aus, wo kein
> RBAC-Wächter hinsieht. Die Zusicherung prüft **alle vier** Bühnen-Saaten; drei
> Gegenproben (Firmenrolle in Y3, Firmenrolle in Y1.4, alle Arbeiterkonten
> unsichtbar machen) sind rot.
>
> **Wächter:** `api/test/probebuehneArbeiterstadien.test.js`, 9 Zusicherungen,
> **16 Rückmutationen + 3 Gegenproben, alle rot und jede an der gemeinten
> Stelle.** Drei Lücken in meiner eigenen Probe kamen dabei heraus:
>
>   - Zwei Zusicherungen fanden `'pending'` und die Laufzeit **in der
>     ON-CONFLICT-Klausel** statt in der Einfügung — eine Einladung auf
>     `'expired'` zu setzen blieb grün. Geprüft wird jetzt nur die Einfügung.
>   - Die Y3.4-Zusicherung war **leer grün**: ihr Muster verlangte `('` ohne
>     Weißraum, in der Datei steht dazwischen ein Zeilenumbruch, und ein
>     `continue` bei leerer Menge verdeckte es. Eine Gegenprobe, die einem
>     Arbeiterkonto `admin` gab, wurde **nicht** gefangen. Jetzt zählt eine
>     Notbremse die gefundenen Arbeiterkonten über alle Saaten.

### Y4 · Die getrennten Flächen

| Phase | Inhalt | Nachweis |
|---|---|---|
| Y4.1 | Je ein Zugang für **Staff CC**, **Support Center** und die **Owner-Sicht** | Die drei Flächen sind einzeln durchspielbar |
| Y4.2 | **Keine dieser Flächen wird aus der Kundenplattform erreichbar** | `staffNieAusDerPlattform.test.js` bleibt grün |

### Y5 · Das Regiebuch

| Phase | Inhalt | Nachweis |
|---|---|---|
| Y5.1 | **Ein Dokument mit Durchspiel-Wegen**, je Richtung einer: „melde dich an als … → klicke … → du musst sehen …" | Ein Mensch ohne Vorwissen prüft jede Richtung in Minuten |
| Y5.2 | Die Wege decken **die Kreisläufe K-1 bis K-7** ab (`V_SCHNITTSTELLEN.md`, Abschnitt 3b) | Jeder Kreislauf hat mindestens einen Weg |
| Y5.3 | **Das erwartete Ergebnis steht dabei**, nicht nur der Klickpfad | Wer etwas anderes sieht, erkennt es sofort als Fehler |

### Y6 · Wächter

| Phase | Inhalt | Nachweis |
|---|---|---|
| Y6.1 | **Die Besetzung ist vollständig**: fehlt eine Rolle, ein Abo oder ein Zustand aus Y1–Y3, wird die Probe rot | Eintrag entfernen → rot. **Rückmutation** |
| Y6.2 | **Kein festes Datum** in der Saat | Kalenderdatum einbauen → rot |
| Y6.3 | **Kein Passwort im Repository** — erweitert den Schlüsselmuster-Wächter aus W4.2 | Passwort in der Saat → rot |
| Y6.4 | **Idempotenz**: zweimal ausführen ergibt dieselbe Besetzung | Zählung vor und nach dem zweiten Lauf gleich |

---

## 5. Reihenfolge

**Y0 → Y1 → Y3 → Y2 → Y5 → Y4 → Y6.**

> **Y0.1 steht vor allem anderen**, weil eine Saat ohne wirksame Sperre der einzige Fehler
> dieser Welle wäre, der sich nicht zurücknehmen lässt. **Y5 vor Y4**, weil erst das Regiebuch
> zeigt, was auf den getrennten Flächen überhaupt zu prüfen ist.

## 6. Woran gegengeprüft wird

| # | Frage |
|---|---|
| 1 | Kann ein Mensch sich in **jede** Rolle und **jedes** Abo tatsächlich anmelden? |
| 2 | Läuft die Saat in einer Umgebung ohne Schalter wirklich nicht? |
| 3 | Steht irgendwo ein Passwort oder ein festes Datum? |
| 4 | Ist nach zwei Läufen alles genau einmal da? |
| 5 | Bleiben die Trennungen (Arbeiter, Staff, Support) unangetastet? |

## 7. Was Welle Y **nicht** tut

- **Echte Kundendaten erzeugen.** Die Bühne ist erkennbar Bühne.
- **Die vorhandene Masse löschen.** Sie bleibt; die Besetzung kommt daneben.
- **In der Produktion laufen.** Die Sperre bleibt, und ein Wächter hält sie fest.
- **Die Trennung der Flächen aufweichen**, nur damit das Durchspielen bequemer wird.

## 8. Kreislauf und Verdrahtung

Welle Y baut keinen Kreislauf — sie macht **alle sieben begehbar**
(`V_SCHNITTSTELLEN.md`, Abschnitt 3b). Damit ist sie die Voraussetzung dafür, das Monatsaudit
aus Welle T ehrlich zu lesen: **eine Fähigkeit, die niemand durchspielen kann, ist auch im
Audit nur eine Behauptung.**

---

## 9. Wie der Owner selbst prüft — Reihenfolge, Liste, Abbruchregel

> **Owner-Frage 2026-09-27:** *„Ich prüfe das gesamte Dokument auch nochmal — kannst du mir dazu
> eine Checkliste geben, damit ich es auch gegen das Frontend prüfen kann, und wie sollte ich
> vorgehen?"*

### 9.0 Die unbequeme Antwort zuerst: das Dokument ist die falsche Reihenfolge

Das Arbeitsdokument ist nach **Wellen** geordnet (A–Z), die Oberfläche nach **Fläche und Rolle**.
Wer das Dokument von oben nach unten abklickt, öffnet dieselbe Seite vierzehnmal und übersieht
trotzdem ganze Bereiche — weil keine Welle eine Seite vollständig beschreibt und keine Seite zu
genau einer Welle gehört.

**Also umgekehrt: die Oberfläche ist der Weg, das Dokument ist die Antwortliste.** Man geht die
Flächen ab und fragt bei jedem Halt: *welche Zusage muss hier sichtbar sein?* Die Zusagen stehen
im Dokument — aber sie werden **nachgeschlagen**, nicht abgelaufen.

### 9.1 Stufe 0 — nicht klicken, vorbereiten (15 Minuten, spart Stunden)

| # | Vorbereitung | Warum sie nicht optional ist |
|---|---|---|
| 1 | **Konsole und Netzwerk-Tab offen** (F12), die ganze Zeit | Eine Seite kann vollständig aussehen und im Hintergrund in einer 401-Schleife laufen. Ohne Konsole prüft man die halbe Seite |
| 2 | **Notizblatt mit vier Spalten:** Fläche · Rolle/Abo · erwartet · gesehen | Ein Befund ohne diese vier kostet beim Nachstellen mehr Zeit als beim Beheben. Drei Wörter mehr beim Notieren sparen eine halbe Stunde |
| 3 | **Ein Blick auf die Uhr:** jedes Datum muss `Europe/Berlin` sein | Der Off-by-one-Fehler bei Datumswerten sieht wie ein Tippfehler aus und ist einer der teuersten |
| 4 | **Zwei Browser-Profile** (oder ein privates Fenster) | Rollenwechsel ohne Abmelden. Sonst verbringt man den Abend auf Anmeldeseiten |
| 5 | **Wissen, WELCHEN Baum der Browser bedient — vor dem ersten Klick** | **Gemessen am laufenden Container 2026-10-01:** nginx bindet `…\12_tempconnect_docker(D)\frontend` ein, also das **Haupt-Repo** — `docker-compose.yml` schreibt `./frontend` relativ zu **sich selbst**, nicht zum Arbeitsbaum, in dem gerade gebaut wird. **Folge: was in einem Arbeitsbaum entsteht, ist im Browser nicht zu sehen, bis es im Haupt-Repo liegt.** Ohne diesen Blick prüft man einen Abend lang einen älteren Stand und meldet Befunde, die seit Tagen behoben sind — die teuerste Art, Prüfzeit zu verbrennen. **Prüfschritt:** `docker inspect tempconnect_frontend --format "{{range .Mounts}}{{.Source}} -> {{.Destination}}{{\"\\n\"}}{{end}}"`, und dann im Haupt-Repo `git log --oneline -1`: **ist der Stand, den ich prüfen will, dort drin?** *Seit der Owner-Direktive vom 2026-10-01 wird jede abgeschlossene, tor-grüne Phase mit Frontend-Wirkung automatisch ins Haupt-Repo gemergt — der Schritt sollte also meist nur bestätigen. Genau deshalb bleibt er drin: eine Zusage prüft man, man verlässt sich nicht auf sie.* |

### 9.2 Stufe 1 — die Besetzung, und sie ist heute ein **Blocker**

Gemessen am 2026-09-24 (Abschnitt 2): **eine** Organisation von 2566 hat mehr als einen Standort,
**3 von 33** Arbeitern haben Fähigkeiten, PRO hat **drei** Abos — und es gibt **keine benannte
Besetzung**, in die man sich anmelden kann.

**Damit sind drei Dinge heute grundsätzlich nicht prüfbar**, egal wie gut die Liste ist:
Abo-Sperren über alle fünf Stufen, Standort- und Rollensichtbarkeit, und die volle Wirkung des
Marktplatzes. Wer es trotzdem versucht, prüft nicht das Produkt, sondern die Lückenhaftigkeit der
Entwicklungsdaten.

> **Empfehlung: Y1 und Y5.1–Y5.3 vor dem ersten Prüfabend bauen lassen.** Das ist dieselbe Regel,
> die der Owner für die Marktführer-Empfehlungen gesetzt hat — *erst wenn die Grundlagen stimmen* —
> angewandt auf die eigene Prüfzeit. Ohne Besetzung ist ein Prüfabend kein Nachweis, sondern eine
> Stichprobe mit unbekannter Abdeckung.
>
> **Bis dahin sinnvoll prüfbar:** alles in Stufe 2 mit den eigenen bekannten Konten, Stufe 4
> vollständig (die Sperren brauchen keine Besetzung), und Stufe 5.

### 9.3 Stufe 2 — sechs Fragen je Halt (die Verdrahtungskette auf Menschenmaß)

An jeder Fläche, in dieser Reihenfolge. Die ersten fünf sind schnell, die sechste ist die wertvolle.

| # | Frage | Was ein Fehler hier bedeutet |
|---|---|---|
| 1 | Lädt sie **ohne roten Konsolenfehler**? | `TypeError`, `is not a function`, 401-Schleife — die Seite ist gebrochen, auch wenn sie aussieht wie fertig |
| 2 | Stehen **echte** Daten drin — keine Platzhalter, keine Striche, keine Nullen ohne Grund? | Eine Kachel, die immer „0" zeigt, ist kein Leerzustand, sondern ein toter Draht |
| 3 | Ist der **Leerzustand ehrlich**? „Noch keine Daten" — nicht Spinner für immer, nicht leere Fläche | Ein ewiger Spinner ist die schlimmste Auskunft: er verspricht, dass noch etwas kommt |
| 4 | Tut **jeder** Knopf etwas — und sagt er vorher, was er tut? | Ein toter Knopf kostet Vertrauen dauerhaft, nicht einmal |
| 5 | Führt **jeder** Verweis zum **konkreten** Ziel (Detailseite, gefilterte Liste) — nicht zur Übersicht? | Eine Benachrichtigung, die auf die Startseite führt, ist eine Sackgasse mit Umweg |
| 6 | **Nach einer Änderung: erscheint sie an allen anderen Stellen?** | Das ist die Frage, die **kein Test** abdeckt — und die Mehrzahl der Fehler dieser Woche hätte sie gefunden |

**Frage 6 im Konkreten:** eine Kraft auf „krank" setzen → verschwindet sie aus dem Marktplatz,
ändert sich die Live-Belegschaft, entsteht eine Benachrichtigung, bleibt der Stundenzettel
stimmig? Genau das sind die Kreisläufe **K-1 bis K-7** (`V_SCHNITTSTELLEN.md`, Abschnitt 3b).

### 9.4 Stufe 3 — die drei Matrizen (hier liegt das Gold)

| Matrix | Vorgehen | Worauf es ankommt |
|---|---|---|
| **A · Rollen** | Dieselbe Seite als Arbeiter · Zeitarbeitsfirma · Unternehmen · Staff · Owner | **Nicht was sichtbar ist, sondern was NICHT.** Eine Kachel, die einer falschen Rolle erscheint, ist ein Sicherheitsbefund, kein Schönheitsfehler |
| **B · Abos** | Dieselbe Fähigkeit in DEMO · BASIS · PLUS · PRO · INDIVIDUELL | Jede Sperre muss einen **konkreten** Aufstiegspfad nennen. „Nicht verfügbar" ohne Ziel ist eine verlorene Verkaufsgelegenheit an der Stelle, an der der Kunde gerade zahlen wollte |
| **C · Richtungen** | Jede Sache aus **beiden** Richtungen: was die Zeitarbeitsfirma sendet, muss das Unternehmen sehen — und umgekehrt | Einseitig geprüfte Wege sind der häufigste Fund: die sendende Hälfte ist fast immer fertig, die empfangende nicht |

### 9.5 Stufe 4 — absichtlich falsch klicken (findet man nur von Hand)

| # | Versuch | Erwartung |
|---|---|---|
| 1 | Aus der Kundenplattform einen Weg ins **Staff CC**, **OCC**, **Support Center** oder **Einsatzportal** suchen | **Es gibt keinen.** Kein Menüpunkt, keine Kachel, kein Link, keine erratene Adresse |
| 2 | Mit einem **Arbeiterkonto** eine Plattformseite aufrufen; mit einem **Firmenkonto** das Portal | Beides abgewiesen — und zwar mit einer Auskunft, nicht mit einem Absturz |
| 3 | In der Adresszeile eine **fremde Kennung** einsetzen (andere Organisation, anderer Einsatz) | **403.** Niemals 200 mit fremden Daten, niemals eine leere Seite, die wie „nichts da" aussieht |
| 4 | Eine Aktion **ohne Begründung** absenden, wo eine Begründung Pflicht ist | Abgewiesen, mit klarem Hinweis — nicht stillschweigend gespeichert |
| 5 | **Zurück-Knopf und Neuladen** mitten in einem mehrstufigen Vorgang | Kein doppelter Datensatz, kein halber Zustand |

### 9.6 Stufe 5 — die Zusagen, die verkaufen

Nicht Technik, sondern Marktposition: die **drei gesetzlichen Fristen** als Kaufgrund, die
Lebendigkeit der Fläche (Live-Überwachung aktiver Einsätze auf **beiden** Seiten), der Tonfall der
Texte, und dass kein Platzhalter mehr sichtbar ist. Wer hier etwas findet, findet es vor dem
ersten Pilotkunden — und genau dafür ist die Bühne da.

### 9.7 Die 82 Kundenseiten in 9 begehbaren Gruppen

Eine Liste von 82 Seiten wird nicht abgearbeitet, neun Gruppen schon. Je Gruppe **ein** Durchgang
mit den sechs Fragen, dann Matrix A für die Gruppe.

| Gruppe | Flächen (Auswahl) | Kreislauf |
|---|---|---|
| 1 · **Eintritt & Konto** | `onboarding`, `pricing`, `org-invite`, `organization`, `mitarbeiter`, `sso_config`, `credits` | — |
| 2 · **Bedarf** | `marketplace_demand_list/_detail/_create`, `demand_create`, `requisitions`, `requisition_create`, `matching_results`, `capacity_search` | K-1 |
| 3 · **Angebot** | `capacity_exchange*` (7 Seiten), `angebote_verwalten`, `offer_detail`, `schaufenster` | K-1 |
| 4 · **Deal & Verbindlichkeit** | `deal_management`, `request_detail`, `company_requests`, `approvals`, `agency_inbox` | K-3 |
| 5 · **Einsatz & Live** | `company-live-workforce`, `monatsplan`, `notdienst_leitstand`, `app_notdienst` | K-4 |
| 6 · **Zeit & Geld** | `timesheets`, `company-timesheets`, `worker-timesheet`, `worker-submissions-review`, `spend-analytics`, `rate-cards`, `sla_abo`, `bounties` | K-2 |
| 7 · **Einsatzportal** | die acht `einsatzportal-*`-Seiten, `worker-portal`, `worker-login`, `worker-profile-public` | K-5 |
| 8 · **Lieferanten & Nachweise** | `vendor_pool`, `supplier_scorecard`, `compliance_overview`, `documents-center`, `sla_nachweise`, `sla_profil` | K-6 |
| 9 · **Getrennte Flächen** | `admin_panel`, `internal_control_center`, `executive_dashboard`, `system-health`, `data-governance` | K-7 |

### 9.8 Abbruchregel und Zeitökonomie

> **Mehr als drei Befunde auf einer Fläche: aufhören, notieren, weitergehen.** Eine Fläche mit
> vier Befunden ist nicht „schlecht geprüft", sie ist **unfertig** — sie gehört zurück in die
> Bauliste, nicht weiter unter die Lupe. Sonst wird die Liste ein Haufen, und ein Haufen wird
> nicht abgearbeitet.

**Und was der Owner NICHT prüfen sollte, weil ein Tor es beweist:** Rollen-403 an der
Schnittstelle, SQL-Form, Migrationsreihenfolge, Rechenwege, Mandantengrenzen im Backend. Dort ist
Handarbeit reine Doppelung. **Unersetzlich ist die Hand nur, wo kein Test hinkommt:** sichtbare
Wahrheit, Verdrahtung über Seitengrenzen, Rollen-**Un**sichtbarkeit, ehrliche Leerzustände,
Rechtstexte, Tonfall — und Frage 6.
