# WAVE_14 — Legal, Datenschutz und Enterprise Due Diligence

> **Phase:** Enterprise. **Prio:** P1. **Voraussetzung:** WAVE_06 (Security), WAVE_13 (Observability).

---

## Ziel

TempConnect scheitert in einer Enterprise-Prüfung nicht an fehlender Grunddokumentation.

**Wichtige Grenze:** Claude Code ist KEIN Anwalt. Markiere juristische Texte als "rechtlich zu prüfen" und vermeide absolute Aussagen.

---

## Aufgaben

### 1. Datenschutztexte aktualisieren

- `frontend/public/legal/datenschutz.html`
- Auf aktuellen Stand prüfen
- DSGVO-Konformität (Datenkategorien, Rechtsgrundlagen, Speicherdauer, Betroffenenrechte)
- Markierung: "Rechtlich zu prüfen — letzter Stand: YYYY-MM-DD"

### 2. AVV / DPA vorbereiten

- Auftragsverarbeitungsvertrag (Auftragsverarbeitungsvereinbarung) als Template
- Subprocessor-Liste vorbereiten (welche Dritten haben Zugriff auf Daten)

### 3. TOMs (Technische und organisatorische Maßnahmen)

Dokumentieren:
- Zutrittskontrolle
- Zugangskontrolle (Auth, MFA)
- Zugriffskontrolle (RBAC, Tenant Isolation aus WAVE_06)
- Weitergabekontrolle
- Eingabekontrolle (Audit aus WAVE_13)
- Auftragskontrolle (AVV)
- Verfügbarkeitskontrolle (Backups, Healthchecks)
- Trennungsgebot (Multi-Tenancy)

### 4. Subprocessor-Liste

- Hosting-Provider
- E-Mail-Versand
- Monitoring/Sentry
- Sonstige Dritte
- Pro Subprocessor: Zweck, Datenkategorie, Standort, AVV vorhanden ja/nein

### 5. SLA-Dokumentation

- NUR mit operativ haltbaren Versprechen
- 99,9 % nur, wenn Monitoring + Incident-Prozess + Betriebsmodell tatsächlich stützen
- Sonst: keine SLA-Aussage ODER niedrigere Stufe ehrlich kommunizieren

### 6. Backup- / Retention- / Deletion-Konzept

- Wie lange werden Daten aufbewahrt
- Wann werden Daten gelöscht (Auto-Delete nach Kündigung + X Tage)
- Wie wird gelöscht (Soft / Hard)
- Backup-Aufbewahrungsfrist

### 7. Datenexport für Kunden

- Self-Service-Export für Kunden (CSV / JSON)
- Format dokumentiert
- Welche Daten exportierbar

### 8. Rollen für personenbezogene Daten

- Wer ist Verantwortlicher, wer Auftragsverarbeiter
- Pro Datenkategorie geklärt

### 9. Vertrags- / Rahmenvertragsdokumente

Aus WAVE_04H:
- Templates für juristische Prüfung vorbereitet
- Versionierung sichergestellt

### 10. Trust-Seiten

`frontend/public/trust/*.html`:
- `compliance.html`
- `security.html`
- `status.html`
- `platform-sla.html`

→ Inhalte mit Realität abgleichen, keine übertriebenen Claims

---

## Akzeptanzkriterien

- [ ] Enterprise-Kunde kann Security-/Datenschutzunterlagen anfordern
- [ ] Produkttexte versprechen nicht mehr, als Technik und Betrieb leisten
- [ ] Kritische Dokumente sind versioniert und auffindbar
- [ ] AVV-Template + Subprocessor-Liste vorhanden
- [ ] TOMs dokumentiert
- [ ] Datenexport für Kunden möglich
- [ ] Trust-Seiten spiegeln aktuellen Stand wider

---

## Stop-Regeln

- SLA-Aussage in UI ohne operative Deckung → STOP, ehrlich kommunizieren
- Datenschutztext widerspricht Tenant-Isolation-Realität → STOP, abgleichen
- Subprocessor-Datenfluss nicht dokumentiert → STOP

---

## Wichtige Grenze

**Keine rechtlichen Garantien.** Alle Texte als "rechtlich zu prüfen" markieren. Owner muss vor Live-Schaltung anwaltliche Prüfung einholen.

---

## Betroffene Dateien

- `frontend/public/legal/*.html` (agb, datenschutz, impressum, kontakt, sla)
- `frontend/public/trust/*.html`
- `docs/COMPLIANCE_*.md`, `docs/TOMS.md`, `docs/SUBPROCESSORS.md` (anlegen)
