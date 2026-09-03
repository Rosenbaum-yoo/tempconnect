/**
 * M2.7 — die Entscheidungen der Schluessel-Authentifizierung, Mutant fuer Mutant.
 *
 * `apiKeyAuth.test.js` prueft den Katalog, `hasScope` und die Hauptfaelle des
 * tc_live_-Pfads. Der MASCHINEN-PFAD (OIDC client_credentials, Bearer-JWT) war
 * am 2026-09-03 in der Mutationsmessung fast blind: 31 ueberlebende Mutanten,
 * die meisten in `extractBearerJwt` und im M2M-Zweig.
 *
 * Das ist der Pfad, auf dem eine fremde Maschine hereinkommt. Ein stiller
 * Logik-Kipper dort heisst: falsche Org, zu viele Scopes, oder ein widerrufener
 * Schluessel, der noch eine Stunde weiterlebt.
 *
 * Jede Probe zielt auf eine ENTSCHEIDUNG. Wo eine Zeichenkette geprueft wird,
 * ist sie ein VERTRAG (Fehlerschluessel, Protokollfeld), keine Formulierung.
 *
 * Lauf: node --test --test-force-exit test/apiKeyAuthMutanten.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { apiKeyAuthMiddleware, requireScope } from "../middleware/apiKeyAuth.js";
import { signM2MToken } from "../services/m2mTokenService.js";

const ORG = "22222222-2222-2222-2222-222222222222";
const FREMD = "33333333-3333-3333-3333-333333333333";
const KEY_ID = "44444444-4444-4444-4444-444444444444";
const GEHEIM = "ein-hinreichend-langes-testgeheimnis-fuer-hmac";

function protokoll() {
  const eintraege = [];
  const fn = (art) => (a, b) => eintraege.push({ art, nutzlast: a, text: b });
  return { eintraege, info: fn("info"), warn: fn("warn"), error: fn("error"), debug: fn("debug") };
}

/** Pool, der `lookupById`/`lookupByHash` bedient (beide lesen org_api_keys). */
function poolMit(zeile, { wirft = false } = {}) {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql: String(sql), params });
      if (wirft) throw new Error("Verbindung weg");
      return { rows: zeile ? [zeile] : [] };
    }
  };
}

function lauf(mw, req = {}) {
  return new Promise((fertig) => {
    const r = { headers: {}, ...req };
    const res = {
      _code: 200, _rumpf: null,
      status(c) { this._code = c; return this; },
      json(b) { this._rumpf = b; fertig({ req: r, code: this._code, rumpf: b, weiter: false }); return this; }
    };
    const p = mw(r, res, () => fertig({ req: r, code: null, rumpf: null, weiter: true }));
    if (p?.catch) p.catch(() => fertig({ req: r, code: res._code, rumpf: res._rumpf, weiter: false }));
  });
}

const AN = { OAUTH_M2M_ENABLED: true, JWT_SECRET: GEHEIM };

function token({ orgId = ORG, keyId = KEY_ID, scopes = ["read:invoices"] } = {}) {
  return signM2MToken({ secret: GEHEIM, orgId, keyId, scopes }).token;
}
const bearer = (t) => ({ headers: { authorization: "Bearer " + t } });

/* ══ Der Maschinen-Pfad: wer kommt herein, mit welcher Org und welchen Scopes ══ */

describe("apiKeyAuthMiddleware — Maschinen-Token (M2M)", () => {
  const SCHLUESSEL = { id: KEY_ID, org_id: ORG, scopes: ["read:invoices", "read:timesheets"], created_by: "u-1" };

  it("gueltiges Token: Org, Schluessel und Verantwortlicher stehen am Request", async () => {
    const r = await lauf(apiKeyAuthMiddleware(poolMit(SCHLUESSEL), { logger: protokoll(), config: AN }),
      bearer(token()));
    assert.equal(r.weiter, true);
    assert.equal(r.req.orgId, ORG, "die Org kommt nicht aus dem Token");
    assert.equal(r.req.apiKeyId, KEY_ID);
    assert.equal(r.req.apiKeyOwnerUserId, "u-1",
      "ohne den Verantwortlichen bliebe jede Maschinen-Aktion im Audit ohne Akteur");
    assert.equal(r.req.isApiKeyAuth, true);
    assert.equal(r.req.isM2mToken, true);
  });

  it("der Schluessel wird bei JEDEM Aufruf nachgeschlagen — Widerruf greift sofort", async () => {
    const pool = poolMit(SCHLUESSEL);
    await lauf(apiKeyAuthMiddleware(pool, { logger: protokoll(), config: AN }), bearer(token()));
    assert.ok(pool.calls.length >= 1,
      "es wurde nicht nachgeschlagen — ein widerrufener Schluessel lebte bis zum "
      + "Ablauf des Tokens weiter, bis zu einer Stunde");
    assert.ok(pool.calls.some((c) => (c.params || []).map(String).includes(KEY_ID)),
      "nachgeschlagen wurde nicht der Schluessel aus dem Token (sub)");
  });

  it("gibt es den Schluessel nicht mehr, entsteht KEIN Kontext", async () => {
    const r = await lauf(apiKeyAuthMiddleware(poolMit(null), { logger: protokoll(), config: AN }),
      bearer(token()));
    assert.equal(r.weiter, true, "der Maschinen-Pfad antwortet nie selbst");
    assert.equal(r.req.isApiKeyAuth, undefined,
      "ein widerrufener Schluessel erzeugt weiterhin einen Auth-Kontext");
    assert.equal(r.req.orgId, undefined);
  });

  it("gehoert der Schluessel einer ANDEREN Org als das Token, entsteht KEIN Kontext", async () => {
    /* Der gefaehrlichste Fall: eine gueltige Signatur auf eine fremde Org. */
    const r = await lauf(
      apiKeyAuthMiddleware(poolMit({ ...SCHLUESSEL, org_id: FREMD }), { logger: protokoll(), config: AN }),
      bearer(token()));
    assert.equal(r.req.orgId, undefined,
      "Token und Schluessel nennen verschiedene Orgs, und der Kontext entsteht trotzdem");
    assert.equal(r.req.isApiKeyAuth, undefined);
  });

  it("Scopes sind der SCHNITT aus Token und aktuellem Schluessel", async () => {
    /* Ein auf dem Schluessel entzogener Scope muss sofort wirken, nicht erst mit
       dem naechsten Token. */
    const r = await lauf(
      apiKeyAuthMiddleware(poolMit({ ...SCHLUESSEL, scopes: ["read:timesheets"] }),
        { logger: protokoll(), config: AN }),
      bearer(token({ scopes: ["read:invoices", "read:timesheets"] })));
    assert.deepEqual(r.req.apiKeyScopes, ["read:timesheets"],
      "der Schnitt stimmt nicht — ein entzogener Scope wirkt erst mit dem naechsten Token");
  });

  it("ein Schluessel ohne Scopes laesst nichts uebrig", async () => {
    const r = await lauf(
      apiKeyAuthMiddleware(poolMit({ ...SCHLUESSEL, scopes: null }), { logger: protokoll(), config: AN }),
      bearer(token({ scopes: ["read:invoices"] })));
    assert.deepEqual(r.req.apiKeyScopes, [],
      "ein Schluessel ohne Scopes gewaehrt trotzdem etwas");
  });

  it("ohne created_by steht dort null, nicht undefined", async () => {
    const r = await lauf(
      apiKeyAuthMiddleware(poolMit({ ...SCHLUESSEL, created_by: null }), { logger: protokoll(), config: AN }),
      bearer(token()));
    assert.equal(r.req.apiKeyOwnerUserId, null);
  });

  it("klemmt die Datenbank beim Nachschlagen, entsteht KEIN Kontext — und es wirft nicht", async () => {
    /*
     * Der Nachschlag haengt an `.catch(() => null)`. Faellt der weg oder liefert er
     * etwas Wahrheitswertiges, waere die Wirkung entgegengesetzt: entweder stuerzt
     * der Maschinen-Pfad bei jedem Datenbankwackler ab (und reisst Sitzungs-Anfragen
     * mit, denn er laeuft VOR ihnen), oder ein Token kaeme mit einem Schluessel
     * durch, den niemand geprueft hat.
     */
    const r = await lauf(
      apiKeyAuthMiddleware(poolMit(SCHLUESSEL, { wirft: true }), { logger: protokoll(), config: AN }),
      bearer(token()));
    assert.equal(r.weiter, true, "der Lesefehler reisst den Maschinen-Pfad um");
    assert.equal(r.req.isApiKeyAuth, undefined,
      "trotz gescheitertem Nachschlag entsteht ein Auth-Kontext");
    assert.equal(r.req.orgId, undefined);
  });

  it("abgeschaltet: kein Kontext, auch mit gueltigem Token", async () => {
    for (const config of [{}, { OAUTH_M2M_ENABLED: false, JWT_SECRET: GEHEIM },
      { OAUTH_M2M_ENABLED: true, JWT_SECRET: "" }]) {
      const r = await lauf(apiKeyAuthMiddleware(poolMit(SCHLUESSEL), { logger: protokoll(), config }),
        bearer(token()));
      assert.equal(r.req.isApiKeyAuth, undefined,
        `der Schalter ${JSON.stringify(config)} haelt nicht`);
    }
  });

  it("falsch signiert oder verfremdet: kein Kontext", async () => {
    const echt = token();
    const faelle = {
      "fremdes Geheimnis": signM2MToken({ secret: "ein-anderes-geheimnis-ganz-und-gar", orgId: ORG, keyId: KEY_ID }).token,
      "Nutzlast getauscht": echt.split(".")[0] + ".ZXlKaGJHY2lPaUpJVXpJMU5pSjk." + echt.split(".")[2],
      "Signatur abgeschnitten": echt.slice(0, -4)
    };
    for (const [name, t] of Object.entries(faelle)) {
      const r = await lauf(apiKeyAuthMiddleware(poolMit(SCHLUESSEL), { logger: protokoll(), config: AN }), bearer(t));
      assert.equal(r.req.isApiKeyAuth, undefined, `${name}: kommt durch`);
    }
  });
});

/* ══ Was ueberhaupt als Token gilt ═════════════════════════════════════════ */

describe("apiKeyAuthMiddleware — was als Bearer-Token gilt", () => {
  const SCHLUESSEL = { id: KEY_ID, org_id: ORG, scopes: ["read:invoices"], created_by: "u-1" };
  const mw = () => apiKeyAuthMiddleware(poolMit(SCHLUESSEL), { logger: protokoll(), config: AN });

  it("kleingeschriebenes 'bearer' zaehlt genauso", async () => {
    const r = await lauf(mw(), { headers: { authorization: "bearer " + token() } });
    assert.equal(r.req.isM2mToken, true,
      "die Gross-/Kleinschreibung des Schemas entscheidet ueber den Zugang");
  });

  it("kein Bearer, kein Kontext — und zwar GAR keiner", async () => {
    /*
     * Geprueft wird der ganze Kontext, nicht nur `isM2mToken`.
     *
     * Die erste Fassung fragte nur nach `isM2mToken`. Ein Kipper in
     * `extractApiKey` (Zeile 117) faellt damit durch: bei `Basic <token>` liefert
     * die verdrehte Bedingung den Wert als API-SCHLUESSEL zurueck, der Nachschlag
     * gelingt, und `isApiKeyAuth` steht auf true — waehrend `isM2mToken`
     * unveraendert leer bleibt und die Probe weiter gruen ist. Eine fremde
     * Kopfzeile haette einen vollen Auth-Kontext erzeugt.
     */
    const KEIN_TOKEN = [
      "Basic abc.def.ghi", "Bearer", "Bearer a b", "", "  ",
      "Bearer a.b.c.d",                 // vier Abschnitte
      "Bearer a.b.c extra"              // drei TEILE statt zwei
    ];
    for (const auth of KEIN_TOKEN) {
      const r = await lauf(mw(), { headers: { authorization: auth } });
      const kontext = { m2m: r.req.isM2mToken, api: r.req.isApiKeyAuth, org: r.req.orgId,
        key: r.req.apiKeyId, scopes: r.req.apiKeyScopes };
      assert.deepEqual(kontext,
        { m2m: undefined, api: undefined, org: undefined, key: undefined, scopes: undefined },
        `'${auth}' erzeugt einen Auth-Kontext: ${JSON.stringify(kontext)}`);
    }
  });

  it("ein gueltiges Token mit angehaengtem Zusatz gilt NICHT", async () => {
    /* `Authorization: Bearer <token> irgendwas` hat drei Teile. Zaehlt die Wache
       falsch, wird daraus ein gueltiges Maschinen-Token mit voller Org-Bindung —
       aus einer Kopfzeile, die so nie ausgestellt wurde. */
    const r = await lauf(mw(), { headers: { authorization: "Bearer " + token() + " extra" } });
    assert.equal(r.req.isM2mToken, undefined, "der Zusatz wird ueberlesen");
    assert.equal(r.req.orgId, undefined, "es entsteht eine Org-Bindung");
  });

  it("ohne Authorization-Kopfzeile passiert nichts", async () => {
    const r = await lauf(mw(), { headers: {} });
    assert.equal(r.weiter, true);
    assert.equal(r.req.isM2mToken, undefined);
  });

  it("was nicht drei Abschnitte hat, ist kein Token", async () => {
    for (const t of ["abc", "abc.def", "a.b.c.d"]) {
      const r = await lauf(mw(), { headers: { authorization: "Bearer " + t } });
      assert.equal(r.req.isM2mToken, undefined, `'${t}' wird als Token genommen`);
    }
  });

  it("ein tc_live_-Schluessel im Bearer geht den SCHLUESSEL-Pfad, nicht den Token-Pfad", async () => {
    const r = await lauf(mw(), { headers: { authorization: "Bearer tc_live_abc.def.ghi" } });
    assert.equal(r.req.isM2mToken, undefined,
      "ein API-Schluessel wurde als Maschinen-Token behandelt");
    assert.equal(r.req.isApiKeyAuth, true, "der Schluessel-Pfad hat ihn nicht genommen");
  });
});

/* ══ Der tc_live_-Pfad ════════════════════════════════════════════════════ */

describe("apiKeyAuthMiddleware — Schluessel-Pfad", () => {
  const SCHLUESSEL = { id: KEY_ID, org_id: ORG, scopes: ["read:invoices"], created_by: "u-9" };

  it("X-API-Key nur mit dem richtigen Praefix", async () => {
    const mit = await lauf(apiKeyAuthMiddleware(poolMit(SCHLUESSEL), { logger: protokoll(), config: {} }),
      { headers: { "x-api-key": "tc_live_abcdef" } });
    assert.equal(mit.req.isApiKeyAuth, true);
    const ohne = await lauf(apiKeyAuthMiddleware(poolMit(SCHLUESSEL), { logger: protokoll(), config: {} }),
      { headers: { "x-api-key": "sk_test_abcdef" } });
    assert.equal(ohne.req.isApiKeyAuth, undefined,
      "ein fremdes Praefix wird als Schluessel genommen");
  });

  it("unbekannter Schluessel: 401 mit benanntem Grund, und der Handler laeuft NICHT", async () => {
    const log = protokoll();
    const r = await lauf(apiKeyAuthMiddleware(poolMit(null), { logger: log, config: {} }),
      { headers: { "x-api-key": "tc_live_" + "x".repeat(30) } });
    assert.equal(r.code, 401);
    assert.equal(r.weiter, false);
    assert.equal(r.rumpf?.success, false);
    assert.equal(r.rumpf?.error?.code, "API_KEY_INVALID");
    assert.ok(String(r.rumpf?.error?.message || "").length > 10,
      "die Ablehnung nennt keinen Grund");
  });

  it("das Protokoll nennt nur den ANFANG des Schluessels, nie den ganzen", async () => {
    /* Ein vollstaendiger Schluessel im Protokoll ist ein Geheimnis im Klartext. */
    const log = protokoll();
    const roh = "tc_live_" + "g".repeat(40);
    await lauf(apiKeyAuthMiddleware(poolMit(null), { logger: log, config: {} }),
      { headers: { "x-api-key": roh } });
    const e = log.eintraege.find((x) => x.art === "warn");
    assert.ok(e, "die Ablehnung wird nicht protokolliert — sie waere unsichtbar");
    assert.equal(e.nutzlast?.key_prefix, roh.slice(0, 16),
      "das Protokollfeld key_prefix stimmt nicht");
    assert.ok(!String(JSON.stringify(e)).includes(roh),
      "der VOLLSTAENDIGE Schluessel steht im Protokoll");
    assert.ok(/API-Key/i.test(String(e.text)),
      "die Meldung sagt nicht, WORAN es lag — wer sie im Protokollstrom sieht, "
      + `muss den Vorgang erkennen koennen (bekommen: ${JSON.stringify(e.text)})`);
  });

  it("gueltiger Schluessel: alle Kontextfelder, und last_used wird angefasst", async () => {
    const pool = poolMit(SCHLUESSEL);
    const r = await lauf(apiKeyAuthMiddleware(pool, { logger: protokoll(), config: {} }),
      { headers: { "x-api-key": "tc_live_abcdef" } });
    assert.equal(r.weiter, true);
    assert.equal(r.req.orgId, ORG);
    assert.equal(r.req.apiKeyId, KEY_ID);
    assert.equal(r.req.apiKeyOwnerUserId, "u-9");
    assert.deepEqual(r.req.apiKeyScopes, ["read:invoices"]);
    assert.equal(r.req.isApiKeyAuth, true);
    assert.equal(r.req.isM2mToken, undefined, "ein Schluessel ist kein Maschinen-Token");
    assert.ok(pool.calls.some((c) => /last_used/i.test(c.sql)),
      "last_used_at wird nicht fortgeschrieben — ungenutzte Schluessel bleiben unsichtbar");
  });

  it("ein Schluessel ohne Scopes bekommt ein leeres Array, nicht null", async () => {
    const r = await lauf(
      apiKeyAuthMiddleware(poolMit({ ...SCHLUESSEL, scopes: null }), { logger: protokoll(), config: {} }),
      { headers: { "x-api-key": "tc_live_abcdef" } });
    assert.deepEqual(r.req.apiKeyScopes, [],
      "ohne Array wuerde hasScope(null, …) werfen statt abzulehnen");
  });

  it("Lesefehler: 500 und BLOCKIERT — fail-closed", async () => {
    const log = protokoll();
    const r = await lauf(apiKeyAuthMiddleware(poolMit(SCHLUESSEL, { wirft: true }), { logger: log, config: {} }),
      { headers: { "x-api-key": "tc_live_abcdef" } });
    assert.equal(r.code, 500);
    assert.equal(r.weiter, false, "bei einem Fehler laeuft der Handler trotzdem");
    assert.equal(r.rumpf?.success, false);
    assert.equal(r.rumpf?.error?.code, "SERVER_ERROR");
    assert.ok(String(r.rumpf?.error?.message || "").length >= 15,
      "die 500er-Antwort nennt keinen lesbaren Grund — ein Schluessel-Client sieht "
      + "nur eine Zahl und weiss nicht, ob er es erneut versuchen soll");
    const e = log.eintraege.find((x) => x.art === "error");
    assert.ok(e, "der Fehler wird nicht protokolliert");
    assert.equal(e.nutzlast?.err, "Verbindung weg",
      "das Protokoll nennt die Ursache nicht — die Suche begaenne bei null");
    assert.ok(/API-Key/i.test(String(e.text)),
      "die Meldung ordnet den Fehler keinem Vorgang zu "
      + `(bekommen: ${JSON.stringify(e.text)})`);
  });
});

/* ══ requireScope ═════════════════════════════════════════════════════════ */

describe("requireScope — die Entscheidung", () => {
  function pruefe(req) {
    let weiter = false, code = null, rumpf = null;
    requireScope("read:invoices")(req,
      { status(c) { code = c; return this; }, json(b) { rumpf = b; return this; } },
      () => { weiter = true; });
    return { weiter, code, rumpf };
  }

  it("Sitzung: der Scope wird gar nicht erst geprueft", () => {
    assert.equal(pruefe({ isApiKeyAuth: false, apiKeyScopes: [] }).weiter, true);
    assert.equal(pruefe({}).weiter, true, "ohne das Feld wird geprueft, statt durchzulassen");
  });

  it("Schluessel mit passendem Scope kommt durch — auch ueber die Hierarchie", () => {
    for (const scopes of [["read:invoices"], ["read"], ["admin"], ["write:invoices"]]) {
      assert.equal(pruefe({ isApiKeyAuth: true, apiKeyScopes: scopes }).weiter, true,
        `${JSON.stringify(scopes)} wird abgewiesen`);
    }
  });

  it("Schluessel ohne passenden Scope: 403 mit benanntem Grund", () => {
    for (const scopes of [[], ["read:timesheets"], null]) {
      const r = pruefe({ isApiKeyAuth: true, apiKeyScopes: scopes });
      assert.equal(r.weiter, false, `${JSON.stringify(scopes)} kommt durch`);
      assert.equal(r.code, 403);
      assert.equal(r.rumpf?.error?.code, "SCOPE_INSUFFICIENT");
      assert.ok(String(r.rumpf?.error?.message || "").includes("read:invoices"),
        "die Ablehnung nennt den fehlenden Scope nicht — der Aufrufer raet");
    }
  });
});
