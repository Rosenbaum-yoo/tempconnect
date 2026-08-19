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
`api/scripts/run-tests.js`. Stand 2026-08-19: **11 Dateien / 80 Routen
verhaltensgeprüft, 71 Dateien ausgesetzt** — eine Sperrklinke verhindert, dass
die Zahl fällt.

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

## Übertragbar auf die Folgeprojekte

Die Mandantengrenze ist die teuerste Einzelentscheidung eines
Multi-Tenant-Produkts. Sie gehört von Anfang an in **einen** Helfer, der
mutationsgeprüft ist — nicht in 80 Einzelvergleiche, die jeder für sich richtig
aussehen. Nachträglich zu konsolidieren kostet ein Vielfaches.
