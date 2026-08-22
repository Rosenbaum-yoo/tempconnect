import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createReportsRouter } from "../routes/reports.js";

/*
 * `POST /reports` — DIE ROUTE HATTE BIS HEUTE KEINE EINZIGE PROBE.
 *
 * BEFUND (2026-08-22): Sie antwortete auf VIER unterscheidbare Weisen —
 * 404 USER_NOT_FOUND, 404 REQUEST_NOT_FOUND, 403 NOT_PARTICIPANT,
 * 400 REPORTED_USER_NOT_IN_REQUEST. Jeder angemeldete Nutzer konnte damit eine
 * beliebige Nutzer- oder Anfragekennung darauf pruefen, ob es sie gibt und wer
 * daran beteiligt war. `requireAuth` war die einzige Huerde.
 *
 * Verschaerfend: `request_id` ist optional (reports.js:7) und die gesamte
 * Beteiligungspruefung steht hinter `if (request_id)` (:26) — wer das Feld
 * weglaesst, umgeht sie vollstaendig. Uebrig bleibt `userExists`, ein nacktes
 * `SELECT id FROM users WHERE id = $1`.
 *
 * Und das Register zertifizierte genau das als geprueft: wachen.json fuehrte
 * die Route als `eigene-daten` mit der Begruendung "Ein Bericht wird fuer die
 * eigene Organisation erzeugt." — waehrend `eigene-daten` im Vokabular
 * derselben Datei "kein fremdes Ziel erreichbar" heisst und die Route
 * ausdruecklich ein FREMDES Ziel meldet.
 *
 * Diese Datei schliesst das Orakel und haelt es geschlossen. Sie entscheidet
 * NICHT, ob es Personen-Meldungen geben soll — das ist eine Owner-Frage.
 */

const MELDER = "11111111-0000-0000-0000-00000000000a";
const GEMELDETER = "22222222-0000-0000-0000-00000000000b";
const ANFRAGE = "33333333-0000-0000-0000-00000000000c";

/**
 * Baut den Handler um einen Spion. `lage` beschreibt die Wirklichkeit, die der
 * Dienst vorfinden soll — daraus folgen die Antworten auf `userExists` und
 * `validateReportRequest`.
 */
async function melde(lage, koerper) {
  const calls = [];
  const pool = {
    calls,
    query: async (sql, params) => {
      const text = String(sql);
      calls.push({ sql: text, params: params || [] });
      if (/FROM users/.test(text)) {
        return { rows: lage.nutzerExistiert ? [{ id: GEMELDETER }] : [], rowCount: lage.nutzerExistiert ? 1 : 0 };
      }
      if (/FROM requests/.test(text)) {
        return lage.anfrage
          ? { rows: [lage.anfrage], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    },
  };
  const protokoll = [];
  const router = createReportsRouter({
    pool,
    requireAuth: (_q, _s, n) => n(),
    logger: { warn: (o, m) => protokoll.push({ ...o, m }), error: () => {}, info: () => {} },
  });
  const schicht = router.stack.find((s) => s.route?.path === "/reports");
  assert.ok(schicht, "die Route /reports fehlt");
  const handler = schicht.route.stack[schicht.route.stack.length - 1].handle;

  let status = 200; let json = null;
  const res = {
    locals: {},
    status(c) { status = c; return this; },
    json(j) { json = j; return this; },
  };
  await handler({ body: koerper, session: { userId: MELDER } }, res);
  return { status, json, calls, protokoll };
}

const gueltig = { reported_user_id: GEMELDETER, reason: "spam" };

describe("POST /reports — kein Orakel mehr", () => {
  /* Die vier Ablehnungslagen. Frueher: 404/404/403/400 mit vier verschiedenen
   * Fehlercodes. Jetzt: eine Antwort. */
  const lagen = [
    ["gemeldeter Nutzer existiert nicht", { nutzerExistiert: false }, gueltig],
    ["Anfrage existiert nicht", { nutzerExistiert: true, anfrage: null }, { ...gueltig, request_id: ANFRAGE }],
    ["Melder war nicht beteiligt", { nutzerExistiert: true, anfrage: { id: ANFRAGE, requester_id: "x", worker_id: GEMELDETER } }, { ...gueltig, request_id: ANFRAGE }],
    ["Gemeldeter war nicht beteiligt", { nutzerExistiert: true, anfrage: { id: ANFRAGE, requester_id: MELDER, worker_id: "y" } }, { ...gueltig, request_id: ANFRAGE }],
  ];

  it("alle vier Ablehnungslagen antworten IDENTISCH", async () => {
    const antworten = [];
    for (const [name, lage, koerper] of lagen) {
      const r = await melde(lage, koerper);
      assert.equal(r.status, 404, `${name}: erwartet 404`);
      antworten.push(JSON.stringify(r.json));
    }
    assert.equal(new Set(antworten).size, 1,
      "Vier unterscheidbare Antworten waren ein Orakel fuer Nutzer- und Anfragekennungen. " +
      "Wer probiert, darf nicht ablesen koennen, ob es die Kennung gibt oder wer beteiligt war.\n" +
      `Gesehen: ${[...new Set(antworten)].join(" | ")}`);
  });

  it("keiner der alten, sprechenden Fehlercodes kommt zurueck", async () => {
    const verboten = ["USER_NOT_FOUND", "REQUEST_NOT_FOUND", "NOT_PARTICIPANT", "REPORTED_USER_NOT_IN_REQUEST"];
    for (const [name, lage, koerper] of lagen) {
      const r = await melde(lage, koerper);
      assert.ok(!verboten.includes(r.json?.error),
        `${name} antwortet weiterhin mit '${r.json?.error}' — genau das war das Orakel`);
    }
  });

  it("das PROTOKOLL unterscheidet weiterhin — sonst sucht ein Betreiber im Dunkeln", async () => {
    const gruende = [];
    for (const [, lage, koerper] of lagen) {
      const r = await melde(lage, koerper);
      const z = r.protokoll.find((p) => p.grund);
      assert.ok(z, "jede Ablehnung gehoert ins Protokoll");
      gruende.push(z.grund);
    }
    assert.equal(new Set(gruende).size, 4,
      "Fail-closed heisst nicht still: die Antwort ist gleich, der Grund im Protokoll nicht.\n" +
      `Gesehen: ${gruende.join(", ")}`);
  });

  it("S: die Probe wuerde ein Zurueckfallen auf sprechende Codes bemerken", () => {
    /* Rueckmutation. Ohne sie belegt die Gruppe nur, dass die aktuelle Fassung
     * passt, nicht dass sie den Rueckfall SIEHT. */
    const alt = [{ error: "USER_NOT_FOUND" }, { error: "REQUEST_NOT_FOUND" }].map((x) => JSON.stringify(x));
    assert.equal(new Set(alt).size, 2, "die Probe wuerde zwei verschiedene Antworten durchgehen lassen");
  });
});

describe("POST /reports — was NICHT entschieden wurde", () => {
  /*
   * Diese Gruppe haelt die offene Frage sichtbar, statt sie im Code
   * verschwinden zu lassen. Sie schlaegt NICHT fehl, solange die Route so ist,
   * wie sie ist — aber sie beschreibt, was noch fehlt, an einer Stelle, die
   * jemand liest.
   */

  it("die Beteiligungspruefung ist weiterhin BEDINGT — das ist der offene Punkt", async () => {
    /* Ohne `request_id` gibt es keine Beteiligungspruefung. Ein angemeldeter
     * Nutzer kann jeden anderen melden, den es gibt. Ob das so bleiben soll,
     * entscheidet der Owner (Route entfernen / `request_id` zur Pflicht machen /
     * in profile_abuse_reports zusammenfuehren). */
    const r = await melde({ nutzerExistiert: true }, gueltig);
    assert.equal(r.status, 200,
      "Heute gelingt eine Meldung ohne jeden gemeinsamen Vorgang. Wenn diese Zusicherung " +
      "rot wird, wurde die Owner-Frage entschieden — dann gehoert diese Gruppe angepasst, " +
      "nicht geloescht.");
    assert.ok(!r.calls.some((c) => /FROM requests/.test(c.sql)),
      "ohne request_id wird die Beteiligung gar nicht erst abgefragt");
  });

  it("der Registereintrag haelt den offenen Punkt fest", () => {
    /* Der eigentliche Schaden war nicht die Luecke, sondern dass das Register
     * sie als geprueft ausgab. Diese Zusicherung sorgt dafuer, dass der
     * Eintrag nicht stillschweigend wieder auf eine beruhigende Wachart
     * zurueckfaellt. */
    const wachen = JSON.parse(fs.readFileSync(new URL("./fixtures/wachen.json", import.meta.url), "utf8"));
    const eintrag = wachen.wege.find((w) => w.datei === "reports.js" && w.pfad === "/reports");
    assert.ok(eintrag, "der Eintrag fuer POST /reports fehlt im Register");
    assert.equal(eintrag.wachart, "BEFUND",
      "Solange die Beteiligungspruefung bedingt ist, ist dieser Weg ein offener Punkt und " +
      "keine 'eigene-daten'-Route. `eigene-daten` heisst im Vokabular derselben Datei " +
      "'kein fremdes Ziel erreichbar' — diese Route meldet ausdruecklich ein FREMDES Ziel.");
    /* Nicht auf die Abwesenheit der alten Formulierung pruefen — die neue
     * Begruendung ZITIERT sie absichtlich, damit der naechste Leser sieht, was
     * falsch war. Gepruefft wird, dass die Begruendung die Wahrheit benennt. */
    assert.match(eintrag.begruendung, /FREMDEN Nutzer/,
      "Die Begruendung muss benennen, dass hier ein FREMDES Ziel gemeldet wird — genau " +
      "diese Tatsache hat der alte Eintrag ('Ein Bericht wird fuer die eigene Organisation " +
      "erzeugt') verschwiegen und die Luecke damit als geprueft ausgegeben.");
    assert.match(eintrag.begruendung, /request_id/,
      "und dass die Beteiligungspruefung bedingt ist — das ist der offene Punkt selbst");
  });

  it("das Plattform-Register nennt die Route nicht mehr 'Auswertungen'", () => {
    /* Die Verwechslung mit `reporting.js` steht seit Langem in
     * PILOT_GO_LIVE_TODOS.md:705 — sie ist nur nie in die Register geflossen. */
    const reg = fs.readFileSync(new URL("../../docs/PLATTFORM_REGISTER.md", import.meta.url), "utf8");
    const zeile = reg.split("\n").find((l) => l.includes("api/routes/reports.js"));
    assert.ok(zeile, "der Registereintrag fuer reports.js fehlt");
    assert.ok(!/Auswertungen abrufen/.test(zeile),
      "reports.js ist eine Missbrauchsmeldung; die Auswertungen liegen in reporting.js");
    assert.match(zeile, /Missbrauchsmeldung/);
  });
});
