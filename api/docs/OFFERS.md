# Offers / Gegenangebote (Counterparty-First)

TempConnect behandelt ein Angebot primär als **Aufgabe für die Gegenseite**.
Die sendende Partei sieht Verlauf/Monitoring, die empfangende Partei sieht **Handlung**.

## Statusmodell (fachlich)

- `draft` (Supplier/Agency): Entwurf, **editierbar**, noch nicht bei der Gegenseite sichtbar.
- `sent` (Requester/Company): Gegenseite ist am Zug (annehmen/ablehnen/gegenangebot).
- `countered` (Supplier/Agency): Supplier ist am Zug (neu senden oder zurückziehen).
- `accepted` (terminal): abgeschlossen, Folgeprozess startet (Assignment/Deal-Linkage).
- `rejected` (terminal): abgeschlossen, keine Aktionen mehr.
- `withdrawn` (terminal): abgeschlossen, keine Aktionen mehr.

## “Wer ist am Zug?” (Next-Actor)

Serverseitig wird pro Offer für den aktuellen Viewer ein `next_action` Objekt berechnet (siehe `computeOfferNextAction()`).

Mapping:

- `draft` → `actor_required = supplier`
- `sent` → `actor_required = requester`
- `countered` → `actor_required = supplier`
- `accepted|rejected|withdrawn` → `actor_required = none`

Viewer-State:

- `action_required`: du bist am Zug (CTAs sichtbar)
- `waiting_on_counterparty`: Gegenseite ist am Zug
- `closed`: terminal

## API Endpoints (relevant)

- `GET /api/marketplace/my-offers` (Supplier View)
  - Liefert Offers als Sender inkl. `next_action`.
- `GET /api/marketplace/received-offers` (Requester View)
  - Liefert Offers als Empfänger inkl. `next_action`.
  - Sortierung: `action_required` zuerst, dann neueste `updated_at/created_at`.

Transitions:

- `PATCH /api/marketplace/offers/:id/status` mit `status ∈ { sent, accepted, rejected }`
  - Guards: `sent|withdrawn` nur Supplier, `accepted|rejected|countered` nur Requester.
  - Fehlercodes: `409 INVALID_TRANSITION`, `403 FORBIDDEN`.
- `POST /api/marketplace/offers/:id/accept`
  - Dedicated Accept-Endpoint (Requester), triggert Folgeprozess (Assignment).
- `POST /api/marketplace/offers/:id/counter`
  - Requester setzt Status `countered` (Gegenangebot / Notes).
- `POST /api/marketplace/offers/:id/withdraw`
  - Supplier zieht Angebot zurück.

## UI Regeln (Counterparty-First)

In `angebote_verwalten.html`:

- Default-Fokus ist **Erhaltene Angebote** (Aktion erforderlich zuerst).
- CTAs werden ausschließlich angezeigt, wenn `next_action.actions` diese Aktion erlaubt.
- “Aktion erforderlich” wird deutlich als Badge angezeigt.

## Notifications / Activity

Notifications sind counterparty-first:

- `offer.received`: an die Partei, die jetzt entscheiden muss (Empfänger).
- `offer.accepted|offer.rejected`: an Supplier (Sender) als Ergebnis-Feedback.

Hinweis: Dispatch ist dedupliziert (1h Fenster) und preference-aware.

