# Deal-Dokumente & Signaturen

## Übersicht

Jeder Deal erzeugt eine **Dealakte** (Dossier), die alle relevanten Dokumente bündelt:

- **Generierte Dokumente**: Konditionsblatt, Einsatzvereinbarung (HTML)
- **Hochgeladene Dokumente**: PDFs, Nachweise, Anlagen
- **Signatur-Metadaten**: Vorbereitete E-Signatur-Integration

## Dokument-Typen

| Typ | Source | Beschreibung |
|---|---|---|
| `conditions_sheet` | generated | Aktueller Verhandlungsstand (HTML-Konditionsblatt) |
| `agreement` | generated | Bindende Einsatzvereinbarung mit Konditions-Snapshot |
| `summary` | uploaded | Zusammenfassende Dokumente (vom Nutzer hochgeladen) |
| `amendment` | generated/uploaded | Nachträge zur Vereinbarung |
| `cancellation` | generated | Stornierungsdokument |

## Versionierung

Bei jedem Agreement-Lifecycle-Event werden automatisch neue Dokument-Records erzeugt:

1. **Vorherige Version** wird als `superseded` markiert
2. **Neue Version** erhält inkrementelle Versionsnummer
3. **Content-Hash** (SHA-256 der ersten 10 KB) ermöglicht Änderungserkennung

Status-Werte eines Dokument-Records:
- `current`: Aktuelle Version
- `superseded`: Durch neuere Version ersetzt
- `archived`: Archiviert

## Content-Hash

`computeContentHash(html)` erzeugt einen SHA-256-Hash über die ersten 10.240 Bytes des generierten HTML.
Gleicher Content → gleicher Hash. Wird gespeichert in `deal_documents.content_hash`.

Zweck:
- Änderungserkennung bei erneutem Generieren
- Audit-Trail: Nachweis, dass sich ein Dokument nicht verändert hat

## Dossier-Endpunkt

`GET /api/marketplace/offers/:id/dossier`

Liefert die vollständige Dealakte:

```json
{
  "offer_id": "uuid",
  "agreement_ref": "EV-2026-000042",
  "agreement_status": "confirmed",
  "agreement_version": 2,
  "demand_title": "CNC-Operator Hamburg",
  "requester_company_name": "Nordbau GmbH",
  "supplier_company_name": "TechStaff AG",
  "signature": {
    "required": true,
    "status": "pending",
    "signed_at": null,
    "signed_by_party_a": null,
    "signed_by_party_b": null,
    "provider": "docusign",
    "reference": "sigprep-abc12345-1711900000000"
  },
  "documents": {
    "generated": [...],
    "uploaded": [...],
    "attachments": [...]
  },
  "document_count": 5,
  "timeline": [
    { "action": "deal.agreement_created", "actor_id": "uuid", "at": "2026-04-01T10:00:00Z", "details": {...} },
    { "action": "deal.agreement_confirmed", "actor_id": "uuid", "at": "2026-04-02T08:30:00Z", "details": {...} }
  ],
  "confirmed_at": "2026-04-02T08:30:00Z",
  "activated_at": null,
  "assignment_id": null
}
```

### Dokument-Objekt (generiert)

```json
{
  "id": "uuid",
  "offer_id": "uuid",
  "document_type": "agreement",
  "version": 2,
  "title": "Einsatzvereinbarung EV-2026-000042",
  "source": "generated",
  "content_hash": "a1b2c3...64hex",
  "generated_by": "uuid",
  "generated_by_email": "user@example.com",
  "generated_at": "2026-04-01T10:00:00Z",
  "status": "current",
  "agreement_ref": "EV-2026-000042",
  "agreement_version": 2
}
```

### Dokument-Objekt (hochgeladen)

```json
{
  "id": "uuid",
  "offer_id": "uuid",
  "document_type": "summary",
  "version": 1,
  "title": "Sicherheitsnachweis.pdf",
  "source": "uploaded",
  "asset_id": "uuid",
  "asset_file_path": "uploads/offers/abc/1234.pdf",
  "asset_original_name": "Sicherheitsnachweis.pdf",
  "asset_mime_type": "application/pdf",
  "status": "current"
}
```

## Dokument-Upload

`POST /api/offer-assets/:offerId/upload` mit `asset_type: "deal_document"`.

- Erlaubte Dateitypen: PDF, PNG, JPG, WEBP (max. 5 MB)
- Bei Deal-Uploads (`marketplace_offer_id` gesetzt) wird automatisch ein `deal_documents`-Record erzeugt und verknüpft
- Beide Deal-Parteien (Requester + Supplier) dürfen Dokumente hochladen
- Löschung entfernt den `deal_documents`-Record mit

## Dokument-Download

| Endpunkt | Beschreibung |
|---|---|
| `GET /offers/:id/document?type=conditions` | HTML-Konditionsblatt (aktueller Verhandlungsstand) |
| `GET /offers/:id/document?type=agreement` | HTML-Einsatzvereinbarung (Snapshot-basiert) |
| Asset-URL (`/uploads/offers/...`) | Hochgeladene Dateien |

Die generierten HTML-Dokumente enthalten:
- Alle Bedarfs- und Konditionsfelder
- Vertragsparteien
- Zuschläge, Stornierungsbedingungen, besondere Vereinbarungen
- Signaturstatus und -provider
- Signaturblock mit Platzhaltern für beide Parteien

## Signaturfähigkeit

### Aktueller Scope: Vorbereitung

Die E-Signatur-Integration ist als **Adapter-Schnittstelle** vorbereitet, aber noch ohne Provider-Anbindung.

`POST /offers/:id/prepare-signature` setzt:
- `signature_required = true`
- `signature_status = 'pending'`
- `signature_provider` (z.B. "docusign", "yousign", oder "prepared")
- `signature_reference` (externe Referenz-ID oder Auto-Referenz)

### Signatur-Status-Modell

| Status | Bedeutung |
|---|---|
| `not_required` | Keine E-Signatur erforderlich |
| `pending` | Signaturstrecke vorbereitet, Signatur ausstehend |
| `partially_signed` | Eine Partei hat signiert |
| `fully_signed` | Beide Parteien haben signiert |
| `failed` | Signatur fehlgeschlagen |
| `expired` | Signatur-Frist abgelaufen |

### Voraussetzung

- Agreement muss im Status `confirmed` sein
- Nur der Requester darf die Signaturstrecke vorbereiten
- Idempotent: Erneuter Aufruf bei bereits vorbereiteter Signatur gibt `{ idempotent: true }` zurück

### Spätere Provider-Integration

Die Felder `signature_provider` und `signature_reference` sind so gestaltet, dass eine echte Provider-Integration (DocuSign, Yousign, Adobe Sign) andocken kann:

1. `prepare-signature` setzt Provider + externe Referenz
2. Provider-Webhook aktualisiert `signature_status` (partially_signed → fully_signed)
3. `signed_by_party_a` / `signed_by_party_b` + `signed_at` werden gesetzt

## Datenbank

### deal_documents

```sql
CREATE TABLE deal_documents (
  id UUID PRIMARY KEY,
  offer_id UUID NOT NULL REFERENCES offers(id),
  document_type TEXT NOT NULL,  -- conditions_sheet | agreement | summary | amendment | cancellation
  version INT NOT NULL DEFAULT 1,
  title TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'generated',  -- generated | uploaded
  content_hash TEXT,
  asset_id UUID REFERENCES offer_assets(id),
  generated_by UUID REFERENCES users(id),
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'current',  -- current | superseded | archived
  agreement_ref TEXT,
  agreement_version INT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Signatur-Felder auf offers

```sql
ALTER TABLE offers ADD COLUMN signature_required BOOLEAN DEFAULT FALSE;
ALTER TABLE offers ADD COLUMN signature_status TEXT;  -- not_required | pending | partially_signed | fully_signed | failed | expired
ALTER TABLE offers ADD COLUMN signed_at TIMESTAMPTZ;
ALTER TABLE offers ADD COLUMN signed_by_party_a UUID;
ALTER TABLE offers ADD COLUMN signed_by_party_b UUID;
ALTER TABLE offers ADD COLUMN signature_provider TEXT;
ALTER TABLE offers ADD COLUMN signature_reference TEXT;
```

### offer_assets-Erweiterung

```sql
ALTER TABLE offer_assets ADD COLUMN marketplace_offer_id UUID REFERENCES offers(id);
ALTER TABLE offer_assets ADD COLUMN deal_document_id UUID REFERENCES deal_documents(id);
```

## Timeline / Audit

Folgende Events erscheinen in der Dealakte-Timeline:

| Action | Beschreibung |
|---|---|
| `deal.agreement_created` | Agreement erstellt |
| `deal.agreement_confirmed` | Agreement bestätigt |
| `deal.agreement_activated` | Einsatz aktiviert |
| `deal.agreement_cancelled` | Agreement storniert |
| `deal.agreement_expired` | Agreement abgelaufen |
| `deal.agreement_signature_prepared` | Signaturstrecke vorbereitet |
| `offer_asset.upload` | Dokument hochgeladen |
| `offer_asset.delete` | Dokument entfernt |
| `state_machine.transition` | Allgemeiner Statusübergang |

## Tests

- `test/dealClosureComplete.test.js`: Signatur-Rendering, Dokument-Randfälle, XSS-Safety
- `test/dealAgreementEnterprise.test.js`: Content-Hash, Dossier-Struktur
- `test/dealAgreement.test.js`: Basis-Dokument-Rendering
