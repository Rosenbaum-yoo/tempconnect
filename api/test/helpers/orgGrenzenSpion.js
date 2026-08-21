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
    /* Transaktionen: Routen, die `withTransaction` benutzen, holen sich einen
       Client. Ohne `connect` bricht der Aufruf mit "pool.connect is not a
       function" ab — und die Probe haelt einen Absturz fuer eine bestandene
       Grenze. Der Client schreibt auf DENSELBEN Spion. */
    async connect() {
      return { query: (...a) => pool.query(...a), release() {} };
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
    orgPlatzhalter = "id",
    seitenprobe = true,
    reqZusatz = {},
    identitaet = "org",
    nutzerEigen, nutzerFremd,
    schreibenGrenztSelbst = false,
    schreibenNachGrenze = false,
    gegenprobe = true,
    leereAntwortFuer = [],
    baueReq, baueRes
  } = opts;

  const maengel = [];

  /* Nicht jede Grenze dieser Codebasis ist eine ORG-Grenze. `capacityExchange`
     bindet an den NUTZER (`supplier_company_id = req.session.userId`), nicht an
     die Organisation. Eine Probe, die nur die Org variiert, laesst dort jede
     Verletzung durch — sie wechselt schlicht nicht die Kennung, ueber die
     entschieden wird. `identitaet` waehlt, welche Kennung variiert. */
  const eigenKennung  = identitaet === "nutzer" ? nutzerEigen  : orgEigen;
  const fremdKennung  = identitaet === "nutzer" ? nutzerFremd  : orgFremd;

  async function lauf(besitzerKennung, pfadOrg, nurSpalte = null) {
    const platzhalter = pfadPlatzhalter(pfad);
    const params = {};
    for (const name of platzhalter) params[name] = ressourceId;
    // Bei art="orgpfad" traegt EIN Platzhalter die Org-Kennung. Er heisst
    // meist ":id", in complianceDocs aber ":orgId" — deshalb benennbar.
    if (art === "orgpfad" && platzhalter.includes(orgPlatzhalter)) params[orgPlatzhalter] = pfadOrg;

    // Nur die deklarierten Traegerspalten bekommen den Besitzer. Wer
    // `supplier_org_id` blind mitfuellt, macht eine einseitige Grenze
    // unbeabsichtigt zweiseitig — und die Probe blind fuer den Unterschied.
    const datenZeile = { id: ressourceId, ...zeile };
    for (const spalte of traegerspalten) {
      // `nurSpalte` gibt die Zeile NUR ueber diese eine Spalte an die eigene
      // Seite; alle anderen Traeger gehoeren der Gegenseite. So wird jede
      // Haelfte einer zweiseitigen Grenze einzeln belegt.
      datenZeile[spalte] = nurSpalte
        ? (spalte === nurSpalte ? besitzerKennung : fremdKennung)
        : besitzerKennung;
    }
    /* Der Spion beantwortet jede Abfrage mit der Zeile — auch eine
       Mitgliedschaftsabfrage. Fuer eine FREMDE Kennung ist das falsch: sie ist
       eben KEIN Mitglied, und die Route saehe faelschlich einen Treffer.
       `leereAntwortFuer` nennt die Tabellen, die leer antworten sollen. */
    const pool = spionPool({
      zeile: datenZeile,
      // Absichtlich Teilstring statt regulaerem Ausdruck: '' in einem
      // Template-Literal ist das Backspace-Zeichen, keine Wortgrenze — die
      // erste Fassung dieser Zeile hat deshalb nie getroffen und die Probe
      // still entwertet.
      antwort: leereAntwortFuer.length
        ? (sql) => (leereAntwortFuer.some((t) => sql.toLowerCase().includes(String(t).toLowerCase()))
            ? { rows: [] } : undefined)
        : undefined
    });
    // Der Handler wird UM den Spion herum gebaut, nicht vorher. Ein Router,
    // der seinen Pool ueber die Fabrik einschliesst, wuerde sonst an einem
    // anderen Pool arbeiten als dem, den wir beobachten — und die Probe
    // beobachtete eine leere Buehne.
    const handler = await baueHandler(pool);
    const req = baueReq({
      orgId: orgEigen,
      // Bei nutzer-gebundenen Grenzen ist die SITZUNG die Kennung, die zaehlt.
      ...(identitaet === "nutzer" ? { session: { userId: nutzerEigen } } : {}),
      params: { ...params, ...(anfrage.params || {}) },
      query: { ...(anfrage.query || {}) },
      body: { ...(anfrage.body || {}) },
      // Manche Routen verlangen mehr vom Request als Org und Parameter — etwa
      // `req.user.role === "agency"`. Ohne das faellt die Route in ihre eigene
      // Rollenpruefung und die Gegenprobe meldet faelschlich einen Mangel.
      ...reqZusatz
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
    /* Nicht jeder Handler ist zu Ende, wenn er zurueckkehrt. `catchAsync`
       (utils/routeHandler.js:39-43) ruft `Promise.resolve(fn(...)).catch(next)`
       und gibt SOFORT zurueck — die eigentliche Arbeit laeuft danach weiter.
       Eine Probe, die hier schon nachsieht, haelt einen noch nicht erfolgten
       Schreibvorgang fuer einen unterbliebenen: ein falsches Gruen.
       Bemerkt wurde das, als eine zusaetzliche `await`-Runde im Spion eine
       zuvor gruene Route auf "schreibt nichts" umschlagen liess. */
    for (let i = 0; i < 5; i++) await new Promise((fertig) => setImmediate(fertig));
    return { pool, res, weitergereicht };
  }

  /* ── Fremdlauf ───────────────────────────────────────────────────────── */
  const fremd = await lauf(fremdKennung, orgFremd);

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
  if (schreibenNachGrenze) {
    /* Manche Routen klaeren die Zugehoerigkeit mit einer eigenen Abfrage und
       schreiben erst DANACH — der Schreibvorgang ist fuer Fremde unerreichbar,
       weil die Route vorher aussteigt. Ein Spion kann diesen Ausstieg nicht
       nachbilden: er beantwortet auch die klaerende Abfrage mit einer Zeile.
       Pruefbar ist aber die REIHENFOLGE, und genau die war Befund E-12: dort
       stand der Schreibvorgang VOR der Klaerung.

       Verlangt wird also: es gibt eine lesende Abfrage, die Kennung UND
       Adressat zusammen traegt, und sie kommt VOR dem ersten Schreibvorgang. */
    const ersterSchreib = fremd.pool.calls.findIndex((c) => c.schreibend);
    /* Die klaerende Anweisung darf selbst ein Schreibvorgang sein: manche Routen
       beginnen mit einem gebundenen `UPDATE ... WHERE id = $1 AND owner = $2` und
       steigen aus, wenn es keine Zeile trifft. Entscheidend ist nicht, ob gelesen
       oder geschrieben wird, sondern dass VOR der bindenden Anweisung nichts
       Ungebundenes geschrieben wurde — genau das war bei E-12, E-13 und E-15 der
       Defekt. */
    const klaerung = fremd.pool.calls.findIndex(
      (c) => c.params.some((prm) => String(prm) === String(eigenKennung)) &&
             c.params.some((prm) => String(prm) === String(ressourceId))
    );
    if (klaerung === -1) {
      maengel.push(
        "keine Anweisung, die eigene Kennung UND Adressat zusammen traegt — " +
        "die angekuendigte Grenze vor dem Schreiben gibt es nicht"
      );
    } else if (ersterSchreib !== -1 && ersterSchreib < klaerung) {
      maengel.push(
        "es wurde GESCHRIEBEN, bevor die Zugehoerigkeit geklaert war (Befund-E-12-Muster): " +
        fremd.pool.calls[ersterSchreib].sql.trim().slice(0, 60).replace(/\s+/g, " ")
      );
    }
  } else if (schreibenGrenztSelbst) {
    /* Traegt die schreibende Anweisung ihre Grenze SELBST
       (`DELETE ... WHERE company_user_id = $3`), dann ist ein aufgezeichneter
       Schreibvorgang KEIN Beleg fuer ein Leck: der Spion kann kein WHERE
       erzwingen, er beantwortet jede Anweisung gleich. Was hier zu zeigen
       bleibt, ist, dass die eigene Kennung ueberhaupt in der Anweisung steht —
       fehlt sie, kann die Klausel nicht greifen.

       EHRLICHE GRENZE: dass die Klausel wirklich dasteht, beweist das nicht.
       Dafuer sind die Service-Tests und `sqlSchemaWaechter` zustaendig. */
    const ohneKennung = fremd.pool.schreibvorgaenge.filter(
      (c) => !c.params.some((prm) => String(prm) === String(eigenKennung))
    );
    if (ohneKennung.length > 0) {
      maengel.push(
        "eine schreibende Anweisung traegt die eigene Kennung nicht in ihren Parametern — " +
        "die angekuendigte Grenze im WHERE kann so nicht greifen: " +
        ohneKennung.map((c) => c.sql.trim().slice(0, 50).replace(/\s+/g, " ")).join(" | ")
      );
    }
  } else if (fremd.pool.schreibvorgaenge.length > 0) {
    maengel.push(
      "Fremdzugriff hat geschrieben: " +
      fremd.pool.schreibvorgaenge.map((c) => c.sql.trim().slice(0, 50).replace(/\s+/g, " ")).join(" | ")
    );
  }
  // Manche Listen-Routen laden breit und sieben die fremden Zeilen erst in JS
  // aus (`items.filter(ts => ts.org_id === req.orgId || ...)`). Kein Leck, aber
  // auch kein 403 — beweisen laesst sich das nur an der ANTWORT: die fremde Org
  // darf in ihr nicht vorkommen.
  if (erwartung === "zero-state") {
    const koerper = JSON.stringify(fremd.res._json ?? null);
    if (koerper.includes(String(fremdKennung))) {
      maengel.push(
        "die Antwort auf den Fremdzugriff enthaelt die fremde Org — der Filter " +
        "siebt nicht: " + koerper.slice(0, 160)
      );
    }
  }
  if (erwartung === "sql-grenze" &&
      !fremd.pool.fragteMit(...[eigenKennung, ...(art !== "orgpfad" ? [ressourceId] : []), ...lesenMussZusammen])) {
    maengel.push(
      "keine Anweisung trug die eigene Kennung zusammen mit dem Adressaten — eine " +
      "Route ohne 403 hat nur ihr SQL als Grenze, und die ist hier nicht belegt"
    );
  }

  /* ── Gegenprobe ──────────────────────────────────────────────────────── */
  if (!gegenprobe) return { maengel, fremd, eigen: null };

  const eigen = await lauf(eigenKennung, orgEigen);

  if (eigen.res._status === 403) {
    maengel.push("die EIGENE Seite wird ebenfalls mit 403 abgewiesen — die Pruefung urteilt pauschal");
  }
  if (erwartung === "sql-grenze" || erwartung === "zero-state") {
    /* Die Gegenprobe fragt nicht "gelingt der Aufruf?", sondern "antwortet die
       Route dem Eigentuemer ANDERS als dem Fremden?". Das ist die Frage, die
       das pauschale Urteil faengt — und die einzige, die man einem Mock
       stellen kann: hinter der Besitzpruefung liegen Zustandsautomaten, die
       eine erfundene Zeile nie zufriedenstellt (409 "schon bestaetigt",
       400 "kein gueltiger Uebergang"). Ein Handler, der beiden Seiten
       dasselbe antwortet, hat nicht unterschieden. */
    if (eigen.res._status >= 400 && eigen.res._status === fremd.res._status) {
      maengel.push(
        `eigener und fremder Zugriff enden beide mit ${eigen.res._status} — ` +
        "die Route unterscheidet die beiden Faelle nicht"
      );
    }
  }

  /* Zusicherungen 3 und 4 gehoeren an die GEGENPROBE, nicht an den Fremdlauf:
     eine korrekt bewachte Route bricht beim Fremdzugriff ab, BEVOR sie die
     Abfrage stellt — dort ist die Abwesenheit der Org kein Mangel, sondern der
     Beweis. Erst wo der Aufruf durchgeht, ist zu zeigen, ueber WELCHE Zeile
     entschieden wurde und ob die Org die Abfrage erreicht. */
  /* ── Seitenprobe: jede Haelfte einer zweiseitigen Grenze einzeln ──────────
     Ohne sie bleibt eine halbierte Grenze unbemerkt: stehen BEIDE
     Traegerspalten immer auf demselben Besitzer, fällt es nicht auf, wenn der
     Handler nur noch einen der beiden Zweige prueft. Gemessen an einer
     Mutation in `contracts.js` — der Waechter blieb grün, bis es diese Probe
     gab. */
  if (traegerspalten.length > 1 && seitenprobe !== false) {
    for (const spalte of traegerspalten) {
      const seite = await lauf(eigenKennung, orgEigen, spalte);
      if (seite.res._status === 403) {
        maengel.push(
          `die Zeile gehoert der eigenen Seite ueber '${spalte}' (die andere ist fremd) ` +
          "und wird trotzdem mit 403 abgewiesen — die zweiseitige Grenze prueft nur einen Zweig"
        );
      }
      if (seite.pool.schreibvorgaenge.length === 0 && schreibtBeiErfolg) {
        maengel.push(`ueber '${spalte}' findet kein Schreibvorgang statt — dieser Zweig ist stillgelegt`);
      }
    }
  }

  if (art !== "orgpfad" && !eigen.pool.fragteMit(ressourceId)) {
    maengel.push("keine Abfrage trug die Ressourcen-ID — es wurde ueber eine andere Zeile geurteilt");
  }
  if (orgImSql) {
    // Die Org darf im LESEN oder im SCHREIBEN stehen: bei rate_cards und
    // approval_requests traegt die UPDATE-Klausel die Grenze, bei der
    // Freigabe-Historie die SELECT-Klausel. Verlangt wird nur, dass Org und
    // Adressat in DERSELBEN Anweisung stehen — sonst beweist die Anwesenheit
    // der Org nichts ueber die Zeile, die angefasst wird.
    const zusammen = [eigenKennung, ...(art !== "orgpfad" ? [ressourceId] : []), ...lesenMussZusammen];
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
