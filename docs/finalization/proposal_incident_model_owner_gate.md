# Vorschlag zur Freigabe — Operativer Incident-Modell (Gate-50)

> **Status: ✅ UMGESETZT (Owner-freigegeben 2026-06-02 „weiter gehts").** Der Kern-Slice
> ist gebaut und verifiziert — dieses Dokument bleibt als Design-/Entscheidungs-Referenz
> erhalten. **Noch KEIN Commit** (Owner-Gate: erst bei 100%/Marktstart-Reife).
>
> Gebaut (siehe `finalization_worklog.md` 2026-06-02 „Incident Kern-Slice umgesetzt" +
> `changed_files_index.md`):
> - `sql/migrations/121_ops_incidents.sql` — Tabelle wie hier entworfen, mit einer bewussten
>   Abweichung: **KEINE `audit_id`-Spalte** (Audit verlinkt über `staff_control_audit_log`
>   entityType='ops_incident', konsistent mit allen SCC-Mutationen) statt einer FK-Spalte.
> - `api/services/staffIncidentService.js` — read-only Aggregat + Mutationen (diskriminiertes
>   Ergebnis, Audit im Router, open→acknowledged→resolved via SELECT…FOR UPDATE).
> - `api/routes/staffControlCenter.js` — 5 Routen (2 read, 3 Mutation mit voller Step-Up-Kette).
> - `frontend/src/staff/modules/incidents/index.tsx` (+ Sidebar/AppShell) — SCC-Modul „Incidents".
> - `api/test/staffIncidents.test.js` — 20/20.
>
> Nachgezogen (2026-06-02): **§6.2 „Offene Signale ohne Incident"-Feed ist umgesetzt** —
> read-only `listOpenSignals` (failed warp_executions + aggregierte Mail-Fehler) +
> `GET /incidents/signals` + Panel mit vorbefüllter Eröffnung. 25/25 Tests, build:scc grün.
>
> Noch offen (eigene, weiterhin owner-gated Slices): §6.3 `warp_executions.incident_id`-FK,
> §6.4 ALERT_EMAIL (Gate-50, echter Mail-Key), §6.5 org-FK.
>
> _Ursprünglicher Gate-Grund (erfüllt): neues Datenmodell (neue Tabelle) = Architektur-/
> Produktentscheidung mit Wirkung auf 20+ Folgeprojekte → Owner-Freigabe vor Anlegen._

---

## 1. Anlass — eine vom Schema vorgezeichnete, nie geschlossene Lücke

Repo-Befund (nicht spekulativ):

- **`warp_executions.incident_id UUID`** — `sql/migrations/108_occ_phase3_modules.sql`,
  Zeile 126: ein UUID-Feld **ohne FK und ohne Zieltabelle**. Das Schema hat Incidents
  vorgesehen, aber nie angelegt. Jede fehlgeschlagene Deploy-/Restart-/Backup-Ausführung
  *könnte* hier auf einen Incident zeigen — heute zeigt sie auf nichts.
- **`reportingService.executiveDashboard()` `alerts[]`** — Zeile 1187+: erzeugt
  `SLA_COMPLIANCE_LOW` + `CRITICAL_STAFFING_PRESSURE` live, **org-skopiert, flüchtig**.
  Sobald der Request endet, ist das Signal weg — keine Historie, keine Quittierung,
  kein „wer hat sich gekümmert".
- **`audit_log`** hält *was geändert wurde*, aber nicht *welcher Betriebsvorfall offen ist*.

Es gibt also Signale (SLA, Staffing, fehlgeschlagene Automation, Mail-Fehler aus dem
neuen Mail Center) und es gibt einen verwaisten Hook — aber **keinen Ort, an dem ein
Operator einen Vorfall eröffnet, quittiert, mit Grund schließt und der überdauert.**
Das ist der einzige genuin wertvolle Rest in Gruppe SCC-Ops, der read-only nicht
schließbar ist.

---

## 2. Vorgeschlagene Migration (Entwurf — `sql/migrations/1XX_ops_incidents.sql`)

Spiegelt bestehende Konventionen aus Mig 108: `gen_random_uuid()`-PK, `risk_level`-CHECK-Enum
(`low/medium/high/critical`), `audit_id BIGINT REFERENCES audit_log(id)`, TIMESTAMPTZ-Zeitstempel.

```sql
-- 1XX_ops_incidents.sql — operativer Incident-Track (SCC Operations)
CREATE TABLE IF NOT EXISTS ops_incidents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL,
  severity        TEXT NOT NULL DEFAULT 'medium'
                  CHECK (severity IN ('low','medium','high','critical')),  -- = warp risk_level
  status          TEXT NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','acknowledged','resolved')),
  source          TEXT NOT NULL DEFAULT 'manual'
                  CHECK (source IN ('manual','sla','staffing','infra','automation','email')),
  signal_code     TEXT,                       -- z.B. 'SLA_COMPLIANCE_LOW' bei abgeleiteten
  org_id          UUID,                       -- optionaler Org-Kontext (Tabellenname gegen
                                              --   Schema prüfen, NULL = plattformweit)
  details         JSONB NOT NULL DEFAULT '{}',
  opened_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  opened_reason   TEXT NOT NULL,              -- Pflicht (CLAUDE.md: reason bei kritischen Aktionen)
  acknowledged_by UUID REFERENCES users(id) ON DELETE SET NULL,
  acknowledged_at TIMESTAMPTZ,
  resolved_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at     TIMESTAMPTZ,
  resolution_note TEXT,
  audit_id        BIGINT REFERENCES audit_log(id) ON DELETE SET NULL,  -- = warp_executions-Muster
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ops_incidents_status_created
  ON ops_incidents(status, created_at DESC);   -- „offene Incidents, neueste zuerst"
CREATE INDEX IF NOT EXISTS idx_ops_incidents_severity
  ON ops_incidents(severity);
CREATE INDEX IF NOT EXISTS idx_ops_incidents_org
  ON ops_incidents(org_id);

-- Verwaisten Hook nachträglich verdrahten (separater, optionaler Schritt):
-- ALTER TABLE warp_executions
--   ADD CONSTRAINT fk_warp_exec_incident
--   FOREIGN KEY (incident_id) REFERENCES ops_incidents(id) ON DELETE SET NULL;
```

**Rollback-Plan (Pflicht):**
```sql
-- ALTER TABLE warp_executions DROP CONSTRAINT IF EXISTS fk_warp_exec_incident;  -- nur falls verdrahtet
DROP TABLE IF EXISTS ops_incidents CASCADE;
```
Reversibel: Tabelle ist additiv, kein Bestandsdatum wird verändert. Der `incident_id`-Hook
bleibt bei Rollback einfach wieder verwaist (Zustand wie heute).

---

## 3. Backend-Design (nach Freigabe)

**Service `api/services/staffIncidentService.js`** — gleiche Read-only-Aggregat-Linie wie
Billing/Mail Center für die Lesepfade, plus geprüfte Mutationen:

- `listIncidents(pool, {status, severity, limit})` — read-only, Zero-State, Summen je
  status/severity + paginierte Liste. (Index `…_status_created` deckt den Default.)
- `openIncident(pool, {title, severity, source, signal_code, org_id, details, reason}, actor)`
  — `withTransaction`, schreibt Incident **und** `audit_log` (`ops.incident.open`,
  `responsible_actor_user_id`), Idempotency-Key respektiert.
- `acknowledgeIncident` / `resolveIncident(pool, id, {note, reason}, actor)` — Statusübergänge
  `open → acknowledged → resolved` (definiert, keine Sprünge rückwärts ohne Grund), Audit je Schritt.

**Routen `api/routes/staffControlCenter.js`** (alle `requireStaff`):
- `GET  /incidents` (read-only Liste + Summen) · `GET /incidents/meta` (Enum-Listen für Filter-UI)
- `POST /incidents` (eröffnen) · `POST /incidents/:id/acknowledge` · `POST /incidents/:id/resolve`
  — Mutationen mit **CSRF + reason-Pflicht (>=10 Zeichen) + confirmed:true**, Zod an der Grenze.

**Optionaler Brückenschlag (read-only, nicht-gated):** abgeleitete Signale (`alerts[]`,
fehlgeschlagene `warp_executions`, Mail `failed`/`no_smtp`) als *Vorschlagsliste* „offene
Signale ohne Incident" anzeigen — der Operator entscheidet, ob daraus ein Incident wird.
Kein Auto-Insert (keine stille Schreiboperation).

---

## 4. Frontend (nach Freigabe)

Neues SCC-Modul `frontend/src/staff/modules/incidents/index.tsx`, Gruppe **Operations** —
exakt das 3-Touchpoint-Muster (Modul + Sidebar `AreaKey` + AppShell lazy/Branch), gleiche
`scc-*`-Klassen, kein neues CSS. Severity/Status farbcodiert über bestehende
`scc-status--{ok,warn,danger}`. Mutationen über das bewährte Confirm+Reason-Modal (wie
OCC Decisions / Automation-Runbooks).

---

## 5. Pfeiler-Check (CLAUDE.md Enterprise Readiness)

| Pfeiler | Erfüllung im Entwurf |
|---|---|
| Org-Boundary | `org_id` optional (NULL=plattformweit); SCC=Operatorrolle plattformweit (wie Billing/Mail), kein Cross-Org-403 |
| Zero-State | Liste leer → `available:true` + leere Arrays + Summen 0 |
| Scope-Transparenz | Response trägt `scope` + `generated_at` |
| RBAC | `requireStaff` vor allen Routen, kein Inline-Rollencheck |
| Audit | jede Mutation → `audit_log` (`ops.incident.*`, reason Pflicht, responsible_actor) |
| Testpflicht | Service-Tests (Zero-State, Aggregation, Statusübergänge, fremde Eingaben), Route-Tests (CSRF/reason/confirmed) |
| Drilldown | Incident → `detail_url`/`org_id`/`warp_executions.incident_id`-Rückbezug |

---

## 6. Offene Owner-Entscheidungen (das eigentliche Gate)

1. **Migration anlegen ja/nein?** (neue Tabelle `ops_incidents` — irreversibel im Sinne der 4-Ausnahmen-Regel)
2. **Scope:** rein manuell eröffnet, oder auch abgeleitete Signale als Vorschlagsliste (read-only, kein Auto-Insert)?
3. **`incident_id`-Hook** in `warp_executions` jetzt mit FK verdrahten oder vorerst verwaist lassen?
4. **`ALERT_EMAIL`-Verdrahtung** (Mail bei kritischem Incident) — separater Slice, braucht echten Mail-Key (Gate-50) → später.
5. **Org-Tabellenname** für die `org_id`-FK gegen das echte Schema bestätigen (`organizations`?).

---

## 7. Warum dieser Schritt wirtschaftlich der richtige nächste ist

- Schließt die **letzte genuine Lücke** in Gruppe SCC-Ops; alles andere dort ist read-only
  bereits abgedeckt oder dupliziert OCC.
- **Niedrige laufende Kosten:** eine schlanke Tabelle, indexgedeckte Default-Query, keine
  teuren Joins. Bei 10→300 Kunden unkritisch (Incidents sind seltene Ereignisse, nicht
  Hochfrequenz-Logs).
- **Wiederverwendbar** für die 20+ Folgeprojekte: jedes braucht einen operativen
  Incident-Track — derselbe Service/Route/UI-Baustein.
- Macht die bereits vorhandenen, heute *flüchtigen* Signale (SLA/Staffing/Automation/Mail)
  endlich **handlungsführend** statt nur sichtbar.
