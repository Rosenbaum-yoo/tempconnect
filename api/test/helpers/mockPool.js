/**
 * Shared mock pool helpers for unit tests.
 *
 * These helpers create mock pg.Pool objects that work both for:
 *   - Direct pool.query() calls
 *   - withTransaction(pool, fn) calls (which use pool.connect() → client)
 *
 * Usage:
 *   import { returnPool, sequencePool } from "./helpers/mockPool.js";
 *
 *   // Simple: every query returns the same rows
 *   const pool = returnPool([{ id: "1", name: "test" }]);
 *
 *   // Sequence: queries return different results in order
 *   const pool = sequencePool(
 *     { rows: [{ id: "1" }] },        // 1st query
 *     { rows: [] },                     // 2nd query
 *     { rowCount: 3, rows: [] }         // 3rd query (with rowCount)
 *   );
 *
 * Both helpers automatically handle BEGIN/COMMIT/ROLLBACK transparently
 * when used inside withTransaction().
 */

const TX_COMMANDS = new Set(["BEGIN", "COMMIT", "ROLLBACK"]);

function isTxCommand(sql) {
  if (typeof sql !== "string") return false;
  return TX_COMMANDS.has(sql.trim().toUpperCase());
}

/**
 * Pool where every query returns the same rows.
 * BEGIN/COMMIT/ROLLBACK are silently consumed.
 *
 * @param {object[]} rows
 * @returns {object} Mock pool with query() and connect()
 */
export function returnPool(rows = []) {
  const queryFn = async (sql) => {
    if (isTxCommand(sql)) return { rows: [], rowCount: 0 };
    return { rows, rowCount: rows.length };
  };

  return {
    query: queryFn,
    connect: async () => ({
      query: queryFn,
      release: () => {}
    })
  };
}

/**
 * Pool where queries return responses in sequence.
 * BEGIN/COMMIT/ROLLBACK are silently consumed (not counted).
 * Errors in the sequence are thrown.
 *
 * @param {...(object|Error)} responses - { rows: [...], rowCount?: n } or Error
 * @returns {object} Mock pool with query() and connect()
 */
export function sequencePool(...responses) {
  let idx = 0;

  const queryFn = async (sql) => {
    if (isTxCommand(sql)) return { rows: [], rowCount: 0 };
    if (idx >= responses.length) return { rows: [], rowCount: 0 };
    const resp = responses[idx++];
    if (resp instanceof Error) throw resp;
    return resp;
  };

  return {
    query: queryFn,
    connect: async () => ({
      query: queryFn,
      release: () => {}
    })
  };
}
