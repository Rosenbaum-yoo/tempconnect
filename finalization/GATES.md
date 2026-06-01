# Phase 4 — Track-Gates A, B, C

> Drei eigenständige Gates, eines pro Track. Müssen grün sein, bevor die Strecke als fertig gilt.

---

## Track-A-Gate — Marketplace Visibility Center

**GO nur wenn alle 18 Kriterien erfüllt:**

- [ ] Individuell-/Premium-Kunden können öffentliches Profil kontrolliert aktivieren
- [ ] Public Visibility ist standardmäßig OFF
- [ ] Öffentliche Profile sind nur bei `approved` sichtbar
- [ ] Profilaufrufe und Interaktionen werden anonymisiert getrackt
- [ ] Kunden sehen Profilreichweite aggregiert
- [ ] Bewertungen NUR nach FINALIZED Deal möglich und sichtbar
- [ ] Rankings basieren auf seriösem Score (nicht nur Likes)
- [ ] Toplisten/Rankings enthalten nur approved Profile
- [ ] Bountys beantragt, aber nur durch Staff freigegeben
- [ ] SCC enthält vollständige Verwaltung für Profile, Bountys, Rankings, Reviews, Abuse Reports
- [ ] Kritische Staff-Aktionen nutzen Step-up + Audit
- [ ] Feature-Gating greift im Backend UND Frontend
- [ ] Empty States professionell
- [ ] Keine 500 bei fehlenden Daten
- [ ] Tests für Kernlogik existieren (alle 7 Test-Bereiche aus M-12)
- [ ] Dokumentation vollständig (5 Doku-Dateien aus M-13)
- [ ] Bestehende Profile, Ratings, SCC, Plans, Public Profile nicht gebrochen
- [ ] Build + Tests grün

**Befehle für Track-A-Gate-Verifikation:**
```bash
# Backend
cd api && npm run test
cd api && npm run lint
# Migration
psql ... < sql/migrations/027_marketplace_visibility_center.sql  # idempotent prüfen
# Frontend
cd frontend && npm run build:scc
cd frontend && npm run typecheck
```

**Dokument:** `docs/releases/MARKETPLACE_GO_LIVE_DECISION.md`

---

## Track-B-Gate — Einsatzportal 90% Reife

**GO nur wenn alle 20 Kriterien erfüllt:**

1. [ ] Worker Login funktioniert und erzwingt Worker-Rolle
2. [ ] Alle Einsatzportal-Seiten nutzen Worker-only APIs
3. [ ] Worker sieht ausschließlich eigene Daten
4. [ ] Dashboard zeigt echte operative Handlungen
5. [ ] Einsätze können bestätigt/abgelehnt/unavailable gemeldet werden
6. [ ] Einsatzplan zeigt eigene Schichten wochenbasiert
7. [ ] **Stundenzettel im Einsatzportal nativ erstellt/bearbeitet/eingereicht** (KERN-Blocker!)
8. [ ] Status-Lifecycle (Entwurf/Submit/Korrektur/Kundenstatus/Abrechnung) verständlich
9. [ ] **Worker kann keine fremden `org_id` einschleusen** (Cross-Org-Härtung)
10. [ ] Nachweise sicher hochladbar/prüfbar/herunterladbar
11. [ ] Notifications und Staffing Requests handlungsfähig
12. [ ] Choice Sets funktionieren je Modus
13. [ ] Kontaktinformationen aus Assignment-Kontext
14. [ ] Statische Hilfe-Texte nicht hart falsch
15. [ ] CSRF-Fehler/401/403/409/422/500 sichtbar behandelt
16. [ ] Backend-Integrationstests bestehen
17. [ ] Neue Cross-Org-Negativtests bestehen
18. [ ] Browser-Smoke besteht
19. [ ] Keine neuen Links zu Legacy-`worker-timesheet.html`
20. [ ] Mobile Worker-Nutzung realistisch

**Befehle für Track-B-Gate-Verifikation:**
```bash
cd api && npm run test:integration -- worker
cd api && npm run lint
npx playwright test einsatzportal
# Manuelle Mobile-Abnahme
```

**Dokument:** `docs/releases/EINSATZPORTAL_GO_LIVE_DECISION.md`

**Score-Auswirkung:**
- Frontend-Verdrahtung: 55-65% → 88-92%
- Worker-UX: 60-70% → 88-92%
- Enterprise-Abnahme: 65-72% → 88-92%
- Gesamt: 68-72% → 88-92% (Ziel: ≥90%)

---

## Track-C-Gate — Terminologie-Umbenennung

**GO nur wenn alle 10 Kriterien erfüllt:**

1. [ ] Plattformweit alle sichtbaren Hauptbegriffe geprüft (Marktplatz, Bedarf, Requisition, Kapazität)

2. [ ] **Unternehmen sehen im UI primär:**
   - "Personal finden"
   - "Arbeitsplatz anbieten"
   - "Arbeitsplatzangebote"
   - "Verfügbares Personal"

3. [ ] **Personaldienstleister sehen im UI primär:**
   - "Arbeitsplatz finden"
   - "Personal einstellen"
   - "Verfügbares Personal"
   - "Offene Arbeitsplatzangebote"

4. [ ] "Marktplatz" aus kunden-/rollenrelevanten Hauptnavigationspunkten entfernt

5. [ ] "Bedarf" aus Unternehmens-CTAs und zentralen kundennahen Flows entfernt

6. [ ] "Kapazität einstellen" für Agency durch "Personal einstellen" ersetzt

7. [ ] **Technische Namen NICHT gebrochen:**
   - Keine DB-Renames
   - Keine API-Breaking-Changes
   - Keine entfernten Routen ohne Redirect/Alias
   - Keine Migration nur wegen UI-Sprache

8. [ ] Dokumentation vorhanden:
   - `docs/product/TERMINOLOGY_GUIDE.md`
   - `docs/product/TERMINOLOGY_RENAME_AUDIT.md`

9. [ ] Tests/Checks ausgeführt und dokumentiert

10. [ ] Ergebnis wirkt sprachlich wie professionelle B2B-SaaS-Plattform

**Befehle für Track-C-Gate-Verifikation:**
```bash
cd frontend && npm run lint
cd frontend && npm run typecheck
cd frontend && npm run build
cd api && npm run test
# Optional: Grep nach verbotenen Strings
grep -r "Bedarf einstellen" frontend/public/ frontend/src/  # sollte leer sein für Company-Surfaces
grep -r "Kapazität einstellen" frontend/public/ frontend/src/  # sollte leer sein für Agency-Surfaces
```

**Dokument:** `docs/product/TERMINOLOGY_RENAME_AUDIT.md` (mit Abschluss-Status)

---

## Gemeinsame Gate-Disziplin

- **Kein "fast grün" durchwinken** — eine offene Kriterium = NO GO
- **Jeder Gate-Pass dokumentiert** mit Datum, Commit-Hash, Verantwortlicher
- **Bei NO-GO:** Blocker in `docs/releases/PHASE4_OPEN_BLOCKERS.md`
- **Owner-Unterschrift** vor Live-Schaltung

---

## Track-D-Gate — Notification Experience

**GO nur wenn alle 9 Kriterien erfüllt:**

1. [ ] Bestehende Glocke erhalten + zur Quick-Preview präzisiert (kein zweites System)
2. [ ] Glocke + Cards aus EINER kanonischen Summary-Quelle (kein Doppelzählen)
3. [ ] Card-Badges erscheinen nur bei > 0, bei 0 ist Default vollständig unverändert
4. [ ] Jede relevante Notification hat card_target ODER dokumentierten Fallback
5. [ ] Deep Links führen zur fachlichen Quelle mit Fokus, Status synchronisiert
6. [ ] Activity Center bleibt erhalten + "Zur Quelle"
7. [ ] Card-Labels Track-C-konform (Terminologie)
8. [ ] Rollen-/Tenant-Sicherheit (Badge-Zahlen können sensibel sein, Cross-Tenant-Test)
9. [ ] Tests grün (Unit/API/Security/UI-Smoke)

**Verifikation:**
```bash
cd api && npm run test -- notification
cd api && npm run test:security -- notification
cd frontend && npm run build && npm run build:scc
```

**Dokument:** `docs/notifications/NOTIFICATION_GO_LIVE_DECISION.md`

---

## Track-E-Gate — Database / Migration / Hetzner

Track E hat **kundenstufige Gates** (wie Phase 5), nicht ein einzelnes Gate:

**Gate Kleine Betriebe:** Fresh DB Proof grün, Migrationen laufen, Backup aktiv, Restore-Test dokumentiert, SCC zeigt DB-Status, keine offenen Critical Migration Risks, App-Smoke grün.

**Gate Mittlere Betriebe (zusätzlich):** SCC Database Operations nutzbar, Migration Dry Run auf Staging, Backup-Jobs sichtbar, Restore-Test wiederholbar, Monitoring sichtbar, Index-/Performance-Prüfung, Rollenmodell für DB-Aktionen.

**Gate Große Betriebe (zusätzlich):** Staging/Production-Prozess, Owner-Freigabe für Prod-Migration, Audit vollständig, RPO/RTO dokumentiert, Incident Runbook, Performance-Baseline, Backup-Retention, Recovery-Plan.

**Gate Enterprise-Pilot (zusätzlich):** PITR geprüft oder begründet nicht aktiv, Security Review DB-Zugriff, Secrets-Rotation-Doku, SCC keine gefährlichen Aktionen, Restore-Dry-Run erfolgreich, Migration-Report vollständig, Production-Go-live-Checklist grün.

**Verifikation:**
```bash
npm run db:reset:fresh && npm run db:migrate && npm run db:verify && npm run smoke
cd api && npm run test:security -- database
```

**Dokument:** `docs/deployment/database_enterprise_readiness_report.md`

**Härtestes Kriterium:** Fresh-DB-Proof (`empty database → migrations → app starts → smoke pass`). Ohne ihn keine Production-DB.

---

## Verknüpfung mit anderen Gates

Phase-4-Gates sind **zusätzlich** zu Phase-1/2/3-Gates, NICHT Ersatz.

- **Track A** verknüpft mit Phase-3 SCC-Gates (Marketplace-Modul ist Teil von SCC)
- **Track B** verknüpft mit Phase-1 WAVE_04E (Timesheets/Spend-Wahrheit) und Phase-2 Gate B (Security)
- **Track C** verknüpft mit Phase-1 WAVE_10 (Premium UX) und Phase-2 Gate D (Product)

**Marktstart-GO** verlangt zusätzlich zu allen Phase-1/2/3-Gates:
- Track-B-Gate grün (Einsatzportal ist Kernfunktion — Pflicht)
- Track-C-Gate grün (oder bewusst als Post-Launch markiert)
- Track-E-Gate "Kleine Betriebe" grün (Fresh-DB-Proof ist Pflicht — keine Production-DB ohne Beweis)
- Track-A-Gate empfohlen, aber nicht zwingend (Premium-Feature, kann nach Launch kommen)
- Track-D-Gate empfohlen, aber nicht zwingend (UX-Verbesserung, kann nach Launch kommen)

**Hinweis:** Track E ist teils Pflicht (Fresh-DB-Proof = Marktstart-Blocker), wächst dann aber kundenstufig wie Phase 5. Track D ist reine UX-Aufwertung — Post-Launch möglich.
