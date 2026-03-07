# TempConnect – Vendor Pool Konzept

## Zweck
Der Vendor Pool verwaltet die Beziehung zwischen Client-Organisationen (Unternehmen) und Supplier-Organisationen (Zeitarbeitsfirmen). Jeder Client hat seinen eigenen Pool mit Tier-basierter Klassifizierung.

## Tier-Modell
| Tier | Bedeutung | Matching-Bonus |
|------|-----------|----------------|
| **PREFERRED** | Bevorzugter Lieferant, höchste Priorität | +5 Punkte |
| **SECONDARY** | Standard-Lieferant | +3 Punkte |
| **TRIAL** | Testphase, neue Lieferanten | +2 Punkte |
| **RESTRICTED** | Eingeschränkt, unter Beobachtung | 0 Punkte |
| **BLOCKED** | Gesperrt, keine Zusammenarbeit | Ausgeschlossen |

## Status
- **active** – Normal aktiv im Pool
- **suspended** – Temporär gesperrt (z.B. Compliance-Verstoß)
- **removed** – Soft-Delete, aus Pool entfernt

## Datenmodell (vendor_pool)
- `client_org_id` – UUID der Client-Organisation
- `supplier_org_id` – UUID der Supplier-Organisation
- `tier` – PREFERRED | SECONDARY | TRIAL | RESTRICTED | BLOCKED
- `category` – Optionale Kategorie (z.B. "Produktion", "Logistik")
- `location_id` – Optionaler Standort-Bezug
- `department_id` – Optionale Abteilung
- `valid_from` / `valid_until` – Gültigkeitszeitraum
- Unique Constraint: (client_org_id, supplier_org_id, category, location_id, department_id)

## API-Endpunkte
- `GET /api/vendor-pool?client_org_id=...` – Pool-Liste
- `GET /api/vendor-pool/my?supplier_org_id=...` – Eigene Pool-Mitgliedschaften
- `GET /api/vendor-pool/stats?client_org_id=...` – Statistik nach Tier
- `POST /api/vendor-pool` – Supplier hinzufügen (RBAC: vendor_pool.manage)
- `PATCH /api/vendor-pool/:id/tier` – Tier ändern
- `PATCH /api/vendor-pool/:id/status` – Status ändern
- `DELETE /api/vendor-pool/:id` – Soft-Delete

## Integration mit Matching
Die Matching Engine (`matchingEngine.js`) berücksichtigt den Vendor-Pool-Tier als Scoring-Faktor. PREFERRED-Lieferanten erhalten einen Bonus, BLOCKED werden ausgeschlossen.
