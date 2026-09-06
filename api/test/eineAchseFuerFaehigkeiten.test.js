/**
 * EINE Achse für Fähigkeiten — auf allen Flächen (N1b, 2026-09-06).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DER BEFUND, DER DIESE WELLE AUSGELÖST HAT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Welle N1 hat die beiden MARKT-Flächen auf den Plattform-Katalog gestellt.
 * Damit war die Sache aber nicht erledigt, denn `matchingEngine.scoreMatch`
 * vergleicht die Fähigkeiten einer Nachfrage mit denen eines Angebots als
 * MENGEN — und ohne Index als kleingeschriebene Rohform. Eine gemeinsame Achse
 * entsteht nur, wenn ALLE Seiten aus derselben Menge wählen.
 *
 * Gemessen am 2026-09-06 taten das drei von fünf:
 *
 *   einsatzportal-profil.html       Arbeiter, eigenes Profil     ✓ Katalog
 *   marketplace_demand_create.html  Unternehmen, Ausschreibung   ✓ seit N1
 *   capacity_exchange_form.html     Agentur, Angebot             ✓ seit N1
 *   mitarbeiter.html                Agentur, Mitarbeiterprofil   ✗ FREITEXT
 *   requisition_create.html         Unternehmen, Anforderung     ✗ FREITEXT
 *
 * Die vierte war die folgenreichste. Sie bot 142 fest im Browser verdrahtete
 * Begriffe an; davon standen **33** im Katalog (Namen und Aliase zusammen) —
 * **109 nicht**. Darunter "Stapler", "Pick-by-Voice", "MAG-Schweissen".
 * Kanonisch heisst es "Staplerfahrer:in".
 *
 * Und sie schrieb per `PATCH /workers/:id` in `skill_tags` — FREITEXT. Die
 * relationale Zuordnung `worker_profile_skills` blieb dabei LEER, und genau
 * daraus baut `capacityOfferGeneratorService` die Marktangebote. Wer seine Leute
 * dort pflegte, brachte sie nie in den Markt und fand sie im Matching nicht
 * wieder — ohne dass irgendetwas nach Fehler aussah.
 *
 * Run: node --test --test-force-exit test/eineAchseFuerFaehigkeiten.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createWorkersRouter } from "../routes/workers.js";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const API = path.resolve(HIER, "..");
const OEFFENTLICH = path.resolve(API, "..", "frontend", "public");

const SEITEN = {
  mitarbeiter:   path.join(OEFFENTLICH, "mitarbeiter.html"),
  mitarbeiterJs: path.join(OEFFENTLICH, "js", "pages", "mitarbeiter.js"),
  anforderung:   path.join(OEFFENTLICH, "requisition_create.html"),
  nachfrage:     path.join(OEFFENTLICH, "marketplace_demand_create.html"),
  angebot:       path.join(OEFFENTLICH, "capacity_exchange_form.html"),
  portal:        path.join(OEFFENTLICH, "einsatzportal-profil.html"),
  waehler:       path.join(OEFFENTLICH, "js", "skillPicker.js")
};
const oberflaecheDa = Object.values(SEITEN).every((p) => fs.existsSync(p));
const lies = (k) => fs.readFileSync(SEITEN[k], "utf8");

/* ── Vorrichtung fuer die Routen-Proben ──────────────────────────────── */

function zugang(regeln = []) {
  const calls = [];
  const lauf = async (sql, params = []) => {
    if (typeof sql === "string" && ["BEGIN", "COMMIT", "ROLLBACK"].includes(sql.trim().toUpperCase())) {
      return { rows: [], rowCount: 0 };
    }
    calls.push({ sql, params });
    for (const [nadel, wert] of regeln) {
      if (typeof sql === "string" && sql.includes(nadel)) {
        const rows = typeof wert === "function" ? wert(sql, params) : wert;
        return { rows, rowCount: rows.length };
      }
    }
    return { rows: [], rowCount: 0 };
  };
  return { calls, query: lauf, connect: async () => ({ query: lauf, release() {} }) };
}

const durchlass = (_q, _s, next) => next();

function deps(pool) {
  return {
    pool,
    requireAuth: durchlass,
    requireFeature: () => durchlass,
    requestLimiter: durchlass,
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    config: {},
    getUserAndPlan: async (id) => ({ id, plan: "PRO", role: "agency" })
  };
}

function handler(router, method, pfad) {
  for (const l of router.stack) {
    if (l.route && l.route.path === pfad && l.route.methods[method]) {
      return l.route.stack[l.route.stack.length - 1].handle;
    }
  }
  throw new Error(`Route ${method.toUpperCase()} ${pfad} fehlt`);
}

function antwort() {
  return {
    _status: 200, _json: null, locals: {},
    status(c) { this._status = c; return this; },
    json(b) { this._json = b; return this; }
  };
}

const ORG_A = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
const SKILL = "11111111-1111-4111-a111-111111111111";

/* ═══════════════════════════════════════════════════════════════════════
   1. Der katalog-gebundene Weg fuer die Agentursicht
   ═══════════════════════════════════════════════════════════════════════ */

describe("N1b · die Agentur setzt Faehigkeiten ueber den Katalog", () => {

  it("die beiden Endpunkte gibt es ueberhaupt", () => {
    const router = createWorkersRouter(deps(zugang()));
    assert.ok(handler(router, "get", "/workers/:userId/skills"));
    assert.ok(handler(router, "put", "/workers/:userId/skills"));
  });

  it("EIN FREMDER MITARBEITER wird nicht angefasst", async () => {
    /*
     * Die Mandantengrenze, und zwar vor dem Schreiben. Geprueft wird beides:
     * die Antwort UND dass keine Zuordnung geschrieben wurde.
     */
    const pool = zugang([["FROM worker_profiles", () => [{ id: "wp-1", supplier_org_id: ORG_B }]]]);
    const res = antwort();
    await handler(createWorkersRouter(deps(pool)), "put", "/workers/:userId/skills")(
      { params: { userId: "u-fremd" }, orgId: ORG_A, session: { userId: "u1" },
        body: { skills: [{ skill_id: SKILL }] }, query: {}, headers: {}, get: () => "" },
      res, () => {}
    );
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error, "ORG_BOUNDARY_VIOLATION");
    assert.strictEqual(
      pool.calls.filter((c) => /INSERT INTO worker_profile_skills|DELETE FROM worker_profile_skills/i.test(c.sql)).length,
      0, "es wurde in einen fremden Mitarbeiter geschrieben");
    assert.strictEqual(res.locals.audit, undefined,
      "ein abgelehnter Versuch hinterliess einen Erfolgs-Auditeintrag");
  });

  it("ein unbekannter Mitarbeiter ist 404", async () => {
    const pool = zugang([["FROM worker_profiles", () => []]]);
    const res = antwort();
    await handler(createWorkersRouter(deps(pool)), "put", "/workers/:userId/skills")(
      { params: { userId: "gibt-es-nicht" }, orgId: ORG_A, session: { userId: "u1" },
        body: { skills: [] }, query: {}, headers: {}, get: () => "" },
      res, () => {}
    );
    assert.strictEqual(res._status, 404);
  });

  it("NUR KENNUNGEN, kein Freitext", async () => {
    /*
     * Der Kern: dieser Weg nimmt `skill_id` entgegen und sonst nichts. Ein
     * Namensfeld hier waere die Hintertuer, durch die der Freitext
     * zurueckkaeme — und `setWorkerSkills` verwirft ohnehin alles, was nicht
     * gegen `platform_skills` aufloest.
     */
    const pool = zugang();
    const res = antwort();
    await handler(createWorkersRouter(deps(pool)), "put", "/workers/:userId/skills")(
      { params: { userId: "u-1" }, orgId: ORG_A, session: { userId: "u1" },
        body: { skills: [{ name: "Irgendwas Getipptes" }] }, query: {}, headers: {}, get: () => "" },
      res, () => {}
    );
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "VALIDATION");
  });

  it("der eigene Mitarbeiter geht durch — gegen den Katalog geprueft", async () => {
    const pool = zugang([
      ["FROM worker_profiles", () => [{ id: "wp-1", supplier_org_id: ORG_A }]],
      ["FROM platform_skills", () => [{ id: SKILL, name: "Staplerfahrer:in" }]]
    ]);
    const res = antwort();
    await handler(createWorkersRouter(deps(pool)), "put", "/workers/:userId/skills")(
      { params: { userId: "u-1" }, orgId: ORG_A, session: { userId: "u1" },
        body: { skills: [{ skill_id: SKILL }] }, query: {}, headers: {}, get: () => "" },
      res, () => {}
    );
    assert.strictEqual(res._status, 200, JSON.stringify(res._json));

    const geprueft = pool.calls.find((c) => /FROM platform_skills/i.test(c.sql));
    assert.ok(geprueft, "die Kennung wurde nicht gegen den Katalog geprueft");
    assert.ok(/is_active = TRUE/.test(geprueft.sql),
      "auch stillgelegte Katalog-Eintraege wuerden angenommen");

    assert.ok(pool.calls.some((c) => /INSERT INTO worker_profile_skills/i.test(c.sql)),
      "die relationale Zuordnung wurde nicht geschrieben — der Angebotsgenerator "
      + "sieht den Menschen dann weiterhin nicht");

    assert.strictEqual(res.locals.audit.action, "worker.update_skills");

    /*
     * DIE HERKUNFT DORT PRUEFEN, WO SIE LANDET.
     *
     * Die erste Fassung las `res.locals.audit.details.source` - ein Literal im
     * Auditblock, das mit dem Wert, den der Dienst bekommt, nichts zu tun hat.
     * Eine Rueckmutation hat den DIENST-Wert auf "worker" gestellt, und die
     * Probe blieb gruen: sie las die Beschriftung, nicht die Sache.
     *
     * `worker_profile_skills.source` ist die Spalte, an der spaeter haengt, wer
     * die Zuordnung gesetzt hat - der Mensch selbst oder sein Disponent.
     */
    const eingefuegt = pool.calls.find((c) => /INSERT INTO worker_profile_skills/i.test(c.sql));
    assert.ok(eingefuegt, "es wurde nichts eingefuegt");
    assert.ok(eingefuegt.params.includes("agency"),
      "die gespeicherte Herkunft ist nicht `agency`: " + JSON.stringify(eingefuegt.params));
    assert.strictEqual(res.locals.audit.details.source, "agency",
      "der Auditeintrag nennt eine andere Herkunft als die gespeicherte Zeile");
  });

  it("die Org-Kennung kommt aus der SITZUNG, nicht aus dem geladenen Profil", () => {
    /*
     * Formprobe. Beide sind hier gleich — `getScopedWorker` hat es geprueft.
     * Aber die Sitzung ist die Quelle, der die Pruefung galt; aus dem geladenen
     * Datensatz zu nehmen hiesse, dem zu vertrauen, was man gerade erst
     * verifiziert hat, und macht eine spaetere Lockerung unsichtbar.
     */
    const quelle = fs.readFileSync(path.join(API, "routes", "workers.js"), "utf8");
    const block = quelle.slice(quelle.indexOf('router.put("/workers/:userId/skills"'));
    const rumpf = block.slice(0, block.indexOf("\n  });") + 6);
    assert.match(rumpf, /supplierOrgId: req\.orgId/,
      "die Org-Kennung stammt nicht aus der Sitzung");
    assert.match(rumpf, /workerProfileId: scoped\.worker\.id/);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   2. Keine Fläche schreibt mehr an der Achse vorbei
   ═══════════════════════════════════════════════════════════════════════ */

describe("N1b · alle fuenf Flaechen waehlen aus derselben Menge",
  { skip: oberflaecheDa ? false : "frontend/public nicht im Abbild" }, () => {

  it("die fest verdrahtete Liste ist WEG", () => {
    const js = lies("mitarbeiterJs");
    assert.ok(!/var SKILL_CATALOG_GROUPS = \[/.test(js),
      "die zweite Faehigkeitsliste steht wieder im Browser — 109 ihrer 142 "
      + "Begriffe kennt der Katalog nicht, sie koennen mit nichts matchen");
    assert.ok(!/function renderSkillCatalog\(/.test(js),
      "die eigene Katalogflaeche ist zurueck");
  });

  it("das FREITEXTFELD der Mitarbeiterseite ist weg", () => {
    const html = lies("mitarbeiter");
    assert.ok(!/id="newSkillInput"/.test(html),
      "\"Zusaetzlicher Spezial-Skill\" ist zurueck — der direkteste Weg, an der "
      + "Achse vorbei zu schreiben");
    assert.ok(!/id="skillCatalogSections"/.test(html));
    assert.match(html, /<div id="skillPickerMitarbeiter"><\/div>/,
      "es gibt keinen Ort, an dem der Waehler zeichnen koennte");
  });

  it("die Mitarbeiterseite laedt den Waehler VOR ihrem eigenen Skript", () => {
    /* Beide mit `defer`: dann ist die Reihenfolge im Dokument auch die
       Ausfuehrungsreihenfolge. Andersherum stuende `TCSkillPicker` beim Start
       noch nicht, und der Waehler bliebe stumm. */
    const html = lies("mitarbeiter");
    const w = html.indexOf('/public/js/skillPicker.js');
    const m = html.indexOf('/public/js/pages/mitarbeiter.js');
    assert.ok(w > -1, "der Waehler wird nicht geladen");
    assert.ok(w < m, "der Waehler wird NACH mitarbeiter.js geladen");
    assert.match(html, /<script defer src="\/public\/js\/skillPicker\.js"><\/script>/,
      "ohne `defer` haengt die Reihenfolge am Ladeverhalten statt am Dokument");
  });

  it("FAEHIGKEITEN GEHEN NICHT MEHR DURCH DAS PROFIL", () => {
    /*
     * Der eigentliche Befund. `PATCH /workers/:id` mit `skill_tags: string[]`
     * fuellte nur den Spiegel und liess `worker_profile_skills` leer — genau
     * die Tabelle, aus der der Angebotsgenerator die Marktangebote baut.
     */
    const js = lies("mitarbeiterJs");
    assert.ok(!/skill_tags: _currentSkills/.test(js),
      "die Faehigkeiten reisen wieder als Wortliste im Profil-PATCH mit");
    /* Mit Klammer, und der Aufruf dazu: `function faehigkeitenSpeichernWeg`
       enthaelt den kuerzeren Namen ebenso - eine Rueckmutation hat genau das
       ausgenutzt und ueberlebt. Eine Funktion ohne Aufrufer ist ausserdem so
       wirkungslos wie eine fehlende. */
    assert.match(js, /function faehigkeitenSpeichern\(workerUserId\) \{/,
      "es gibt keinen eigenen Speicherweg fuer Faehigkeiten");
    assert.match(js, /faehigkeitenSpeichern\(kennung\)\.then\(/,
      "der Speicherweg wird nie gerufen");
    assert.match(js, /"\/workers\/" \+ encodeURIComponent\(workerUserId\) \+ "\/skills"/,
      "der katalog-gebundene Endpunkt wird nicht gerufen");
    assert.match(js, /method: "PUT"/);
    assert.match(js, /skill_id: a\.skill_id/,
      "es werden keine Katalog-Kennungen geschickt");
  });

  it("die Reihenfolge stimmt: erst die Faehigkeiten, dann das Profil", () => {
    /*
     * `setWorkerSkills` schreibt den Spiegel `worker_profiles.skill_tags[]`
     * selbst. Liefe das Profil-PATCH danach mit einer alten Wortliste, wuerde
     * es den frisch gesetzten Spiegel ueberschreiben.
     */
    const js = lies("mitarbeiterJs");
    const i = js.indexOf("faehigkeitenSpeichern(kennung)");
    const j = js.indexOf('method: "PATCH"', i);
    assert.ok(i > -1 && j > i,
      "das Profil wird vor den Faehigkeiten geschrieben — der Spiegel geht verloren");
  });

  it("der Waehler wird auf BEIDEN Ladepfaden aufgesetzt", () => {
    /* Es gibt zwei Wege zu einem Mitarbeiter (oeffnen und nach dem Speichern).
       Fehlt einer, steht der Waehler leer neben gefuellten Faehigkeiten. */
    const js = lies("mitarbeiterJs");
    const n = (js.match(/faehigkeitenWaehlerAufsetzen\(\(worker\.skill_tags/g) || []).length;
    assert.strictEqual(n, 2, `der Waehler wird an ${n} statt an 2 Ladepfaden aufgesetzt`);
  });

  it("die ANFORDERUNGSSEITE nimmt keinen Freitext mehr", () => {
    const html = lies("anforderung");
    assert.match(html, /<input type="hidden" id="cSkills"\/>/,
      "das Freitextfeld ist zurueck — sein Platzhalter schlug ausgerechnet "
      + "\"Gabelstapler\" vor, einen ALIAS");
    assert.match(html, /<div id="skillPickerAnforderung"><\/div>/);
    assert.match(html, /<script src="\/public\/js\/skillPicker\.js"><\/script>/);
    assert.match(html, /container: "skillPickerAnforderung"/);
  });

  it("KEINE Flaeche traegt mehr ein tippbares Faehigkeitsfeld", () => {
    /*
     * Die zusammenfassende Probe. Sie sucht nicht nach bekannten Kennungen,
     * sondern nach der FORM: ein Eingabefeld, dessen Kennung oder Beschriftung
     * nach Faehigkeiten klingt und das Text annimmt.
     *
     * Absichtlich ueber ALLE Seiten, nicht ueber eine Liste — eine neue Seite
     * mit demselben Fehler faellt so von allein auf.
     */
    /**
     * Liest eine Funktion in diesem Dokument das Feld `kennung` UND schickt sie
     * an `/skills/propose`? Dann ist es der gefuehrte Weg, kein Freitext.
     */
    const istVorschlagsfeld = (text, kennung) => {
      if (!text.includes("/skills/propose")) return false;
      for (const m of text.matchAll(/(?:async\s+)?function\s+\w+\s*\([^)]*\)\s*\{/g)) {
        /* Vom Funktionskopf bis zum naechsten: grob, aber es genuegt - gesucht
           wird die Naehe der beiden Merkmale, nicht der genaue Rumpf. */
        const ab = m.index;
        const naechste = text.indexOf("function ", ab + m[0].length);
        const rumpf = text.slice(ab, naechste === -1 ? text.length : naechste);
        if (rumpf.includes(kennung) && rumpf.includes("/skills/propose")) return true;
      }
      return false;
    };

    const treffer = [];
    const suche = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { suche(p); continue; }
        if (!e.name.endsWith(".html")) continue;
        const roh = fs.readFileSync(p, "utf8").replace(/<!--[\s\S]*?-->/g, " ");
        for (const m of roh.matchAll(/<input\b[^>]*>/gi)) {
          const tag = m[0];
          if (!/id="[^"]*[Ss]kill[^"]*"/.test(tag)) continue;
          if (/type="(hidden|checkbox)"/.test(tag)) continue;
          /* Ein Suchfeld ist kein Eingabefeld: es waehlt aus, was da ist. */
          if (/id="[^"]*([Ss]earch|[Ss]uche|[Ff]ilter)[^"]*"/.test(tag)) continue;

          /*
           * DER GEFUEHRTE WEG IST KEIN FREITEXT - und diese Unterscheidung hat
           * die Probe sich selbst beigebracht: sie hat beim ersten Lauf
           * `ownSkillInput` im Arbeiterportal angeklagt. Das Feld TIPPT aber
           * nichts in die Auswahl, es SCHLAEGT VOR (`POST /skills/propose`),
           * und der Dienst antwortet mit dem kanonischen Begriff, falls es ihn
           * unter anderem Namen laengst gibt. Genau dieses Muster verlangt N1.
           *
           * Die Ausnahme ist eng: sie greift nur, wenn im selben Dokument eine
           * Funktion steht, die DIESES Feld liest UND an `/skills/propose`
           * schickt. Ein neues Freitextfeld kann sich nicht dahinter verstecken.
           */
          const kennung = (tag.match(/id="([^"]+)"/) || [])[1];
          if (kennung && istVorschlagsfeld(roh, kennung)) continue;
          treffer.push(path.relative(OEFFENTLICH, p).replace(/\\/g, "/") + ": " + tag.slice(0, 90));
        }
      }
    };
    suche(OEFFENTLICH);
    assert.deepEqual(treffer, [],
      "es gibt wieder tippbare Faehigkeitsfelder:\n  " + treffer.join("\n  "));

    /* GEGENPROBE zur Ausnahme: sie muss ein Feld OHNE Vorschlagsweg weiterhin
       anklagen. Eine Ausnahme, die alles durchlaesst, ist keine. */
    assert.ok(!istVorschlagsfeld('<input id="skillFreitext" type="text"/>', "skillFreitext"),
      "die Ausnahme greift auch ohne Vorschlagsweg - dann prueft die Probe nichts");
    assert.ok(istVorschlagsfeld(fs.readFileSync(SEITEN.portal, "utf8"), "ownSkillInput"),
      "der gefuehrte Weg im Arbeiterportal wird nicht als solcher erkannt");
  });

  it("die drei bereits katalog-gebundenen Flaechen bleiben es", () => {
    /* Gegenprobe: diese Welle darf nichts zurueckdrehen. */
    assert.match(lies("portal"), /PortalApi\.get\('\/skills\/catalog'\)/,
      "das Arbeiterportal liest den Katalog nicht mehr");
    assert.match(lies("portal"), /PortalApi\.put\('\/worker\/me\/skills'/,
      "das Arbeiterportal speichert nicht mehr katalog-gebunden");
    assert.match(lies("nachfrage"), /TCSkillPicker\.mount\(\{/);
    assert.match(lies("angebot"), /TCSkillPicker\.mount\(\{/);
  });

  it("der Waehler liefert Kennungen — sonst kann niemand relational speichern", () => {
    const w = lies("waehler");
    assert.match(w, /auswahl: function \(\)/,
      "der Waehler gibt keine Katalog-Kennungen heraus");
    assert.match(w, /kennungNach\[schluessel\(s\.name\)\] = s\.id;/,
      "die Kennung wird beim Laden nicht mitgefuehrt");
    assert.match(w, /\.filter\(function \(x\) \{ return x\.skill_id; \}\)/,
      "ein Name ohne Kennung koennte hinausgehen — der Endpunkt wuerde ihn "
      + "stumm verwerfen, und niemand saehe warum");
  });

  it("Gruppen-Aktionen gibt es nur, wo sie hingehoeren", () => {
    /*
     * Auf der Mitarbeiterseite sind sie ein Gewinn (zwoelf Kaestchen einzeln
     * anzuklicken ist Arbeit). Auf den MARKT-Seiten waeren sie ein Schaden:
     * eine Ausschreibung mit zwoelf Pflicht-Faehigkeiten findet niemanden.
     */
    assert.match(lies("mitarbeiterJs"), /groupActions: true/,
      "die Mitarbeiterseite hat die Gruppen-Aktionen verloren");
    for (const k of ["nachfrage", "angebot", "anforderung"]) {
      assert.ok(!/groupActions: true/.test(lies(k)),
        `${k}: eine Marktflaeche bietet "alle auswaehlen" an`);
    }
  });
});
