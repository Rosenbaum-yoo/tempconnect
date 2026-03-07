# TempConnect – Compliance & Dokumentenprüfung

## Zweck
Verwaltung und Prüfung von Lieferanten-Compliance-Dokumenten (AÜG-Erlaubnis, Versicherungen, Zertifikate etc.) mit Ampellogik und automatischen Ablauf-Reminders.

## Dokumenttypen
| Typ | Beschreibung |
|-----|-------------|
| aueg_erlaubnis | Arbeitnehmerüberlassungs-Erlaubnis |
| unbedenklichkeit | Unbedenklichkeitsbescheinigung |
| uvv_nachweis | Unfallverhütungsvorschrift-Nachweis |
| versicherung | Haftpflicht-/Betriebsversicherung |
| zertifikat | Qualitätszertifikate (ISO etc.) |
| gewerbeanmeldung | Gewerbeanmeldung |
| handelsregister | Handelsregisterauszug |
| datenschutz | Datenschutzvereinbarung |
| arbeitssicherheit | Arbeitssicherheits-Nachweis |
| qualifikation | Mitarbeiter-Qualifikationen |
| sonstige | Sonstige Dokumente |

## Ampellogik (Traffic Light)
| Farbe | Bedeutung | Bedingung |
|-------|-----------|-----------|
| 🟢 grün | Gültig | > 30 Tage bis Ablauf |
| 🟡 gelb | Bald ablaufend | ≤ 30 Tage bis Ablauf |
| 🔴 rot | Abgelaufen | Ablaufdatum überschritten |
| ⚪ grau | Kein Ablaufdatum | `valid_until` ist NULL |

## Status-Lifecycle
```
pending → verified (durch Prüfer)
pending → rejected (durch Prüfer, mit Begründung)
verified → expired (automatisch per Batch-Job)
```

## Service: complianceDocService.js
- `uploadDocument()` – Neues Dokument hochladen (Status: pending)
- `verifyDocument()` – Als geprüft markieren
- `rejectDocument()` – Ablehnen mit Begründung
- `complianceStats()` – Statistik pro Org (nach Typ und Ampel)
- `findExpiringDocuments()` – Bald ablaufende Dokumente finden
- `markReminderSent()` – Reminder als gesendet markieren
- `expireBatch()` – Batch: abgelaufene Dokumente auf 'expired' setzen

## Automatisierung (Cron-Jobs)
1. **Expiry-Batch**: Alle verified Dokumente mit `valid_until < NOW()` → Status `expired`
2. **Reminder**: Dokumente mit `valid_until ≤ NOW() + 30 Tage` und `reminder_sent_at IS NULL` → E-Mail/Notification
