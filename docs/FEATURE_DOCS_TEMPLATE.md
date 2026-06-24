# Feature: [Feature-Name]

> Vorlage für eine Einzel-Feature-Doku. Pfad: `docs/features/<slug>.md` · Index: [`docs/FEATURES_INDEX.md`](FEATURES_INDEX.md)
> Nur anlegen, wenn das Feature nicht-offensichtlich ist (Integration, Commercial, Security, komplexer Flow).

---

## Metadata

| Feld | Wert |
|---|---|
| **Bereich** | Marktplatz / Notdienst / Einsätze & Zeiten / Enterprise-VMS / Center (OCC/SCC/SOC) / Billing / Identität & Security / Integrationen / Growth / Infra |
| **Status** | 📋 Geplant / 🚧 In Entwicklung (feature-flagged) / ✅ Live |
| **Pläne** | DEMO / BASIS / PLUS / PRO / INDIVIDUELL (welche Stufen schalten es frei) |
| **Feature-Key** | `<key>` aus `api/config/planCatalog.js` (falls entitlement-gesteuert) |
| **Erstellt / Geändert** | YYYY-MM-DD / YYYY-MM-DD |

---

## Business Purpose
> Welches Problem löst es? Welchen Umsatz-/Nutzerwert generiert es? (Für Notdienst/Enterprise: warum kauft der Kunde *deswegen*.)

## User Stories
- [ ] Als **Einsatzunternehmen** möchte ich […], damit […].
- [ ] Als **Personaldienstleister/Agentur** möchte ich […], damit […].
- [ ] Als **Worker** / **Staff** / **Owner** möchte ich […], damit […].

---

## Technische Implementierung

### API-Endpunkte
| Method | Path | Auth | Scope/Permission | Beschreibung |
|---|---|---|---|---|
| `GET` | `/api/…` | Session / API-Key | `read:<res>` / `requirePermission("…")` | … |

### Service & Datenmodell
- **Service:** `api/services/<service>.js` — Business-Logik (Routen nur HTTP/Zod-Validation).
- **Tabellen / Migrationen:** `<tabelle>` (`sql/migrations/NNN_*.sql`).
- **Org-Boundary:** jede Query org_id-gebunden; `assertLocationBelongsToOrg` wo Standort einfließt.

### Frontend
- **Seite/Route:** `frontend/public/…` bzw. `frontend/src/<center>/…`
- **Zustände:** Lade / Leer (Zero-State) / Fehler — alle real ausgelöst und sichtbar.

---

## Entitlement & RBAC
- **Plan-Gate:** `requireOrgFeature("<key>")` / `requireOrgLimit("<key>")` — Upgrade-Pfad sichtbar (kein generisches „nicht verfügbar").
- **RBAC:** zentrale Guards (`requirePermission`), keine Inline-Rollenchecks.
- **API-Key-Scope:** `requireScope("read|write:<res>")` für externe Integrationen.

## Audit & Sicherheit
- [ ] Jede mutierende Aktion auditiert (`auditLog.writeAudit`: action/entity/details/actor).
- [ ] CSRF auf mutierenden Session-Routen; Idempotency-Key wo nötig.
- [ ] `esc()` für user-supplied Werte in `innerHTML`; keine Secrets in Logs.
- [ ] Org-Boundary serverseitig (fremde Org → 403, nie 200 mit falschen Daten).

## Integration (falls relevant)
- **Outbound-Events:** `<event.key>` via `dispatchToIntegrations` (SUPPORTED_EVENTS).
- **Export/Format:** CSV / DATEV / SAP-Feldmapping.

---

## Test Coverage
- [ ] Service-Unit-Test (Mock-Pool: Verhalten + SQL-Form).
- [ ] Cross-Org/RBAC-Boundary (fremde Org / fehlender Scope → 403).
- [ ] Zero-State (leere Daten → `available:false`, kein 500).
- [ ] Verdrahtungs-Check (Endpoint → Fetch → DOM → Lade/Leer/Fehler → Handler).

## Definition of Done
- [ ] Tests + Lint + Build grün; volle Suite ohne Regression.
- [ ] End-to-End nutzbar (kein toter Pfad/Platzhalter/TODO).
- [ ] `docs/FEATURES_INDEX.md` aktualisiert (Status/Pläne/Quelle).
- [ ] Doku hält zeitgenauer Prüfung stand (keine toten Links).

## Changelog
| Datum | Änderung |
|---|---|
| YYYY-MM-DD | Initial |
