/**
 * Faehigkeiten auf den Katalog normalisieren (Multi-Skill Welle 11).
 *
 * Der gemessene Schaden vor dieser Welle: ein Unternehmen, das "Seniorenpflege" suchte,
 * bekam auf ein Angebot "Altenpflege" 0 von 25 Skill-Punkten — obwohl beides im eigenen
 * Katalog dieselbe Faehigkeit ist. 115 von 162 Katalog-Eintraegen tragen Synonyme; sie
 * waren allesamt wirkungslos. Diese Tests halten fest, dass Bedeutungen verglichen werden
 * und nicht Schreibweisen — und dass dabei nichts falsch-positiv zusammenfaellt.
 *
 * Run: node --test --test-force-exit test/skillNormalization.service.test.js
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  buildSkillIndex, loadSkillIndex, normalizeTags, expandTags, resetSkillIndexCache, INDEX_TTL_MS
} from "../services/skillNormalizationService.js";
import { scoreMatch } from "../services/matchingEngine.js";

const ALTENPFLEGE = "11111111-1111-1111-1111-111111111111";
const STAPLER = "22222222-2222-2222-2222-222222222222";

const KATALOG = [
  { id: ALTENPFLEGE, name: "Altenpflege", aliases: ["Seniorenpflege", "Pflegekraft Senioren"] },
  { id: STAPLER, name: "Staplerfahrer:in", aliases: ["Gabelstaplerfahrer"] }
];

describe("Index bauen", () => {
  it("bildet Name UND Synonym auf dieselbe Faehigkeit ab", () => {
    const i = buildSkillIndex(KATALOG);
    assert.equal(i.schluessel("Altenpflege"), ALTENPFLEGE);
    assert.equal(i.schluessel("Seniorenpflege"), ALTENPFLEGE);
    assert.equal(i.schluessel("SENIORENPFLEGE"), ALTENPFLEGE, "Gross-/Kleinschreibung darf nicht trennen");
    assert.equal(i.schluessel("  Seniorenpflege  "), ALTENPFLEGE, "Leerraum ebenso wenig");
  });

  it("laesst eine unbekannte Faehigkeit als Rohform stehen", () => {
    // Wichtig fuer Rueckwaertskompatibilitaet: zwei Betriebe, die dasselbe Eigengewaechs
    // tippen, sollen sich weiterhin finden — auch ohne Katalog-Eintrag.
    const i = buildSkillIndex(KATALOG);
    assert.equal(i.schluessel("Hausinterner Spezialkram"), "hausinterner spezialkram");
    assert.equal(i.kennt("Hausinterner Spezialkram"), false);
  });

  it("laesst einen Namen ein gleichlautendes Synonym schlagen", () => {
    // Ein Name ist die staerkere Aussage als ein Synonym eines anderen Skills.
    const i = buildSkillIndex([
      { id: "a", name: "Kran", aliases: [] },
      { id: "b", name: "Hebezeug", aliases: ["Kran"] }
    ]);
    assert.equal(i.schluessel("Kran"), "a");
  });

  it("gibt zu einem Schluessel den Anzeigenamen zurueck", () => {
    const i = buildSkillIndex(KATALOG);
    assert.equal(i.anzeige(ALTENPFLEGE), "Altenpflege");
  });

  it("uebersteht leere und kaputte Zeilen", () => {
    const i = buildSkillIndex([null, {}, { id: "x", name: "", aliases: null }, ...KATALOG]);
    assert.equal(i.schluessel("Altenpflege"), ALTENPFLEGE);
  });
});

describe("Tags normalisieren", () => {
  it("verhaelt sich ohne Index exakt wie vorher", () => {
    const out = normalizeTags(["Altenpflege", "SENIORENPFLEGE"], null);
    assert.deepEqual([...out].sort(), ["altenpflege", "seniorenpflege"],
      "Ohne Index bleibt es beim Vergleich der kleingeschriebenen Rohform");
  });

  it("fuehrt Schreibweisen derselben Faehigkeit zusammen", () => {
    const out = normalizeTags(["Altenpflege", "Seniorenpflege"], buildSkillIndex(KATALOG));
    assert.equal(out.size, 1, "Zwei Schreibweisen, eine Faehigkeit");
  });

  it("ueberspringt Leerwerte", () => {
    assert.equal(normalizeTags(["", null, undefined, "  "], null).size, 0);
  });
});

describe("Suchbegriffe erweitern (der Filter, nicht das Bewerten)", () => {
  const index = buildSkillIndex(KATALOG);

  it("holt zu einem Synonym den Katalognamen dazu", () => {
    // Der Kern: der Marktplatz filtert in SQL per Array-Ueberlappung auf exakte
    // Zeichenketten. Ohne diese Erweiterung bekommt ein "Seniorenpflege"-Suchender die
    // "Altenpflege"-Angebote GAR NICHT geliefert — das Bewerten kommt dann zu spaet.
    const out = expandTags(["Seniorenpflege"], index);
    assert.ok(out.includes("Altenpflege"), "Der Katalogname muss mit in den Filter");
    assert.ok(out.includes("Seniorenpflege"), "Der getippte Begriff bleibt erhalten");
  });

  it("liefert die ORIGINAL-Schreibung des Katalogs", () => {
    // `skill_tags` enthaelt "Altenpflege", weil der Angebotsgenerator den Katalognamen
    // uebernimmt. Eine kleingeschriebene Variante wuerde den Array-Filter nicht treffen.
    const out = expandTags(["seniorenpflege"], index);
    assert.ok(out.includes("Altenpflege"), "Gross geschrieben, wie im Katalog");
  });

  it("laesst unbekannte Begriffe unveraendert", () => {
    assert.deepEqual(expandTags(["Voelliger Unsinn"], index), ["Voelliger Unsinn"],
      "Ein Index darf die Suche nicht verfaelschen");
  });

  it("aendert ohne Index nichts", () => {
    assert.deepEqual(expandTags(["Seniorenpflege"], null), ["Seniorenpflege"]);
  });

  it("ueberspringt Leerwerte und entdoppelt", () => {
    const out = expandTags(["Altenpflege", "Seniorenpflege", "", null], index);
    assert.equal(out.length, new Set(out).size, "Keine Dubletten im Filter");
    assert.ok(!out.includes(""));
  });
});

describe("Wirkung im Matching", () => {
  const index = buildSkillIndex(KATALOG);
  const punkte = (r) => r.reasons.find((x) => x.factor === "skills")?.points ?? 0;

  it("erkennt das Synonym als Treffer — der Kern dieser Welle", () => {
    const ohne = scoreMatch({ skill_tags: ["Seniorenpflege"] }, { skill_tags: ["Altenpflege"] });
    const mit = scoreMatch({ skill_tags: ["Seniorenpflege"] }, { skill_tags: ["Altenpflege"] }, { skillIndex: index });
    assert.equal(punkte(ohne), 0, "Vorher: dieselbe Faehigkeit, null Punkte");
    assert.ok(punkte(mit) > 0, "Jetzt ein Treffer");
    assert.equal(punkte(mit), 25);
  });

  it("fuehrt fremde Faehigkeiten NICHT zusammen", () => {
    const r = scoreMatch({ skill_tags: ["Staplerfahrer:in"] }, { skill_tags: ["Altenpflege"] }, { skillIndex: index });
    assert.equal(punkte(r), 0, "Ein Index darf keine falschen Treffer erzeugen");
  });

  it("laesst Faehigkeiten ausserhalb des Katalogs weiter matchen", () => {
    const r = scoreMatch({ skill_tags: ["Eigengewaechs"] }, { skill_tags: ["eigengewaechs"] }, { skillIndex: index });
    assert.equal(punkte(r), 25);
  });

  it("vermerkt im Ergebnis, ob normalisiert wurde", () => {
    // Erklaerbarkeit: der Disponent soll spaeter sehen koennen, warum etwas zusammenfiel.
    const mit = scoreMatch({ skill_tags: ["Seniorenpflege"] }, { skill_tags: ["Altenpflege"] }, { skillIndex: index });
    const ohne = scoreMatch({ skill_tags: ["Altenpflege"] }, { skill_tags: ["Altenpflege"] });
    assert.equal(mit.reasons.find((x) => x.factor === "skills").meta.normalized, true);
    assert.equal(ohne.reasons.find((x) => x.factor === "skills").meta.normalized, false);
  });
});

describe("Laden und Cache", () => {
  beforeEach(() => resetSkillIndexCache());

  function poolStub(rows = KATALOG, { fehler = false } = {}) {
    const calls = [];
    return {
      calls,
      query: async (sql) => {
        calls.push(sql);
        if (fehler) throw new Error("DB weg");
        return { rows };
      }
    };
  }

  it("fragt den Katalog nur einmal ab, nicht bei jedem Match", async () => {
    // Der Katalog ist Referenzdatenbestand. Eine Abfrage pro Kandidat waere bei 300 Kunden
    // der teuerste Pfad im ganzen System.
    const pool = poolStub();
    await loadSkillIndex(pool);
    await loadSkillIndex(pool);
    await loadSkillIndex(pool);
    assert.equal(pool.calls.length, 1);
  });

  it("laedt nach Ablauf der Haltezeit neu", async () => {
    const pool = poolStub();
    await loadSkillIndex(pool, { jetzt: 0 });
    await loadSkillIndex(pool, { jetzt: INDEX_TTL_MS + 1 });
    assert.equal(pool.calls.length, 2);
  });

  it("liest nur aktive Katalog-Eintraege", async () => {
    const pool = poolStub();
    await loadSkillIndex(pool);
    assert.match(pool.calls[0], /is_active = TRUE/);
  });

  it("legt das Matching NICHT lahm, wenn der Katalog nicht erreichbar ist", async () => {
    // Ein Verbindungsfehler darf keine Vermittlung blockieren — dann wird eben
    // gerechnet wie vor dieser Welle.
    const index = await loadSkillIndex(poolStub(KATALOG, { fehler: true }));
    assert.equal(index, null);
    const r = scoreMatch({ skill_tags: ["Altenpflege"] }, { skill_tags: ["Altenpflege"] }, { skillIndex: index });
    assert.equal(r.reasons.find((x) => x.factor === "skills").points, 25);
  });
});
