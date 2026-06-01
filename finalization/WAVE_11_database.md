# WAVE_11 — Datenbank, Migrationen und Datenqualität

> **Phase:** Infra. **Prio:** P0/P1. **Voraussetzung:** WAVE_00 (Baseline).
> **Ausführungsagent:** Backend — Owner-Freigabe erforderlich

---

## Ziel

Datenbasis ist reproduzierbar, upgradefähig und sicher. Fresh-Install funktioniert, Upgrade-Install funktioniert.

---

## Aufgaben

### 1. Migrationsnummerierung und Reihenfolge

- Migrationen in `sql/migrations/` durchnummeriert
- Doppelte Nummern dokumentieren und risikoarm bereinigen
- Reihenfolge deterministisch

### 2. Fresh DB von 0

- Neue DB → alle Migrationen laufen → kein Error
- Seed-Daten optional, klar getrennt von Demo-Daten

### 3. Upgrade-Pfad

- Bestehende DB (Prod-Stand) → neue Migrationen laufen → kein Datenverlust
- Idempotente Backfills (wiederholtes Ausführen = identisches Ergebnis)

### 4. Demo-/Seed-Daten von Production trennen

- Demo-Daten enthalten KEINE privaten Echtwerte
- Demo-Daten sind als Demo markiert (Flag in Tabelle)
- Demo-Daten verfälschen keine KPIs in Production

### 5. Constraints, Foreign Keys, Indizes

Für Kernrelationen prüfen:
- Foreign Keys aktiv (nicht nur logisch)
- NOT NULL wo fachlich nötig
- UNIQUE-Constraints wo fachlich nötig
- Indizes auf häufig gequerten Spalten (Org-ID, Status, Datum)

### 6. Soft Deletes und Archivierung

- Konsistent (entweder alle Domänen soft-delete ODER alle hard-delete, kein Mix)
- `deleted_at` mit Index für effiziente Filter
- Archivierte Daten erscheinen nicht in normalen Queries (Default-Filter)

### 7. Backfills

- Idempotent
- Mit Rollback-Strategie
- Performance-getestet auf realistischer Datenmenge

### 8. Backup-/Restore-Test

- Dokumentierter Restore-Vorgang
- Mindestens ein Test-Restore in Staging
- RPO / RTO dokumentiert

---

## Akzeptanzkriterien

- [ ] Fresh install funktioniert (CI-Test)
- [ ] Upgrade install funktioniert (Test mit Prod-Snapshot)
- [ ] Demo-Daten enthalten keine privaten Echtwerte
- [ ] Backup ist testweise wiederherstellbar
- [ ] Kritische Tabellen haben sinnvolle Constraints und Indizes
- [ ] Soft-Delete konsistent (Strategie dokumentiert)
- [ ] Backfills idempotent

---

## Stop-Regeln

- Migration ohne Rollback-Strategie → STOP
- Migration löscht Daten ohne Backup-Voraussetzung → STOP, P0
- Fresh-Install scheitert → STOP, fixen vor anderen Wellen

---

## Betroffene Dateien

- `sql/migrations/*`
- `api/db/...` oder Äquivalent (DB-Client)
- CI-Job für Migration-Tests
