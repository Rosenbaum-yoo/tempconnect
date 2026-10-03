/**
 * Aufnahme-Fortschritt (Multi-Skill Welle 2).
 *
 * Die Regel "wann ist ein Profil vollstaendig" wird an drei Stellen gebraucht: im
 * Assistenten, im Dashboard-Hinweis und in der Disposition. Diese Tests halten fest, dass
 * es dafuer EINE Antwort gibt — und dass sie zwischen "vollstaendig" und "einsatzbereit"
 * unterscheidet.
 *
 * Run: node --test --test-force-exit test/workerOnboarding.service.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getOnboardingProgress, SCHRITTE } from "../services/workerOnboardingService.js";

const PROFIL_VOLL = {
  id: "wp-1", user_id: "u-1", supplier_org_id: "org-1",
  first_name: "Anna", last_name: "Muster", phone: "+49 170 1234567",
  // Seit Mig 162 gehoert die Einsatzfaehigkeit zu "mit allem" (Owner-Entscheidung
  // 2026-08-06). Reine Fixture-Pflege — die Zusicherung darunter (100 %) ist
  // unveraendert und prueft weiterhin dasselbe: wer alles ausgefuellt hat, sieht 100 %.
  is_of_age: true,
  shift_readiness: ["frueh", "spaet"],
  emergency_contact_name: "Max Muster",
  emergency_contact_phone: "+49 170 7654321"
};

/**
 * Fixture-Pflege 2026-10-03 (M4b.3): die Faehigkeits-Abfrage liefert jetzt ZWEI
 * Zahlen statt eines `SELECT 1` — `gesamt` und `freigegeben`. Vorher konnte diese
 * Attrappe den dritten Zustand gar nicht ausdruecken: "eingetragen, aber wartet
 * auf Freigabe". Genau der ist der Gegenstand von M4b.3.
 *
 * `freigegeben: null` (die Vorgabe) spiegelt `skills` — damit verhalten sich alle
 * bestehenden Aufrufe WORTGLEICH wie vorher.
 *
 * @param {{skills?:boolean, freigegeben?:boolean|null, docs?:boolean, verfuegbarkeit?:object}} opts
 */
function poolStub({ skills = true, freigegeben = null, docs = true, verfuegbarkeit = {} } = {}) {
  return {
    query: async (sql) => {
      const s = String(sql);
      if (/worker_profile_skills/i.test(s)) {
        const gesamt = skills ? 1 : 0;
        const frei = freigegeben === null ? gesamt : (freigegeben ? 1 : 0);
        return { rows: [{ gesamt, freigegeben: frei }] };
      }
      if (/worker_profile_documents/i.test(s)) return { rows: docs ? [{ "?column?": 1 }] : [] };
      // resolveAvailability: Profil + Historie
      if (/FROM worker_profiles wp/i.test(s)) {
        return { rows: [{
          id: "wp-1", user_id: "u-1", supplier_org_id: "org-1",
          available_from: null, weekly_hours: null, travel_radius_km: null,
          default_radius_km: 25, ...(verfuegbarkeit.profil || {})
        }] };
      }
      if (/worker_assignment_links/i.test(s)) {
        return { rows: [{
          letztes_ende: null, unbefristet_gebunden: false, schnitt_stunden_tag: null,
          abwesend_ab: null, abwesenheitsgrund: null, ...(verfuegbarkeit.historie || {})
        }] };
      }
      return { rows: [] };
    }
  };
}

const MIT_HISTORIE = { historie: { letztes_ende: "2026-09-15", schnitt_stunden_tag: 8 } };

describe("Fortschritt", () => {
  it("Bestandskraft mit allem: 100 % und einsatzbereit", async () => {
    const out = await getOnboardingProgress(poolStub({ verfuegbarkeit: MIT_HISTORIE }), PROFIL_VOLL);
    assert.equal(out.fortschritt_prozent, 100);
    assert.equal(out.einsatzbereit, true);
    assert.equal(out.naechster_schritt, null);
  });

  it("zaehlt fuenf Schritte — die Reihenfolge ist die des Assistenten", async () => {
    // "placement" kam am 2026-08-06 dazu (Mig 162, Owner-Entscheidung): vermittlungs-
    // relevante Angaben, empfohlen statt Pflicht. Die eigentliche Zusicherung ist die
    // Zeile darunter — Liste und SCHRITTE muessen deckungsgleich bleiben.
    const out = await getOnboardingProgress(poolStub({ verfuegbarkeit: MIT_HISTORIE }), PROFIL_VOLL);
    assert.deepEqual(out.schritte.map((s) => s.key), ["person", "skills", "availability", "placement", "documents"]);
    assert.deepEqual(out.schritte.map((s) => s.key), SCHRITTE.map((s) => s.key));
  });
});

describe("einsatzbereit vs. vollstaendig — der Unterschied, der zaehlt", () => {
  it("ohne Nachweise: einsatzbereit, aber nicht 100 %", async () => {
    // Welche Papiere noetig sind, haengt am Einsatz. Eine feste Liste wuerde die Aufnahme
    // fuer die Haelfte der Kunden blockieren — deshalb empfohlen, nicht Pflicht.
    const out = await getOnboardingProgress(
      poolStub({ docs: false, verfuegbarkeit: MIT_HISTORIE }), PROFIL_VOLL
    );
    assert.equal(out.einsatzbereit, true, "Nachweise duerfen die Vermittlung nicht blockieren");
    // 80 statt 75: der Nenner ist seit Mig 162 fuenf Schritte, nicht vier. Geprueft
    // wird unveraendert dasselbe — die Nachweise fehlen im Fortschritt.
    assert.equal(out.fortschritt_prozent, 80, "Im Fortschritt fehlen sie trotzdem");
    assert.equal(out.naechster_schritt, "documents");
  });

  it("ohne Faehigkeit: nicht einsatzbereit", async () => {
    const out = await getOnboardingProgress(
      poolStub({ skills: false, verfuegbarkeit: MIT_HISTORIE }), PROFIL_VOLL
    );
    assert.equal(out.einsatzbereit, false);
    assert.equal(out.schritte.find((s) => s.key === "skills").hinweis,
      "Ohne Faehigkeit entstehen keine Angebote.");
  });

  it("M4b.3 · nur ein Vorschlag: ABSCHLIESSBAR, und der Mensch liest warum der Markt wartet", async () => {
    /*
     * DIE WOERTLICHE ABNAHME AUS DEM PLAN: "wer nur einen Vorschlag hat, kann
     * sein Profil abschliessen und liest: wird geprueft — danach erscheinst du
     * im Markt."
     *
     * Beide Haelften zaehlen, und die erste ist die wichtigere. Wuerde
     * `erledigt` hier false, waere das Pflichtfeld eine FALLE OHNE AUSGANG: der
     * Mensch mit einem neuen Gewerk koennte seine Aufnahme nie abschliessen und
     * wartet auf eine Kuratierung, von der er nichts weiss. Gemessen am
     * 2026-10-03 traf das 34 von 45 Profilen.
     */
    const out = await getOnboardingProgress(
      poolStub({ skills: true, freigegeben: false, verfuegbarkeit: MIT_HISTORIE }), PROFIL_VOLL
    );
    const schritt = out.schritte.find((s) => s.key === "skills");
    assert.equal(schritt.erledigt, true,
      "ein Vorschlag zaehlt NICHT fuer das Pflichtfeld — damit ist es eine Falle ohne Ausgang");
    assert.deepEqual(schritt.offen, [], "der Schritt verlangt noch etwas, obwohl er erledigt ist");
    assert.equal(schritt.hinweis,
      "Wird geprueft — danach erscheinst du im Markt. Du musst nichts weiter tun.",
      "der Wartende liest denselben Satz wie der, der nichts eingetragen hat — "
      + "oder gar keinen: genau die stille Abwesenheit, die M4b.3 verbietet");
    assert.equal(out.einsatzbereit, true,
      "die Vermittlung durch die Agentur haengt nicht an der Kuratierung des Katalogs");
  });

  it("M4b.3 · freigegeben: kein Hinweis mehr — ein Satz ohne Anlass ist Laerm", async () => {
    const out = await getOnboardingProgress(
      poolStub({ skills: true, freigegeben: true, verfuegbarkeit: MIT_HISTORIE }), PROFIL_VOLL
    );
    const schritt = out.schritte.find((s) => s.key === "skills");
    assert.equal(schritt.erledigt, true);
    assert.equal(schritt.hinweis, null,
      "wer freigegeben ist, liest weiter 'wird geprueft' — dann glaubt er die Zeile nie wieder");
  });

  it("ohne Telefon: nicht einsatzbereit, und es steht da, was fehlt", async () => {
    const out = await getOnboardingProgress(
      poolStub({ verfuegbarkeit: MIT_HISTORIE }), { ...PROFIL_VOLL, phone: "  " }
    );
    const person = out.schritte.find((s) => s.key === "person");
    assert.equal(person.erledigt, false);
    assert.deepEqual(person.offen, ["phone"], "Leerzeichen zaehlen nicht als Angabe");
    assert.equal(out.einsatzbereit, false);
  });
});

describe("Verfuegbarkeit im Fortschritt", () => {
  it("hergeleitet = erledigt, ohne dass jemand etwas eingegeben hat", async () => {
    const out = await getOnboardingProgress(poolStub({ verfuegbarkeit: MIT_HISTORIE }), PROFIL_VOLL);
    const schritt = out.schritte.find((s) => s.key === "availability");
    assert.equal(schritt.erledigt, true);
    assert.match(schritt.hinweis, /2026-09-15/, "Der Hinweis nennt die Quelle im Klartext");
  });

  it("neue Kraft: offen, mit den zwei konkreten Fragen", async () => {
    const out = await getOnboardingProgress(poolStub(), PROFIL_VOLL);
    const schritt = out.schritte.find((s) => s.key === "availability");
    assert.equal(schritt.erledigt, false);
    assert.deepEqual(schritt.offen.sort(), ["available_from", "weekly_hours"]);
    assert.equal(out.einsatzbereit, false);
  });

  it("kein Hinweis, solange etwas offen ist — sonst widerspricht er der Frage", async () => {
    const out = await getOnboardingProgress(poolStub(), PROFIL_VOLL);
    assert.equal(out.schritte.find((s) => s.key === "availability").hinweis, null);
  });
});

describe("Randfaelle", () => {
  it("ohne Profil kommt null, kein Absturz", async () => {
    assert.equal(await getOnboardingProgress(poolStub(), null), null);
    assert.equal(await getOnboardingProgress(poolStub(), {}), null);
  });

  it("archivierte Nachweise zaehlen nicht mit", async () => {
    let sql = "";
    const pool = poolStub();
    const original = pool.query;
    pool.query = async (s, p) => { if (/worker_profile_documents/i.test(String(s))) sql = String(s); return original(s, p); };
    await getOnboardingProgress(pool, PROFIL_VOLL);
    assert.match(sql, /archived/i, "Ein archivierter Nachweis ist kein vorhandener");
  });
});
