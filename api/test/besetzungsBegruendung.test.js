import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { scoreWorkersForAssignment } from "../services/assignmentStaffingService.js";

/*
 * DIE BEGRUENDUNG — der Satz, auf den hin ein Mensch disponiert wird.
 *
 * Befund vor dieser Welle: SIE HATTE KEINE EINZIGE PROBE. Der Text, den ein
 * Disponent liest, bevor er jemanden auf einen Einsatz setzt, war ungeprueft.
 * Owner-Beanstandung (Plan I, 8.2 "Begruendungs-Darstellung"): die senkrechte
 * Textsaeule. Die Erhebung hat ZWEI Ursachen gefunden, nicht eine —
 *
 *   1. SPRACHE: die Etiketten waren Fragmente (Substantivphrase + Doppelpunkt +
 *      roher Feldwert). "Rollenfit nicht sauber belegt: Maler" laesst offen, ob
 *      "Maler" der Mangel ist oder das Koennen. Bei einer Besetzung ist das
 *      keine Feinheit.
 *   2. STILLE KUERZUNG: dieselbe Liste wurde ZWEIMAL auf 3 gekappt — hier im
 *      Dienst und nochmals im Frontend. Aus neun fehlenden Nachweisen wurden
 *      drei, und nichts sagte, dass etwas fehlt.
 *
 * Beides wird hier am Verhalten geprueft, nicht am Quelltext: die Funktion ist
 * rein synchron, der Client-Parameter unbenutzt, kein Datenbankzugriff. Genau
 * darum steht in ihrem Kommentar, dass Quelltext-Suche in Welle G6 einen
 * Mutanten hat ueberleben lassen — `if (false && ...)` enthaelt die gesuchte
 * Zeichenkette weiterhin.
 */

/** Ein Einsatz, der eine Rolle, ein Schichtmodell und Skills verlangt. */
function einsatz(extra = {}) {
  return {
    id: "asg-1",
    requisition_role: "Maler",
    requisition_shift_requirements: JSON.stringify({ model: "Frühschicht" }),
    requisition_skill_tags: ["Gerüstbau"],
    requested_quantity: 1,
    ...extra,
  };
}

/** Eine Kraft, die nichts davon mitbringt — damit jeder Mangel auch anfaellt. */
function kraft(extra = {}) {
  return {
    user_id: "w-1",
    first_name: "Ada",
    last_name: "Riegel",
    is_active: true,
    skill_tags: [],
    ...extra,
  };
}

const etiketten = (eintrag) => (eintrag || []).map((e) => e.label);

function bewerte(a, w) {
  const [erste] = scoreWorkersForAssignment(null, a, [w]);
  assert.ok(erste, "die Kandidatenzeile muss ueberhaupt bewertet werden");
  return erste;
}

describe("Besetzungs-Begruendung — ganze Aussagen statt Etikett-Fragmente", () => {
  it("der Rollen-Mangel benennt, was GESUCHT war", () => {
    const s = bewerte(einsatz(), kraft());
    const rolle = etiketten(s.missing_requirements).find((l) => /Rollenfit/.test(l));
    assert.ok(rolle, "ein nicht belegter Rollenfit muss ueberhaupt gemeldet werden");
    assert.match(rolle, /gesucht: Maler/,
      "ohne 'gesucht:' bleibt offen, ob 'Maler' der Mangel oder das Koennen ist");
    assert.doesNotMatch(rolle, /nicht sauber belegt: Maler/,
      "das alte Fragment (Substantivphrase + Doppelpunkt + Feldwert) darf nicht zurueckkehren");
  });

  it("der Schicht-Mangel benennt, was GESUCHT war", () => {
    const s = bewerte(einsatz(), kraft());
    const schicht = etiketten(s.missing_requirements).find((l) => /Schicht/.test(l));
    assert.ok(schicht, "eine nicht belegte Schichtfaehigkeit muss gemeldet werden");
    assert.match(schicht, /gesucht: Frühschicht/);
  });

  it("der Skill-Mangel benennt, was GESUCHT war", () => {
    const s = bewerte(einsatz(), kraft());
    const skills = etiketten(s.missing_requirements).find((l) => /Skills fehlen/.test(l));
    assert.ok(skills, "fehlende Skills muessen gemeldet werden");
    assert.match(skills, /gesucht: Gerüstbau/);
  });

  it("JEDE Begruendung ist eine Aussage, keine Aufzaehlung ohne Bezug", () => {
    /* Der strukturelle Riegel: wer eine neue Begruendung hinzufuegt, die einen
     * rohen Feldwert hinter einen Doppelpunkt haengt, wird hier rot. Die
     * erlaubte Form ist "... — gesucht: X"; wer eine Liste NENNT statt sie
     * anzuhaengen, darf den Doppelpunkt behalten. */
    const s = bewerte(einsatz({ requisition_skill_tags: ["Gerüstbau", "Höhenarbeit"] }), kraft());
    for (const l of etiketten(s.missing_requirements)) {
      assert.ok(l.length > 12, `zu knapp, um eine Aussage zu sein: "${l}"`);
      assert.ok(/ — gesucht: /.test(l),
        `"${l}" nennt den Mangel, aber nicht die Anforderung — genau die Verwechslung, die 8.2 abstellt`);
    }
  });
});

describe("Besetzungs-Begruendung — eine gekappte Liste sagt, dass sie kappt", () => {
  it("bei mehr als drei fehlenden Skills wird der Rest GEZAEHLT, nicht verschwiegen", () => {
    const viele = ["Gerüstbau", "Höhenarbeit", "Lackieren", "Spritzen", "Tapezieren", "Trockenbau"];
    const s = bewerte(einsatz({ requisition_skill_tags: viele }), kraft());
    const skills = etiketten(s.missing_requirements).find((l) => /Skills fehlen/.test(l));
    assert.match(skills, /\(\+3 weitere\)/,
      "sechs fehlende Skills, drei gezeigt — die drei anderen muessen sichtbar mitgezaehlt werden");
  });

  it("bei genau drei fehlenden Skills steht KEIN Zusatz", () => {
    const s = bewerte(einsatz({ requisition_skill_tags: ["A-Fach", "B-Fach", "C-Fach"] }), kraft());
    const skills = etiketten(s.missing_requirements).find((l) => /Skills fehlen/.test(l));
    assert.doesNotMatch(skills, /weitere/,
      "'(+0 weitere)' waere Laerm — der Zusatz erscheint nur, wenn wirklich etwas fehlt");
    assert.match(skills, /A-Fach, B-Fach, C-Fach/);
  });

  it("S: die Probe wuerde eine wieder stille Kuerzung bemerken", () => {
    /* Rueckmutation. Ohne sie belegt der Test oben nur, dass die aktuelle
     * Fassung passt — nicht, dass er den Rueckfall SIEHT. */
    const stillGekappt = ["a", "b", "c", "d", "e", "f"].slice(0, 3).join(", ");
    assert.doesNotMatch(stillGekappt, /\(\+3 weitere\)/,
      "die Probe wuerde eine still gekappte Liste durchgehen lassen");
    const ehrlich = "a, b, c (+3 weitere)";
    assert.match(ehrlich, /\(\+3 weitere\)/,
      "die Probe wuerde eine ehrliche Liste faelschlich beanstanden");
  });
});

describe("Besetzungs-Begruendung — die Kachel ist breit genug fuer Prosa", () => {
  /*
   * Die zweite Ursache der senkrechten Saeule war NICHT der Text, sondern die
   * Kachelbreite. Gemessen im echten Schuber (`.drw-lg`, max-width 540px):
   *
   *   minmax(220px,1fr)          -> zwei Spalten a 229px, Kachelhoehe 183px
   *   minmax(min(100%,320px),1fr) -> eine Spalte 468px, Kachelhoehe 117px
   *
   * 320px ist die Schwelle, ab der im 467px breiten Raster keine zweite Spalte
   * mehr passt (320+10+320 = 650 > 467) — die Kachel bekommt die volle Breite,
   * auf breiteren Flaechen entstehen weiterhin zwei Spalten. `min(100%, …)`
   * verhindert zusaetzlich den Ueberlauf auf sehr schmalen Geraeten.
   *
   * Eine Zahl im Quelltext, die aus einer Messung stammt, verliert ihren Grund,
   * sobald jemand sie zurueckdreht. Deshalb steht sie hier fest.
   */
  const quelle = fs.readFileSync(
    new URL("../../frontend/public/js/pages/workerSubmissionsReview.js", import.meta.url),
    "utf8"
  );

  it("die Begruendungs-Kachel faellt im Schuber auf volle Breite", () => {
    assert.ok(
      quelle.includes("repeat(auto-fit,minmax(min(100%,320px),1fr))"),
      "Die Kachel mit Blocker/Fehlt steht wieder in einem Raster, das im 540px-Schuber " +
      "zwei Spalten a 229px bildet. Gemessen: 183px Texthoehe statt 117px — das ist die " +
      "senkrechte Saeule, die der Owner beanstandet hat."
    );
  });

  it("das alte 220px-Raster ist verschwunden", () => {
    assert.ok(
      !quelle.includes("minmax(220px,1fr)"),
      "220px erzeugt im Schuber zwei Spalten und damit die Saeule zurueck"
    );
  });
});

describe("Besetzungs-Begruendung — die Schreibweise des Kunden bleibt stehen", () => {
  /*
   * Diesen Befund hat erst die Probe hervorgeholt: Der Abgleich normalisiert
   * alles auf Kleinschreibung — zu Recht, sonst verfehlt "Gerüstbau" ein
   * "gerüstbau" und eine geeignete Kraft gilt als ungeeignet. Nur wurde
   * dieselbe normalisierte Marke auch ANGEZEIGT. Der Disponent las "gesucht:
   * gerüstbau, a-fach" und musste annehmen, die Plattform habe den Bedarf
   * seines Kunden verstuemmelt.
   *
   * Die Trennung ist der eigentliche Gehalt dieser Gruppe: unten wird geprueft,
   * dass die Anzeige die Schreibweise behaelt UND der Abgleich weiter
   * normalisiert. Nur eines von beiden zu pruefen liesse zu, dass man das
   * andere repariert, indem man dieses kaputtmacht.
   */

  it("die Anzeige behaelt Gross- und Kleinschreibung", () => {
    const s = bewerte(einsatz({ requisition_skill_tags: ["Gerüstbau", "Höhenarbeit"] }), kraft());
    const skills = etiketten(s.missing_requirements).find((l) => /Skills fehlen/.test(l));
    assert.match(skills, /Gerüstbau/, "die Schreibweise des Kunden darf nicht kleingeschrieben werden");
    assert.match(skills, /Höhenarbeit/);
    assert.doesNotMatch(skills, /gerüstbau/, "die normalisierte Marke gehoert nicht in die Anzeige");
  });

  it("der ABGLEICH normalisiert weiterhin — sonst waere die Anzeige teuer erkauft", () => {
    /* Die Kraft schreibt klein, der Kunde gross. Wuerde der Abgleich die
     * Schreibweise ernst nehmen, gaelte sie als ungeeignet — ein weit
     * schlimmerer Fehler als eine haessliche Beschriftung. */
    const s = bewerte(
      einsatz({ requisition_skill_tags: ["Gerüstbau"] }),
      kraft({ skill_tags: ["gerüstbau"] })
    );
    const skills = etiketten(s.missing_requirements).find((l) => /Skills fehlen/.test(l));
    assert.equal(skills, undefined,
      "'gerüstbau' muss 'Gerüstbau' treffen — sonst hat die Anzeige den Abgleich beschaedigt");
  });

  it("dieselbe Marke in zwei Schreibweisen erscheint nur EINMAL", () => {
    const s = bewerte(
      einsatz({ requisition_skill_tags: ["Gerüstbau"], demand_skill_tags: ["gerüstbau"] }),
      kraft()
    );
    const skills = etiketten(s.missing_requirements).find((l) => /Skills fehlen/.test(l));
    assert.equal((skills.match(/erüstbau/gi) || []).length, 1,
      "'Gerüstbau' und 'gerüstbau' sind dieselbe Anforderung und duerfen nicht doppelt dastehen");
  });

  it("ohne bekannte Schreibweise faellt die Anzeige auf die Marke zurueck, nie auf leer", () => {
    /* `zeigeMarken` bekommt hier absichtlich keine Zuordnung. Eine Begruendung,
     * die leer bleibt, weil eine Zuordnung fehlt, waere schlimmer als eine
     * kleingeschriebene. */
    const s = bewerte(einsatz({ requisition_skill_tags: [], demand_requirements: JSON.stringify({ skills: ["schweissen"] }) }), kraft());
    const skills = etiketten(s.missing_requirements).find((l) => /Skills fehlen/.test(l));
    assert.match(skills, /schweissen/, "die Marke muss einspringen, wenn keine Schreibweise bekannt ist");
  });
});
