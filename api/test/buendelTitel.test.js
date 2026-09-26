/**
 * buendelTitel — der EINE Titel eines Gesamtangebots (M4c.1).
 *
 * Zwei Wege erzeugen Gesamtangebote: von Hand (`buildBundleOfferData`, JavaScript)
 * und vom Takt (`BUENDEL_MATERIALISIEREN_SQL`, SQL). Beide setzen dieselben
 * Bestandteile ein. Diese Probe haelt die beiden FASSUNGEN — Text und
 * SQL-Ausdruck — ueber dieselben Beispiele gegeneinander und prueft auf
 * GLEICHHEIT, nicht auf die Anwesenheit eines Musters: eine Probe, die nur sieht,
 * dass irgendwo "Faehigkeiten" steht, liesse jede Abweichung durch.
 *
 * Der SQL-Ausdruck wird dafuer hier ausgewertet, ohne Datenbank: er hat genau
 * die Form `'<Vorsatz>' || (<Zahl>)::text || '<Nachsatz>'`, und genau diese Form
 * wird zerlegt. Weicht die Form ab, scheitert schon das Zerlegen — lauter, als
 * ein falscher Titel es je waere. Gegen Postgres selbst belegt am 2026-09-24:
 * fuer 1, 2, 4 und 16 byte-gleich (33/33/33/34 Bytes UTF-8).
 *
 * Run: node --test test/buendelTitel.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BUENDEL_TITEL_VORSATZ,
  BUENDEL_TITEL_NACHSATZ,
  buendelTitel,
  buendelTitelSql
} from "../services/buendelTitel.js";
import { buildBundleOfferData } from "../services/capacityOfferGeneratorService.js";

const BEISPIELE = [1, 2, 4, 16];

/** Wertet GENAU die Form aus, die `buendelTitelSql` liefert — und nichts sonst. */
function sqlAuswerten(ausdruck, n) {
  const teile = ausdruck.split(" || ");
  assert.equal(teile.length, 3, `der SQL-Ausdruck hat nicht drei Glieder: ${ausdruck}`);
  const literal = (t) => {
    assert.ok(t.startsWith("'") && t.endsWith("'"), `kein Zeichenkettenliteral: ${t}`);
    return t.slice(1, -1).replaceAll("''", "'");
  };
  const zahl = /^\((.+)\)::text$/.exec(teile[1]);
  assert.ok(zahl, `das mittlere Glied ist keine Zahl als Text: ${teile[1]}`);
  return `${literal(teile[0])}${n}${literal(teile[2])}`;
}

describe("buendelTitel — eine Wahrheit, zwei Fassungen", () => {
  it("der Wortlaut ist festgenagelt, Zeichen fuer Zeichen", () => {
    assert.equal(buendelTitel(1), "Allround-Kraft – 1 Fähigkeiten");
    assert.equal(buendelTitel(4), "Allround-Kraft – 4 Fähigkeiten");
    assert.equal(buendelTitel(16), "Allround-Kraft – 16 Fähigkeiten");
  });

  it("der Strich ist ein Gedankenstrich (U+2013), kein Bindestrich", () => {
    /* So stand er immer in `buildBundleOfferData` und so steht er in jedem
       vorhandenen Gesamtangebot. Ein Bindestrich saehe gleich aus und waere
       ein anderer Titel — jede Suche nach dem alten fiele aus. */
    const strich = BUENDEL_TITEL_VORSATZ.trim().split(" ").pop();
    assert.equal(strich, "–");
    assert.equal(strich.codePointAt(0), 0x2013);
  });

  it("SQL-Ausdruck und Text ergeben fuer dieselben Beispiele denselben Titel", () => {
    for (const n of BEISPIELE) {
      assert.equal(sqlAuswerten(buendelTitelSql("COUNT(*)"), n), buendelTitel(n),
        `fuer ${n} Faehigkeiten weichen Takt und Hand voneinander ab`);
    }
  });

  it("der SQL-Ausdruck setzt die Zahl ein, die ihm gegeben wird", () => {
    assert.equal(buendelTitelSql("COUNT(*)"),
      `'${BUENDEL_TITEL_VORSATZ}' || (COUNT(*))::text || '${BUENDEL_TITEL_NACHSATZ}'`);
    assert.ok(buendelTitelSql("cardinality(x.namen)").includes("(cardinality(x.namen))::text"));
  });

  it("kein Apostroph und kein Rueckstrich in den Bestandteilen", () => {
    /* Sie landen als Literale im SQL. Ein Apostroph beendete das Literal
       mitten im Satz — die Anweisung scheiterte fuer die ganze Plattform. */
    for (const teil of [BUENDEL_TITEL_VORSATZ, BUENDEL_TITEL_NACHSATZ]) {
      assert.ok(!teil.includes("'"), `Apostroph in: ${teil}`);
      assert.ok(!teil.includes("\\"), `Rueckstrich in: ${teil}`);
    }
  });

  it("die Schranke laesst nur Zahl-Ausdruecke ein, keine Zeichenketten und keine Anweisungen", () => {
    for (const boese of ["1); DROP TABLE capacity_posts; --", "'x'", "n -- Kommentar", "n; SELECT 1", "$1"]) {
      assert.throws(() => buendelTitelSql(boese), /BUENDEL_TITEL_AUSDRUCK_UNGUELTIG/, `durchgelassen: ${boese}`);
    }
    for (const gut of ["COUNT(*)", "n", "cardinality(b.namen)", "COUNT(DISTINCT ps.id)"]) {
      assert.doesNotThrow(() => buendelTitelSql(gut), `abgewiesen: ${gut}`);
    }
  });

  it("der Weg von Hand benutzt denselben Titel", () => {
    /* Ohne diese Probe koennte `buildBundleOfferData` wieder eine eigene
       Abschrift tragen, und die beiden Wege liefen auseinander, ohne dass
       eine der Proben oben es bemerkt. */
    const worker = { id: "w1", city: "Hamburg", postal_code: "20095" };
    for (const n of BEISPIELE) {
      const skills = Array.from({ length: n }, (_, i) => ({
        skill_id: `s${i}`, name: `Faehigkeit ${i}`, category: "pflege", is_primary: i === 0
      }));
      assert.equal(buildBundleOfferData({ worker, skills, orgId: "o1" }).title, buendelTitel(n),
        `von Hand angelegt, weicht der Titel fuer ${n} Faehigkeiten ab`);
    }
  });
});
