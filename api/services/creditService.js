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

export async function purchasePackage(pool, userId, packageId) {
  const { rows: pkg } = await pool.query(
    "SELECT * FROM credit_packages WHERE id = $1 AND is_active = TRUE", [packageId]
  );
  if (!pkg[0]) return { error: "PACKAGE_NOT_FOUND" };
  const totalCredits = pkg[0].credits + Math.floor(pkg[0].credits * (pkg[0].bonus_pct || 0) / 100);
  const tx = await earnCredits(pool, userId, totalCredits, "purchase", `Credit-Paket: ${pkg[0].name}`, packageId);
  return { ok: true, package: pkg[0], credits_added: totalCredits, transaction: tx };
}
