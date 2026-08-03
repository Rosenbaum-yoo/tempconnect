-- 159: Worker-Invites — ein offener Invite je (Org, E-Mail) (7c-Bonus)
--
-- Bisher schuetzte nur ein App-seitiger SELECT vor Doppel-Invites — zwei
-- parallele Requests ("Alle einladen" doppelt geklickt) erzeugten Dubletten.
-- Der partielle Unique-Index macht die Regel zur DB-Wahrheit; der Bulk-Insert
-- nutzt ihn per ON CONFLICT ... DO NOTHING.
--
-- Vorab-Bereinigung: existierende pending-Dubletten werden auf 'revoked'
-- gesetzt (nur die NEUESTE je Org+E-Mail bleibt pending) — sonst schlaegt die
-- Index-Erstellung fehl. Idempotent. Rollback: DROP INDEX.

UPDATE worker_invites wi
   SET status = 'revoked'
 WHERE wi.status = 'pending'
   AND EXISTS (
     SELECT 1 FROM worker_invites w2
      WHERE w2.supplier_org_id = wi.supplier_org_id
        AND LOWER(w2.email) = LOWER(wi.email)
        AND w2.status = 'pending'
        AND (w2.created_at > wi.created_at
             OR (w2.created_at = wi.created_at AND w2.id > wi.id))
   );

CREATE UNIQUE INDEX IF NOT EXISTS worker_invites_pending_email_unique_idx
  ON worker_invites (supplier_org_id, LOWER(email))
  WHERE status = 'pending';
