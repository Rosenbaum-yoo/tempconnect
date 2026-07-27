# P4 — Matching-Engine, KI-Ranking & Activity Center · Bauplan

> Erstellt 2026-07-25 als Vorbereitung der P4-Welle. **Status: Plan.**
> Vorbedingung erfüllt: P1–P3 sind abgeschlossen und audit-gehärtet
> ([ENTERPRISE_AUDIT_2026-07-25.md](ENTERPRISE_AUDIT_2026-07-25.md)).

## Warum P4 der Hebel ist

P1–P3 haben die **Ausführung** perfektioniert: ein Einsatz läuft sauber von der Zuweisung über
den Stundenzettel bis zur Kundenfreigabe. Was fehlt, ist die **Anbahnung**. Heute muss jemand
suchen. Nach P4 findet das System — und das ist der Unterschied zwischen einer Verwaltungs-
software und einem Marktplatz, der von selbst Umsatz erzeugt.

Der wirtschaftliche Kern: **Time-to-Fill.** Jede Stunde, die eine offene Position unbesetzt
bleibt, ist verlorener Umsatz für beide Seiten. Ein Matching, das in Sekunden statt Tagen
liefert, ist das Verkaufsargument, das keine Konkurrenz mit „wir haben auch eine Suche" kontert.

## Was bereits existiert (verifiziert, nicht neu bauen)

| Baustein | Datei | Zustand |
|---|---|---|
| Matching-Engine | `services/matchingEngine.js` | vorhanden |
| Match-Routen | `routes/matching.js` | vorhanden |
| Match-Alerts | `match_alerts` (Tabelle) | vorhanden |
| Activity-Feed | `services/activityFeedService.js` | vorhanden |
| Notification-Matrix | `services/notificationMatrix.js` | vorhanden + **neu:** permission-abgeleitete Empfänger |
| Skill-Katalog | `worker_profile_skills` (Mig 145) | Welle 1 fertig |
| Multi-Skill-Generator | `capacityOfferGeneratorService.js` | fertig |

**P4 ist damit überwiegend Lücken-Schließen und Verdrahtung, kein Greenfield.** Vor jeder
Welle gilt die Verifikations-Pflicht: erst am Code prüfen, was wirklich fehlt.

---

## Welle 4.1 — Bidirektionales Instant-Matching ✅ ERLEDIGT (2026-07-26)

**Ziel:** Bei **Angebots-** UND **Auftrags-Erstellung** sofort gegen die aktive Gegenseite
matchen und **beide** Seiten benachrichtigen. Heute ist der Trigger unzuverlässig.

- Ein **Chokepoint** für beide Richtungen (Muster von `findWorkerScheduleConflicts` aus P1.4:
  eine einzige Wahrheit, in allen Erstellungspfaden erzwungen) — nicht zwei Trigger, die
  auseinanderdriften.
- Der Trigger läuft **fire-and-forget mit `swallow`-Guard** (Muster aus P1.3): ein Matching-
  Fehler darf die Erstellung nie scheitern lassen.
- Empfänger über `findOrgMembersWithPermission` — benachrichtigt wird, wer handeln darf.
- **Dedup ist Pflicht:** dasselbe Paar (Angebot × Auftrag) darf nie zweimal alarmieren.
  `match_alerts` mit Unique-Key, nicht per Applikationslogik.

**Akzeptanz:** Angebot anlegen → passender Auftrag existiert → beide Seiten haben binnen
Sekunden eine Benachrichtigung mit Deep-Link auf das konkrete Gegenstück (keine Übersicht).

### Was gebaut wurde

| Baustein | Ort |
|---|---|
| Chokepoint `runMatchTrigger` / `scheduleMatchTrigger` | `api/services/matchTriggerService.js` |
| Paar-Dedup in der DB (`pair_key` + partieller UNIQUE-Index) | `sql/migrations/151_instant_match_pair_dedup.sql` |
| Auswertungsspur `match_logs` (fehlte komplett, siehe unten) | `sql/migrations/152_match_logs.sql` |
| Verhaltens-Suite (28 Tests, ohne DB) | `api/test/matchTrigger.test.js` |
| Schema-Smoke gegen echte DB (3 Tests) | `api/test/integration/matchTrigger.schema.flow.test.js` |

**Verdrahtete Erstellungspfade** (vorher drei verschiedene Implementierungen, eine davon gar keine):

| Pfad | Vorher | Jetzt |
|---|---|---|
| `POST /marketplace/capacity-posts` | **kein Trigger** — neues Angebot blieb unsichtbar | Chokepoint |
| `POST /marketplace/demand-requests` | Inline-Dispatch nur an Anbieter, ohne Dedup/Alarm-Datensatz | Chokepoint (SLA-Mails unverändert) |
| `POST /capacity-exchange/entries` (sofort aktiv) | kein Trigger | Chokepoint |
| `POST /capacity-exchange/entries/:id/activate` | Inline-Variante, kannte nur `demand_requests` | Chokepoint |
| `POST /requisitions/:id/approve` | `triggerRequisitionMatchAlerts` (Einbahn, Zeitfenster-Dedup) | Chokepoint |

Die beiden alten Trigger in `matchAlertService.js` sind `@deprecated` markiert und bekommen
keine neuen Aufrufer. Deal-abgeleitete Nachfragen (Zustimmung/Verhandlung zu einem konkreten
Angebot) lösen bewusst **nicht** aus — sie sind bereits gematcht.

### Entscheidungen, die über den Plan hinausgehen

- **Kanonischer, richtungsunabhängiger `pair_key`** statt eines Unique-Keys auf
  (Quelle, Ziel). Ein Unique-Key auf die Quelle hätte das Kernproblem nicht gelöst: legt
  Seite A zuerst an und Seite B später, ist die *Quelle* eine andere, das *Paar* aber
  dasselbe — es hätte weiterhin doppelt alarmiert.
- **Selbstmatch-Sperre**: eigene Kapazität gegen eigenen Bedarf (gleicher Account oder
  gleiche Org) alarmiert nie.
- **Kostengrenzen im Code**: `TRIGGER_TOP_N = 8`, `TRIGGER_MIN_SCORE = 40`
  (= exakte Rolle + passende Verfügbarkeit), `TRIGGER_MAX_ALERTS = 24` pro Lauf.
- **Wiederverwendung statt Zweitimplementierung**: Richtung Auftrag → Angebot nutzt den
  bereits vorhandenen, angereicherten `instantMatchService.instantMatchFromParams`
  (Compliance, Reputation, Vendor-Pool, Smart Rank sind dort batch-vorgeladen).

### Nebenbefund, sofort behoben: `match_logs` gab es nie

Der Live-Smoke hat gezeigt, dass `matchingEngine.logMatch()` seit Einführung in eine
**nicht existierende Tabelle** schreibt — der INSERT steckt in einem `try/catch` ohne Log,
also ist jeder Aufruf still ins Leere gelaufen. Exakt das Fehlermuster aus `SKILL.md`:
ein Pfad, der nirgends scheitert und trotzdem nichts tut.

Das ist kein Schönheitsfehler, sondern die Messgrundlage von 4.3: ohne diese Spur lässt
sich „ist die KI besser als die deterministische Baseline?" nicht beantworten. Migration
152 legt die Tabelle an (BRIN auf `created_at` — append-only auf heißem Insert-Pfad), der
Schema-Smoke prüft ab jetzt, dass ein Eintrag wirklich in der DB landet.

### Verifikation (2026-07-26)

- Volle Suite: **7350 Tests, 0 Fehler** (`api/scripts/run-tests.js`).
- Migrationen 151 + 152 gegen die laufende Dev-DB angewandt.
- Live gegen die laufende App (`tempconnect_api` + echte DB): Angebot × Nachfrage angelegt →
  `{"pairs":1,"alerts":2}`, beide Seiten haben eine Benachrichtigung mit Deep-Link auf das
  Gegenstück (`…detail.html?id=<Angebot>&type=supply` bzw. `…&type=demand`).
- Dedup live geprüft: derselbe Lauf erneut → `alerts: 0`; **Gegenrichtung** (Nachfrage als
  Quelle) → ebenfalls `alerts: 0`. Genau der Fall, den eine Zeitfenster-Logik nicht abdeckt.
- Testdaten anschließend restlos entfernt.

## Welle 4.2 — Match-Qualität sichtbar machen (vor der KI!) ✅ ERLEDIGT (2026-07-26)

**Bewusst vor 4.3 gezogen.** Ein Ranking ohne erklärbare Grundlage ist eine Blackbox, der
niemand vertraut — und ohne deterministische Basis lässt sich später nicht messen, ob die
KI überhaupt besser ist.

- **Score-Zerlegung** statt einer Zahl: Skill-Deckung, Verfügbarkeit, Entfernung, Preisrahmen,
  Historie — jede Achse einzeln sichtbar.
- **Begründung im Klartext**, deterministisch erzeugt: „3 von 4 geforderten Skills, ab sofort
  verfügbar, 18 km entfernt."
- Damit existiert eine **Baseline**, gegen die 4.3 antreten muss.

### Was gebaut wurde

| Baustein | Ort |
|---|---|
| Erklärungs-Schicht (Achsen, Formulierung, Zusammenfassung) | `api/services/matchExplanationService.js` |
| Strukturierte Fakten je Score-Beitrag (`meta`) | `api/services/matchingEngine.js` (additiv) |
| Karte mit Begründung, Badge und Lücken | `frontend/public/matching_results.html` |
| Verhaltens-Suite (35 Tests) | `api/test/matchExplanation.test.js` |
| DOM-Verdrahtungs-Nachweis in vm-Sandbox (6 Tests) | `api/test/matchingResultsPage.test.js` |

**Der Server besitzt die Erklärung.** Vorher pflegte jede Oberfläche ihre eigene
`FACTOR_LABELS`-Tabelle — kam ein Faktor in der Engine dazu (`compliance`, `rate`,
`smartRank`), zeigte die UI stumm den technischen Schlüsselnamen. Jetzt liefern alle
Match-Endpunkte ein `explanation`-Objekt mit:

- `headline` — „Gute Übereinstimmung (72%)"
- `summary` — „Rolle „Pflegekraft" passt genau, 3 von 4 geforderten Skills, 18 km entfernt"
- `axes[]` — je Achse Label, Punkte, Prozent, Status (`full`/`partial`/`missing`) und Klartext
- `gaps[]` — was **nicht** passt, getrennt ausgewiesen statt verschwiegen

**Verdrahtete Endpunkte:** `/matching/demand/:id`, `/matching/supply/:id`,
`/matching/worker/:id`, `/matching/instant/search`, `/matching/instant/:requisitionId`,
`/capacity-exchange/entries/:id/matches`, `/marketplace/demand-requests/:id/matches`.
Zusätzlich trägt die Benachrichtigung aus 4.1 jetzt die Begründung statt nur einer Prozentzahl.

**Grundlage sind strukturierte Fakten, keine String-Analyse:** `scoreMatch` gibt je Beitrag
ein `meta` mit (`{overlap, required}`, `{km, maxKm, withinRadius}`, `{fits}`, …). Die
Formulierung entsteht daraus — nicht durch Zerlegen des technischen `detail`-Texts, der
sonst bei jeder Wortänderung die Erklärung kaputtmachen würde. Altdaten ohne `meta`
(persistierte `matches.reasons`) fallen sauber auf eine allgemeinere Formulierung zurück.

**Verifikation:** volle Suite **7392 Tests / 0 Fehler**; Live gegen die laufende App:
`Sehr gute Übereinstimmung (80%)` mit Achsen `Rolle 30/30 · Skills 25/25 · Standort 15/25 ·
Verfügbarkeit 10/10`; Computed-Style-Prüfung im Browser bestätigt Token-Farben
(`--ds-success` für gute, `--ds-danger` für fehlende Achsen), keine Hardcodes.

## Welle 4.3 — KI-Augmentierung als Ranking-Schicht (Claude API) ✅ GEBAUT, AUS (2026-07-26)

> **Owner-Vorgabe 2026-07-25:** „Die KI soll so fortschrittlich sein wie es nur geht — dabei
> aber effizient im Sinne von wirtschaftlich optimal."
>
> **Wie das aufgelöst wird — die beiden Ziele sind kein Widerspruch, sondern eine Frage der
> Architektur:** Fortschrittlich heißt nicht „größtes Modell auf jede Anfrage". Es heißt, das
> Modell genau dort einzusetzen, wo es etwas kann, das Code nicht kann — Bedeutung verstehen
> und begründen — und alles andere weiter deterministisch zu rechnen. Konkret:
> - **Vorfilter deterministisch, Feinsortierung mit KI.** Der Engine reduziert Tausende auf ~10.
>   Nur diese 10 sehen das Modell. Kosten skalieren dann mit der Zahl der *Treffer*, nicht mit
>   der Größe der Datenbank — das ist der Unterschied zwischen tragfähig und ruinös bei 300 Kunden.
> - **Modellwahl nach Aufgabe, nicht nach Prestige.** Ranking + ein Satz Begründung ist eine
>   Aufgabe für ein schnelles Modell; nur wo echtes Urteilsvermögen nötig ist, das stärkere.
>   Vor dem Bau den `claude-api`-Skill konsultieren — Modell-IDs und Preise nie aus dem Gedächtnis.
> - **Cache als Kostenhebel.** Identische Angebot×Auftrag-Paare fragen das Modell genau einmal.
>   Ändert sich keine Seite, gilt das Ergebnis weiter.
> - **Prompt Caching** für den stabilen Teil des Prompts (Skill-Taxonomie, Bewertungsregeln) —
>   der wiederholt sich bei jedem Aufruf und muss nicht jedes Mal neu bezahlt werden.
> - **Messbar machen:** Kosten pro Match und Trefferqualität gegen die 4.2-Baseline protokollieren.
>   Ohne diese Zahl ist „wirtschaftlich optimal" eine Meinung. Mit ihr eine Entscheidung.

**Architektur-Prinzip: die KI rankt, sie entscheidet nicht.** Der deterministische Engine
bleibt die Wahrheit und der Fallback. Die KI sortiert die Top-Kandidaten um und schreibt
die Erklärung — fällt sie aus, funktioniert alles weiter, nur weniger elegant.

- **Kostenkontrolle ist Teil des Designs** (§0.3): nur die Top-N (z. B. 10) der
  deterministischen Vorauswahl gehen an das Modell, nicht der gesamte Kandidatenpool.
  Ergebnis wird gecacht, solange sich weder Angebot noch Auftrag ändern.
- **Tier-2-Kill-Switch** `AI_MATCH_RANKING_ENABLED` (Default AUS) nach der etablierten
  Config-Taxonomie — anschaltbar ohne Deploy, abschaltbar bei Kostenüberraschung.
- **Latenz-Budget:** überschreitet der Aufruf es, wird das deterministische Ergebnis
  ausgeliefert. Der Nutzer wartet nie auf die KI.
- Modellwahl und Parameter über den `claude-api`-Skill klären, nicht aus dem Gedächtnis.

**Akzeptanz:** Flag AUS → Verhalten exakt wie 4.2. Flag AN → gleiche Treffer, bessere
Reihenfolge, je Treffer ein Satz Begründung. Kein Treffer verschwindet durch die KI.

### Was gebaut wurde

| Baustein | Ort |
|---|---|
| Ranking-Schicht (Vorfilter → Modell → Fallback) | `api/services/aiMatchRankingService.js` |
| Ergebnis-Cache + Kostenspur | `sql/migrations/153_ai_match_ranking_cache.sql` |
| Verdrahtung (Auftrag → Angebot) | `api/routes/matching.js` |
| Verhaltens-Suite (32 Tests) | `api/test/aiMatchRanking.test.js` |

**Die Suite prüft nicht „rankt die KI gut?" — das misst man gegen die Baseline, nicht im
Unit-Test. Sie prüft: kann die KI etwas kaputt machen?** Antwort in jedem Fall nein:
Flag aus, Tarif ohne Anspruch, Modell nicht erreichbar, Antwort unlesbar, Sicherheits-
Ablehnung, Kandidat fehlt, Kandidat erfunden, Auftrag nicht ladbar → immer die
vollständige deterministische Reihenfolge aus 4.2.

### Konfiguration (3-Tier-Taxonomie)

| Schalter | Default | Wirkung |
|---|---|---|
| `AI_MATCH_RANKING_ENABLED` | **AUS** | Tier-2-Kill-Switch. Ohne Freigabe entsteht keine einzige API-Anfrage. |
| `AI_MATCH_RANKING_MODEL` | `claude-opus-5` | Modellwahl ohne Deploy. |
| `AI_MATCH_RANKING_MIN_PLAN` | `PRO` | Tier-3-Entitlement. `DEMO` öffnet es für alle Pläne. |
| `AI_MATCH_RANKING_TOP_N` | `10` | Wie viele Kandidaten das Modell überhaupt sieht. |
| `AI_MATCH_RANKING_TIMEOUT_MS` | `2500` | Latenzbudget; darüber gilt das deterministische Ergebnis. |

> **Offene Owner-Entscheidung, unter Annahme gebaut:** Die Frage „KI-Ranking in allen
> Plänen oder ab höherem Tarif?" ist eine Preis-, keine Technikfrage und wurde noch nicht
> beantwortet. Gebaut ist deshalb der vorsichtige Default **PRO+ mit Flag AUS** — beides
> ist eine Ein-Zeilen-Änderung an der Konfiguration, kein Code.

### Gemessene Kosten pro Ranking-Lauf (10 Kandidaten, Prompt-Cache warm)

| Modell | Kosten je Lauf | 15.000 Läufe/Tag (~300 Kunden) |
|---|---|---|
| `claude-opus-5` (Default) | **0,82 Cent** | ~123 €/Tag |
| `claude-sonnet-5` | 0,49 Cent | ~74 €/Tag |
| `claude-haiku-4-5` | **0,16 Cent** | ~25 €/Tag |

Gemessen mit der echten Preistabelle gegen einen realistischen Lauf (500 neue + 900
gecachte Eingabe-Tokens, 210 Ausgabe-Tokens). Zwei Hebel drücken diese Zahl bereits:
der **Cache** (dieselbe Paarung mit unverändertem Inhalt kostet 0) und **Prompt Caching**
für den stabilen Bewertungsteil. Der dritte Hebel ist die Modellwahl — ein Ranking mit
einem Satz Begründung ist die Aufgabe, bei der ein schnelles Modell am wenigsten kostet
und am wenigsten verliert. **Empfehlung: mit `claude-haiku-4-5` starten, gegen die
4.2-Baseline messen, und nur hochstufen, wenn die Messung es rechtfertigt.**

### Aktivierung (3 Schritte, alle owner-gated)

1. `ANTHROPIC_API_KEY` in die Produktions-Umgebung legen (Secret, nie im Code).
2. `npm install` im API-Image — `@anthropic-ai/sdk` ist in `package.json` deklariert, aber
   bewusst noch nicht installiert: solange das Flag AUS ist, wird es nie importiert.
3. `AI_MATCH_RANKING_ENABLED=true` setzen (plus optional Modell/Mindesttarif).

### Verifikation (2026-07-26)

- Volle Suite: **7451 Tests, 0 Fehler**.
- Migration 153 gegen die laufende Dev-DB angewandt.
- Live gegen die laufende App: Flag AUS → `applied:false, reason:"disabled"`, Liste
  identisch (Objektidentität geprüft, nicht nur Inhalt); Tarif BASIS → `plan_locked`;
  angewandt → Reihenfolge geändert, Begründung je Treffer, Kosten protokolliert;
  zweiter Lauf → **Cache-Treffer, kein Modellaufruf, Kosten 0**.
- **Nicht verifiziert (bewusst):** der echte Modellaufruf. Er braucht einen
  `ANTHROPIC_API_KEY` auf dem Owner-Konto und verursacht echte Kosten — das ist eine
  Owner-Entscheidung, keine Entwickler-Entscheidung. Alles davor und danach (Vorfilter,
  Prompt-Aufbau, Schema, Cache, Kostenrechnung, Fallback, Verdrahtung) ist geprüft; der
  Aufruf selbst folgt exakt der `claude-api`-Referenz (Structured Outputs über
  `output_config.format`, Prompt Caching auf dem stabilen System-Block, `effort: "low"`).
- Testdaten restlos entfernt.

## Welle 4.4 — Activity Center voll verdrahten ✅ ERLEDIGT (2026-07-26)

Jede relevante Aktion aus P1–P3 erzeugt ein Activity-Event — der Ripple aus den fertigen
Wellen wird eingespeist (Ersatz zugewiesen, Zettel freigegeben, Kraft gesperrt, Beschwerde
gemeldet/erledigt, Match gefunden).

**Die zwei Fallen, die hier dokumentiert sind und beachtet werden müssen:**
1. `dispatch()` ohne Eintrag in `notificationMatrix` scheitert **still** („Unknown event").
2. Ein neuer `notifications.type` ohne Eintrag im CHECK-Constraint lässt den INSERT
   **still** scheitern → neue Migration ist Pflicht.

Beides ist in `SKILL.md` als harte Lehre vermerkt und hat schon einmal ein komplett totes
Feature erzeugt (`createRatingsRouter` war nie gemountet).

### Der Befund: der Verlauf war leer, weil niemand ihn füllte

`platform_events` hatte in der Dev-Datenbank **0 Zeilen**. Von 40 deklarierten Event-Typen
wurden nur 10 überhaupt jemals emittiert — und keiner davon aus P1–P3. `match_found`
existierte als Typ, wurde aber nie geschrieben. Für einen Kunden hieß das: der Tab
„Verlauf" im Activity Center zeigte dauerhaft „Keine Aktivitäten im ausgewählten Zeitraum".
Dritte Ausprägung desselben Musters wie `match_logs` (4.1) und `notificationMatrix`.

### Was gebaut wurde

| Baustein | Ort |
|---|---|
| `ACTIVITY_CATALOG` — Typ, Beschriftung, Symbol in **einer** Zeile | `api/services/eventTrackingService.js` |
| `recordActivity()` — fire-and-forget, wirft nie, meldet unbekannte Typen laut | dito |
| `activityLinkFor()` / `describeEvent()` — Deep-Link + Darstellung vom Server | dito |
| Anreicherung der Match-Alarme (Titel, Begründung, Ziel) | `api/services/matchAlertService.js` (`enrichMatchAlerts`) |
| Klickbarer Verlauf + Alarme mit Ziel | `frontend/public/js/pages/activity.js`, `activity.html` |
| Katalog-/Emitter-Suite (16 Tests) | `api/test/activityCatalog.test.js` |
| Route- und Anreicherungs-Suite (11 Tests) | `api/test/activityFeed.route.test.js` |

**Neu emittierte Ereignisse** (alle fire-and-forget, keiner kann einen Geschäftsvorgang
scheitern lassen):

| Ereignis | Ausgelöst in |
|---|---|
| `worker_replacement_assigned` (P1.1) | `POST /worker-assignment-links/:id/replace` |
| `timesheet_submitted/_approved/_rejected` (P2) | `routes/timesheets.js` |
| `timesheet_customer_confirmed/_rejected` (P2) | `POST /company/submissions/:id/confirm|reject` |
| `worker_blocked` / `worker_unblocked` (P3.3) | `POST/DELETE /company/blocklist` |
| `complaint_filed` (P3.2) | `POST /company/complaints` |
| `complaint_resolved` (P3.2) | `PATCH /workers/complaints/:id` (nur bei Abschluss) |
| `match_found` (P4.1) | `matchTriggerService` je Paarung |

### Zwei Befunde, die über den Plan hinausgingen

- **Org-Boundary-Leck (latent, jetzt geschlossen):** `GET /api/activity-feed` gab ohne
  Org-Kontext `org_id: null` an `queryEvents` — und das baute eine Abfrage **ohne WHERE**,
  also plattformweit über alle Mandanten. Solange die Tabelle leer war, fiel das nicht auf;
  mit den neuen Ereignissen wäre es ein echtes Leck geworden. Jetzt: ohne Org nur die
  eigenen Vorgänge (`actor_id`), mit Org strikt org-gebunden. Test deckt beide Fälle ab.
- **Doppelte Wahrheiten aufgelöst:** Label-/Icon-Tabellen lagen in `routes/activityFeed.js`
  *und* im Frontend; Deep-Links gab es zweimal (`matchTriggerService.deepLinkFor` und die
  Feed-Routen-Tabelle). Jetzt eine Quelle im Service, die anderen delegieren.

Ein neuer `notifications.type` war **nicht** nötig — die Ereignisse laufen über
`platform_events`, nicht über die Benachrichtigungstabelle. Falle 2 greift hier also nicht;
Falle 1 ist durch den Katalog-Test strukturell ausgeschlossen.

### Verifikation (2026-07-26)

- Volle Suite: **7419 Tests, 0 Fehler**. (Ein Lauf zeigte `me.route.coverage.test.js` rot —
  der in `docs/AUDIT_BACKLOG.md` als B-2 dokumentierte Flake; isoliert 65/65 grün, im
  Wiederholungslauf ebenfalls grün. Nicht durch diese Welle verursacht.)
- Live gegen die laufende App: Trigger → `platform_events`-Zeile `match_found` mit
  Beschriftung „Match gefunden" und Deep-Link auf das Angebot.
- Live: Match-Alarm wird zu „Auftrag: … — Pflegekraft, Kiel — Rolle „Pflegekraft" passt
  genau, …" mit Ziel-Link und Qualitätsstufe `excellent`.
- Testdaten restlos entfernt (`platform_events` wieder bei 0).

---

## Definition of Done je Welle (aus dem Audit, verbindlich)

1. **RBAC explizit** — jede neue Route mit `requirePermission` + `requireScope`.
2. **Whitelist nicht aufweitbar** — kein Query-Parameter öffnet mehr als der Default.
3. **Beziehungs-Nachweis** — UUID-Format ist kein Zugriffsrecht.
4. **Beide Richtungen** — Sender **und** Empfänger, kein toter Endpunkt.
5. **Verifikation:** volle Suite grün + Mutationstest der Kern-Assertion + DB-Smoke gegen
   echtes Schema + live gegen die laufende App.

## Reihenfolge und Aufwand

**4.1 → 4.2 → 4.4 → 4.3.** Bewusst so: 4.4 vor der KI, weil das Activity Center den Nutzen
von 4.1/4.2 überhaupt erst sichtbar macht — und weil die KI ohne die Baseline aus 4.2 nicht
bewertbar ist. **Stand 2026-07-26: alle vier Wellen sind gebaut.** 4.1, 4.2 und 4.4 sind aktiv; 4.3 liegt
fertig und abgeschaltet bereit und wartet auf zwei Owner-Entscheidungen (API-Schlüssel, Tarif-Zuordnung).

| Welle | Aufwand | Wirtschaftlicher Hebel |
|---|---|---|
| 4.1 Instant-Matching | mittel | **hoch** — Time-to-Fill, der Kern des Marktplatzes |
| 4.2 Match-Qualität | klein | hoch — Vertrauen, Baseline für 4.3 |
| 4.4 Activity Center | mittel | mittel — macht die Plattform „lebendig" |
| 4.3 KI-Ranking | groß | hoch, aber erst mit Baseline messbar |

**Owner-Entscheidung offen:** 4.3 verursacht laufende API-Kosten pro Match. Zu klären ist,
ob das KI-Ranking allen Plänen offensteht oder ein Entitlement höherer Tarife wird (Tier-3
der Config-Taxonomie) — das ist eine Preis-, keine Technikfrage. **Der Bau wurde davon
entkoppelt:** die Zuordnung ist eine Konfigurationszeile (`AI_MATCH_RANKING_MIN_PLAN`),
das Flag steht auf AUS, es entstehen bis zur Freigabe keine Kosten.
