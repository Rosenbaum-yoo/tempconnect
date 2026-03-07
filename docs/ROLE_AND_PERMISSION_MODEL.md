# TempConnect – Rollen- und Berechtigungsmodell

## Übersicht
Das RBAC-System basiert auf Org-Memberships (`org_memberships`-Tabelle). Jeder User kann mehreren Organisationen angehören, jeweils mit einer Rolle.

## Rollen (Hierarchie, absteigend)
1. **owner** – Vollzugriff, Organisation verwalten, Mitglieder einladen
2. **admin** – Fast alles wie Owner, kann keine Owner-Rechte vergeben
3. **program_manager** – Requisitions, Vendor Pool, Reporting, Compliance
4. **hiring_manager** – Requisitions erstellen/bearbeiten, Matching starten
5. **supplier_manager** – Vendor Pool verwalten, Compliance prüfen
6. **finance** – Reporting, Kosten-Übersicht (lesend)
7. **member** – Basis-Zugang: lesen, eigene Requisitions
8. **supplier_user** – Eingeschränkt: eigene Angebote, Compliance-Uploads

## Permissions
| Permission | owner | admin | pm | hm | sm | finance | member | supplier |
|---|---|---|---|---|---|---|---|---|
| org.manage | ✓ | ✓ | | | | | | |
| org.members | ✓ | ✓ | | | | | | |
| org.view | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| requisition.create | ✓ | ✓ | ✓ | ✓ | | | | |
| requisition.edit | ✓ | ✓ | ✓ | ✓ | | | | |
| requisition.approve | ✓ | ✓ | ✓ | | | | | |
| requisition.view | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | |
| vendor_pool.manage | ✓ | ✓ | ✓ | | ✓ | | | |
| vendor_pool.view | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| compliance.manage | ✓ | ✓ | ✓ | | ✓ | | | |
| compliance.upload | ✓ | ✓ | ✓ | | ✓ | | | ✓ |
| compliance.view | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| reporting.view | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | |
| matching.run | ✓ | ✓ | ✓ | ✓ | | | | |
| notifications.manage | ✓ | ✓ | | | | | | |

## Rückwärtskompatibilität
- Legacy-User ohne `org_memberships`-Eintrag werden durchgelassen (kein RBAC-Block)
- Die bestehenden `role`-Felder (company/agency) in der `users`-Tabelle bleiben erhalten
- RBAC greift nur bei VMS-Endpunkten (requisitions, vendor-pool, reporting)

## Technische Implementierung
- **Service**: `api/services/rbacService.js` – `hasPermission()`, `checkPermission()`, `getMembership()`
- **Middleware**: `api/middleware/rbac.js` – `requirePermission(key)`, `requireRole([roles])`
- **Org-ID Resolution**: aus `req.body.org_id`, `req.query.org_id`, `req.params.org_id` oder Primary Org
