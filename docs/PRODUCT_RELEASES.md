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

- **`min_plan`**: Nutzer-Plan muss mindestens diese Stufe haben (DEMO &lt; BASIS &lt; PLUS &lt; PRO &lt; ENTERPRISE).
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
| GET | `/api/admin/product-releases` | Admin: alle Einträge |
| POST | `/api/admin/product-releases` | Anlegen |
| PATCH | `/api/admin/product-releases/:id` | Aktualisieren |
| POST | `/api/admin/product-releases/:id/publish` | Veröffentlichen; optional E-Mail wenn `send_email_on_publish` |
| POST | `/api/admin/product-releases/:id/send-email` | `{ "confirm": true }` — manueller Versand (Cap pro Lauf) |
| DELETE | `/api/admin/product-releases/:id` | Löschen |

## Frontend

- Topbar-Link **„Was ist neu“** (`pageShell.js`) + dezentes Badge (`productUpdates.js`).
- Seite **`/public/whats-new.html`** — Changelog; beim Laden `mark-all-seen`.
- Optional **Modal** für große Releases (`show_as_modal`, einmal pro Browser-Session bis zur Dismiss-Aktion).
- **Enterprise-Übersicht**: Streifen `tc-release-strip-host` bei ungelesenen In-App-Einträgen.
- **Admin**: Tab „Produkt-Updates“ im Admin-Panel.

## E-Mail

- Nur bei **`send_email_on_publish`** beim **Publish** oder explizit **`send-email`** mit Bestätigung.
- Versand nutzt die bestehende **`sendMail`‑Transport**‑Schicht; Demo-Adressen werden wie üblich unterdrückt.
- Pro Lauf **Cap** (siehe `dispatchReleaseEmails` im Service), um Massenversand zu begrenzen.

## Tests

```bash
node --test --test-force-exit api/test/productReleaseService.test.js
```
