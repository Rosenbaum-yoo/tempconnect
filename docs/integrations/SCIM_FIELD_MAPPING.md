# SCIM 2.0 Feldmapping — SAP SuccessFactors · Workday · Entra ID · Okta

> Wie ein HR-/Identity-System Mitarbeitende in eine TempConnect-Org provisioniert und welche
> Personalfelder dabei übertragen werden. Standardkonform (RFC 7643/7644), kein proprietäres
> Mapping nötig — jedes SCIM-2.0-fähige HRIS/IdP dockt ohne Custom-Code an.

## Warum das zählt

Für Personalmanagement-Systeme (SAP SuccessFactors/HCM, Workday, Microsoft Entra ID, Okta) ist
TempConnect ein **wertvoller Zusatz**: Notdienst-/Springer-Personal wird dort verwaltet, wo die
Stammdaten ohnehin liegen — Personalnummer, **Kostenstelle**, Abteilung. Genau diese Felder
übernimmt TempConnect beim Provisioning und reicht sie an den **DATEV-Lohn-/Buchungsexport**
(Welle C) weiter. Damit schließt sich der Kreis: HRIS → TempConnect-Einsatz → Lohnabrechnung,
ohne manuelles Nachpflegen der Kostenstelle.

## Endpunkt & Aktivierung

| | |
|---|---|
| Basis-URL | `https://<host>/api/scim/v2` |
| Auth | `Authorization: Bearer <tc_live_…-API-Key>` **oder** OIDC-`client_credentials`-JWT |
| Scope | `admin:scim` |
| Feature-Flag | `SCIM_ENABLED=true` (Default **AUS** → Endpunkt liefert `404`) |
| Discovery | `GET /api/scim/v2/ServiceProviderConfig` |
| Content-Type | `application/scim+json` |

Streng org-gebunden: der API-Key/Token bestimmt die Ziel-Org. Ein IdP kann ausschließlich in die
**eigene** Org provisionieren — niemals fremde Org-Daten sehen oder schreiben.

## Kernschema — `urn:ietf:params:scim:schemas:core:2.0:User`

| SCIM-Attribut | TempConnect | Hinweis |
|---|---|---|
| `userName` | `users.email` | Schlüssel (find-or-create, case-insensitiv). Pflicht. |
| `displayName` / `name.formatted` | `users.company_name` | Anzeigename; `givenName`/`familyName` werden daraus abgeleitet. |
| `emails[].value` (primary) | `users.email` | Fallback wenn `userName` fehlt. |
| `active` | `org_memberships.is_active` | `false` = Deprovisioning → Mitgliedschaft inaktiv. Der globale User bleibt (multi-org-sicher). |

## Enterprise-Extension — `urn:ietf:params:scim:schemas:extension:enterprise:2.0:User`

Die SAP-CO/HR-relevanten Felder. Gespeichert **je Mitgliedschaft** (`org_memberships`) — derselbe
Mensch kann in zwei Orgs unterschiedliche Kostenstellen haben.

| SCIM-Attribut | TempConnect-Spalte | Verwendung |
|---|---|---|
| `employeeNumber` | `org_memberships.employee_number` | Personalnummer aus dem HRIS. |
| `costCenter` | `org_memberships.cost_center` | **SAP-Kostenstelle** → DATEV-Lohn-/Buchungsexport-Gruppierung. |
| `department` | `org_memberships.hr_department` | Abteilungs-Label (Freitext aus HRIS; ≠ internes `department_id`). |
| `division` | `org_memberships.division` | Bereich/Division. |

Nicht übernommene Enterprise-Felder (`organization`, `manager`) werden ignoriert (kein Fehler).
Leerer String (`""`) setzt das Feld explizit auf `NULL`.

### Mapping in den gängigen Systemen

| Quelle | Quell-Feld | → SCIM |
|---|---|---|
| **SAP SuccessFactors** | `Employment.costCenter` / `personIdExternal` | `costCenter` / `employeeNumber` |
| **Workday** | `Cost_Center_ID` / `Employee_ID` | `costCenter` / `employeeNumber` |
| **Microsoft Entra ID** | `extensionAttribute*` / `employeeId` (SCIM-Mapping im Provisioning-Blade) | `costCenter` / `employeeNumber` |
| **Okta** | Profile-Attribute → SCIM-Mapping (Provisioning → To App) | `costCenter` / `employeeNumber` |

## Beispiele

**Provisionieren mit Kostenstelle (POST):**

```http
POST /api/scim/v2/Users
Authorization: Bearer tc_live_…
Content-Type: application/scim+json

{
  "schemas": ["urn:ietf:params:scim:schemas:core:2.0:User",
              "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User"],
  "userName": "maria.musterfrau@klinikum.de",
  "displayName": "Maria Musterfrau",
  "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User": {
    "employeeNumber": "P-00042",
    "costCenter": "KST-4711",
    "department": "Pflege Station 3",
    "division": "Süd"
  }
}
```

**Kostenstelle ändern (PATCH):**

```http
PATCH /api/scim/v2/Users/<id>
{
  "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
  "Operations": [
    { "op": "replace",
      "path": "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User:costCenter",
      "value": "KST-9000" }
  ]
}
```

**Deprovisionieren (PATCH oder DELETE):**

```http
PATCH /api/scim/v2/Users/<id>
{ "Operations": [{ "op": "replace", "path": "active", "value": false }] }
```

## Audit

Jede Aktion schreibt ein Audit-Event (org-scoped): `scim.user_provisioned`,
`scim.user_hr_updated` (mit geänderten Feldern), `scim.user_activated`, `scim.user_deactivated`.

## Verwandt

- Konnektor-Registry (welche Org an welches System): `docs/FEATURES_INDEX.md` §8, Mig 143.
- DATEV-Lohn-Export (nutzt `cost_center`): `services/datevExportService.js`.
- OIDC-M2M-Token (Alternative zum API-Key): `routes/oauth.js`, `services/m2mTokenService.js`.
