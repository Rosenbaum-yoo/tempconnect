import { z } from "zod";
import { Router } from "express";
import {
  KUNDEN_FALLARTEN,
  eroeffneSupportFall,
  listeEigeneFaelle,
  holeEigenenFall,
} from "../services/supportIntakeService.js";

/*
 * `/support-requests` — der Weg eines Kunden zu TempConnect (Plan I, Abschnitt 10,
 * Stufe 3 des Trichters: Hilfeseite → Telefon → Support Center).
 *
 * WARUM NICHT UNTER `/support`: siehe Kopf von `supportIntakeService.js`. Dort
 * steht das Praefix-Tor `supportAuth`, und die Owner-Vorgabe zu Abschnitt 10 ist
 * hart — kein Zugang fuer Unternehmen, kein Zugang fuer Personaldienstleister.
 * Diese Datei haengt NICHT unter diesem Praefix und schneidet deshalb auch kein
 * Loch hinein. Sie ist die Klingel an der Tuer, nicht ein Schluessel dafuer.
 *
 * DIE REICHWEITE JEDER ROUTE HIER: ausschliesslich die eigenen Faelle des
 * angemeldeten Nutzers. Es gibt hier keinen Weg, einen fremden Fall zu sehen,
 * keinen Weg, eine Liste ueber alle Faelle zu ziehen, und keinen Weg, einen Fall
 * zu veraendern. Wer geoeffnet hat, sieht Stand und Antworten — mehr nicht.
 */

const eroeffnenSchema = z.object({
  subject: z.string().trim().min(5).max(200),
  description: z.string().trim().min(20).max(5000),
  case_type: z.enum(KUNDEN_FALLARTEN).optional(),
  /* Wo im Produkt der Kunde stand, als er den Fall eroeffnet hat. Erspart die
   * Rueckfrage "wo genau war das?" und damit einen halben Tag Wartezeit. */
  kontext: z.object({
    seite: z.string().trim().max(200).optional(),
    vorgang_id: z.string().uuid().optional(),
  }).optional(),
});

const listeSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export function createSupportIntakeRouter(deps) {
  const { pool, requireAuth, logger, requestLimiter, config = {} } = deps;
  /* Dasselbe Muster wie `admin.js:20`, `invoices.js:26`, `workers.js:551`: der
   * Limiter ist optional injiziert, damit Tests den Router ohne ihn montieren
   * koennen. Ein Durchreicher statt eines Absturzes. */
  const eroeffnenLimiter = requestLimiter || ((_req, _res, next) => next());
  const router = Router();

  /*
   * DER TRICHTER — und warum seine Reihenfolge auf dem SERVER steht.
   *
   * Owner-Vorgabe (Plan I, Abschnitt 10), und die Reihenfolge IST der Entwurf:
   *   1. zuerst die Hilfeseite — damit nicht jede Kleinigkeit im Support Center
   *      landet und dort Aufwand fuer das TempConnect-Team erzeugt,
   *   2. dann das Telefon,
   *   3. dann erst eine Anfrage ins Support Center.
   *
   * "Wer die Reihenfolge umdreht, baut sich die Last selbst. Der teuerste Kanal
   * steht zuletzt." Genau deshalb steht sie hier und nicht im Frontend: eine
   * Reihenfolge, die jede Seite fuer sich festlegt, driftet — die eine Seite
   * zeigt zuerst das Formular, die naechste zuerst die Hilfe, und niemand merkt
   * es, weil beide "irgendwie richtig" aussehen. Hier gibt es EINE Wahrheit,
   * und jede Flaeche, die den Trichter zeigt, holt sie sich von hier.
   *
   * OHNE Anmeldung erreichbar: die Hilfeseite und die Telefonnummer sind
   * oeffentliche Angaben (sie stehen ohnehin im Impressum), und wer sich gerade
   * NICHT anmelden kann, braucht sie am dringendsten. Stufe 3 verlangt weiterhin
   * eine Anmeldung — dort entsteht ein Fall mit einem Melder.
   */
  router.get("/support-channels", (req, res) => {
    const nummer = String(config.SUPPORT_PHONE || "").trim();
    return res.json({
      trichter: [
        {
          stufe: 1,
          kanal: "hilfe",
          verfuegbar: true,
          ziel: "/public/sla_hilfe.html",
        },
        {
          stufe: 2,
          kanal: "telefon",
          /* Nicht gesetzt = die Stufe wird gar nicht erst angeboten. Eine
           * Telefonnummer, die niemand abnimmt, ist schlimmer als keine: sie
           * kostet den Kunden einen Anruf, bevor er zu Stufe 3 findet. */
          verfuegbar: Boolean(nummer),
          nummer: nummer || null,
          zeiten: nummer ? String(config.SUPPORT_PHONE_HOURS || "").trim() || null : null,
        },
        {
          stufe: 3,
          kanal: "support_center",
          verfuegbar: true,
          benoetigtAnmeldung: true,
          fallarten: KUNDEN_FALLARTEN,
        },
      ],
    });
  });

  router.post("/support-requests", requireAuth, eroeffnenLimiter, async (req, res) => {
    const parsed = eroeffnenSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
    }

    try {
      const ergebnis = await eroeffneSupportFall(pool, {
        reporterUserId: req.session.userId,
        reporterOrgId: req.orgId || null,
        subject: parsed.data.subject,
        description: parsed.data.description,
        caseType: parsed.data.case_type || "general",
        kontext: parsed.data.kontext || null,
      });

      if (ergebnis.error === "NO_QUEUE_CONFIGURED") {
        /* Der einzige Fall, in dem wir den Kunden bewusst abweisen statt seine
         * Nachricht anzunehmen. Naeher begruendet in `findeWarteschlange`: eine
         * angenommene Nachricht, die niemand sieht, ist schlimmer als eine
         * abgelehnte. Deshalb 503 (voruebergehend, Betriebsfehler) und nicht
         * 400 (der Kunde hat nichts falsch gemacht). */
        logger.error({ userId: req.session.userId }, "support-requests: keine aktive Warteschlange");
        return res.status(503).json({
          error: "SUPPORT_UNAVAILABLE",
          message: "Der Support-Eingang ist gerade nicht erreichbar. Bitte nutzen Sie das Telefon.",
        });
      }
      if (ergebnis.error) return res.status(400).json({ error: ergebnis.error });

      res.locals.audit = {
        action: "support.case.open",
        entity_type: "support_case",
        entity_id: ergebnis.fall.id,
        details: { case_number: ergebnis.fall.case_number, case_type: ergebnis.fall.case_type },
      };
      return res.status(201).json({ ok: true, fall: ergebnis.fall });
    } catch (e) {
      logger.error({ err: e }, "POST /api/support-requests");
      return res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.get("/support-requests", requireAuth, async (req, res) => {
    const parsed = listeSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
    }
    try {
      const { faelle, gesamt } = await listeEigeneFaelle(pool, req.session.userId, parsed.data);
      return res.json({ faelle, gesamt });
    } catch (e) {
      logger.error({ err: e }, "GET /api/support-requests");
      return res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.get("/support-requests/:id", requireAuth, async (req, res) => {
    try {
      const fall = await holeEigenenFall(pool, req.session.userId, req.params.id);
      /* Ein fremder Fall und ein nicht vorhandener Fall bekommen dieselbe
       * Antwort. Ein unterscheidbares 403 waere ein Orakel: wer Fallnummern
       * durchprobiert, koennte daran ablesen, welche existieren. */
      if (!fall) return res.status(404).json({ error: "NOT_FOUND" });
      return res.json({ fall });
    } catch (e) {
      logger.error({ err: e }, "GET /api/support-requests/:id");
      return res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  return router;
}
