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

## Welle 4.1 — Bidirektionales Instant-Matching

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

## Welle 4.2 — Match-Qualität sichtbar machen (vor der KI!)

**Bewusst vor 4.3 gezogen.** Ein Ranking ohne erklärbare Grundlage ist eine Blackbox, der
niemand vertraut — und ohne deterministische Basis lässt sich später nicht messen, ob die
KI überhaupt besser ist.

- **Score-Zerlegung** statt einer Zahl: Skill-Deckung, Verfügbarkeit, Entfernung, Preisrahmen,
  Historie — jede Achse einzeln sichtbar.
- **Begründung im Klartext**, deterministisch erzeugt: „3 von 4 geforderten Skills, ab sofort
  verfügbar, 18 km entfernt."
- Damit existiert eine **Baseline**, gegen die 4.3 antreten muss.

## Welle 4.3 — KI-Augmentierung als Ranking-Schicht (Claude API)

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

## Welle 4.4 — Activity Center voll verdrahten

Jede relevante Aktion aus P1–P3 erzeugt ein Activity-Event — der Ripple aus den fertigen
Wellen wird eingespeist (Ersatz zugewiesen, Zettel freigegeben, Kraft gesperrt, Beschwerde
gemeldet/erledigt, Match gefunden).

**Die zwei Fallen, die hier dokumentiert sind und beachtet werden müssen:**
1. `dispatch()` ohne Eintrag in `notificationMatrix` scheitert **still** („Unknown event").
2. Ein neuer `notifications.type` ohne Eintrag im CHECK-Constraint lässt den INSERT
   **still** scheitern → neue Migration ist Pflicht.

Beides ist in `SKILL.md` als harte Lehre vermerkt und hat schon einmal ein komplett totes
Feature erzeugt (`createRatingsRouter` war nie gemountet).

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
bewertbar ist.

| Welle | Aufwand | Wirtschaftlicher Hebel |
|---|---|---|
| 4.1 Instant-Matching | mittel | **hoch** — Time-to-Fill, der Kern des Marktplatzes |
| 4.2 Match-Qualität | klein | hoch — Vertrauen, Baseline für 4.3 |
| 4.4 Activity Center | mittel | mittel — macht die Plattform „lebendig" |
| 4.3 KI-Ranking | groß | hoch, aber erst mit Baseline messbar |

**Owner-Entscheidung offen:** 4.3 verursacht laufende API-Kosten pro Match. Vor dem Bau
gehört geklärt, ob das KI-Ranking allen Plänen offensteht oder ein Entitlement höherer
Tarife wird (Tier-3 der Config-Taxonomie) — das ist eine Preis-, keine Technikfrage.
