/**
 * W-E9 (Owner-Entscheidung 2026-10-01): die Verwaltung wird die EINE Seite, auf
 * der eine Kundenfirma sich selbst verwaltet — Unternehmen wie Zeitarbeitsfirma.
 *
 * Geprueft wird hier, was das Backend dafuer neu entscheidet:
 *   (1) Rollen je Seite — die Zeitarbeitsfirma vergibt keinen Hiring-Manager,
 *       das Unternehmen keinen Disponenten; Owner nur per Wechsel, nie per
 *       Einladung. Eine unbekannte Seite bekommt NICHTS (fail-closed).
 *   (2) Das Protokoll als CSV — an die eigene Firma gebunden, und die Ausfuhr
 *       selbst steht danach im Protokoll.
 *   (3) Die Uebersicht liefert, was die Seite zum Rendern braucht (Rollen samt
 *       Namen, offene Einladungen), und das Protokoll lesbare Bezeichnungen.
 *
 * Run: node --test --test-force-exit test/verwaltung.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createOrgControlCenterRouter } from "../routes/orgControlCenter.js";
import {
  ROLLEN_NAMEN, ROLLEN_JE_SEITE, rollenFuerSeite, rolleErlaubt, rollenAngebot, rollenName
} from "../config/orgRollen.js";

/* ── Werkzeug ───────────────────────────────────────────────────────────── */

function pool(seite, extra = []) {
  const calls = [];
  const routen = [
    { match: (s) => s.startsWith("SELECT type FROM organizations"), respond: { rows: seite ? [{ type: seite }] : [] } },
    ...extra
  ];
  const query = async (sql, params = []) => {
    const text = typeof sql === "string" ? sql : sql?.text ?? "";
    calls.push({ sql: text, params });
    for (const r of routen) {
      if (r.match(text)) {
        const out = typeof r.respond === "function" ? r.respond(text, params) : r.respond;
        return { rowCount: out.rows?.length ?? 0, ...out };
      }
    }
    return { rows: [], rowCount: 0 };
  };
  return { calls, query, connect: async () => ({ query, release() {} }), find: (t) => calls.filter((c) => c.sql.includes(t)) };
}

const leise = { info() {}, warn() {}, error() {}, debug() {} };

function router(p) {
  return createOrgControlCenterRouter({ pool: p, logger: leise, requireAuth: (_q, _s, n) => n() });
}

function handler(r, method, pfad) {
  const layer = r.stack.find((l) => l.route && l.route.path === pfad && l.route.methods[method]);
  if (!layer) throw new Error(`${method} ${pfad} fehlt`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function kette(r, method, pfad) {
  const layer = r.stack.find((l) => l.route && l.route.path === pfad && l.route.methods[method]);
  return layer.route.stack.map((s) => s.handle.name);
}

function req(over = {}) {
  return {
    session: { userId: "u-eigen" }, orgId: "org-eigen", orgRole: "owner",
    params: {}, query: {}, body: {}, headers: {}, ip: "127.0.0.1", get: () => "", ...over
  };
}

function res() {
  const r = {
    _status: 200, _json: null, _send: null, _headers: {}, locals: {},
    status(c) { r._status = c; return r; },
    json(b) { r._json = b; return r; },
    send(b) { r._send = b; return r; },
    setHeader(k, v) { r._headers[k.toLowerCase()] = v; return r; }
  };
  return r;
}

/* ── (1) Rollen je Seite: die Tabelle selbst ───────────────────────────── */

describe("Rollen je Seite — die Tabelle (config/orgRollen.js)", () => {
  it("die Zeitarbeitsfirma vergibt Disponent/in, das Unternehmen nicht", () => {
    assert.ok(rolleErlaubt("agency", "dispatcher"));
    assert.equal(rolleErlaubt("company", "dispatcher"), false);
  });

  it("das Unternehmen vergibt Hiring-, Programm- und Supplier-Manager, die Zeitarbeitsfirma nicht", () => {
    for (const r of ["hiring_manager", "program_manager", "supplier_manager", "supplier_user"]) {
      assert.ok(rolleErlaubt("company", r), r);
      assert.equal(rolleErlaubt("agency", r), false, r);
    }
  });

  it("Recruiter/in steht auf beiden Seiten — die Rechte-Matrix gibt ihm auf beiden etwas", () => {
    assert.ok(rolleErlaubt("company", "recruiter"));
    assert.ok(rolleErlaubt("agency", "recruiter"));
  });

  it("Owner nie per Einladung, per Rollenwechsel auf beiden Seiten", () => {
    for (const seite of ["company", "agency"]) {
      assert.equal(rolleErlaubt(seite, "owner"), false, `Einladung ${seite}`);
      assert.equal(rolleErlaubt(seite, "owner", { ownerErlaubt: true }), true, `Wechsel ${seite}`);
    }
  });

  it("eine unbekannte Seite bekommt nichts — auch keinen Owner (fail-closed)", () => {
    for (const seite of [null, undefined, "", "worker", "COMPANY"]) {
      assert.deepEqual(rollenFuerSeite(seite), [], String(seite));
      assert.equal(rolleErlaubt(seite, "member"), false, String(seite));
      assert.equal(rolleErlaubt(seite, "owner", { ownerErlaubt: true }), false, String(seite));
    }
  });

  it("platform_admin ist auf keiner Seite vergebbar", () => {
    assert.equal(rolleErlaubt("company", "platform_admin", { ownerErlaubt: true }), false);
    assert.equal(rolleErlaubt("agency", "platform_admin", { ownerErlaubt: true }), false);
  });

  it("jede vergebbare Rolle hat einen deutschen Namen, und die Namen sind eindeutig", () => {
    for (const [seite, liste] of Object.entries(ROLLEN_JE_SEITE)) {
      for (const r of liste) assert.ok(ROLLEN_NAMEN[r], `${seite}: ${r} ohne Namen`);
    }
    const namen = Object.values(ROLLEN_NAMEN);
    assert.equal(new Set(namen).size, namen.length);
    assert.equal(ROLLEN_NAMEN.dispatcher, "Disponent/in");
    assert.equal(ROLLEN_NAMEN.viewer, "Betrachter/in");
    assert.equal(ROLLEN_NAMEN.supplier_user, "Lieferant (extern)");
  });

  it("rollenAngebot liefert Schluessel und Namen, rollenName faellt auf den Schluessel zurueck", () => {
    assert.deepEqual(rollenAngebot("agency")[1], { key: "dispatcher", label: "Disponent/in" });
    assert.equal(rollenName("gibt_es_nicht"), "gibt_es_nicht");
    assert.equal(rollenName(undefined), "");
  });
});

/* ── (1) Rollen je Seite: an den Wegen ────────────────────────────────── */

describe("Rollen je Seite — Einladung und Rollenwechsel pruefen sie serverseitig", () => {
  it("Einladung: Zeitarbeitsfirma + Hiring-Manager/in -> 400, nichts angelegt", async () => {
    const p = pool("agency");
    const r = res();
    await handler(router(p), "post", "/org/members/invite")(req({ body: { email: "neu@firma.de", role_key: "hiring_manager" } }), r);
    assert.equal(r._status, 400);
    assert.equal(r._json.error.code, "ROLLE_PASST_NICHT_ZUR_SEITE");
    assert.match(r._json.error.message, /Hiring-Manager\/in/);
    assert.match(r._json.error.message, /Zeitarbeitsfirmen/);
    assert.equal(p.find("INSERT").length, 0);
    assert.deepEqual(p.find("SELECT type FROM organizations")[0].params, ["org-eigen"]);
  });

  it("Einladung: Unternehmen + Disponent/in -> 400", async () => {
    const r = res();
    await handler(router(pool("company")), "post", "/org/members/invite")(req({ body: { email: "neu@firma.de", role_key: "dispatcher" } }), r);
    assert.equal(r._status, 400);
    assert.match(r._json.error.message, /Unternehmen/);
  });

  it("Einladung: Firma ohne erkennbare Seite -> 400 (fail-closed)", async () => {
    const r = res();
    await handler(router(pool(null)), "post", "/org/members/invite")(req({ body: { email: "neu@firma.de", role_key: "member" } }), r);
    assert.equal(r._status, 400);
    assert.equal(r._json.error.code, "ROLLE_PASST_NICHT_ZUR_SEITE");
  });

  it("Einladung: Zeitarbeitsfirma + Disponent/in kommt an der Rollenpruefung vorbei", async () => {
    const r = res();
    await handler(router(pool("agency")), "post", "/org/members/invite")(req({ body: { email: "neu@firma.de", role_key: "dispatcher" } }), r);
    assert.notEqual(r._json?.error?.code, "ROLLE_PASST_NICHT_ZUR_SEITE");
  });

  for (const pfad of ["/org/members/:userId", "/org/members/:membershipId/role"]) {
    it(`Rollenwechsel ${pfad}: Zeitarbeitsfirma + Hiring-Manager/in -> 400, nichts geschrieben`, async () => {
      const p = pool("agency");
      const r = res();
      await handler(router(p), "patch", pfad)(req({ params: { userId: "u9", membershipId: "m9" }, body: { role_key: "hiring_manager" } }), r);
      assert.equal(r._status, 400);
      assert.equal(r._json.error.code, "ROLLE_PASST_NICHT_ZUR_SEITE");
      assert.equal(p.find("UPDATE").length, 0);
    });

    it(`Rollenwechsel ${pfad}: Owner-Uebergabe ist auf beiden Seiten erlaubt`, async () => {
      for (const seite of ["company", "agency"]) {
        const p = pool(seite, [{ match: (s) => s.includes("UPDATE"), respond: { rows: [{ id: "m9", role_key: "owner" }] } }]);
        const r = res();
        await handler(router(p), "patch", pfad)(req({ params: { userId: "u9", membershipId: "m9" }, body: { role_key: "owner" } }), r);
        assert.equal(r._status, 200, seite);
        assert.equal(r.locals.audit.details.responsible_actor_user_id, "u-eigen");
      }
    });
  }
});

/* ── (1b) Owner-Rechte nur durch einen Owner ─────────────────────────── */

describe("Owner-Rechte vergibt oder entzieht nur ein Owner", () => {
  const ZIEL_IST_OWNER = { match: (s) => s.includes("SELECT role_key FROM org_memberships"), respond: { rows: [{ role_key: "owner" }] } };
  const ZIEL_IST_MITGLIED = { match: (s) => s.includes("SELECT role_key FROM org_memberships"), respond: { rows: [{ role_key: "member" }] } };
  const SCHREIBEN_KLAPPT = { match: (s) => s.includes("UPDATE"), respond: { rows: [{ id: "m9", role_key: "finance" }] } };

  for (const pfad of ["/org/members/:userId", "/org/members/:membershipId/role"]) {
    const params = { userId: "u9", membershipId: "m9" };

    it(`${pfad}: ein Admin macht niemanden zum Owner — 403, nichts geschrieben`, async () => {
      const p = pool("company", [ZIEL_IST_MITGLIED, SCHREIBEN_KLAPPT]);
      const r = res();
      await handler(router(p), "patch", pfad)(req({ orgRole: "admin", params, body: { role_key: "owner" } }), r);
      assert.equal(r._status, 403);
      assert.equal(r._json.error.code, "NUR_OWNER");
      assert.equal(p.find("UPDATE").length, 0);
    });

    it(`${pfad}: ein Admin stuft keinen Owner herab — 403, nichts geschrieben`, async () => {
      const p = pool("company", [ZIEL_IST_OWNER, SCHREIBEN_KLAPPT]);
      const r = res();
      await handler(router(p), "patch", pfad)(req({ orgRole: "admin", params, body: { role_key: "member" } }), r);
      assert.equal(r._status, 403);
      assert.equal(p.find("UPDATE").length, 0);
      // Die Rolle des Ziels wurde an der EIGENEN Firma gelesen.
      const lesen = p.find("SELECT role_key FROM org_memberships")[0];
      assert.ok(lesen.params.includes("org-eigen"));
    });

    it(`${pfad}: ein Admin aendert die Rolle eines gewoehnlichen Mitglieds`, async () => {
      const p = pool("company", [ZIEL_IST_MITGLIED, SCHREIBEN_KLAPPT]);
      const r = res();
      await handler(router(p), "patch", pfad)(req({ orgRole: "admin", params, body: { role_key: "finance" } }), r);
      assert.equal(r._status, 200);
    });

    it(`${pfad}: ein Owner darf Owner-Rechte vergeben`, async () => {
      const p = pool("agency", [ZIEL_IST_MITGLIED, SCHREIBEN_KLAPPT]);
      const r = res();
      await handler(router(p), "patch", pfad)(req({ orgRole: "owner", params, body: { role_key: "owner" } }), r);
      assert.equal(r._status, 200);
    });
  }

  it("Entfernen: ein Admin entfernt keinen Owner — 403, nichts geschrieben", async () => {
    const p = pool("company", [ZIEL_IST_OWNER, SCHREIBEN_KLAPPT]);
    const r = res();
    await handler(router(p), "delete", "/org/members/:userId")(req({ orgRole: "admin", params: { userId: "u9" }, body: { reason: "Probe des Riegels" } }), r);
    assert.equal(r._status, 403);
    assert.equal(r._json.error.code, "NUR_OWNER");
    assert.equal(p.find("UPDATE").length, 0);
  });

  it("Entfernen: ein Owner entfernt einen anderen Owner (der letzte bleibt durch den Dienst geschuetzt)", async () => {
    const p = pool("company", [ZIEL_IST_OWNER, { match: (s) => s.includes("UPDATE"), respond: { rows: [{ id: "m9" }], rowCount: 1 } }]);
    const r = res();
    await handler(router(p), "delete", "/org/members/:userId")(req({ orgRole: "owner", params: { userId: "u9" }, body: { reason: "Uebergabe abgeschlossen" } }), r);
    // countActiveOwners liefert im Mock keine Zeile -> der Dienst meldet LAST_OWNER (409).
    // Entscheidend hier: der Riegel NUR_OWNER greift fuer einen Owner nicht.
    assert.notEqual(r._json?.error?.code, "NUR_OWNER");
  });
});

/* ── (2) Protokoll als CSV ─────────────────────────────────────────────── */

describe("Protokoll als CSV (/org/audit-log/export/csv)", () => {
  const ZEILE = {
    id: 7, action: "org.member.invite", action_type: "CREATE", entity_type: "org_invitation",
    entity_id: "inv-1", actor_email: "chefin@firma.de", status: "SUCCESS",
    created_at: "2026-09-30T16:12:00.000Z", details: { email: "neu@firma.de" }
  };

  it("die Wache steht benannt in der Kette: nur Owner/Admin der Firma", () => {
    const namen = kette(router(pool("company")), "get", "/org/audit-log/export/csv");
    assert.ok(namen.includes("requireRoleMiddleware"), namen.join(" > "));
  });

  it("gebunden an die EIGENE Firma — eine org_id in der Anfrage wird ignoriert", async () => {
    const p = pool("company");
    const r = res();
    await handler(router(p), "get", "/org/audit-log/export/csv")(req({ query: { org_id: "org-fremd" } }), r);
    assert.equal(r._status, 200);
    const lesen = p.calls.filter((c) => /FROM\s+audit_log/i.test(c.sql) && !/INSERT/i.test(c.sql));
    assert.ok(lesen.length >= 1, "das Protokoll wurde gelesen");
    for (const c of lesen) {
      assert.ok(c.params.includes("org-eigen"), "eigene Firma im SQL");
      assert.ok(!c.params.includes("org-fremd"), "fremde Firma darf nicht im SQL stehen");
    }
  });

  it("ohne Eintraege: eine Datei nur mit Kopfzeile, kein Fehler", async () => {
    const r = res();
    await handler(router(pool("company")), "get", "/org/audit-log/export/csv")(req(), r);
    assert.equal(r._status, 200);
    assert.equal(String(r._send).split("\n").length, 1);
    assert.match(r._headers["content-type"], /text\/csv/);
    assert.match(r._headers["content-disposition"], /attachment; filename="protokoll-\d{4}-\d{2}-\d{2}\.csv"/);
  });

  it("mit Eintraegen: eine Zeile je Eintrag, und die Ausfuhr selbst wird protokolliert", async () => {
    const p = pool("company", [
      { match: (s) => /SELECT[\s\S]*FROM\s+audit_log/i.test(s) && !/COUNT\(/i.test(s), respond: { rows: [ZEILE] } },
      { match: (s) => /COUNT\(/i.test(s), respond: { rows: [{ total: 1 }] } }
    ]);
    const r = res();
    await handler(router(p), "get", "/org/audit-log/export/csv")(req({ query: { action_type: "CREATE" } }), r);
    assert.equal(r._status, 200);
    const zeilen = String(r._send).split("\n");
    assert.equal(zeilen.length, 2);
    assert.ok(zeilen[1].includes("org.member.invite"));
    const schreiben = p.calls.filter((c) => /INSERT INTO audit_log/i.test(c.sql));
    assert.equal(schreiben.length, 1, "genau ein Protokolleintrag fuer die Ausfuhr");
    assert.ok(schreiben[0].params.includes("org.audit_log.export"));
    assert.ok(schreiben[0].params.includes("org-eigen"));
  });

  it("500 SERVER_ERROR, wenn das Lesen scheitert — kein halber Download", async () => {
    const p = pool("company", [{ match: (s) => /audit_log/i.test(s), respond: () => { throw new Error("db"); } }]);
    const r = res();
    await handler(router(p), "get", "/org/audit-log/export/csv")(req(), r);
    assert.equal(r._status, 500);
    assert.equal(r._send, null);
  });
});

/* ── (3) Uebersicht und lesbares Protokoll ─────────────────────────────── */

describe("Uebersicht und Protokoll liefern, was die Verwaltung rendert", () => {
  function uebersichtPool(seite) {
    return pool(seite, [
      { match: (s) => s.includes("FROM organizations o WHERE o.id"), respond: { rows: [{ id: "org-eigen", name: "Muster GmbH", type: seite, plan: "PLUS", is_active: true, location_count: 2, department_count: 1 }] } },
      { match: (s) => s.includes("FROM org_invitations"), respond: { rows: [{ id: "i1" }, { id: "i2" }] } }
    ]);
  }

  for (const seite of ["company", "agency"]) {
    it(`Uebersicht (${seite}): Rollen der Seite samt Namen und offene Einladungen`, async () => {
      const r = res();
      await handler(router(uebersichtPool(seite)), "get", "/org/overview")(req(), r);
      assert.equal(r._status, 200);
      assert.deepEqual(r._json.data.rollen.map((x) => x.key), ROLLEN_JE_SEITE[seite]);
      assert.equal(r._json.data.rollen_namen.dispatcher, "Disponent/in");
      assert.equal(r._json.data.counts.open_invitations, 2);
      assert.equal(r._json.data.organization.type, seite);
    });
  }

  it("Protokoll: jeder Eintrag traegt eine lesbare Bezeichnung und WER — aber kein Symbol", async () => {
    const p = pool("company", [
      { match: (s) => /SELECT[\s\S]*FROM\s+audit_log/i.test(s) && !/COUNT\(/i.test(s), respond: { rows: [{ id: 1, action: "auth.login", action_type: "LOGIN", actor_email: "a@b.de", actor_name: "Anna Beispiel", status: "SUCCESS", created_at: "2026-09-30T10:00:00Z" }] } },
      { match: (s) => /COUNT\(/i.test(s), respond: { rows: [{ total: 1 }] } }
    ]);
    const r = res();
    await handler(router(p), "get", "/org/audit-log")(req(), r);
    assert.equal(r._status, 200);
    const e = r._json.data.items[0];
    assert.ok(e.label && e.label !== "auth.login", `Bezeichnung: ${e.label}`);
    assert.equal(e.wer, "Anna Beispiel");
    assert.equal(e.icon, undefined, "Emojis gehoeren nicht in die produktive Oberflaeche");
  });

  it("Rechte-Matrix: die Spalten sind Owner plus die Rollen DIESER Seite", async () => {
    for (const seite of ["company", "agency"]) {
      const r = res();
      await handler(router(pool(seite)), "get", "/org/roles-permissions")(req(), r);
      assert.deepEqual(r._json.data.roles, ["owner", ...ROLLEN_JE_SEITE[seite]], seite);
      assert.equal(r._json.data.rollen_namen.owner, "Owner");
    }
  });

  it("Rechte-Matrix: ist die Seite nicht ermittelbar, bleibt die volle Liste stehen", async () => {
    const p = pool("company", [{ match: (s) => s.startsWith("SELECT type"), respond: () => { throw new Error("db"); } }]);
    // Die Fehler-Route muss vor der Standard-Route greifen:
    p.query = (orig => async (sql, params) => {
      if (String(sql).startsWith("SELECT type")) throw new Error("db");
      return orig(sql, params);
    })(p.query);
    const r = res();
    await handler(router(p), "get", "/org/roles-permissions")(req(), r);
    assert.equal(r._status, 200);
    assert.ok(r._json.data.roles.includes("dispatcher") && r._json.data.roles.includes("hiring_manager"));
  });
});

describe("Protokoll spricht Deutsch — jeder Vorgang der eigenen Firma hat einen Namen", () => {
  // Die Verwaltung zeigt das Protokoll der Firma ihren eigenen Leuten. Ohne Eintrag
  // in ACTION_LABELS faellt die Anzeige auf "Org Member Invite Revoke" zurueck — so
  // gesehen 2026-10-01 im Browser. Diese Probe liest jede Vorgangskennung, die der
  // Code fuer Firma, Firmen-Login und Kontenabgleich schreibt, und verlangt einen Namen.
  it("jede geschriebene org.*-, sso.*-, scim.*- und product_release.*-Kennung steht in ACTION_LABELS", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { getActionLabels } = await import("../services/activityFeedService.js");
    const namen = getActionLabels();
    const wurzel = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
    const gefunden = new Set();
    for (const ordner of ["routes", "services"]) {
      for (const datei of fs.readdirSync(path.join(wurzel, ordner)).filter((d) => d.endsWith(".js"))) {
        const text = fs.readFileSync(path.join(wurzel, ordner, datei), "utf8");
        for (const m of text.matchAll(/action:\s*["'`]((?:org|sso|scim|product_release)\.[a-z_]+\.?[a-z_]*)["'`]/g)) gefunden.add(m[1]);
      }
    }
    assert.ok(gefunden.size >= 20, `zu wenige Kennungen gefunden (${gefunden.size}) — Suchmuster pruefen`);
    const ohne = [...gefunden].filter((k) => !namen[k]);
    assert.deepEqual(ohne, [], `ohne deutschen Namen: ${ohne.join(", ")}`);
  });
});

describe("Rollennamen sind ueberall dieselben", () => {
  // Das Abzeichen oben in der Leiste (roleBadge.js) und die Verwaltung muessen
  // dieselbe Rolle gleich nennen — sonst heisst sie oben "Dispatcher" und in der
  // Verwaltung "Disponent/in". Quelle ist config/orgRollen.js.
  it("die Einladungsseite nennt die angebotene Rolle so wie die Verwaltung", async () => {
    // org-invite.html zeigte "Sie wurden als Dispatcher eingeladen", die Verwaltung
    // "Disponent/in" — dieselbe Person sah zwei Namen fuer eine Rolle (2026-10-01).
    const fs = await import("node:fs");
    const path = await import("node:path");
    const datei = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..", "frontend", "public", "org-invite.html");
    if (!fs.existsSync(datei)) return; // Abbild ohne Frontend
    const text = fs.readFileSync(datei, "utf8");
    const block = (/var ROLE_LABEL=\{([^}]*)\}/.exec(text) || [])[1] || "";
    const paare = [...block.matchAll(/([a-z_]+):'([^']+)'/g)].map((m) => [m[1], m[2]]);
    assert.ok(paare.length >= 9, `zu wenige Eintraege gelesen (${paare.length})`);
    for (const [rolle, name] of paare) {
      assert.equal(name, ROLLEN_NAMEN[rolle], `org-invite.html nennt ${rolle} "${name}", die Verwaltung "${ROLLEN_NAMEN[rolle]}"`);
    }
  });

  it("roleBadge.js nennt jede Rolle so wie ROLLEN_NAMEN", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const datei = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..", "frontend", "public", "js", "roleBadge.js");
    if (!fs.existsSync(datei)) return; // Abbild ohne Frontend
    const text = fs.readFileSync(datei, "utf8");
    const block = text.slice(text.indexOf("var ORG_ROLE_LABELS"), text.indexOf("};", text.indexOf("var ORG_ROLE_LABELS")));
    const paare = [...block.matchAll(/^\s*([a-z_]+):\s*"([^"]+)"/gm)].map((m) => [m[1], m[2]]);
    assert.ok(paare.length >= 12, `zu wenige Eintraege gelesen (${paare.length})`);
    for (const [rolle, name] of paare) {
      assert.equal(name, ROLLEN_NAMEN[rolle], `roleBadge.js nennt ${rolle} "${name}", die Verwaltung "${ROLLEN_NAMEN[rolle]}"`);
    }
  });
});
