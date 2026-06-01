# WAVE_03 — Rollen-, Rechte- und Sichtbarkeitsmatrix

> **Phase:** Foundation. **Prio:** P0/P1. **Voraussetzung:** WAVE_00–02 abgeschlossen.
> **Ausführungsagent:** Backend-/Frontend-Mix — Owner-Freigabe für Backend-Änderungen

---

## Ziel

Falsche Sichtbarkeit wird VOR Bugfixes geklärt. Kunden sehen keine internen Funktionen. Vendoren sehen keine fremden Daten. Staff/Owner ist strikt getrennt. **UI-Ausblendung ist nie der einzige Schutz** — serverseitige Guards sind Pflicht.

---

## Kernrollen (verbindlich)

Jede Seite, Card, Aktion und API muss eindeutig wissen, für welche Rolle:

1. **Unternehmen / Kunde** (Einkäufer-Seite)
2. **Unternehmens-Admin**
3. **Vendor / Zeitarbeitsfirma**
4. **Vendor-Admin**
5. **Disponent** (operative Vendor-Rolle)
6. **Worker / Mitarbeiter**
7. **TempConnect Staff** (intern, kundenfern)
8. **TempConnect Owner** (intern, operativ)
9. **Finance / Billing**
10. **Auditor / Read-only**
11. **Enterprise- / Konzernrolle** (Multi-Mandant)

---

## Aufgaben

### 1. Rollenmatrix erstellen

`docs/ROLE_VISIBILITY_MATRIX.md` mit Spalten:

- Seite
- Card
- Aktion
- API-Endpunkt
- Erlaubte Rollen
- Erforderlicher Plan / Add-on
- UI-Zustand: sichtbar / ausgeblendet / soft-locked / Coming Soon
- Serverseitiger Guard (welche Middleware / welcher `requirePermission(...)`)
- Empty State / Upgrade-Hinweis (Copy)

### 2. Serverseitige Fehlercodes vereinheitlichen

Pflicht-Fehlercodes:

- `AUTH_REQUIRED` (kein Login)
- `ORG_REQUIRED` (kein Org-Kontext)
- `PLAN_REQUIRED` (falscher Plan)
- `FEATURE_NOT_ENABLED` (Add-on fehlt)
- `PERMISSION_DENIED` (Rolle reicht nicht)
- `NOT_FOUND` (Objekt existiert nicht ODER nicht im Scope)
- `TENANT_SCOPE_REQUIRED` (Cross-Tenant-Versuch)

**Wichtig:** `NOT_FOUND` statt `PERMISSION_DENIED` zurückgeben, wenn die Existenz eines Objekts nicht offenbart werden soll (z. B. fremde Org-Daten).

### 3. UI- und API-Synchronisation

Pro Seite/Card prüfen:

- Kein Button ohne erlaubte Aktion (UI zeigt nichts, was die Rolle nicht darf)
- Keine API ohne Guard (UI-Ausblendung reicht nie)
- Keine Card ohne klare Rollen-/Plan-Entscheidung
- Keine internen Links im Kundenmenü
- Keine Vendor-Daten im Unternehmenskontext, außer explizit erlaubt

### 4. Triage: für jede Seite klären

1. Für welche Rolle ist die Seite gedacht?
2. Ist die Seite überhaupt notwendig oder Legacy?
3. Gibt es doppelte HTMLs für dieselbe Funktion?
4. Welche Plan-/Add-on-Bedingungen gelten?
5. Was passiert für nicht berechtigte Rollen — 404 / 403 / Redirect / Soft-Lock / Upgrade-Pitch?

### 5. Surface-Trennung enforcen

- **OCC** (`/owner-control/`) ist nicht mit Admin Panel, Staff Control Center, Support-Ops, Organization Control Center vermischt
- **Staff Control Center** (`/staff/` und `/staff/api/*`) ist getrennt
- **Support-Ops** (`/support-ops/`) ist getrennt
- **Organization Control Center** (`/public/organization.html`, `/api/org/*`) ist die Kunden-Org-Verwaltung
- **Admin Panel** (`admin_panel.html`) ist getrennt

### 6. Cross-Tenant-Negativtests

Pro sensible Domäne (Requisitions, Vendor Pool, Workers, Assignments, Timesheets, Contracts, Billing, Documents, Audit, Dashboard, Referral/Credits) mindestens einen Test:

- Org A versucht Org-B-Daten zu lesen → `NOT_FOUND` oder `TENANT_SCOPE_REQUIRED`
- Org A versucht Org-B-Daten zu schreiben → `PERMISSION_DENIED`

---

## Akzeptanzkriterien

- [ ] `docs/ROLE_VISIBILITY_MATRIX.md` existiert und deckt alle Kernseiten ab
- [ ] Jede sensible Route hat einen serverseitigen Guard (nicht nur UI)
- [ ] Fehlercodes sind vereinheitlicht (Liste aus Abschnitt "Aufgaben 2")
- [ ] Cross-Tenant-Negativtests existieren für alle sensiblen Domänen
- [ ] Surface-Trennung ist eingehalten (OCC, Staff, Support-Ops, Admin, Org separat)
- [ ] Kein Button in der UI existiert ohne entsprechenden API-Guard
- [ ] Bei Unsicherheit über Rolle: Standardentscheidung getroffen (z. B. ausblenden) und im Decision Board dokumentiert
- [ ] Inline-Rollenchecks sind durch zentrale Guards (`requirePermission(...)`) ersetzt

---

## Stop-Regeln

- Wenn eine Seite keinen klaren Rollen-Owner hat → STOP, Owner-Entscheidung
- Wenn ein Server-Guard `permissiv` fehlschlägt (kein Org-Kontext = volle Sicht) → SOFORT als P0-Sicherheitslücke markieren
- Wenn UI-Ausblendung und API-Guard widersprüchlich sind → API-Guard ist Wahrheit, UI angleichen

---

## Triage-Hinweis (kritisch)

Sehr viele scheinbare Bugs in TempConnect sind in Wahrheit **Rollen-/Sichtbarkeitsfragen**. Beispiele:
- "Worker sieht Card X" → Bug? Oder soll die Card für Worker einfach nicht sichtbar sein?
- "Vendor sieht fremde Daten" → Bug? Oder fehlender Org-Scope-Guard?
- "Unternehmen sieht Staff-Funktion" → Bug? Oder falsche Navigation?

**Erst klären, dann fixen.** Siehe `SPECIAL_bugboard_triage.md`.

---

## Output

Standard-Output plus:

```
## Rollen-Matrix-Status
- Kernseiten abgedeckt: X / Y
- Server-Guards vorhanden: X / Y
- Cross-Tenant-Tests: X / Y sensible Domänen
- Vereinheitlichte Fehlercodes implementiert: ja/nein
- Surface-Verstöße gefunden: Liste
- Inline-Rollenchecks ersetzt: X / Y
```

---

## Übergang

→ Foundation ist abgeschlossen, wenn WAVE_00–03 grün. Dann WAVE_04 (Core Business).
