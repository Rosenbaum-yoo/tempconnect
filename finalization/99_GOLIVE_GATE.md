# 99 — Globales Go-Live-Gate, Definition of Done, Abschlussbericht

> **Letzte Stufe.** Diese Datei definiert, wann TempConnect launchbar ist und wie jede Welle abgeschlossen wird.

---

## Teil 1 — Globales Go-Live-Gate

TempConnect ist erst launchbereit, wenn ALLE folgenden Punkte erfüllt sind. Kein Punkt darf wegdiskutiert werden.

### A. Produkt

- [ ] Kernflow funktioniert Ende-zu-Ende: Requisition → Vendor/Matching → Assignment → Timesheet/Spend → Dashboard
- [ ] Vertrags-/Rahmenvertragsstrecke ist mindestens status- und auditfähig
- [ ] Bonus/Referral/Credits sind kontrolliert ODER deaktiviert (nicht halbfertig sichtbar)
- [ ] Admin-/Staff-/Owner-Funktionen sind sicher getrennt (Surface-Trennung aus WAVE_07)
- [ ] Kein Feature ist als kaufbar/aktiv sichtbar, das technisch nicht lieferbar ist

### B. Commercial

- [ ] Plans, Add-ons, Trial, Custom und Enterprise sind konsistent (WAVE_02)
- [ ] UI und Backend stimmen überein (eine kanonische Quelle)
- [ ] Buchbare Features sind wirklich lieferbar
- [ ] Coming Soon ist klar markiert und nicht abrechenbar
- [ ] Individuelle Tarife laufen über Staff-Freigabe
- [ ] Legacy-Plan-Begriffe sind via `normalizePlanKey(...)` gemappt

### C. Security

- [ ] Keine Secrets im Release (WAVE_01)
- [ ] Tenant Isolation getestet (Cross-Org-Negativtests bestehen, WAVE_06)
- [ ] API-Key-Scopes default-deny
- [ ] SSO ehrlich produktiv ODER deaktiviert/Coming Soon (kein Stub)
- [ ] SSO-Enforce hat Break-Glass-Mechanismus
- [ ] Owner-Bereich stark geschützt (Step-up, Allowlist)
- [ ] CSRF schützt alle Mutationen
- [ ] Rate Limits auf Login, Invite, SSO, Finance Export, Admin-Flows

### D. QA

- [ ] Fresh clone läuft (CI grün)
- [ ] Migrations laufen (Fresh + Upgrade)
- [ ] CI ist grün ODER Restfehler sind klassifiziert und nicht P0/P1
- [ ] Release-Artefakt ist sauber (Hygiene-Check)
- [ ] Kernseiten haben Smoke Tests
- [ ] Leere Daten verursachen keine 500 (Empty States)
- [ ] Cross-Tenant-Negativtests bestehen
- [ ] Plan-Gate-Tests bestehen
- [ ] Rolle-Gate-Tests bestehen

### E. Enterprise

- [ ] Audit vorhanden (immutable, exportierbar, WAVE_13)
- [ ] Datenschutz-/Security-Dokumentation vorbereitet (WAVE_14)
- [ ] SLA nur bei operativer Deckung (WAVE_14 + Enterprise Pack)
- [ ] Backup-/Restore dokumentiert und getestet
- [ ] Support-/Incident-Prozess existiert
- [ ] Enterprise Readiness Pack ist aktuell (`SPECIAL_enterprise_pack.md`)

### F. UX

- [ ] Keine toten Links
- [ ] Keine kaputten Cards
- [ ] Keine unklaren Nullwerte
- [ ] Keine falsche Sichtbarkeit (Rollenmatrix vollständig, WAVE_03)
- [ ] Professionelle Empty States
- [ ] Dashboard hat Managementwahrheit (jede KPI erklärbar, WAVE_05)
- [ ] Keine Emojis in produktiver UI
- [ ] Light/Dark Mode funktioniert auf Kernseiten

### G. Public / Privacy (Zusatz aus V4)

- [ ] Keine Dokumente direkt öffentlich (außer explizit erlaubt + auditiert)
- [ ] Datenschutz/Impressum verlinkt von allen relevanten Seiten
- [ ] `noindex`-Entscheidung pro Surface dokumentiert (Trust, Legal, Public Profiles)

### H. Finance/Governance (Zusatz aus V4)

- [ ] Finance Export ist auditierbar
- [ ] Customer Bundle (Kundenfreigabe-Paket) ist auditierbar
- [ ] Vendor Tier Changes sind auditierbar
- [ ] Approvals sind nachvollziehbar (4-Augen-Prinzip wo nötig)

---

## Teil 2 — Strenge Definition of Done (pro Ticket)

Eine Aufgabe ist NUR fertig, wenn ALLE Punkte erfüllt sind:

- [ ] Code umgesetzt
- [ ] Serverseitige Guards vorhanden (UI-Ausblendung reicht nie)
- [ ] UI-Zustand korrekt
- [ ] Empty State korrekt
- [ ] Error State korrekt
- [ ] Tests vorhanden ODER bewusst begründet nicht vorhanden (mit Risiko-Hinweis)
- [ ] Doku aktualisiert (`docs/` und ggf. Welle-Datei)
- [ ] Kein bestehender Kernflow gebrochen (Retrofit-Check aus `00_RULES.md` Abschnitt 5)
- [ ] Plan-/Rollen-/Tenant-Auswirkungen geprüft
- [ ] Relevante Release-Gates laufen weiterhin
- [ ] Abschlussbericht nennt Tests und Risiken ehrlich
- [ ] Audit-Eintrag bei sensiblen Aktionen
- [ ] CSRF-Schutz vorhanden bei Mutationen
- [ ] Rate Limit bei sensiblen Flows

**Keine dieser Punkte ist optional.** Ein "fertig" ohne Test ist kein "fertig" — entweder Test schreiben oder Risiko explizit dokumentieren.

---

## Teil 3 — Abschlussbericht-Format (Pflicht pro Welle)

Nach Abschluss jeder Welle (oder größeren Slice) liefere genau diese Struktur:

```text
## Abschlussbericht — WAVE_XX

### 1. Geprüfte Repo-Bereiche
- Dateien:
- Routen:
- Services:
- Tests:

### 2. Getroffene Produktentscheidungen
- Bug vs. Sichtbarkeit vs. Plan-Gate vs. Ausbau
- (Für jede Entscheidung: Begründung + Risiko)

### 3. Umgesetzte Änderungen
- (Fachlich beschrieben, nicht nur Dateiliste)
- Code:
- Doku:
- Tests:

### 4. Aktualisierte Dokumente
- (Liste der `docs/`-Dateien und Welle-Dateien)

### 5. Tests und Checks
- Befehl: ...
- Ergebnis: ...
- Offene Fehler: ...
- Manuelle Prüfschritte (mit Owner und Datum):

### 6. P0/P1-Status
- Gelöst: ...
- Offen: ...
- Bewusst verschoben (mit Begründung): ...

### 7. Risiken vor Pilot / Enterprise
- (Konkret, nicht generisch)
- (Mit Schweregrad und Mitigation)

### 8. Welle-übergreifende Erkenntnisse
- (Was sollte in CLAUDE.md oder andere Wellen übernommen werden? → Owner fragen, nicht selbst übernehmen)

### 9. Nächster sinnvoller Slice
- (NUR eine klare Empfehlung, nicht mehrere)
```

**Verbotene Abschluss-Formate:**
- Reine Dateiliste ohne Fachbeschreibung
- "Erledigt" ohne Test-Bezug
- "Alle Tests grün" ohne Ausführungs-Nachweis
- Schwammige Risiko-Aussagen ("könnte vielleicht...")
- Verschweigen von Restfehlern

---

## Teil 4 — Wann ist die Finalisierungswelle abgeschlossen?

Erst wenn:

1. **Alle 16 Wellen (WAVE_00 bis WAVE_15)** als grün gemeldet sind
2. **Beide Spezial-Dokumente** (Bugboard-Triage und Enterprise Pack) vollständig sind
3. **Globales Go-Live-Gate** (Teil 1) ohne offene Punkte
4. **Definition of Done** (Teil 2) für jedes erstellte Ticket erfüllt
5. **Owner hat den finalen Status bestätigt** — nicht Claude Code entscheidet "fertig", sondern der Owner nach Prüfung

---

## Letzter Hinweis

**Ziel ist nicht:** "TempConnect sieht gut aus."
**Ziel ist:** TempConnect hält einer seriösen Enterprise-Due-Diligence, einer Pilotkunden-Demo und einem echten SaaS-Go-Live stand.

Wenn ein Eintrag dieses Gates in der Praxis nicht erfüllbar erscheint — Stop. Owner einbeziehen. Entweder das Feature so anpassen, dass es das Gate besteht, oder das Feature ehrlich nicht launchen.
