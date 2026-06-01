# Customer Gates — 10 / 50 / 100 / 300 zahlende Kunden

> Kundenmengenbasierte Gates. Jedes Gate ist eine technische Schwelle, keine Behauptung. Erst grün, dann nächste Kundenstufe.

---

## Grundprinzip

Claude Code darf NICHT behaupten "zahlende Kunden sind garantiert". Stattdessen: **harte technische Gates**. Die Plattform gilt erst als bereit für eine Kundenstufe, wenn das jeweilige Gate grün ist.

---

## Gate 10 — Minimaler produktiver Betrieb

**Schwelle: erste 10 zahlende Kunden.**

- [ ] Auth stabil
- [ ] Rollen sauber
- [ ] Organisationstrennung geprüft (Cross-Org-Negativtests bestehen)
- [ ] Individuelle Tarife aktivierbar (Phase C)
- [ ] **Vollautomatisches Stripe Billing produktiv** (Phase D) — Subscriptions, Auto-Rechnung, SEPA, KEINE manuelle Rechnung
- [ ] E-Mail vorbereitet (Phase E — mindestens console/SMTP)
- [ ] SCC Customer Operations nutzbar (Phase B)
- [ ] Supportprozess vorhanden (Phase M)
- [ ] Monitoring-Basis sichtbar (Phase I — `/health`, `/ready`)
- [ ] Backup/Restore dokumentiert (Phase P)
- [ ] Kernflows getestet (Phase O)
- [ ] Keine offenen kritischen 500er
- [ ] Keine echten Secrets im Release (Phase 2 WAVE 01)

**Verifikation:**
```bash
cd api && npm run test:ci
cd api && npm run test:tenant
cd api && npm run test -- billing   # Stripe-Subscription + Webhook-Idempotenz
./scripts/release-verify.sh dist/tempconnect-<version>.zip
curl localhost:PORT/health
```

**Billing-spezifisch (Gate 10):** Stripe-Subscription erzeugt automatisch Rechnung, SEPA-Mandat funktioniert, Webhooks idempotent, `payment_failed` triggert Dunning + Status. Manueller Fallback ist deaktiviert.

**Dokument:** `docs/finalization/gate_10_decision.md`

---

## Gate 50 — Stabiler Betrieb

**Schwelle: bis 50 zahlende Kunden. Zusätzlich zu Gate 10:**

- [ ] Bessere Pagination (keine unlimitierten Listen)
- [ ] Stabile Entitlements (Tarifstatus → Feature-Zugriff konsistent)
- [ ] Billingstatus sauber (Phase D)
- [ ] Mailzustellung sichtbar (Phase E — SCC Mail Center)
- [ ] Staff-Prozesse sauber (Phase F)
- [ ] Incident-Modell vorhanden (Phase I)
- [ ] Hetzner-Status sichtbar (Phase G)
- [ ] Deployment-/Backup-Jobs vorbereitet (Phase P)
- [ ] Theme-System stabil (Phase J)
- [ ] Support priorisierbar (Phase M)
- [ ] Smoke-Test-Suite grün

**Verifikation:**
```bash
cd api && npm run test:integration
npx playwright test smoke
cd frontend && npm run build:scc
```

**Dokument:** `docs/finalization/gate_50_decision.md`

---

## Gate 100 — Differenzierter Betrieb

**Schwelle: bis 100 zahlende Kunden. Zusätzlich zu Gate 50:**

- [ ] Monitoring differenziert (Phase I — Fehlertrend, langsame Endpoints)
- [ ] Langsame Endpoints sichtbar
- [ ] DB-Indizes geprüft (Phase Q)
- [ ] Queue-/Job-Status sichtbar
- [ ] Customer Health Score oder Customer Risk Indicators (Phase B)
- [ ] Bessere Commercial-/Billing-Auswertungen (Phase C/D)
- [ ] Admin-/Owner-Audit stark (Phase F/N)
- [ ] Infrastruktur-Runbooks vorhanden (Phase P)
- [ ] AI-Operations nur mit Review-Freigabe (Phase H)

**Verifikation:**
```bash
# Performance-Check auf realistischer Datenmenge
cd api && npm run test:performance  # falls vorhanden
# Index-Prüfung
psql ... -c "\di"  # Indizes auflisten
```

**Dokument:** `docs/finalization/gate_100_decision.md`

---

## Gate 300 — Skalierungsfähiger Betrieb

**Schwelle: bis 300 zahlende Kunden. Zusätzlich zu Gate 100:**

- [ ] Skalierungsfähige Listen und Filter (Phase Q)
- [ ] Keine unlimitierten großen Datenabfragen
- [ ] Robuste Job-Verarbeitung (unter Last stabil)
- [ ] Klare Backups (Restore-Drill durchgeführt)
- [ ] Incident-Prozess (vollständig, nicht nur Modell)
- [ ] Onboarding-Checklisten (pro Rolle)
- [ ] Infrastrukturstatus (Phase G)
- [ ] Kosten-/Ressourcenindikatoren (Phase Q — wirtschaftlich relevant!)
- [ ] Enterprise-Readiness-Doku (Phase 3 Enterprise Pack)
- [ ] Klare Grenzen für nicht vollständig automatisierte Prozesse (ehrlich dokumentiert)

**Verifikation:**
```bash
# Last-Test mit 300+ simulierten Datensätzen
# Kosten-Indikatoren prüfen
# Vollständige Test-Suite + Burn-in (Phase 2 WAVE 16)
```

**Dokument:** `docs/finalization/gate_300_decision.md`

---

## Gate-Disziplin

- **Kein "fast grün" durchwinken** — eine offene Kriterium = Gate NICHT erreicht
- **Jedes Gate dokumentiert** mit Datum, Commit-Hash, Verantwortlicher
- **Bei NO-GO:** Blocker in `docs/finalization/open_risks_and_blockers.md`
- **Owner-Bestätigung** vor Aufnahme der nächsten Kundenstufe

---

## Wirtschaftlichkeits-Verknüpfung (kritisch für diese Phase)

Bei jedem Gate die **Skalierungskosten** mitdenken:

| Gate | Wirtschaftliche Frage |
|---|---|
| 10 | Reichen aktuelle Ressourcen? Was kostet ein Kunde? Stripe-Gebühren einkalkuliert? |
| 50 | Skaliert Dunning/SEPA automatisch? Welche Zahlungsausfälle? |
| 100 | Welche Queries werden teuer? Caching-Bedarf? Stripe-Webhook-Last? |
| 300 | Wo sind die Ressourcen-Hotspots? Hetzner-Kosten pro Kunde? Billing vollautomatisch ohne Personalaufwand? |

Wirtschaftliche Erkenntnisse pro Gate → in die Lernschleife (Kategorie WIRTSCHAFTLICHKEIT, siehe `SELF_UPDATING_CLAUDE_MD.md`).

---

## Verknüpfung mit anderen Phasen-Gates

Die Customer Gates sind **zusätzlich** zu den Phasen-Gates der anderen Phasen:

- **Gate 10** verlangt mindestens: Phase 1 Foundation + Phase 2 Gate A (Technical) + Phase 5 Phasen A-F partiell
- **Gate 50** verlangt: Phase 2 Gates A-E + Phase 3 SCC-Gates + Phase 5 bis Phase J
- **Gate 100** verlangt: alle Phase-1/2/3-Gates + Phase 5 bis Phase Q partiell
- **Gate 300** verlangt: ALLE Gates aller Phasen + Phase 2 WAVE 16 Burn-in + Phase 5 vollständig

**Marktstart mit ersten zahlenden Kunden = Gate 10 grün.** Danach wächst du kontrolliert Gate für Gate.
