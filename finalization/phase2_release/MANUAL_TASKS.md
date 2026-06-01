# Manuelle Aufgaben — was Claude Code NICHT kann

> Diese Aufgaben muss der Owner durchführen. Claude Code liefert Vorlagen, Anleitungen, Checklisten — aber nicht die Durchführung.

---

## 6.1 Recht und Datenschutz

**Owner-Aufgaben (rechtlich beraten lassen):**
- [ ] Impressum finalisieren
- [ ] Datenschutzerklärung finalisieren
- [ ] AGB / SaaS-Vertrag finalisieren
- [ ] AVV / DPA erstellen (Auftragsverarbeitungsvertrag)
- [ ] TOMs erstellen (Technische und organisatorische Maßnahmen)
- [ ] Subunternehmerliste erstellen (Hosting, E-Mail, Monitoring, etc.)
- [ ] Löschkonzept festlegen
- [ ] Aufbewahrungsfristen festlegen
- [ ] Cookie- / Tracking-Bewertung
- [ ] Rollen klären: Verantwortlicher vs. Auftragsverarbeiter
- [ ] Worker- / Mitarbeiterdaten rechtlich prüfen (AÜG, DSGVO Art. 88)

**Claude Code liefert:** Vorlagen in `docs/legal/` und `docs/security/TOMS.md`. **Niemals juristische Garantie.**

---

## 6.2 Infrastruktur

**Owner-Aufgaben:**
- [ ] Produktivdomain kaufen / setzen
- [ ] DNS einrichten (A, AAAA, MX, TXT)
- [ ] TLS / SSL einrichten (Let's Encrypt oder kommerziell)
- [ ] Hosting auswählen (Anforderungen: DE/EU für DSGVO)
- [ ] Managed DB einrichten (PostgreSQL Production-Tier)
- [ ] Redis / Queue einrichten, falls benötigt
- [ ] Object Storage einrichten (S3-kompatibel)
- [ ] Backup-Ziel einrichten (separater Standort)
- [ ] Monitoring-Konto einrichten (Sentry, Datadog, oder Äquivalent)

**Claude Code liefert:** Setup-Anleitungen in `docs/operations/INFRASTRUCTURE_SETUP.md`.

---

## 6.3 E-Mail-Versand

**Owner-Aufgaben:**
- [ ] Versanddomain festlegen (z. B. `mail.tempconnect.example`)
- [ ] SPF einrichten
- [ ] DKIM einrichten
- [ ] DMARC einrichten
- [ ] SMTP / SendGrid / Mailgun einrichten
- [ ] Support-Mailadresse einrichten
- [ ] Absendernamen festlegen

**Claude Code liefert:** DNS-Templates in `docs/operations/EMAIL_SETUP.md`.

---

## 6.4 Commercial

**Owner-Entscheidungen:**
- [ ] Preise final festlegen
- [ ] Planlimits final entscheiden (User, Orgs, Standorte, API-Calls, etc.)
- [ ] Pilotpreise festlegen
- [ ] Mindestlaufzeit festlegen
- [ ] Kündigungsfrist festlegen
- [ ] Zahlungsweise festlegen (Rechnung, Stripe, SEPA)
- [ ] Rechnung-vs.-Stripe-Entscheidung treffen
- [ ] Enterprise-Angebotsprozess festlegen

**Claude Code liefert:** Plan-Matrix-Vorlage in `docs/product/PLANS_AND_LIMITS.md`.

---

## 6.5 Security manuell

**Owner-Aufgaben:**
- [ ] **Alle Secrets rotieren** (jede einzelne Variable, die jemals in einem .env-Artefakt war):
  - JWT-Secret
  - Session-Secret
  - Admin-Secret
  - Cron-Secret
  - Datenbankpasswort
  - SMTP-Credentials
  - Stripe-Keys (falls verwendet)
  - Sentry-DSN
  - GitHub-Tokens
  - Vercel-Tokens (falls verwendet)
- [ ] Alte Tokens deaktivieren
- [ ] Admin-Konten mit MFA sichern
- [ ] Backup-Zugriff sichern (separate Credentials)
- [ ] Hosting-Zugänge absichern (MFA aktivieren)
- [ ] GitHub-Zugänge absichern (MFA, SSH-Keys mit Passphrase)
- [ ] Externe Security-Prüfung / Pentest beauftragen (falls Enterprise ernsthaft verkauft wird)

**Claude Code liefert:** Rotations-Checkliste in `docs/security/SECRET_ROTATION.md`.

**WICHTIG:** Claude Code kann ehrlich keine Secrets selbst rotieren. Auch nicht "halb". Owner muss jede Rotation selbst durchführen und bestätigen.

---

## 6.6 Marktstart-Vorbereitung

**Owner-Aufgaben:**
- [ ] Erste Zielkunden definieren
- [ ] Pilotkundenvertrag vorbereiten
- [ ] Supportzeiten definieren (Kernzeit, Bereitschaft)
- [ ] Eskalationsweg definieren (P0-Incident → wer wird wann benachrichtigt)
- [ ] Onboarding-Termine planen
- [ ] Demo-Daten vs. echte Daten entscheiden (separate Umgebungen?)
- [ ] Sales-Unterlagen finalisieren
- [ ] **Keine nicht bewiesenen Enterprise-Funktionen versprechen**

**Claude Code liefert:** Pilot-Vertrag-Skelett, Sales-Demo-Path (`docs/SALES_DEMO_PATH.md`), Support-SLA-Vorlage.

---

## Workflow für manuelle Aufgaben

**Pro Aufgabe:**

1. Claude Code prüft, ob Vorlage / Anleitung existiert in `docs/`
2. Falls nicht: erstellt sie als Skelett
3. Owner markiert die Aufgabe als "in Bearbeitung" in `docs/releases/MANUAL_TASKS_CHECKLIST.md`
4. Owner führt durch
5. Owner markiert als "abgeschlossen" mit Datum
6. **Gate-Pass** erst, wenn alle relevanten manuellen Aufgaben für das jeweilige Gate erledigt sind

---

## `docs/releases/MANUAL_TASKS_CHECKLIST.md` (Format)

```
| Bereich | Aufgabe | Status | Datum | Verantwortlich | Notiz |
|---|---|---|---|---|---|
| Recht | Datenschutzerklärung | ✓ erledigt | 2026-XX-XX | Owner | Anwalt geprüft |
| Recht | AVV | offen | — | Owner | — |
| Infra | DNS | in Arbeit | — | Owner | — |
| ... | ... | ... | ... | ... | ... |
```

---

## Warum diese Trennung wichtig ist

Wenn Claude Code "Secrets rotieren" oder "Domain kaufen" als erledigt meldet, ist das eine **Halluzination** — kein Modell kann das tun. Diese Aufgaben gehören explizit dem Owner, und das Tracking läuft separat von den technischen Wellen.

**Marktstart-Gate F** (Commercial/Legal) kann nicht ohne diese manuellen Aufgaben grün werden.
