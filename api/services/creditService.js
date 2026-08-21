import { withTransaction } from "../utils/transaction.js";

/**
 * Credits-Service: Plattform-Credits verdienen, ausgeben, kaufen.
 */

export async function getBalance(pool, userId) {
  const { rows } = await pool.query(
    "SELECT * FROM credit_accounts WHERE user_id = $1", [userId]
  );
  if (rows[0]) return rows[0];
  // Auto-create account
  const { rows: created } = await pool.query(
    "INSERT INTO credit_accounts (user_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING *", [userId]
  );
  return created[0] || { user_id: userId, balance: 0, lifetime_earned: 0, lifetime_spent: 0 };
}

export async function earnCredits(pool, userId, amount, source, description, referenceId) {
  if (amount <= 0) return null;
  await pool.query(
    `INSERT INTO credit_accounts (user_id, balance, lifetime_earned)
     VALUES ($1, $2, $2)
     ON CONFLICT (user_id) DO UPDATE SET
       balance = credit_accounts.balance + $2,
       lifetime_earned = credit_accounts.lifetime_earned + $2,
       updated_at = NOW()`,
    [userId, amount]
  );
  const { rows } = await pool.query(
    `INSERT INTO credit_transactions (user_id, amount, type, source, reference_id, description)
     VALUES ($1, $2, 'earned', $3, $4, $5) RETURNING *`,
    [userId, amount, source || "system", referenceId || null, description || null]
  );
  return rows[0];
}

export async function spendCredits(pool, userId, amount, description, referenceId) {
  if (amount <= 0) return null;
  const { rowCount } = await pool.query(
    `UPDATE credit_accounts SET balance = balance - $2, lifetime_spent = lifetime_spent + $2, updated_at = NOW()
     WHERE user_id = $1 AND balance >= $2`,
    [userId, amount]
  );
  if (rowCount === 0) return { error: "INSUFFICIENT_CREDITS" };
  const { rows } = await pool.query(
    `INSERT INTO credit_transactions (user_id, amount, type, source, reference_id, description)
     VALUES ($1, $2, 'spent', 'system', $3, $4) RETURNING *`,
    [userId, -amount, referenceId || null, description || null]
  );
  return rows[0];
}

export async function getTransactionHistory(pool, userId, limit) {
  const { rows } = await pool.query(
    "SELECT * FROM credit_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2",
    [userId, limit || 50]
  );
  return rows;
}

export async function getPackages(pool) {
  const { rows } = await pool.query(
    "SELECT * FROM credit_packages WHERE is_active = TRUE ORDER BY credits ASC"
  );
  return rows;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Guthaben kaufen — Befund P1-22, Owner-Entscheidung 2026-08-21: Stripe
   ═══════════════════════════════════════════════════════════════════════════

   Bis hierher hiess "kaufen": nachschlagen, wie viele Guthaben das Paket
   enthaelt, und sie gutschreiben. Ohne Bezahlschritt. Die Pakete haben Preise
   (9,99 / 39,99 / 129,99 EUR) — jeder Angemeldete konnte sie sich nehmen.

   Ein aktives Leck war es nur deshalb nicht, weil `spendCredits` keinen Aufrufer
   hatte: Guthaben liessen sich nirgends ausgeben. Ein schlafender Defekt, der am
   Tag der ersten Ausgabe aufgewacht waere.

   Der Kauf laeuft jetzt denselben Weg wie die Abos: Sitzung erzeugen, Kunde
   zahlt bei Stripe, der signaturgepruefte Webhook schreibt gut. Die Aufteilung
   in ZWEI Funktionen ist die eigentliche Absicherung — es gibt keine mehr, die
   "gutschreiben" heisst und ohne Zahlungsnachweis aufgerufen werden kann.       */

/**
 * Schritt 1: den Kauf beginnen. Schreibt NICHTS gut — sie schlaegt nur nach, was
 * das Paket kostet und enthaelt. Die Route baut daraus die Stripe-Sitzung.
 */
export async function startPurchase(pool, packageId) {
  const { rows } = await pool.query(
    "SELECT * FROM credit_packages WHERE id = $1 AND is_active = TRUE", [packageId]
  );
  const paket = rows[0];
  if (!paket) return { error: "PACKAGE_NOT_FOUND" };

  const preisCent = Math.round(Number(paket.price_eur) * 100);
  if (!Number.isFinite(preisCent) || preisCent <= 0) {
    // Ein Paket ohne gueltigen Preis darf nicht in eine Bezahlstrecke — sonst
    // entsteht die kostenlose Gutschrift auf einem anderen Weg neu.
    return { error: "PACKAGE_PRICE_INVALID" };
  }
  return {
    paket,
    preisCent,
    gutschrift: paket.credits + Math.floor(paket.credits * (paket.bonus_pct || 0) / 100)
  };
}

/**
 * Schritt 2: gutschreiben — NUR aus dem signaturgeprueften Webhook.
 *
 * Zwei Zusicherungen, die beide noetig sind:
 *
 *   BETRAG: der bei Stripe tatsaechlich gezahlte Betrag wird gegen den
 *   server-seitigen Preis geprueft. Ohne das koennte eine manipulierte Sitzung
 *   ein teures Paket zum Preis eines billigen freischalten. Dasselbe
 *   Schutzmuster wie bei der INDIVIDUELL-Aktivierung.
 *
 *   EINMALIGKEIT: Stripe stellt Webhooks WIEDERHOLT zu — das ist die Zusicherung
 *   des Anbieters, kein Fehler. Der Riegel dagegen liegt in der Datenbank
 *   (Migration 186, eindeutiger Index auf der Kauf-Referenz), nicht hier: zwei
 *   gleichzeitige Zustellungen saehen beide "noch nichts da" und schrieben beide.
 *
 * @param {string} referenz Kennung des Bezahlvorgangs (checkout_id). Sie ist der
 *   Anker der Einmaligkeit und deshalb Pflicht.
 */
export async function grantPurchasedPackage(pool, { userId, packageId, referenz, bezahltCent }) {
  if (!userId || !packageId || !referenz) return { error: "INCOMPLETE" };

  const vorbereitet = await startPurchase(pool, packageId);
  if (vorbereitet.error) return vorbereitet;

  if (!Number.isFinite(bezahltCent) || bezahltCent < vorbereitet.preisCent) {
    return {
      error: "AMOUNT_MISMATCH",
      erwartet_cent: vorbereitet.preisCent,
      bezahlt_cent: Number.isFinite(bezahltCent) ? bezahltCent : null
    };
  }

  /* NICHT ueber `earnCredits`. Diese Funktion erhoeht ZUERST den Saldo und
     schreibt DANACH die Buchung — der eindeutige Index feuert also erst, wenn
     das Guthaben bereits oben ist. Gegen die echte Datenbank gemessen kam eine
     wiederholte Zustellung dabei auf den DOPPELTEN Stand; ein Mock haette das
     nie gezeigt, weil er keinen Index kennt.
     `earnCredits` bleibt fuer Praemien und Empfehlungen unveraendert: dort gibt
     es keine wiederholte Zustellung, gegen die es zu schuetzen gaebe.

     Hier gilt beides: die BUCHUNG zuerst — sie traegt die Einmaligkeit — und das
     Ganze in EINER Transaktion, damit bei einem Abbruch dazwischen weder Buchung
     noch Saldo alleine stehenbleiben. */
  try {
    return await withTransaction(pool, async (client) => {
      const { rows } = await client.query(
        `INSERT INTO credit_transactions (user_id, amount, type, source, reference_id, description)
         VALUES ($1, $2, 'earned', 'purchase', $3, $4) RETURNING *`,
        [userId, vorbereitet.gutschrift, referenz, `Credit-Paket: ${vorbereitet.paket.name}`]
      );
      await client.query(
        `INSERT INTO credit_accounts (user_id, balance, lifetime_earned)
         VALUES ($1, $2, $2)
         ON CONFLICT (user_id) DO UPDATE SET
           balance = credit_accounts.balance + $2,
           lifetime_earned = credit_accounts.lifetime_earned + $2,
           updated_at = NOW()`,
        [userId, vorbereitet.gutschrift]
      );
      return {
        ok: true, package: vorbereitet.paket,
        credits_added: vorbereitet.gutschrift, transaction: rows[0]
      };
    });
  } catch (err) {
    // 23505 = der eindeutige Index aus Migration 186 hat zugeschlagen: diese
    // Zahlung wurde bereits gutgeschrieben. Eine wiederholte Zustellung ist kein
    // Fehler, sondern der Normalfall — sie darf nur nicht doppelt wirken. Weil
    // die Buchung der ERSTE Schritt ist, hat der Saldo sich nicht bewegt.
    if (err?.code === "23505") return { ok: true, bereits_gutgeschrieben: true };
    throw err;
  }
}
