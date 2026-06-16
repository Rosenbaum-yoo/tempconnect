# Plattformweiter Flow-Intuitivitäts-Sweep — Plan

> Owner-Auftrag (2026-06-15): „Gerne alle möglichen Flows intuitiver machen, plattformweit optimieren."
> Eigener Arbeitsstrang **neben** der Bug-Liste. Inkrementell, isolierte Commits pro Punkt.

---

## Leitprinzip

**Vorhandene Funktion dort sichtbar machen, wo der Nutzer sie braucht — und jede Sackgasse schließen.**

Der wiederkehrende Befund (siehe Belege unten): die Funktion ist fertig + getestet, aber **versteckt** (zu tief, falsche Seite, falscher Zeitpunkt, kein Link). Kein Neubau — **Discoverability + Verdrahtung**.

Maßstab pro Flow:
1. Sieht der Nutzer den **nächsten sinnvollen Schritt** ohne zu suchen?
2. Führt jede Karte/Liste/Benachrichtigung **direkt zum konkreten Ziel** (Detail/gefilterte Liste), nie auf eine generische Übersicht?
3. Hat jeder Leer-/Sperr-/Wartezustand eine **klare Handlungsaufforderung** (CTA) statt einer Sackgasse?
4. Sind **gemeinsame Elemente konsistent** (Topbar, Glocke, Suche, Profil) — gleiche Stelle auf jeder Seite?

---

## Methode (pro Kandidat)

1. **Triage** nach `finalization/SPECIAL_bugboard_triage.md` (Bug / Rollen-Sichtbarkeit / UX / Ausbau / Commercial). Intuitivität = meist **UX/Ausbau**.
2. **Am echten Code prüfen:** existiert die Zielfunktion/der Endpunkt schon? (Fast immer ja → nur verdrahten.)
3. **Minimaler Fix:** CTA/Deep-Link an der richtigen Stelle, rollen-/zustandsgegated, Design-System-Token, `esc()` bei dynamischem Text.
4. **Verifikation:** Inline-JS-Syntax grün, betroffene Tests grün; bei Login-Seiten Vorher/Nachher-Beleg oder eingeloggter Smoke.
5. **Isolierter Commit** je Punkt (`feat(...)`/`fix(...)`), Co-Author-Trailer, lokal (kein Push).

**Nicht-Ziele:** keine neue Backend-Logik ohne Owner-Freigabe, keine Redesigns, keine toten Platzhalter, kein Fake-Data.

---

## Audit-Dimensionen (wo systematisch gesucht wird)

| Dim | Frage | Typischer Fix |
|---|---|---|
| **D1 Next-Step-CTA** | Fehlt am Ende eines Schritts der Button zum nächsten? | Kontext-CTA (wie Deal→Arbeiter-zuweisen) |
| **D2 Deep-Links** | Verweisen Karten/Listen/Notifications aufs konkrete Ziel? | `link_path`/href auf Detail/gefilterte Liste |
| **D3 Empty/Lock/Wait** | Hat jeder Leer-/Sperr-/Wartezustand eine CTA? | Primär-CTA statt Sackgasse; Upgrade-Pfad bei Plan-Lock |
| **D4 Topbar-Konsistenz** | Glocke/Suche/Profil überall gleich + 1. Reihe? | zentral in pageShell/notifications |
| **D5 Buchbar=lieferbar** | Führt jede „buchbare" Karte real zum Flow? | Plan-Lock zeigt konkreten Upgrade-Pfad |
| **D6 Kernflow-Kette** | Requisition→Angebot→Deal→Einsatz→Stundenzettel lückenlos verlinkt? | Stufen-CTAs entlang der Kette |

---

## Backlog (priorisiert)

### ✅ Erledigt
- **D4 — Benachrichtigungsglocke in 1. Topbar-Zeile, plattformweit** (`54852af`). notifications.js hängte die Glocke unter die Suchzeile (Zeile 2) der gestackten pageShell-Topbar; jetzt in Zeile 1 vor dem Profil. Greift zentral für alle pageShell-Seiten.
- **D1/D6 — „Arbeiter zuweisen"-CTA direkt unter dem Deal-Fortschritt** (`ca40ba7`). 1-Klick-Zuweisung war im Staffing-Block versteckt; jetzt prominente Supplier-CTA, sobald Einsatz aktiv + Plätze offen.

### 🔜 Quick Wins (Discoverability, owner-unabhängig)
- **D6 — Kernflow-Stufen-CTAs durchziehen:** an jeder Stufe (Requisition→Angebot, Angebot→Deal, Deal→Einsatz, Einsatz→Stundenzettel) den Button zum nächsten realen Schritt zeigen (Muster wie Deal-CTA).
- **D2 — Notification-Deep-Links vollständig:** `notifications.js resolveLink` gegen alle aktiven Notification-Typen prüfen → unmaped Typen führen auf `activity.html` statt zum Ziel. Lücken schließen.
- **D3 — Empty-State-CTAs:** Listen mit „Noch keine Daten" bekommen einen Primär-CTA zum Anlegen/nächsten Schritt (Requisitions, Capacity, Vendor-Pool, Timesheets).
- **D2 — Hub-Karten (enterprise.html):** jede Karte zeigt auf die konkrete gefilterte Sicht, nicht auf eine Übersicht.

### 🔭 Größeres (eigene Runde, ggf. Workflow-Audit)
- **D4 — Topbar-Konsistenz-Audit** über alle 42 Seiten (Glocke/Suche/Profil; statische vs pageShell-Topbars angleichen; 8 Nicht-statische-Topbar-Seiten verifiziert pageShell).
- **D5 — „Buchbar=lieferbar"-Durchgang:** jede plan-gegatete Karte zeigt konkreten Upgrade-Pfad (kein generisches „nicht verfügbar").
- **D1/D3 — Plattformweiter CTA-/Sackgassen-Sweep:** systematischer Audit (Workflow: ein Reader je Seite) → strukturierte Fundliste → Stück für Stück verdrahten.

---

## Ausführung

- Läuft **parallel zur Bug-Liste**: Bug-Liste hat Vorrang (konkret gemeldet); Sweep-Punkte dazwischen, wenn sie einen gemeldeten Bug berühren.
- Der **größere CTA-/Sackgassen-Sweep** wird als eigener Workflow-Audit aufgesetzt, sobald die Bug-Liste durch ist (oder auf Owner-Zuruf): ein Read-Agent pro Seite findet existierende-aber-nicht-verlinkte Funktionen → diese Datei wird mit der Fundliste fortgeschrieben.
- Jeder erledigte Punkt wird hier abgehakt + Commit-Hash notiert.

*Stand: 2026-06-15 · Owner: Dennis · Umsetzung: Claude*
