/**
 * ═══════════════════════════════════════════════════════════════════════════
 * M4b.5 / M4b.6 — DER NACHTRAG IST EINE LISTE, UND JEDER SCHRITT BIETET SICH AN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Owner 2026-09-05: *"mach da bei der Abfrage noch mehr Platz fuer weitere
 * Sachen, die abgefragt werden koennen."* Abnahme im Plan: **ein neuer Punkt
 * kommt als REGISTEREINTRAG dazu, nicht als Umbau** — je Eintrag: was fehlt,
 * warum es zaehlt, wer es beantworten kann, **ob es die Marktpraesenz blockiert.**
 *
 * DER ERSTE ENTWURF WAR FALSCH, UND DER RAUCHTEST HAT IHN WIDERLEGT. Der
 * Einsatzradius stand als neunte `PRAESENZ_BEDINGUNG` mit `nurDiagnose` — und war
 * fuer ALLE 12 gemeldeten Kraefte unerfuellt, weil gemessen am 2026-10-03 keine
 * der 13 Agenturen mit Kraeften eine `org_settings`-Zeile hat und 0 von 45
 * Profilen einen eigenen Radius. Ein Punkt, der jeden betrifft, haette jeden
 * ohnehin praesenten Menschen in eine Liste gezogen, die "Nicht im Markt" heisst.
 * **Ein Alarm, der immer schrillt, wird abgeschaltet** — und mit ihm der, der
 * zaehlt.
 *
 * Deshalb zwei Register mit zwei Fragen: `PRAESENZ_BEDINGUNGEN` beantwortet
 * "warum ist DIESE Person nicht im Markt", `NACHTRAG_ORGANISATION` beantwortet
 * "was sollten wir nach einem Import noch fragen". Diese Probe haelt beide
 * auseinander und zusammen.
 *
 * OHNE DATENBANK: alles hier laeuft gegen Attrappen oder liest Quelltext.
 *
 * Run: node --test --test-force-exit test/nachtragIstErweiterbar.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { NACHTRAG_ORGANISATION, nachtragFuerStapel } from "../services/nachtragRegister.js";
import { PRAESENZ_BEDINGUNGEN } from "../services/marktpraesenzService.js";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const API = path.resolve(HIER, "..");
const quelle = (rel) => fs.readFileSync(path.join(API, rel), "utf8");
const ohneKommentare = (t) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const SKRIPT = fs.readFileSync(
  path.resolve(API, "..", "frontend", "public", "js", "pages", "mitarbeiter.js"), "utf8");

/* ── 1. Das Register ─────────────────────────────────────────────────── */

describe("M4b.5 · das Register ist eine Liste, und jeder Eintrag ist vollstaendig", () => {
  it("es ist eingefroren und nicht leer", () => {
    assert.ok(Object.isFrozen(NACHTRAG_ORGANISATION), "die Liste ist nicht eingefroren");
    assert.ok(NACHTRAG_ORGANISATION.length >= 1, "das Register ist leer");
  });

  it("jeder Eintrag sagt alles, was die Abnahme verlangt", () => {
    for (const p of NACHTRAG_ORGANISATION) {
      assert.ok(p.schluessel, "ein Eintrag ohne Schluessel ist nicht wiedererkennbar");
      assert.ok((p.frage || "").length > 15, `${p.schluessel}: keine lesbare Frage`);
      assert.ok((p.warum || "").length > 25,
        `${p.schluessel}: kein "warum" — eine Frage ohne Grund wird uebergangen`);
      assert.ok(["firma", "mensch"].includes(p.wer),
        `${p.schluessel}: unbekannte Zustaendigkeit '${p.wer}'`);
      assert.equal(typeof p.blockiert, "boolean",
        `${p.schluessel}: 'blockiert' ist kein Boolean — die Flaeche entscheidet daran den Ton`);
      assert.ok((p.pruefung || "").includes("erledigt"),
        `${p.schluessel}: die Pruefung liefert keine Spalte 'erledigt'`);
      assert.ok(p.pruefung.includes("$1"),
        `${p.schluessel}: die Pruefung ist nicht an die Organisation gebunden`);
    }
  });

  it("der Einsatzradius blockiert NICHT — und das ist gemessen, nicht Geschmack", () => {
    /*
     * Dreistufige Aufloesung: eigener Wert, dann org_settings.default_radius_km,
     * dann 25 km Rueckfall. Es gibt IMMER einen Wert, also kann der Radius
     * niemanden aus dem Markt halten. Wer ihn als Blocker auswiese, meldete eine
     * ganze Belegschaft als unsichtbar, die im Markt steht.
     */
    const radius = NACHTRAG_ORGANISATION.find((p) => p.schluessel === "einsatzradius");
    assert.ok(radius, "der Einsatzradius fehlt im Register (M-E11)");
    assert.equal(radius.blockiert, false,
      "der Radius ist als Blocker ausgewiesen — dann meldet der Nachtrag jeden");
    assert.match(radius.warum, /25 km/,
      "der Text nennt den Rueckfallwert nicht — dann klingt die Frage dringender als sie ist");
    assert.equal(radius.wer, "firma",
      "der Radius wird dem Menschen zugeschrieben; er gehoert an den Betrieb");
  });

  it("der Radius steht NICHT im Praesenz-Register — die Trennung ist der Kern", () => {
    const drin = PRAESENZ_BEDINGUNGEN.some((b) => /radius/i.test(b.schluessel));
    assert.equal(drin, false,
      "der Einsatzradius ist wieder eine Praesenz-Bedingung — gemessen war er fuer ALLE "
      + "Kraefte unerfuellt, und die Liste 'Nicht im Markt' meldet damit jeden");
    /* Und die Begruendung bleibt lesbar, sonst baut sie der naechste Umbau zurueck. */
    const dienst = quelle("services/marktpraesenzService.js");
    assert.ok(dienst.includes("nachtragRegister"),
      "der Verweis auf das Nachtrag-Register fehlt — dann sieht die Abwesenheit des "
      + "Radius wie ein Versehen aus");
  });
});

/* ── 2. Die Eingrenzung auf den Stapel ───────────────────────────────── */

describe("M4b.5 · der Nachtrag fragt nach DIESEN Leuten", () => {
  function spion(antwort) {
    const gesehen = [];
    return {
      gesehen,
      query: async (sql, params) => {
        gesehen.push({ sql: String(sql), params: params || [] });
        if (/org_settings/.test(String(sql))) return { rows: [{ erledigt: true }] };
        return { rows: antwort || [] };
      }
    };
  }

  it("eine LEERE Liste heisst 'keine' und nicht 'alle'", async () => {
    /*
     * Der gefaehrlichste Fall: ein Import ohne angelegte Zeilen. Wer die leere
     * Liste als "kein Filter" liest, macht aus dem Nachtrag einen org-weiten
     * Abruf — genau die Verwechslung, die M3.2 beim Einladen behoben hat
     * ("die 3 gerade importierten" traf 200).
     */
    const pool = spion([{ worker_profile_id: "wp-1", name: "X", b0: false }]);
    const r = await nachtragFuerStapel(pool, "org-1", { profileIds: [] });
    assert.deepEqual(r.personen, [], "die leere Liste wurde als 'alle' gelesen");
    const personenAbfragen = pool.gesehen.filter((c) => /worker_profiles/.test(c.sql));
    assert.equal(personenAbfragen.length, 0,
      "es wurde trotzdem nach Personen gefragt — die Abfrage lief org-weit");
  });

  it("mit Kennungen bindet sie auf den Stapel UND bleibt in der Org", async () => {
    const pool = spion([]);
    await nachtragFuerStapel(pool, "org-1", { profileIds: ["a1", "b2"] });
    const abfrage = pool.gesehen.find((c) => /worker_profiles/.test(c.sql));
    assert.ok(abfrage, "es wurde nicht nach Personen gefragt");
    assert.match(abfrage.sql, /wp\.supplier_org_id = \$1/,
      "die Org-Bedingung fehlt — die Kennungen wuerden die Mandantengrenze aufweiten");
    assert.match(abfrage.sql, /wp\.id = ANY\(\$3::uuid\[\]\)/,
      "der Stapel wird nicht gebunden");
    assert.deepEqual(abfrage.params, ["org-1", 200, ["a1", "b2"]],
      "die Bindung stimmt nicht — Reihenfolge oder Inhalt der Parameter");
  });

  it("ohne Kennungen ist es die org-weite Frage, ohne Stapel-Bedingung", async () => {
    const pool = spion([]);
    await nachtragFuerStapel(pool, "org-1");
    const abfrage = pool.gesehen.find((c) => /worker_profiles/.test(c.sql));
    assert.ok(!/ANY\(\$3/.test(abfrage.sql),
      "ohne Kennungen steht trotzdem eine Stapel-Bedingung im SQL");
    assert.deepEqual(abfrage.params, ["org-1", 200]);
  });

  it("ohne Organisation gibt es nichts — und keine Abfrage", async () => {
    const pool = spion([]);
    const r = await nachtragFuerStapel(pool, null);
    assert.equal(r.offen_gesamt, 0);
    assert.equal(pool.gesehen.length, 0, "es wurde ohne Mandanten gefragt");
  });

  it("die blockierenden Gruende werden getrennt gezaehlt", async () => {
    /* Die Zahl entscheidet, ob die Flaeche draengen darf. Ohne sie muesste sie
       jeden Punkt gleich laut melden — und wird dann ganz ignoriert. */
    const zeile = { worker_profile_id: "wp-1", name: "X" };
    PRAESENZ_BEDINGUNGEN.forEach((_, i) => { zeile[`b${i}`] = true; });
    const nurDiagnose = PRAESENZ_BEDINGUNGEN.findIndex((b) => b.nurDiagnose);
    const echt = PRAESENZ_BEDINGUNGEN.findIndex((b) => !b.nurDiagnose);
    zeile[`b${nurDiagnose}`] = false;
    zeile[`b${echt}`] = false;
    const pool = spion([zeile]);
    const r = await nachtragFuerStapel(pool, "org-1", { profileIds: ["a1"] });
    assert.equal(r.blockierend_gesamt, 1,
      "die Diagnose-Gruende werden als blockierend gezaehlt — oder die echten nicht");
    assert.equal(r.personen[0].gruende.length, 2, "nicht beide Gruende sind im Bericht");
  });
});

/* ── 3. Der Grund sagt selbst, ob er blockiert ───────────────────────── */

describe("M4b.5 · jeder Grund traegt 'blockiert'", () => {
  it("er kommt aus nurDiagnose und ist nicht abgeschrieben", () => {
    const code = ohneKommentare(quelle("services/marktpraesenzService.js"));
    assert.ok(code.includes("blockiert: !b.nurDiagnose"),
      "'blockiert' wird anders bestimmt als aus nurDiagnose — zwei Aussagen ueber "
      + "dieselbe Sache, und sie laufen auseinander");
  });
});

/* ── 4. Die Route ────────────────────────────────────────────────────── */

describe("M4b.5 · die Route bindet und prueft", () => {
  const ROUTE = quelle("routes/workers.js");
  /*
   * BIS ZUR NAECHSTEN ROUTE, nicht 1600 Zeichen weit. Die erste Fassung schnitt
   * eine feste Laenge und reichte damit in den NAECHSTEN Weg hinein — und der
   * traegt `[0-9a-fA-F-]{36}` in seinem Pfad. Die Rueckmutation "Kennungen
   * ungeprueft durchreichen" blieb deshalb GRUEN: die Zusicherung fand das
   * Muster beim Nachbarn. Dieselbe Klasse, die in dieser Arbeit schon viermal
   * zugeschlagen hat.
   */
  const start = ROUTE.indexOf('router.get("/workers/nachtrag"');
  assert.ok(start > 0, "die Route wurde nicht gefunden");
  const naechste = ROUTE.indexOf("router.", start + 10);
  const block = ROUTE.slice(start, naechste > start ? naechste : ROUTE.length);

  it("sie liegt hinter derselben Wache wie der Bericht", () => {
    assert.ok(block.includes('requireScope("read:workers")'), "der Zugriffsbereich fehlt");
    assert.ok(block.includes('rperm("worker.view")'), "die Berechtigung fehlt");
    assert.ok(block.includes("...base"), "die gemeinsame Kette fehlt");
  });

  it("sie verwirft Kennungen, die keine UUID sind", () => {
    /* Sonst entscheidet Postgres mit einem Typfehler, und der Aufrufer liest
       einen 500er statt einer Antwort. */
    assert.match(block, /\[0-9a-fA-F-\]\{36\}/,
      "die Kennungen werden ungeprueft durchgereicht");
    assert.ok(/profileIds\s*=\s*roh\s*\n?\s*\?/.test(block) || block.includes("roh\n        ?"),
      "fehlt der Parameter, muss null (org-weit) herauskommen — nicht eine leere Liste");
  });

  it("sie gibt req.orgId weiter, nicht eine Kennung aus dem Rumpf", () => {
    assert.ok(block.includes("req.orgId"),
      "die Organisation kommt nicht aus der Sitzung — dann waehlt der Aufrufer den Mandanten");
  });
});

/* ── 5. Die Flaeche: erweiterbar, mit allen Zustaenden ───────────────── */

describe("M4b.5 · die Flaeche kennt keinen Punkt namentlich", () => {
  const fn = SKRIPT.slice(SKRIPT.indexOf("function zeigeCsvNachtrag("),
    SKRIPT.indexOf("function zeigeCsvNachtrag(") + 4200);

  it("sie rendert, was der Server schickt — ein neuer Punkt braucht keine Zeile hier", () => {
    assert.ok(fn.includes("r.organisation"), "die Organisations-Punkte werden nicht gelesen");
    assert.ok(fn.includes("r.personen"), "die Personen werden nicht gelesen");
    assert.ok(!/einsatzradius/.test(fn),
      "die Flaeche nennt einen Punkt namentlich — dann ist ein neuer Punkt ein Umbau, "
      + "und genau das verbietet die Abnahme von M4b.5");
  });

  it("alle vier Zustaende: Laden, leer, Fehler, Inhalt", () => {
    assert.ok(fn.includes("mit.nachtrag.loading"), "kein Ladezustand");
    assert.ok(fn.includes("mit.nachtrag.none"), "kein Leerzustand");
    assert.ok(fn.includes("mit.nachtrag.error"), "kein Fehlerzustand");
    assert.ok(/ds-alert--warning/.test(fn),
      "der Fehler wird nicht als Fehler gezeigt — 'nichts offen' waere eine beruhigende Luege");
  });

  it("jeder Wert aus der Antwort wird escapt", () => {
    /* `esc(` UNMITTELBAR vor dem Feld, nicht die genaue Klammer: `e.name` traegt
       einen Rueckfall (`esc(e.name || …)`) und ist damit sehr wohl escapt. Die
       erste Fassung dieser Zeile verlangte `esc(e.name)` woertlich und war rot,
       obwohl der Code richtig war — die Probe traf ihre eigene Schreibweise. */
    for (const feld of ["p.frage", "p.warum", "g.grund", "e.name"]) {
      assert.ok(fn.includes("esc(" + feld),
        `${feld} landet unescaped in innerHTML — die Werte kommen aus der Datenbank`);
    }
    /* Und die Gegenprobe, damit die Zeile oben nicht leer gruen ist: ein
       unescapter Einbau desselben Feldes darf NICHT vorkommen. */
    for (const feld of ["p.frage", "p.warum", "g.grund"]) {
      assert.ok(!new RegExp("\\+\\s*" + feld.replace(".", "\\.") + "\\s*\\+").test(fn),
        `${feld} wird (auch) unescaped eingebaut`);
    }
  });

  it("der Ton haengt an 'blockiert', nicht an der Farbe allein", () => {
    assert.ok(fn.includes("plakette(p.blockiert)") && fn.includes("plakette(g.blockiert)"),
      "die Unterscheidung blockierend / nur eine Frage fehlt");
    assert.ok(fn.includes("mit.nachtrag.blockiert") && fn.includes("mit.nachtrag.nurFrage"),
      "die Plakette hat keinen Text — Farbe allein traegt keine Bedeutung");
  });

  it("die Obergrenze ist BENANNT, nicht still", () => {
    /* Eine Adresse mit 200 Kennungen sprengt die Kopfzeilen-Grenze. Abschneiden
       waere eine stille Verkuerzung; stattdessen wird org-weit gefragt und es
       steht da. */
    assert.ok(fn.includes("NACHTRAG_KENNUNGEN_MAX"), "es gibt keine Grenze");
    assert.ok(fn.includes("mit.nachtrag.orgWeit"),
      "die Grenze wirkt still — der Leser haelt den org-weiten Stand fuer den des Stapels");
    assert.ok(!/slice\(0,\s*NACHTRAG_KENNUNGEN_MAX\)/.test(fn),
      "die Kennungen werden abgeschnitten — eine stille Verkuerzung");
  });
});

/* ── 6. M4b.6: der naechste Schritt bietet sich an ───────────────────── */

describe("M4b.6 · nach dem Import UND nach dem Einladen geht es weiter", () => {
  it("der Import zeigt den Nachtrag", () => {
    assert.ok(SKRIPT.includes('id="csv-nachtrag"'), "es gibt keinen Platz fuer den Nachtrag");
    assert.ok(/if \(_csvAlleProfilIds\.length\) zeigeCsvNachtrag\(_csvAlleProfilIds\)/.test(SKRIPT),
      "der Import ruft den Nachtrag nicht auf");
  });

  it("das Einladen endet nicht im Einladungs-Reiter", () => {
    const i = SKRIPT.indexOf("function csvInviteImported(");
    const fn = SKRIPT.slice(i, i + 1400);
    assert.ok(fn.includes("zeigeCsvNachtrag(_csvAlleProfilIds)"),
      "nach dem Einladen bietet sich kein naechster Schritt an — erledigt, und dann?");
  });

  it("der Nachtrag nimmt ALLE angelegten, das Einladen nur die einladbaren", () => {
    /*
     * Zwei Fragen, zwei Mengen. Wer sie verwechselt, baut den Fehler aus M3.1
     * nach: der Knopf versprach "alle 10" und lud sieben ein. Und genau die ohne
     * E-Mail (gemessen 9 von 45 ohne eigenes Konto) sind der Fall, den nur die
     * Firma loesen kann — sie DUERFEN im Nachtrag nicht fehlen.
     */
    assert.ok(/_csvAlleProfilIds = \(res\.created \|\| \[\]\)/.test(SKRIPT),
      "die Menge aller angelegten wird nicht gebildet");
    assert.ok(!/_csvAlleProfilIds = einladbar/.test(SKRIPT),
      "der Nachtrag nimmt nur die einladbaren — dann fehlen genau die ohne Konto");
    const i = SKRIPT.indexOf("var rumpf = _csvImportierteProfilIds");
    assert.ok(i > 0, "das Einladen nimmt nicht mehr die einladbaren");
  });

  it("die Texte stehen in BEIDEN Sprachen", () => {
    for (const key of ["mit.nachtrag.title", "mit.nachtrag.none", "mit.nachtrag.blockiert",
      "mit.nachtrag.nurFrage", "mit.nachtrag.orgWeit", "mit.nachtrag.error",
      "mit.nachtrag.loading"]) {
      const treffer = SKRIPT.match(new RegExp("'" + key.replace(/\./g, "\\.") + "':", "g")) || [];
      assert.equal(treffer.length, 2, `${key} fehlt in einer Sprache`);
    }
  });
});
