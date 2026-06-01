# TempConnect — SLA Operative Deckung

> Erstellt: 2026-05-28 | Enterprise Pack | Go-Live-Gate E
> Grundsatz (SPECIAL_enterprise_pack.md): "Wenn keine Deckung: SLA nicht anbieten ODER niedrigere Stufe ehrlich kommunizieren."

---

## Angebotene SLA-Stufen

| Produkt | SLA | Status | Operative Deckung |
|---|---|---|---|
| Standard-Plattform (BASIS/PLUS/PRO) | 99,5 % Verfügbarkeit | Basis-SLA | Monitoring vorhanden, kein 24/7-On-Call dokumentiert |
| `sla99` Add-on (INDIVIDUELL) | 99,9 % Verfügbarkeit | Erwerb via Staff-Freigabe | **Noch nicht vollständig operativ gedeckt — siehe unten** |

---

## Operative Infrastruktur (Ist-Stand)

### Monitoring
| Komponente | Status |
|---|---|
| Sentry Error-Tracking | ✅ Konfiguriert (`SENTRY_DSN` + PII-Scrubbing) |
| Prometheus Metriken | ✅ Mechanismus fertig — Secret-Setzung Owner-Task (B-03) |
| Alertmanager | ✅ Konfiguriert (`monitoring/alertmanager.yml`) |
| Pino Structured Logging | ✅ JSON-Format, userId/orgId-Enrichment |
| Health-Checks | ✅ `/health`, `/ready`, `/live`, `/api/admin/system-health` |
| Öffentliche Statusseite | ✅ `/public/system-status` |

### Incident Response
| Aspekt | Status |
|---|---|
| Incident Runbook | ✅ `docs/INCIDENT_RUNBOOK.md` — SEV-1/2/3-Klassifikation |
| SEV-1 Reaktionszeit | 15 Min (dokumentiert, **nicht gemessen**) |
| SEV-2 Reaktionszeit | 30 Min (dokumentiert, **nicht gemessen**) |
| On-Call-Prozess | ⚠️ **Noch nicht formal definiert** (kein PagerDuty/Opsgenie) |
| Kommunikation | Statuspage + Kunden-E-Mail innerhalb 30 Min (dokumentiert) |

### Backup / Recovery
| Aspekt | Status |
|---|---|
| Backup-Frequenz | Täglich (Cron) |
| RPO | 24 Stunden |
| RTO | < 2 Stunden (geschätzt — **nicht gemessen**, Dry-Run ausstehend, I-01) |
| Restore-Test | ⚠️ **Noch nicht durchgeführt** |

---

## Bewertung der SLA-Stufen

### Basis-SLA (99,5 % — Standard)

**Erreichbarkeit 99,5 %** bedeutet max. ~3,65 Stunden Ausfallzeit/Monat.

| Kriterium | Erfüllt? | Anmerkung |
|---|---|---|
| Monitoring & Alerting | ✅ | Sentry + Prometheus + Healthchecks |
| Incident-Prozess dokumentiert | ✅ | INCIDENT_RUNBOOK.md |
| Backup-Konzept | ✅ | Täglich, dokumentiert |
| Kommunikations-Prozess | ✅ | Statuspage + E-Mail |
| Gemessene Uptime | ⚠️ | Keine historischen Daten — Pre-Launch |
| On-Call-Bereitschaft | ⚠️ | Noch nicht formal organisiert |

**Empfehlung:** Basis-SLA (99,5 %) ist kommunizierbar für erste Pilotkunden — mit explizitem Hinweis, dass Uptime-Messungen ab Go-Live beginnen. Kein vertraglich verbindlicher SLA vor erstem Messzeitraum.

---

### Erweiterter SLA (99,9 % — `sla99` Add-on)

**Erreichbarkeit 99,9 %** bedeutet max. ~43 Minuten Ausfallzeit/Monat.

| Kriterium | Erfüllt? | Anmerkung |
|---|---|---|
| 24/7 On-Call dokumentiert | ❌ | Nicht konfiguriert |
| Messbare SLA-Baseline | ❌ | Keine Uptime-Historie |
| Automatische Eskalation | ❌ | Kein PagerDuty/Alertmanager→On-Call |
| RTO < 43 Min dokumentiert | ❌ | RTO-Dry-Run fehlt |
| Multi-Availability-Zone | ❌ | Aktuell Single-Region Hetzner |

**Bewertung:** Das `sla99` Add-on ist `requires_staff_approval: true` — **kein automatisches Buchen möglich**. Staff-Freigabe-Pflicht erlaubt Einzelfallprüfung. **Empfehlung: `sla99` Add-on erst anbieten, wenn On-Call-Prozess operativ aufgesetzt ist.**

---

## Risiken und Empfehlungen

### Sofort (vor erster Enterprise-Vertragsverhandlung)

1. **SLA-Zusagen nur mit klarer Datenbasis** — Erst nach 30 Tagen Uptime-Messung einen konkreten SLA-Prozentsatz vertraglich zusagen.
2. **`sla99` Add-on nur mit Staff-Override aktivieren** — Solange kein 24/7 On-Call aufgesetzt ist.
3. **RTO messen** — Backup Dry-Run (I-01) liefert echten Messwert.

### Mittelfristig (nach Go-Live, Q3 2026)

1. **PagerDuty oder Opsgenie** einrichten — Formale On-Call-Rotationen.
2. **Uptime-Monitoring extern** — UptimeRobot oder Statuspage.io für externe Perspektive.
3. **Hetzner Hochverfügbarkeit** prüfen — Floating IP + Failover für kritische Services.

---

## Stand zur Verwendung in Enterprise-Gesprächen

| Was darf gesagt werden | Was darf NICHT gesagt werden |
|---|---|
| "Wir monitoren die Plattform mit Sentry + Prometheus + Health-Checks" | "Wir garantieren 99,9 % Uptime" (ohne On-Call) |
| "Wir haben einen dokumentierten Incident-Response-Prozess (SEV-1 < 15 Min)" | "SLA-Verletzungen werden automatisch eskaliert" (kein PagerDuty) |
| "Unser Backup-Konzept sieht tägliche Backups mit 24h RPO vor" | "RTO ist < 2 Stunden garantiert" (nicht gemessen) |
| "SLA-Stufen sind planbar — sprechen Sie uns an" | "99,9 % SLA ist sofort buchbar" |
