# I — Audit-Trennung, Zuweisung, Support

> **Stand: 2026-08-21.** Arbeitsanweisung für die nächsten Sitzungen.
> Abschnitte 8.1.1, 8.1.2, 8.2, 10 und 10b nach Owner-Vorgabe, davor ein
> Vorlauf aus dem, was H2 offen gelassen hat.
>
> **Abschnitt 8.1.1 ist an der Quelle gemessen, nicht vermutet.** Die Recherche
> steht hier vollständig — wer diesen Plan liest, braucht das Sitzungsprotokoll
> nicht.

---

## Reihenfolge

| | Abschnitt | Art | Aufwand |
|---|---|---|---|
| **V** | Vorlauf: RLS-Backstop, ~~Doku-Wächter~~ (V-2 erledigt) | Sicherheit + Werkzeug | 1 Welle |
| **1** | **8.1.1** Audit-Log hart trennen | **Sicherheitsbefund, aktiv** | 1 Welle |
| **2** | **8.1.2** Aktive Sitzungen im Audit | Sicherheit + Produkt | 3–4 h |
| **3** | **8.2** Ersatz-Zuweisung vereinfachen | Produkt/UX | 1 Welle |
| **4** | **10** Support-Weg Kunde → TempConnect | Produkt | 1–2 Wellen |
| **5** | **10b** Kunde ↔ Kunde | **Entscheidung zuerst** | — |

**8.1.1 zuerst nach dem Vorlauf** — es ist der einzige Punkt mit einem
laufenden Datenabfluss.

---

## V — Vorlauf (vor den Abschnitten)

Zwei Dinge aus H2, die vor den neuen Abschnitten gehören, weil sie jede
folgende Arbeit tragen.

### V-1 — Der fehlende RLS-Backstop (P1-16) — **gemessen 2026-08-21, Aktivierung owner-gated**

`docs/security/TENANT_ISOLATION_MODEL.md` verwies für 63 Tabellen auf eine
Migration 117. **Die gibt es nicht** — `sql/migrations/` springt von 116 auf 118.

> **Die Dokumentation behauptete einen Schutz, den es nicht gibt.** Das ist
> schlimmer als kein Schutz — wer sie liest, hört auf zu suchen.

**Gegen die laufende Datenbank nachgemessen war das Dokument in beide Richtungen
falsch** (Commit `cc2be0a`):

- **18 der genannten Tabellen haben die behauptete Spalte `org_id` nicht.**
  `capacities.agency_id`, `demand_requests.requester_company_id` und
  `offers.supplier_company_id` zeigen auf **`users`**, nicht auf `organizations`
  (39/39 bzw. 38/38 Werte treffen `users`, null treffen `organizations`). Eine
  aus dem Dokument geschriebene Migration wäre an genau dem Fehler gescheitert,
  der schon `116` in den Rollback riss — und `116` wurde trotzdem als
  „applied“ verbucht.
- **Der Abschnitt „RLS AKTIV“ war ebenfalls falsch:** `subscriptions` stand dort
  als geschützt, obwohl `116` sie ausdrücklich ausnimmt und die Datenbank
  `relrowsecurity = false` zeigt; `vendor_pool_entries` existiert gar nicht. Die
  gefährlichere Hälfte des Dokuments war die, die Schutz behauptete.
- **Umgekehrt fehlten 60 Tabellen**, die sehr wohl einen Mandanten tragen: es
  sind **78**, nicht 28. Nur 8 haben RLS, nur 3 davon FORCE.

**Warum die Migration nicht einfach nachzutragen ist — und was das für die
Reihenfolge bedeutet:**

Bei **10 Tabellen ist die Trägerspalte gar nicht oder kaum gefüllt** —
`requests`, `ratings` und `listings` zu **100 %**, `notifications` zu **96 %**
(731 von 765). RLS wäre dort **kein Schutz, sondern ein Datenausfall**: die
Zeilen würden für *jeden* unsichtbar, auch für den Eigentümer.

> Das ist **derselbe Defekt wie in 8.1.1** (`audit_log`: 1796 von 2740 Zeilen
> ohne `org_id`). Die Schreibseite trägt den Mandanten nicht ein. **8.1.1 gehört
> deshalb VOR die RLS-Aktivierung dieser Tabellen**, nicht danach — die im
> Kopf dieses Plans notierte Reihenfolge dreht sich an dieser Stelle um.

**Gebaut und verifiziert:**
- `api/test/fixtures/mandantenTabellen.json` — alle 78 Tabellen mit
  Trägerspalte, Zeilen-/`NULL`-Zählung und Einstufung samt Begründung:
  **8 geschützt · 18 bereit · 25 bereit-ohne-Daten · 10 durch Daten blockiert ·
  17 kein Mandantenträger.**
- Der Zustandsteil des Modells wird **gerendert statt gepflegt**
  (`node scripts/render-mandanten-modell.js --write`).
- `api/test/mandantenModellWaechter.test.js` in zwei Schichten: ohne Datenbank
  Dokument gegen Registry Zeichen für Zeichen, samt der Probe, dass das Modell
  keine Migration und kein RLS mehr behauptet, das es nicht gibt; mit Datenbank
  die Registry gegen die Wirklichkeit, in beide Richtungen. Host 8/8, Container
  11/11. Rückmutation: erfundene Trägerspalte + falsche RLS-Behauptung → 3 Tests
  rot.

**Owner-Entscheidung 2026-08-21:**

1. **8.1.1 zuerst, RLS danach.** Die Schreibseite wird repariert, bevor der
   Backstop gesetzt wird — sonst sichert man leere Trägerspalten ab und macht
   Daten unsichtbar statt sie zu schützen.
2. **Nachweis je Tabelle einzeln an einer Wegwerf-Datenbank** mit
   Nicht-Superuser-Rolle: zwei echte Organisationen; ohne Kontext 0 Zeilen, mit
   Org A nur A, mit Staff-Bypass alles. Kein Sammelnachweis, keine Aktivierung
   ohne diesen Beweis — lokal läuft die Anwendung als Superuser, RLS ist dort
   wirkungslos und ein Fehler würde von der Testsuite **nicht** bemerkt.

Die 18 bereiten und 25 leeren Tabellen stehen benannt in
`api/test/fixtures/mandantenTabellen.json` und warten damit auf eine eigene
Welle nach 8.1.1.

### V-2 — Die Doku-Wächter im Worktree (P2-W1) — **erledigt 2026-08-21**

`docsConsistency` und `dokuWaechter` leiteten aus einem **fehlenden** Pfad einen
Befund ab. Zwei Sitzungen sind unabhängig hineingelaufen.

**Es waren drei Wächter, nicht zwei.** `releaseSecretScan` verlangte
`deploy/.env` — ebenfalls gitignored, ebenfalls nur im Haupt-Checkout. Der volle
Lauf hat ihn gefunden, nicht das Nachdenken.

**Und der Fehler wirkte in beide Richtungen.** Die ignorierte
`docs/launch/C_HETZNER-DEPLOY-RUNBOOK.md` liess im Haupt-Checkout vier echte
Dokumente als verlinkt erscheinen, die im Repo in keinem Index standen —
darunter ausgerechnet `docs/security/TENANT_ISOLATION_MODEL.md`, das Dokument
aus V-1. Falsch rot hier, falsch grün dort.

**Gebaut:** Die Wächter prüfen den **git-Index** statt des Dateibaums
(`api/test/helpers/repoBestand.js`). Was git bewusst nicht trägt, wird als
*nicht geprüft* benannt und gezählt („1 von 2 Wurzeln geprüft (docs), 261
getrackte Markdown-Dateien. Nicht geprüft, weil nicht Teil des Repos:
`.agents`."), nie als Fund. Die vier Dokumente stehen jetzt in `docs/README.md`;
die Ratsche ist dabei von 154 auf 146 geschrumpft, ohne einen einzigen neuen
Eintrag.

**Keine Hintür:** `git check-ignore` befragt den Index mit — eine getrackte
Datei gilt nie als ignoriert. Man wird einen Befund also nicht dadurch los, dass
man den Pfad in `.gitignore` einträgt. `api/test/repoBestand.test.js` weist das
per Rückmutation nach, samt der git-Falle, dass ein abschliessender
Schrägstrich (`docs/README.md/`) den Index-Abgleich aushängt und **jeden** Pfad
als ignoriert meldet.

**Verifiziert in drei Umgebungen mit identischem Urteil:** Worktree, frischer
`git clone` (trägt keine ignorierten Dateien) und ein Baum, in dem sie liegen.
Voller Lauf **9524/0** (13 übersprungen) — der erste grüne Gate-Lauf in diesem
Worktree überhaupt.

---

## 8.1.1 — Das Audit-Log hart trennen

### Der Befund, gemessen

Im Screenshot sieht `elmiraaaa@gmail.co` einen `auth.login` von
`dennissss@gmail.co`. Beide sind in **verschiedenen** Organisationen:

| Konto | Rolle | Organisation |
|---|---|---|
| `elmiraaaa@gmail.co` | company | **Unternehmen** |
| `dennissss@gmail.co` | agency | **Zeitarbeit** |

**Die naheliegende Erklärung ist falsch.** Der Lesepfad ist sauber:
`queryOrgAuditLog` → `queryAuditLog` filtert mit `al.org_id = $n`
(`services/auditLog.js:245`), und das kann `NULL` nicht treffen.

**Gemessen wurde stattdessen:** die Zeile aus dem Screenshot trägt
**elmiraaaas `org_id`** — obwohl der Akteur nie Mitglied dieser Organisation
war. Der Fehler liegt beim **Schreiben**, nicht beim Lesen.

```
Zeilen, deren Akteur NICHT Mitglied der eingetragenen Org ist:  135
  103  notification.mark_read
   16  auth.register
   12  auth.login
    4  demo.login
```

Dazu die zweite Hälfte: **1796 von 2740 Zeilen tragen gar keine `org_id`** —
bei `auth.login` 977 von 1013. Diese Zeilen sind heute in *keinem* Org-Audit
sichtbar und damit für den Admin unsichtbar, der sie eigentlich braucht.

> **Zwei Defekte in einer Tabelle, mit gegenläufiger Wirkung:** ein Teil der
> Zeilen liegt in der **falschen** Organisation (Leck), der größere Teil in
> **keiner** (Lücke in der Nachvollziehbarkeit). Wer nur den ersten behebt,
> macht das Audit dichter — und gleichzeitig noch löchriger.

**Warum gerade `auth.*`:** Beim Anmelden gibt es noch keine Organisation. Was
`req.orgId` in diesem Moment enthält, stammt aus dem, was der Browser
mitbringt — ein Rest aus einer vorherigen Sitzung. Genau deshalb stehen
`auth.login`, `auth.register` und `demo.login` in der Fehlerliste.

### Was zu bauen ist

**(a) Die Quelle korrigieren — Schreibseite.**
Ein Audit-Eintrag darf die Organisation nicht aus dem Anfragekontext raten. Für
jede Aktion muss feststehen, woher die Org kommt:

- **Aktionen an einer Ressource** → aus der Ressource (`requisitions.org_id`,
  `timesheets.org_id`, …), nicht aus `req.orgId`.
- **Aktionen am Konto** (`auth.*`, `me.*`) → die Org **des handelnden Nutzers**,
  aufgelöst über `org_memberships`. Hat er mehrere, ist es die aktive; hat er
  keine, bleibt es `NULL` — und das ist dann *richtig*.
- **Nie** stillschweigend `req.orgId`, wenn die Aktion gar keinen Org-Bezug hat.

Das ist derselbe Grundsatz wie in H2: **die Grenze gehört an die Quelle der
Wahrheit, nicht an den Kontext des Aufrufers.**

**(b) Den Bestand bereinigen.**
Migration, die die 135 falsch gestempelten Zeilen korrigiert (Org des Akteurs
zum Zeitpunkt) oder auf `NULL` setzt, wenn sie nicht auflösbar ist. **Nicht
löschen** — ein Audit-Eintrag, der verschwindet, ist schlimmer als einer, der
falsch liegt. Und die org-losen Zeilen nachziehen, wo der Akteur eindeutig
zuordenbar ist.

**(c) Drei Sichten, hart getrennt** (Owner-Vorgabe):

| Sicht | Wer | Sieht |
|---|---|---|
| Audit **Zeitarbeitsfirma** | deren `owner`/`admin` | ausschließlich die eigene Org |
| Audit **Unternehmen** | deren `owner`/`admin` | ausschließlich die eigene Org |
| Audit **Plattform** | Staff Control Center | alle Organisationen |

Die ersten beiden sind **dieselbe** Route mit derselben Grenze — der Unterschied
ist der Mandant, nicht die Rolle. Eine zweite Route zu bauen hieße, dieselbe
Grenze zweimal zu pflegen; H2 hat gezeigt, wohin das führt (80 Kopien, und
gefährlich waren die Stellen **ohne** Kopie).

**(d) Der Admin-Bereich, beidseitig geprüft.**
Owner-Vorgabe: „Firmen dürfen nur Zugang zu den Daten der eigenen Mitarbeiter
haben." Zu prüfen ist `/public/admin_panel.html` und `api/routes/admin.js` —
letzteres trägt heute den Torwächter `requireAdmin`, der laut Übergabe einen
Bypass `ADMIN_PANEL_OPEN` kennt (per Voreinstellung aus). Für jede Route der
Fläche ist zu klären: Plattform-Administration oder Kunden-Administration? Beide
in einer Datei sind der Anfang des nächsten Lecks.

**(e) Die plattformweite Sicht gehört ins Staff Center.**
`getRecentChangesPlatformWide` existiert bereits und ist bewusst so benannt, dass
man sie nicht versehentlich trifft (Befund E-5). Das Staff Center bekommt die
Fläche, die die Kunden-Fläche heute fälschlich bietet.

### Verifikation (Pflicht)

- **Verhaltensprobe** wie in H2: zwei Organisationen, ein Eintrag je Seite,
  Kreuzabruf → 403 bzw. leere Menge, **gegen das echte Schema**.
- **Bestandsprobe:** die Abfrage „Akteur nicht Mitglied der eingetragenen Org"
  muss **0** liefern — sie liefert heute 135. Diese Zahl ist die Abnahme.
- **Gegenprobe:** der eigene Admin sieht seine Org weiterhin vollständig.
  Eine Trennung, die das eigene Audit leert, ist keine Reparatur.
- Beide Register (`orgGrenzen.json`, `wachen.json`) nachziehen.

---

## 8.1.2 — Aktive Sitzungen im Audit (Einsatzportal)

Das Einsatzportal zeigt heute „2 aktive Sitzungen — davon 1 auf anderen Geräten"
mit *Andere Geräte abmelden* / *Überall abmelden* (Screenshot 2). Was fehlt: die
**Nachverfolgbarkeit** — welches Gerät, seit wann, von wo.

**Vorhanden:** eine Tabelle `session`. Zu klären ist zuerst, ob sie Gerät,
Zeitpunkt und Herkunft überhaupt führt, oder ob das mitgebaut werden muss.

**Die Grenze ist hier heikler als sonst.** Owner-Vorgabe: „nur intern pro Firma".
Ein Arbeiter im Einsatzportal ist Mitglied **einer** Zeitarbeitsfirma, arbeitet
aber im Einsatz **eines Kunden**. Zu entscheiden ist:

- Sieht die Zeitarbeitsfirma die Sitzungen ihrer Arbeiter? *(vermutlich ja —
  sie ist der Arbeitgeber)*
- Sieht das **Einsatzunternehmen** sie? *(vermutlich nein — es bekommt Arbeit
  geliefert, nicht Personalverwaltung)*

Das ist eine Flächen-Frage nach `docs/FLAECHEN.md` und gehört **entschieden,
nicht abgeleitet**.

**Datenschutz:** Sitzungsdaten sind personenbezogen. Was aufgezeichnet wird
(IP? Gerätekennung? Standort?), gehört in `TENANT_ISOLATION_MODEL.md` und in die
Datenschutzerklärung, bevor es gebaut wird — nicht danach.

---

## 8.2 — Die Ersatz-Zuweisung vereinfachen

### Was heute stört (Screenshot 3)

`worker-submissions-review.html` zeigt die Begründung als senkrecht umbrechende
Textsäule („Fehlt: Rollenfit nicht sauber belegt: Maler"). Der Weg ist außerdem
umständlich: man muss ihn kennen und aufrufen.

### Die Frage des Owners — ja, das geht

> *„Oder hier auch mit einem Button, der sofort sichtbar ist, wenn jemand
> ausfällt, und sofort verfügbares Personal vorschlägt und automatisch
> vorgefüllte Zuweisungen macht, aber nichts bestätigt?"*

Ja. Und die Teile dafür liegen bereits alle da:

- **Der Ausfall ist schon ein Ereignis.** Wellen G1–G4b haben Abwesenheit,
  Verspätung und die Kundenmeldung gebaut (`assignment_worker_unavailable`).
- **Der Vorschlag existiert schon.** `assignmentStaffingService` liefert
  Auswahlmengen samt Bewertung (Verfügbarkeit/Distanz/Zuverlässigkeit — die
  Zahlen im Screenshot).
- **Die Live-Belegschaft ist die richtige Fläche.** Dort sieht man, wer heute
  arbeitet — also auch, wer heute fehlt.

**Zu bauen:** Fällt jemand aus, erscheint **in der Live-Belegschaft** an der
betroffenen Zeile eine Handlung *„Ersatz vorschlagen"*. Sie öffnet eine
**vorausgefüllte** Zuweisung — bester Treffer vorgewählt, Begründung lesbar
daneben. Der Disponent klickt *Zuweisen*, sonst nichts. **Nichts wird ohne
diesen Klick bestätigt.**

### Was dabei nicht vergessen werden darf

**Der Ersatz-Mitarbeiter muss benachrichtigt werden und annehmen oder ablehnen
können — genau wie bei einer regulären Zuweisung.** Das ist der Teil, der heute
fehlt und der die Sache erst zu Ende bringt: eine Zuweisung, die der
Zugewiesene nicht bestätigt hat, ist eine Absichtserklärung, keine Besetzung.

**Karte und Text überarbeiten:** die Begründung als Zeile statt als Säule, in
ganzen Sätzen („Rollenfit nicht belegt — gesucht: Maler").

**Verify:** Ausfall melden → Vorschlag erscheint in der Live-Belegschaft →
vorausgefüllte Zuweisung → Absenden → Ersatz bekommt Benachrichtigung → er
lehnt ab → der Einsatz ist wieder offen und der Vorschlag erscheint erneut.
Der Ablehnungsweg ist der wichtigere Test.

---

## 10 — Der Support-Weg vom Kunden zu TempConnect

### Der Aufbau, in dieser Reihenfolge

Owner-Vorgabe, und die Reihenfolge ist der eigentliche Entwurf:

1. **Zuerst auf die Hilfeseite verweisen** — damit nicht jede Kleinigkeit im
   Support Center landet. *Unnötiger Aufwand für das TempConnect-Team.*
2. **Dann Telefon.**
3. **Dann erst** eine Anfrage ins Support Center.

> Das ist eine Trichter-Entscheidung, keine Gestaltungsfrage: Wer die
> Reihenfolge umdreht, baut sich die Last selbst. Der teuerste Kanal steht
> zuletzt.

Dazu: **Inhalte melden.** Bei Angeboten muss man freche oder betrügerische
Inhalte ins Staff Control Center melden können.

### Was schon da ist

`api/routes/support.js` ist reifer als es aussieht — es hat einen Torwächter am
Präfix (`supportAuth`), Warteschlangen, Fallarten und `data_scope`
(`assigned_only` / `vendor_scoped`), dazu eine Mengenbremse gegen Massenabruf
durch externe Agenten. **Was fehlt, ist die Kundenseite:** ein Weg *hinein*.

### Zu bauen

- **Im Hilfe-Center** die drei Schaltflächen in der Reihenfolge oben.
- **Am Angebot** eine Meldefunktion, die im Staff Control Center landet.
- **Das Support Center ausbauen** — es war für die Abgabe nach Indien gedacht
  und ist verankert, aber nicht fertig.
- **Audit darüber im Staff Center**, und verwaltbar, wer was bearbeiten darf.

### Die Zugangsregel — hart

> **Nur Staff oder von Staff eingetragene Nutzer.** Kein Zugang für Unternehmen,
> kein Zugang für Personaldienstleister.

Das Muster dafür existiert bereits: `supportAuth` am Präfix ist die **strengere**
Bauart (auf einer neuen Route nicht vergessbar), und der Wächter kennt sie seit
H2 (`alsPraefix` im Register). Beim Ausbau nicht davon abweichen.

---

## 10b — Kunde ↔ Kunde: meine Empfehlung

**Die Frage:** Sollen Unternehmen und Zeitarbeitsfirmen sich gegenseitig über die
Plattform kontaktieren können, oder reicht eine Kontaktnummer bei der
Ansprechperson des Auftrags?

**Empfehlung: keine Nachrichtenfunktion bauen — aber die Ansprechperson zur
Pflicht machen.**

Drei Gründe:

1. **Die Kosten trägt TempConnect, nicht der Kunde.** Ein Nachrichtenkanal
   zwischen Kunden erzeugt Erwartungen an *euch*: Zustellung, Aufbewahrung,
   Moderation, DSGVO-Auskunft über fremde Konversationen. Die Beschwerden landen
   am Ende doch bei euch — genau das, was die Frage vermeiden will.
2. **Zwei Kanäle für dasselbe verwirren.** Es gibt bereits Anfragen, Angebote,
   Deals und Rückmeldungen — alle an einem Vorgang. Eine freie Nachricht
   *daneben* zerreißt die Nachvollziehbarkeit: Die Absprache steht dann nicht
   mehr am Deal.
3. **Das Telefon ist im Tagesgeschäft schneller.** Wer morgens um sechs vor einer
   leeren Schicht steht, schreibt keine Nachricht.

**Was stattdessen zu bauen ist — klein:**

- **Ansprechperson mit Telefonnummer wird Pflichtfeld** am Auftrag/Deal, für
  beide Seiten sichtbar. (Teilweise vorhanden: `contact_name`, `contact_phone`
  stehen bereits auf `offers`.)
- **Sichtbar, wo man sie braucht** — an der Besetzung und in der
  Live-Belegschaft, nicht nur in der Deal-Akte.
- **Der Eskalationsweg bleibt 10:** Kommen die beiden nicht weiter, geht es über
  den Support-Weg zu TempConnect — mit Bezug auf den Vorgang.

> **Aufwand:** Stunden statt Wochen, und es hält den Kanal frei, den ihr
> tatsächlich bedienen müsst.

Falls du dich trotzdem für Nachrichten entscheidest: dann **an den Vorgang
gebunden** (Deal/Einsatz), nicht als freies Postfach — mit Aufbewahrungsfrist
und einer Meldefunktion ins Staff Center, wie in Abschnitt 10.

---

## Was beim Arbeiten zu beachten ist

Vier Dinge, in H2 teuer gelernt. Ausführlich in `docs/UEBERGABE.md`.

**1. Der Container mountet das Haupt-Repo, schreibend.**
`<Projekt>/api -> /app`. Jedes `docker cp` dorthin verändert den Arbeitsbaum des
Haupt-Checkouts — lautlos. Für Prüfungen: `/tmp/wt2` plus Symlink auf
`node_modules`.

**2. Ein Mock kann kein `WHERE` erzwingen und kennt keine Indizes.**
Bei 8.1.1 heißt das konkret: die Trennung ist erst bewiesen, wenn zwei echte
Organisationen in einer echten Datenbank sich gegenseitig **nicht** sehen.

**3. Wer eine Zeile von einer Ausnahmeliste streicht, muss zurückmutieren.**
Streichen allein belegt nichts — bei P1-17 hatte die Reparatur den Code aus dem
Sichtfeld des Prüfers geschoben.

**4. Ein halb gebautes Feature ist kein halbes Risiko.**
Es wartet auf sein fehlendes Stück. Wo es nicht fertig werden darf, gehört ein
Draht daran, der beim Fertigstellen reißt.

---

## Stand beim Übergeben

- Branch `claude/agitated-haibt-cedcaa`, auf `origin` gepusht.
- `release/enterprise-premium-market-ready` trägt den nginx-Fix (N-1) als eigenen
  Commit; die übrigen H2-Commits kommen mit dem Merge.
- **Beim Merge Konflikt in `docs/PILOT_GO_LIVE_TODOS.md` erwartet** — im
  Haupt-Checkout liegt nicht committete Arbeit aus einer anderen Sitzung.
  Beide Seiten sind gewollt: zusammenführen, nicht überschreiben.
- Volle Suite 9408/0 (13 übersprungen — Integrationstests, die ohne Datenbank
  überspringen; im Container laufen sie).
