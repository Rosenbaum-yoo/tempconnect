#!/usr/bin/env node
/**
 * Halten die BESTEHENDEN Rechnungen der Steuerprobe stand?
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WARUM DAS VOR DER SCHARFSCHALTUNG LAEUFT
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Der Rechnungsgenerator prueft seit der Mehrsatz-Welle BR-CO-17 auf den Cent
 * genau: der ausgewiesene Steuerbetrag muss dem Produkt aus Bemessungs-
 * grundlage und Satz entsprechen. Das ist richtig — aber es wirkt auch auf
 * ALTE Belege, die heute stillschweigend durchgehen.
 *
 * Wer die Pruefung scharf schaltet, ohne vorher zu messen, riskiert, dass der
 * Download einer zwei Jahre alten Rechnung ab morgen mit 422 endet. Das faellt
 * dann einem Kunden auf, nicht uns.
 *
 * Dieses Skript SCHREIBT NICHTS. Es zaehlt, und das Ergebnis ist eine Zahl,
 * keine Schaetzung. Ergibt es Abweichungen, ist deren Behandlung eine
 * Owner-Entscheidung — ein Beleg ist ein Beleg, und ihn nachtraeglich
 * "richtigzurechnen" waere eine Faelschung.
 *
 * Aufruf:
 *   DATABASE_URL=postgres://… node scripts/bestandssteuer-messen.mjs
 */

import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[bestandssteuer] DATABASE_URL fehlt. Ohne Datenbank gibt es nichts zu messen.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url, max: 2 });

try {
  /* Kaufmaennische Rundung wie im Generator: Postgres' round() auf NUMERIC
     rundet halbe Werte von der Null weg — dasselbe Verhalten wie
     Math.round bei positiven Zahlen. */
  const { rows } = await pool.query(`
    SELECT
      count(*)                                                              AS gesamt,
      count(*) FILTER (WHERE tax_rate_pct IS NULL)                          AS ohne_satz,
      count(*) FILTER (
        WHERE tax_rate_pct IS NOT NULL
          AND tax_amount_cents <> round(amount_cents * tax_rate_pct / 100.0)
      )                                                                     AS br_co_17_verletzt,
      count(*) FILTER (WHERE total_cents <> amount_cents + tax_amount_cents) AS br_co_15_verletzt,
      count(DISTINCT tax_rate_pct)                                          AS verschiedene_saetze,
      coalesce(string_agg(DISTINCT tax_rate_pct::text, ', ' ORDER BY tax_rate_pct::text), '—') AS saetze
    FROM invoices
  `);
  const z = rows[0];

  console.log("[bestandssteuer] Rechnungen gesamt:      " + z.gesamt);
  console.log("[bestandssteuer] ohne Steuersatz:        " + z.ohne_satz);
  console.log("[bestandssteuer] verwendete Saetze:      " + z.saetze + "  (" + z.verschiedene_saetze + " verschiedene)");
  console.log("[bestandssteuer] BR-CO-17 verletzt:      " + z.br_co_17_verletzt + "   (Steuer <> Grundlage x Satz)");
  console.log("[bestandssteuer] BR-CO-15 verletzt:      " + z.br_co_15_verletzt + "   (Brutto <> Netto + Steuer)");

  const betroffen = Number(z.br_co_17_verletzt) + Number(z.br_co_15_verletzt);
  if (betroffen === 0) {
    console.log("");
    console.log("[bestandssteuer] Kein Bestandsbeleg wird von der Pruefung getroffen.");
    process.exit(0);
  }

  /* Die betroffenen Belege benennen — aber nur die Kennungen, keine Betraege
     im Klartext-Log. */
  const { rows: beispiele } = await pool.query(`
    SELECT id, invoice_number, status, tax_rate_pct
      FROM invoices
     WHERE (tax_rate_pct IS NOT NULL AND tax_amount_cents <> round(amount_cents * tax_rate_pct / 100.0))
        OR total_cents <> amount_cents + tax_amount_cents
     ORDER BY created_at DESC
     LIMIT 20
  `);
  console.log("");
  console.log("[bestandssteuer] BETROFFENE BELEGE (max. 20):");
  for (const b of beispiele) {
    console.log(`  ${b.invoice_number || "(ohne Nummer)"}  status=${b.status}  satz=${b.tax_rate_pct}  id=${b.id}`);
  }
  console.log("");
  console.log("[bestandssteuer] Diese Belege wuerden nach der Scharfschaltung beim Download");
  console.log("[bestandssteuer] abgewiesen. Das ist eine OWNER-ENTSCHEIDUNG, keine technische:");
  console.log("[bestandssteuer] ein Beleg ist ein Beleg. Ihn nachtraeglich richtigzurechnen");
  console.log("[bestandssteuer] waere eine Faelschung; ihn abzuweisen macht ihn unzustellbar.");
  process.exit(1);
} finally {
  await pool.end();
}
