# Phase 4 — Manuelle Aufgaben

> Diese Entscheidungen muss der Owner treffen. Claude Code liefert Vorlagen.

---

## Track A — Marketplace Visibility Center

### Produktentscheidungen

- [ ] **Begriffe finalisieren** für Marktauftritt (Track-C-konform)
- [ ] **Plan-Zuordnung bestätigen:** welche Features in welchem Plan (siehe `TRACK_A_MARKETPLACE.md` Plan-Gates-Tabelle)
- [ ] **`marketplace_featured_profile`:** ist das nur Enterprise oder zusätzlich als Add-on buchbar?
- [ ] **Bounty-Reward-Cap festlegen:**
  - Maximaler Geldwert pro Bounty (in Cent)
  - Maximaler Visibility-Boost in % (Empfehlung: max 10%)
  - Anzahl gleichzeitig aktiver Bountys pro Kunde
- [ ] **Ranking-Boost-Cap final:** max +10% durch Featured/Bounty (Empfehlung)
- [ ] **Ranking-Erklärbarkeit:** wie viel Score-Detail zeigen wir dem Kunden? (vollständige Gewichtung oder Zusammenfassung)
- [ ] **Top-N-Listen:** Top 100, Top 1000, oder mehr?
- [ ] **Public Profile Bewertungs-Anonymisierung:**
  - Standard: anonym
  - Premium: optional Firmenname mit Einwilligung
  - Entscheidung dokumentieren

### Datenschutz-Entscheidungen

- [ ] **Server-Salt für Hashing** sicher erzeugen und setzen (im Secret Manager)
- [ ] **Datenschutz-Text** auf Public Profile anpassen (Anwalt prüfen lassen)
- [ ] **Cookie-/Tracking-Banner** aktualisieren falls nötig
- [ ] **Do-Not-Track-Header** respektieren (Entscheidung: ja/nein)
- [ ] **Retention für `profile_view_events`** festlegen (Empfehlung: 90 Tage gerollte Aggregate, dann Rohdaten löschen)

### Operative Entscheidungen

- [ ] **Wer im Staff darf Profile freigeben?** (SCC-Berechtigung)
- [ ] **Wer im Staff darf Bountys aktivieren?** (Step-up erforderlich)
- [ ] **Wer im Staff darf Rankings rebuilden?** (Step-up erforderlich)
- [ ] **SLA für Profil-Review:** wie schnell muss Staff entscheiden? (z. B. 48h)
- [ ] **SLA für Bounty-Review:** dito

---

## Track B — Einsatzportal

### Produktentscheidungen

- [ ] **Statische Hilfe-Texte:** welche Regeln sind konfigurierbar pro Kunde, welche bleiben generisch?
  - Stundenzettel-Frist (pro Kunde/Vertrag konfigurierbar)
  - Krankmeldung (generisch oder pro Org)
  - AU-Regel (vertraglich, oft pro Kunde)
  - Notfallhinweise (pro Assignment)
- [ ] **Support-Ticket vs. direkte Nachricht an Disponent:** welcher Weg?
- [ ] **Public Worker Profile:** soll das überhaupt existieren? (Entscheidung)
  - Wenn ja: separate Einwilligung im Profil
  - Wenn nein: alle Public-Verweise entfernen
- [ ] **Mobile-Strategie:** mobile-first responsive ODER native App-Wrapper später?
- [ ] **Choice-Set-Modi:** welche Modi sind aktiv (Präferenz/Ranking/Auswahl/Ablehnen alles)?

### Operative Entscheidungen

- [ ] **Dispatcher-Eskalation:** wann erhält Disponent automatische Benachrichtigung bei `unavailable`?
- [ ] **Korrektur-Workflow:** wer darf nach Submit noch ändern (Worker, Disponent, Customer)?
- [ ] **Dokument-Ablehnung:** welche Texte gehen an Worker bei Rejection?
- [ ] **Public Profile-Einwilligung:** wo wird sie eingeholt (Onboarding / Profil / Beides)?

### Tech-Entscheidungen

- [ ] **Inline-JS-Migration:** bleiben einige Seiten als HTML+Inline-JS, oder vollständige Migration auf `js/workerPortal/*`? (Empfehlung: vollständige Migration für Wartbarkeit)
- [ ] **Compatibility Mode:** wie lange darf altes Frontend noch `org_id` senden? (Empfehlung: 4 Wochen Übergang mit Audit-Log, dann hart blocken)

---

## Track C — Terminologie

### Produktentscheidungen (kritisch)

- [ ] **Begriffe final freigeben** mit Vertrieb/Produktmanagement:
  - "Personal finden" / "Arbeitsplatz anbieten" (Company)
  - "Arbeitsplatz finden" / "Personal einstellen" (Agency)
  - "Vermittlungsbereich" (Staff)
- [ ] **Konkurrenz-Check:** verwendet Wettbewerb dieselben Begriffe? (Differenzierung wichtig)
- [ ] **SEO-Auswirkung:** alte Begriffe in Marketing-Texten und Website-Indexierung
- [ ] **Pricing-Page-Sprache:** stimmen die neuen Begriffe mit Plan-Beschreibungen überein?

### Operative Entscheidungen

- [ ] **Rollout-Strategie:**
  - A) Alles auf einmal (Big-Bang) — risikoreich
  - B) Phasenweise je Rolle (erst Company-Surfaces, dann Agency, dann Worker)
  - C) Feature-Flag-basiert mit A/B-Test (sehr aufwendig)
  - Empfehlung: B
- [ ] **Kundenkommunikation:** brauchen Pilot-Kunden Vorabinformation über Begriffsänderungen?
- [ ] **Support-Briefing:** Support-Team muss über neue Begriffe informiert sein bevor Live
- [ ] **Sales-Materialien:** Slides, One-Pager, Demo-Skripte aktualisieren

### Technische Entscheidungen für später

- [ ] **i18n-Einführung:** wenn ja, wann? (großes separates Projekt)
- [ ] **Spätere technische Renames:** Liste aus Audit-Datei priorisieren
- [ ] **API-Aliase:** sollen alte und neue Routen parallel existieren? (Aufwand-Nutzen prüfen)

---

## Track D — Notification Experience

### Produktentscheidungen
- [ ] **Polling-Intervall** festlegen (Balance Aktualität vs. Last — Empfehlung: 30-60s)
- [ ] **Welche Notification-Typen sind "handlungsrelevant"** (Glocke) vs. nur Activity Center?
- [ ] **bell_priority-Schwellen** definieren (was ist urgent/critical?)
- [ ] **Card-Popover bei mehreren Notifications:** Mini-Liste oder direkt zur Übersicht?

### Keine externen Konten nötig
Track D braucht keine externen Dienste — reines Frontend/Backend-Feature. Claude Code kann es vollständig umsetzen.

---

## Track E — Database / Migration / Hetzner

### Hosting-Entscheidung (kritisch, Owner)
- [ ] **Self-managed Hetzner vs. Managed PostgreSQL** entscheiden (nach Lektüre des Entscheidungsdokuments)
- [ ] Empfehlung pro Kundenstufe (Pilot/10/50/100/300/Enterprise) bestätigen

### Hetzner / DB Setup (Owner)
- [ ] **Hetzner DB Server** bereitstellen (falls Self-managed)
- [ ] **PostgreSQL-Version** festlegen
- [ ] **Managed-Provider** wählen + Account (falls Option B)
- [ ] **DATABASE_URL + SSL** im Secret Manager setzen
- [ ] **Firewall** konfigurieren (nur App → DB)
- [ ] **Backup-Ziel** einrichten (separater Standort)
- [ ] **Backup-Retention** festlegen (pro Kundenstufe)
- [ ] **PITR** entscheiden (Enterprise — ja/nein + Begründung)

### Migration / Betrieb (Owner)
- [ ] **Production-Migration-Freigabeprozess** festlegen (wer gibt frei)
- [ ] **Restore-Drill** mindestens einmal durchführen (mit Claude Code als Anleitung)
- [ ] **DB-Incident-Verantwortliche** definieren
- [ ] **Secrets-Rotation** für DB-Credentials (falls je geleakt)

**Claude Code liefert:** Migrationsinventur, Fresh-DB-Proof, Hardening, SCC Database Operations (sicher, keine freie SQL), Backup-/Restore-Skripte, Runbooks, alle Doku-Dateien. **Niemals echte DB-Credentials, niemals echtes Hetzner-Token, keine tatsächliche Server-Provisionierung.**

**Wichtig:** Der Fresh-DB-Proof ist Marktstart-Blocker. Ohne bewiesenen `empty database → migrations → app starts → smoke pass` darf keine Production-DB live gehen.

---

## Cross-Cutting

### Demo-Daten neu aufsetzen (nach Track A + C)

- [ ] **Demo-Daten überprüfen** (Phase 1 WAVE 15):
  - Enthalten sie Marketplace-Profile-Beispiele?
  - Verwenden sie alte oder neue Terminologie?
  - Müssen Demo-Worker-Submissions neu erstellt werden (Track B Änderungen)?
- [ ] **Sales-Demo-Path** (`docs/SALES_DEMO_PATH.md`) aktualisieren

### Marktstart-Auswirkung

- [ ] **Entscheidung:** welche Phase-4-Tracks sind Pflicht vor Marktstart?
  - Empfehlung: Track B + Track C Pflicht, Track A optional (Post-Launch-Feature)
- [ ] **Track-A-Launch-Strategie:** sofort mit Marktstart oder als Premium-Erweiterung 4-8 Wochen später?
- [ ] **Marktstart-Verschiebung wegen Phase 4?** Falls Phase-4-Tracks Marktstart verzögern: bewusst entscheiden statt schleifen lassen

---

## Aufgaben-Checkliste

Track A — `docs/marketplace/MANUAL_TASKS_CHECKLIST.md`:

```
| Welle | Aufgabe | Status | Datum | Verantwortlich | Notiz |
|---|---|---|---|---|---|
| M-01 | Plan-Zuordnung bestätigen | offen | — | Owner | Pricing-Team einbeziehen |
| M-02 | Server-Salt erzeugen | offen | — | Owner | Im Secret Manager |
| M-10 | Bounty-Cap final | offen | — | Owner | Compliance prüfen |
| ... | ... | ... | ... | ... | ... |
```

Track B — `docs/einsatzportal/MANUAL_TASKS_CHECKLIST.md`:

```
| Welle | Aufgabe | Status | Datum | Verantwortlich | Notiz |
|---|---|---|---|---|---|
| EP-07 | Statische Texte konfigurierbar | offen | — | Owner | Mit Vertrieb klären |
| EP-06 | Public Worker Profile ja/nein | offen | — | Owner | Datenschutz-Frage |
| ... | ... | ... | ... | ... | ... |
```

Track C — `docs/product/TERMINOLOGY_MANUAL_TASKS.md`:

```
| Phase | Aufgabe | Status | Datum | Verantwortlich | Notiz |
|---|---|---|---|---|---|
| 1 | Begriffe final freigeben | offen | — | Owner | Mit Vertrieb |
| 9 | E-Mail-Templates anpassen | offen | — | Owner | Marketing-Team |
| 11 | Sales-Briefing | offen | — | Owner | Vor Live |
| ... | ... | ... | ... | ... | ... |
```

---

## Warum diese Trennung kritisch ist

Wenn Claude Code "Pricing für Marketplace-Features festgelegt" oder "Begriffe vom Vertrieb freigegeben" meldet, ist das eine **Halluzination**. Diese Entscheidungen brauchen menschliche Stakeholder.

**Phase-4-Gates können nicht ohne diese manuellen Aufgaben grün werden.**
