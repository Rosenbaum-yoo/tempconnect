# Stripe – Echte Zahlungen vorbereiten

Das Backend ist für echte Stripe-Zahlungen (Checkout, Abo, Webhooks) vorbereitet. Ohne gesetzte Stripe-Keys läuft weiterhin der **Demo-Modus** (keine echten Zahlungen).

---

## 1) Umgebungsvariablen

| Variable | Pflicht für Stripe | Beschreibung |
|----------|--------------------|--------------|
| `STRIPE_SECRET_KEY` | Ja | Geheimer API-Schlüssel (z. B. `sk_live_...` oder `sk_test_...`) |
| `STRIPE_PUBLISHABLE_KEY` | Ja | Öffentlicher Schlüssel fürs Frontend (z. B. `pk_live_...` / `pk_test_...`) |
| `STRIPE_WEBHOOK_SECRET` | Ja (für Webhook) | Signatur-Geheimnis vom Stripe Dashboard (Webhook-Endpunkt hinzufügen) |
| `STRIPE_SUCCESS_URL` | Nein | Redirect nach erfolgreicher Zahlung. Default: `{BASE_URL}/public/sla_abo.html?payment=success&session_id={CHECKOUT_SESSION_ID}` |
| `STRIPE_CANCEL_URL` | Nein | Redirect bei Abbruch. Default: `{BASE_URL}/public/sla_abo.html?payment=cancelled` |
| `BASE_URL` | Empfohlen | Basis-URL der App (z. B. `https://app.tempconnect.de`) für Redirects und E-Mails |
| `PAYMENT_MODE` | Nein | `demo` (Standard) oder `live` – bei gesetztem `STRIPE_SECRET_KEY` wird Stripe trotzdem angeboten, wenn der User „Stripe“ wählt |

**Beispiel `.env` (Test):**

```env
BASE_URL=https://localhost:8080
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_SUCCESS_URL=https://localhost:8080/public/sla_abo.html?payment=success&session_id={CHECKOUT_SESSION_ID}
STRIPE_CANCEL_URL=https://localhost:8080/public/sla_abo.html?payment=cancelled
```

---

## 2) Stripe Dashboard

1. **API Keys** (Developers → API Keys): Secret Key und Publishable Key kopieren.
2. **Produkte/Preise**: Das Backend erzeugt beim Checkout dynamisch ein Abo mit `price_data` (BASIS 150 EUR, PLUS 499 EUR, NOTDIENST 999 EUR/Monat). Es sind **keine** vorangelegten Products in Stripe nötig.
3. **Webhook** (Developers → Webhooks):
   - Endpunkt-URL: `https://<deine-domain>/api/payment/webhook/stripe`
   - Events: `checkout.session.completed`, `customer.subscription.deleted`
   - Nach dem Anlegen das **Signing Secret** (`whsec_...`) als `STRIPE_WEBHOOK_SECRET` setzen.

---

## 3) Ablauf

- **Checkout**: User wählt Plan (BASIS/PLUS/NOTDIENST) und „Kreditkarte / SEPA / …“ → Backend erstellt eine Stripe Checkout Session (mode: subscription) und liefert `redirect_url` → Frontend leitet auf Stripe weiter.
- **Nach Zahlung**: Stripe leitet auf `STRIPE_SUCCESS_URL` um; **gleichzeitig** sendet Stripe das Event `checkout.session.completed` an den Webhook.
- **Webhook**:
  - `checkout.session.completed`: Plan in `subscriptions` eintragen, Payment-Session auf `completed` setzen, `stripe_subscription_id` speichern, Bestätigungs-Mail senden.
  - `customer.subscription.deleted`: User anhand `stripe_subscription_id` finden und Plan auf **FREE** setzen (Kündigung).

Ohne `STRIPE_WEBHOOK_SECRET` antwortet der Webhook mit `400 WEBHOOK_SECRET_REQUIRED` – für echte Zahlungen muss der Secret gesetzt sein.

---

## 4) Datenbank

Migration **017_stripe_subscription_id** legt die Spalte `payment_sessions.stripe_subscription_id` an (für Kündigungs-Webhook). Migrations wie gewohnt ausführen (z. B. beim Start oder manuell).

---

## 5) Lokal testen mit Stripe CLI

```bash
stripe listen --forward-to localhost:3000/api/payment/webhook/stripe
```

Stripe gibt ein temporäres `whsec_...` aus; dieses als `STRIPE_WEBHOOK_SECRET` setzen (nur für diese Session). Test-Karten: https://stripe.com/docs/testing#cards .
