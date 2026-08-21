/**
 * Der Wach-Waechter — welche Wache gehoert auf welchen Weg? (Befund P1-21)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WARUM ES IHN GIBT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Befund P1-20 hat gezeigt, wie eine fehlende Berechtigungspruefung ueberlebt:
 * `POST /requisitions/:id/transition` trug keine, aber `requireScope` SAH aus
 * wie eine — und `requirePermission` gab eine NAMENLOSE Closure zurueck. Der
 * bestehende Test konnte deshalb nur Middleware ZAEHLEN
 * (`assert.ok(names.length >= 2)`). Eine Route ohne Pruefung sah aus wie eine
 * mit.
 *
 * Erst nachdem fuenf Wach-Erzeuger Namen bekommen haben — `requirePermission`,
 * `requireRole`, `requireInternalPermission`, `supportAuth`, `ownerControlAuth`
 * — laesst sich die Frage ueberhaupt stellen.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WAS ER NICHT TUT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Er fordert NICHT pauschal `requirePermission`. Von 415 schreibenden Wegen
 * tragen 161 eine Berechtigungspruefung — die uebrigen sind deshalb nicht
 * ungeschuetzt, sondern ANDERS geschuetzt: durch eine Eintrittsbedingung der
 * Flaeche, durch die Bindung am Vorgang (vom Org-Grenzen-Waechter ausgefuehrt
 * geprueft), durch das Zeitplan-Geheimnis, weil sie nur auf eigene Daten
 * wirken, durch eine Rolle im Handler, oder weil sie bewusst ohne Mandant
 * erreichbar sind.
 *
 * Ein Waechter, der das nicht unterscheidet, produziert 254 Falschmeldungen und
 * wird abgeschaltet. Deshalb ein REGISTER: je Weg ein Urteil mit Begruendung,
 * genau wie beim Org-Grenzen-Waechter.
 */

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  baseDeps, listRoutesTief, findChainFrom, mockReq, mockRes, USER_A, ORG_A
} from "./helpers/security-mocks.js";
import { spionPool } from "./helpers/orgGrenzenSpion.js";

const API = path.resolve(import.meta.dirname ?? ".", "..");
const register = JSON.parse(
  fs.readFileSync(path.join(API, "test", "fixtures", "wachen.json"), "utf8")
);

const ARTEN = new Set([
  "berechtigung", "flaechentor", "cron", "besitz",
  "eigene-daten", "inline-rolle", "oeffentlich", "BEFUND"
]);
const SCHREIBEND = new Set(["post", "patch", "put", "delete"]);
const UUID = "11111111-1111-4111-a111-111111111111";
const durch = (_q, _s, n) => n();

function deps(pool) {
  return {
    ...baseDeps(pool),
    requireFeature: () => durch,
    getUserAndPlan: async () => ({ plan: "PRO", id: USER_A, role: "company" }),
    sendMail: async () => {},
    requestLimiter: durch, authLimiter: durch, cronRateLimit: durch,
    occRateLimit: durch, supportRateLimit: durch, config: {}
  };
}

async function montiere(datei, pool) {
  const mod = await import(`../routes/${datei}`);
  const fabrik = Object.keys(mod).find((k) => /^create\w*Router$/.test(k));
  return mod[fabrik](deps(pool));
}

function alleRouteDateien(verzeichnis, praefix = "") {
  const raus = [];
  for (const e of fs.readdirSync(verzeichnis, { withFileTypes: true })) {
    const rel = praefix ? `${praefix}/${e.name}` : e.name;
    if (e.isDirectory()) raus.push(...alleRouteDateien(path.join(verzeichnis, e.name), rel));
    else if (e.name.endsWith(".js")) raus.push(rel);
  }
  return raus;
}

/* ═════════════════════════════════════════════════════════════════════════
   (A) BESTANDSBUCH — jeder schreibende Weg hat ein Urteil
   ═════════════════════════════════════════════════════════════════════════ */

describe("Wach-Waechter (A) — das Bestandsbuch der schreibenden Wege", () => {
  let echt;

  before(async () => {
    echt = [];
    for (const datei of alleRouteDateien(path.join(API, "routes")).sort()) {
      let router;
      try {
        router = await montiere(datei, spionPool({ zeile: null }));
      } catch {
        continue;   // `occ/_helpers.js` fuehrt keinen Router — kein Befund.
      }
      for (const r of listRoutesTief(router)) {
        if (SCHREIBEND.has(r.method)) echt.push(`${datei} ${r.method} ${r.path}`);
      }
    }
  });

  it("jeder schreibende Weg steht im Register", () => {
    const bekannt = new Set(register.wege.map((w) => `${w.datei} ${w.methode} ${w.pfad}`));
    const fehlend = echt.filter((k) => !bekannt.has(k));
    assert.deepStrictEqual(
      fehlend, [],
      "Neue schreibende Routen ohne Urteil im Register. Das ist die Absicht: " +
      "wer eine anlegt, muss benennen, welche Wache sie traegt."
    );
  });

  it("das Register fuehrt keine Wege, die es nicht mehr gibt", () => {
    const vorhanden = new Set(echt);
    const verschwunden = register.wege
      .map((w) => `${w.datei} ${w.methode} ${w.pfad}`)
      .filter((k) => !vorhanden.has(k));
    assert.deepStrictEqual(verschwunden, [], "Das Register fuehrt Karteileichen.");
  });

  it("jedes Urteil ist bekannt und begruendet", () => {
    const maengel = [];
    for (const w of register.wege) {
      const schluessel = `${w.datei} ${w.methode.toUpperCase()} ${w.pfad}`;
      if (!ARTEN.has(w.wachart)) maengel.push(`${schluessel}: unbekannte Wachart '${w.wachart}'`);
      /* `berechtigung` traegt ihre Begruendung im Code selbst — im Namen des
         Middleware. Alles andere ist ein URTEIL und braucht einen Grund. */
      if (w.wachart !== "berechtigung" && !(w.begruendung || "").trim()) {
        maengel.push(`${schluessel}: Urteil '${w.wachart}' ohne Begruendung`);
      }
    }
    assert.deepStrictEqual(maengel, []);
  });

  it("die Abdeckung faellt nicht zurueck (Sperrklinke)", () => {
    const berechtigung = register.wege.filter((w) => w.wachart === "berechtigung").length;
    assert.ok(
      register.wege.length >= register.grundlinie.wege,
      `Nur noch ${register.wege.length} Wege im Register, Grundlinie ist ${register.grundlinie.wege}.`
    );
    assert.ok(
      berechtigung >= register.grundlinie.berechtigung,
      `Nur noch ${berechtigung} per Berechtigung bewachte Wege, Grundlinie ist ` +
      `${register.grundlinie.berechtigung}. Wer eine Route auf eine schwaechere ` +
      "Wachart zuruecksetzt, tut das bewusst und mit Begruendung."
    );
  });
});

/* ═════════════════════════════════════════════════════════════════════════
   (B) VERHALTENSPROBE — eine Rolle ohne Rechte kommt nirgends durch
   ═════════════════════════════════════════════════════════════════════════

   Die Frage, die ein Struktur-Test nicht beantworten kann: greift die Wache
   auch? Der Aufruf laeuft mit einer Mitgliedschaft, deren Rollenschluessel im
   Katalog nicht vorkommt — `hasPermission` liefert dafuer bei JEDEM Recht
   `false`. Wer trotzdem durchkommt, hat keine wirksame Pruefung.               */

describe("Wach-Waechter (B) — die Berechtigungspruefung greift wirklich", () => {
  const NAMEN = [
    "requirePermissionMiddleware",
    "requireRoleMiddleware",
    "requireInternalPermissionMiddleware"
  ];

  for (const w of register.wege.filter((x) => x.wachart === "berechtigung")) {
    it(`${w.datei} · ${w.methode} ${w.pfad}`, async () => {
      const pool = spionPool({
        zeile: { id: "x", org_id: ORG_A },
        antwort: (sql) => (/org_memberships/i.test(String(sql))
          /* Eine Mitgliedschaft mit einem Rollenschluessel, den der Katalog
             nicht kennt: sie haelt damit KEIN einziges Recht. */
          ? { rows: [{ id: "m1", org_id: ORG_A, user_id: USER_A, role_key: "ohne-rechte", is_active: true }] }
          : undefined)
      });
      const router = await montiere(w.datei, pool);

      let kette = null;
      for (const name of NAMEN) {
        try { kette = findChainFrom(router, w.methode, w.pfad, name); break; } catch { /* naechster */ }
      }
      assert.ok(
        kette,
        `Das Register sagt 'berechtigung', aber keiner der bekannten Wach-Namen ` +
        `steht auf diesem Weg: ${NAMEN.join(", ")}.`
      );

      const res = mockRes();
      const req = mockReq({
        orgId: ORG_A,
        session: { userId: USER_A },
        orgRole: "ohne-rechte",
        orgMembership: { role_key: "ohne-rechte" },
        params: Object.fromEntries(
          (w.pfad.match(/:(\w+)/g) || []).map((p) => [p.slice(1), UUID])
        ),
        body: {}
      });
      try { await kette(req, res, () => {}); } catch { /* ein Wurf ist auch eine Abweisung */ }
      for (let i = 0; i < 3; i++) await new Promise((f) => setImmediate(f));

      assert.ok(
        res._status === 401 || res._status === 403,
        `Eine Rolle ohne jedes Recht kam bis zum Handler durch (Status ${res._status}). ` +
        "Die Berechtigungspruefung greift hier nicht."
      );
      assert.deepStrictEqual(
        pool.schreibvorgaenge.map((c) => c.sql.slice(0, 50)), [],
        "Und sie hat dabei geschrieben."
      );
    });
  }
});
