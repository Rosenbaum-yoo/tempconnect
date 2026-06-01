# Verzeichnis der Subprozessoren (Unterauftragsverarbeiter)
**TempConnect – Stand: Mai 2026**
**Verantwortliche Stelle:** BBQ – Baumann Bildung und Qualifizierung GmbH

---

> Gemäß Art. 28 Abs. 2 DSGVO sind Auftraggeber über alle Unterauftragsverarbeiter zu informieren.
> Diese Liste wird bei Änderungen aktualisiert. Auftraggeber werden über neue Subprozessoren
> mindestens 30 Tage vor Einsatz informiert (sofern im AVV vereinbart).

---

## Aktive Subprozessoren

### 1. Hetzner Online GmbH
| Feld | Wert |
|---|---|
| **Zweck** | Cloud-Hosting, Rechenzentrum (Server, Speicher, Netzwerk) |
| **Leistung** | Betrieb der Produktionsinfrastruktur (API-Server, Datenbank, Dateiablage) |
| **Sitz** | Gunzenhausen, Bayern, Deutschland |
| **Verarbeitungsstandort** | Deutschland (Rechenzentrum Nürnberg / Falkenstein) |
| **Datenschutz-Kontakt** | datenschutz@hetzner.com |
| **Zertifizierungen** | ISO 27001, ISO 9001 |
| **AVV vorhanden** | Ja (Hetzner-Standard-AVV) |
| **Webseite** | https://www.hetzner.com/legal/privacy-policy |

---

### 2. E-Mail-Provider (Transaktions-E-Mails)
| Feld | Wert |
|---|---|
| **Zweck** | Versand von Transaktions-E-Mails (Registrierung, Benachrichtigungen, Rechnungen) |
| **Leistung** | SMTP-Relay, Bounce-Management |
| **Sitz** | [Gemäß konfiguriertem SMTP_HOST in .env] |
| **Verarbeitungsstandort** | [Gemäß Provider-Konfiguration — EU-Standard empfohlen] |
| **Zu verarbeitende Daten** | E-Mail-Adresse, Name (in Anrede), Buchungs-/Bestätigungsdaten |
| **AVV vorhanden** | [Ja/Nein — je nach gewähltem Provider] |
| **Hinweis** | Produktive Konfiguration: `SMTP_HOST`, `SMTP_USER` in `.env` |

---

### 3. Stripe, Inc. (Zahlungsabwicklung — sofern aktiviert)
| Feld | Wert |
|---|---|
| **Zweck** | Zahlungsabwicklung, Abonnement-Management |
| **Leistung** | Kreditkarten- und SEPA-Verarbeitung, Rechnungsstellung |
| **Sitz** | 185 Berry Street, Suite 550, San Francisco, CA 94107, USA |
| **Verarbeitungsstandort** | USA und EU (Stripe Europe, Dublin, Irland) |
| **Zertifizierungen** | PCI DSS Level 1 |
| **Rechtsgrundlage Drittlandtransfer** | EU-US Data Privacy Framework, Standardvertragsklauseln |
| **AVV vorhanden** | Ja (Stripe-Standard Data Processing Addendum) |
| **Webseite** | https://stripe.com/de/privacy |
| **Aktivierungsstatus** | Optional — nur aktiv wenn `STRIPE_SECRET_KEY` konfiguriert |

---

### 4. Sentry (Error-Monitoring — sofern aktiviert)
| Feld | Wert |
|---|---|
| **Zweck** | Fehler-Tracking und Performance-Monitoring |
| **Leistung** | Erfassung und Aggregation von Applikationsfehlern |
| **Sitz** | Functional Software, Inc., 45 Fremont St., San Francisco, CA 94105, USA |
| **Verarbeitungsstandort** | USA (Single-Tenant EU-Region verfügbar) |
| **Zu verarbeitende Daten** | Anonymisierte Fehler-Stacktraces, URL, HTTP-Methode (KEINE Cookies, Auth-Header, Request-Body — durch `beforeSend`-Filter geblockt) |
| **PII-Schutz** | `sendDefaultPii: false`; `beforeSend` scrubbt alle sensiblen Header |
| **Rechtsgrundlage Drittlandtransfer** | Standardvertragsklauseln |
| **AVV vorhanden** | Ja (Sentry Data Processing Agreement) |
| **Webseite** | https://sentry.io/privacy/ |
| **Aktivierungsstatus** | Optional — nur aktiv wenn `SENTRY_DSN` konfiguriert |

---

## Geplante / In Prüfung

| Dienst | Zweck | Status |
|---|---|---|
| Azure AD / Entra ID | SSO-Integration für Enterprise-Kunden | Ausstehend (OE-03) |
| Backup-Cloud-Storage | Offsited Backup-Ablage | Ausstehend (P0-Ops) |

---

## Verarbeitungskategorien je Subprozessor

| Subprozessor | Personenbezogene Daten | Betroffenengruppen |
|---|---|---|
| Hetzner | Alle Plattformdaten (Nutzerkonten, Verträge, Transaktionen) | Nutzer, Organisationen, Arbeitskräfte |
| E-Mail-Provider | E-Mail-Adresse, Name, Buchungsdetails | Nutzer (Company, Agency, Worker) |
| Stripe | Zahlungsdaten, Rechnungsadresse, Transaktions-ID | Zahlungspflichtige Nutzer (Company, Agency) |
| Sentry | Anonymisierte technische Logs | Alle Nutzer (keine Zuordnung möglich) |

---

## Änderungshistorie

| Datum | Änderung | Autor |
|---|---|---|
| 2026-05-27 | Initiale Erstellung | TempConnect Engineering |

---

*Fragen zur Subprozessor-Liste: datenschutz@[tempconnect-domain]*
