/**
 * Spion-Pool fuer die Mandantengrenze.
 *
 * Warum es diese Datei gibt: `test/security/coreFlowCrossTenant.test.js` prueft
 * `res._status === 403` — und sonst nichts. Ein Handler, der erst schreibt und
 * danach 403 meldet, besteht diesen Test. Ebenso einer, der ueber die falsche
 * Kennung urteilt (Befund E-5: geprueft wurde `params.id`, geholt wurde
 * `query.entity_id`). Der Spion schreibt jede Abfrage mit, damit die Pruefung
 * ueber das VERHALTEN urteilen kann statt ueber das Ergebnis.
 *
 * Zwei Lehren aus Welle G6 stecken hier drin:
 *   - Verhalten statt Schreibweise: `if (false && X)` traegt die gesuchte
 *     Zeichenkette weiterhin, aendert aber das Verhalten. Der Spion sieht das.
 *   - Gegenprobe: ohne sie besteht ein pauschales `return 403` jede Pruefung.
 */

/**
 * Ist diese Anweisung schreibend?
 *
 * Erkennung ueber das ERSTE Schluesselwort, nicht ueber ein Vorkommen irgendwo:
 * `SELECT ... WHERE deleted_at IS NULL` enthaelt "delete" als Wortanfang, ist
 * aber ein Lesevorgang. `\bUPDATE\b` trifft `updated_at` nicht (Wortgrenze),
 * `\bDELETE\b` nicht `deleted_at` — der Anker am Anfang macht es zusaetzlich
 * eindeutig. CTEs (`WITH ... INSERT`) werden gesondert erkannt.
 *
 * @param {string} sql
 * @returns {boolean}
 */
export function istSchreibend(sql) {
  if (typeof sql !== "string" || !sql.trim()) return false;
  // Fuehrende Kommentare und Leerraum abtragen, damit der Anker greift.
  const kopf = sql.replace(/^(?:\s|--[^\n]*\n?|\/\*[\s\S]*?\*\/)+/, "");
  if (/^(INSERT|UPDATE|DELETE|TRUNCATE|MERGE)\b/i.test(kopf)) return true;
  if (/^WITH\b/i.test(kopf) && /\b(INSERT\s+INTO|UPDATE\s+[\w".]+\s+SET|DELETE\s+FROM)\b/i.test(kopf)) {
    return true;
  }
  return false;
}

/** Transaktionsklammern zaehlen nicht als Abfrage im Sinne der Pruefung. */
const KLAMMERN = new Set(["BEGIN", "COMMIT", "ROLLBACK", "SAVEPOINT"]);

function istKlammer(sql) {
  return KLAMMERN.has(String(sql || "").trim().toUpperCase().replace(/;$/, ""));
}

/**
 * Pool, der jede Abfrage mitschreibt und jede Antwort aus `zeile` bildet.
 *
 * @param {object} opts
 * @param {object|null} opts.zeile   — Zeile, die jede Abfrage zurueckgibt (null = leer)
 * @param {(sql: string, params: any[]) => ({rows: any[]}|undefined)} [opts.antwort]
 *        — optionaler Sonderfall pro Abfrage; `undefined` faellt auf `zeile` zurueck
 */
export function spionPool({ zeile = null, antwort } = {}) {
  const calls = [];
  const pool = {
    async query(sql, params) {
      const text = typeof sql === "string" ? sql : (sql?.text ?? "");
      const werte = Array.isArray(params) ? params : (Array.isArray(sql?.values) ? sql.values : []);
      if (!istKlammer(text)) {
        calls.push({ sql: text, params: werte, schreibend: istSchreibend(text) });
      }
      if (typeof antwort === "function") {
        const eigen = antwort(text, werte);
        if (eigen !== undefined) return { rowCount: eigen.rows?.length ?? 0, ...eigen };
      }
      const rows = zeile ? [zeile] : [];
      return { rows, rowCount: rows.length };
    },
    /** Alle mitgeschriebenen Abfragen. */
    get calls() { return calls; },
    /** Nur die schreibenden. */
    get schreibvorgaenge() { return calls.filter((c) => c.schreibend); },
    /** Nur die lesenden. */
    get lesevorgaenge() { return calls.filter((c) => !c.schreibend); },
    /** Gibt es einen Lesevorgang, dessen Parameter ALLE genannten Werte tragen? */
    lasMit(...werte) {
      return calls.some((c) => !c.schreibend && werte.every((w) => c.params.some((p) => String(p) === String(w))));
    },
    /** Gibt es irgendeine Abfrage, deren Parameter ALLE genannten Werte tragen? */
    fragteMit(...werte) {
      return calls.some((c) => werte.every((w) => c.params.some((p) => String(p) === String(w))));
    }
  };
  return pool;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Die Probe selbst — als Funktion, damit der Waechter und seine SELBSTPROBE
   exakt denselben Code durchlaufen. Ohne das waere ein kaputter Pruefer von
   einem sauberen Bestand nicht zu unterscheiden; dieselbe Begruendung gibt
   `sqlSchemaWaechter.test.js` in seinem Punkt (f) fuer sich selbst.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Platzhalter aus dem Pfad ziehen: "/a/:id/b/:candId" -> ["id", "candId"] */
export function pfadPlatzhalter(pfad) {
  return (String(pfad).match(/:([A-Za-z0-9_]+)/g) || []).map((t) => t.slice(1));
}

/**
 * Eine Route gegen die Mandantengrenze pruefen.
 *
 * Gibt eine Liste von MAENGELN zurueck statt zu werfen — nur so kann die
 * Selbstprobe pruefen, dass der Pruefer bei kaputten Routen auch wirklich
 * anschlaegt.
 *
 * `baueHandler(pool)` liefert den Handler ZU dem uebergebenen Spion — die
 * Route-Fabriken schliessen ihren Pool ein, deshalb muss der Router je Lauf
 * neu montiert werden.
 *
 * FREMDLAUF (die Zeile gehoert einer anderen Org):
 *   1. Status ist 403                          — das Ergebnis, allein wertlos
 *   2. kein INSERT/UPDATE/DELETE auf dem Spion — faengt "erst schreiben, dann 403"
 *
 * GEGENPROBE (die Zeile gehoert der eigenen Org):
 *   3. Status ist NICHT 403                    — faengt das pauschale `return 403`
 *   4. der Schreibvorgang findet statt         — faengt die stillgelegte Route
 *   5. die Ressourcen-ID stand in einer Abfrage — faengt "ueber die falsche Zeile geurteilt"
 *   6. Org und Adressat stehen in DERSELBEN Anweisung — faengt "die Grenze steht
 *      nur im Handler, nicht im SQL"
 *
 * Warum 5 und 6 an der Gegenprobe haengen und nicht am Fremdlauf: eine korrekt
 * bewachte Route bricht beim Fremdzugriff ab, BEVOR sie die Abfrage stellt.
 * Dort ist die Abwesenheit der Org der Beweis, nicht der Mangel.
 */
export async function pruefeGrenze(opts) {
  const {
    baueHandler, pfad, art = "ressource",
    ressourceId = "ressource-fremd",
    zeile = {}, anfrage = {},
    orgEigen, orgFremd,
    schreibtBeiErfolg = false,
    orgImSql = false,
    erwartung = "403",
    traegerspalten = ["org_id"],
    lesenMussZusammen = [],
    baueReq, baueRes
  } = opts;

  const maengel = [];

  async function lauf(besitzerOrg, pfadOrg) {
    const platzhalter = pfadPlatzhalter(pfad);
    const params = {};
    for (const name of platzhalter) params[name] = ressourceId;
    if (art === "orgpfad" && platzhalter.includes("id")) params.id = pfadOrg;

    // Nur die deklarierten Traegerspalten bekommen den Besitzer. Wer
    // `supplier_org_id` blind mitfuellt, macht eine einseitige Grenze
    // unbeabsichtigt zweiseitig — und die Probe blind fuer den Unterschied.
    const datenZeile = { id: ressourceId, ...zeile };
    for (const spalte of traegerspalten) datenZeile[spalte] = besitzerOrg;
    const pool = spionPool({ zeile: datenZeile });
    // Der Handler wird UM den Spion herum gebaut, nicht vorher. Ein Router,
    // der seinen Pool ueber die Fabrik einschliesst, wuerde sonst an einem
    // anderen Pool arbeiten als dem, den wir beobachten — und die Probe
    // beobachtete eine leere Buehne.
    const handler = await baueHandler(pool);
    const req = baueReq({
      orgId: orgEigen,
      params: { ...params, ...(anfrage.params || {}) },
      query: { ...(anfrage.query || {}) },
      body: { ...(anfrage.body || {}) }
    });
    // Die echten Router schliessen ihren Pool ueber die Fabrik ein; die
    // Mini-Router der Selbstprobe holen ihn hier ab.
    req.pool = pool;
    const res = baueRes();
    let weitergereicht = null;
    try {
      await handler(req, res, (err) => { if (err) weitergereicht = err; });
    } catch (err) {
      weitergereicht = err;
    }
    return { pool, res, weitergereicht };
  }

  /* ── Fremdlauf ───────────────────────────────────────────────────────── */
  const fremd = await lauf(orgFremd, orgFremd);

  // Eine Route, die eine ENTITAET auflistet (statt eine Ressource per ID
  // anzusprechen), kann nicht sinnvoll mit 403 antworten: was man nicht sehen
  // darf, existiert dort schlicht nicht. Ihr Beweis ist, dass die eigene Org
  // in der Abfrage steht — Zero-State statt Fehler (CLAUDE.md, Saeule 2).
  if (erwartung === "403" && fremd.res._status !== 403) {
    maengel.push(
      `Fremdzugriff endet mit ${fremd.res._status} statt 403` +
      (fremd.weitergereicht ? ` (Fehler durchgereicht: ${fremd.weitergereicht.message})` : "")
    );
  }
  if (fremd.pool.schreibvorgaenge.length > 0) {
    maengel.push(
      "Fremdzugriff hat geschrieben: " +
      fremd.pool.schreibvorgaenge.map((c) => c.sql.trim().slice(0, 50).replace(/\s+/g, " ")).join(" | ")
    );
  }
  if (erwartung === "sql-grenze" && !fremd.pool.lasMit(...[orgEigen, ...lesenMussZusammen])) {
    maengel.push(
      "die Abfrage trug nicht Org UND Adressat zusammen — eine Route ohne 403 " +
      "hat nur ihr SQL als Grenze"
    );
  }

  /* ── Gegenprobe ──────────────────────────────────────────────────────── */
  const eigen = await lauf(orgEigen, orgEigen);

  if (eigen.res._status === 403) {
    maengel.push("die EIGENE Org wird ebenfalls mit 403 abgewiesen — die Pruefung urteilt pauschal");
  }
  if (erwartung === "sql-grenze" && eigen.res._status >= 400) {
    maengel.push(`der eigene Zugriff endet mit ${eigen.res._status} — die Route ist nicht benutzbar`);
  }

  /* Zusicherungen 3 und 4 gehoeren an die GEGENPROBE, nicht an den Fremdlauf:
     eine korrekt bewachte Route bricht beim Fremdzugriff ab, BEVOR sie die
     Abfrage stellt — dort ist die Abwesenheit der Org kein Mangel, sondern der
     Beweis. Erst wo der Aufruf durchgeht, ist zu zeigen, ueber WELCHE Zeile
     entschieden wurde und ob die Org die Abfrage erreicht. */
  if (art !== "orgpfad" && !eigen.pool.fragteMit(ressourceId)) {
    maengel.push("keine Abfrage trug die Ressourcen-ID — es wurde ueber eine andere Zeile geurteilt");
  }
  if (orgImSql) {
    // Die Org darf im LESEN oder im SCHREIBEN stehen: bei rate_cards und
    // approval_requests traegt die UPDATE-Klausel die Grenze, bei der
    // Freigabe-Historie die SELECT-Klausel. Verlangt wird nur, dass Org und
    // Adressat in DERSELBEN Anweisung stehen — sonst beweist die Anwesenheit
    // der Org nichts ueber die Zeile, die angefasst wird.
    const zusammen = [orgEigen, ...(art !== "orgpfad" ? [ressourceId] : []), ...lesenMussZusammen];
    if (!eigen.pool.fragteMit(...zusammen)) {
      maengel.push(
        "keine Anweisung trug die eigene Org zusammen mit dem Adressaten — " +
        "die Grenze steht nur im Handler, nicht im SQL"
      );
    }
  }
  if (schreibtBeiErfolg && eigen.pool.schreibvorgaenge.length === 0) {
    maengel.push("der eigene Zugriff schreibt nichts — die Route ist stillgelegt, nicht bewacht");
  }

  return { maengel, fremd, eigen };
}
