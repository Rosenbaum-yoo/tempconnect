# Open Risks and Blockers — Phase 5

> Laufend gepflegt. Bei Stop-Regeln (00_RULES.md) hier eintragen statt nur im Chat.

| # | Blocker / Risiko | Auswirkung | Betroffene Kunden | Priorität | Lösungsvorschlag | Phase | Status |
|---|---|---|---|---|---|---|---|
| R1 | Voll-automatisches Stripe-Billing unvollständig (Subscriptions/Price-IDs, Stripe Invoicing Auto-Rechnung, SEPA, Dunning, Billing-Portal, idemp. invoice.paid/payment_failed) | Kein skalierbares Billing; manueller Aufwand wächst pro Kunde | alle zahlenden | P1 | BillingProviderService (stripe-Standard) + Webhook-Härtung; Owner setzt Keys/Price-IDs | D | teilweise: Slice 1 Provider-Abstraktion + Slice 2 SCC-Sicht + Slice 3 Dunning-Observability (Inkasso-Worklist + payment_failed-Naht) erledigt. **Sichtbarkeits-Hälfte geschlossen** (Operator sieht Provider-Status, Summen, überfällige Forderungen). Offen: payment-status→Lifecycle-Reaktivierung (Owner/Provider-abhängig) + echte Keys/Price-IDs (R2) |
| R2 | Stripe Keys/Price-IDs/SEPA/Tax/Billing-Portal fehlen (extern) | Auto-Billing nicht produktiv testbar → Gate 10 nicht grün | alle zahlenden | P1 (Owner) | Owner-Aufgabe (MANUAL_TASKS Phase D) | D | offen |
| R3 | Email: keine Provider-Abstraktion (console/smtp/sendgrid/disabled), kein @sendgrid/mail | Kein professioneller Versand/Bounce-Tracking; Gate 50 blockiert | alle | P2 | EmailProviderService; SMTP/console reicht für Gate 10 | E | **erledigt (Backend):** emailProviderService (resolve/describe, console/smtp/sendgrid/disabled) + emailService provider-fähig (SendGrid via SMTP-Relay, KEINE neue Dependency). 21/21 Tests. Default `console` = nur Logging. Offen: echte Keys (Owner/Gate-50) + optional describe() in Health-/SCC-Sicht surface |
| R4 | ~~Theme-System fehlt komplett~~ KORREKTUR: dark/light existierten bereits. Phase J **Block 1** ergänzt `ultra_premium` (auswählbar via Toggle-Cycle, Default unverändert, Flag-Gating, 9 Tests). **Offen (Block 2):** SCC Theme Control (Owner), per-Scope (platform/worker_portal/scc), env-Flags, Audit | Premium-Differenzierung jetzt sichtbar; Owner-Steuerung/Whitelabel noch offen | Premium/Enterprise | P2 | Block 2: ThemeControlService + SCC-Panel + envValidator (THEME_SWITCHER_ENABLED/ULTRA_PREMIUM_THEME_ENABLED) | J | Block 1 erledigt / Block 2 offen |
| R5 | Provider-Env-Modell (BILLING_PROVIDER/EMAIL_PROVIDER/INFRASTRUCTURE_PROVIDER/AI_OPS_ENABLED/THEME_SWITCHER_ENABLED) nicht in .env*.example | Inkonsistenz Doku↔Code; Feature-Flags fehlen | intern | P2 | Env-Schema + envValidator erweitern (additiv, Defaults sicher) | D/E/G/H/J | offen |
| R6 | Incident-Modell (incident_events/status/notes/notifications) Vollständigkeit unklar | Betrieb nicht voll beobachtbar | alle | P2 | Phase I prüfen/ergänzen (110_soc_phase3 als Basis) | I | zu prüfen |
| R7 | Hetzner-Action-Gating (keine destruktiven Aktionen) + AI Unsafe-Prompt-Classifier verifizieren | Sicherheitsrisiko bei Fehlkonfiguration | intern/Owner | P2 | Phase G/H Audit; Stop-Regel falls Gating fehlt | G/H | zu prüfen |
| R8 | Backup/Restore-Drill + Runbooks (docs/operations/) | Kein verifizierter Wiederherstellungspfad | alle | P2 (Owner) | Phase P; Restore-Drill mit Owner | P | offen |
| R9 | Finale Preise + Rechtstexte (DSGVO/AVV/AGB) fehlen (extern) | Kein rechtssicherer Marktstart | alle | P1 (Owner) | Owner/Anwalt (MANUAL_TASKS Phase C/N) | C/N | offen |

## Stop-Regel-Funde (00_RULES.md)
- Aktuell keine harten Stop-Regel-Verletzungen in Phase A festgestellt. R7 (Hetzner/AI-Gating) wird in Phase G/H gegen Stop-Regeln 2/3 geprüft.
