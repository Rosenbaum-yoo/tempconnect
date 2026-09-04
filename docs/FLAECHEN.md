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

## Unverrückbar: die internen Flächen sind von der Plattform aus NICHT erreichbar

> **Owner-Vorgabe 2026-09-01, wörtlich:** *„staff darf doch nicht aus der plattform erreichbar
> sein, keine kachel dafür. das ist nur für mich ein kontrollcentrum, kein kundenzugang.
> niemals. festschreiben, niemals wieder aufwühlen, darf nie wieder passieren."*

**Die Regel:** Aus der Kundenplattform — Unternehmen, Zeitarbeitsfirmen **und** dem
Einsatzportal der Mitarbeiter — führt **kein** Weg in eine der drei internen Flächen. Keine
Hub-Karte, kein Menüpunkt, kein Link, keine Weiterleitung, **auch kein toter.** Sie sind
Kontrollzentren des Betreibers, kein Kundenzugang. Wer dort hin will, kennt die Adresse.

**Sie gilt für alle drei, nicht nur für das Staff Center.** Die Vorgabe des Owners galt dem
Kundenzugang, nicht einem einzelnen Namen — und eine Regel, die nur für eine von drei
gleichartigen Flächen gilt, ist eine Einladung, es bei der nächsten anders zu machen:

| Fläche | Pfad | Stand 2026-09-01 |
|---|---|---|
| Staff Control Center | `/staff` | kein Weg von der Plattform |
| Owner Control Center | `/owner-control` | kein Weg von der Plattform |
| Support Center | `/support-ops` | kein Weg von der Plattform |

**Das gilt in beide Richtungen der Verwechslung.** Eine Kachel *innerhalb* des Staff Centers
(etwa der Betriebszustand der Takte) ist selbstverständlich erlaubt und oft nötig — sie ist
Teil der Fläche. Eine Kachel *auf der Plattform*, die ins Staff Center führt, ist es nie.
Genau diese beiden Sätze wurden am 2026-09-01 einmal verwechselt; deshalb stehen sie hier
nebeneinander.

**Erzwungen, nicht nur aufgeschrieben:** `api/test/staffNieAusDerPlattform.test.js`
durchsucht **alle** Dateien unter `frontend/public/` und wird rot, sobald einer der drei
Pfade dort als **Ziel** auftaucht.

| Was der Wächter prüft | Warum |
|---|---|
| Kein Ziel auf `/staff`, `/owner-control` oder `/support-ops` in der Plattform | Der sichtbare Weg — je eine eigene Probe, damit die Fehlermeldung die Fläche benennt |
| `/staff` hat eine **eigene Sitzung mit eigenem Cookie** (`tc.staff.sid`, `api/app.js`) | Das Tragende. Teilte sich das Staff Center das Plattform-Cookie, wäre jede angemeldete Kundensitzung eine halbe Staff-Sitzung — und es bräuchte gar keinen Link |
| Selbstprobe **und zwei** Gegenproben | `/staff` ist Teilzeichenkette von `/staffing-assignments`, `/staffing-requests`, `/staffing-choice-sets` — die stehen dutzendfach in der Plattform und sind völlig in Ordnung. Ein Wächter, der sie anklagt, wird abgeschaltet; einer, der zu grob sucht, meldet 18 Fehlalarme und keinen echten Fund |
| **Ein Weg, keine Erwähnung** | Der Pfad zählt nur als Wert eines Ziels (`href=`, `src=`, `action=`, oder in Anführungszeichen). Prosa ist kein Weg. Der erste Entwurf ließ jedes `=` gelten — und klagte prompt `?return=/owner-control/` an, also **eine Abfragezeichenfolge in einem Kommentar, der die Gegenrichtung beschreibt**: die Fläche schickt zur Anmeldung und zurück. Die Gegenprobe hat das gefangen, bevor es Regel wurde |

**Die einzige Ausnahme** ist die Staff-Anwendung selbst: sie wird nach `frontend/public/staff/`
gebaut und lädt von dort ihr eigenes Bündel. Sie liegt damit im **selben** Dokumentenwurzel-
verzeichnis wie die Plattform — getrennt sind die beiden Welten also nicht durch die Ablage,
sondern durch Sitzung und Zugangsprüfung. *Wer die Ablage für die Trennung hält, sichert das
Falsche.*

**Stand 2026-09-01, gemessen:** null Wege von der Plattform in eine der drei Flächen.
Nachgewiesen durch Rückmutation an einer echten Plattformseite — je eine eingebaute
Hub-Karte für `/staff`, `/owner-control` und `/support-ops` (auch in unquotierter Form)
lässt den Wächter mit Nennung von Datei und Zeile rot werden; ohne sie ist er grün.

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
| `rabatt-faelle` | **Rabatt-Fälle** — der Einzelfall zum Katalog: welchen Rabatt bekommt ein Kunde, warum, wo ist die Ermittlung ausgefallen, und der Eingriffspunkt (K1). Steht im Staff CC und nicht im OCC, weil die Rabatt-Automatik die Plattform als Ganzes betrifft — sie ist eine Regel für alle Kunden, kein kundenspezifischer Vertrag. Der Einzelfall ist ihre *Ansicht*, nicht ihr Gegenstand. |
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
| `markt-sichtbarkeit` | wessen Kräfte am Markt unauffindbar sind — plattformweit und je Agentur. **Entscheidungsfrage:** betrifft nicht einen Kunden, sondern den Marktplatz als Ganzes und die Akquise-Arbeit des Teams → Antwort 3, Staff CC. Der Einzelfall („warum ist bei DIESER Firma niemand sichtbar“) wäre eine OCC-Frage — neue OCC-Module sind seit dem Owner-Entscheid vom 2026-08-27 gesperrt, und die Liste selbst ist ohnehin plattformweit |
| `commercial-inbox` | kommerzieller Posteingang |

## Support Center

Liegt in `frontend/src/support/` als eine Fläche ohne Modulverzeichnis
(`modules.tsx`), deshalb ohne Registry-Tabelle. Zuständigkeit: siehe oben.

---

## „Das Team" ist eine Person (Owner-Feststellung 2026-08-27)

In der Tabelle oben steht beim Staff Control Center *„für das TempConnect-Team"*.
Das ist heute **ein Mensch** — der Owner selbst — plus Claude. Es gibt **keine
zweite Staff-Rolle**.

Für die Flächenfrage ändert das nichts: Das Staff CC bleibt die Fläche für
plattformweite Verwaltung, unabhängig davon, wie viele Menschen sie bedienen.

Für die **Bauart** ändert es viel. Keine Funktion darf voraussetzen, dass eine
zweite Staff-Person existiert: kein Vier-Augen-Prinzip, keine Freigabe durch eine
andere Rolle, keine Zuweisung an Kolleginnen. Solche Wege wären dauerhaft
blockiert. Missbrauchsschutz entsteht deshalb **strukturell** — eine Handlung darf
gar nicht erst mehr vergeben können, als die Regel hergibt. Vollständig in
`CLAUDE.md`, Abschnitt „Das Team ist eine Person".

---

## Wenn eine Zuordnung sich als falsch herausstellt

Umziehen, nicht doppelt bauen. Ein Modul an zwei Flächen wäre eine Vermischung der
Session- und Berechtigungswelten — das verbietet `CLAUDE.md` ausdrücklich. Der Umzug ist
billig, solange er früh passiert: Dienst und Datenbank sind platzierungsneutral, nur Route,
Modul und Navigation hängen an der Fläche.

---

## Owner-Entscheid 2026-08-27: das Owner Control Center wird überführt

> **Status: festgehalten, NICHT ausgearbeitet.** Der Owner schreibt dazu einen eigenen
> Abschnitt. Diese Notiz hält nur die Richtung fest, damit bis dahin niemand in die
> Gegenrichtung baut.

**Der Entscheid im Wortlaut des Owners:** *„owner control center mit ins staff center
integrieren oder überführen, weil die Sachen so getrennt zu handhaben macht meiner Meinung
nach keinen Sinn. Eigentlich wollte ich das Owner Center abschalten, aber wenn dort wichtige
Prozesse laufen, integrieren wir diese ins Staff Control Center."*

**Was das für die Tabelle oben bedeutet.** Die Dreiteilung der Flächen bleibt als
Denkmodell — die Entscheidungsfrage (*von außen? ein Kunde? die Plattform?*) ist weiter
richtig. Was sich ändert, ist die **Oberfläche**, in der die Owner-Antwort landet: nicht
mehr `/owner-control/`, sondern eine Owner-Ebene **innerhalb** des Staff Control Center.

**Warum das nicht bloß ein Umzug von elf Modulen ist.** Die `CLAUDE.md` verbietet die
Vermischung von Session- und Berechtigungswelten, und das OCC hat heute eine eigene:
`requireOwnerControlAccess` mit eigener Allowlist, eigenem Audit-Namensraum
(`owner_control.*`) und einem eigenen Zugangs-Nachweis
(`owner_control_access_audit` — dort standen am 26.08. **23 abgewiesene Zugriffsversuche**).
Eine Überführung muss diese Trennung **innerhalb** des Staff CC erhalten, sonst wird aus
zwei sauberen Welten eine unsaubere. Konkret zu beantworten, wenn der Abschnitt kommt:

- Bleibt `requireOwnerControlAccess` als zusätzliche Stufe **über** der Staff-Rolle, oder
  wird daraus eine sechste Staff-Rolle? (Sechs Rollen sind seit `8eb9971` durchgesetzt.)
- Was passiert mit dem Audit-Namensraum `owner_control.*` und dem Zugangs-Nachweis?
- Elf OCC-Module treffen auf 26 Staff-Module — **sieben Namen kollidieren**
  (`executive`, `platform`, `revenue`, `operations`, `risk`/`risk-trust`, `audit`,
  `data-explorer`, `automation`). Verschmelzen oder nebeneinanderstellen? Das ist die
  eigentliche Produktfrage, und sie ist nicht aus dem Code ableitbar.
- Das OCC ist eine **React-Fläche** (Vite, `frontend/src/owner-control/`), das Staff CC
  eine andere Bauart. Überführen heißt entweder portieren oder einbetten.

**Bis der Abschnitt vorliegt gilt:** Keine neuen Module im OCC anlegen, keine bestehenden
entfernen. Wer dort etwas anfasst, macht es umzugsfähig — Dienst und Datenbank bleiben
platzierungsneutral (siehe Absatz darüber), nur Route, Modul und Navigation hängen an der
Fläche.
