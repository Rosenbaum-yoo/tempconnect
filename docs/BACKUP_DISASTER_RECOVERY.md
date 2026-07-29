# TempConnect — Backup-Strategie & Disaster Recovery

> **Verbindliches Betriebs- und Wiederherstellungsdokument.**
> Ergänzt: `docs/BACKUP.md` (Skript-Referenz), `docs/INCIDENT_RUNBOOK.md` (Sofortmaßnahmen).

Stand: März 2026

---

## 1. Recovery-Ziele (RPO / RTO)

| Kennzahl | Ziel | Begründung |
|---|---|---|
| **RPO** (Recovery Point Objective) | **≤ 24 Stunden** (pg_dump), **≤ 5 Minuten** (PITR bei Managed DB) | Täglicher pg_dump um 02:00 UTC. Hetzner Managed PostgreSQL bietet zusätzlich WAL-basierte PITR mit ~5 min Granularität. |
| **RTO** (Recovery Time Objective) | **≤ 30 Minuten** (Single VM), **≤ 15 Minuten** (HA mit 2 VMs) | Restore-Skript läuft <5 min für typische DB-Größen (<1 GB). Hauptzeit: Diagnose + Entscheidung. |

**Realistischer Worst Case (Single VM, manueller pg_dump Restore):**
- Datenverlust: maximal 24h (seit letztem Backup)
- Ausfallzeit: 30–60 min (SSH-Login → Diagnose → Restore → Smoke-Test)

**Best Case (Managed DB mit PITR):**
- Datenverlust: <5 min
- Ausfallzeit: 15–30 min (PITR im Provider-Panel + App-Neustart)

---

## 2. Backup-Strategie

### 2a. Schichten-Modell

| Schicht | Methode | Frequenz | Retention | RPO |
|---|---|---|---|---|
| **1 — Provider-Backup** | Hetzner Managed DB Auto-Backup | Täglich (vom Provider) | 7 Tage (Provider-Default) | 24h |
| **2 — Provider PITR** | WAL-Archivierung (Hetzner Managed) | Kontinuierlich | Bis 7 Tage zurück | ~5 min |
| **3 — Eigener pg_dump** | `scripts/backup.sh` via Cron | Täglich 02:00 UTC | 30 Tage (konfigurierbar) | 24h |
| **4 — Upload-Archiv** | `scripts/backup.sh` (tar.gz) | Täglich 02:00 UTC | 30 Tage | 24h |
| **5 — Pre-Deploy Snapshot** | `scripts/prod-update.sh` (automatisch) | Vor jedem Deployment | 30 Tage | 0 (Stand vor Deploy) |

### 2b. Aufbewahrungsstrategie

| Zeitraum | Was wird aufbewahrt |
|---|---|
| 0–7 Tage | Alle täglichen Backups (7 Snapshots) |
| 7–30 Tage | Alle täglichen Backups (automatisch via Retention) |
| >30 Tage | Automatisch gelöscht. Empfehlung: 1 monatliches Backup manuell extern sichern (S3, Hetzner Storage Box) |

### 2c. Speicherorte

| Speicherort | Zweck | Risiko-Abdeckung |
|---|---|---|
| `./backups/` auf Server-Disk | Standard-Cron-Backups | Schneller Restore bei DB-Fehlern |
| Hetzner Managed DB Auto-Backup | Provider-seitige Sicherung | Server-Totalverlust, Disk-Ausfall |
| Externes Volume / Storage Box | Langzeit-Archiv (empfohlen) | Ransomware, Datacenter-Ausfall |

**Empfehlung Produktion:** `BACKUP_DIR=/mnt/backup-volume` auf separatem Hetzner Volume (nicht dieselbe Disk wie DB).

---

## 3. Datenklassifikation

### Klasse A — Geschäftskritisch (Verlust = Betriebsunterbrechung + rechtliche Konsequenzen)

| Domäne | Tabellen | Begründung |
|---|---|---|
| **Benutzer & Organisationen** | `users`, `organizations`, `org_memberships`, `subscriptions` | Plattformzugang, Abrechnungsbasis |
| **Verträge & Assignments** | `contracts`, `assignments`, `assignment_confirmations` | Rechtlich bindende Vereinbarungen |
| **Stundenzettel** | `timesheets`, `timesheet_entries`, `timesheet_templates` | Abrechnungsgrundlage, arbeitnehmerüberlassungsrechtlich relevant |
| **Rechnungen** | `invoices`, `invoice_line_items` | Buchführungspflicht, GoBD-relevant |
| **Compliance** | `compliance_documents`, `compliance_requirements` | AÜG-Nachweispflichten |
| **Audit-Trail** | `audit_log` | Nachvollziehbarkeit aller geschäftsrelevanten Aktionen |

### Klasse B — Wichtig (Verlust = Geschäftseinschränkung, wiederherstellbar)

| Domäne | Tabellen | Begründung |
|---|---|---|
| **Inserate & Kapazitäten** | `listings`, `capacities`, `capacity_exchange_entries` | Können von Nutzern neu eingestellt werden |
| **Anfragen & Angebote** | `requests`, `offers`, `deals` | Laufende Transaktionen, aber rekonstruierbar über Kommunikation |
| **Firmenprofile** | `company_profiles`, `agency_profiles` | Von Nutzern erneut pflegbar |
| **Supplier Management** | `vendor_pool_entries`, `supplier_pool_entries`, `supplier_scorecards` | Aufwändig manuell rekonstruierbar |
| **Requisitions** | `requisitions`, `requisition_items` | Bestellanforderungen, rekonstruierbar |

### Klasse C — Unkritisch (Verlust = temporäre Einschränkung, automatisch regenerierbar)

| Domäne | Tabellen | Begründung |
|---|---|---|
| **Sessions** | `session` | Nutzer loggen sich erneut ein |
| **Idempotency** | `idempotency_keys` | TTL-basiert, 24h Lebensdauer |
| **Notifications** | `notifications` | Informativ, nicht geschäftsrelevant |
| **Ratings/Reports** | `ratings`, `reports` | Ärgerlich aber nicht kritisch |
| **Search/Cache** | `search_configs`, `saved_searches` | Komfort-Feature |

---

## 4. Szenario-Risiko-Wiederherstellungs-Matrix

### Szenario 1: Versehentliches DELETE / UPDATE (Bedienfehler)

| Aspekt | Detail |
|---|---|
| **Risiko** | Mittel — kann jederzeit durch Admin oder fehlerhaften API-Call passieren |
| **Beispiel** | `DELETE FROM invoices WHERE ...` ohne WHERE-Klausel, fehlerhaftes Migrations-Script |
| **Priorität** | HOCH |
| **RPO** | PITR: <5 min / pg_dump: <24h |
| **Wiederherstellungsweg** | **Variante A (Managed DB PITR):** Im Hetzner Panel → „Restore to Point in Time" → Zeitpunkt kurz vor dem Fehler wählen → Neue DB-Instanz erstellen → Daten selektiv übernehmen. **Variante B (pg_dump):** `./scripts/restore.sh backups/DATUM --db-only` |
| **Post-Restore** | Integritätsprüfung (siehe Abschnitt 6), betroffene Nutzer informieren |

### Szenario 2: DB-Korruption / Hardware-Fehler

| Aspekt | Detail |
|---|---|
| **Risiko** | Niedrig bei Managed DB (Provider-Redundanz), höher bei Self-Hosted |
| **Beispiel** | Disk-Fehler, WAL-Korruption, PostgreSQL-Crash mit Datenverlust |
| **Priorität** | KRITISCH |
| **RPO** | Provider-Backup: <24h / PITR: <5 min |
| **Wiederherstellungsweg** | **Managed DB:** Provider-Panel → Restore aus automatischem Backup oder PITR. **Self-Hosted:** `./scripts/restore.sh backups/NEUESTES` (Voll-Restore) |
| **Post-Restore** | VACUUM ANALYZE, Tabellenzählung prüfen, Integritätschecks, Smoke-Test |

### Szenario 3: Server-Totalverlust (VM gelöscht / Datacenter-Ausfall)

| Aspekt | Detail |
|---|---|
| **Risiko** | Sehr niedrig (Hetzner SLA), aber nicht null |
| **Beispiel** | VM versehentlich gelöscht, Hetzner-Region-Ausfall |
| **Priorität** | KRITISCH |
| **RPO** | Abhängig vom externen Backup-Speicherort |
| **Wiederherstellungsweg** | 1. Neue VM aufsetzen (Hetzner CX21, Docker installieren). 2. Code deployen (Git Clone). 3. `.env.prod` aus Passwort-Manager wiederherstellen. 4. Managed DB: automatisch verfügbar (anderer Host). Self-Hosted: Backup von externem Speicher holen → `restore.sh`. 5. Uploads aus Backup einspielen. 6. SSL/Caddy konfigurieren. 7. DNS A-Record auf neue IP. |
| **Post-Restore** | Vollständiger Smoke-Test (siehe `GO_LIVE_FINAL.md`, Abschnitt A8), Monitoring reaktivieren |

### Szenario 4: Fehlgeschlagene Migration

| Aspekt | Detail |
|---|---|
| **Risiko** | Mittel — bei jedem Deployment mit Schema-Änderungen |
| **Beispiel** | Migration 047 scheitert an NOT NULL auf bestehenden Daten |
| **Priorität** | HOCH |
| **RPO** | 0 (Pre-Deploy Backup) |
| **Wiederherstellungsweg** | Pre-Deploy Backup wird automatisch vor jedem `prod-update.sh` erstellt. 1. Deploy-Logs prüfen: `docker logs tempconnect_migrate`. 2. Fehler analysieren und Migration fixen — ODER: Rollback auf Pre-Deploy-Backup: `./scripts/restore.sh backups/NEUESTES --db-only`. 3. Git revert auf letzte funktionierende Version. 4. Erneut deployen. |
| **Post-Restore** | Migrations-Tabelle prüfen: `SELECT * FROM _migrations ORDER BY id DESC LIMIT 5;` |

### Szenario 5: Ransomware / Unbefugter Zugriff

| Aspekt | Detail |
|---|---|
| **Risiko** | Niedrig (SSH-only, Firewall, keine offenen Ports), aber katastrophale Auswirkung |
| **Beispiel** | Kompromittierter SSH-Key, DB-Passwort geleakt |
| **Priorität** | KRITISCH |
| **RPO** | Externes Backup (nicht auf kompromittiertem Server) |
| **Wiederherstellungsweg** | 1. **Sofort:** Betroffene VM isolieren (Netzwerk trennen). 2. **Managed DB:** Passwort rotieren, Firewall-Rules prüfen. 3. Neue VM aufsetzen (frisch, nicht vom Backup der kompromittierten VM). 4. Alle Secrets rotieren (SESSION_SECRET, JWT_SECRET, ADMIN_SECRET, DB-Passwort, SMTP, Stripe). 5. Restore aus **externem** Backup (nicht vom Server). 6. Forensische Analyse der kompromittierten VM (offline). |
| **Post-Restore** | Alle User-Sessions invalidieren, ggf. Passwort-Reset erzwingen, DSGVO-Meldung prüfen (72h-Frist) |

---

## 5. Restore-Reihenfolge

### Voll-Restore (DB + Uploads)

```
1. Aktuelles Backup erstellen (Sicherheitsnetz)
   ./scripts/backup.sh

2. Team informieren (Downtime-Fenster)

3. API stoppen
   docker compose -f docker-compose.prod.yml stop api

4. Backup verifizieren
   ./scripts/backup-verify.sh backups/ZIEL-DATUM

5. Uploads wiederherstellen (ZUERST)
   → Dateien müssen vorhanden sein, bevor DB-Referenzen darauf zeigen

6. Datenbank wiederherstellen
   → pg_restore mit --clean --if-exists --single-transaction

7. API starten
   docker compose -f docker-compose.prod.yml up -d api

8. Post-Restore Integritätsprüfung (Abschnitt 6)

9. Smoke-Test (`GO_LIVE_FINAL.md`, Abschnitt A8)

10. Monitoring-Dashboards 30 min beobachten
```

### FK-Abhängigkeiten (Restore-Reihenfolge der Tabellen)

`pg_restore` im Custom-Format löst die Reihenfolge automatisch auf. Bei manuellem SQL-Restore diese Reihenfolge beachten:

```
Ebene 1 (keine FK-Abhängigkeiten):
  users, organizations

Ebene 2 (FK → Ebene 1):
  org_memberships, subscriptions, listings, company_profiles,
  agency_profiles, compliance_requirements

Ebene 3 (FK → Ebene 2):
  requests, capacities, requisitions, vendor_pool_entries,
  supplier_pool_entries, compliance_documents

Ebene 4 (FK → Ebene 3):
  offers, contracts, deals, capacity_exchange_entries

Ebene 5 (FK → Ebene 4):
  assignments, timesheets, invoices

Ebene 6 (FK → Ebene 5):
  timesheet_entries, invoice_line_items, assignment_confirmations

Unabhängig (jederzeit):
  audit_log, notifications, session, idempotency_keys, ratings, reports
```

---

## 6. Post-Restore Integritätsprüfung

Nach **jedem** Restore (Test oder Ernstfall) diese SQL-Checks ausführen:

### 6a. Basis-Zählung

```sql
-- Schnellcheck: Alle kritischen Tabellen haben Daten
SELECT 'users' AS tabelle, count(*) AS zeilen FROM users
UNION ALL SELECT 'organizations', count(*) FROM organizations
UNION ALL SELECT 'subscriptions', count(*) FROM subscriptions
UNION ALL SELECT 'listings', count(*) FROM listings
UNION ALL SELECT 'contracts', count(*) FROM contracts
UNION ALL SELECT 'assignments', count(*) FROM assignments
UNION ALL SELECT 'timesheets', count(*) FROM timesheets
UNION ALL SELECT 'invoices', count(*) FROM invoices
UNION ALL SELECT 'audit_log', count(*) FROM audit_log
UNION ALL SELECT '_migrations', count(*) FROM _migrations;
```

### 6b. FK-Konsistenz (verwaiste Referenzen)

```sql
-- Verwaiste Subscriptions (User gelöscht)
SELECT count(*) AS verwaiste_subscriptions
FROM subscriptions s LEFT JOIN users u ON s.user_id = u.id
WHERE u.id IS NULL;

-- Verwaiste Contracts (ohne gültige Parteien)
SELECT count(*) AS verwaiste_contracts
FROM contracts c
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = c.buyer_org_id OR u.id = c.supplier_org_id);

-- Verwaiste Timesheet-Einträge (ohne Timesheet)
SELECT count(*) AS verwaiste_ts_entries
FROM timesheet_entries te LEFT JOIN timesheets t ON te.timesheet_id = t.id
WHERE t.id IS NULL;

-- Verwaiste Invoice Line Items
SELECT count(*) AS verwaiste_inv_items
FROM invoice_line_items li LEFT JOIN invoices i ON li.invoice_id = i.id
WHERE i.id IS NULL;
```

**Erwartung:** Alle Counts = 0. Bei Werten > 0: Daten-Inkonsistenz — ggf. manuell bereinigen oder älteres Backup verwenden.

### 6c. Geschäftskritische Plausibilität

```sql
-- Rechnungen: Betrag > 0 bei allen finalen Rechnungen
SELECT count(*) AS rechnungen_ohne_betrag
FROM invoices WHERE status IN ('sent', 'paid') AND total_amount <= 0;

-- Timesheets: Keine negativen Stunden
SELECT count(*) AS negative_stunden
FROM timesheet_entries WHERE hours < 0;

-- Assignments: Alle aktiven Assignments haben gültigen Contract
SELECT count(*) AS assignments_ohne_contract
FROM assignments a LEFT JOIN contracts c ON a.contract_id = c.id
WHERE a.status = 'active' AND c.id IS NULL;

-- Migrations: Letzter Eintrag stimmt mit erwartetem Stand überein
SELECT id, name FROM _migrations ORDER BY id DESC LIMIT 5;
```

### 6d. Audit-Konsistenz

```sql
-- Audit-Log: Letzte Einträge vor dem Backup-Zeitpunkt vorhanden
SELECT max(created_at) AS letzter_audit_eintrag FROM audit_log;

-- Audit-Log: Keine Lücken >24h in den letzten 7 Tagen
SELECT date_trunc('day', created_at) AS tag, count(*)
FROM audit_log
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY tag ORDER BY tag;
```

---

## 7. PITR (Point-in-Time Recovery) — Hetzner Managed PostgreSQL

### Wann PITR nutzen (statt pg_dump-Restore)

- Versehentliches DELETE/UPDATE mit bekanntem Zeitpunkt
- Datenverlust innerhalb der letzten Stunden (besser als 24h-alter pg_dump)
- Korruption durch fehlerhaften Code-Deploy

### PITR-Ablauf (Hetzner)

```
1. Hetzner Cloud Console → Managed Databases → TempConnect DB
2. „Restore" oder „Fork" wählen
3. Zeitpunkt eingeben (z.B. "2026-03-15 14:30:00 UTC" — kurz VOR dem Fehler)
4. Hetzner erstellt eine NEUE DB-Instanz mit dem Stand dieses Zeitpunkts
5. Neue DATABASE_URL notieren
6. In .env.prod: DATABASE_URL auf neue Instanz umstellen
7. API neustarten: docker compose -f docker-compose.prod.yml restart api
8. Verifizieren: Post-Restore Integritätsprüfung (Abschnitt 6)
9. Alte DB-Instanz NICHT sofort löschen (Fallback für 48h behalten)
```

### PITR-Einschränkungen

- Nur für Managed PostgreSQL (nicht für Docker-lokale DB)
- Maximaler Rückblick: Provider-abhängig (Hetzner: typisch 7 Tage)
- Granularität: ~5 Minuten (WAL-Segmente)
- Nach PITR: Alle zwischen Restore-Zeitpunkt und jetzt geschriebenen Daten sind verloren

---

## 8. Verantwortlichkeiten

| Rolle | Aufgabe | Frequenz |
|---|---|---|
| **Ops-Verantwortlicher** | Cron-Backup prüfen (Logfile + `last_success_epoch`), Disk-Space überwachen | Wöchentlich |
| **Ops-Verantwortlicher** | Restore-Test durchführen (`scripts/restore-test.sh`) | Monatlich (mind. 1× vor Go-Live) |
| **Ops-Verantwortlicher** | Managed-DB-Backup-Status im Provider-Panel prüfen | Monatlich |
| **Tech Lead** | Backup-Strategie reviewen bei Architektur-Änderungen | Bei Bedarf |
| **Tech Lead** | DR-Test (kompletter Neuaufbau von Null) | Quartalsweise |
| **Deployer** | Pre-Deploy-Backup verifizieren (automatisch via `prod-update.sh`) | Bei jedem Deploy |
| **Geschäftsleitung** | Entscheidung über RPO/RTO-Anpassung bei Wachstum | Halbjährlich |

---

## 9. Mindestprüfungen vor Go-Live

- [ ] Managed DB Auto-Backup aktiv und verifiziert (Provider-Panel)
- [ ] PITR-Fenster konfiguriert (mind. 7 Tage)
- [ ] Erster manueller pg_dump-Backup erfolgreich: `./scripts/backup.sh`
- [ ] Backup-Verifizierung bestanden: `./scripts/backup-verify.sh backups/DATUM`
- [ ] Restore-Test bestanden: `./scripts/restore-test.sh backups/DATUM`
- [ ] Cron eingerichtet: `crontab -l | grep backup`
- [ ] Backup auf separatem Volume: `BACKUP_DIR` nicht auf DB-Disk
- [ ] `.env.prod` separat gesichert (Passwort-Manager)
- [ ] Secrets-Rotation-Prozess definiert (wer, wie, wann)
- [ ] Dieses Dokument gelesen und verstanden von Ops + Tech Lead

---

## 10. Umgang mit geschäftskritischen Daten nach Restore

### Rechnungen (Invoices)

- Bereits **versendete** Rechnungen (`status: sent/paid`): Nummernkreis prüfen — keine doppelten Rechnungsnummern
- Bei PITR: Zwischen Restore-Zeitpunkt und jetzt erstellte Rechnungen gehen verloren — Stripe-Dashboard als Quelle für Abgleich nutzen
- GoBD: Rechnungen dürfen nicht nachträglich verändert werden — Audit-Log als Nachweis

### Stundenzettel (Timesheets)

- Aktive Timesheets (`status: draft/submitted`): Nutzer informieren, ggf. neu einreichen
- Genehmigte Timesheets (`status: approved`): Sollten im Backup enthalten sein — Zählung gegen Vorwoche prüfen
- Bei Diskrepanz: Zeitarbeitnehmer-Portal als manuelle Nacherfassungsmöglichkeit

### Assignments & Contracts

- Aktive Assignments müssen gültige Contracts referenzieren (FK-Check Abschnitt 6c)
- Nach Restore: Aktive Assignments gegen aktive Contracts zählen — bei Diskrepanz manuell prüfen
- Contract-Status-Konsistenz: Kein aktives Assignment ohne aktiven Contract

### Audit-relevante Daten

- Audit-Log ist append-only — nach Restore sind Einträge zwischen Backup und jetzt verloren
- Dokumentiere den Restore-Vorgang selbst im Audit-Log (manueller Eintrag oder erster API-Request)
- Bei regulatorischen Anfragen: Backup-Manifest als Nachweis des Restore-Zeitpunkts

---

## 11. Skalierung der Backup-Strategie

| Phase | Maßnahme |
|---|---|
| **Go-Live (jetzt)** | Täglicher pg_dump + Managed DB Auto-Backup + Pre-Deploy Backup |
| **>50 Organisationen** | Externes Backup-Volume (Hetzner Storage Box), monatlicher DR-Test |
| **>200 Organisationen** | Stündlicher pg_dump, Backup-Verschlüsselung (GPG), Off-Site Sync (S3/rclone) |
| **Enterprise (>1000 Org)** | Dedizierter Backup-Server, WAL-Shipping auf Standby, Multi-Region Replikation |

---

## Referenzen

- `docs/BACKUP.md` — Skript-Referenz, Cron-Setup, Restore-Anleitung
- `docs/INCIDENT_RUNBOOK.md` — Sofortmaßnahmen bei Service-Ausfall, DB-Fehlern
- [`RELEASE_RUNBOOK.md`](RELEASE_RUNBOOK.md) — Deployment-Prozess mit Pre-Deploy Backup
- `scripts/backup.sh` — Backup-Skript
- `scripts/restore.sh` — Restore-Skript
- `scripts/restore-test.sh` — Automatisierter Restore-Test
- `scripts/backup-verify.sh` — Integritätsprüfung
- `GO_LIVE_FINAL.md` — Go-Live Checkliste (Abschnitt B3)

---

*Stand: März 2026*
