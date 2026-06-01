# Deal-Closure Workflow

## Übersicht

Der Deal-Closure-Workflow deckt den gesamten Lebenszyklus eines Marketplace-Deals ab:
von der Angebotserstellung über Verhandlung, Einsatzvereinbarung und Aktivierung bis zum Assignment.

Zwei Domänen arbeiten zusammen:

- **Offer-Lifecycle** (`stateMachine.js: OFFER`): `draft → sent ↔ countered → accepted | rejected | withdrawn`
- **Agreement-Lifecycle** (`stateMachine.js: AGREEMENT`): `none → pending_confirmation → confirmed → activated | cancelled | expired`

Die Bridge: Sobald ein Offer `accepted` ist, kann der Requester eine Einsatzvereinbarung (Agreement) erstellen.

## Offer-Lifecycle

```
draft ──→ sent ──→ accepted (terminal)
  │         │  ↔ countered
  │         └──→ rejected (terminal)
  └──→ withdrawn (terminal)
```

| Status | Bedeutung | Nächste Aktion |
|---|---|---|
| `draft` | Entwurf | Supplier: Angebot senden |
| `sent` | Gesendet an Requester | Requester: Annehmen, Ablehnen oder Gegenangebot |
| `countered` | Gegenangebot erstellt | Supplier: Neues Angebot senden |
| `accepted` | Konditionen angenommen | Requester: Agreement erstellen |
| `rejected` | Abgelehnt (terminal) | — |
| `withdrawn` | Zurückgezogen (terminal) | — |

## Agreement-Lifecycle

```
none ──→ pending_confirmation ──→ confirmed ──→ activated (terminal)
                │                     │
                ├──→ cancelled         ├──→ cancelled
                └──→ expired
```

| Status | Bedeutung | Wer muss handeln |
|---|---|---|
| `none` | Kein Agreement vorhanden | Requester: `create-agreement` |
| `pending_confirmation` | Agreement erstellt, Gegenseite muss bestätigen | Supplier: `confirm-agreement` |
| `confirmed` | Bestätigt, Aktivierung möglich | Requester: `activate` |
| `activated` | Einsatz aktiv, Assignment erzeugt | Terminal |
| `cancelled` | Storniert (von beiden Seiten möglich) | Terminal |
| `expired` | Automatisch abgelaufen (Timeout) | Terminal |

### State-Machine-Guards

Jeder Statusübergang wird durch `assertTransition("AGREEMENT", from, to)` in `stateMachine.js` abgesichert.
Ungültige Transitionen werfen `TransitionError`.

Erlaubte Transitionen:

- `none` → `pending_confirmation`
- `pending_confirmation` → `confirmed`, `cancelled`, `expired`
- `confirmed` → `activated`, `cancelled`
- `activated`, `cancelled`, `expired` → *keine* (terminal)

## Counterparty-First: Wer ist am Zug?

`getActionRequired(offer, viewerUserId)` gibt den aktuellen Handlungsbedarf zurück:

| Viewer-Rolle | Offer sent | Countered | accepted + none | pending_confirmation | confirmed | activated |
|---|---|---|---|---|---|---|
| Requester | `action_required` | `waiting` | `action_required` | `waiting` | `action_required` | `completed` |
| Supplier | `waiting` | `action_required` | `waiting` | `action_required` | `waiting` | `completed` |
| Dritte | `none` | `none` | `none` | `none` | `none` | `completed` |

Terminal-Status (`rejected`, `withdrawn`, `cancelled`, `expired`) geben immer den entsprechenden Status zurück, unabhängig vom Betrachter.

## API-Endpunkte

Alle unter `/api/marketplace/...`, geschützt mit `requireAuth` + `sla_access`.

| Methode | Pfad | Berechtigung | Beschreibung |
|---|---|---|---|
| `GET` | `/offers/:id/detail` | Requester oder Supplier | Agreement-Details + action_required |
| `POST` | `/offers/:id/create-agreement` | Nur Requester | Agreement erstellen |
| `POST` | `/offers/:id/confirm-agreement` | Nur Supplier | Agreement bestätigen |
| `POST` | `/offers/:id/activate` | Nur Requester | Einsatz aktivieren → Assignment |
| `POST` | `/offers/:id/cancel-agreement` | Requester oder Supplier | Agreement stornieren |
| `POST` | `/offers/:id/prepare-signature` | Nur Requester | Signatur-Metadaten vorbereiten |
| `GET` | `/offers/:id/document` | Requester oder Supplier | HTML-Dokument (Konditionsblatt oder Vereinbarung) |
| `GET` | `/offers/:id/dossier` | Requester oder Supplier | Vollständige Dealakte |
| `GET` | `/deals/:id/progress` | Authentifiziert | Deal-Fortschritt |

### Ownership-Validierung

Alle Agreement-Endpunkte prüfen, ob der eingeloggte User `requester_company_id` oder `supplier_company_id` ist.
Erstellen und Aktivieren darf nur der Requester, Bestätigen nur der Supplier.
Stornieren dürfen beide Parteien.

### Idempotenz

- `activate`: Wenn bereits ein Assignment existiert (`offer.assignment_id`), wird `ALREADY_ACTIVATED` zurückgegeben statt ein zweites Assignment zu erzeugen.
- `create-agreement`: State-Machine-Guard verhindert doppelte Erstellung.

## Deal-Progress

`getOfferDealProgress(offer)` kombiniert Offer- und Agreement-Status:

| Phase | Status | Progress |
|---|---|---|
| Negotiation | draft | 5% |
| Negotiation | sent | 20% |
| Negotiation | countered | 30% |
| Negotiation | accepted (ohne Agreement) | 50% |
| Agreement | pending_confirmation | 60% |
| Agreement | confirmed | 75% |
| Agreement | activated | 100% |
| Terminal | rejected, withdrawn | 0% |
| Terminal | cancelled, expired | 0% |

## Notdienst-Sofortpfad

Für Emergency-Deals (`urgency: notdienst`) gilt ein verkürzter Pfad:

1. Provider Commitment → Sofortvereinbarung erstellen
2. Gegenseite bestätigt → Sofort bestätigen
3. Einsatz aktivieren → Dispatch

Die UI in `offer_detail.html` zeigt dafür einen spezialisierten Fortschrittsbalken.

## Audit & Notifications

Jeder Agreement-Schritt erzeugt:
- Einen `audit_log`-Eintrag mit `action: deal.agreement_*`
- Einen `state_machine.transition`-Eintrag über `logTransition()`
- Eine `notificationMatrix.dispatch()`-Nachricht an die Gegenseite

Alle Events werden in der Dealakte-Timeline angezeigt.

## Datenbank

### Relevante Tabellen

- `offers`: Kernfelder `agreement_status`, `agreement_ref`, `agreement_snapshot`, `agreement_version`, `confirmed_by/at`, `activated_at/by`, `assignment_id`, `signature_*`
- `deal_documents`: Metadaten für generierte und hochgeladene Dokumente
- `offer_assets`: Hochgeladene Dateien mit `marketplace_offer_id` für Deal-Uploads
- `audit_log`: Alle Agreement-Events

### Relevante Migrationen

- `083_deal_agreement_flow.sql`: Agreement-Felder auf offers, Sequence
- `084_deal_documents_and_signatures.sql`: deal_documents, Signatur-Felder, offer_assets-Erweiterung

## Tests

- `test/dealAgreement.test.js`: Basis-Tests (action_required, Dokument-Rendering)
- `test/dealAgreementEnterprise.test.js`: State Machine, Cancel/Expire, Progress, Content-Hash
- `test/dealClosureComplete.test.js`: Exhaustive Tests (OFFER-Transitions, Terminal-Guards, XSS, Signatur-Rendering, Edge Cases)
