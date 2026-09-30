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

/*
 * ALLE Router-Fabriken einer Datei, nicht nur die erste.
 *
 * BEFUND (2026-08-24): Hier stand `Object.keys(mod).find(...)` — die ERSTE
 * passende Fabrik. `staffControlCenter.js` exportiert zwei:
 * `createStaffControlAuthRouter` (1 schreibende Route) steht vor
 * `createStaffControlCenterRouter` (50 schreibende Routen). Der Waechter sah
 * also jahrelang genau eine Route dieser Datei — und **50 schreibende Wege des
 * Staff Control Center standen nie im Bestandsbuch**: Pilotverlaengerung,
 * Hetzner-Neustart, Abo-Entscheidungen, Zugangsvergabe.
 *
 * Das ist die teuerste Sorte Luecke: ein Waechter, der gruen meldet, weil er
 * nicht hinsieht. Aufgefallen ist sie erst, als eine NEUE Route dieser Datei
 * ins Register eingetragen wurde und der Waechter sie als "Karteileiche"
 * meldete — er kannte sie nicht.
 */
async function montiere(datei, pool) {
  const mod = await import(`../routes/${datei}`);
  const fabriken = Object.keys(mod).filter((k) => /^create\w*Router$/.test(k));
  if (!fabriken.length) throw new Error("keine Router-Fabrik");
  return fabriken.map((name) => mod[name](deps(pool)));
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
      let routerListe;
      try {
        routerListe = await montiere(datei, spionPool({ zeile: null }));
      } catch {
        continue;   // `occ/_helpers.js` fuehrt keinen Router — kein Befund.
      }
      for (const router of routerListe) {
        for (const r of listRoutesTief(router)) {
          if (SCHREIBEND.has(r.method)) echt.push(`${datei} ${r.method} ${r.path}`);
        }
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
   (A2) DIE LESENDE SEITE — abgeleitet, nicht abgeschrieben (M2.3)
   ═════════════════════════════════════════════════════════════════════════

   WARUM HIER NICHT JEDER WEG EINZELN STEHT

   Von 471 lesenden Wegen tragen 457 eine Wache, die man SEHEN kann: sie steht
   benannt in der montierten Kette. Ein Register, das diese 457 Zeilen
   abschreibt, wiederholt nur, was ohnehin im Code steht — und die 14 echten
   Urteile gehen darin unter. Es wuerde ausserdem bei jeder neuen Route einen
   Eintrag verlangen, der nichts entscheidet.

   Abgeleitet wird deshalb aus der Kette, und eingetragen ist, was die Ableitung
   NICHT entscheiden kann. Das ist dieselbe Bauart wie beim Arbeiter-Riegel:
   fail-closed, mit benannter Ausnahmeliste.

   WAS DIE ABLEITUNG UEBERHAUPT MOEGLICH MACHT

   Namen. Eine namenlose Middleware ist unsichtbar — ein Waechter kann sie nur
   ZAEHLEN, und dabei sieht eine Route ohne Pruefung aus wie eine mit (Befund
   P1-20). `requireScope` war bis zum 2026-09-05 namenlos: 61 lesende Wege
   trugen sie, und in der montierten Kette hiessen alle "(anonym)". Die
   Ableitung haette sie als "gar keine Wache" eingestuft.
   ═════════════════════════════════════════════════════════════════════════ */

const LESEN = register.lesen;

/** Traegt der Handler ueberhaupt eine Mandantenkennung? (Quelltext, nicht Kette) */
function mandantenkennung(quelle, pfad) {
  const start = quelle.indexOf(`router.get("${pfad}"`);
  if (start === -1) return { org: false, user: false };
  let tiefe = 0, i = quelle.indexOf("{", start);
  if (i === -1) return { org: false, user: false };
  const von = i;
  for (; i < quelle.length && i < von + 20000; i++) {
    if (quelle[i] === "{") tiefe++;
    else if (quelle[i] === "}") { tiefe--; if (tiefe === 0) break; }
  }
  const rumpf = quelle.slice(von, i + 1);
  return {
    org: /req\.orgId/.test(rumpf),
    user: /req\.session(?:\?\.)?\.userId|req\.user(?:\?\.)?\.id/.test(rumpf)
  };
}

/* `berechtigung` schlaegt `besitz` schlaegt `flaechentor`: traegt ein Weg
   mehrere Wachen, zaehlt die staerkste. */
const RANG = ["berechtigung", "besitz", "flaechentor"];

function leiteAb(kette, kennung) {
  const arten = kette.map((n) => LESEN.wachen[n]).filter(Boolean);
  const stark = RANG.find((r) => arten.includes(r));
  if (stark) return stark;
  if (!kennung.org && !kennung.user) return "oeffentlich";
  if (kennung.user && !kennung.org) return "eigene-daten";
  return null;                        // die Ableitung entscheidet nicht
}

describe("Wach-Waechter (A2) — die lesenden Wege", () => {
  let lesend;

  before(async () => {
    lesend = [];
    for (const datei of alleRouteDateien(path.join(API, "routes")).sort()) {
      let routerListe;
      try { routerListe = await montiere(datei, spionPool({ zeile: null })); } catch { continue; }
      const quelle = fs.readFileSync(path.join(API, "routes", datei), "utf8");
      for (const router of routerListe) {
        for (const layer of router.stack) {
          if (!layer.route) continue;
          if (Object.keys(layer.route.methods)[0] !== "get") continue;
          lesend.push({
            datei, pfad: layer.route.path,
            kette: layer.route.stack.map((x) => x.handle.name || "(anonym)"),
            kennung: mandantenkennung(quelle, layer.route.path)
          });
        }
      }
    }
  });

  it("die Erhebung findet ueberhaupt lesende Wege", () => {
    /* Ohne diese Probe waere der ganze Abschnitt lautlos gruen, sobald das
       Montieren scheitert: eine leere Menge besteht jede Schleife. */
    assert.ok(lesend.length >= 400,
      `nur ${lesend.length} lesende Wege montiert — erwartet werden ueber 400. ` +
      "Entweder ist das Montieren kaputt, oder dieser Waechter liest ins Leere.");
  });

  it("jeder lesende Weg hat eine Wachart — abgeleitet oder eingetragen", () => {
    const ausnahme = new Set(LESEN.ausnahmen.map((a) => `${a.datei} ${a.pfad}`));
    const stumm = [];
    for (const w of lesend) {
      if (leiteAb(w.kette, w.kennung)) continue;
      if (ausnahme.has(`${w.datei} ${w.pfad}`)) continue;
      stumm.push(`${w.datei} GET ${w.pfad}  (Kette: ${w.kette.join(", ")})`);
    }
    assert.deepStrictEqual(stumm, [],
      "Diese lesenden Wege geben eine Mandantenkennung in eine Abfrage, tragen aber " +
      "keine erkennbare Wache und stehen in keiner Ausnahme. Das ist die Absicht: " +
      "fail-closed. Entweder eine benannte Wache davorsetzen ODER in " +
      "`wachen.json` -> `lesen.ausnahmen` eintragen, mit Begruendung:\n  " +
      stumm.join("\n  "));
  });

  it("jede Ausnahme ist bekannt, begruendet — und noch noetig", () => {
    const vorhanden = new Set(lesend.map((w) => `${w.datei} ${w.pfad}`));
    const nachKette = new Map(lesend.map((w) => [`${w.datei} ${w.pfad}`, w]));
    const maengel = [];
    for (const a of LESEN.ausnahmen) {
      const schluessel = `${a.datei} ${a.pfad}`;
      if (!vorhanden.has(schluessel)) {
        maengel.push(`${schluessel}: Karteileiche — den Weg gibt es nicht mehr`);
        continue;
      }
      if (!ARTEN.has(a.wachart)) maengel.push(`${schluessel}: unbekannte Wachart '${a.wachart}'`);
      if ((a.begruendung || "").trim().length < 40) {
        maengel.push(`${schluessel}: Begruendung fehlt oder ist zu duenn`);
      }
      /*
       * DIE WICHTIGERE RICHTUNG. Eine Ausnahme, die stehen bleibt, nachdem der
       * Weg eine erkennbare Wache bekommen hat, behauptet dauerhaft ein Urteil,
       * das niemand mehr faellen muss — und verdeckt, dass die Ableitung
       * inzwischen greift. Dasselbe Muster wie `ohne_einplanung` bei den Takten.
       */
      const w = nachKette.get(schluessel);
      const abgeleitet = leiteAb(w.kette, w.kennung);
      if (abgeleitet) {
        maengel.push(
          `${schluessel}: steht als Ausnahme, wird aber inzwischen abgeleitet ` +
          `('${abgeleitet}'). Den Eintrag entfernen.`);
      }
    }
    assert.deepStrictEqual(maengel, []);
  });

  it("die Ausnahmeliste waechst nicht unbemerkt (Sperrklinke)", () => {
    assert.ok(
      LESEN.ausnahmen.length <= LESEN.grundlinie.ausnahmen,
      `${LESEN.ausnahmen.length} Ausnahmen, Grundlinie ist ${LESEN.grundlinie.ausnahmen}. ` +
      "Sie darf FALLEN — ein Weg bekommt eine erkennbare Wache — aber nicht steigen, " +
      "ohne dass jemand die Grundlinie bewusst anhebt."
    );
  });

  it("Selbstprobe: die Ableitung erkennt eine Wache und erfindet keine", () => {
    /* Ohne sie koennte `leiteAb` immer `flaechentor` liefern und alles waere
       gruen — der Waechter haette dann nichts geprueft. */
    const mitKennung = { org: true, user: true };
    assert.equal(leiteAb(["requirePermissionMiddleware", "(anonym)"], mitKennung), "berechtigung");
    assert.equal(leiteAb(["requireScopeMiddleware", "(anonym)"], mitKennung), "berechtigung");
    assert.equal(leiteAb(["sameOrgParam", "(anonym)"], mitKennung), "besitz");
    assert.equal(leiteAb(["staffControlAccess", "(anonym)"], mitKennung), "flaechentor");
    assert.equal(leiteAb(["(anonym)"], mitKennung), null,
      "die Ableitung erfindet eine Wache, wo keine steht");
    assert.equal(leiteAb(["(anonym)"], { org: false, user: false }), "oeffentlich");
    assert.equal(leiteAb(["(anonym)"], { org: false, user: true }), "eigene-daten");
    /* Die staerkste zaehlt, nicht die erste. */
    assert.equal(leiteAb(["staffControlAccess", "requirePermissionMiddleware"], mitKennung),
      "berechtigung");
  });

  it("die Wach-Namen der Ableitung existieren wirklich", () => {
    /*
     * Ein Name, den keine Kette traegt, ist entweder ein Tippfehler oder eine
     * Wache, die es nicht mehr gibt — beides macht die Ableitung schwaecher,
     * ohne dass etwas rot wird. (`_zweck` ist die Beschriftung, kein Name.)
     */
    const gesehen = new Set(lesend.flatMap((w) => w.kette));
    const tot = Object.keys(LESEN.wachen)
      .filter((n) => n !== "_zweck" && !gesehen.has(n));
    assert.deepStrictEqual(tot, [],
      "Diese Wach-Namen stehen in der Ableitung, aber keine lesende Kette traegt sie. " +
      "Umbenannt oder entfernt? Dann leitet die Zeile nichts mehr ab.");
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
      const routerListe = await montiere(w.datei, pool);

      /* Die Kette kann in JEDEM Router der Datei stehen — seit dem Fund vom
       * 2026-08-24 werden alle Fabriken montiert, nicht nur die erste. */
      let kette = null;
      for (const router of routerListe) {
        for (const name of NAMEN) {
          try { kette = findChainFrom(router, w.methode, w.pfad, name); break; } catch { /* naechster */ }
        }
        if (kette) break;
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
