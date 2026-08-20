# Die Org-Grenze steht 80-mal einzeln

**Befund vom 2026-08-11, aus der Mutation-Testing-Härtung (Welle 3).**
Verifiziert am Code, nicht vermutet.

> Dieser Befund steht hier und nicht nur im Arbeitsplan, weil der Arbeitsplan
> (`_TEMPCONNECT_MUTATION_RBAC_PLAN.md`) per `.gitignore` **nicht versioniert**
> ist. Eine Architektur-Erkenntnis dieser Tragweite darf nicht auf einer
> einzelnen Maschine liegen.

---

## Was gesucht wurde

Die Mutation-Testing-Härtung wollte den **zentralen** Guard mutieren, der
„fremde Organisation → 403" entscheidet. Die Annahme: so etwas gibt es, gebündelt
an einer Stelle, und einmal gehärtet trägt es die ganze Mandantengrenze.

## Was gefunden wurde

| Ort | Fundstellen `ORG_BOUNDARY_VIOLATION` |
|---|---|
| `api/routes/` — 18 Dateien | **80** |
| `api/services/` — 4 Dateien | 6 |
| `api/utils/orgBoundary.js` | 2 (Fehlerklasse + Antwort-Helfer) |
| `api/middleware/` | 1 — ein **Kommentar**, kein Code |

Die Verteilung in den Routen: `workers.js` 13, `timesheets.js` 12,
`organizations.js` 8, `complianceDocs.js` 7, `assignments.js` 6, danach
`requisitions.js`, `invoices.js`, `contracts.js`, `documentCenter.js` je 5,
`vendorPool.js` 4, und ein Rest mit 1–2.

Die typische Form ist ein direkter Vergleich, ohne jeden Helfer:

```js
if (worker.supplier_org_id !== req.orgId) return res.status(403)...
```

**Die zentralen Helfer existieren — sie werden nur kaum benutzt:**

- `assertOrgOwnership` hat in der gesamten Produktion **einen einzigen**
  Aufrufer: `routes/requisitions.js` (4 Stellen).
- `assertUserOwnership` hat **keinen** Produktions-Aufrufer. Nur Tests rufen sie.
- `routes/timesheets.js` hält einen eigenen, datei-privaten `checkOrgBoundary`
  mit eigener Legacy-Ausnahme (`if (!orgId) return true`).

## Warum das zählt

Ein zentraler Helfer wird **einmal** geprüft, und die Prüfung trägt überall.
80 Kopien müssen **80-mal** geprüft werden — und jede ist eine eigene
Gelegenheit, das `!==` zu vergessen, die falsche Spalte zu vergleichen oder den
Fall `orgId == null` durchzulassen.

Konkret für die Mutation-Härtung: das Gate „null überlebende Mutanten im
403-Deny-Pfad" wäre durch Härten von `utils/orgBoundary.js` **formal erfüllbar**
— und würde rund **9 von 89** Entscheidungsstellen beweisen. Eine grüne Zahl
über einer ungeprüften Fläche ist genau das, wogegen Mutation Testing antritt.

## Entscheidung des Owners (2026-08-11)

Weg **a**: Welle 3 läuft auf dem Helfer, ihr Gate heisst aber ehrlich
**„Helfer-Pfad abgesichert"**. Die 80 Inline-Stellen werden als eigene
**Welle 3b** geführt — mit eigener Freigabe, weil ihre Auflösung
Produktionscode berührt und der Plan das in einer Testhärtungs-Welle
ausdrücklich verbietet.

## Was in Welle 3b zu tun ist

1. **Kartieren** — alle 80 Stellen mit Datei:Zeile, verglichener Spalte und
   Null-Verhalten.
2. **Abweichungen finden**, bevor irgendetwas umgebaut wird. Die interessante
   Frage ist nicht „wie oft", sondern **„wo weicht eine Kopie ab?"** — fehlende
   Null-Prüfung, `==` statt `!==`, vertauschte Spalten, Legacy-Ausnahmen.
   Gefundene echte Bugs gehen als Ticket an den Owner, nicht in einen stillen
   Patch.
3. **Entscheiden** — konsolidieren oder einen Wächter-Test bauen, der jede neue
   Inline-Grenze meldet. Zeigen die Kopien keine Abweichung, ist der Wächter die
   wirtschaftlichere Antwort; zeigen sie welche, rechtfertigt das die
   Konsolidierung.
4. **Absichern** — den konsolidierten Helfer mutieren, oder den Struktur-Test
   scharf schalten.

**Gate 3b:** Jede der 80 Stellen ist entweder durch den mutationsgeprüften
Helfer abgedeckt oder als bewusste Ausnahme dokumentiert.

---

## Was Welle 3b ergeben hat (2026-08-19, abgeschlossen)

**Die Leitfrage war falsch gestellt.** Sie lautete „wo weicht eine Kopie ab?".
Die Antwort: kaum irgendwo — die 80 Kopien sind untereinander erstaunlich
einheitlich, und ihre einzige echte Abweichung (die dreigeteilte Null-Politik)
ist durch `middleware/orgContext.js` Regel 7 für jeden Nutzer mit Mitgliedschaft
ohnehin entschärft.

**Gefährlich waren die Stellen, an denen GAR KEINE Kopie stand.** Zehn davon,
sechs mit schreibendem Cross-Org-Zugriff. Eine Konsolidierung der 80 hätte
**keine einzige** gefunden. Das ist das entscheidende Argument — und der Grund,
warum die Owner-Entscheidung D-M1 auf den Wächter fiel und nicht auf den Umbau.

**Warum der Helfer nicht das Ziel war.** `assertOrgOwnership` hat 22 erlaubte
Tabellen (nicht 23) — es fehlen `timesheets`, `invoices`, `worker_profiles`,
`worker_submissions`, `document_center`, also genau die Tabellen hinter 35 der
80 Stellen. Er kann nur EINE Spalte vergleichen, während rund 20 Stellen die
zweiseitige Grenze `org_id = ich ODER supplier_org_id = ich` brauchen. Und jeder
Aufruf kostet eine zusätzliche Abfrage auf einem heißen Pfad.

**Das neue Gate 3b** ist damit prüfbar statt aufzählend:

> Jede Route mit einem Pfad-Platzhalter in einer abgedeckten Datei steht im
> Register `api/test/fixtures/orgGrenzen.json` und ist entweder
> **verhaltensgeprüft** oder als **bewusste Ausnahme mit Begründung** eingetragen;
> jede Route-Datei ist abgedeckt oder mit Grund ausgesetzt.

Durchgesetzt von `api/test/orgGrenzenWaechter.test.js` bei jedem Lauf von
`api/scripts/run-tests.js`. Stand 2026-08-19: **15 Dateien · 137 Routen
verhaltensgeprüft · 56 belegte Ausnahmen · 67 Dateien ausgesetzt** — eine
Sperrklinke verhindert, dass die Zahl fällt.

**Die zweite Welle hat die Frage selbst korrigiert.** Der Befund hieß „die
Org-Grenze steht 80-mal einzeln". Bei den vier größten ungeprüften Dateien
stellte sich heraus: dort steht sie **gar nicht**, weil es keine Org-Grenze ist.
`capacityExchange` und `marketplace` binden an den **Nutzer**
(`supplier_company_id`/`requester_company_id` gegen `req.session.userId`),
`workerPortal` an die Arbeitersitzung, `staffControlCenter` ist org-übergreifend
per Bauart. Vier Dateien, vier Grenzmodelle — und keines davon hätte eine
Konsolidierung der 80 erfasst.

Der Wächter kennt deshalb `identitaet: "org" | "nutzer"` und eine eigene Schicht
für Flächen mit *einer* Eintrittsbedingung (Torwächter). Was dabei sichtbar
wurde, stand vorher nirgends geschrieben: **welche Seite eines Geschäfts was
darf.** Nur der Anfragende nimmt an, nur der Lieferant zieht zurück, nur die
Kundenorganisation gibt einen Zeitnachweis frei. 56 solcher Entscheidungen sind
jetzt als bewusste Ausnahme mit Begründung eingetragen statt unausgesprochen.

**Ein Nebenertrag, der die Arbeit wert war:** Das Register zwingt dazu, je Route
zu benennen, WELCHE Spalte die Grenze trägt. Dabei kam heraus, dass mehrere
Routen bewusst **einseitig** gewähren, wo man zweiseitig vermutet: Rahmenverträge
darf nur die Käuferorganisation ändern (lesen dürfen beide), den
Lieferantenpool pflegt nur die Kundenorganisation, und `GET /invoices/:id`
(Abo-Rechnung, nicht die operative) gewährt über `user_id ODER org_id` — die
Lieferantenorganisation ist dort kein Empfänger. Diese Modelle standen bisher
nirgends geschrieben; jetzt stehen sie im Register und werden geprüft.

**Die ehrliche Grenze:** Der Wächter beweist die Entscheidung des Handlers und
die Parameterübergabe. Er beweist **nicht**, dass ein Service-SQL sein
`AND org_id = $2` behalten hat — gemessen an vier Mutationen gegen den echten
Bestand: die beiden Handler-Mutationen macht er rot, die beiden SQL-Mutationen
fangen die Service-Tests. Keine der beiden Hälften reicht allein.

## Vollständige Abdeckung (2026-08-20, abgeschlossen)

Die Wellen A bis D haben das Register von 15 auf **alle 82 Route-Dateien**
gehoben: **257 verhaltensgeprüfte Routen, 123 belegte Ausnahmen, keine
ausgesetzte Datei mehr.** Die 14 des Owner Control Centers werden über ihren
Einstiegspunkt geführt (Schicht B3, weil sie keine Platzhalter-Route haben),
`matching.js` ist seit dem Abschluss von E-14 regulär geprüft.

**Der teuerste Ertrag stand nicht im Auftrag.** Die Recherche hatte fünf Lücken
benannt (E-1 bis E-5). Die Ausweitung des Wächters auf alle Dateien hat **zwölf
weitere** gefunden, und die schwersten kamen zuletzt:

| Befund | Weg | Was möglich war |
|---|---|---|
| E-12 | `GET /assignments/:id/staffing` | Besetzungsübersicht eines fremden Einsatzes, mit Schreibvorgang vor der Klärung |
| E-13 | `getStaffingChoiceSet` | Lebenszyklus einer fremden Auswahlmenge fortgeschrieben |
| E-15 | `DELETE /sla/search-jobs/:id` | drei ungebundene DELETEs **vor** der Besitzprüfung |
| E-16 | `POST /mentoring/sessions/:id/feedback` | jeder Unbeteiligte galt stillschweigend als Mentee |
| E-17 | `POST /data-governance/anonymize/user/:userId` | fremdes Konto unwiderruflich anonymisieren |
| E-18 | `PATCH /data-governance/requests/:id/complete` | fremde DSGVO-Anfrage als erledigt schließen, ohne sie zu erfüllen |
| E-19 | `GET/POST /supplier-pools/distribution/:requisitionId` | Verteilplan einer fremden Ausschreibung lesen **und weiterschalten** |
| E-20 | `GET /data-governance/export/user/:userId` | Vollexport eines beliebigen fremden Nutzers |
| E-14 | `GET /matching/demand/:id`, `/supply/:id` | Engine gegen fremden Bedarf laufen lassen; `logMatch` verbuchte ihn unter der eigenen Org |
| E-21 | `GET /matching/worker/:id` | *kein Leck, aber ein schlafendes*: liest eine Tabelle, die keine Migration je anlegte |
| E-11 | `canAccessAsOwner`, 10 Aufrufstellen | *umgekehrtes Vorzeichen*: zu streng statt zu lasch — nur der eine anlegende Mensch kam je durch |

E-17, E-18 und E-20 lagen in **derselben Datei** — die Datenschutz-Werkzeuge
waren durchgehend unbewacht, weil das Recht (`data_governance.*`) die eigene
Organisation prüft, die Kennung im Pfad aber eine beliebige sein durfte. Die
Geschwister-Route `/export/org` machte es von Anfang an richtig: sie nimmt
`req.orgId` und keine Kennung aus dem Pfad. Zwei Wege in einer Datei, zwei
Bauarten, sechs Jahre unbemerkt.

**E-20 ist der größte Datenabfluss dieser Arbeit** (Mailadresse, Telefon,
Anschrift, Steuernummer, alle Anzeigen, Anfragen, Bewertungen, Angebote,
Einsätze, Stundenzettel eines Dritten), **E-17 der größte Schaden** (er gibt
keine Daten preis, er *zerstört* die eines Dritten), **E-19 der größte
Wettbewerbsschaden** (wer erfährt, an welche Lieferanten die Ausschreibung eines
Wettbewerbers in welcher Reihenfolge geht, kennt dessen Vergabe — und konnte sie
sogar weiterschalten).


**E-14 aufgelöst, ohne eine Produktfrage zu beantworten.** `matching.js` lag
zuletzt als Owner-Entscheidung auf Halde: Bedarfe werden im Marktplatz *bewusst*
an Lieferanten ausgespielt, eine Org-Grenze wäre dort falsch. Die Auflösung war,
**nach der Regel zu suchen statt eine zu erfinden** — `capacityExchangeService`
führt sie seit jeher: offen, freie Plätze, kein Ursprungsauftrag, nicht
abgelaufen. `findMatches` erreichte dagegen auch `closed`, `cancelled` und
`fulfilled`. Damit war es kein Produktkonflikt, sondern eine Inkonsistenz mit
einer Entscheidung, die die Plattform längst getroffen hatte. Gemessen gegen das
echte Schema zeigen Matching und Marktplatz derselben Agentur jetzt **dieselbe
Menge, null Abweichungen**.

> **Übertragbar:** Wo eine Grenze wie eine Produktfrage aussieht, lohnt zuerst die
> Suche nach einer Fläche, die dieselbe Frage schon beantwortet hat. Zwei Wege zu
> denselben Daten mit *verschiedenen* Sichtbarkeitsregeln sind fast immer ein
> Versehen — und der strengere Weg ist die Regel, der laxere die Hintertür.

**Bewiesen statt behauptet.** Für E-18/E-19/E-20 wurde dieselbe Anweisung gegen
das echte Postgres-Schema gefahren, in einer Transaktion mit ROLLBACK: acht
Prüfungen grün. Mit entfernter Bindung wurden **fünf davon rot** — Organisation A
schloss die DSGVO-Anfrage von B (`status = 'completed'`), las deren Verteilplan
und schaltete deren Vergabe weiter. Ein Mock kann kein `WHERE` erzwingen; erst
diese Gegenprobe macht aus einer Textzusicherung einen Nachweis.


**Ein Befund mit umgekehrtem Vorzeichen.** E-11 ist der einzige der Reihe, bei
dem die Prüfung nicht zu lasch war, sondern **zu streng**: `canAccessAsOwner`
sollte „Eigentümer ODER Mitglied derselben Organisation" prüfen, ließ aber immer
nur den einen Menschen durch, der die Zeile angelegt hatte — wegen zweier
unabhängiger Fehler (`status` statt `is_active`; Nutzer-Kennung gegen
`org_memberships.org_id` verglichen). Bei Urlaub oder Personalwechsel war die
Bedarfsmeldung des Unternehmens für das Unternehmen verloren.

Er gehört trotzdem in diese Liste, weil er dieselbe Ursache hat wie alle anderen:
**niemand konnte sehen, dass die Grenze nicht das tut, was drandsteht.** Ein
`catch { return false }` um eine Sicherheitsabfrage macht eine kaputte Abfrage
von einer verweigerten Berechtigung ununterscheidbar. Fail-closed ist richtig —
still zu sein ist es nicht.

> **Übertragbar, und teuer gelernt:** Eine Reparatur kann eine Prüfung *blind*
> machen, ohne sie anzufassen — indem sie den Code aus deren Sichtfeld schiebt.
> Der SQL-Schema-Wächter hatte E-11 gefunden; die Reparatur (ein JOIN über drei
> Relationen) verließ aber genau den Bereich, den er prüft (einrelationale
> Anweisungen). Wer eine Zeile von einer Ausnahmeliste streicht, muss **belegen**,
> dass die Prüfung den Fall danach wirklich sieht — nicht annehmen.

**Zwei Blindstellen des Wächters selbst wurden dabei sichtbar:**

1. *Anonyme Torwächter.* `supportAuth` war eine namenlose Closure aus
   `requireSupportAccess(deps)`. Für jede Strukturprüfung und jede Stapelspur
   unsichtbar — der Wächter konnte nicht belegen, dass die einzige
   Eintrittsbedingung der gesamten Support-Fläche überhaupt noch montiert ist.
   Der Name ist jetzt Teil der Absicherung.
2. *Präfix-Tore.* `support.js` montiert sein Tor einmal auf `/support` statt je
   Route. Das ist die **strengere** Bauart — auf einer neuen Route kann man es
   nicht vergessen —, aber ein Test, der nur `route.stack` liest, meldet die
   Fläche als ungeschützt. Der Wächter kennt jetzt beide Formen.

**Vier Grenzmodelle, nicht eins.** Über 81 Dateien hinweg hat sich bestätigt,
was die zweite Welle andeutete: `org` (Organisation gegen `req.orgId`), `nutzer`
(`owner_id`/`agency_id`/`mentor_id` gegen die Sitzung), *Torwächter* (eine
Eintrittsbedingung je Fläche) und *bewusst offen* (Marktplatz per Bauart —
Bewertungen, Ruf, aktive Kapazitätsanzeigen). Eine Konsolidierung der 80 Kopien
hätte drei dieser vier Modelle nicht einmal berührt.

## Übertragbar auf die Folgeprojekte

Die Mandantengrenze ist die teuerste Einzelentscheidung eines
Multi-Tenant-Produkts. Sie gehört von Anfang an in **einen** Helfer, der
mutationsgeprüft ist — nicht in 80 Einzelvergleiche, die jeder für sich richtig
aussehen. Nachträglich zu konsolidieren kostet ein Vielfaches.
