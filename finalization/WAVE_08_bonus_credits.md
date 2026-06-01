# WAVE_08 — Bonus, Referral, Bounty und Credits

> **Phase:** Commercial. **Prio:** P1/P2. **Voraussetzung:** WAVE_02 (Commercial SSOT).

---

## Ziel

Bonus- und Wachstumsmechaniken sind kaufmännisch kontrolliert, auditierbar und missbrauchssicher. **Credits dürfen MRR/ARR nicht verfälschen.**

---

## 1. Referral

- Referral-Code eindeutig pro Nutzer
- Qualifizierung NUR nach bezahltem Abo ODER klar definierter Aktivierungsregel
- Limits: maximale Rewards, maximal pro Monat, Missbrauchsschutz
- Status: `invited`, `signed_up`, `trial`, `paid`, `qualified`, `rewarded`, `rejected`
- Staff-Review bei hohen Rewards (Schwellwert definieren)

## 2. Bounty / Loyalty

- Tier-Logik dokumentieren
- Discount-Caps erzwingen (z. B. max. 30 % kumuliert)
- Keine unbegrenzte Rabattkaskade (Coupon + Bounty + Loyalty stapelt nicht beliebig)
- Kombination mit Add-ons / Custom Plans klar geregelt

## 3. Credits

- **Ledger-Prinzip:** jede Gutschrift und Belastung als Transaktion
- Keine negative Balance ohne explizite Regel
- Refund- / Chargeback- / Expiration-Logik klären
- **Credits dürfen MRR/ARR-Berechnung nicht verfälschen** (separate Konten oder explizite Ausweisung)
- Billing-Auswirkung dokumentieren

---

## Akzeptanzkriterien

- [ ] Keine Bonuszahlung ohne qualifizierendes Ereignis
- [ ] Credits sind auditierbar (Ledger nachvollziehbar)
- [ ] Rabatte sind gedeckelt (kein unlimited)
- [ ] Staff kann Missbrauch prüfen
- [ ] Referral- / Bounty- / Credit-Daten erscheinen nur für erlaubte Rollen
- [ ] Cross-Tenant-Test: Vendor A sieht Bounty von Vendor B → nein

---

## Stop-Regeln

- Negative Balance möglich ohne Regel → STOP
- Unbegrenzte Rabattkaskade → STOP, Caps definieren
- Credits in MRR enthalten ohne Markierung → STOP, P1

---

## Betroffene Dateien

- `frontend/public/bounties.html`
- `api/routes/...` (Referral / Bounty / Credit-Routes identifizieren)
