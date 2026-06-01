# Internal Control Center

## Zweck

Das Internal Control Center (ICC) ist die interne Betriebszentrale von TempConnect.
Es ersetzt nicht die Kundenplattform und ist strikt intern.

Die zentrale Trennung:

- Platform Console: Plattformsteuerung und Systemsicht
- Support Console: sichere, begrenzte Kundensupport-Aktionen
- Operations Console: operative Readonly-/Freigabe-Sicht (Phase 1: Readonly)

## Was gehoert hinein

- interne Betriebssteuerung ueber API/Service-Layer
- kontrollierte manuelle Eingriffe mit Audit-Eintrag
- tenant-/organisationsbezogene Transparenz
- modulare Erweiterungen fuer spaetere Bereiche (Finance, Compliance, Moderation)

## Was gehoert ausdruecklich NICHT hinein

- direkte DB-Admin-Funktionen
- unprotokollierte Notfallaktionen
- frontend-only Zugriffslogik ohne serverseitige Pruefung
- unstrukturierte Sammel-Adminseiten ohne Rollenabgrenzung

## Rollenmodell (intern)

Persistiert in `internal_user_roles` (Migration `065_internal_control_center.sql`):

- `platform_owner`
- `developer_admin`
- `support_agent`
- `support_lead`
- `ops_manager`
- `audit_readonly`

Rollen liefern granulare Permissions im Service `internalControlCenterService`.

## Sicherheitskonzept

- jeder ICC-Endpunkt nutzt `requireAuth` + `requireInternalPermission`
- keine Freigabe nur ueber versteckte UI-Elemente
- sensible Aktionen mit Pflicht-Reason und expliziter Bestaetigung
- mutierende Aktionen markieren `res.locals.audit` fuer zentrales Audit-Logging

## Audit-Konzept

ICC-relevante Aktionen verwenden Actions im Namespace:

- `internal_control.*`

Audit-Attribute:

- wer (`actor_id`)
- wann (`created_at`)
- objekt (`entity_type`, `entity_id`)
- ergebnis (`status`)
- bereich (`details.internal_area`)
- begruendung (`details.reason`, falls relevant)

## Phase-1 Umfang

- internes Routing/Namespace: `/api/internal-control/*`
- strikter interner Rollen-Zugang
- Platform Dashboard + Organisationsliste/-detail
- Support-Kundensuche + sichere Aktion "Verification erneut senden"
- Operations Readonly Overview
- internes Audit-Listing fuer ICC-Aktionen

## Erweiterungsrichtlinien

Bei neuen ICC-Modulen:

1. bestehende Services zuerst wiederverwenden
2. neue Permission im internen Permission-Set definieren
3. serverseitigen Guard erzwingen
4. kritische Aktionen immer auditieren
5. UI und API in klarer Console-Zuordnung halten (Platform/Support/Operations)
