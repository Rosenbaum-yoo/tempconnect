# TempConnect – Sales Demo Pfad
**Für Vertriebsgespräche und Produkt-Demos**
**Stand: Mai 2026 | Dauer: ~45 Minuten**

---

> Dieses Dokument beschreibt den empfohlenen Demo-Pfad für Sales-Gespräche.
> Demo-Daten werden über `sql/seeds/demo-sales.sql` geladen.
> **Niemals Produktionsdaten in Demo-Umgebungen!**

---

## Voraussetzungen

```bash
# 1. Demo-Umgebung starten
docker compose -f docker-compose.yml -f docker-compose.demo.yml up -d

# 2. Demo-Daten laden
psql $DATABASE_URL < sql/seeds/demo-sales.sql

# 3. Demo-URL
https://demo.tempconnect.de   (oder lokal: http://localhost:3000)
```

**Demo-Accounts (Passwort überall: `Demo2026!`):**
| Account | E-Mail | Rolle | Szenario |
|---|---|---|---|
| Personalverantwortlicher | `demo-hr@mustermann-gmbh.de` | company (PLUS) | Bedarfsseite |
| Agenturdisponent | `demo-dispatch@toptemp.de` | agency (PRO) | Angebotsseite |
| Zeitarbeitskraft | `demo-worker@example.de` | worker | Worker-Portal |
| Admin-Ansicht | Via SCC `/staff` | staff | [Intern, nicht für Demo] |

---

## Demo-Pfad: Standardszenario (45 min)

### Akt 1: Problem + Erste Eindrücke (10 min)

**Einstieg (Moderator spricht):**
> "Ihr habt heute 8 Anfragen für externe Kräfte offen — wie viel Zeit verbringt ihr
> täglich mit E-Mails, Telefonaten und Excel-Listen dafür?"

1. **Login als HR-Manager** (`demo-hr@mustermann-gmbh.de`)
2. Dashboard zeigen → Kennzahlen: offene Anfragen, laufende Einsätze, SLA-Score
3. **Hub-Karte öffnen:** "Meine Lieferanten" → Pool mit 12 vorselektierten Agenturen
4. Klick auf eine Anfrage → Timeline anzeigen (Status, letzte Aktivität, Ansprechpartner)

**Key Message:** *"Kein E-Mail-Chaos. Alles an einem Ort. Für jede Seite."*

---

### Akt 2: Anfrage stellen + Angebot erhalten (15 min)

1. **Neue Anfrage erstellen:** "Lager / Kommissionierung, Hamburg, 3 Kräfte, ab Montag"
2. System schlägt passende Agenturen vor (Matching-Engine)
3. Anfrage an 2 Agenturen senden — Live-Demo
4. **Account wechseln zu Agentur** (`demo-dispatch@toptemp.de`)
5. Eingehende Anfrage sehen → Angebot erstellen → Preis + Verfügbarkeit eintragen
6. Zurück zu HR-Account → Angebot vergleichen + akzeptieren
7. **Automatische Bestätigung** → beide Seiten benachrichtigt

**Key Message:** *"Von Anfrage zu Bestätigung in unter 3 Minuten."*

---

### Akt 3: Einsatz läuft — Kontrolle behalten (10 min)

1. **Laufende Einsätze:** Kalenderansicht der aktuell laufenden Assignments
2. **Zeiterfassung:** Worker reicht Stundenzettel ein (Worker-Portal Demo)
3. **Freigabe durch HR:** Stundenzettel in einer Klick genehmigen
4. **Bewertung:** Gegenseitiges Rating nach Einsatz
5. **Spend Analytics:** "Wie viel haben wir diesen Monat für externe Kräfte ausgegeben?"
   → Aufschlüsselung nach Kategorie, Agentur, Standort

**Key Message:** *"Volle Transparenz über jeden Cent. Revisionssicher."*

---

### Akt 4: Enterprise-Features (10 min, je nach Zielgruppe)

**Für große Unternehmen (100+ Mitarbeiter):**

1. **Multi-Standort:** Filter "Alle Standorte" → "Hamburg" → Spend-Vergleich
2. **Rate Cards:** "Ihr habt für Pflege in Hamburg immer 22 €/h bezahlt — das legen wir einmal fest"
3. **Vendor Pool:** Privatisierter Lieferantenpool (eigene Konditionen, keine öffentliche Sichtbarkeit)
4. **Governance / Audit:** "Wer hat wann was genehmigt?" → Audit-Log zeigen
5. **SLA-Scorecard:** Agentur-Bewertung anhand definierter SLAs

**Für kleinere Unternehmen (BASIS/PLUS):**

1. Einfache Listenansicht der Agenturen
2. Direkte Anfragen ohne Vendor Pool
3. Stundenzettel + Bewertung
4. Upgrade-Pfad erklären: "Wenn ihr wächst, wächst das System mit"

---

### Abschluss: Preismodell + Nächste Schritte (5 min)

**Preispunkte (Demo-Preise, nicht binding):**
| Plan | Zielgruppe | Preis |
|---|---|---|
| BASIS | 1-5 User, einfache Anfragen | [siehe Pricing-Page] |
| PLUS | Bis 10 User, Vendor Pool | [siehe Pricing-Page] |
| PRO | Bis 25 User, Rate Cards, SLA | [siehe Pricing-Page] |
| INDIVIDUELL | Enterprise, Multi-Standort | Auf Anfrage |

**Typischer nächster Schritt:**
- 14-Tage-Test ohne Kreditkarte
- Pilot-Programm für Enterprise (3 Monate, begleitetes Onboarding)

---

## Häufige Einwände + Antworten

| Einwand | Antwort |
|---|---|
| "Wir nutzen schon ein ERP/ATS" | "TempConnect ist kein Ersatz, sondern Ergänzung. API-Anbindung möglich (PRO+). Daten fließen rein, nicht raus." |
| "Zu komplex für unser Team" | "BASIS ist 2-Klick: Anfrage stellen, Angebot annehmen. Kein Training nötig." |
| "Was ist mit Datenschutz?" | "100% DSGVO, Hosting in Deutschland (Hetzner), AVV inklusive, Audit-Trail für jede Aktion." |
| "Preis zu hoch" | "Was kostet euch 1 Stunde Telefonieren + E-Mails für eine Anfrage? BASIS amortisiert sich bei 2 Anfragen/Monat." |
| "Wir haben eigene Agenturen" | "Perfekt — Vendor Pool anlegen, eure Agenturen einladen. Alles privat, kein Marktplatz." |

---

## Demo-Daten zurücksetzen

```bash
# Demo-Daten löschen + neu laden (zerstörerisch!)
psql $DATABASE_URL -c "
  DELETE FROM users WHERE email LIKE '%@mustermann-gmbh.de' OR email LIKE '%@toptemp.de';
"
psql $DATABASE_URL < sql/seeds/demo-sales.sql
```

---

## Bekannte Demo-Fallstricke

1. **E-Mails gehen in Demo nicht raus** — SMTP in Demo-Config auf `mailtrap.io` oder `localhost:1025` (Mailhog)
2. **Worker-Portal URL:** `/worker/portal` — separater Link, nicht in der Haupt-Nav
3. **Rate Cards sichtbar** nur in PRO-Account — Agenturdisponent hat PRO-Plan in Demo-Daten
4. **Stripe-Zahlungsflow** ist in Demo deaktiviert (kein `STRIPE_SECRET_KEY` in Demo-Config)

---

*Fragen zum Demo-Setup: [Sales-interne Kontaktadresse]*
