# Flächen-Zuordnung — was gehört in welche Oberfläche

**Warum es diese Datei gibt.** Die Projektregeln sagten bisher, dass die internen Flächen
strikt getrennt sein müssen (`CLAUDE.md` → „Kritische Produkt-Abgrenzung"). Sie sagten nicht,
**was** in welche gehört. Diese Lücke hat in P9 Welle A2 zu einer Fehlplatzierung geführt: der
Rabatt-Katalog wurde zuerst im Owner Control Center gebaut, weil aus dem Code die Ableitung
„Rabatt = Preishebel = Owner-Schicht" naheliegend war. Das Produktmodell des Owners sagt etwas
anderes. Eine Ableitung aus Code ersetzt keine Produktentscheidung — deshalb steht sie jetzt hier.

**Diese Datei ist verbindlich und wird automatisch geprüft.**
`api/test/flaechenZuordnung.test.js` lässt jede Fläche rot werden, deren Modul hier nicht
eingetragen ist. Ein neues Modul zwingt damit zu einer bewussten Zuordnung statt zu einer stillen.

---

## Die drei internen Flächen

| Fläche | Für wen | Wofür |
|---|---|---|
| **Staff Control Center** (`/staff/`) | das TempConnect-Team | Verwaltung der Plattform: Pilotverwaltung, Kataloge, Moderation, Konfiguration, interne Abläufe |
| **Owner Control Center** (`/owner-control/`) | die Eigentümer | der **kundenspezifische** Verwaltungsaufwand und die oberste Steuerungsebene |
| **Support Center** (`/support-ops/`) | Support | Anfragen aus dem Publikum an TempConnect **und** die Support-Möglichkeit für Kundenanfragen zwischen Zeitarbeitsfirmen und Unternehmen — beidseitig orientiert |

## Die Entscheidungsfrage

Vor jedem neuen Modul **eine** Frage, in dieser Reihenfolge:

1. **Kommt die Sache von außen oder läuft sie zwischen zwei Kunden?**
   → **Support Center**. (Publikumsanfrage an TempConnect; Unternehmen ↔ Zeitarbeitsfirma.)
2. **Betrifft sie genau einen Kunden — dessen Vertrag, Konditionen, Eskalation, Sonderfall?**
   → **Owner Control Center**.
3. **Betrifft sie die Plattform als Ganzes oder die Arbeit des Teams?**
   → **Staff Control Center**.

Wenn die Antwort nicht eindeutig ist, ist das **kein** Anlass zum Ableiten, sondern zum Fragen.
Produkt-Taxonomie steht nicht im Code; sie ist Owner-Wissen. Ableitbar ist nur, was das Repository
beantworten kann.

> **Merksatz zur Fehlplatzierung von A2:** Ein plattformweiter Katalog ist Team-Verwaltung —
> auch dann, wenn er Geld bewegt. „Es geht um Geld" verschiebt nichts in die Owner-Fläche;
> maßgeblich ist, **wen** die Sache betrifft, nicht wie schwer sie wiegt.

---

## Namenskollisionen (nicht verwechseln)

| Begriff | Fläche | Was es ist |
|---|---|---|
| `bounty` in **Marketplace Visibility** | Staff CC | `profile_bounties` — bezahlte Marktplatz-Sichtbarkeit **je Kunde**, mit Freigabe-Workflow |
| `bounty` im **Rabatt-Katalog** | Staff CC | `bounties` — plattformweite Treue-/Leistungsrabatte, die jeder Kunde verdienen kann |

Beide leben im Staff Control Center, sind aber verschiedene Tabellen, verschiedene Dienste und
verschiedene Entscheidungen. Die Modul- und Alias-Namen halten sie auseinander
(`bountySvc` = Sichtbarkeit, `bountyKatalog` = Rabatte).

---

## Registry — Owner Control Center

Kundenspezifische Verwaltung und oberste Steuerung.

| Modul | Zweck |
|---|---|
| `executive` | Lage auf einen Blick |
| `decisions-requests` | offene Entscheidungen, die der Owner treffen muss |
| `revenue` | Umsatzlage |
| `platform` | Plattform-Kennzahlen |
| `operations` | Betriebszustand |
| `support-oversight` | Aufsicht über Support-Eskalationen |
| `risk` | Risiko und Compliance |
| `audit` | Audit- und Entscheidungsspur |
| `infrastructure` | Hosts, Docker, Backups |
| `data-explorer` | Datenauskunft über Nutzer, Orgs, Abos |
| `automation-runbooks` | Automatisierung und Runbooks |

## Registry — Staff Control Center

Verwaltung der Plattform durch das TempConnect-Team.

| Modul | Zweck |
|---|---|
| `customer-requests` | Kundenanfragen im Arbeitsplatz |
| `customer-operations` | laufende Kundenvorgänge |
| `subscription-requests` | Abo- und Tarifanfragen |
| `pilots` | Pilotverwaltung |
| `preregistrations` | Voranmeldungen |
| `executive` | Strategiesicht des Teams |
| `platform` | Plattformzahlen |
| `revenue` | Umsatz |
| `billing` | Abrechnung |
| `bounty-catalog` | **Rabatt-Katalog** — plattformweite Treue-/Leistungsbounties (P9 A2) |
| `support` | Support-Arbeitsplatz |
| `support-vendors` | Support-Dienstleister |
| `mail` | Mail und Benachrichtigungen |
| `operations` | Betrieb |
| `incidents` | Störungen |
| `hetzner` | Server |
| `automation` | Automatisierung |
| `risk-trust` | Risiko und Vertrauen |
| `audit-decisions` | Audit und Entscheidungen |
| `audit-report` | Audit-Bericht |
| `data-explorer` | Datenauskunft |
| `data-governance` | DSGVO und Datenschutz |
| `document-vault` | Dokumenten-Tresor |
| `staff-access` | Staff-Zugänge |
| `marketplace-visibility` | bezahlte Marktplatz-Sichtbarkeit (`profile_bounties`) |
| `search-moderation` | Suchmeldungen |
| `commercial-inbox` | kommerzieller Posteingang |

## Support Center

Liegt in `frontend/src/support/` als eine Fläche ohne Modulverzeichnis
(`modules.tsx`), deshalb ohne Registry-Tabelle. Zuständigkeit: siehe oben.

---

## Wenn eine Zuordnung sich als falsch herausstellt

Umziehen, nicht doppelt bauen. Ein Modul an zwei Flächen wäre eine Vermischung der
Session- und Berechtigungswelten — das verbietet `CLAUDE.md` ausdrücklich. Der Umzug ist
billig, solange er früh passiert: Dienst und Datenbank sind platzierungsneutral, nur Route,
Modul und Navigation hängen an der Fläche.
