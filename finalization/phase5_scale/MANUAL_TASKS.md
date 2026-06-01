# Phase 5 — Manuelle Aufgaben

> Diese Aufgaben muss der Owner durchführen. Claude Code liefert Vorlagen und sichere deaktivierte Integration, aber nicht die Durchführung.

---

## Billing / Stripe (Phase D) — VOLLAUTOMATISCH AB TAG 1

**Entscheidung:** Kein manuelles Rechnungswesen. Stripe Billing ab dem ersten Kunden. Diese Aufgaben sind Marktstart-Blocker für Gate 10.

- [ ] **Stripe-Account** erstellen (Pflicht — kein Start ohne)
- [ ] **Stripe Secret Key** erzeugen und im Secret Manager setzen
- [ ] **Stripe Webhook Secret** erzeugen und setzen
- [ ] **Price-IDs** in Stripe anlegen (pro Plan: BASIS, PLUS, PRO)
- [ ] **SEPA Direct Debit** in Stripe aktivieren (für deutsche B2B-Kunden wichtig)
- [ ] **Stripe Tax** konfigurieren (automatische USt-Berechnung) — optional aber empfohlen
- [ ] **Stripe Billing Portal** aktivieren (Kunden-Selbstverwaltung)
- [ ] **Dunning / Smart Retries** in Stripe konfigurieren (automatisches Mahnwesen)
- [ ] **Preise final festlegen** (monatlich netto, Setup-Fee, Rabatte)
- [ ] **Rechnungs-Branding** in Stripe hinterlegen (Logo, Firmendaten, USt-ID)
- [ ] **Zahlungsziel** für INDIVIDUELL/Konzern festlegen (z.B. net 30 via Stripe Invoicing)

**Claude Code liefert:** `BillingProviderService` mit `stripe` (Standard), automatische Subscription-/Invoice-Logik, SEPA-Flow, Webhook-Handler, Dunning-Anbindung. **Niemals echte Keys.**

**Wichtige Präzisierung — was "keine manuelle Rechnung" bedeutet:**
- Rechnungen existieren weiterhin (im B2B gesetzlich nötig für Buchhaltung/USt)
- ABER: Stripe generiert sie automatisch — du erstellst keine einzige von Hand
- Auch INDIVIDUELL/Enterprise läuft über Stripe Invoicing (custom Betrag), nicht über Excel/PDF
- Der manuelle Fallback (`MANUAL_INVOICE_FALLBACK_ENABLED`) ist standardmäßig AUS — nur für echte Notfälle

**Honest Caveat (lies das):** Bei reinen Großkonzern-Enterprise-Deals (selten, hohe Beträge) verlangen Einkaufsabteilungen manchmal Rechnung auf Bestellung mit eigenem Purchase-Order-Prozess statt Stripe-Subscription. Das deckt Stripe Invoicing mit net-30-Zahlungsziel ab — immer noch automatisch generiert, kein Handarbeit. Nur falls ein Konzern explizit ein eigenes Lieferantenportal erzwingt, brauchst du den manuellen Fallback. Für 10-300 normale B2B-Kunden ist das kein Thema — Stripe deckt alles ab.

---

## E-Mail / SendGrid (Phase E)

- [ ] **Versanddomain** festlegen (z.B. `mail.tempconnect.de`)
- [ ] **SPF-Record** einrichten (DNS)
- [ ] **DKIM-Record** einrichten (DNS)
- [ ] **DMARC-Record** einrichten (DNS)
- [ ] **SendGrid-Account** erstellen (oder SMTP-Provider wählen)
- [ ] **SendGrid API Key** erzeugen und setzen
- [ ] **SendGrid Webhook Secret** für Bounce-Tracking setzen
- [ ] **Absender-Name/Reply-To** festlegen
- [ ] **Support-Mailadresse** einrichten

**Claude Code liefert:** `EmailProviderService` mit `console`/`smtp`/`sendgrid`/`disabled`, DNS-Templates. **Niemals echte Keys.**

**Standard-Empfehlung für Start:** SMTP oder console-Provider. SendGrid für professionelle Zustellung ab ersten echten Kunden.

---

## Hetzner / Infrastruktur (Phase G)

- [ ] **Hetzner Projektstruktur** festlegen
- [ ] **Hetzner API Token** erzeugen (read + safe-write, NICHT admin)
- [ ] **Token** im Secret Manager setzen
- [ ] **Server/LB/Volumes labeln** (`project=tempconnect`, `env=prod|staging`)
- [ ] **Backup-Strategie** + Kosten freigeben
- [ ] **Snapshot-Strategie** festlegen
- [ ] **Entscheiden:** welche Aktionen aus SCC erlaubt (Reboot? Backup?)

**Claude Code liefert:** `InfrastructureProviderService` mit `hetzner`/`manual`/`disabled`, Action Matrix. **Niemals echtes Token.**

→ Detail: Phase 3 `phase3_scc/MANUAL_TASKS.md` Abschnitt 4.

---

## Commercial / Pricing (Phase C)

- [ ] **Preise pro Plan final** (DEMO/BASIS/PLUS/PRO/INDIVIDUELL)
- [ ] **Planlimits** entscheiden (User, Orgs, Standorte, API-Calls, Einsätze, Worker)
- [ ] **Individuell-Tarif-Prozess** festlegen (wer prüft, wer gibt frei)
- [ ] **Mindestlaufzeit / Kündigungsfrist** festlegen
- [ ] **SLA-Level** definieren (welche Stufen, operativ haltbar?)
- [ ] **Setup-Fees / Rabatt-Regeln** festlegen
- [ ] **Vertragstexte** für individuelle Tarife (Anwalt)

**Claude Code liefert:** Commercial Desk Modul, Tarif-Workflow, Dokument-Templates. **Keine finalen Preise, keine Rechtstexte.**

---

## Theme / Design (Phase J)

- [ ] **Ultra-Premium-Theme:** finale Farbwelt/Markenfarben festlegen
- [ ] **Logo/Brand-Assets** für Themes bereitstellen
- [ ] **Entscheiden:** welche Themes öffentlich, welche nur intern
- [ ] **Default-Theme bestätigen** (bleibt aktuelles Design)

**Claude Code liefert:** Theme Registry, Token-System, SCC Theme Control. **Keine finalen Markenentscheidungen.**

---

## Security / Legal / Compliance (Phase N)

- [ ] **Alle Secrets rotieren** (falls je in Artefakt gelandet) — siehe Phase 2 `MANUAL_TASKS.md`
- [ ] **Datenschutzerklärung** finalisieren (Anwalt)
- [ ] **AGB / SaaS-Vertrag** finalisieren (Anwalt)
- [ ] **AVV / DPA** erstellen (Anwalt)
- [ ] **TOMs** dokumentieren
- [ ] **Subprocessor-Liste** (Stripe, SendGrid, Hetzner, Sentry)
- [ ] **Löschkonzept + Retention** rechtlich prüfen
- [ ] **Externe Security-Prüfung** beauftragen (ab ernsthaftem Enterprise-Vertrieb)

**Claude Code liefert:** Security-Härtung, DSGVO-Text-Vorlagen, TOM-Vorlage. **Niemals juristische Garantie, niemals echte Secrets.**

---

## Deployment / Betrieb (Phase P)

- [ ] **Produktivumgebung** aufsetzen (Hetzner Server/Managed DB)
- [ ] **Domain + TLS** einrichten
- [ ] **Backup-Ziel** einrichten (separater Standort)
- [ ] **Monitoring-Konto** (Sentry o.ä.)
- [ ] **Restore-Drill** mindestens einmal durchführen (mit Claude Code als Anleitung)
- [ ] **Incident-Verantwortliche** + Eskalationsweg definieren
- [ ] **On-Call-Rotation** (falls relevant)

**Claude Code liefert:** Deployment-/Backup-/Rollback-/Incident-Runbooks. **Keine tatsächliche Infrastruktur-Provisionierung.**

---

## Lernschleife (Self-Updating CLAUDE.md)

- [ ] **Auto-Approve-Kategorien** entscheiden (Empfehlung: nur EFFIZIENZ)
- [ ] **Token-Budget** für CLAUDE.md-Lernabschnitte (Empfehlung: 100/60 Zeilen)
- [ ] **Konsolidierungs-Takt** festlegen (Empfehlung: alle 5 Phasen)
- [ ] **Regelmäßig `proposals.md` reviewen**

→ Detail: `SELF_UPDATING_CLAUDE_MD.md` Abschnitt 12.

---

## Aufgaben-Checkliste

`docs/finalization/phase5_manual_tasks_checklist.md`:

```md
| Phase | Aufgabe | Status | Datum | Verantwortlich | Notiz |
|---|---|---|---|---|---|
| D | Stripe-Account + Keys + Price-IDs (Marktstart-Blocker) | offen | — | Owner | Vollautomatisch ab Tag 1 |
| D | SEPA + Stripe Tax + Billing Portal aktivieren | offen | — | Owner | Für deutsche B2B-Kunden |
| E | SendGrid-Key ODER SMTP | offen | — | Owner | DNS SPF/DKIM/DMARC |
| G | Hetzner-Token | offen | — | Owner | read + safe-write |
| C | Preise final | offen | — | Owner | mit Vertrieb |
| J | Ultra-Premium-Farbwelt | offen | — | Owner | Branding |
| N | Rechtstexte | offen | — | Owner | Anwalt |
| P | Restore-Drill | offen | — | Owner | mit Claude Code |
| Lernschleife | Auto-Approve-Config | offen | — | Owner | nur EFFIZIENZ |
| ... | ... | ... | ... | ... | ... |
```

---

## Standard-Empfehlung für Start mit 10 Kunden

Vollautomatisches Billing ist ab Tag 1 Pflicht (deine Effizienz-Entscheidung). Andere externe Dienste kannst du gestaffelt einrichten:

| Bereich | Start (10 Kunden) | Später (50+) |
|---|---|---|
| Billing | **Stripe vollautomatisch** (Subscriptions, Auto-Rechnung, SEPA) | unverändert, ggf. Stripe Tax verfeinern |
| E-Mail | SMTP/console | SendGrid |
| Hetzner Control | disabled (manuell) | aktiviert |
| AI Operations | disabled | aktiviert mit Review |
| Theme | current_default | + Ultra Premium |

**Billing ist die Ausnahme:** Es startet sofort vollautomatisch, weil manuelles Rechnungswesen bei deinem Skalierungsziel (bis 300 Kunden) ineffizient und fehleranfällig wäre. Stripe-Keys sind damit Marktstart-Blocker für Gate 10 — ohne sie kein automatisiertes Billing, also kein Start mit zahlenden Kunden.

**Warum Billing anders behandelt wird als Hetzner/AI:** Hetzner-Control und AI-Ops sind interne Komfort-Features, die du nachrüsten kannst. Billing ist der Geldfluss — der muss von der ersten Rechnung an sauber und automatisch laufen, sonst sammelst du manuellen Aufwand an, der mit jedem Kunden wächst.

---

## Warum die saubere Trennung wichtig ist

Wenn Claude Code "Stripe-Keys gesetzt", "Hetzner-Token konfiguriert" oder "Preise festgelegt" meldet, ist das eine **Halluzination**. Diese Aufgaben brauchen echte externe Konten und menschliche Entscheidungen.

**Die Customer Gates können nicht ohne diese manuellen Aufgaben grün werden** — aber durch Feature Flags blockieren fehlende externe Dienste nicht den Code-Fortschritt.
