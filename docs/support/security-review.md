# SOC Security Review
Stand: 2026-05-20
## Boundary-Modell
- Support-Pfad und OCC-Pfad sind getrennt abgesichert:
  - Support: `requireSupportAccess`
  - OCC: `requireOwnerControlAccess`
- Keine implizite Rechtevererbung zwischen Support und OCC.
## SOC-RBAC/Scope
- Rollen:
  - `internal_support_agent`, `internal_support_lead`
  - `external_support_agent`, `external_support_supervisor`
  - `support_auditor`
- Scope:
  - `full_internal`, `assigned_only`, `vendor_scoped`
- Feature-Gates:
  - `user_lookup`, `org_lookup`, `knowledge_base`, `supervisor_view`, `audit_view`, `quality_metrics`
## Auditing
- SOC Aktionen landen in `support_audit_log`.
- OCC Access-Denials landen in `owner_control_access_audit`.
## Masking
- Externe Rollen sehen maskierte Identitäten/Kontakte.
- Interne Rollen sehen unmaskierte Kerndaten gemäß Regelwerk.
