import { swallow } from "./logger.js";
/**
 * Transaction utility for safe multi-write operations.
 *
 * Usage:
 *   import { withTransaction } from "../utils/transaction.js";
 *
 *   const result = await withTransaction(pool, async (client) => {
 *     const { rows } = await client.query("INSERT INTO ...", [...]);
 *     await client.query("INSERT INTO audit_log ...", [...]);
 *     return rows[0];
 *   });
 *
 * Guarantees:
 *   - BEGIN before fn, COMMIT after fn returns
 *   - ROLLBACK on any error inside fn
 *   - client.release() in all cases (success, error, ROLLBACK failure)
 *
 * @param {import('pg').Pool} pool
 * @param {(client: import('pg').PoolClient) => Promise<T>} fn
 * @returns {Promise<T>}
 * @template T
 */
export async function withTransaction(pool, fn) {
  if (!pool) {
    return fn(pool);
  }
  // Nested-tx-Support: Wird ein bereits ausgecheckter PoolClient uebergeben
  // (z. B. aus einer aeusseren Transaktion in dealAgreementService, der intern
  // assignmentService.createAssignment(client, ...) aufruft), darf hier keine
  // neue Connection geoeffnet werden. PoolClient besitzt .release(), Pool nicht.
  // Ohne diese Weiche wird client.connect() erneut getriggert und wirft
  // "Client has already been connected" – Symptom: 500 SERVER_ERROR auf
  // POST /marketplace/offers/:id/activate (Einsatz-Aktivierung).
  if (typeof pool.release === "function") {
    return fn(pool);
  }
  if (typeof pool.connect !== "function") {
    return fn(pool);
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(swallow("transaction"));
    throw err;
  } finally {
    client.release();
  }
}
