/**
 * Der Waechter der Mandantengrenze.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WARUM ES DIESEN TEST GIBT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Die Mandantengrenze steht in dieser Codebasis **80-mal einzeln** in 18
 * Route-Dateien (docs/ORG_GRENZE_BEFUND.md, 2026-08-11). Die naheliegende
 * Antwort — konsolidieren — beantwortet die falsche Frage. Die Recherche vom
 * 2026-08-19 hat die 80 Kopien untereinander als erstaunlich EINHEITLICH
 * befunden; gefaehrlich waren die Stellen, an denen **gar keine Kopie stand**.
 * Fuenf davon wurden gefunden, drei mit schreibendem Cross-Org-Zugriff
 * (Konditionsrahmen, Rechnungen, Freigaben). Eine Konsolidierung der 80 haette
 * keine einzige davon gefunden — ein Waechter meldet sie beim Anlegen.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WIE ER ARBEITET — DREI SCHICHTEN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * (A) VOLLSTAENDIGKEIT — jede Route mit einem Pfad-Platzhalter in einem
 *     abgedeckten Router muss im Register stehen, mit einem Urteil. Die
 *     Aufzaehlung kommt aus dem **Router-Objekt** (`listRoutes`), nicht aus dem
 *     Quelltext: das ist die Lehre aus Welle G6, wo ein Quelltext-Test einen
 *     Mutanten ueberleben liess, weil `if (false && X)` die gesuchte
 *     Zeichenkette weiterhin enthaelt. Wer eine `:id`-Route anlegt und das
 *     Register nicht anfasst, bekommt hier rot. **Genau das haette E-1 bis E-4
 *     beim Anlegen gemeldet.**
 *
 * (B) VERHALTEN — jede als `verhaltensgeprueft` eingetragene Route laeuft
 *     gegen einen Spion-Pool, der jede Abfrage mitschreibt und jede Zeile als
 *     FREMD beantwortet. Vier Zusicherungen, wobei erst 2 bis 4 den Beweis
 *     tragen (Details in helpers/orgGrenzenSpion.js), dazu die Gegenprobe mit
 *     der eigenen Org. Das ist strikt mehr als das vorhandene
 *     `test/security/coreFlowCrossTenant.test.js`, das nur `res._status === 403`
 *     prueft.
 *
 * (C) BESTANDSBUCH — jede Datei in `routes/` ist entweder abgedeckt oder unter
 *     `nichtAbgedeckt` mit Begruendung eingetragen. Ohne diese Schicht bliebe
 *     die ehrlichste Zahl der Recherche unsichtbar: geprueft wurden 18 von 82
 *     Route-Dateien. Eine neue Datei macht diesen Test rot — die Luecke kann
 *     nicht mehr stillschweigend wachsen.
 *
 * (D) SELBSTPROBE — drei absichtlich kaputte Mini-Router (Grenze vergessen /
 *     Grenze nach dem Schreiben / Grenze auf dem falschen Parameter) MUESSEN
 *     gemeldet werden. Ohne sie waere ein kaputter Pruefer von einem sauberen
 *     Bestand nicht zu unterscheiden — dieselbe Begruendung, die
 *     `sqlSchemaWaechter.test.js` in seinem Punkt (f) fuer sich selbst gibt.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WAS ER NICHT BEWEIST (ehrliche Grenze, gehoert ins Gate statt uebertuencht)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Er beweist die Entscheidung des Handlers und die Parameteruebergabe. Er
 * beweist NICHT, dass ein Service-SQL sein `AND org_id = $2` behalten hat:
 * nimmt jemand die Klausel heraus, uebergibt den Parameter aber weiter, bleibt
 * Schicht (B) gruen. Diese Luecke deckt `sqlSchemaWaechter.test.js` plus die
 * Mutationslaeufe auf den Services ab — und die Service-Tests, die das SQL
 * selbst befragen (siehe die Grenz-Abschnitte in rateCardService.test.js,
 * approvalService.test.js und operationalInvoice.test.js).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Router } from "express";

import {
  baseDeps, listRoutes, listRoutesTief, findHandlerExact, findChainFrom, mockReq, mockRes,
  ORG_A, ORG_B, USER_A, USER_B
} from "./helpers/security-mocks.js";
import { pruefeGrenze, istSchreibend, spionPool, pfadPlatzhalter } from "./helpers/orgGrenzenSpion.js";

/* Pfade IMMER relativ zur Testdatei aufloesen — nie ueber process.cwd().
   Sonst ueberspringt sich der Test je nach Startverzeichnis lautlos, und eine
   gruene Suite prueft weniger, als sie behauptet (CLAUDE.md §0.9). */
const HIER = path.dirname(fileURLToPath(import.meta.url));
const API  = path.resolve(HIER, "..");
const REGISTERPFAD = path.join(HIER, "fixtures", "orgGrenzen.json");

const register = JSON.parse(fs.readFileSync(REGISTERPFAD, "utf8"));

/**
 * Router-Fabriken der abgedeckten Dateien: Pool rein, montierter Router raus.
 *
 * Der Pool wird JE LAUF durchgereicht, weil die Fabriken ihn einschliessen —
 * ein vorher montierter Router arbeitete sonst an einem anderen Pool als dem,
 * den der Spion beobachtet.
 */
const FABRIKEN = {
  "rateCards.js":      async (pool) => (await import("../routes/rateCards.js")).createRateCardsRouter(baseDeps(pool)),
  "invoices.js":       async (pool) => (await import("../routes/invoices.js")).createInvoicesRouter(baseDeps(pool)),
  "approvals.js":      async (pool) => (await import("../routes/approvals.js")).createApprovalsRouter(baseDeps(pool)),
  "requisitions.js":   async (pool) => (await import("../routes/requisitions.js")).createRequisitionsRouter(baseDeps(pool)),
  "organizations.js":  async (pool) => (await import("../routes/organizations.js")).createOrganizationsRouter(baseDeps(pool)),
  "contracts.js":      async (pool) => (await import("../routes/contracts.js")).createContractsRouter(baseDeps(pool)),
  "assignments.js":    async (pool) => (await import("../routes/assignments.js")).createAssignmentsRouter(baseDeps(pool)),
  "vendorPool.js":     async (pool) => (await import("../routes/vendorPool.js")).createVendorPoolRouter(baseDeps(pool)),
  "complianceDocs.js": async (pool) => (await import("../routes/complianceDocs.js")).createComplianceDocsRouter(baseDeps(pool)),
  "documentCenter.js": async (pool) => (await import("../routes/documentCenter.js")).createDocumentCenterRouter(baseDeps(pool)),
  "timesheets.js":     async (pool) => (await import("../routes/timesheets.js")).createTimesheetsRouter({
                          ...baseDeps(pool),
                          getUserAndPlan: async () => ({ plan: "PRO", id: USER_A })
                        }),
  "capacityExchange.js": async (pool) => (await import("../routes/capacityExchange.js")).createCapacityExchangeRouter({
                          ...baseDeps(pool),
                          requireFeature: () => (_q, _s, n) => n(),
                          getUserAndPlan: async () => ({ plan: "PRO", id: USER_A })
                        }),
  "workerPortal.js":   async (pool) => (await import("../routes/workerPortal.js")).createWorkerPortalRouter(baseDeps(pool)),
  // SCIM ausdruecklich EINGESCHALTET: mit `config: {}` antwortet `scimGate` mit 404
  // ("nicht aktiviert") und die Probe pruefte den Aus-Schalter statt des Tores.
  "scim.js":           async (pool) => (await import("../routes/scim.js")).createScimRouter({
                          ...baseDeps(pool), config: { SCIM_ENABLED: true }
                        }),
  "staffControlCenter.js": async (pool) => (await import("../routes/staffControlCenter.js")).createStaffControlCenterRouter({
                          ...baseDeps(pool), sendMail: async () => {}
                        }),
  "marketplace.js":    async (pool) => (await import("../routes/marketplace.js")).createMarketplaceRouter({
                          ...baseDeps(pool),
                          requireFeature: () => (_q, _s, n) => n(),
                          getUserAndPlan: async () => ({ plan: "PRO", id: USER_A }),
                          sendMail: async () => {}
                        })
};

const schluessel = (r) => `${r.methode || r.method} ${r.pfad || r.path}`;

/**
 * Standard-Abhaengigkeiten fuer Route-Fabriken ohne Sonderwuensche.
 * Alle Torwaechter und Limiter sind Durchreichen — sie sind NICHT der
 * Gegenstand dieser Pruefung; wo eine Eintrittsbedingung geprueft wird,
 * geschieht das ausdruecklich ueber `torwaechter` im Register.
 */
function standardDeps(pool) {
  const durch = (_q, _s, n) => n();
  return {
    ...baseDeps(pool),
    requireFeature: () => durch,
    getUserAndPlan: async () => ({ plan: "PRO", id: USER_A }),
    sendMail: async () => {},
    requestLimiter: durch,
    authLimiter: durch,
    cronRateLimit: durch,
    occRateLimit: durch,
    config: {}
  };
}

/**
 * Eine Route-Datei montieren. Steht sie nicht in FABRIKEN, wird ihre einzige
 * `create*Router`-Ausfuhr mit den Standard-Abhaengigkeiten aufgerufen — sonst
 * muesste fuer jede der ueber achtzig Dateien eine eigene Zeile stehen, und
 * eine vergessene Zeile waere eine stille Luecke.
 */
async function montiereDatei(datei, pool) {
  if (FABRIKEN[datei]) return FABRIKEN[datei](pool);
  const mod = await import(`../routes/${datei}`);
  const fabrik = Object.keys(mod).find((k) => /^create\w*Router$/.test(k));
  if (!fabrik) throw new Error(`${datei}: keine create*Router-Ausfuhr gefunden`);
  return mod[fabrik](standardDeps(pool));
}

/** Router mit einem leeren Pool montieren — nur fuer die Aufzaehlung. */
async function montiere(datei) {
  return montiereDatei(datei, { query: async () => ({ rows: [] }) });
}

/* ═════════════════════════════════════════════════════════════════════════
   (A) VOLLSTAENDIGKEIT — keine :id-Route ohne Urteil
   ═════════════════════════════════════════════════════════════════════════ */

describe("Org-Grenzen-Waechter (A) — jede Platzhalter-Route hat ein Urteil", () => {
  for (const eintrag of register.abgedeckteRouter) {
    it(`${eintrag.datei}: Register und Router stimmen ueberein`, async () => {
      const router = await montiere(eintrag.datei);
      // TIEF aufzaehlen: eine Datei, die nur Sub-Router montiert, meldet flach
      // null Routen und waere still als "nichts zu pruefen" durchgegangen.
      const echte = listRoutesTief(router)
        .filter((r) => r.path.includes(":"))
        .map(schluessel)
        .sort();
      const registrierte = eintrag.routen.map(schluessel).sort();

      const fehlend = echte.filter((k) => !registrierte.includes(k));
      const verwaist = registrierte.filter((k) => !echte.includes(k));

      assert.deepStrictEqual(
        fehlend, [],
        `Diese Routen tragen einen Platzhalter, stehen aber nicht im Register ` +
        `(${path.relative(API, REGISTERPFAD)}). Jede von ihnen kann eine fremde ` +
        `Zeile treffen — sie braucht ein Urteil: "verhaltensgeprueft" oder ` +
        `"bewusste-ausnahme" mit Begruendung.`
      );
      assert.deepStrictEqual(
        verwaist, [],
        "Das Register kennt Routen, die es nicht mehr gibt — Karteileichen taeuschen Abdeckung vor."
      );
    });

    it(`${eintrag.datei}: jede bewusste Ausnahme traegt eine Begruendung`, () => {
      for (const r of eintrag.routen) {
        assert.ok(
          ["verhaltensgeprueft", "bewusste-ausnahme"].includes(r.urteil),
          `${schluessel(r)}: unbekanntes Urteil '${r.urteil}'`
        );
        if (r.urteil === "bewusste-ausnahme") {
          assert.ok(
            typeof r.begruendung === "string" && r.begruendung.length >= 20,
            `${schluessel(r)}: eine Ausnahme ohne Begruendung ist eine Luecke mit Etikett`
          );
        }
        // Wer eine Zusicherung abschaltet, muss sagen warum — sonst waere jede
        // unbequeme Route mit einem Schalter statt mit Arbeit zu erledigen.
        if (r.gegenprobe === false || r.schreibenGrenztSelbst === true) {
          assert.ok(
            typeof r.hinweis === "string" && r.hinweis.length >= 30,
            `${schluessel(r)}: 'gegenprobe:false' bzw. 'schreibenGrenztSelbst:true' ` +
            "braucht einen 'hinweis', der den Beleg nennt"
          );
        }
      }
    });
  }
});

/* ═════════════════════════════════════════════════════════════════════════
   (B) VERHALTEN — die Grenze wird ausgefuehrt, nicht gelesen
   ═════════════════════════════════════════════════════════════════════════ */

describe("Org-Grenzen-Waechter (B) — Verhaltensprobe mit Spion-Pool", () => {
  for (const eintrag of register.abgedeckteRouter) {
    for (const r of eintrag.routen.filter((x) => x.urteil === "verhaltensgeprueft")) {
      it(`${eintrag.datei} · ${schluessel(r)}`, async () => {
        // Liegt die Grenze in einem benannten Middleware, wird die Kette ab
        // dort ausgefuehrt — sonst meldet die Probe eine bewachte Route als
        // Luecke (Fallstrick 5 des Plans).
        const baueHandler = async (pool) => {
          const router = await montiereDatei(eintrag.datei, pool);
          return r.grenzeIn
            ? findChainFrom(router, r.methode, r.pfad, r.grenzeIn)
            : findHandlerExact(router, r.methode, r.pfad);
        };

        const { maengel } = await pruefeGrenze({
          baueHandler,
          pfad: r.pfad,
          art: r.art || "ressource",
          zeile: r.zeile || {},
          anfrage: r.anfrage || {},
          traegerspalten: r.traegerspalten || ["org_id"],
          erwartung: r.erwartung || "403",
          lesenMussZusammen: r.lesenMussZusammen || [],
          orgPlatzhalter: r.orgPlatzhalter || "id",
          seitenprobe: r.seitenprobe !== false,
          reqZusatz: r.reqZusatz || {},
          identitaet: r.identitaet || "org",
          schreibenGrenztSelbst: r.schreibenGrenztSelbst === true,
          gegenprobe: r.gegenprobe !== false,
          leereAntwortFuer: r.leereAntwortFuer || [],
          nutzerEigen: USER_A,
          nutzerFremd: USER_B,
          orgEigen: ORG_A,
          orgFremd: ORG_B,
          schreibtBeiErfolg: r.schreibtBeiErfolg === true,
          orgImSql: r.orgImSql === true,
          baueReq: mockReq,
          baueRes: mockRes
        });

        assert.deepStrictEqual(
          maengel, [],
          `${r.methode.toUpperCase()} ${r.pfad} haelt die Mandantengrenze nicht:\n  - ` +
          maengel.join("\n  - ")
        );
      });
    }
  }
});

/* ═════════════════════════════════════════════════════════════════════════
   (B2) TORWAECHTER — Flaechen mit EINER Eintrittsbedingung
   ═════════════════════════════════════════════════════════════════════════

   Nicht jede Flaeche traegt eine Mandantengrenze je Route. Das Arbeiterportal
   und das Staff Control Center haben stattdessen EINE Eintrittsbedingung, die
   auf JEDER Route stehen muss — `requireWorkerRole` bzw. `staffControlAccess`.
   Fuer sie ist die richtige Frage nicht "403 bei fremder Org?", sondern:
   **gibt es eine Route, die den Torwaechter nicht traegt?**

   Geprueft wird beides, und zwar ausgefuehrt statt gelesen:
     1. der Torwaechter steht in JEDER Platzhalter-Route der Datei,
     2. ohne die Voraussetzung antwortet er mit dem erwarteten Status,
     3. und es wird dabei nichts geschrieben.

   Punkt 2 ist der Grund, warum das kein Struktur-Test ist: ein Middleware, der
   dasteht und `next()` ruft, faellt hier durch.                              */

describe("Org-Grenzen-Waechter (B2) — Torwaechter der Sonderflaechen", () => {
  for (const eintrag of register.abgedeckteRouter.filter((e) => e.torwaechter)) {
    const tor = eintrag.torwaechter;

    it(`${eintrag.datei}: '${tor.middleware}' steht auf JEDER Platzhalter-Route`, async () => {
      const router = await montiere(eintrag.datei);
      const ohne = [];
      for (const layer of router.stack) {
        if (!layer.route || !layer.route.path.includes(":")) continue;
        const namen = layer.route.stack.map((x) => x.handle.name);
        if (!namen.includes(tor.middleware)) {
          ohne.push(`${Object.keys(layer.route.methods)[0].toUpperCase()} ${layer.route.path}`);
        }
      }
      // Sub-Router waeren hier unsichtbar; eine Torwaechter-Flaeche darf keine haben,
      // solange die Kette nicht auch durch sie hindurch geprueft wird.
      const montierte = listRoutesTief(router).filter((r) => r.montiert && r.path.includes(":"));
      assert.deepStrictEqual(
        montierte.map((r) => `${r.method.toUpperCase()} ${r.path}`), [],
        "Diese Flaeche montiert Sub-Router mit Platzhalter-Routen — der Torwaechter " +
        "wird dort nicht mitgeprueft."
      );
      assert.deepStrictEqual(
        ohne, [],
        `Diese Routen tragen '${tor.middleware}' nicht — auf einer Sonderflaeche ist ` +
        "das die einzige Eintrittsbedingung, und eine Route ohne sie steht offen."
      );
    });

    it(`${eintrag.datei}: '${tor.middleware}' weist ohne Voraussetzung ab und schreibt nichts`, async () => {
      const maengel = [];
      for (const r of eintrag.routen) {
        const pool = spionPool({ zeile: { id: "x" } });
        const router = await montiereDatei(eintrag.datei, pool);
        let kette;
        try {
          kette = findChainFrom(router, r.methode, r.pfad, tor.middleware);
        } catch (err) {
          maengel.push(`${schluessel(r)}: ${err.message}`);
          continue;
        }
        const req = mockReq({
          params: Object.fromEntries(pfadPlatzhalter(r.pfad).map((n) => [n, "irgendeine-id"])),
          ...(tor.ohneVoraussetzung || {})
        });
        const res = mockRes();
        try { await kette(req, res, () => {}); } catch { /* ein Wurf ist auch eine Abweisung */ }
        if (res._status !== tor.erwarteterStatus) {
          maengel.push(`${schluessel(r)}: ${res._status} statt ${tor.erwarteterStatus}`);
        }
        if (pool.schreibvorgaenge.length > 0) {
          maengel.push(`${schluessel(r)}: hat ohne Voraussetzung geschrieben`);
        }
      }
      assert.deepStrictEqual(maengel, [], `Torwaechter '${tor.middleware}' greift nicht ueberall`);
    });
  }
});

/* ═════════════════════════════════════════════════════════════════════════
   (C) BESTANDSBUCH — die ungeprueften Dateien bleiben sichtbar
   ═════════════════════════════════════════════════════════════════════════ */

describe("Org-Grenzen-Waechter (C) — das Bestandsbuch der Route-Dateien", () => {
  /* REKURSIV: `routes/occ/` traegt 14 weitere Dateien. Ein Bestandsbuch, das nur
     die oberste Ebene liest, fuehrt eine ganze Flaeche nicht — und merkt es nie. */
  function alleRouteDateien(verzeichnis, praefix = "") {
    const gefunden = [];
    for (const eintrag of fs.readdirSync(verzeichnis, { withFileTypes: true })) {
      const rel = praefix ? `${praefix}/${eintrag.name}` : eintrag.name;
      if (eintrag.isDirectory()) {
        gefunden.push(...alleRouteDateien(path.join(verzeichnis, eintrag.name), rel));
      } else if (eintrag.name.endsWith(".js")) {
        gefunden.push(rel);
      }
    }
    return gefunden;
  }
  const dateien = alleRouteDateien(path.join(API, "routes")).sort();

  it("jede Route-Datei ist entweder abgedeckt oder mit Begruendung ausgesetzt", () => {
    const abgedeckt = register.abgedeckteRouter.map((e) => e.datei);
    const ausgesetzt = Object.keys(register.nichtAbgedeckt || {});
    const unbekannt = dateien.filter((f) => !abgedeckt.includes(f) && !ausgesetzt.includes(f));

    assert.deepStrictEqual(
      unbekannt, [],
      "Neue Route-Dateien, die weder abgedeckt noch ausgesetzt sind. Die " +
      "Recherche hat 18 von 82 Dateien geprueft; diese Zeile sorgt dafuer, " +
      "dass die Luecke nicht stillschweigend waechst."
    );

    const verschwunden = [...abgedeckt, ...ausgesetzt].filter((f) => !dateien.includes(f));
    assert.deepStrictEqual(verschwunden, [], "Das Bestandsbuch fuehrt Dateien, die es nicht mehr gibt.");
  });

  it("jede Aussetzung nennt einen Grund", () => {
    for (const [datei, grund] of Object.entries(register.nichtAbgedeckt || {})) {
      assert.ok(
        typeof grund === "string" && grund.length >= 10,
        `${datei}: eine Aussetzung ohne Grund ist keine Entscheidung, sondern ein Versaeumnis`
      );
    }
  });

  it("die Abdeckung faellt nicht zurueck (Sperrklinke)", () => {
    const geprueft = register.abgedeckteRouter
      .reduce((n, e) => n + e.routen.filter((r) => r.urteil === "verhaltensgeprueft").length, 0);
    assert.ok(
      geprueft >= register.grundlinie.verhaltensgeprueft,
      `Verhaltensgeprueft sind ${geprueft} Routen, die Grundlinie fordert ` +
      `${register.grundlinie.verhaltensgeprueft}. Abdeckung darf wachsen, nicht schrumpfen — ` +
      "wer eine Route auf 'bewusste-ausnahme' zurueckstuft, hebt die Grundlinie bewusst."
    );
  });
});

/* ═════════════════════════════════════════════════════════════════════════
   (D) SELBSTPROBE — der Pruefer an drei absichtlichen Fehlern
   ═════════════════════════════════════════════════════════════════════════

   Ohne diese Schicht waere "alles gruen" nicht von "der Pruefer sieht nichts"
   zu unterscheiden. Die drei Muster sind genau die, die in der Wirklichkeit
   aufgetreten sind: E-1/E-3/E-4 hatten gar keine Grenze, und E-5 pruefte den
   falschen Parameter.                                                        */

describe("Org-Grenzen-Waechter (D) — Selbstprobe an kaputten Routern", () => {
  /** Mini-Router, dessen Handler eine Zeile laedt und danach schreibt. */
  function baueMini(handler) {
    const router = Router();
    router.post("/probe/:id", handler);
    return router;
  }

  async function probiere(handler, extra = {}) {
    return pruefeGrenze({
      baueHandler: () => findHandlerExact(baueMini(handler), "post", "/probe/:id"),
      pfad: "/probe/:id",
      orgEigen: ORG_A,
      orgFremd: ORG_B,
      schreibtBeiErfolg: true,
      baueReq: mockReq,
      baueRes: mockRes,
      ...extra
    });
  }

  it("(a) Grenze vergessen — wird gemeldet", async () => {
    const { maengel } = await probiere(async (req, res) => {
      const { rows } = await req.pool.query("SELECT * FROM sachen WHERE id = $1", [req.params.id]);
      if (!rows[0]) return res.status(404).json({ error: "NOT_FOUND" });
      await req.pool.query("UPDATE sachen SET status = 'aktiv' WHERE id = $1", [req.params.id]);
      res.json({ ok: true });
    });
    assert.ok(maengel.length > 0, "eine Route ganz ohne Grenze muss auffallen");
    assert.ok(maengel.some((m) => /403/.test(m)), "der fehlende 403 muss benannt werden");
  });

  it("(b) Grenze NACH dem Schreiben — wird gemeldet", async () => {
    const { maengel } = await probiere(async (req, res) => {
      const { rows } = await req.pool.query("SELECT * FROM sachen WHERE id = $1", [req.params.id]);
      // Der Schreibvorgang steht VOR der Pruefung — der Statuscode stimmt am
      // Ende trotzdem. Genau diese Route besteht einen reinen 403-Test.
      await req.pool.query("UPDATE sachen SET status = 'aktiv' WHERE id = $1", [req.params.id]);
      if (rows[0] && rows[0].org_id !== req.orgId) {
        return res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION" });
      }
      res.json({ ok: true });
    });
    assert.ok(
      maengel.some((m) => /geschrieben/.test(m)),
      "'erst schreiben, dann 403' muss als Schreibvorgang gemeldet werden — " +
      "gemeldet wurde: " + JSON.stringify(maengel)
    );
  });

  it("(c) Grenze auf dem FALSCHEN Parameter — wird gemeldet", async () => {
    // Nachbildung von E-5: geprueft wird eine Kennung, die der Nutzer selbst
    // setzt; geholt wird ueber eine andere.
    const { maengel } = await probiere(
      async (req, res) => {
        if (req.query.org !== req.orgId) {
          return res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION" });
        }
        const { rows } = await req.pool.query(
          "SELECT * FROM sachen WHERE id = $1", [req.query.ziel]
        );
        res.json({ items: rows });
      },
      { anfrage: { query: { org: ORG_A, ziel: "eine-fremde-zeile" } }, schreibtBeiErfolg: false }
    );
    assert.ok(
      maengel.some((m) => /Ressourcen-ID/.test(m)),
      "eine Pruefung auf dem falschen Parameter muss auffallen, weil die " +
      "angefragte Ressourcen-ID in keiner Abfrage steht — gemeldet wurde: " +
      JSON.stringify(maengel)
    );
  });

  it("(d) eine korrekte Route wird NICHT gemeldet — sonst ist der Pruefer nur streng", async () => {
    const { maengel } = await probiere(async (req, res) => {
      const { rows } = await req.pool.query("SELECT * FROM sachen WHERE id = $1", [req.params.id]);
      if (!rows[0]) return res.status(404).json({ error: "NOT_FOUND" });
      if (rows[0].org_id !== req.orgId) {
        return res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION" });
      }
      await req.pool.query(
        "UPDATE sachen SET status = 'aktiv' WHERE id = $1 AND org_id = $2",
        [req.params.id, req.orgId]
      );
      res.json({ ok: true });
    });
    assert.deepStrictEqual(maengel, [], "eine saubere Route darf nicht gemeldet werden");
  });

  it("(g) halbierte zweiseitige Grenze — wird gemeldet", async () => {
    // Die Mutation, die der Waechter zunaechst UEBERLEBT hat: beide
    // Traegerspalten trugen in der Probe immer denselben Besitzer, also fiel
    // nicht auf, dass der Handler nur noch einen Zweig prueft.
    const { maengel } = await probiere(
      async (req, res) => {
        const { rows } = await req.pool.query("SELECT * FROM sachen WHERE id = $1", [req.params.id]);
        if (!rows[0]) return res.status(404).json({ error: "NOT_FOUND" });
        // Der supplier-Zweig fehlt — genau die Mutation aus contracts.js.
        if (rows[0].org_id !== req.orgId) {
          return res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION" });
        }
        await req.pool.query("UPDATE sachen SET x = 1 WHERE id = $1 AND org_id = $2", [req.params.id, req.orgId]);
        res.json({ ok: true });
      },
      { traegerspalten: ["org_id", "supplier_org_id"] }
    );
    assert.ok(
      maengel.some((m) => /nur einen Zweig/.test(m)),
      "eine halbierte zweiseitige Grenze muss auffallen — gemeldet wurde: " + JSON.stringify(maengel)
    );
  });

  it("(h) Listen-Route ohne Filter — wird gemeldet", async () => {
    // Die Grenze mancher Listen-Routen ist ein JS-Filter nach dem Laden. Faellt
    // er weg, bleibt der Statuscode 200 und nur die ANTWORT verraet das Leck.
    const { maengel } = await probiere(
      async (req, res) => {
        const { rows } = await req.pool.query("SELECT * FROM sachen WHERE eltern_id = $1", [req.params.id]);
        res.json({ items: rows }); // ungefiltert — die fremde Zeile geht raus
      },
      { erwartung: "zero-state", schreibtBeiErfolg: false }
    );
    assert.ok(
      maengel.some((m) => /enthaelt die fremde Org/.test(m)),
      "eine ungefilterte Liste muss auffallen — gemeldet wurde: " + JSON.stringify(maengel)
    );
  });

  it("(i) dieselbe Listen-Route MIT Filter wird nicht gemeldet", async () => {
    const { maengel } = await probiere(
      async (req, res) => {
        const { rows } = await req.pool.query("SELECT * FROM sachen WHERE eltern_id = $1", [req.params.id]);
        res.json({ items: rows.filter((r) => r.org_id === req.orgId) });
      },
      { erwartung: "zero-state", schreibtBeiErfolg: false }
    );
    assert.deepStrictEqual(maengel, [], "eine korrekt siebende Liste darf nicht gemeldet werden");
  });

  it("(j) Torwaechter: eine Route ohne ihn wird gemeldet", () => {
    // Nachbildung der Sonderflaechen-Pruefung (B2) auf einem Mini-Router, bei
    // dem GENAU EINE Route den Torwaechter vergisst.
    function torwaechter(_req, res) { return res.status(401).json({ error: "NEIN" }); }
    const router = Router();
    router.get("/a/:id", torwaechter, (_q, r) => r.json({ ok: true }));
    router.get("/b/:id", (_q, r) => r.json({ ok: true }));   // vergessen

    const ohne = [];
    for (const layer of router.stack) {
      if (!layer.route || !layer.route.path.includes(":")) continue;
      if (!layer.route.stack.map((x) => x.handle.name).includes("torwaechter")) {
        ohne.push(layer.route.path);
      }
    }
    assert.deepStrictEqual(ohne, ["/b/:id"], "die ungeschuetzte Route muss auffallen");
  });

  it("(k) Torwaechter: einer, der durchwinkt, wird gemeldet", async () => {
    // Ein Middleware, der DASTEHT und trotzdem next() ruft, ist der gefaehrlichere
    // Fall — ein reiner Struktur-Test wuerde ihn nie sehen.
    function torwaechter(_req, _res, next) { return next(); }
    const router = Router();
    router.post("/a/:id", torwaechter, async (req, r) => {
      await req.pool.query("UPDATE sachen SET x = 1 WHERE id = $1", [req.params.id]);
      r.json({ ok: true });
    });

    const pool = spionPool({ zeile: { id: "x" } });
    const kette = findChainFrom(router, "post", "/a/:id", "torwaechter");
    const req = mockReq({ params: { id: "irgendeine-id" } });
    req.pool = pool;
    const res = mockRes();
    await kette(req, res, () => {});

    assert.notEqual(res._status, 401, "der durchwinkende Torwaechter muss auffallen");
    assert.ok(pool.schreibvorgaenge.length > 0, "und er laesst dabei sogar schreiben");
  });

  it("(l) montierte Sub-Router werden gesehen — der flache Blick sieht sie nicht", () => {
    // Der Fund, der diese Schicht ausgeloest hat: `ownerControlCenter.js`
    // definiert KEINE eigene Route, sondern montiert 13 Sub-Router. Flach
    // gezaehlt meldet die Datei null Routen — und waere im Register still als
    // "nichts zu pruefen" durchgegangen.
    const unter = Router();
    unter.get("/sachen/:id", (_q, r) => r.json({}));
    const oben = Router();
    oben.use("/bereich", unter);

    assert.deepStrictEqual(
      listRoutes(oben), [],
      "der flache Blick MUSS hier leer sein — sonst prueft die Selbstprobe nichts"
    );
    const tief = listRoutesTief(oben);
    assert.equal(tief.length, 1, "die tiefe Aufzaehlung muss die montierte Route finden");
    assert.equal(tief[0].path, "/sachen/:id");
    assert.equal(tief[0].montiert, true, "sie muss als montiert erkennbar sein");
  });

  it("(m) das Bestandsbuch steigt in Unterverzeichnisse hinab", () => {
    // `routes/occ/` traegt 14 Dateien. Ein Bestandsbuch, das nur die oberste
    // Ebene liest, fuehrt eine ganze Flaeche nicht — und merkt es nie.
    const registriert = new Set([
      ...register.abgedeckteRouter.map((e) => e.datei),
      ...Object.keys(register.nichtAbgedeckt || {})
    ]);
    const occDateien = [...registriert].filter((d) => d.startsWith("occ/"));
    assert.ok(
      occDateien.length >= 14,
      `das Bestandsbuch kennt nur ${occDateien.length} Dateien unter occ/ — es liest nicht rekursiv`
    );
  });

  it("(e) der Schreib-Erkenner unterscheidet Lesen von Schreiben", () => {
    // `deleted_at` und `updated_at` enthalten die Schluesselwoerter als
    // Wortanfang — ein naiver Zeichenketten-Test haelt beide SELECTs fuer
    // Schreibvorgaenge und macht den ganzen Waechter wertlos.
    assert.equal(istSchreibend("SELECT * FROM x WHERE deleted_at IS NULL"), false);
    assert.equal(istSchreibend("SELECT updated_at FROM x"), false);
    assert.equal(istSchreibend("  \n  -- Kommentar\n  UPDATE x SET a = 1"), true);
    assert.equal(istSchreibend("INSERT INTO x VALUES (1)"), true);
    assert.equal(istSchreibend("DELETE FROM x WHERE id = $1"), true);
    assert.equal(istSchreibend("WITH neu AS (SELECT 1) INSERT INTO x SELECT * FROM neu"), true);
    assert.equal(istSchreibend("WITH a AS (SELECT 1) SELECT * FROM a"), false);
  });

  it("(f) der Spion zaehlt Transaktionsklammern nicht als Abfrage", async () => {
    const pool = spionPool({ zeile: { id: "x" } });
    await pool.query("BEGIN");
    await pool.query("SELECT 1");
    await pool.query("COMMIT");
    assert.equal(pool.calls.length, 1, "BEGIN/COMMIT sind keine Abfragen im Sinne der Pruefung");
  });
});
