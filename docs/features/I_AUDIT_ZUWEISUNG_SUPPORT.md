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

### Verifikation — **geführt am 2026-08-21**

**Bestandsprobe (die Abnahme).** Migration 187 eingespielt:

| | vorher | nachher |
|---|---|---|
| Zeilen mit **fremder** Organisation | **139** | **0** |
| Zeilen **ohne** Organisation | 1797 | 495 |
| Zeilen gesamt | 2740 | 2742 (nichts gelöscht, 2 aus laufendem Verkehr) |
| Policy `al_same_org` | `org_id = current_org_id() OR org_id IS NULL` | `org_id = current_org_id()` |

Jede der 495 verbliebenen org-losen Zeilen hat einen Grund: 253 ohne Akteur
(Systemläufe), 242 mit einem Akteur ohne Mitgliedschaft. Keine einzige ist
eindeutig zuordenbar und trotzdem org-los — das prüft der Wächter mit.

**Idempotenz:** zweiter Lauf der Migration → 0 und 0 Zeilen geändert.

**Verhaltensprobe gegen das echte Schema**, mit einer Wegwerf-Rolle **ohne
Superuser und ohne `BYPASSRLS`** (nur so greift RLS überhaupt) — die beiden
Organisationen aus dem Screenshot:

| Probe | Ergebnis |
|---|---|
| ohne Org-Kontext | **0 Zeilen** (Deny-by-Default) |
| Org A (*Zeitarbeit*) | **303** — ausschließlich eigene |
| Org A sieht Fremdes | **0** |
| Org B (*Unternehmen*) | **140** — ausschließlich eigene |
| Org B sieht Fremdes | **0** |
| Staff-Bypass | **2742** (alle) |
| org-lose Zeilen für Org A | **0** |

**Gegenprobe bestanden:** Das eigene Audit ist nicht leer — Org A sieht ihre
303 Zeilen weiterhin vollständig. Eine Trennung, die das eigene Audit leert,
wäre keine Reparatur.

**Rückmutation (dreifach), damit die Prüfung nicht leer läuft:**
1. Alte Policy zurückgesetzt → dieselbe Abfrage sah wieder **495 fremde
   Zeilen**; mit der neuen 0.
2. `org_id: req.orgId` an der Schreibstelle wieder eingebaut → der Quelltext-
   Riegel wird rot.
3. Policy-Mutation gegen die Datenbank → die Abnahme-Schicht wird rot.

**Wächter:** `api/test/auditMandantenGrenze.test.js`, zwei Schichten — ohne
Datenbank der Quelltext-Riegel (kein Rückfall auf `req.orgId`, Demo-Login
regeneriert **vor** dem Eintragen, Zwischenspeicher trägt seinen Nutzer), mit
Datenbank die Abnahme selbst. Host 6/6, Container **10/10**.

### (c) bis (e) — gebaut 2026-08-21

**(c) Drei Sichten, hart getrennt — erledigt** (`a971979`).
Die Hälfte stimmte schon: Zeitarbeitsfirma und Unternehmen laufen über
denselben Code, es gibt **keinen `org_type`-Zweig** — weder in
`organizations.js` noch in `orgControlCenter.js` noch in `services/auditLog.js`.
Der einzige Datenselektor ist `al.org_id`. Genau wie vorgegeben.

Nicht gestimmt hat die **Form** der Grenze. Sie stand als
`if (req.orgId && req.params.id !== req.orgId)` — das schaltet sich bei `null`
selbst ab, und `null` heißt dann: der Pfad-Parameter wählt die Organisation
frei. Auf diesen Routen heute nicht erreichbar, weil `requireRole` davor
fail-closed abbricht — aber die Route verlässt sich damit auf einen Nachbarn.
Jetzt `if (!req.orgId || …)`. Neuer Wächter: `api/test/auditDreiSichten.test.js`.

> **Zwei Kunden-Routen für dieselbe Sache** bleiben bestehen:
> `GET /org/audit-log` (benutzt von `organization.html:587`) und
> `GET /organizations/:id/audit-log` (**kein Aufrufer im ganzen Repo**). Die
> zweite ist die schwächere Bauart — Org aus dem Pfad statt aus dem geprüften
> Kontext. Sie zu entfernen ist eine **Owner-Entscheidung**: die Ratsche in
> `orgGrenzen.json` fällt dabei von 256 auf 254, wie zuletzt bei P1-19.

**(d) Der Admin-Bereich — zwei Lecks geschlossen, der Rest ist eine Entscheidung**
(`5677f70`, `bcf03b9`).

`requireAdmin` lässt jeden mit der **Org**-Rolle `owner` oder `admin` durch:
**201 von 395 Konten**, davon 142 in Unternehmens- und 59 in
Zeitarbeits-Organisationen. Kein einziges gehört TempConnect.

| geschlossen | was es war |
|---|---|
| `GET /admin/audit-log` | plattformweite Liste — `org_id: req.query.org_id \|\| null` heißt ohne Angabe *alles* |
| `GET /admin/audit-log/export/csv` | dieselbe Menge als Datei außer Haus |
| `GET /admin/audit-log/recent-changes` | rief `getRecentChangesPlatformWide` für jeden Passierer |
| `PATCH /admin/users/:id` | `role`/`plan`/`is_verified` auf **jeden** Nutzer der Plattform |
| `POST /admin/users/:id/deactivate` | jedes Konto sperrbar, auch fremde und die von TempConnect |

Die Liste `GET /admin/users` war längst org-begrenzt — die **Mutationen** nicht.
Die Grenze lebte nur in dem, was die Oberfläche *zeigt*, nicht in dem, was der
Endpunkt *zulässt*. Wer die Kennung kennt, braucht die Liste nicht.

`role` und `plan` sind jetzt der Plattformverwaltung vorbehalten (die Org-Rolle
steht in `org_memberships.role_key`, der wirksame Tarif in `subscriptions`), und
`adminPanel.js` blendet die beiden Auswahlfelder aus, wenn der Umfang nicht
plattformweit ist — sonst blieben zwei tote Knöpfe stehen.

> **Nicht überzeichnet:** die Tarif-Auswahl war *kein* Freischalt-Bypass. Kein
> Feature-Gate liest `users.plan`; die Spalte fällt nur in Analytik und
> DSGVO-Auskunft an. Sie verfälscht Zahlen, sie kauft nichts frei.

**Offen und owner-gated:** die übrigen `admin.js`-Routen sind weiterhin
plattformweit — `/admin/organizations`, `/admin/requests`,
`/admin/strategic-collaboration/*`, `/admin/metrics`, `/admin/revenue`,
`/admin/system-health`, `/admin/activity-feed`, `/admin/feature-overrides`,
`/admin/organizations/:id/pilot-policy`. Die Fläche selbst ist laut
`frontend/public/js/hubVisibility.js` **bewusst für company UND agency
sichtbar**. Entweder wird jede Route org-begrenzt, oder die Fläche wandert ins
Staff Center und die Kundenseite behält einen reduzierten Bereich. Das ist eine
Flächen-Entscheidung nach `docs/FLAECHEN.md`, kein Patch.

**(e) Die Plattformsicht im Staff Center — erledigt** (`0259d94`).
Zuerst war zu klären, ob es sie dort nicht längst gibt: `GET /staff/audit` sieht
danach aus, liest aber `staff_control_audit_log` — was das **Team** getan hat,
nicht was auf der **Plattform** geschehen ist. Zwei verschiedene Tabellen.

Neu: `GET /staff/platform-audit`, hinter dem Flächen-Tor `requireStaff` und der
eigenen Staff-Session. Bewusst **derselbe Dienst** wie die Kundensicht
(`queryAuditLog`) — eine zweite Abfrage wäre eine zweite Stelle, an der die
Mandantengrenze zu pflegen wäre. Der einzige Unterschied: hier wird kein Mandant
vorgegeben; `?org_id=` verengt optional. Antwort trägt
`scope: { plattformweit, org_id }`.

**Befund nebenbei, nicht gefixt (außerhalb (c)–(e)):** `organizations.js` hat
**fünf weitere Routen** mit dem selbstabschaltenden Muster (Zeilen 60, 89, 116,
171, 230 — darunter `GET /organizations/:id/{members,locations,departments}`).
Anders als die Audit-Route tragen sie **nur `requireAuth`**, also keinen Guard,
der `req.orgId` fail-closed setzt. Der C-11-Kommentar in
`middleware/orgContext.js` beschreibt genau diese neun Routen und stützt sich
darauf, dass der Kontext auf die eigene Org zurückfällt — das gilt nur für
Nutzer, die überhaupt eine Mitgliedschaft haben. Die Reichweite ist noch nicht
gemessen (Docker war unten).

**Register nachgezogen** (`ca17694`): kein Weg, kein Urteil geändert (415/161
und 256 stehen). Ergänzt wurde die **Prämisse**, auf der beide Register
stillschweigend aufbauen — dass `req.orgId` dem Anfragenden gehört. Genau das
war bis 8.1.1 verletzt.

---

## 8.1.2 — Aktive Sitzungen im Einsatzportal — **erledigt 2026-08-21** (`4b40675`)

### Was gemessen wurde

Das Portal schrieb „2 aktive Sitzungen — davon 1 auf anderen Geräten". Die
zweite Zahl war schlicht `offen - 1`:

| | Stand vorher |
|---|---|
| `session` | die reine `connect-pg-simple`-Tabelle: `sid`, `sess`, `expire` |
| **Gerät** | **nicht aufgezeichnet** — `bindSessionToDevice` setzt trotz seines Namens nur die Cookie-Lebensdauer |
| **Herkunft** | **nicht aufgezeichnet** |
| **Zeitpunkt** | vorhanden als `sess.createdAt`, nur nie ausgeliefert |

> Der Text versprach eine Unterscheidung, die die Daten nicht hatten — und genau
> darauf soll jemand entscheiden, ob er sein Konto nach einem Geräteverlust
> fernabmeldet.

### Owner-Entscheidung 2026-08-21

**„Zeitpunkt + grober Gerätetyp".** Keine IP, kein Standort, keine
Gerätekennung — und auch nicht der rohe User-Agent, der ein
Wiedererkennungsmerkmal ist. Gespeichert wird nur das *Ergebnis* der Einordnung
(Handy/Tablet/Rechner + Browserfamilie), nicht ihre Grundlage. Eine eigene Probe
hält fest, dass weder „Mozilla" noch eine Versionsnummer in der Sitzung landet.

**Die Flächen-Frage blieb offen und wurde deshalb nicht vorweggenommen.**
`listUserSessions` nimmt **gar keine** fremde Kennung entgegen — es gibt keine
Fremdsicht, statt sie vorsorglich zu bauen. Die Sitzungskennung wird nie
ausgeliefert; sie ist das Anmeldegeheimnis.

> **Nicht zu verwechseln mit den aktiven EINSÄTZEN.** Auf die Frage, wer die
> Sitzungen eines Arbeiters sehen darf, kam die Antwort: der Arbeiter selbst und
> der Zeitarbeitschef, damit er im Voraus planen und benachrichtigt werden kann.
> Das beschreibt die **Live-Belegschaft** (`docs/features/E_LIVE_BELEGSCHAFT.md`)
> und Abschnitt 8.2 unten — nicht die Browser-Anmeldungen. Zwei Dinge, die fast
> gleich heissen.

### Beim Bauen in die eigene Falle gelaufen

`` wurde beim Erzeugen des Codes zum **Backspace-Zeichen** (0x08) statt zur
Wortgrenze. Die Muster trafen fast nichts: ein iPhone galt als „rechner", jeder
Browser als „unbekannt". Genau die Falle, die `docs/UEBERGABE.md` seit dem
2026-08-19 beschreibt — damals traf es den Org-Grenzen-Wächter, der deshalb
**nie** traf und vier bewachte Routen als Lücke meldete.

Der Merksatz stand seither in der Übergabe. **Eine Regel in einer Doku ist aber
keine Sperre.** Neu ist die Sperre: eine Probe prüft **jede** Quelldatei unter
`api/` auf Steuerzeichen. Im Diff sieht man ein 0x08 nicht.

Sie hat sofort einen zweiten Fund gemacht: `test/helpers/orgGrenzenSpion.js:193`
— der Kommentar, der *vor* dem Backspace warnt, enthielt selbst einen.

---

## 8.2 — Die Ersatz-Zuweisung — **erledigt 2026-08-21** (`ae6830a`, `9faaf94`)

### Der Plan lag falsch — und das ist der wichtigere Teil

Dieser Abschnitt sagte: *„Der Ersatz-Mitarbeiter muss benachrichtigt werden und
annehmen oder ablehnen können. **Das ist der Teil, der heute fehlt.**"*

Am Code gemessen stimmt das nicht. Es existierte alles — und war bei Abfassung
des Plans bereits gebaut (Welle G6):

| Baustein | Stand vorher |
|---|---|
| Ausfall melden | `POST /worker/assignments/:id/report-unavailable` |
| Knopf an der Zeile | `mitarbeiter.js:1777`, in der Live-Belegschaft |
| Vorschläge mit Bewertung | `/suggestions?only_available=true` (Abwesende gesperrt) |
| Ersatz einsetzen | `POST /worker-assignment-links/:id/replace` |
| Annehmen / Ablehnen | `POST /worker/assignments/:id/{confirm,decline}` |
| Einsatz wieder offen | `declineAssignment` → `recalcAssignmentStaffing` |

### Der echte Befund lag eine Ebene tiefer

Es gab **zwei Wege, denselben Einsatz zu besetzen, und nur einer fragte den
Menschen**, den er besetzt:

- `quick-assign` legt `pending_confirmation` an und bittet um Zusage.
- `replace` legte **`auto_confirmed`** an.

Eine Absage war damit nicht bloss unüblich, sondern **unmöglich**:
`declineAssignment` verlangt ausdrücklich `pending_confirmation` und hätte den
Link abgewiesen. Die Oberfläche sagte dazu ehrlich „Die Zuweisung gilt
**sofort**" und „**Verbindlich** einsetzen".

### Gebaut

- **Migration 188** (`ersetzt_link_id`): trägt den Zusammenhang in die Daten.
  Ohne ihn lebte er nur im Ablauf der Route — beim nächsten Aufrufer wäre er weg.
- Der Ersatz wird **gefragt** (`pending_confirmation` +
  `notifyAssignmentPendingConfirmation`) statt gebunden.
- Die **Kundenmeldung aus Welle G4b wandert an die Zusage**. G4bs Gate lautet
  „erst nach echter Neubesetzung" — seit der Ersatz zusagen muss, ist die
  Zuweisung an der alten Stelle keine Neubesetzung mehr, sondern eine Anfrage.
- **Der zweite Anlauf nach einer Absage** (`9faaf94`): der Link des Ausgefallenen
  bleibt liegen, die Tafel liefert ihn als `ersatz_link_id` — aber nur, solange
  keine Anfrage läuft.
- **Der Riegel gegen doppelte Besetzung**, innerhalb der Transaktion und **nach**
  dem `FOR UPDATE`. Ohne ihn könnten zwei Ersatzkräfte parallel zusagen und
  beide beim Kunden stehen: `confirmAssignment` prüft nur den eigenen Link, und
  `recalcAssignmentStaffing` zählt nur, es sperrt nicht.

### Ein Rückschlag der eigenen Änderung, von der Erhebung gefunden

`getCompanyLiveWorkforce` liess `pending_confirmation` durch — der Kunde hätte
den Ersatz als besetzt gesehen, **bevor** die Meldung rausgeht, und die Verlegung
wäre leer gelaufen. Angefragte Ersatzkräfte sind dort jetzt ausgenommen;
reguläre pending-Zuweisungen bleiben sichtbar wie bisher.

### Verify — die Kette des Plans, wörtlich

Ausfall → Knopf in der Live-Belegschaft → vorausgefüllte Vorschläge → Anfrage
→ Ersatz wird benachrichtigt → **er lehnt ab** → Einsatz wieder offen → Knopf
erscheint erneut → zweite Anfrage → Zusage → **jetzt erst** Kundenmeldung.

Migration eingespielt und idempotent, Momentaufnahme erneuert. Acht neue Proben,
Rückmutation vierfach. Voller Lauf **9612/0**.

### 8.2 b — Die Begründungs-Darstellung

Der Owner bemängelte die **senkrechte Textsäule**. Die Erhebung hat *zwei*
Ursachen gefunden, nicht eine — und die zweite hätte man beim Lesen des
Quelltextes nie gesehen.

**Ursache 1 — die Sprache.** Die Etiketten waren keine Sätze, sondern Fragmente:
Substantivphrase, Doppelpunkt, roher Feldwert. `Rollenfit nicht sauber belegt:
Maler` lässt offen, ob „Maler" das ist, was **fehlt**, oder das, was der Mensch
**kann**. Bei einer Besetzung ist das keine Feinheit. Jetzt: `Rollenfit nicht
belegt — gesucht: Maler`.

**Ursache 2 — die Kachelbreite**, im echten Schuber gemessen (`.drw-lg`,
`max-width:540px`):

| Raster | Spalten | Kachel | Texthöhe |
|---|---|---|---|
| `minmax(220px,1fr)` (vorher) | 2 × 229 px | 229 px | **183 px** |
| `minmax(min(100%,320px),1fr)` | 1 × 468 px | 468 px | **117 px** |

320 px ist die Schwelle, ab der im 467 px breiten Raster keine zweite Spalte mehr
passt (320 + 10 + 320 = 650 > 467). Auf breiteren Flächen entstehen weiterhin
zwei Spalten; `min(100%, …)` verhindert zusätzlich den Überlauf auf schmalen
Geräten. Die Zahl steht in einer Probe fest, damit sie ihren Grund nicht
verliert, sobald jemand sie zurückdreht.

**Zwei Funde, die erst die Proben hervorgeholt haben:**

1. **Die Liste wurde ZWEIMAL still gekappt** — im Dienst auf 3 und im Frontend
   (`staffingCriteriaText`) nochmals auf 3. Aus neun fehlenden Nachweisen wurden
   drei, und nichts sagte, dass etwas fehlt. Eine Liste, die verschweigt, dass sie
   unvollständig ist, liest sich wie eine vollständige — und ist damit schlimmer
   als gar keine. Beide Stellen zählen den Rest jetzt sichtbar mit
   (`(+3 weitere)`).
2. **Die Skills erschienen kleingeschrieben.** Der Abgleich normalisiert alles
   auf Kleinschreibung — zu Recht, sonst verfehlt `Gerüstbau` ein `gerüstbau`.
   Nur wurde dieselbe normalisierte Marke auch *angezeigt*: der Disponent las
   `gesucht: gerüstbau, a-fach` und musste annehmen, die Plattform habe den
   Bedarf seines Kunden verstümmelt. Marke und Schreibweise sind jetzt getrennt
   (`sammleSchreibweisen` / `zeigeMarken`); eine Probe hält fest, dass der
   Abgleich **weiterhin** normalisiert — sonst wäre die Anzeige teuer erkauft.

**Testlage:** Die Begründung — der Satz, auf den hin ein Mensch disponiert wird —
hatte vorher **keine einzige Probe**. Jetzt 13, am Verhalten geprüft statt an
Zeichenketten im Quelltext (`scoreWorkersForAssignment` ist synchron und
DB-frei), inklusive Rückmutation gegen die stille Kürzung.

Voller Lauf **9625/0**, 13 übersprungen (die DB-gebundenen).

---

## Owner-Entscheidungen 2026-08-21

Vier Fragen, die sich aus den Erhebungen ergaben und **nicht** aus dem Code
ableitbar waren. Hier festgehalten, damit sie nicht in einem Sitzungsprotokoll
verschwinden.

| Frage | Entscheidung | Folge |
|---|---|---|
| **Frist einer Ersatz-Anfrage** | **4 Stunden**, dann verfällt sie automatisch; Erinnerung nach 2 h | Heute gibt es für Zuweisungs-Links **keine** Frist — eine unbeantwortete Anfrage blockiert den Einsatz unbegrenzt über `reserved`, und er sieht dabei versorgt aus. Zu bauen: Verfall + Erinnerung, danach wird der Einsatz wieder offen und der Knopf erscheint erneut (der Weg dorthin steht seit `9faaf94`). |
| **„Bester Treffer"** | **Vorbewertung in die Datenbank ziehen** | Der Kandidatenpool wird heute **alphabetisch** auf ~60 Zeilen geschnitten (`assignmentStaffingService.js`, `ORDER BY wp.last_name ASC`), *bevor* bewertet wird. Ab ~60 aktiven Kräften wäre „bester Treffer" eine Behauptung. Abwesenheit, Entfernung und Pflicht-Skills wandern in die SQL. **Achtung: die Basisabfrage hat sechs Aufrufer** — alle sind betroffen, das ist eine eigene Welle. |
| **Kunde ↔ Kunde (10b)** | **Keine Nachrichtenfunktion.** Ansprechperson mit Telefonnummer wird Pflichtfeld | Ein Nachrichtenkanal erzeugt Erwartungen an *TempConnect*: Zustellung, Aufbewahrung, Moderation, DSGVO-Auskunft über fremde Gespräche — und die Beschwerden landen am Ende doch dort. `contact_name`/`contact_phone` stehen bereits auf `offers`. Sichtbar an der Besetzung und in der Live-Belegschaft, nicht nur in der Deal-Akte. Eskalation geht über Abschnitt 10. |
| **Reihenfolge** | Begründungs-Darstellung, dann Abschnitt 10 | — |

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

### Der Befund, der alles andere umgestellt hat

`support_cases` hatte im **gesamten Repo kein einziges `INSERT`**. Warteschlangen,
Fallarten, SLA-Fristen, Eskalationen, Wissensdatenbank, Qualitätskennzahlen — und
kein Weg, einen Fall entstehen zu lassen. Das Support Center war ein **Lesesaal
über einer Tabelle, die niemand füllen konnte**; Fälle konnten nur von Hand in der
Datenbank entstehen. Ohne Eingang wäre Stufe 3 des Trichters ein toter Knopf
gewesen — deshalb wurde sie zuerst gebaut.

Zwei weitere Befunde derselben Art, unabhängig nachgeprüft:

- **Die `reports`-Tabelle hat einen `INSERT` und null Leser.** `POST /reports`
  nimmt Meldungen wegen Spam, Betrug und Belästigung entgegen (`reportService.js:27`)
  — und **keine** Staff- oder Support-Route liest sie je aus. Ein Melden-Knopf,
  der ins Leere schreibt. Gehört zur Meldefunktion unten.
- **`tempconnect_staff.role` wird nirgends durchgesetzt.** Migration 118 legt sechs
  Rollen an (`staff_admin`, `staff_commercial`, …); repo-weit gibt es **keinen
  einzigen Treffer** darauf in `api/`. Jedes aktive Staff-Mitglied darf alles;
  abgestuft wird nur über Step-up-Stufen pro Route. Auch `expires_at` prüft
  `staffControlAccess.js` nicht, obwohl der Migrationskommentar es behauptet.

### Gebaut: der Weg hinein (10 a)

| Stück | Ort |
|---|---|
| Eingang | `api/services/supportIntakeService.js`, `api/routes/supportIntake.js` |
| Trichter-Reihenfolge | `GET /support-channels` — **serverseitig**, damit sie zwischen Seiten nicht driftet |
| Fall eröffnen | `POST /support-requests` (`requireAuth`, CSRF, Mengenbremse) |
| Eigene Sicht | `GET /support-requests`, `GET /support-requests/:id` |
| Darstellung | `frontend/public/hilfe.html` — drei Stufen, Formular, eigene Fälle |
| Telefonnummer | `SUPPORT_PHONE` / `SUPPORT_PHONE_HOURS` (`.env.example`) |

**Warum der Eingang nicht unter `/support` liegt.** `support.js:664` setzt das Tor
am **Präfix**: `router.use("/support", supportRateLimit, requireAuth, supportAuth)`.
Das ist die strengere Bauart — auf einer neuen Route nicht vergessbar — und die
Owner-Vorgabe ist hart: kein Zugang für Unternehmen, kein Zugang für
Personaldienstleister. Eine Kundenroute darunter wäre ein Loch, das ab da für
**alle** Routen darunter gälte. Der Eingang liegt daneben; eine Zusicherung hält
fest, dass keine Route der neuen Datei unter `/support/` rutscht — und eine
zweite, dass das Präfix-Tor überhaupt noch steht.

**Drei Entscheidungen, die je eine Zusicherung tragen:**

1. **Ohne Warteschlange entsteht kein Fall.** `support.js:164-167` schneidet die
   Agentensicht mit `queue_id::text = ANY(...)` zu — ein Fall mit `queue_id = NULL`
   ist für **jeden** Agenten mit gesetzten `allowed_queues` unsichtbar. Der bequeme
   Weg wäre gewesen, ihn trotzdem anzulegen. Das Gegenteil stimmt: der Kunde hält
   dann eine Fallnummer in der Hand und glaubt, er sei gehört worden. Eine
   angenommene Nachricht, die niemand liest, ist schlimmer als eine abgelehnte —
   also 503 mit dem Hinweis aufs Telefon.
2. **Die Dringlichkeit gehört nicht dem Kunden.** Dürfte er sie setzen, wäre binnen
   Wochen jeder Fall `critical`; ein Feld, das jeder selbst setzt, misst nur noch,
   wer es gelesen hat.
3. **Die Sicht des Kunden ist eine Nutzer-, keine Org-Grenze.** Ein Support-Fall
   kann persönlich sein (Zugangsprobleme, Beschwerde über einen Kollegen). Ihn
   allen Mitgliedern derselben Organisation zu zeigen wäre eine Entscheidung, die
   niemand getroffen hat. Nur `note_type = 'external'` geht hinaus, und die Grenze
   steht im SQL, nicht in der Anzeige.

**End-to-end nachgewiesen** (2026-08-22, Worktree-API gegen die echte Datenbank):
Hilfeseite → „Anfrage stellen" → `POST /support-requests` **201** → **SC-2026-00001**
in `support_cases`, Warteschlange „Allgemein", 48-h-Lösungsfrist aus der Queue,
Melder und Organisation gesetzt, Ereignis `case_opened_by_customer` ohne Agenten
und mit Herkunft `hilfe.html` — und der Fall erscheint in der eigenen Liste.
Der erste Support-Fall, den dieses System je hatte.

Der Wächter „kein Verweis führt ins Nichts" hat dabei einen von mir erfundenen
Pfad (`login.html`) sofort gemeldet; richtig ist `/?auth=login`
(`js/pages/landing.js:108`). Genau dafür steht er.

Voller Lauf **9653/0**, 13 übersprungen.

### Gebaut: Inhalte melden (10 b)

**Der Befund zuerst — die Meldefunktion hat noch nie einen Bericht gespeichert.**
Am 2026-08-22 gegen die *laufende* Datenbank bewiesen, in einer zurückgerollten
Transaktion ausgeführt statt aus dem Quelltext geschlossen. Drei Fehler
übereinander, alle drei lautlos:

| # | Was | Beleg |
|---|---|---|
| 1 | Drei der fünf erlaubten Gründe verletzten den CHECK | `ERROR: new row … violates check constraint "…_reason_check"` |
| 2 | `ON CONFLICT (reported_org_id, reporter_user_id)` hatte keinen passenden eindeutigen Index | `ERROR: there is no unique or exclusion constraint matching the ON CONFLICT specification` |
| 3 | `catch { return … }` ohne Protokoll | der Nutzer las „konnte nicht gespeichert werden", niemand erfuhr warum |

Dazu las der Posteingang `WHERE status = 'pending'` — ein Wert, den der CHECK
**nie** erlaubt hat — und `resolveAbuseReport` schrieb `'resolved'`/`'dismissed'`
statt `resolved_action_taken`/`resolved_dismissed`. Zwei Fehler, die sich
gegenseitig verdeckt haben: die Bedingung traf nie etwas, also kam der CHECK nie
zum Zug. **Beide Meldetabellen hatten 0 Zeilen.** Das war kein Zufall.

**Warum es so lange unbemerkt blieb — und was jetzt dagegen steht.** Der
Schema-Wächter prüft, ob *Spalten* existieren. Sie existierten. Über die
erlaubten *Werte* wusste er nichts. Der Abzug trägt sie ab jetzt: `pruefwerte`,
**240 Spalten in 119 Tabellen**, erzeugt aus der laufenden Datenbank. Eine Probe
hält jeden geschriebenen Literal dagegen — gebunden an die **Anweisung**, nicht
an die Datei: `status` heißt auf 22 Tabellen `status`, und `'pending'` ist auf 22
davon erlaubt. Ein Wächter, der nur den Spaltennamen kennt, hätte genau diesen
Fehler *nicht* gefunden.

**Keine vierte Meldetabelle.** Es gibt bereits drei angefangene Meldewege
(`reports` mit einem INSERT und null Lesern, `profile_abuse_reports`,
`flagged_search_queries`). `profile_abuse_reports` ist der einzige mit fertigem
Ausgang im Staff Control Center — also wächst dieser: Migration 189 gibt ihm
`ziel_art`/`ziel_id`, und Angebote laufen in denselben Posteingang.

| Stück | Ort |
|---|---|
| Migration | `sql/migrations/189_meldungen_die_ankommen.sql` |
| Melden | `POST /offers/:id/report` (`profileVisibility.js`) |
| Posteingang | Staff CC → Marketplace Visibility → Meldungen, jetzt mit Spalte „Was" |
| Am Angebot | `frontend/public/offer_detail.html`, unten, klein, ohne Warnfarbe |

**End-to-end nachgewiesen:** POST **200** → eine Zeile `ziel_art='angebot'`, im
Posteingang sichtbar; dieselbe Person ein zweites Mal → weiterhin **eine** Zeile
(`ON CONFLICT` greift endlich); unbekanntes Angebot **404**; erfundener Grund
**400**; eigenes Angebot **400**; Anbieter ohne Organisation **409** statt einer
Meldung, die niemand sieht. Und der Gegenbeweis für „Erledigen":
`status='resolved_action_taken'` → `UPDATE 1`, `status='resolved'` → CHECK-Verletzung.

28 neue Proben. Voller Lauf **9682**, 9668 grün, 13 übersprungen, ein bekannter
Ausreißer (`me.route.coverage.test.js` fällt im vollen Lauf als *Datei* aus —
`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`, libuv unter Windows;
allein laufen ihre 68 Untertests grün, siehe `scripts/run-tests.js:148`).

### Nachgezogen: „Angebot" heißt zweierlei — und melden darf nur, wer sieht

Beim Nachprüfen der Oberfläche (nicht im Quelltext) fielen **zwei** Fehler in
meiner eigenen Arbeit auf.

**1. Die Sichtbarkeit wurde nicht geprüft.** Dieselbe Sitzung bekam bei
`/marketplace/offers/:id/detail` ein **403** und konnte das Angebot trotzdem
melden. Zwei unnötige Folgen: ein **Orakel** für Angebotskennungen (404 gegen
200) und ein Weg, wahllos Meldungen gegen Angebote abzusetzen, die man nie
gesehen hat — jede kostet das Team dieselbe Bearbeitung wie eine echte. Jetzt
gilt dieselbe Bedingung wie in `marketplace.js:1414` (`canAccessAsOwner`,
dieselbe Funktion, keine zweite Kopie), und „gibt es nicht" und „gehört nicht zu
dir" bekommen **dieselbe** Antwort.

**2. „Angebot" meint im Produkt zwei Dinge, und die wichtigere Hälfte fehlte:**

| | Wer sieht es | Beleg |
|---|---|---|
| `offers` | nur die **zwei Parteien** | `marketplace.js:1414` antwortet allen anderen 403 |
| `capacity_posts` | **jeder** angemeldete Nutzer mit SLA-Zugang | `marketplace.js:296-302` filtert nicht nach Anbieter |

„Freche oder betrügerische Inhalte" trifft vor allem die zweite — das ist die
Fläche, auf der Fremde die Inhalte von Fremden sehen. Statt zu raten, welche
gemeint war, tragen jetzt **beide**: Migration 190 gibt `ziel_art` den Wert
`kapazitaet`, `POST /capacity-posts/:id/report` nimmt sie entgegen, und der
Melde-Knopf steht auf `capacity_exchange_detail.html` im Fremd-Zweig (den
eigenen Eintrag weist die Route ohnehin ab — ein Knopf, der nur eine
Fehlermeldung erzeugt, ist ein toter Knopf).

Dort steht **bewusst keine** Sichtbarkeitsprüfung: der Feed zeigt jedem jeden
Eintrag, eine Prüfung wäre eine Attrappe. Eine Zusicherung hält fest, dass der
Unterschied *gewollt* ist — sonst „repariert" ihn jemand in die falsche Richtung
und nimmt der Meldefunktion genau die Leute weg, für die sie da ist.

**End-to-end nachgewiesen:** Kapazitätsseite → „Eintrag melden" → **200** → zwei
Meldungen unterschiedlicher Zielart im selben Posteingang, beide sichtbar.

## Erhebung 2026-08-22 — 18 Agenten, 12 riskante Befunde, 11 haben gehalten

Eine Erhebung mit fünf parallelen Lesern über die drei offenen Stücke, jeder
sicherheitskritische Befund danach von einem **Skeptiker angegriffen**, der ihn
widerlegen sollte. Einer ist gefallen (`resolved/closed` ist keine Sackgasse —
`POST /support/escalations` führt zurück). Elf haben gehalten.

### Sofort gebaut — kein Entscheid nötig

**S1 · Befristete Staff-Zugänge liefen nie ab — und die Migration behauptete
das Gegenteil.** Migration 118:56 nennt **wörtlich** die Funktion, die prüfen
soll:

> `COMMENT ON COLUMN tempconnect_staff.expires_at IS 'Optionales Ablaufdatum —`
> `NULL = kein Ablauf. Prüfung in createStaffControlAccessMiddleware (WAVE 11)'`

Die Abfrage dieser Funktion holte die Spalte nicht einmal. Es gibt sogar einen
**Teilindex** dafür (118:40-42) — jemand hat den Index für eine Prüfung gebaut,
die nie geschrieben wurde. `revoked_at` war noch schwächer: die Deaktivierung
schreibt nur `is_active = FALSE`, niemand setzt es, niemand prüft es.

Jetzt stehen beide Bedingungen **im `WHERE`** — an *beiden* Toren (Wache und
Login; zwei Tore mit verschiedenen Bedingungen sind auf Dauer das schwächere von
beiden). Vorbild ist `requireOwnerControlAccess.js:43-49`, das nebenan schon
genau so arbeitet. Die Notöffnung über `STAFF_USER_IDS` löst Ablauf und Widerruf
jetzt **ausdrücklich** — sonst hätte die Reparatur dort ein Loch gerissen. Die
Zugangsübersicht zeigt beide Spalten, denn sie *ist* die Access-Review.

**Wirkung heute: keine.** Gemessen — eine Zeile, `expires_at IS NULL`,
`revoked_at IS NULL`. Es wird niemand ausgesperrt; es kann künftig nur niemand
mehr drinbleiben, der draußen sein soll.

**S2 · Zwei Registereinträge zertifizierten eine Lücke als geprüft.**

| Stelle | Stand | Wirklichkeit |
|---|---|---|
| `wachen.json` | `eigene-daten`, „Ein Bericht wird für die eigene Organisation erzeugt" | `POST /reports` meldet einen **fremden** Nutzer; `eigene-daten` heißt im Vokabular derselben Datei „kein fremdes Ziel erreichbar" |
| `PLATTFORM_REGISTER.md:392` | „Auswertungen abrufen" | Missbrauchsmeldung; die Auswertungen liegen in `reporting.js` |
| `docs/api/API_SURFACE.md:138` | `GET /api/reports/executive` | **existiert nicht** — nie existiert |

`PILOT_GO_LIVE_TODOS.md:705` hält die Verwechslung längst fest; die Korrektur ist
nur nie in die Register geflossen. Der Eintrag steht jetzt auf `BEFUND` — dem
Wert, den das Vokabular für offene Punkte vorsieht und den bis heute **niemand
benutzt hatte**.

**S3 · `POST /reports` war ein Orakel.** Vier unterscheidbare Antworten (404
`USER_NOT_FOUND`, 404 `REQUEST_NOT_FOUND`, 403 `NOT_PARTICIPANT`, 400
`REPORTED_USER_NOT_IN_REQUEST`) verrieten jedem angemeldeten Nutzer, ob eine
Nutzer- oder Anfragekennung existiert und wer daran beteiligt war. Jetzt eine
Antwort für alle vier; das Protokoll unterscheidet weiter. Die Route hatte
vorher **keine einzige Probe**.

### Bestätigt, aber owner-gated — siehe Fragen unten

| | Befund | Schwere |
|---|---|---|
| **R2** | `request_id` ist optional, damit ist die *gesamte* Beteiligungsprüfung bedingt — ohne das Feld bleibt nur `userExists` | Sicherheit |
| **R3** | `change_status` kennt **keine Übergänge**: ein einfacher Agent erreicht `escalated_*` und umgeht dabei Pflichtbegründung, `occ_decisions`, `support_escalations` und Ops-Signal. Ausgeführter Beweis: HTTP 200, ein UPDATE, `is_escalated` unberührt. **CLAUDE.md Stop-Regel 5 ist formal ausgelöst.** | Sicherheit |
| **R4** | `support_escalations` kann **nie** abgeschlossen werden — zwei INSERTs mit festem `'pending'`, repo-weit null UPDATE. Die Staff-Liste filtert nicht auf Fall-Status: jede je erzeugte Eskalation bleibt für immer stehen | defekt |
| **R5** | `resend_verification` / `resend_invite` am Fall sind **Attrappen** — sie schreiben eine Zeitleisten-Zeile und antworten `success`, ohne zu versenden. Der einzige POST der Support-Oberfläche geht genau dorthin | defekt |
| **R6** | Die Erstreaktionszeit misst „ein Agent hat geklickt": `add_note` stempelt **ohne** Rücksicht auf `note_type`, obwohl der Code selbst `external` als Kundenantwort definiert | defekt |
| **R7** | Die Antwort erreicht den Kunden nie: nur die Detailroute liefert `antworten`, und die Fallliste in `hilfe.html` verlinkt sie nicht | defekt |
| **R8** | **144 von 395 Nutzern** sind keiner Organisation zuzuordnen. Die Garantie aus Migration 041 ist ein einmaliger `DO`-Block ohne Trigger — sie ist verfallen und die Lücke wächst nach | Blocker der Vereinigung |
| **R9** | Die Grund-Vokabulare beider Meldewege sind fast disjunkt: nur `spam` ist gemeinsam. `betrug` und `belaestigung` haben **keine** Entsprechung | Blocker der Vereinigung |

### Owner-Entscheide 2026-08-23 und was daraus gebaut wurde

| Frage | Entscheidung | Gebaut |
|---|---|---|
| Wer erreicht `escalated_*`? | **Nur über `escalate`** | ✅ Übergangstabelle in `support.js` |
| Bleibt `POST /reports`? | **Entfernen** | ✅ Migration 191, Route + Dienst + Tabelle weg |
| Was zählt als Erstreaktion? | **Nur eine externe Notiz** + Zahl „ohne Erstreaktion" | ✅ R6 gebaut |
| Wo liegt der Melde-Posteingang? | **Bleibt im Staff CC** | ✅ nichts zu tun — bestätigt |

**R3 gebaut.** `change_status` hat jetzt eine Übergangstabelle. Die vier
`escalated_*` sind daraus entfernt: sie entstehen nur im `escalate`-Zweig, der
Begründung, OCC-Vorgang, Eskalations-Zeile und Ops-Signal schreibt. Der Weg auf
sich selbst wird beim **Bau** der Tabelle entfernt, nicht bei jeder Abfrage —
die erste Fassung schloss ihn nur im Kommentar aus, und `open → open` wäre
durchgegangen: keine Änderung, aber ein Ereignis in der Zeitleiste, das eine
vorspiegelt.

**Zwei Funde, die erst beim Bauen der Proben auffielen** — als BEFUND-Gruppe im
Test festgehalten, nicht mitrepariert (Produktfrage):

- **`resolved` und `closed` sind absolute Sackgassen.** `computeAllowedActions`
  (`support.js:279`) streicht auf einem erledigten Fall *sechs* Aktionen. Ein
  Fall in `resolved` kann nie `closed` werden — welcher der beiden Endzustände
  gilt, entscheidet der Zufall des ersten Klicks.
- **`reopened` ist unerreichbar** — der Zustand steht im CHECK der Migration 110
  und wird im gesamten Repo nirgends gesetzt. Und genau darauf rechnet eine
  veröffentlichte Qualitätskennzahl: `reopen_rate_percent` (`support.js:1696`)
  zählt `COUNT(*) FILTER (WHERE sc.status = 'reopened')` und **kann nur 0 %
  ergeben**. Eine Zahl, die gemessen aussieht und nur eines sagen kann.

Der einzige Rückweg aus `closed` führt heute über `POST /support/escalations`,
dessen Rechteprüfung mit einer **fest verdrahteten** Zeile `{status:"open"}`
arbeitet (`support.js:1495`) und die Sperre damit umgeht. „Um einen Fall wieder
zu öffnen, eskaliere ihn" ist kein Arbeitsablauf.

**R6 gebaut — die Erstreaktion misst wieder eine Antwort.** Die Uhr stand an
drei Stellen, keine davon eine Antwort: `accept` (jemand nimmt den Fall an),
`change_status` mit `$2 <> 'new'` (also stoppte schon das Verschieben nach
`waiting_internal` die Uhr) und `add_note` **ohne jede Unterscheidung** nach
Notiztyp. Jetzt nur noch `note_type = 'external'` — dieselbe Grenze, die die
Kundensicht zieht; eine Probe hält beide Stellen gegeneinander.

Dazu die zweite Hälfte: `ohne_erstreaktion` und
`ohne_erstreaktion_abgeschlossen`. `AVG()` überspringt NULL still — ein nie
beantworteter Fall verschlechtert den Mittelwert nicht, er *verschwindet* aus
ihm. Je schlechter der Support arbeitete, desto besser sah die Zahl aus.

**R7 gebaut — die Antwort erreicht den Kunden.** Die Fallliste in `hilfe.html`
war eine Sackgasse: kein `<a>`, kein `data-id`, kein Handler. Der Kunde sah
Fallnummer und Status, und die Antwort des Supports lag in einer Route, die
niemand aufrief. Die Zeile ist jetzt ein Knopf, der den Fall aufklappt.

Nachgewiesen an **einem** Fall mit **zwei** Notizen — schärfer lässt sich die
Grenze nicht prüfen:

| | |
|---|---|
| externe Antwort | **sichtbar**, mit Berlin-Zeit (`23.08.2026, 06:55 Uhr`) |
| interne Notiz | **nicht sichtbar** |
| Fall ohne Antwort | „Noch keine Antwort. Wir melden uns bis: 23.08.2026, 10:…" |

Der Leerzustand *sagt* etwas: „noch keine Antwort" ist eine andere Nachricht als
ein leerer Kasten, und mit der Frist daneben weiß der Kunde, woran er ist.

### Owner-Entscheide, zweite Runde (2026-08-23)

| Frage | Entscheidung | Stand |
|---|---|---|
| Wer hakt eine Eskalation ab? | **Beides, OCC hat Vorrang** | ✅ R4 gebaut |
| `resend_verification` / `resend_invite` | **Echten Versand anschließen** | ✅ R5 gebaut |
| `resolved`/`closed`/`reopened` | **Wiedereröffnen bauen** | ✅ gebaut |
| Ansprechperson als Pflichtfeld | **Pflicht mit Profil-Rückfall** | ✅ 10b gebaut |

**R4.** `POST /support/escalations/:id/resolve`, Supervisor-only, Begründung ≥ 20
Zeichen. `is_escalated` wird **neu berechnet** statt blind auf `FALSE` gesetzt —
ein Fall mit zwei Eskalationen, von denen eine erledigt ist, ist nicht „nicht
mehr eskaliert". Und der OCC-Entscheid schlägt durch: `related_occ_request_id`
gab es seit jeher, aber die Verbindung wirkte nur in *eine* Richtung. Vorrang
heißt dabei **nicht**, vorhandene Arbeit zu überschreiben.

**R5.** Beide Aufrufer gehen jetzt durch *eine* Funktion. Und die Mail geht
**nach** dem COMMIT hinaus — eine verschickte Mail holt kein Rollback zurück.
Umgekehrt wirft ein gescheiterter Versand den Vorgang nicht um, wird aber in der
Antwort gemeldet: `success: true` allein war genau das, was die Attrappe so
lange unsichtbar gemacht hat.

**Wiedereröffnen.** `resolved → closed | reopened`, `closed → reopened`,
Supervisor-only. Beim Wiedereröffnen werden `sla_resolved_at` **und**
`closed_at` gelöscht — sonst behielte der Fall den Zeitstempel der ersten Runde
und der zweite Durchgang bliebe in der Kennzahl unsichtbar. `reopen_rate_percent`
kann damit zum ersten Mal etwas anderes als 0 % ergeben.

**10b.** Die Pflicht trifft nur den, der handeln kann: bei drei der fünf Wege
handelt der Anbieter selbst (Pflicht, mit Rückfall aufs Profil), bei zweien der
Käufer (nur füllen, nicht blockieren). Den Käufer abzuweisen, weil ein *anderer*
sein Profil nicht gepflegt hat, wäre die falsche Adresse.

Die Ansprechperson steht jetzt in der Live-Belegschaft, mit wählbarer Nummer.

#### Die Richtung — ein Fehler in der eigenen Arbeit, und wie er auffiel

Die erste Fassung zeigte die Ansprechperson aus `offers.contact_name`. Beim
Nachprüfen der **Richtung** — nicht durch einen Test, sondern durch die Frage
„wer sieht das eigentlich?" — fiel auf:

| | |
|---|---|
| `assignments.supplier_org_id` | die Agentur, **deren Tafel das ist** |
| `offers.supplier_company_id` | ein Mitglied **ebendieser** Agentur |

Die Agentur bekam ihre **eigene** Kontaktperson angezeigt. Es sah richtig aus und
war wertlos — die schlimmste Sorte Fehler, weil niemand sie bemerkt, bis jemand
um sechs Uhr morgens die falsche Nummer wählt. Der Commit ist zurückgenommen.

Besetzung und Live-Belegschaft sind **Anbieter**-Flächen; dort gehört die Nummer
des **Kunden** hin. Es fehlte also nicht die Anzeige, sondern die Hälfte der
Daten: `demand_requests` hatte überhaupt keine Kontaktspalten.

**Migration 192** legt sie an — auf dem **Bedarf**, nicht auf dem Einsatz. Der
Bedarf ist die Stelle, an der das Einsatzunternehmen ohnehin spricht; auf
`assignments` wäre die Angabe eine Spalte, die jemand nachtragen müsste, wenn der
Einsatz schon läuft — also genau dann, wenn niemand mehr Zeit dafür hat.

Erfasst mit derselben Mechanik wie beim Angebot: Pflicht am ausdrücklichen
Bedarf, Rückfall aufs Profil, **kein** Blockieren bei den zwei impliziten
Bedarfen (mitten in einem schnellen Abschluss nach einer Telefonnummer zu fragen
ist eine Wand an der Stelle, an der Tempo der Zweck ist).

**Gegen echte Daten geprüft**, nicht gegen einen Spion: beide Abfragen direkt
gegen die laufende Datenbank ausgeführt. Die Live-Belegschaft der Agentur zeigt
`Frau Neumann (Disposition) +49 30 5550123` — die Nummer des Kunden. Die
Besetzungsliste ebenso, mit ehrlichem Leerzustand in der zweiten Zeile.

Zehn Proben halten jetzt die **Richtung** fest. Sie sind billig und hätten den
Fehler gefangen.

> **Offene Lücke im Datenmodell, gemessen:** **61 von 68** Einsätzen haben *weder*
> Bedarf noch Deal noch Angebot noch Anforderung — sie stehen für sich. Für die
> trägt auch Migration 192 nichts bei. Das ist keine Lücke der Spalten, sondern
> eine der **Herkunft**: ein Einsatz ohne Vorgang hat keine Gegenseite, die man
> anrufen könnte. Wer das ändert, ändert, wie Einsätze entstehen — eine eigene
> Entscheidung, keine Nebenwirkung dieser hier.

### Was die Erhebung NICHT geprüft hat

Kein Laufzeit-Beweis über HTTP (außer dem ausgeführten `change_status`-Handler);
alle DB-Zahlen sind Stichtagswerte der Entwicklungsdatenbank; fünf Wächter-Dateien
wurden nicht gelesen (`auditCoverageCheck`, `notificationSurfaceMap`,
`visibilityMatrix`, `openapi.spec`, `uiNoEmoji`); nginx wurde nicht gelesen.

### Noch zu bauen

- **Die tote `reports`-Tabelle** an denselben Posteingang hängen (ein INSERT,
  null Leser — Nutzer-Meldungen wegen Spam, Betrug und Belästigung landen in
  einer Tabelle, die niemand liest).
- **Das Support Center ausbauen** — es war für die Abgabe nach Indien gedacht
  und ist verankert, aber nicht fertig. Mit dem Eingang hat es jetzt überhaupt
  erst etwas zu bearbeiten.
- **Audit darüber im Staff Center**, und verwaltbar, wer was bearbeiten darf —
  hier ist die Vorarbeit schon da und ungenutzt (siehe `role`-Befund oben).
- **Telefonnummer setzen** (`SUPPORT_PHONE`) — Owner-Angabe; bis dahin bietet der
  Trichter Stufe 2 bewusst gar nicht erst an, statt eine tote Nummer zu zeigen.

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

---

## Die Ersatz-Frist — gebaut am 2026-08-24 (Migration 193)

Owner-Entscheid umgesetzt: **4 Stunden, dann verfällt die Anfrage; Erinnerung
nach 2 h; danach ist der Einsatz wieder offen und der Knopf erscheint erneut.**

### Zuerst musste das Fundament repariert werden

Die Erhebung vor dem Bau (15 Agenten, gegnerische Widerlegung: 4 von 10
Befunden bestätigt, **6 gefallen**) fand einen Defekt in der eigenen
8.2-Arbeit: die `ersatz`-LATERAL der Live-Belegschaft war **toter Code**. Sie
verlangte `wal.is_active = FALSE` **und** Lebenszyklus `IN ('active','ends_today')`
— aber der Lebenszyklus-Baustein liefert bei gesetztem `linkAlias` für inaktive
Links immer `'archived'`. Die WHERE-Klausel widersprach sich selbst; gemessen:
1 Kandidat, 0 Treffer. Der Knopf kam nach einer Absage **nie** zurück, während
die Proben grün waren — sie prüften nur, dass Zeichenketten *vorkommen*.
Und ein zweites Tor: der Knopf hing in der Abwesenheits-Schachtel
(`live_status === "abwesend" && absence_id`), die nur der **Disponent** füllt —
die Selbstmeldung aus dem Portal erreichte ihn nie. Beides repariert
(`da5eedd`), mit ausführenden Proben statt Regex.

### Was gebaut wurde

| Baustein | Wo |
|---|---|
| Vier Uhr-Spalten (`frist_bis`, `erinnerung_faellig_am`, `erinnert_am`, `verfallen_am`) + Statuswert **`expired`** + 3 Benachrichtigungstypen + 2 Teilindizes | Migration 193, additiv nach 184er-Muster |
| Frist wird mit der Anfrage **geboren** — in *beiden* Zweigen des INSERT (der ON-CONFLICT-Zweig recycelt die Zeile und stellt die Uhr **neu**) | `replaceAssignmentWorker` |
| **Sweep** `verfalleneErsatzAnfragen`: Verfall *vor* Erinnerung, selbstentwertende Mengen-UPDATEs (zwei gleichzeitige Läufe unschädlich), Erinnerungsmarke + Meldung in *einer* Transaktion, Verfallsmeldungen *nach* dem Commit | `workerService.js` |
| **Taktunabhängiger Riegel**: `frist_bis > NOW()` im WHERE von Zusage *und* Absage → `ANFRAGE_VERFALLEN` (409). Gilt auch, wenn nie ein Takt läuft | `confirmAssignment` / `declineAssignment` |
| Zwei Aufrufer, eine Funktion: dritter Aufruf im getakteten `staffing-maintenance`-Handler **plus** BullMQ `ersatz-frist-10min` | `internal.js`, `workers/index.js`, `capacityWorker.js` |
| Marktplatz-Rückgabe: `syncWorkerReservation` — die Anfrage hatte die `capacity_posts` des Ersatzes pausiert, der Mensch war aus dem Marktplatz verschwunden, obwohl er nur *gefragt* wurde | im Sweep, je verfallener Zeile |
| Sichtbarkeit: Frist im Erst-Text der Benachrichtigung, in beiden Portal-Abfragen (`response_deadline_*`, Namensgleichheit mit den Staffing-Einladungen) und auf zwei Portal-Flächen (Einsätze-Karte, Dashboard-Banner) | `workerNotificationService`, `workerService`, `einsatzportal-*.html` |
| Wächter-Ausbau: `benachrichtigungsSpiegel` hält jetzt auch `SEVERITY_MAP` gegen den CHECK — vorher fiel genau diese Quelle durchs Netz (stille `general`-Degradierung = Meldung ohne Knöpfe). Der Wächter biss beim ersten Lauf prompt auf seine eigene Parser-Lücke (die `'{a,b,c}'::text[]`-Literal-Form) | `benachrichtigungsSpiegel.test.js` |

**Entscheidungen ohne Owner-Bedarf** (aus dem Bestand ableitbar, im Code begründet):
eigener Status `expired` statt `worker_declined` (Verfall ist keine Absage —
Zuverlässigkeitsauswertung), deutsche Spaltennamen wie `ersetzt_link_id`,
englische API-Feldnamen wie das Portal sie schon rendert, Frist ab dem
**Anlegen** (Zustellen ist derselbe DB-INSERT), Erinnerungszeit **absolut**
gespeichert, Kunde erfährt vom Verfall **nichts** (für ihn hat sich seit der
Ausfallmeldung nichts geändert — dieselbe Linie wie bei der Absage).

### Offen — Owner-Entscheidungen

| Frage | Sachlage |
|---|---|
| ~~**CSRF-Ausnahme für `/internal/`?**~~ **entschieden und gebaut (2026-08-24)** | Owner-Entscheid: bauen. Umgesetzt **eng geführt**: Ausnahme greift nur **mit** `X-Internal-Secret`-Kopf (ohne Kopf bleibt CSRF in Kraft — sonst stünde in Umgebungen ohne Secret gar nichts mehr vor 28 Endpunkten) und nur für `/internal/`, **nicht** für das session-basierte `/internal-control/`. Mitgeschlossen: `checkCronAuth` schaltete sich ohne konfiguriertes Secret selbst ab — jetzt fail-closed (**503**). Am laufenden System belegt: 200 / 403 CSRF / 403 FORBIDDEN / 403 CSRF / 503. |
| **Erreicht die Erinnerung den Arbeiter überhaupt?** | Die Erinnerung ist eine `notifications`-Zeile; das Einsatzportal hat **kein** Polling und keinen Live-Strom — wer die Seite nicht offen hat, sieht sie erst beim nächsten Besuch, und die 4-h-Frist läuft trotzdem. Optionen: SMS (technisch vorhanden, `smsService.js`, Kosten + Einwilligung), E-Mail über `dispatch()`, Frist nur zu Geschäftszeiten, oder so lassen. Das ist eine Fairness-Frage, keine technische. |
| **Frist auch für reguläre Zuweisungen?** | Der Entscheid galt Ersatz-Anfragen. Die Datenlage zeigt aber denselben Schaden im Regulären: ein Einsatz steht seit dem **10.04.** auf `open_quantity=0`, `staffing_status='sourcing'`, blockiert über `ASSIGNMENT_FILLED` jede neue Kampagne — gehalten von einer unbeantworteten regulären Anfrage. **Ausgearbeitet als Entscheidungsvorlage: [`I2_FRIST_REGULAERE_ZUWEISUNG.md`](I2_FRIST_REGULAERE_ZUWEISUNG.md)** (2026-08-24). Die Erhebung dort fand zwei Dinge, die 193 nicht kennt: die Kundenansicht blendet reguläre offene Anfragen **nicht** aus (vier Menschen stehen ohne Zusage auf einer Kundentafel, der älteste seit 136 Tagen), und fünf der neun Altfälle sind eingefroren — ihr Einsatzzeitraum ist vorbei, deshalb weist der Server Zusage *und* Absage ab. Fünf Owner-Entscheidungen liegen dort vor, nichts ist gebaut. |

Verify: Sweep-Proben 15/15 (inkl. DB-Smoke). Migration zweimal eingespielt
(idempotent). **Und der Owner-Satz wörtlich, an der echten Datenbank, mit den
echten Funktionen durchgespielt:** Anfrage gestellt (Frist 4 h ab Geburt) →
zweiter Anlauf `REPLACEMENT_PENDING` → Uhr zurückgedreht → Zusage
`ANFRAGE_VERFALLEN` → Sweep `{verfallen: 1}` → Zeile `expired`/inaktiv/gestempelt
→ zweiter Anlauf **erlaubt** (ON-CONFLICT recycelt den Link und stellt die Uhr
neu) → beide Meldungen geschrieben. Erinnerung separat: fällig gemacht → Sweep
`{erinnert: 1}` → zweiter Sweep `{erinnert: 0}` — die Doppelversand-Bremse
greift, genau eine Meldung.

---

## Staff-Rollen — gebaut am 2026-08-24 (Owner-Entscheid)

Der offene Punkt aus Abschnitt 10 lautete: *„verwaltbar, wer was bearbeiten darf
— hier ist die Vorarbeit schon da und ungenutzt."* Sie war genauer ungenutzt als
gedacht.

**Befund:** Migration 118 legt `tempconnect_staff.role` an, dokumentiert im
Spaltenkommentar sechs Werte und baut sogar einen **Index** darauf — und niemand
liest die Spalte. Jedes Staff-Mitglied konnte alles: Pilot verlängern, Hetzner
neu starten, Zugänge vergeben. Ein Access-Reviewer sah sechs Rollen und durfte
annehmen, sie trennten etwas.

**Owner-Entscheid:** `staff_member` ist das **vollwertige Teammitglied** — alle
Fachbereiche, nur die Staff-Verwaltung bleibt `staff_admin`. Die anderen Rollen
sind damit bewusste *Einschränkungen*, die man vergibt. Wirkung heute: gemessen
eine Staff-Zeile mit `staff_member` — sie verliert nichts.

Gebaut: `api/config/staffRollen.js` (Rolle → Bereich, Pfad → Bereich), das Tor im
**Wächter** statt an 105 Routen (eine Deklaration je Route wäre 105 Stellen, die
man bei der 106. vergisst — genau so entstand der Befund), `staff_audit` liest
überall und schreibt nirgends, `PATCH /staff-access/:userId/role` zum Vergeben
mit drei Riegeln (unbekannte Rolle, eigene Rolle, letzter aktiver Admin — in
einer Transaktion mit `FOR UPDATE`, sonst sperren zwei gleichzeitige
Degradierungen die Verwaltung herrenlos aus).

**An der echten Datenbank belegt:** `staff_member` kommt an Piloten und Betrieb
durch, scheitert an `/staff-access` mit `NUR_ADMIN`; dieselbe Person als
`staff_support` scheitert an Hetzner und Piloten mit `BEREICH_VERWEHRT`; ein
unregistrierter Pfad ergibt `BEREICH_NICHT_REGISTRIERT`.

### Der Nebenfund, der schwerer wiegt als die Aufgabe

Beim Eintragen der neuen Route meldete der Wach-Wächter sie als **Karteileiche** —
er kannte sie nicht. Ursache:

```js
const fabrik = Object.keys(mod).find((k) => /^create\w*Router$/.test(k));
```

Die **erste** Fabrik je Datei. `staffControlCenter.js` exportiert zwei, und
`createStaffControlAuthRouter` (1 schreibender Weg) steht vor
`createStaffControlCenterRouter` (**50** schreibende Wege). Der Wächter, dessen
einzige Aufgabe es ist, jeden schreibenden Weg ins Bestandsbuch zu zwingen, war
für die **gesamte schreibende Fläche des Staff Control Center** blind:
Pilotverlängerung, Hetzner-Neustart, Abo-Entscheidungen, Zugangsvergabe — nichts
davon stand je im Register.

Das ist die teuerste Sorte Lücke: ein Wächter, der grün meldet, weil er nicht
hinsieht. Er montiert jetzt **alle** Fabriken; die Grundlinie springt von 419 auf
**468 Wege**, die 49 neuen Einträge tragen die *echte* Middleware-Kette je Route
(Step-up-Stufe, Bestätigung, MFA-Audit), nicht eine Pauschale.

Nebenbei sichtbar geworden und noch zu bewerten: `POST
/preregistrations/:id/status` mutiert mit **nur** `requireStaff` — ohne Step-up,
ohne Begründung.

---

## Personen melden — gebaut am 2026-08-24 (Owner-Entscheid, revidiert)

**Die Vorgeschichte gehört dazu:** Am 23.08. fiel die Entscheidung auf
*„ersatzlos entfernen"* — `191_ein_meldeweg_weniger.sql` hat Tabelle, Route und
Dienst beseitigt. Am 24.08. hat der Owner sie revidiert: Personen-Meldungen
gehören ins Produkt. Meine Frage dazu war schlecht gestellt (sie beschrieb die
Tabelle, als gäbe es sie noch) — die Antwort ist trotzdem eindeutig, und der Weg
ist jetzt **sauberer**, als er am 23.08. gewesen wäre: kein Datenumzug, kein
Verschmelzen zweier fast disjunkter Vokabulare, sondern die vierte Zielart
derselben Tabelle.

Migration 191 nannte zwei Blocker. Beide sind jetzt **gelöst statt umgangen**:

| Blocker (191) | Lösung (194) |
|---|---|
| `reported_org_id` ist NOT NULL, der Posteingang verbindet mit **INNER JOIN** — 144 von 395 Nutzern haben keine Organisation, ihre Meldung wäre unsichtbar | Die Organisation wird **Kontext statt Träger**: nullable, Posteingang auf LEFT JOIN. Ein Bericht über eine Person hat als Gegenstand die Person; `ziel_art`/`ziel_id` tragen ihn seit 189/190 selbst. `par_org_pflicht_check` hält fest, dass die drei **Organisations**-Zielarten sie weiterhin brauchen — die Lockerung ist kein Loch. |
| `betrug` und `belaestigung` haben keine Entsprechung; in `other` einzuschmelzen löscht die Unterscheidung | Zwei **echte** Werte: `fraud` und `harassment`. Betrug ist nicht `fake_profile` (eine Firma kann echt sein und trotzdem betrügen) und nicht `misleading_info` (das ist eine Angabe, kein Vorsatz); Belästigung ist ein **Verhalten**, `inappropriate_content` ein **Inhalt**. `other` ist der Eimer, den ein Bearbeiter zuletzt öffnet. |

**Wo der Knopf sitzt:** in der Dealakte. `offers.supplier_company_id` und
`demand_requests.requester_company_id` *sind* Nutzerkennungen — das ist die
einzige Fläche des Produkts, auf der ein Nutzer einem anderen **Nutzer**
begegnet. Zwei Knöpfe nebeneinander, weil es zwei verschiedene Dinge sind: der
eine meldet den **Inhalt** des Angebots, der andere das **Verhalten** der
Gegenperson.

**Melden darf nur, wer mit der Person zu tun hatte** — mindestens ein
gemeinsamer Deal, in beide Richtungen geprüft. Ohne diese Bedingung wäre die
Route zweierlei auf einmal: ein Orakel für Nutzerkennungen und ein Weg, wahllos
gegen Fremde zu melden. „Gibt es nicht" und „nie miteinander zu tun gehabt"
antworten deshalb **gleich**.

**An echten Daten belegt:** beide Deal-Richtungen 200 · Selbst-Report 400 ·
Fremder 404 · nicht existierende Kennung 404 (*dieselbe* Antwort) · erfundener
Grund 400 vor jedem Datenbankzugriff · Meldung über eine Person **ohne
Organisation** gespeichert **und im Posteingang sichtbar** · Gegenprobe:
Profilmeldung ohne Organisation scheitert an `par_org_pflicht_check`.

### Der Nebenfund: das Hausmuster fiel aus der Prüfung

Beim Nachziehen des Schema-Abzugs biss ein Wächter mit `TypeError` statt mit
einer Aussage. Ursache im Abzug-Generator:

```sql
AND pg_get_constraintdef(c.oid) LIKE '% = ANY %ARRAY[%'
```

Ein CHECK, der mit `format('… %L::text[]', werte)` geschrieben wird, sieht anders
aus: `= ANY ('{a,b,c}'::text[])`. Und **genau das ist das dokumentierte
Hausmuster** für additive CHECK-Erweiterungen (Vorlage 184, übernommen von
189/190/193/194). Wer dem Muster folgte, ließ die betroffene Spalte lautlos aus
`pruefwerte` fallen — und jeder Wächter, der sich darauf stützt, hörte auf zu
prüfen, ohne rot zu werden.

Betroffen waren drei sicherheitsrelevante Spalten:
`worker_assignment_links.worker_confirmation_status`, `notifications.type`,
`profile_abuse_reports.reason`. Der Abzug liest jetzt **beide** Darstellungen;
alle drei sind wieder in der Prüfung.
