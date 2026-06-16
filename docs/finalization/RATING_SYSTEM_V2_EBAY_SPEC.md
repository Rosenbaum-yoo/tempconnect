# Deal-Feedback v2 — eBay-modelliertes, transaktions-verankertes Bewertungssystem

> Owner-Auftrag (2026-06-15): „Guck dir eBay-Bewertungen an, übertrage es, zukunftssicher, alle Risiken gegen Stärken gehedged, professionell, alle logischen Schritte."
> Architektur — Owner-freigegeben. Additiv (Legacy-Ratings bleiben unangetastet). Rollback je Phase trivial.

---

## 1. Ist-Zustand (Audit 2026-06-15)

| Teil | Stand |
|---|---|
| Legacy-Ratings (`ratings`, `request_id` NOT NULL, user↔user, 4 Achsen, Moderation, Reputation/Grade, `ratingModal.js`, Prompt in `deal_management.html`, Profilanzeige) | ✅ vollständig — **aber nur für den Legacy-`requests`-Flow** (`capacityService` setzt `requests.status='FINALIZED'`) |
| Marktplatz-Deals (`offers`/`assignments`/`dealAgreementService`) bewertbar | ❌ **nein** — `assignments` haben kein `request_id`; `completeAssignment` setzt nie Rating-Eligibility |
| Lieferant aus Deal → Pool (`POST /vendor-pool/from-deal/:offerId`) | ✅ Endpoint — ❌ kein UI-Button |

**Kernlücke:** Die echten Deals (Marktplatz) sind nicht bewertbar. Das Legacy-Ratingmodell (user↔user, FK auf `requests`) passt nicht auf org↔org-Assignments.

---

## 2. eBay-Modell → TempConnect (Mapping)

| eBay | TempConnect v2 |
|---|---|
| Transaktion/Order = Feedback-Anker | **Abgeschlossenes Assignment** (`assignments.status='completed'`) = die „Transaktion" |
| Käufer ↔ Verkäufer (beidseitig) | **Unternehmen (`org_id`) ↔ Lieferant (`supplier_org_id`)**, ausgeführt von einem `actor_user_id` |
| Gesamt: positiv / neutral / negativ | `sentiment` ENUM (`positive`/`neutral`/`negative`) |
| Detailbewertungen (DSRs, 1–5) | Dimensionen 1–5 — **rollenabhängig**: Lieferant→{zuverlässigkeit, kommunikation, qualität, termintreue}; Unternehmen→{briefing_klarheit, kommunikation, zahlungsmoral, fairness} |
| Kommentar + öffentliche Antwort | `comment` (≤500) + **eine** `reply` der bewerteten Seite |
| **Mutual-blind** (beide blind bis beide abgegeben/Frist) | **Anti-Retaliation-Kern** (s. §4) |
| Feedback-Score / % positiv | Aggregat in `supplier_reputation` (besteht) + spiegelbildlich `org_reputation` (neu, für Unternehmensseite) |
| Zeitfenster | Abgabe nur in **N Tagen nach Abschluss** (Default 60), Reveal-Frist 14 Tage |
| Moderation | Wiederverwendung `profile_review_moderation` + `contentModerationService` |

---

## 3. Datenmodell (additiv, neue Tabelle)

`deal_feedback` — verankert an der Transaktion, nicht am Legacy-`request`:

```
deal_feedback (
  id              UUID PK
  assignment_id   UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE   -- die Transaktion
  direction       TEXT NOT NULL CHECK (direction IN ('company_to_supplier','supplier_to_company'))
  rater_org_id    UUID NOT NULL          -- bewertende Org
  rated_org_id    UUID NOT NULL          -- bewertete Org
  actor_user_id   UUID NOT NULL REFERENCES users(id)  -- wer konkret abgab (Audit)
  sentiment       TEXT NOT NULL CHECK (sentiment IN ('positive','neutral','negative'))
  dimensions      JSONB NOT NULL DEFAULT '{}'         -- {zuverlaessigkeit:5, ...} rollenabhängig, 1–5
  comment         TEXT CHECK (char_length(comment) <= 500)
  reply           TEXT CHECK (char_length(reply) <= 500)            -- Antwort der Gegenseite
  reply_at        TIMESTAMPTZ
  status          TEXT NOT NULL DEFAULT 'submitted'   -- submitted -> (revealed | withheld)
  revealed_at     TIMESTAMPTZ
  moderation      TEXT NOT NULL DEFAULT 'pending'     -- pending|approved|rejected|flagged
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  UNIQUE (assignment_id, direction)                   -- max. 1 Feedback je Richtung je Deal
)
```
Indizes: `(rated_org_id, moderation, revealed_at)`, `(assignment_id)`, `(actor_user_id)`.
Rollback: `DROP TABLE deal_feedback`. Legacy `ratings` bleibt unberührt.

**Warum org-level + actor_user:** Assignments sind org↔org; eBay-Feedback gehört der Org-Reputation, aber wer es abgab, ist auditierbar. Zukunftssicher für Multi-User-Orgs.

---

## 4. Mutual-blind Reveal (der zentrale Risiko-Hedge)

eBay-Mechanik gegen Rache-Bewertungen:
1. Beide Seiten geben Feedback ab → `status='submitted'`, **nicht öffentlich**.
2. Sobald **beide** Richtungen vorliegen → beide werden **gleichzeitig** `revealed` (nach Moderation).
3. Gibt nur eine Seite ab → bleibt verborgen bis **Reveal-Frist** (14 Tage nach erster Abgabe) → dann wird die vorhandene Seite `revealed` (die andere verfällt → `withheld`).
4. Vor Reveal sieht die Gegenseite **nicht**, was/ob bewertet wurde → keine Vergeltung möglich.

Umsetzung: rein zeit-/zustandsgesteuert (Cron-Sweep `reveal-due-feedback` + Reveal-on-second-submit). Keine Race-Conditions via `withTransaction` + `SELECT … FOR UPDATE` auf das Assignment-Paar.

---

## 5. Risiko → Stärke (Hedges)

| Risiko | Hedge |
|---|---|
| Rache-/Druck-Bewertungen | Mutual-blind Reveal (§4) |
| Fake-Bewertungen ohne echten Deal | Nur bei `assignments.status='completed'`, je Richtung 1× (UNIQUE), nur Deal-Parteien |
| Beleidigung/Spam | `contentModerationService` Auto-Flag + Staff-Moderation (bestehend) vor Reveal |
| Veraltete Bewertungen | Abgabefenster (60 T) + Reveal-Frist (14 T) |
| Einseitige Org-Macht | Beidseitig (company↔supplier) symmetrisch + öffentliche Antwort |
| Gaming der Reputation | Aggregat nur aus `revealed`+`approved`; gewichtet nach Recency + Deal-Volumen |
| Datenschutz | Org-Reputation öffentlich, `actor_user_id` nur intern/Audit |
| Lock-in/Migration | Additiv; Legacy-Ratings laufen weiter; v2 für Marktplatz-Deals |

---

## 6. Phasenplan (inkrementell, je Phase Tests + isolierter Commit)

- **P1 — Fundament:** Migration `deal_feedback` + `dealFeedbackService` (eligibility aus completed assignment, submit, getPending, getForOrg) + Eligibility-Hook in `completeAssignment`. Tests: eligibility, UNIQUE, participant-only, window.
- **P2 — Mutual-blind:** Reveal-on-second-submit + Cron-Sweep `reveal-due-feedback` + `withTransaction`-Sicherung. Tests: blind bis beide/Frist, withheld-Pfad.
- **P3 — UI Abgabe + Anzeige:** `dealFeedbackModal` (sentiment + rollenabhängige Dimensionen + Kommentar), Post-Deal-CTA auf `offer_detail.html` („Jetzt bewerten") + „Offene Bewertungen" erweitern, Anzeige auf Profil/Scorecard.
- **P4 — Antwort:** öffentliche Reply der bewerteten Seite (1×), Moderation.
- **P5 — Reputation:** company-seitige `org_reputation` (spiegelbildlich zu `supplier_reputation`), Recency-Gewichtung, Recompute-Trigger.
- **P6 — Pool-Verzahnung:** „Lieferant in Pool"-Button auf `offer_detail` (Endpoint existiert) + optional Auto-Vorschlag bei sehr guter Bewertung.

**Akzeptanz gesamt:** echter Marktplatz-Deal → beide Seiten bewerten → mutual-blind → revealed nach beidseitig/Frist → moderiert → in Org-Reputation + Profil sichtbar; Antwort möglich; Lieferant 1-Klick in Pool.

*Stand: 2026-06-15 · Owner-freigegeben (Architektur) · Umsetzung: Claude · phasiert*
