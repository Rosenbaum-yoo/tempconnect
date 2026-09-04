/**
 * Der abgelaufene Link ist keine Sackgasse mehr (M3.4, 2026-09-04).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ZWEI HAELFTEN DESSELBEN WEGES, UND BEIDE ENDETEN IM NICHTS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. DER ABGELAUFENE EINLADUNGSLINK. `worker-login.html` zeigte einen roten
 *    Kasten — "Dieser Einladungslink ist abgelaufen" — und sonst nichts. Kein
 *    Knopf, kein Verweis. Dabei HAT der Mensch ein Konto: `acceptInvite` hat es
 *    angelegt, sonst haette er die Mail nicht bekommen. Der Weg nach vorn stand
 *    zwei Abschnitte tiefer auf derselben Seite ("Passwort vergessen") und war
 *    nur nicht verlinkt.
 *
 * 2. DIE RESET-MAIL. `resetUrl` war `${BASE_URL}?reset=...` fuer JEDEN. Das
 *    Zuruecksetzen selbst lebt in `js/pages/landing.js` — der
 *    Unternehmens-Landeseite. Ein Arbeiter kam nach dem Neusetzen genau dort
 *    an, und seit F12 (Arbeiter-Sichtbarkeit) sieht er dort nichts mehr: kein
 *    Hub, keine Karten, kein Weg ins Einsatzportal. Der Weg FUNKTIONIERTE und
 *    endete im Leeren — die unangenehmste Sorte Fehler, weil nichts kaputt
 *    aussieht.
 *
 * Abnahme aus dem Plan (M3.4): **abgelaufener Link → der Mensch kommt allein
 * weiter.**
 *
 * Run: node --test --test-force-exit test/passwortWegRaus.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createAuthRouter } from "../routes/auth.js";

/* Pfade IMMER relativ zur Testdatei — sonst haengt das Ergebnis am
   Startverzeichnis und der Test ueberspringt sich je nach cwd lautlos. */
const HIER = path.dirname(fileURLToPath(import.meta.url));
const API = path.resolve(HIER, "..");
const SEITE = fs.readFileSync(
  path.join(API, "..", "frontend", "public", "worker-login.html"), "utf8");

/* ── Harness ─────────────────────────────────────────────────────────── */

function mockRes() {
  const res = {
    _status: 200, _json: null, locals: {},
    status(c) { this._status = c; return this; },
    json(b) { this._json = b; return this; },
    setHeader() { return this; }
  };
  return res;
}

function getHandler(router, methode, pfad) {
  for (const layer of router.stack) {
    if (!layer.route || layer.route.path !== pfad) continue;
    if (!layer.route.methods[methode]) continue;
    const stack = layer.route.stack;
    return stack[stack.length - 1].handle;
  }
  throw new Error(`Route ${methode} ${pfad} nicht gefunden`);
}

/**
 * Einen Handler fahren und WIRKLICH auf sein Ende warten.
 *
 * `catchAsync` gibt das Versprechen des Handlers NICHT zurueck — es haengt nur
 * ein `.catch(next)` daran. Ein `await handler(...)` kehrt deshalb SOFORT
 * zurueck, waehrend der Handler noch laeuft: die erste Abfrage war abgesetzt,
 * die zweite noch nicht, und `res` war leer. Der Test meldete dann "Cannot read
 * properties of null" und zeigte dabei auf die falsche Zeile — die Ursache lag
 * eine Ebene tiefer und stand nirgends.
 *
 * Dasselbe Muster wie `invoke()` in `auth.route.coverage.test.js`: warten, bis
 * geantwortet ODER `next` gerufen wurde. Die Obergrenze verhindert eine
 * Endlosschleife, wenn der Handler beides nie tut; dann faellt die Zusicherung
 * danach, und zwar mit einer verstaendlichen Meldung.
 */
async function warteAufAntwort(handler, req, res, aufFehler) {
  let fertig = false;
  handler(req, res, (e) => { fertig = true; if (e) aufFehler(e); });
  for (let i = 0; i < 200 && !fertig && res._json === null; i++) {
    await new Promise((r) => setImmediate(r));
  }
}

/** Faehrt den Vergessen-Weg und gibt zurueck, WAS in der Mail stand. */
async function forgotFuer(rolle) {
  const mails = [];
  const pool = {
    query: async (sql) => {
      if (/SELECT id, email, role FROM users/i.test(String(sql))) {
        return { rows: [{ id: "u7", email: "wer@da.de", role: rolle }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }
  };
  const router = createAuthRouter({
    pool,
    config: { BASE_URL: "https://tempconnect.example" },
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    sendMail: async (to, betreff, html, opts) => { mails.push({ to, betreff, html, opts }); return true; },
    getUserAndPlan: async () => ({ id: "u7" }),
    requireAuth: (_q, _s, n) => n(),
    authLimiter: (_q, _s, n) => n()
  });
  const res = mockRes();
  /* `next` sammelt den Fehler, statt ihn zu werfen: ein Wurf landete in
     `catchAsync`s eigenem `.catch` und waere als unbehandelte Ablehnung
     verschwunden. */
  const fehler = [];
  await warteAufAntwort(
    getHandler(router, "post", "/auth/forgot-password"),
    { body: { email: "wer@da.de" }, ip: "127.0.0.1", headers: {}, get: () => "" },
    res, (e) => fehler.push(e));
  assert.deepEqual(fehler.map((e) => e.message), [],
    "der Handler ist gescheitert: " + fehler.map((e) => e.stack).join(" | "));
  return { res, mails };
}

/* ── 1. Die Reset-Mail fuehrt dorthin, wo der Mensch hingehoert ──────── */

describe("M3.4 · die Reset-Mail kennt die Rolle", () => {
  it("ein ARBEITER bekommt den Link ins Einsatzportal", async () => {
    const { res, mails } = await forgotFuer("worker");
    assert.equal(res._json.ok, true);
    assert.equal(mails.length, 1, "es wurde keine Mail gebaut");
    assert.match(mails[0].html, /worker-login\.html\?reset=/,
      "der Link zeigt nicht ins Portal — ein Arbeiter landet auf der "
      + "Unternehmens-Landeseite, auf der er seit F12 nichts mehr sieht");
    assert.equal(mails[0].opts?.zweck, "passwort-zuruecksetzen",
      "der Zweck fehlt — dann zaehlt die Mail im Versandprotokoll unter 'unbenannt'");
  });

  it("alle anderen bekommen weiter die Landeseite", async () => {
    /* Die Gegenrichtung, und sie ist genauso wichtig: wer hier versehentlich
       ALLE ins Portal schickt, sperrt Unternehmen und Agenturen aus ihrem
       eigenen Zuruecksetzen aus. */
    for (const rolle of ["company", "agency", "admin", null, undefined, ""]) {
      const { mails } = await forgotFuer(rolle);
      assert.ok(!/worker-login/.test(mails[0].html),
        `Rolle ${JSON.stringify(rolle)} wurde faelschlich ins Portal geschickt`);
      assert.match(mails[0].html, /https:\/\/tempconnect\.example\?reset=/,
        `Rolle ${JSON.stringify(rolle)} bekam keine gueltige Landeseiten-Adresse`);
    }
  });

  it("die Schreibweise der Rolle entscheidet nicht", async () => {
    /* `role` kommt aus der Datenbank. Ein "Worker" aus einem Import waere sonst
       kein Arbeiter — und bekaeme den Link, der ihn ins Leere fuehrt. */
    for (const rolle of ["Worker", "WORKER", " worker "]) {
      const { mails } = await forgotFuer(rolle);
      assert.match(mails[0].html, /worker-login\.html\?reset=/,
        `Rolle ${JSON.stringify(rolle)} wurde nicht als Arbeiter erkannt`);
    }
  });

  it("die Rolle wird ueberhaupt gelesen", async () => {
    /* Ohne diese Spalte kann die Verzweigung nicht existieren — und eine
       Verzweigung auf `undefined` faellt immer in denselben Zweig. */
    const dienst = fs.readFileSync(path.join(API, "services", "authService.js"), "utf8");
    assert.match(dienst, /SELECT id, email, role FROM users/,
      "getUserByEmail liest die Rolle nicht mehr mit — die Verzweigung in "
      + "routes/auth.js entscheidet dann immer gleich");
  });
});

/* ── 2. Die Sackgasse im Portal ──────────────────────────────────────── */

describe("M3.4 · aus dem abgelaufenen Link fuehrt eine Tuer", () => {
  it("der Weg nach vorn steht im Markup", () => {
    assert.match(SEITE, /id="inviteWegRaus"/,
      "der Ausweg-Block fehlt — der rote Kasten steht wieder allein da");
    assert.match(SEITE, /onclick="showForgotPw\(\)"[^>]*data-i18n="wk\.invite\.wegRausCta"/,
      "der Knopf fuehrt nicht auf den Vergessen-Weg");
  });

  it("er erscheint bei ABGELAUFEN und WIDERRUFEN", () => {
    const block = /if \(data\.error === 'INVITE_EXPIRED'[\s\S]*?\n      \}/.exec(SEITE);
    assert.ok(block, "die Bedingung fuer den Ausweg wurde nicht gefunden");
    assert.ok(block[0].includes("INVITE_EXPIRED"), "abgelaufen fuehrt zu keinem Ausweg");
    assert.ok(block[0].includes("INVITE_REVOKED"), "widerrufen fuehrt zu keinem Ausweg");
    assert.ok(block[0].includes("inviteWegRaus"), "der Ausweg wird nicht sichtbar gemacht");
  });

  it("er erscheint NICHT bei 'nicht gefunden'", () => {
    /*
     * Die Zurueckhaltung ist Absicht. Bei NOT_FOUND ist unklar, ob es das Konto
     * gibt — ein "Ihr Konto besteht bereits, setzen Sie Ihr Passwort neu" waere
     * eine Behauptung ueber ein fremdes Konto und damit eine Auskunft, die
     * niemand erfragt hat. Der Vergessen-Weg bleibt ueber den Login erreichbar.
     */
    const block = /if \(data\.error === 'INVITE_EXPIRED'[\s\S]*?\n      \}/.exec(SEITE);
    assert.ok(!block[0].includes("INVITE_NOT_FOUND"),
      "auch 'nicht gefunden' zeigt den Ausweg — das verraet, ob es ein Konto gibt");
  });

  it("'schon benutzt' fuehrt weiterhin zum Login, nicht zum Ausweg", () => {
    /* Wer die Einladung schon angenommen hat, KENNT sein Passwort. Ihn auf
       "Passwort neu setzen" zu schicken waere ein Rueckschritt. */
    const block = /if \(data\.error === 'INVITE_ALREADY_USED'\) \{[\s\S]*?\n      \}/.exec(SEITE);
    assert.ok(block, "der Zweig fuer 'schon benutzt' wurde nicht gefunden");
    assert.ok(block[0].includes("show('loginSection')"), "er fuehrt nicht mehr zum Login");
    assert.ok(block[0].includes("return"),
      "ohne `return` liefe er WEITER in den Ausweg-Zweig — dann bekaeme jemand, "
      + "der sein Passwort kennt, die Aufforderung es zu aendern");
  });
});

/* ── 3. Das Portal nimmt seinen Reset-Link entgegen ──────────────────── */

describe("M3.4 · das Portal hat einen eigenen Zuruecksetzen-Bereich", () => {
  it("der Bereich existiert und wird umgeschaltet", () => {
    assert.match(SEITE, /id="resetSection"/, "Phase 4 fehlt im Markup");
    assert.match(SEITE, /\['inviteSection','loginSection','forgotSection','resetSection'\]/,
      "show() kennt den neuen Bereich nicht — dann bleibt er beim Umschalten stehen");
  });

  it("`?reset=` fuehrt VOR dem Login dorthin", () => {
    /* Wer den Link aus der Mail hat, kennt sein Passwort gerade nicht. Ihn erst
       an einer Anmeldemaske vorbeizuschicken war die Sackgasse. */
    assert.match(SEITE, /const resetToken = params\.get\('reset'\);/,
      "der Reset-Parameter wird nicht gelesen");
    const init = /\(async function init\(\) \{[\s\S]*?\n\}\)\(\);/.exec(SEITE);
    assert.ok(init, "der Einstieg wurde nicht gefunden");
    assert.ok(init[0].includes("resetToken") && init[0].includes("show('resetSection')"),
      "der Einstieg verzweigt nicht auf den Zuruecksetzen-Bereich");
  });

  it("er benutzt dieselbe Route wie die Landeseite", () => {
    const fn = /async function doReset\(\) \{[\s\S]*?\n\}/.exec(SEITE);
    assert.ok(fn, "doReset wurde nicht gefunden");
    assert.ok(fn[0].includes("/auth/reset-password"),
      "es wird eine andere Route gerufen — dann gibt es zwei Zuruecksetzen-Wege");
    assert.ok(fn[0].includes("x-csrf-token"),
      "der Aufruf traegt kein CSRF-Merkmal und wird abgewiesen");
    assert.ok(fn[0].includes("token: resetToken"),
      "das Merkmal aus der Adresse wird nicht mitgeschickt");
  });

  it("er endet IM PORTAL, nicht in einer Erfolgsmeldung", () => {
    /*
     * Der Kern von M3.4. Ein gelungenes Zuruecksetzen, das den Menschen stehen
     * laesst, ist derselbe Fehler wie vorher — nur eine Seite spaeter.
     */
    const fn = /async function doReset\(\) \{[\s\S]*?\n\}/.exec(SEITE);
    assert.match(fn[0], /window\.location\.href = '\/public\/einsatzportal-dashboard\.html'/,
      "nach dem Setzen fuehrt kein Weg ins Portal");
  });

  it("die Mindestlaenge stimmt mit der des Servers ueberein", () => {
    /* 8 Zeichen — dieselbe Grenze wie beim Annehmen der Einladung eine Zeile
       darueber. Zwei verschiedene Grenzen auf derselben Seite waeren fuer den
       Menschen nicht erklaerbar. */
    const fn = /async function doReset\(\) \{[\s\S]*?\n\}/.exec(SEITE);
    assert.match(fn[0], /pw\.length < 8/, "die Mindestlaenge fehlt oder ist eine andere");
  });

  it("die Wortmarken stehen in BEIDEN Sprachen", () => {
    const de = /TCi18n\.register\('de',([\s\S]*?)\n\}\);/.exec(SEITE);
    const en = /TCi18n\.register\('en',([\s\S]*?)\n\}\);/.exec(SEITE);
    assert.ok(de && en, "die Woerterbuecher wurden nicht gefunden");
    for (const key of ["wk.invite.wegRausHint", "wk.invite.wegRausCta",
                       "wk.reset.title", "wk.reset.submit", "wk.reset.ok",
                       "wk.reset.errShort", "wk.reset.errNoToken",
                       "wk.reset.errInvalid", "wk.reset.errFailed"]) {
      assert.ok(de[1].includes(key), `${key} fehlt im deutschen Woerterbuch`);
      assert.ok(en[1].includes(key), `${key} fehlt im englischen Woerterbuch`);
    }
  });
});
