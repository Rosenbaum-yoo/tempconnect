# Manuelle Aufgaben — Phase 3 SCC

> Diese Aufgaben muss der Owner durchführen. Claude Code liefert Vorlagen, Checks und Anleitungen — aber nicht die Durchführung.

---

## 1. Staff-Identität (SCC WAVE 01 + 11)

**Owner-Aufgaben:**
- [ ] Staff-Mitglieder definitiv festlegen (Personen-Liste)
- [ ] Staff-E-Mail-Adressen und echte User-IDs prüfen
- [ ] `STAFF_USER_IDS` nur für Bootstrap setzen, später minimieren
- [ ] `STAFF_SESSION_SECRET` sicher erzeugen und im Secret Manager setzen (≥32 zufällige Bytes)
- [ ] Staff-MFA organisatorisch verpflichtend machen (TOTP-App, Backup-Codes ausgeben)
- [ ] Staff-Zugänge monatlich reviewen (Runbook in `docs/scc/SCC_STAFF_ACCESS_REVIEW.md`)
- [ ] Kein SCC-Zugang für externe Kunden, Agenturen oder normale Admins erlauben

**Claude Code liefert:** Vorlage in `docs/scc/SCC_STAFF_ACCESS_REVIEW.md`, Bootstrap-Migration. **Niemals echte User-IDs oder Secrets.**

---

## 2. Subdomain und Netzwerk (SCC WAVE 13)

**Owner-Entscheidungen:**
- [ ] Entscheiden, ob `staff.tempconnect.de` als eigene Subdomain läuft
- [ ] DNS einrichten falls ja
- [ ] TLS / SSL für Staff-Subdomain einrichten
- [ ] Entscheiden, ob IP-Allowlist / VPN für SCC Pflicht ist
- [ ] Nginx/VHost konfigurieren

**Claude Code liefert:** VHost-Template in `docs/scc/SCC_NETWORK_SETUP.md`.

---

## 3. Commercial-Prozess (SCC WAVE 05 + 06)

**Owner-Entscheidungen:**
- [ ] Festlegen, wer Commercial Requests bearbeiten darf
- [ ] Festlegen, wer Planwechsel aktivieren darf
- [ ] Festlegen, wer Read-only Mode aktivieren darf
- [ ] Festlegen, ob critical Infra Actions Two-Person-Approval brauchen
- [ ] Pricing für individuelle Tarife final festlegen
- [ ] Angebotsdokument-Vorlage finalisieren (rechtlich geprüft)
- [ ] Mindestlaufzeit / Kündigungsfrist final

**Claude Code liefert:** Workflow-Skelette und Dokument-Templates.

---

## 4. Hetzner-Setup (Track B WAVE H1 + H8)

**Owner-Aufgaben:**
- [ ] Hetzner Projektstruktur final festlegen
- [ ] Hetzner API Token erzeugen
- [ ] Token-Berechtigung wählen (read + safe write, nicht admin)
- [ ] Token im Secret Manager / Hosting Provider setzen
- [ ] Alte Tokens deaktivieren
- [ ] Server / Load Balancer / Volumes korrekt labeln (`project=tempconnect`, `env=prod|staging`)
- [ ] Backup-Kosten und Snapshot-Strategie freigeben
- [ ] Entscheiden, ob Reboot live aus SCC erlaubt ist
- [ ] Entscheiden, ob critical Actions Two-Person-Approval brauchen

**Claude Code liefert:** Label-Checkliste, Action Matrix Dokumentation. **Niemals echtes Token.**

---

## 5. Claude Code Integration (Track B WAVE H5 + H6)

**Owner-Aufgaben:**
- [ ] GitHub App / Claude Code Action einrichten (optional)
- [ ] GitHub Secrets für Claude Code Action setzen
- [ ] Review-/Merge-Regeln für Claude-PRs festlegen
- [ ] Code Owners definieren (`.github/CODEOWNERS`)
- [ ] Branch Protection auf `main` und `release/enterprise-premium-market-ready`

**Claude Code liefert:** GitHub-Workflow-Templates in `.github/workflows/claude-scc-workorder.yml`.

---

## 6. Operations / Incident-Verantwortung

**Owner-Aufgaben:**
- [ ] Incident-Verantwortliche definieren (P0 / P1 / P2 Eskalation)
- [ ] On-Call-Rotation falls vorhanden
- [ ] Eskalationsweg dokumentieren
- [ ] Supportzeiten definieren
- [ ] Echte Production-Aktionen nur nach Checkliste freigeben

**Claude Code liefert:** Incident Runbook Skelett in `docs/staff/SCC_INCIDENT_RUNBOOK.md`.

---

## 7. Datenschutz (SCC WAVE 09)

**Owner-Aufgaben (rechtlich beraten lassen):**
- [ ] Datenschutzrechtlich prüfen, welche Kundendaten Staff sehen darf
- [ ] PII-Reveal-Reason-Pflicht juristisch absichern
- [ ] DSGVO-Lösch-/Export-Prozess für Staff dokumentieren
- [ ] Audit-Retention-Frist rechtlich festlegen

**Claude Code liefert:** PII-Klassifikation-Vorlage. **Niemals juristische Garantie.**

---

## SCC-spezifische Checkliste

`docs/scc/SCC_MANUAL_TASKS_CHECKLIST.md`:

```
| Welle | Aufgabe | Status | Datum | Verantwortlich | Notiz |
|---|---|---|---|---|---|
| Track A WAVE 01 | STAFF_SESSION_SECRET setzen | offen | — | Owner | Im Secret Manager |
| Track A WAVE 01 | Staff-MFA für jedes Mitglied | offen | — | Owner | TOTP-Apps verteilen |
| Track A WAVE 11 | Monatlicher Access Review | offen | — | Owner | Nach Go-Live |
| Track A WAVE 13 | staff.tempconnect.de DNS | offen | — | Owner | — |
| Track B WAVE H1 | HETZNER_CLOUD_TOKEN setzen | offen | — | Owner | Read + Safe Write |
| Track B WAVE H1 | Hetzner-Ressourcen labeln | offen | — | Owner | project + env Labels |
| Track B WAVE H5 | GitHub App einrichten | offen | — | Owner | Falls Work Orders via GitHub |
| ... | ... | ... | ... | ... | ... |
```

---

## Warum die saubere Trennung wichtig ist

Wenn Claude Code "Staff-Mitglied hinzufügen" oder "Hetzner-Token setzen" als erledigt meldet, ist das eine **Halluzination**. Diese Aufgaben gehören explizit dem Owner. Das Tracking läuft separat von den technischen Wellen.

**Die SCC-Gates (A, C, H8) können nicht ohne diese manuellen Aufgaben grün werden.**

---

## Verknüpfung mit Phase-2 Manual Tasks

Phase-2 `MANUAL_TASKS.md` enthält generelle Owner-Aufgaben (Recht, Infra, E-Mail, Commercial). Diese Datei ist SCC-spezifische Ergänzung — nicht Ersatz. Beide Listen abarbeiten.

**Reihenfolge-Empfehlung:**
1. Phase-2 Manual Tasks 6.2 (Infrastruktur) zuerst, falls Hetzner-Server überhaupt erst angelegt werden
2. Phase-2 Manual Tasks 6.5 (Security manuell) — Secrets generell
3. **Diese Datei** — SCC-spezifisch
4. Phase-2 Manual Tasks 6.6 (Marktstart) — am Ende
