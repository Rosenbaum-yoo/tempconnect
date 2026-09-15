# DSGVO Data Governance — Enterprise Compliance-Modul

TempConnect Data Governance bietet vollständige DSGVO-Compliance für den DACH-Markt:
Dateninventar, Auskunftsrecht (Art. 15/20), Recht auf Löschung (Art. 17),
Aufbewahrungsfristen (HGB §257) und Anfragen-Tracking.

## Feature-Gate

| Flag | Pläne |
|------|-------|
| `data_governance` | PRO, ENTERPRISE |

Self-Service-Export (`GET /api/me/export`) bleibt **planunabhängig** — gesetzliche Pflicht.

## Datenkategorien

Das System klassifiziert alle personenbezogenen Daten in vier Kategorien:

### Kategorie A — Direkt personenbezogen
- **Tabellen**: users, worker_profiles, worker_invites, company_profiles, company_contacts, offers, requests
- **Aktion bei Löschung**: Felder überschreiben (`[Gelöscht]`, NULL)
- **Export**: Vollständig

### Kategorie B — Geschäftlich notwendig
- **Tabellen**: org_memberships, assignments, requisitions, contracts, vendor_pool, capacity_posts, timesheets, matches, …
- **Aktion bei Löschung**: Personenreferenzen anonymisieren (FK bleibt, Name/Kontakt → `[Anonymisiert]`)
- **Export**: Vollständig

### Kategorie C — Aufbewahrungspflichtig (HGB §257)
- **Tabellen**: invoices, invoice_items, subscriptions, billing_usage_metrics, audit_log
- **Aktion bei Löschung**: **NICHT löschbar** (6–10 Jahre Aufbewahrungspflicht)
- **Export**: Vollständig, mit Hinweis auf Aufbewahrungspflicht

### Kategorie D — Technische Metadaten
- **Tabellen**: session, idempotency_keys, notifications
- **Aktion bei Löschung**: Sofort gelöscht
- **Retention**: Automatisch bereinigbar (TTL-basiert)

## Auskunft (Art. 15/20)

`exportUserDataFull` (Konto) und `workerProfileGovernanceService.exportWorkerProfileData`
(Profil, auch ohne Konto) liefern alle vier Kategorien. Seit **Welle N2.10 (2026-09-15)**:

- **Die Auskunft funktioniert.** Vorher verlangte die erste Abfrage `users.plan` und
  `users.is_active` (gibt es nicht); der Fehler wurde geschluckt, und `GET /api/me/export`
  antwortete **jedem** Nutzer mit 404. Sechs weitere Abschnitte kamen still leer an.
- **Koordinaten** (`users.latitude/longitude`, seit N2.0 aus der Anschrift abgeleitet) stehen drin.
- **Einsatzplanung** (Owner-Entscheid 2026-09-15): Einladungen und Vormerkungen der Warteliste
  mit Rang, Punktzahl und Gründen, der Zeitarbeitsfirma, Tätigkeit und Zeitraum — **ohne**
  Kundenunternehmen (Geschäftsinformation Dritter, Art. 15 Abs. 4) und mit einem neutralen
  Hinweis, was eine Vormerkung ist. Im Betrieb bleibt die Warteliste still; in der formalen
  Auskunft steht sie. Beide Auskünfte nutzen dieselben Abfragen aus `assignmentStaffingService`.
- **Nie in der Datei:** Passwort-Hash, MFA-/TOTP-Geheimnisse, Wiederherstellungscodes, Tokens.

## Anonymisierung (Art. 17)

Ablauf:
1. **Vorbedingungsprüfung** (`canDeleteUser`): Prüft auf Blocker — **fail-closed**: scheitert eine
   Prüfung, scheitert die Löschung (500), statt still durchzugehen
   - Aktive Assignments (angelegt vom Nutzer) → ACTIVE_ASSIGNMENTS
   - Eingereichte Timesheets → PENDING_TIMESHEETS
   - Offene Rechnungen des Kontos (`draft`, `issued`, `overdue`) → OPEN_INVOICES
   - **Eigene laufende oder zugesagte Einsätze einer Kraft**, heute (Europe/Berlin) noch nicht
     beendet → ACTIVE_DEPLOYMENTS (N2.10). Unbeantwortete Anfragen sperren nicht.
2. **Anonymisierung** (`anonymizeUser`): Kategorie-weise Verarbeitung. Seit N2.10 zusätzlich:
   Profil inaktiv, Koordinaten gelöscht, und die **Einsatzplanung aufgeräumt**
   (`assignmentStaffingService.raeumeEinsatzplanungAuf`, in derselben Transaktion):
   Reservierungen freigegeben, offene Einladungen und Auswahl-Sets zurückgezogen,
   unbeantwortete Anfragen wie abgelehnt, Vormerkungen **gelöscht**, offene Marktangebote
   archiviert, betroffene Einsätze neu gerechnet. Einsätze, Stundenzettel und Rechnungen bleiben.
   Dieselbe Bereinigung läuft in `deleteWorkerData` und `anonymizeWorkerProfile`.
3. **Audit-Log**: Unveränderlicher Eintrag in Kat C, mit den Zahlen der Bereinigung

## Aufbewahrungsfristen (Retention)

| Tabelle | Frist | Beschreibung |
|---------|-------|-------------|
| worker_invites | 90 Tage | Abgelaufene Einladungen |
| notifications | 180 Tage | Gelesene Benachrichtigungen |
| session | 14 Tage | Abgelaufene Sessions |
| idempotency_keys | 7 Tage | Idempotenz-Schlüssel |

Retention-Cleanup unterstützt Dry-Run (Vorschau) und tatsächliche Bereinigung.

## API-Referenz

Alle Endpoints unter `/api/data-governance/`. RBAC: `data_governance.*` (owner, admin).

### Dateninventar
| Method | Path | Permission | Beschreibung |
|--------|------|-----------|-------------|
| GET | `/inventory` | export | Datenkategorien + Retention-Policies |

### Export
| Method | Path | Permission | Beschreibung |
|--------|------|-----------|-------------|
| GET | `/export/user/:userId` | export | Vollständiger DSGVO-Export eines Users |
| GET | `/export/org` | export | Org-weiter Datenexport |

### Anonymisierung
| Method | Path | Permission | Beschreibung |
|--------|------|-----------|-------------|
| GET | `/anonymize/user/:userId/check` | anonymize | Vorbedingungsprüfung |
| POST | `/anonymize/user/:userId` | anonymize | Anonymisierung durchführen |

### Retention
| Method | Path | Permission | Beschreibung |
|--------|------|-----------|-------------|
| GET | `/retention/status` | retention | Retention-Übersicht |
| POST | `/retention/cleanup` | retention | Bereinigung (dry_run: true/false) |

### DSGVO-Anfragen
| Method | Path | Permission | Beschreibung |
|--------|------|-----------|-------------|
| GET | `/requests` | requests | Anfragen-Liste (Filter: status, request_type) |
| POST | `/requests` | requests | Neue Anfrage erstellen |
| PATCH | `/requests/:id/complete` | requests | Anfrage abschließen |

### Self-Service (planunabhängig)
| Method | Path | Auth | Beschreibung |
|--------|------|------|-------------|
| GET | `/api/me/export` | Session | Eigener DSGVO-Export (delegiert an exportUserDataFull) |
| DELETE | `/api/me` | Session | Account-Löschung — ausschließlich anonymizeUser. Blocker (laufende oder zugesagte Einsätze, offene Rechnungen/Timesheets) → 409 `ACCOUNT_DELETE_BLOCKED` mit Blockerliste; Fehler — auch eine nicht prüfbare Sperre — → 500. Kein Hard-Delete-Fallback mehr (HGB §257: Kat-C-Daten bleiben) |

## Dateien

| Datei | Beschreibung |
|-------|-------------|
| `sql/migrations/051_data_governance.sql` | Migration: data_governance_requests |
| `api/services/dataGovernanceService.js` | Service: Export, Anonymisierung, Retention, Anfragen |
| `api/routes/dataGovernance.js` | Router: 10 Endpoints |
| `api/test/dataGovernanceService.test.js` | 27 Unit-Tests |
| `frontend/public/data-governance.html` | Enterprise-UI (4 Tabs) |
| `docs/DATA_GOVERNANCE.md` | Diese Dokumentation |

## Tests

```bash
node --test --test-force-exit api/test/dataGovernanceService.test.js
```

27 Tests: Constants, Export (User/Org), canDeleteUser, anonymizeUser, deleteWorkerData, Retention (Status/Dry-Run/Cleanup), DSGVO-Anfragen (Create/List/Complete).

Seit N2.10 zusätzlich:

| Datei | Prüft |
|---|---|
| `api/test/auskunftFunktioniert.test.js` | gelesene Spalten, keine Geheimnisse, Einsatzplanung ohne Kunde, Org-Export |
| `api/test/loeschenRaeumtAuf.test.js` | Bereinigung (Zustände, Bindung, Transaktion), Sperren inkl. fail-closed, Route 409/500, alle drei Löschpfade |
| `api/test/integration/auskunft.flow.test.js` | Auskunft gegen die echte Datenbank — **null gescheiterte Abfragen** |
| `api/test/integration/loeschenRaeumtAuf.flow.test.js` | ganze Einsatzplanung aufgebaut, Sperren, Löschung über den DELETE-/me-Pfad |

Ohne Datenbank prüft `api/test/sqlSchemaWaechter.test.js` jede Abfrage des Dienstes gegen die
Schema-Momentaufnahme — für `dataGovernanceService.js` seit N2.10 **ohne Ausnahme**.
