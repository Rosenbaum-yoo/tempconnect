# Track E — Database, Migration & Hetzner Readiness

> PostgreSQL-/Migrations-/Hetzner-/SCC-Betriebsreife auf 99% Enterprise Readiness. 120+ Migrationen, Fresh-DB-Proof, Backup/Restore, SCC Database Operations — ohne gefährliche DB-Konsole.

---

## Leitprinzipien (nicht verhandelbar)

```text
Kein produktiver Blindflug: keine Production-DB ohne bewiesenen Fresh-DB-Proof + Backup + Restore-Test.
Keine gefährliche DB-Konsole im SCC: keine freie SQL, kein DROP/TRUNCATE/DELETE als Schnellaktion, keine Secrets im Frontend.
Bestehende Strukturen schützen: Migrationen nicht blind löschen/umsortieren.
Keine Fake-Fertigmeldung: keine grünen SCC-Anzeigen ohne echten Check.
Minimal-invasiv, additiv, betriebsbereit.
```

**Das wichtigste Gate:** `empty database → run all migrations → app starts → smoke tests pass`

---

## Erlaubt vs. Verboten im SCC (Database Operations)

| Erlaubt | Verboten |
|---|---|
| DB-Status anzeigen | Freie SQL-Ausführung im Browser |
| Migration-Status anzeigen | DROP/TRUNCATE/DELETE als Schnellaktion |
| Dry-Run-Jobs starten | Production-Restore ohne Schutz |
| Backup-Jobs starten | Migration One-Click ohne Backup + Freigabe |
| Restore-Test auf Staging | DB-Secrets/Connection Strings anzeigen |
| Migration-Report erzeugen | Produktive Aktionen ohne Audit |
| Pending/Failed Migrations anzeigen | Hetzner-/DB-Token im Frontend |
| Healthchecks auslösen | Root-Shell |
| Owner-Freigabe für Prod-Migration | |
| Auditlog anzeigen | |

---

## Hosting-Optionen (Entscheidung in DB-Phase Hosting)

**Option A — Self-managed PostgreSQL auf Hetzner:** volle Kontrolle, günstig, nah an Infrastruktur. Risiko: eigener Betrieb/Backup/Updates/Restore/Security.

**Option B — Managed PostgreSQL:** weniger Betriebsaufwand, oft bessere PITR. Risiko: Anbieterabhängigkeit, Kosten, Datenschutz-/Standortprüfung.

→ Entscheidungsdokument `docs/deployment/database_hosting_decision.md` mit Empfehlung pro Kundenstufe.

---

## DB-PHASE A — Migrationsinventur

**Ziel:** Alle 120+ Migrationen inventarisiert, sortiert, bewertet.

**Aufgaben:** Prüfe Anzahl, Dateinamen, Reihenfolge, Nummerierung, doppelte/fehlende Nummern, inkonsistente Benennung, SQL-Syntax, irreversible Operationen (DROP, TRUNCATE, ALTER TYPE, DROP COLUMN, CREATE INDEX ohne IF NOT EXISTS, CREATE TABLE ohne Schutz, CREATE EXTENSION), Foreign Keys, Enum-Änderungen, Seed-/Testdaten-Abhängigkeiten.

**Ergebnisdatei:** `docs/deployment/migration_inventory.md`
```
| Nr. | Datei | Zweck | Risiko | Irreversibel | Abhängigkeiten | Status | Empfehlung |
```

**Risikostufen:** low / medium / high / critical. Critical = Datenverlust möglich, läuft nicht auf leerer DB, nur mit manueller Vorbedingung, bricht App-Start, unsichere Seed-Abhängigkeit, kaputte Foreign Keys.

**Befehle:**
```bash
ls sql/migrations/ | sort
rg "DROP|TRUNCATE|ALTER TYPE|DROP COLUMN" sql/migrations/
rg "CREATE (INDEX|TABLE)" sql/migrations/ | rg -v "IF NOT EXISTS"
```

**Acceptance:** Inventory mit Datei-/Codebezug, alle Critical-Risiken markiert, keine Codeänderung.

---

## DB-PHASE B — Fresh-Database-Proof

**Ziel:** Beweise dass TempConnect von 0 auf lauffähige DB kommt.

**Aufgaben:** Reproduzierbaren Befehl finalisieren:
```bash
npm run db:reset:fresh
npm run db:migrate
npm run db:verify
npm run smoke
```
(Falls Commands anders heißen: vorhandene nutzen + dokumentieren.)

**Prüfen:** frische DB, alle Migrationen, Schema, Extensions, App-Start, Healthcheck, API-Smoke, Frontend-Smoke, Login/Session, Staff/SCC-Zugriff, zentrale Plattformbereiche.

**Ergebnisdatei:** `docs/deployment/fresh_database_proof.md` (Datum, Umgebung, Commands, Ergebnis Migrationen/App-Start/Smoke, Fehler, Blocker, Empfehlung).

**Acceptance:** Empty DB → alle Migrationen → App startet → Smoke grün, dokumentiert. **Das ist das härteste Gate.**

---

## DB-PHASE C — Migration-Hardening

**Ziel:** Migrationen robust und reproduzierbar.

**Anforderungen:** Reihenfolge deterministisch, idempotente Patterns wo sinnvoll (`IF NOT EXISTS`), aber **keine blinde Idempotenz** (kein stilles Überspringen, das Schema-Drift maskiert). Irreversible Operationen markiert + abgesichert. Doppelte Nummern bereinigt (dokumentiert).

**Keine blinde Idempotenz:** `IF NOT EXISTS` nur wo es fachlich korrekt ist. Eine Migration, die fälschlich übersprungen wird, ist gefährlicher als eine, die ehrlich fehlschlägt.

**Migration Report:** `docs/deployment/migration_hardening_report.md`.

**Acceptance:** Migrationen laufen reproduzierbar fresh + upgrade, irreversible markiert, Report vorhanden.

---

## DB-PHASE D — Staging/Production-Trennung

**Ziel:** Saubere Umgebungstrennung.

**Umgebungen:** local, staging, production — klar getrennt.

**Environment Variables:**
```env
DATABASE_URL=
DATABASE_SSL=
DB_ENV=staging|production
MIGRATION_REQUIRE_OWNER_APPROVAL=true   # für production
```

**Regeln:** Keine Prod-DB-Credentials in staging. Migration auf production nur mit Owner-Freigabe. Staging spiegelt production-Schema.

**Acceptance:** Umgebungen getrennt, Prod-Migration erfordert Freigabe, keine Credential-Vermischung.

---

## DB-PHASE E — Hetzner DB Setup

**Ziel:** Self-managed Hetzner PostgreSQL dokumentiert.

**Aufgaben:** PostgreSQL auf Hetzner, Firewall (nur App → DB), SSL, Backups (pg_dump/logical), Redis separat oder intern.

**Größenempfehlung nach Kundentyp:**
- Kleine Betriebe: kleine Instanz, tägliches Backup
- Mittlere Betriebe: mittlere Instanz, häufigere Backups, Monitoring
- Große/Enterprise: größere Instanz, PITR-Bewertung, strenge Backup-Retention

**Ergebnisdatei:** `docs/deployment/hetzner_postgres_setup.md`.

**Acceptance:** Setup dokumentiert, Firewall-Regeln klar, Backup-Mechanik definiert.

> **Querverweis:** Phase 3 Track B (Hetzner Control) + Phase 5 Phase G (Hetzner im SCC).

---

## DB-PHASE F — Managed DB Bewertung

**Ziel:** Managed-Option fair bewerten.

**Aufgaben:** Prüfen: Backup/PITR-Funktionen, Kosten, Latenz, Datenschutz/Standort, Provider-Einschränkungen.

**Ergebnis:** Eintrag in `database_hosting_decision.md` mit klarer Empfehlung pro Kundenstufe (Pilot/10/50/100/300/Enterprise).

**Acceptance:** Entscheidungsdokument vollständig mit Empfehlung.

---

## DB-PHASE G — SCC Database Operations

**Ziel:** DB-Betrieb im SCC sichtbar + kontrolliert (keine gefährliche Konsole).

**Sichtbare Informationen:** DB-Status, Migration-Status, Pending/Failed Migrations, Backup-Status, letzte Restore-Tests, Healthchecks, Connection-Count, Disk-Auslastung, langsame Queries.

**Erlaubte Aktionen (rollengestaffelt):**
- **Staff read-only:** Status anzeigen
- **Staff DevOps:** Dry-Run, Backup-Job, Restore-Test auf Staging, Migration-Report
- **Owner:** Production-Migration-Freigabe, kritische Aktionen mit Step-up + Audit

**Verbotene Aktionen:** freie SQL, DROP/TRUNCATE/DELETE, Prod-Restore ohne Schutz, Secrets anzeigen, Token im Frontend.

**Jobmodell:** Action Request Layer (analog Phase 3 Track B WAVE H2) für DB-Jobs.

**Acceptance:** SCC zeigt DB-Status, erlaubte Aktionen rollengestaffelt + auditiert, keine gefährliche Aktion möglich.

> **Querverweis:** Phase 3 Track B (Hetzner Control, Action Request Layer) ist das Muster.

---

## DB-PHASE H — Migration Control im SCC

**Ziel:** Migrationen kontrolliert über SCC.

**Migration Dashboard:** angewandte/pending/failed Migrationen, aktuelle Schema-Version, letzte Migration, Verlauf.

**Production-Migration-Ablauf:**
```
1. Backup erzwingen (automatisch vor Migration)
2. Dry-Run auf Staging
3. Owner-Freigabe
4. Migration auf Production
5. Verify
6. Audit-Eintrag
```

**Rollback/Recovery:** Rollback-Strategie pro Migration, Recovery aus Backup, dokumentiert.

**Acceptance:** Migration-Status sichtbar, Prod-Migration nur mit Backup + Owner-Freigabe, Rollback dokumentiert.

---

## DB-PHASE I — Backup, Restore, RPO/RTO

**Ziel:** Wiederherstellbarkeit beweisen.

**Backup-Typen:** logical (pg_dump), ggf. PITR (Enterprise).

**SCC Anzeige:** letzte Backups, Backup-Status, Größe, Retention, letzter Restore-Test.

**Restore-Test:** mindestens einmal auf Staging durchgeführt (nicht nur dokumentiert).

**RPO/RTO nach Kundentyp:**
- Kleine Betriebe: tägliches Backup, RPO 24h, RTO einige Stunden
- Mittlere Betriebe: häufigere Backups, niedrigeres RPO
- Große/Enterprise: PITR-Bewertung, striktes RPO/RTO

**Ergebnisdatei:** `docs/deployment/database_backup_restore.md`.

**Acceptance:** Backup funktioniert, Restore getestet (durchgeführt), RPO/RTO dokumentiert pro Stufe.

---

## DB-PHASE J — Security und Zugriff

**Ziel:** DB-Zugriff enterprise-sicher.

**DB-Zugriff:** SSL erzwungen, IP-Allowlist, kein öffentlicher Zugang, Secrets nur in Env/Secret Manager, Rotation dokumentiert.

**SCC-Zugriff:** rollengestaffelt (read-only/DevOps/Owner), kritische Aktionen mit Step-up.

**Audit:** alle DB-Aktionen aus SCC auditiert (wer, was, wann, warum), immutable.

**Acceptance:** DB nicht öffentlich erreichbar, SSL aktiv, SCC-Zugriff rollengestaffelt, Audit vollständig.

> **Querverweis:** Phase 1 WAVE_06 (Security) + Phase 3 (SCC Security).

---

## DB-PHASE K — Monitoring und Performance

**Ziel:** DB im Betrieb beobachtbar.

**Monitoring:** Connection-Count, Disk, langsame Queries, Replikationsstatus (falls vorhanden), Backup-Erfolg.

**Performance Checks:** Indizes auf häufig gequerten Spalten (org_id, status, datum), N+1-Queries finden, langsame Endpoints, Query-Baseline.

**Skalierung:** Connection-Pool-Größen, Read-Replica-Bewertung (Enterprise), Caching-Bedarf.

**Acceptance:** DB-Monitoring im SCC sichtbar, Indizes geprüft, Performance-Baseline dokumentiert.

> **Querverweis:** Phase 5 Phase Q (Performance/Skalierung).

---

## DB-PHASE L — Tests

**Ziel:** Reproduzierbar grün oder Blocker dokumentiert.

**Pflichtchecks:**
```bash
npm run lint && npm run typecheck && npm test && npm run build
npm run db:migrate && npm run db:verify && npm run db:reset:fresh && npm run smoke
```

**Testbereiche:** Fresh DB migration, Staging migration, Migration status API, SCC DB Ops access control, Backup job, Restore test job, failed/pending migration display, no secret exposure, role restrictions, audit logs, healthcheck, migration report.

**Security Tests:** normaler Kunde sieht kein SCC DB Modul, Staff ohne DevOps darf keine Jobs starten, DevOps darf keine Prod-Migration ohne Owner-Freigabe, Secrets maskiert, fremde Org kein Zugriff, direkte API-Aufrufe geschützt.

**Acceptance:** Pflichtchecks grün oder Blocker dokumentiert, Security-Tests bestehen.

---

## DB-PHASE M — Dokumentation

**Pflichtdokumente:**
```
docs/deployment/database_hosting_decision.md
docs/deployment/migration_inventory.md
docs/deployment/fresh_database_proof.md
docs/deployment/migration_hardening_report.md
docs/deployment/hetzner_postgres_setup.md
docs/deployment/database_backup_restore.md
docs/deployment/database_runbook.md
docs/deployment/database_incident_response.md
docs/deployment/database_scc_operations.md
docs/deployment/database_enterprise_readiness_report.md
```

**Runbook (`database_runbook.md`):** Migration ausführen, Migration blockiert, Backup erstellen, Restore-Test, Production Restore vorbereiten, DB nicht erreichbar, Disk fast voll, zu viele Connections, langsame Queries, failed migration, Rollback/Recovery, Maintenance Mode, SCC-Abläufe.

**Acceptance:** alle 10 Dokumente vorhanden, Runbook deckt alle Szenarien.

---

## Kundenbasierte Gates (Database Readiness)

`docs/deployment/database_enterprise_readiness_report.md`:

**Gate Kleine Betriebe:** Fresh DB Proof grün, Migrationen laufen, Backup aktiv, Restore-Test dokumentiert, SCC zeigt DB-Status, keine offenen Critical Migration Risks, App-Smoke grün.

**Gate Mittlere Betriebe (zusätzlich):** SCC Database Operations nutzbar, Migration Dry Run auf Staging, Backup-Jobs sichtbar, Restore-Test wiederholbar, Monitoring sichtbar, Index-/Performance-Prüfung, Rollenmodell für DB-Aktionen.

**Gate Große Betriebe (zusätzlich):** Staging/Production-Prozess, Owner-Freigabe für Prod-Migration, Audit vollständig, RPO/RTO dokumentiert, Incident Runbook, Performance-Baseline, Backup-Retention, Recovery-Plan.

**Gate Enterprise-Pilot (zusätzlich):** PITR geprüft oder begründet nicht aktiv, Security Review DB-Zugriff, Secrets-Rotation-Doku, SCC keine gefährlichen Aktionen, Restore-Dry-Run erfolgreich, Migration-Report vollständig, Production-Go-live-Checklist grün.

---

## Definition of Done

Alle 120+ Migrationen inventarisiert, Fresh-DB-Proof dokumentiert, Migration-Hardening-Report, Hetzner-Postgres-Setup, Managed-vs-Self-managed-Entscheidung, Backupstrategie, Restore-Test dokumentiert, RPO/RTO dokumentiert, SCC Database Operations existiert/vorbereitet, Migration-Status im SCC, Backup-/Restore-Status im SCC, kritische Aktionen rollen-/auditgeschützt, keine freie SQL-Konsole, DB-Secrets nicht angezeigt, Tests laufen oder Blocker dokumentiert, Abnahme pro Kundenstufe bewertet, offene Blocker ehrlich benannt.

---

## Reihenfolge

```
DB-A Inventur → DB-B Fresh-Proof → DB-C Hardening → Hosting-Entscheidung →
DB-E Hetzner Setup → DB-F Managed-Bewertung → DB-I Backup/Restore →
DB-G SCC DB Ops → DB-H Migration Control → DB-K Monitoring →
DB-J Security → DB-L Tests → DB-M Doku
```

**Wichtigster erster Block:** DB-A (Inventur) → DB-B (Fresh-Proof). Ohne bewiesenen Fresh-Proof darf keine Production-DB live gehen.

> **Verhältnis zu Phase 5:** Track E ist die DB-Tiefe zu Phase 5 Phase G (Hetzner) und ergänzt Phase 1 WAVE_11 (Database). Phase 5 sieht DB aus Betriebssicht, Track E aus Migrations-/Hosting-Tiefe.
