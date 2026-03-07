# TempConnect – TempConnect Pulse - Leistungsbeschreibung (Modell C: Hybrid-SLA)

Stand: 03.03.2026

---

## 1. Definitionen

| Begriff | Definition |
|---------|-----------|
| **Kunde** | Juristisch: der Vertragspartner (Unternehmen oder Zeitarbeitsfirma), der einen kostenpflichtigen Tarif nutzt. |
| **Auftrag / Anfrage** | Eine über die Plattform erstellte Personalanfrage (`POST /api/requests`). Kann vom Typ NORMAL oder NOTDIENST sein. |
| **Notfall-Anfrage** | Anfrage mit `priority=NOTDIENST` und verkürzten SLA-Fristen (30 Min Matchingversuch). Nur im Tarif NOTDIENST verfügbar. |
| **Matchingversuch** | Die Plattform sucht passende Kapazitäten (Rolle, Region, Datum, Verfügbarkeit) und benachrichtigt geeignete Agenturen. Ein Matchingversuch gilt als durchgeführt, sobald mindestens eine Agentur benachrichtigt wurde. |
| **Reaktionszeit** | Zeitspanne zwischen Eingang der Anfrage (`request.created_at`) und dem ersten Matchingversuch (`first_matching_attempt`). |
| **Plattformverfügbarkeit** | Prozentuale Erreichbarkeit der API und des Frontends, gemessen über den Health-Endpoint (`/health`), im Monatsmittel. |
| **Wartungsfenster** | Geplante Wartung: Dienstag und Donnerstag 02:00–06:00 Uhr MEZ. Wird mindestens 48h vorher angekündigt. Wartungsfenster zählen nicht zur Verfügbarkeitsmessung. |

---

## 2. SLA-Level

### BASIC (Tarife: FREE, BASIS)

- **Kein garantierter Matchingversuch** – Best-Effort-Verarbeitung
- **Keine Verfügbarkeitsgarantie** – Plattform wird nach bestem Ermessen betrieben
- **Support:** Community / E-Mail, keine garantierte Antwortzeit
- **Marketplace:** Zugriff auf Suche, Angebote, Anfragen (gemäß Tarif-Limits)
- **Enterprise-Features:** Nicht verfügbar (kein Pulse-Timer, keine Scorecard, keine Compliance-Ampel)

### PRO (Tarif: PLUS – 499€/Monat)

- **Matchingversuch innerhalb 120 Minuten** nach Anfrageerstellung
- **Plattformverfügbarkeit: 99,0%** im Monatsmittel
- **Support:** Antwort innerhalb 24 Stunden (Werktags Mo–Fr, 09:00–18:00 MEZ)
- **Enterprise-Features:** Vollzugriff (Pulse-Timer, Compliance-Ampel, Supplier Scorecard, Kapazitätssuche mit Details)
- **Matching:** Standard-Priorität in der Matching-Queue

### EMERGENCY (Tarif: NOTDIENST – 999€/Monat)

- **Matchingversuch innerhalb 30 Minuten** nach Anfrageerstellung
- **Eskalation nach 60 Minuten:** Automatische Radius-Erweiterung + Premium-Partner-Push, falls kein Match
- **Plattformverfügbarkeit: 99,5%** im Monatsmittel
- **Support:** Antwort innerhalb 4 Stunden (Werktags) oder 24/7 „Eingang bestätigt" innerhalb 15 Minuten
- **Enterprise-Features:** Vollzugriff + priorisierte Bearbeitung
- **Matching:** Höchste Priorität in der Matching-Queue, Notdienst-Badge für Agenturen sichtbar

---

## 3. Messung

### 3.1 Reaktionszeit (Matchingversuch)

Gemessen als Differenz zwischen:
- `request.created_at` (Zeitstempel der Anfrageerstellung in der Datenbank)
- `first_matching_attempt` (Zeitstempel der ersten Agentur-Benachrichtigung)

Die Messung erfolgt automatisch durch die Plattform. Der Kunde kann den Pulse-Status jederzeit über das Dashboard einsehen (Pulse-Timer grün/gelb/rot).

### 3.2 Plattformverfügbarkeit

- Gemessen über externen Health-Check auf `https://<domain>/health` im 60-Sekunden-Intervall
- Verfügbarkeit = (Gesamtminuten Monat − Ausfallminuten − Wartungsfenster) / (Gesamtminuten Monat − Wartungsfenster) × 100
- Geplante Wartungsfenster werden nicht als Ausfall gewertet

### 3.3 SLA-Breach

Ein SLA-Verstoß liegt vor, wenn:
- PRO: Kein Matchingversuch innerhalb von 120 Minuten nach `request.created_at`
- EMERGENCY: Kein Matchingversuch innerhalb von 30 Minuten nach `request.created_at`

Der Pulse-Status wird automatisch durch den Cron-Job `POST /api/internal/sla-scan` geprüft und in `sla_events` protokolliert.

### 3.4 Technische Messpunkte (Implementierung)

Die Plattform protokolliert folgende Felder und Ereignisse zur Nachvollziehbarkeit:

| Feld / Event | Bedeutung |
|--------------|-----------|
| `sla_started_at` | Zeitpunkt SLA-Start (= Erstellung der Anfrage bei Kapazitätsanfragen) |
| `sla_respond_by` | Frist-Ende (sla_started_at + sla_minutes) |
| `first_matching_attempt_at` | Erster Matchingversuch (idempotent, einmalig) |
| `first_notification_sent_at` | Erste Benachrichtigung an Agentur (idempotent) |
| `sla_met_at` | SLA als erfüllt markiert (innerhalb Frist) |
| `sla_breached_at` | SLA-Verstoß (durch Cron gesetzt) |
| `sla_status` | RUNNING \| MET \| BREACHED \| RESOLVED |

**Eventtypen in `sla_events`:** SLA_STARTED, MATCHING_ATTEMPT, NOTIFICATION_SENT, SLA_MET, SLA_BREACHED (sowie deadline_set, breached, resolved, escalated für Rückwärtskompatibilität).

**SLA erfüllt (MET):** Wenn innerhalb der Frist mindestens ein MATCHING_ATTEMPT oder NOTIFICATION_SENT erfolgt ist. **SLA verletzt (BREACHED):** Cron setzt BREACHED, wenn `sla_respond_by` überschritten und Status noch RUNNING ist.

---

## 4. Ausschlüsse

Folgende Fälle sind vom SLA ausgeschlossen:

1. **Höhere Gewalt:** Naturkatastrophen, Pandemie-bedingte Einschränkungen, behördliche Anordnungen, Krieg, Terrorismus
2. **Falsche oder unvollständige Angaben** des Kunden in der Anfrage (fehlende Rolle, Region, Datum)
3. **Kunde nicht erreichbar** für Rückfragen innerhalb der SLA-Frist
4. **Geplante Systemwartung** innerhalb der angekündigten Wartungsfenster
5. **Infrastruktur-Ausfall Dritter:** Cloud-Provider (Hetzner), DNS-Provider, CDN, E-Mail-Zustellung (SendGrid)
6. **DDoS-Angriffe** oder sonstige Cyberangriffe, die die Plattform beeinträchtigen
7. **Überschreitung der Tarif-Limits** (z.B. Anfragekontingent erschöpft)

---

## 5. Keine Erfolgsgarantie

**WICHTIG:** TempConnect vermittelt Kapazitäten zwischen Unternehmen und Zeitarbeitsfirmen. Die SLA-Fristen beziehen sich ausschließlich auf den **Matchingversuch** (= Suche und Benachrichtigung passender Agenturen), NICHT auf:

- das Zustandekommen eines Vertrags zwischen Kunde und Agentur
- die tatsächliche Bereitstellung von Personal
- die Qualität oder Eignung des vermittelten Personals
- die Annahme einer Anfrage durch eine Agentur

**Ein Vermittlungserfolg ist nicht geschuldet.** Die Plattform stellt lediglich die technische Infrastruktur für den Matchingprozess bereit.

---

## 6. Service-Gutschriften

### 6.1 PRO (Tarif PLUS)

Bei nachgewiesenem SLA-Verstoß (Matchingversuch > 120 Minuten):
- **10% Gutschrift** auf die Monatsgebühr
- Maximal **1 Gutschrift pro Kalendermonat**
- Maximale Gutschrift: 49,90€

### 6.2 EMERGENCY (Tarif NOTDIENST)

Bei nachgewiesenem SLA-Verstoß (Matchingversuch > 30 Minuten):
- **20% Gutschrift** auf die Monatsgebühr (anteilig) ODER auf die Emergency-Einzelfallgebühr
- Maximal **2 Gutschriften pro Kalendermonat**
- Maximale Gutschrift: 199,80€

### 6.3 Verfügbarkeits-Gutschrift

Bei Unterschreitung der garantierten Plattformverfügbarkeit im Monatsmittel:
- PRO: 10% Gutschrift bei < 99,0%
- EMERGENCY: 15% Gutschrift bei < 99,5%

### 6.4 Kumulierung

Gutschriften sind nicht kumulierbar. Maximale Gesamtgutschrift pro Monat: 100% der Monatsgebühr des jeweiligen Tarifs.

---

## 7. Verfahren zur Gutschrift

1. Der Kunde meldet den SLA-Verstoß **innerhalb von 14 Kalendertagen** nach dem Vorfall per E-Mail an support@tempconnect.de
2. Die Meldung muss enthalten: Anfrage-ID, Zeitstempel, erwartete vs. tatsächliche Reaktionszeit
3. TempConnect prüft den Vorfall anhand des Pulse-Reports (automatisch generiert aus `sla_events`)
4. Bei bestätigtem Verstoß wird die Gutschrift **mit der nächsten Monatsrechnung verrechnet**
5. TempConnect teilt das Ergebnis innerhalb von **10 Werktagen** mit

---

## 8. Änderungen

TempConnect behält sich vor, diese Leistungsbeschreibung mit einer Ankündigungsfrist von 30 Tagen anzupassen. Wesentliche Verschlechterungen berechtigen den Kunden zur außerordentlichen Kündigung zum Änderungszeitpunkt.
