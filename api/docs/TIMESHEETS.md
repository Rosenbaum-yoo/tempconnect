# Digitale Stundenzettel — Enterprise Timesheet Module

## Übersicht

Das Stundenzettel-Modul ermöglicht die vollständig digitale Erfassung, Freigabe und Archivierung von Arbeitszeitdaten für Zeitarbeitseinsätze. Feature-gated für PLUS/PRO/ENTERPRISE.

## Statusmodell

```
draft → submitted → approved
  ↑        ↓           (gesperrt)
  └── rejected
       ↓
  cancelled
```

| Status    | Beschreibung                     | Editierbar |
|-----------|----------------------------------|------------|
| draft     | Entwurf, bearbeitbar             | Ja         |
| submitted | Eingereicht zur Prüfung          | Nein       |
| approved  | Genehmigt — rechnungsfertig      | Nein       |
| rejected  | Abgelehnt → kann zu draft zurück | Nein       |
| cancelled | Storniert                        | Nein       |

Jeder Status hat DE/EN Labels, Hex-Farben, Background-Farben und Icons:
`GET /timesheets/status-meta`

## Pre-Fill Flow

Endpoint: `POST /timesheets/prefill`

Worker/Disponent wählt Assignment + KW → System erstellt automatisch:
1. Draft-Timesheet mit Assignment-Kontext
2. Tageseinträge Mo–Fr mit vorbelegten Stunden/Pause/Schicht

### 3-Tier Default-Hierarchie

1. **Worker Assignment Link** (`worker_assignment_links`): individuelle Defaults pro Einsatz
2. **Timesheet Template** (`timesheetTemplateService`): Organisations-/Assignment-Template
3. **Fallback**: 8h Regelarbeitszeit, 30min Pause

```json
{
  "assignment_id": "uuid",
  "week_start": "2025-03-10",
  "week_end": "2025-03-14",
  "worker_user_id": "uuid (optional)"
}
```

## Digitale Unterschrift

Endpoint: `POST /timesheets/:id/sign`

- Nur möglich in Status `draft` oder `submitted`
- Speichert: `worker_signed_at` (Zeitstempel) + `worker_signed_ip` (Client-IP)
- Einmalig — erneutes Signieren gibt `ALREADY_SIGNED` zurück
- Zusätzliche Spalten für Agency/Customer-Bestätigung:
  - `agency_confirmed_at`, `agency_confirmed_by`
  - `customer_signed_by`, `customer_signed_at`

## ArbZG §4 Pausenvalidierung

Funktion: `validateBreakCompliance(entries)`

Prüft Einträge gegen das Arbeitszeitgesetz:
- **>6h Arbeitszeit** → mind. 30min Pause erforderlich
- **>9h Arbeitszeit** → mind. 45min Pause erforderlich

Gibt `warnings[]` zurück — kein Hard-Block, nur Hinweise:
```json
{
  "rule": "ARBZG_6H_30MIN",
  "work_date": "2025-03-10",
  "total_hours": 7,
  "break_minutes": 15,
  "required_break": 30,
  "message": "2025-03-10: Bei >6h Arbeitszeit sind mind. 30min Pause vorgeschrieben (ArbZG §4)."
}
```

## Batch-Operationen

### Batch Approve
`POST /timesheets/batch-approve`
```json
{ "ids": ["uuid1", "uuid2", ...] }
```
- Max 100 IDs pro Request
- Gibt `{ approved: [...], errors: [...] }` zurück
- Einzelne Fehler blockieren nicht die anderen

### Batch Reject
`POST /timesheets/batch-reject`
```json
{ "ids": ["uuid1", "uuid2"], "reason": "Fehlende Angaben" }
```
- Max 100 IDs pro Request
- Optionaler Ablehnungsgrund für alle

## Worker Dashboard KPIs

Endpoint: `GET /timesheets/worker-summary?worker_name=X&supplier_org_id=Y`

Liefert:
- `total_timesheets`, `draft_count`, `submitted_count`, `approved_count`, `rejected_count`
- `approved_hours_total`, `approved_hours_this_month`, `overtime_hours_this_month`
- `signed_count`

## Benachrichtigungen

Timesheet-Events in der Notification Matrix:

| Event                  | Severity | Empfänger                |
|------------------------|----------|--------------------------|
| `timesheet.submitted`  | info     | assignment_stakeholders  |
| `timesheet.approved`   | success  | timesheet_worker         |
| `timesheet.rejected`   | warning  | timesheet_worker         |
| `timesheet.signed`     | info     | assignment_stakeholders  |

Alle Events sind in `EVENT_CATEGORY_MAP` als `timesheet_updates` kategorisiert.

## REST API Übersicht

| Methode | Pfad                              | Permission         | Beschreibung              |
|---------|-----------------------------------|--------------------|---------------------------|
| GET     | /timesheets                       | timesheet.view     | Liste mit Filtern         |
| POST    | /timesheets                       | timesheet.create   | Neuen Stundenzettel       |
| GET     | /timesheets/:id                   | timesheet.view     | Einzelner mit Einträgen   |
| PATCH   | /timesheets/:id                   | timesheet.edit     | Bearbeiten (nur draft)    |
| POST    | /timesheets/:id/entries           | timesheet.edit     | Tageseintrag hinzufügen   |
| PATCH   | /timesheets/:id/entries/:entryId  | timesheet.edit     | Eintrag aktualisieren     |
| DELETE  | /timesheets/:id/entries/:entryId  | timesheet.edit     | Eintrag löschen           |
| POST    | /timesheets/:id/submit            | timesheet.submit   | Einreichen                |
| POST    | /timesheets/:id/approve           | timesheet.approve  | Genehmigen (nur Buyer)    |
| POST    | /timesheets/:id/reject            | timesheet.reject   | Ablehnen (nur Buyer)      |
| POST    | /timesheets/:id/cancel            | timesheet.submit   | Stornieren                |
| POST    | /timesheets/:id/return-to-draft   | timesheet.edit     | Zurück zu Draft           |
| POST    | /timesheets/prefill               | timesheet.create   | Pre-Fill aus Assignment   |
| POST    | /timesheets/:id/sign              | timesheet.submit   | Digitale Unterschrift     |
| POST    | /timesheets/batch-approve         | timesheet.approve  | Batch-Genehmigung         |
| POST    | /timesheets/batch-reject          | timesheet.reject   | Batch-Ablehnung           |
| GET     | /timesheets/status-meta           | —                  | Status-Labels/Farben      |
| GET     | /timesheets/worker-summary        | timesheet.view     | Worker-KPIs               |
| GET     | /assignments/:id/timesheets       | timesheet.view     | Timesheets pro Assignment |

## Worker-Submission Kunden-Sammelprozess

Dieser Flow ergänzt den Einzelprozess um eine professionelle Bündelung:

1. Worker reicht ein (`submitted`)
2. Agentur prüft (`under_review`) und gibt intern frei (`approved_internal`)
3. Agentur bündelt je Kunde/Periode und sendet gesammelt (`sent_to_customer`)
4. Kunde bestätigt (`customer_confirmed`) oder lehnt ab (`customer_rejected`)
5. Bestätigte Positionen werden gesammelt in Timesheets überführt (`posted_to_timesheet`)

Der Sammelversand erzwingt serverseitig einen gemeinsamen Kunde-/Perioden-Scope. Gemischte, veraltete oder unvollständige manuelle Selektionen werden als Konflikt abgelehnt, statt stillschweigend nur einen Teil der Positionen zu versenden.

### Wochenlogik im Einsatzportal (7 Tage)

Für den Worker-Zettel gilt jetzt verbindlich:

- Ein Wochenzettel ist **bearbeitbar**, solange der Status `draft` oder `needs_correction` ist.
- Der Worker kann den Zettel in diesem Zustand beliebig oft öffnen, speichern und später fortsetzen.
- Eine Woche ist **vollständig**, wenn für alle 7 Kalendertage im Bereich `week_start..week_end` ein Tagesdatensatz existiert.
- Tage mit 0 Stunden sind erlaubt, gelten aber nur als vollständig, wenn sie explizit als Tagesdatensatz gespeichert sind.
- Finales Einreichen ist nur möglich, wenn die Woche vollständig ist (`INCOMPLETE_WEEK` bei Lücken).
- Nach `submitted` ist der Zettel aus Worker-Sicht read-only; Bearbeitung erst wieder nach Rückgabe in `needs_correction`.

Praktische Folge:
- Kein "nur einmal öffnen"-Verhalten mehr bei laufenden Drafts.
- Bei erneutem Öffnen eines bereits angelegten Wochenzettels wird der vorhandene Datensatz wiederverwendet.

### Relevante Submission-Status für Abrechnung

| Status | Bedeutung |
|---|---|
| `approved_internal` | intern prüffertig, noch nicht kundenübermittelt |
| `sent_to_customer` | gesammelt an Kunden übermittelt |
| `customer_confirmed` | kundenseitig bestätigt, abrechnungsfähig |
| `customer_rejected` | kundenseitig abgelehnt, zurück in Klärung |
| `posted_to_timesheet` | in Timesheet-System überführt |

### Bundle-Endpunkte (`/api/agency/submissions/bundles/*`)

| Methode | Pfad | Beschreibung |
|---|---|---|
| GET | `/agency/submissions/bundles/preview` | Vorschau bündelbarer Einreichungen (`approved_internal`) nach Kunde/Periode |
| POST | `/agency/submissions/bundles/send` | Startet Sammelversand an Kunden, setzt Bundle-Metadaten + Status |
| GET | `/agency/submissions/bundles` | Liste vorhandener Bundles mit Statusverteilung |
| GET | `/agency/submissions/bundles/:bundleKey` | Bundle-Detail mit Positionen |
| POST | `/agency/submissions/bundles/:bundleKey/post-to-timesheet` | Überführt kundenseitig bestätigte Bundle-Positionen gesammelt ins Timesheet-System |

### Bundle-Metadaten in `worker_time_submissions`

- `customer_bundle_key`
- `customer_bundle_ref`
- `customer_bundle_status`
- `customer_bundle_period_from` / `customer_bundle_period_to`
- `customer_bundle_sent_at` / `customer_bundle_sent_by`

## Datenbank

### Migration 027: `timesheets` + `timesheet_entries`
- Basis-Tabellen mit Status-Lifecycle, Org-Boundary, Worker-Daten

### Migration 031: Digital Signature Columns
- `worker_signed_at`, `worker_signed_ip`
- `agency_confirmed_at`, `agency_confirmed_by`
- `customer_signed_by`, `customer_signed_at`
- Index: `idx_timesheets_signed` auf `worker_signed_at`

### Migration 033: `timesheet_templates`
- Template-Management mit 3-Tier-Fallback (Assignment → Org → Default)

### Migration 061: Customer Bundles
- Sammelversand-/Abrechnungsmetadaten auf `worker_time_submissions`
- Indizes auf Bundle-Key und Bundle-Perioden
