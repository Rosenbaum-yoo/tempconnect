/**
 * schaufenster.js — das oeffentliche Schaufenster des Marktplatzes (M1.6).
 *
 * KEIN `requireAuth`. Das ist der ganze Punkt.
 *
 * Gemessen am 2026-09-02: die drei Endpunkte unter `/marketplace/public/*`
 * tragen alle `requireAuth`. "Oeffentlich" heisst dort "jeder ANGEMELDETE
 * Nutzer". Eine Suchmaschine hat kein Konto; ein Interessent, der wissen
 * will, ob sich die Anmeldung lohnt, auch nicht. Solange die Zahlen hinter
 * dem Login liegen, kann der Marktplatz nicht fuer sich werben.
 *
 * Was hier herausgeht, ist verdichtet und traegt keine Kennung, keinen
 * Firmennamen und kein Datum einer einzelnen Anzeige — die Begruendung
 * dafuer, samt der Mindestgruppengroesse, steht in
 * `services/schaufensterService.js`.
 *
 * Eigener Router und nicht in `publicPlans.js`: das ist der Tarifkatalog.
 * Marktzahlen dort einzuhaengen waere die Parallelstruktur, gegen die
 * CLAUDE.md steht.
 */

import { Router } from "express";
import { schaufensterZahlen } from "../services/schaufensterService.js";

/**
 * @param {{pool: import('pg').Pool, logger?: object}} deps
 */
export function createSchaufensterRouter(deps) {
  const router = Router();
  const { pool, logger } = deps || {};

  router.get("/public/schaufenster", async (_req, res) => {
    /*
     * Fuenf Minuten Cache, oeffentlich: die Zahlen aendern sich in Minuten,
     * nicht in Sekunden, und die Seite soll von einer Suchmaschine ohne
     * Kosten abgeholt werden koennen. Dasselbe Mass wie beim Tarifkatalog.
     */
    res.setHeader("Cache-Control", "public, max-age=300");
    try {
      const zahlen = await schaufensterZahlen(pool);
      res.json(zahlen);
    } catch (e) {
      /*
       * `schaufensterZahlen` wirft nicht — dieser Zweig ist die zweite
       * Sicherung. Auch hier KEIN 500: eine Startseite, die wegen einer
       * Kennzahl kaputtgeht, ist schlimmer als eine ohne Kennzahl. Der
       * Aufrufer erkennt den Fall an `verfuegbar: false`.
       */
      logger?.warn?.({ err: e?.message }, "Schaufenster nicht lieferbar");
      res.json({
        verfuegbar: false,
        stand: new Date().toISOString(),
        kapazitaet: { anzeigen: 0, koepfe: 0, nach_rolle: [], nach_ort: [] },
        bedarf: { anfragen: 0, koepfe: 0, nach_rolle: [], nach_ort: [] }
      });
    }
  });

  return router;
}
