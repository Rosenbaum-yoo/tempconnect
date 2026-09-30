/**
 * Der Feed und seine Zaehl-Query — ein Regressionstest mit Vorgeschichte.
 *
 * DER BEFUND (gefunden 2026-08-26, eingebaut am 2026-08-10 mit P9/B1):
 * `browseFeed` sammelt die WHERE-Parameter in `params` und haengt DANACH den
 * Merk-Parameter an (`ci_merk.company_user_id = $n`). Die Zaehl-Query nutzt
 * aber nur die WHERE-Klausel — sie bekam also einen Parameter mehr, als ihr
 * SQL referenziert. Fuer Postgres ist das ein Protokollfehler:
 *
 *     08P01  bind message supplies 2 parameters, but prepared statement "" requires 1
 *
 * Wirkung: der GESAMTE Marktplatz-Feed warf 500 — fuer JEDEN angemeldeten
 * Betrachter, also fuer jeden echten Nutzer. Sechzehn Tage lang, unbemerkt.
 *
 * WARUM ES NIEMAND SAH: Alle Feed-Tests liefen gegen Mock-Pools. Ein Mock
 * nimmt `query(sql, params)` entgegen und ignoriert ueberzaehlige Parameter
 * stillschweigend — nur ein echter Postgres zaehlt nach. Genau deshalb hat
 * dieser Test ZWEI Schichten, und die erste laeuft ohne Datenbank:
 *
 *   Teil A  Der Mock zaehlt selbst nach, was Postgres nachzaehlen wuerde:
 *           die hoechste im SQL referenzierte $n-Nummer darf die Zahl der
 *           uebergebenen Parameter nicht unterschreiten. Diese Pruefung
 *           haette den Befund am 10.08. gefangen.
 *   Teil B  Gegen die echte Datenbank (skip ohne DATABASE_URL): der Feed
 *           liefert fuer einen angemeldeten Betrachter wirklich Zeilen.
 *
 * Run: node --test --test-force-exit test/feedZaehlParameter.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

import { browseFeed } from "../services/capacityExchangeService.js";

const hasDb = !!process.env.DATABASE_URL;

/** Hoechste im SQL referenzierte Parameter-Nummer ($1, $2, …). */
function hoechsterPlatzhalter(sql) {
  const treffer = [...String(sql).matchAll(/\$(\d+)/g)].map((m) => Number(m[1]));
  return treffer.length ? Math.max(...treffer) : 0;
}

/**
 * Pool, der jede Abfrage wie Postgres auf Parameter-Anzahl prueft.
 * Zu WENIGE Parameter waeren ebenfalls ein Fehler (undefined-Bind); zu viele
 * sind der Befund von oben. Beides wird hier zum Testfehler.
 */
function strengerPool(zeilen = []) {
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      const text = typeof sql === "string" ? sql : (sql?.text ?? "");
      const werte = Array.isArray(params) ? params : [];
      const gebraucht = hoechsterPlatzhalter(text);
      assert.ok(werte.length <= gebraucht || gebraucht === 0,
        `Diese Abfrage bekommt ${werte.length} Parameter, referenziert aber nur $1..$${gebraucht} — ` +
        "Postgres antwortet darauf mit 08P01 und der Aufruf schlaegt fehl. " +
        `Betroffen: ${text.trim().slice(0, 90).replace(/\s+/g, " ")}`);
      assert.ok(gebraucht <= werte.length,
        `Diese Abfrage referenziert $${gebraucht}, bekommt aber nur ${werte.length} Parameter. ` +
        `Betroffen: ${text.trim().slice(0, 90).replace(/\s+/g, " ")}`);
      calls.push({ sql: text, params: werte });
      return { rows: zeilen, rowCount: zeilen.length };
    }
  };
}

describe("Feed · Teil A — jede Abfrage bekommt genau ihre Parameter", () => {
  it("mit angemeldetem Betrachter (der Fall, der 16 Tage lang brach)", async () => {
    const pool = strengerPool();
    await browseFeed(pool, {
      viewer_role: "company",
      viewer_user_id: "00000000-0000-0000-0000-000000000001",
      limit: 5
    });
    assert.ok(pool.calls.length >= 2, "Gegenprobe: es wurden ueberhaupt Abfragen gestellt");
  });

  it("ohne angemeldeten Betrachter", async () => {
    const pool = strengerPool();
    await browseFeed(pool, { limit: 5 });
    assert.ok(pool.calls.length >= 2);
  });

  it("mit Filtern UND Betrachter — je Filter waechst die Parameterliste", async () => {
    const pool = strengerPool();
    await browseFeed(pool, {
      viewer_role: "company",
      viewer_user_id: "00000000-0000-0000-0000-000000000001",
      role: "Staplerfahrer",
      location_city: "Hamburg",
      worker_category: "logistik",
      availability_from: "2026-09-01",
      limit: 5
    });
    assert.ok(pool.calls.length >= 2);
  });
});

describe("Feed · Teil B — echte Datenbank", { skip: !hasDb }, () => {
  it("der Feed liefert einem angemeldeten Betrachter wirklich Zeilen", async () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    try {
      const ergebnis = await browseFeed(pool, {
        viewer_role: "company",
        viewer_user_id: "00000000-0000-0000-0000-000000000001",
        limit: 10
      });
      assert.ok(Array.isArray(ergebnis.items), "die Antwort traegt items");
      assert.equal(typeof ergebnis.total, "number", "und eine Gesamtzahl aus der Zaehl-Query");
    } finally {
      await pool.end();
    }
  });
});
