# 01_PRIORITIES — Prioritätsmodell

> Wird zu jedem Ticket konsultiert. Bestimmt, was wann gemacht wird.

---

## P0 — Launch-Blocker

**Muss vor Marktstart gelöst sein.**

- Secrets oder lokale Artefakte im Release (`.env`, `.git`, `node_modules`, `.claude`, `.claire`, `.clone`, `.agents`, `.vercel`, Coverage, `release/`, `_zip_analysis/`)
- Auth-/Session-Schwächen in Kernbereichen
- Fehlende Tenant-Isolation (Cross-Org-Datenleck-Risiko)
- Kaputte Kernflows (Requisition → Spend)
- Falsche Billing-/Plan-Zugriffe
- Staff-/Owner-Funktionen sichtbar für Kunden
- Datenverlust-/Migrationsrisiken
- 500er in Kernseiten bei leerem oder normalem Datenbestand
- API-/Route-Fehler auf Kernseiten
- Falsche Sichtbarkeit mit Datenleck-Risiko
- Buchbare Premium-/Enterprise-Features ohne technische oder operative Deckung
- Worker/Staff/Admin-Session nicht trennbar
- SSO-Enforce ohne Break-Glass möglich
- Finance Export ohne Audit möglich

---

## P1 — Enterprise-kritisch

**Muss vor ernsthaften Pilotkunden oder Enterprise-Demos gelöst sein.**

- SSO sauber produktiv ODER klar Coming Soon/deaktiviert (kein Stub)
- API-Key-Scopes default-deny
- Audit-Export oder mindestens auditfähige Logs
- Contract-/Rahmenvertragsstatus und Versionierung
- Backup-/Restore-Nachweis
- Commercial Source of Truth (eine kanonische Plan-/Feature-Quelle)
- Staff-Freigabeprozesse für Custom Plans, Enterprise, SLA, SSO, große Rabatte, Add-ons
- KPI-Wahrheit im Executive Dashboard (jede Zahl mit Quelle, Definition, Drilldown)
- Professioneller Empty-/Error-State in Kernseiten
- Rollenmatrix vollständig dokumentiert
- Saubere Admin-/Staff-Prozesse
- Tenant-Isolation getestet (Cross-Org-Negativtests)

---

## P2 — Premium-Polish

**Soll vor öffentlichem Launch gelöst sein.**

- C-Level-Dashboard-Politur
- Hochwertige Tooltips und Microcopy
- Einheitliche UI-Komposition (Cards, Buttons, Tabellen, Filter, Badges)
- Light-/Dark-Mode-Konsistenz
- Demo-Daten und Onboarding-Erlebnis je Rolle
- Upgrade-/Cancel-/Enterprise-Request-UX
- Accessibility und responsive Kernseiten (Fokuszustände, Tastaturnavigation, Kontrast)
- Enterprise Copywriting (keine Basteltexte, keine technischen Interna für Kunden)

---

## P3 — Kontrollierter Backlog nach Launch

**Nur umsetzen, wenn P0–P2 stabil sind.**

- Nice-to-have-Visualisierungen
- Optionale Automationen
- Weitere Integrationen
- Komfortfeatures ohne unmittelbaren Launchwert
- Zusätzliche Cards / Reports
- Erweiterte Filter / Suchen ohne direkten Pilot-Bedarf

---

## Priorisierungsregel

1. Alle P0-Tickets erst abschließen → niemals neue P2/P3 starten, wenn P0 offen ist
2. Innerhalb einer Welle: P0 vor P1 vor P2 vor P3
3. Welle-übergreifend: Dependency-Gates aus `README.md` Abschnitt 3 beachten
4. Bei Unsicherheit über Priorität: Owner fragen, nicht raten
