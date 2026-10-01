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
| GET | `/produkt-updates` | alle Einträge, Mail-Obergrenze, ob ein Versandweg verbunden ist | Staff |
| POST | `/produkt-updates` | Anlegen — **immer als Entwurf** | Staff + Step-up |
| PATCH | `/produkt-updates/:id` | Ändern; bei veröffentlichten nur mit Bestätigung und Grund; Zurückziehen (`status: draft`), nie Veröffentlichen | Staff + Step-up |
| GET | `/produkt-updates/:id/empfaenger` | Empfängerzahl vor dem Klick: Zielgruppe, abbestellt, gingen raus, über der Obergrenze | Staff |
| POST | `/produkt-updates/:id/veroeffentlichen` | Veröffentlichen; Mail, wenn `send_email_on_publish` | Step-up HOCH + Grund |
| POST | `/produkt-updates/:id/mailen` | einmaliger Versand (zweiter Versand `409 SCHON_GEMAILT`) | Step-up HOCH + Grund |
| POST | `/produkt-updates/:id/loeschen` | Löschen | Step-up + Grund |

## Frontend

- Topbar-Link **„Was ist neu“** (`pageShell.js`) + dezentes Badge (`productUpdates.js`).
- Seite **`/public/whats-new.html`** — Changelog; beim Laden `mark-all-seen`.
- Optional **Modal** für große Releases (`show_as_modal`, einmal pro Browser-Session bis zur Dismiss-Aktion).
- **Enterprise-Übersicht**: Streifen `tc-release-strip-host` bei ungelesenen In-App-Einträgen.
- **Pflege**: Staff Control Center, Modul „Produkt-Updates“ (`frontend/src/staff/modules/produkt-updates`).
- **Abmelden**: `/public/abmelden.html?u=…&t=…` — aus dem Link in jeder Mail, bewusst ohne Navigation.

## E-Mail

- Nur bei **`send_email_on_publish`** beim **Veröffentlichen** oder über **`/mailen`** mit Bestätigung und Grund.
- Versand über die bestehende **`sendMail`**-Schicht, Zweck `produkt-update` im Mailprotokoll; Demo-Adressen werden wie üblich unterdrückt.
- **Abmeldelink in jeder Mail** (§ 7 Abs. 3 UWG, Owner-Entscheid 2026-10-01): HMAC-SHA256 über die
  Nutzerkennung, zweckgebunden (`produkt-updates-abmelden:v1`), Schlüssel aus `JWT_SECRET`. **Ohne
  Schlüssel wird nicht gemailt.** Abbestellt wird in `notification_preferences` (Kategorie
  `product_updates`, `channel_email = FALSE`); der In-App-Schalter bleibt unberührt. Ohne Eintrag gilt:
  angemeldet.
- Vorschau und Versand ermitteln die Empfänger mit **derselben** Funktion (`ermittleEmpfaenger`) — die
  Zahl im Dialog ist die Zahl, die rausgeht.
- Pro Lauf **Obergrenze 400** (`EMAIL_BATCH_CAP`); die Empfänger werden noch einzeln geladen (bis 5000
  Abfragen). **Offen (Owner-Entscheid):** Versand in Paketen über die Warteschlange, Empfänger in einer
  Abfrage, Versandprotokoll je Empfänger — **vor etwa 50 Kunden**. Ein `List-Unsubscribe`-Kopf fehlt,
  weil `sendMail` keine Kopfzeilen kennt; er kommt mit derselben Welle.

## Tests

```bash
node --test --test-force-exit api/test/productReleaseService.test.js
node --test --test-force-exit api/test/produktUpdatesNurPlattform.test.js
node --test --test-force-exit api/test/produktUpdateAbmeldung.test.js
```
