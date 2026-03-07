# TempConnect – Datenbank-Schema

## Strategie (optimiert, keine Duplikate)

- **`init.sql`** – Wird bei **leerer** Datenbank einmalig ausgeführt (Docker: `docker-entrypoint-initdb.d`).
  - Enthält nur das **Basis-Schema**: `users` (ohne Profilfelder), `subscriptions`, `listings`, `requests`, plus Demo-Daten.
  - Keine Tabelle doppelt definieren.

- **`migrations/*.sql`** – Werden **nach** init in **alphabetischer Reihenfolge** ausgeführt (siehe `migrate.sh`).
  - **001_ratings.sql** – Tabelle `ratings` (einzige Definition).
  - **002_plan_and_payment_sessions.sql** – Plan-Migration (STARTER/PRO → BASIS/PLUS), Tabelle `payment_sessions` (einzige Definition).
  - **003_profile_legal.sql** – Spalten `contact_person`, `street`, `postal_code`, `city`, `vat_id` in `users`.
  - **004_performance_indexes.sql** – Indizes für Marktplatz-Filter (listings) und Anfragen/Deals (requests).
  - **005_users_lat_lng.sql** – Spalten `latitude`, `longitude` in `users` für Umkreissuche (Firmensitz).
  - **006_listings_geo.sql** – Spalten `postal_code`, `city`, `latitude`, `longitude` in `listings` für Umkreissuche pro Angebot.
  - **007_reports.sql** – Tabelle `reports` für Melde-Funktion (Anfrage/Nutzer melden).
  - **008_handelsregister.sql** – Spalte `handelsregister_number` in `users` für Mein Profil.

- **`_migrations`** – Wird vom Migrations-Skript angelegt; speichert, welche Migrations bereits gelaufen sind (idempotent).

## Ablauf

1. Neue DB: Container startet → `init.sql` läuft → danach `migrate.sh` (001, 002, 003).
2. Bestehende DB: Nur `migrate.sh` (init wird von PostgreSQL nicht erneut ausgeführt).

## Änderungen am Schema

- **Neue Tabelle/Spalte:** Immer als **neue** Migration (z. B. `004_mein_feature.sql`) mit `CREATE TABLE IF NOT EXISTS` bzw. `ADD COLUMN IF NOT EXISTS`.
- **init.sql** nicht erweitern – er bleibt der historische Basis-Stand; alles Weitere nur in Migrations.
