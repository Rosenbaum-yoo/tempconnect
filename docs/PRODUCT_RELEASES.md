# Produkt-Updates / „What’s New“ (Release Notes)

TempConnect nutzt dafür **eigene Tabellen** und **eigene API-Endpunkte** — getrennt von den transaktionalen `notifications` (Glocke), damit Release-Kommunikation nicht mit operativen Alerts vermischt wird.

## Datenmodell

- **`product_release_entries`** — ein Release-Hinweis (Titel, Kurz-, Langtext, optional `feature_key`, Zielgruppe, Plan, Feature-Gate, Sichtbarkeit, Status, Priorität, Modal/E-Mail-Flags).
- **`user_product_release_ack`** — pro Nutzer: `seen_at`, `modal_dismissed_at` (kein separates „Newsletter“-Opt-in; E-Mail nur explizit beim Publish oder manuell).

Migration: `sql/migrations/063_product_release_notes.sql`.

## Zielgruppen (`audiences`)

Leeres Array = **alle Rollen**. Sonst **ODER**-Semantik über Tokens:

| Token           | Bedeutung                          |
|----------------|-------------------------------------|
| `worker`       | `users.role = worker`               |
| `agency`       | `users.role = agency`               |
| `company`      | `users.role = company`              |
| `admin`        | `users.role = admin`                |
| `supplier_user`| primäre Org-Rolle `supplier_user`   |

## Plan & Feature-Gate

- **`min_plan`**: Nutzer-Plan muss mindestens diese Stufe haben (DEMO &lt; BASIS &lt; PLUS &lt; PRO &lt; INDIVIDUELL). Seit 2026-10-01 laeuft jeder Wert ueber `normalizePlanKey` (ENTERPRISE → INDIVIDUELL); vorher hatte INDIVIDUELL Rang 0 und Kunden im hoechsten Tarif sahen Mitteilungen „ab PLUS“ nie.
- **`required_feature_key`**: Eintrag nur sichtbar, wenn `hasFeature(plan, key)` aus `planFeatures.js` true ist (gleiche Logik wie Feature-Gate-Middleware).

## Intern vs. öffentlich

- **`visibility: public`** — normale Kunden, sofern Zielgruppe/Plan/Feature passen.
- **`visibility: internal`** — nur wenn Nutzer **Plattform-Admin** (`users.role = admin`) oder **`platform_admin`** in einer aktiven Org-Mitgliedschaft ist.
- **`status: draft`** — nur für interne Viewer sichtbar (QA / Freigabe).

## API (Auszug)

| Methode | Pfad | Zweck |
|--------|------|--------|
| GET | `/api/product-releases` | Changelog für angemeldeten Nutzer (`?in_app_only=true` für Badge/Strip) |
| GET | `/api/product-releases/inbox` | `unseen_count`, `preview`, optional `modal` |
| POST | `/api/product-releases/mark-all-seen` | Alle sichtbaren Einträge als gelesen |
| POST | `/api/product-releases/:id/ack` | `{ "action": "seen" \| "modal_dismiss" }` |
| POST | `/api/product-releases/abmelden` | `{ u, t }` — Produkt-Mails abbestellen aus dem Link in der Mail; **ohne Anmeldung**, Berechtigung ist die Signatur |

**Pflege — seit W-E10 (2026-10-01) im Staff Control Center**, nicht mehr unter `/api/admin/`
(bis zum Fix `9c4af72` konnte jeder Kunden-Admin dort Mitteilungen an alle Nutzer anlegen und mailen):

| Methode | Pfad (`/staff/api`) | Zweck | Wache |
|--------|------|--------|-------|
| GET | `/produkt-updates` | alle Einträge mit dem Stand ihres Versands (`versand`: „312 von 1.240“, `stockt`, `fertig`), Paketgröße, ob ein Versandweg verbunden ist | Staff |
| POST | `/produkt-updates` | Anlegen — **immer als Entwurf** | Staff + Step-up |
| PATCH | `/produkt-updates/:id` | Ändern; bei veröffentlichten nur mit Bestätigung und Grund; Zurückziehen (`status: draft`), nie Veröffentlichen | Staff + Step-up |
| GET | `/produkt-updates/:id/empfaenger` | Empfängerzahl vor dem Klick: Zielgruppe, abbestellt, gingen raus, Pakete, Dauer | Staff |
| POST | `/produkt-updates/:id/veroeffentlichen` | Veröffentlichen; Mail, wenn `send_email_on_publish` | Step-up HOCH + Grund |
| POST | `/produkt-updates/:id/mailen` | Versand **starten**: Empfängerliste einfrieren + Protokoll in einer Transaktion, erstes Paket sofort (zweiter Start `409 SCHON_GEMAILT`) | Step-up HOCH + Grund |
| GET | `/produkt-updates/:id/versand` | Stand eines Versands | Staff |
| POST | `/produkt-updates/:id/paket` | **Handkurbel**: nächstes Paket jetzt (wenn der Takt stockt, etwa ohne Redis) | Step-up |
| POST | `/produkt-updates/:id/versand-anhalten` | den Rest anhalten — offene Empfänger entfallen endgültig | Step-up + Grund |
| POST | `/produkt-updates/:id/loeschen` | Löschen | Step-up + Grund |

## Frontend

- Topbar-Link **„Was ist neu“** (`pageShell.js`) + dezentes Badge (`productUpdates.js`).
- Seite **`/public/whats-new.html`** — Changelog; beim Laden `mark-all-seen`.
- Optional **Modal** für große Releases (`show_as_modal`, einmal pro Browser-Session bis zur Dismiss-Aktion).
- **Enterprise-Übersicht**: Streifen `tc-release-strip-host` bei ungelesenen In-App-Einträgen.
- **Pflege**: Staff Control Center, Modul „Produkt-Updates“ (`frontend/src/staff/modules/produkt-updates`).
- **Abmelden**: `/public/abmelden.html?u=…&t=…` — aus dem Link in jeder Mail, bewusst ohne Navigation.

## E-Mail — Versand in Paketen (Owner-Entscheid 2026-10-01)

- Nur bei **`send_email_on_publish`** beim **Veröffentlichen** oder über **`/mailen`** mit Bestätigung und Grund.
- **Abmeldelink in jeder Mail** (§ 7 Abs. 3 UWG): HMAC-SHA256 über die Nutzerkennung, zweckgebunden
  (`produkt-updates-abmelden:v1`), Schlüssel aus `JWT_SECRET`. **Ohne Schlüssel wird nicht gemailt.**
  Abbestellt wird in `notification_preferences` (Kategorie `product_updates`, `channel_email = FALSE`);
  der In-App-Schalter bleibt unberührt. Ohne Eintrag gilt: angemeldet.
- **`List-Unsubscribe`-Kopf** (RFC 2369) in jeder Mail, mit demselben Link — die Mailprogramme zeigen
  dafür einen eigenen „Abbestellen“-Knopf. `sendMail` lässt genau diese eine Kopfzeile durch
  (`mailKoepfe`, einzeilig). **Nicht** gebaut: `List-Unsubscribe-Post` (RFC 8058, Abbestellen mit
  einem Klick direkt im Postfach) — der Postfach-Anbieter schickt dabei einen POST ohne CSRF-Marke,
  und eine CSRF-Ausnahme ist eine **Owner-Entscheidung**. Pflicht wird das erst bei Massenversand an
  Gmail/Yahoo (über 5.000 Mails am Tag).

**Wer bekommt sie.** `productReleaseService.ermittleEmpfaenger` — dieselbe Ermittlung für die Zahl vor
dem Klick und für den Versand. **Eine Abfrage je 1.000 Nutzer** (`EMPFAENGER_SQL`, seitenweise über
die Kennung, ohne Obergrenze) statt vorher etwa sieben je Nutzer über `getUserAndPlan` (das dabei
fällige Kündigungen *schrieb* — ein Blick auf die Empfängerzahl veränderte Abos). Entschieden wird mit
denselben reinen Funktionen wie überall: `effektiverPlan` und `kuendigungFaellig` (beide in
`userService.js`, von `getUserAndPlan` mitbenutzt) und `entryVisibleForUser`. Nicht angeschrieben:
Demo-Konten, anonymisierte Konten (`ANONYM_DOMAIN`), inaktive und Konten ohne Adresse.

**Wie es rausgeht** (`services/produktUpdateVersandService.js`, Migration 227):

| Schritt | Was passiert | Worauf die Zusage steht |
|---|---|---|
| Start | Empfängerliste **einmal** einfrieren (`product_release_mail_empfaenger`), Staff-Protokoll in derselben Transaktion | bedingtes `UPDATE … WHERE email_sent_at IS NULL` — von zwei Klicks gewinnt einer |
| Pakete | **20 je Minute** (Takt `produkt-update-pakete`, gleich der Drosselung im Mail-Arbeiter); das erste Paket sofort | Primärschlüssel `(release_id, user_id)`; beansprucht wird nur aus `offen` |
| Widerspruch | wer zwischen Start und seinem Paket abbestellt, bekommt nichts (`entfallen`, `abgemeldet`) | Prüfung beim Versand, nicht nur beim Einfrieren |
| Fehlschlag | vom Mailserver abgelehnt → im nächsten Paket erneut, nach 3 Versuchen `fehlgeschlagen` | — |
| Absturz | wer `in_arbeit` hängen bleibt, wird **nicht** erneut beschickt (nach 15 Minuten „unklar“) | höchstens einmal statt doppelt |
| ohne Versandweg | alles bleibt offen, der Takt meldet `fehler` (Herzschlag im Staff CC) | — |
| stockt | kein Paket seit 5 Minuten → Anzeige „stockt“ + Knopf **Nächstes Paket** | Handkurbel = derselbe Ablauf |
| Anhalten | der Rest entfällt endgültig, mit Grund im Protokoll | wirkt nur auf `offen` |
| Zurückziehen | ein laufender Versand ruht, solange die Mitteilung Entwurf ist | Takt sendet nur Veröffentlichtes |

Gespeichert wird **keine** E-Mail-Adresse — die Adresse wird beim Versand aus `users` gelesen. Alte
Mitteilungen, die vor dem Paketversand gemailt wurden, zeigen „gesendet am …“ ohne erfundene Zahlen.

**Versandprotokoll (`mail_versand`, M1.3) — am 2026-10-01 erst wirksam geworden.** Die Einfüge-Abfrage
scheiterte bis dahin bei JEDEM Aufruf an PostgreSQL (`$5 IS NULL` ohne Typ) und der Fehler wurde als
Warnung geschluckt: die Tabelle war leer, seit es sie gibt. Gemessen am laufenden System, behoben mit
expliziten Typen; die Zeile `produkt-update` erschien danach mit 63 von 63 zugestellt.

## Tests

```bash
node --test --test-force-exit api/test/productReleaseService.test.js
node --test --test-force-exit api/test/produktUpdatesNurPlattform.test.js
node --test --test-force-exit api/test/produktUpdateAbmeldung.test.js
node --test api/test/produktUpdateVersand.test.js        # Paketversand, 51 Proben (ohne --test-force-exit zaehlt der Bericht vollstaendig)
DATABASE_URL=… node --test api/test/integration/produktUpdateEmpfaenger.flow.test.js   # gegen die echte Datenbank
```
