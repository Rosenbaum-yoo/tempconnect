/**
 * M1 — die 19 A-Faelle aus `services/rbacService.js`, einzeln getoetet.
 *
 * WAS DIESE DATEI IST
 * Der Mutations-Lauf vom 2026-08-14 hat in dieser Datei 25 kuenstliche Fehler
 * ueberlebt — 25 Stellen, an denen eine veraenderte Codezeile KEINEN Test rot
 * gemacht haette. Welle M0 hat jeden einzeln eingestuft; 19 davon koennten
 * Zugriff, Geld, Nachweis oder Mandantengrenze verschieben (Kategorie A).
 * Fuer jeden dieser 19 steht hier ein Test, der GENAU diese Mutation toetet —
 * kein Rundum-Test, der sie zufaellig mit erwischt.
 *
 * Die Fallnummern (nr) verweisen auf
 * `docs/qualitaet/mutation/2026-08-14-rbac/triage.json`. Dort steht je Fall auch,
 * WARUM die uebrigen sechs (2x B, 4x C) bewusst keinen Test bekommen — eine
 * Quelle statt Kopien in Testkoepfen, die auseinanderlaufen.
 *
 * DIE LEKTION, DIE JEDEN TEST HIER FORMT
 * 12 der 19 Faelle sind `ArrayDeclaration`; **acht davon sind geleerte
 * ABFRAGE-PARAMETER** (nr 71-75, 77, 85, 88), die uebrigen vier sind Zeilen der
 * Rollen-Vererbung und damit Rechtematrix, keine Abfrage. Ein
 * Test, der nur das Ergebnis des Mock-Pools prueft, bemerkt davon nichts: der
 * Mock antwortet gleich, egal mit welchen Parametern die Abfrage lief. Deshalb
 * pruefen diese Tests, WELCHE Abfrage mit WELCHEN Parametern abgesetzt wurde —
 * nicht, was zurueckkam.
 *
 * WAS DIESE MUTANTEN GEGEN EINE ECHTE DATENBANK TUN — und was nicht
 * Ein geleertes Parameter-Array laesst den SQL-Text unveraendert; die Klausel
 * `WHERE user_id = $1` bleibt also stehen. node-postgres schickt eine Anweisung
 * ohne Werte ueber das SIMPLE-Protokoll, und Postgres kennt dort keine
 * Platzhalter: die Abfrage bricht mit 42P02 ab. Der Mutant ist damit gegen eine
 * echte Datenbank ein LAUTER ABSTURZ, keine stille Grenzverletzung — nur der
 * parameterblinde Mock laesst ihn wie einen Erfolg aussehen.
 *
 * Der Wert dieser Tests liegt deshalb nicht in dem Extremfall, den Stryker baut,
 * sondern in dem realistischen daneben: ein VERTAUSCHTER oder falscher Parameter
 * ($1/$2 gedreht, orgId statt userId) stuerzt NICHT ab. Er vergleicht lautlos das
 * Falsche — und genau das faengt eine Zusicherung auf die Parameterliste.
 *
 * WICHTIG FUER DEN NAECHSTEN LAUF
 * Diese Datei muss in `stryker.rbac.conf.json` unter `commandRunner` stehen.
 * Fehlt sie dort, laeuft sie im Mutations-Lauf nicht mit, die Mutanten
 * ueberleben weiter — und die Suite waere gruen, ohne etwas zu beweisen.
 *
 * DB-frei (Mock-Pool).
 * Run: node --test --test-force-exit test/rbacServiceMutanten.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  hasPermission,
  getUserMemberships,
  getPrimaryOrg,
  createOrganization,
  countActiveOwners,
  deactivateMember,
  updateMemberRoleByMembershipId,
  locationBelongsToOrg,
} from "../services/rbacService.js";

/* ── Helfer ───────────────────────────────────────────────── */

/** Mock-Pool, der jede Abfrage mitschreibt. `antwort` darf eine Funktion sein. */
function spionPool(antwort = { rows: [], rowCount: 0 }) {
  const abfragen = [];
  return {
    abfragen,
    query: async (sql, params) => {
      abfragen.push({ sql, params });
      return typeof antwort === "function" ? antwort(sql, params) : antwort;
    },
  };
}

/** Mock-Pool mit connect() fuer die Transaktion in createOrganization. */
function transaktionsPool(orgZeile) {
  const abfragen = [];
  const client = {
    query: async (sql, params) => {
      abfragen.push({ sql, params });
      if (/INSERT INTO organizations/i.test(sql)) return { rows: [orgZeile] };
      return { rows: [], rowCount: 0 };
    },
    release() {},
  };
  return { abfragen, connect: async () => client };
}

const finde = (pool, muster) => pool.abfragen.find((a) => muster.test(a.sql));

/* ═══════════════════════════════════════════════════════════
 *  Rollen-Vererbung — vier Zeilen, an denen echte Rechte haengen
 *
 *  ROLE_HIERARCHY ist die Rechtematrix selbst. Wird eine Zeile geleert,
 *  verliert die Rolle stillschweigend alles Geerbte. Fuer admin,
 *  supplier_manager und finance ist das folgenlos — jedes ihrer Rechte steht
 *  ohnehin ausdruecklich in PERMISSIONS (mechanisch geprueft, deshalb
 *  Kategorie C). Fuer diese vier Rollen NICHT: die hier geprueften Rechte
 *  sind ausschliesslich ueber das Erbe erreichbar.
 * ═══════════════════════════════════════════════════════════ */

describe("M1 — Rollen-Vererbung traegt echte Rechte", () => {
  it("nr 65: program_manager erbt offer.create (steht nicht in seiner eigenen Liste)", () => {
    assert.equal(hasPermission("program_manager", "offer.create"), true);
    assert.equal(hasPermission("program_manager", "timesheet.submit"), true);
  });

  it("nr 67: hiring_manager erbt worker.view", () => {
    assert.equal(hasPermission("hiring_manager", "worker.view"), true);
  });

  it("nr 69: recruiter erbt compliance.view und document_center.view", () => {
    assert.equal(hasPermission("recruiter", "compliance.view"), true);
    assert.equal(hasPermission("recruiter", "document_center.view"), true);
  });

  it("nr 70: dispatcher erbt compliance.view und document_center.view", () => {
    assert.equal(hasPermission("dispatcher", "compliance.view"), true);
    assert.equal(hasPermission("dispatcher", "document_center.view"), true);
  });
});

/* ═══════════════════════════════════════════════════════════
 *  Abfrage-Parameter — die Bindung an Nutzer und Organisation
 * ═══════════════════════════════════════════════════════════ */

describe("M1 — jede Abfrage traegt ihre Bindung", () => {
  it("nr 71: getUserMemberships fragt nach GENAU diesem Nutzer", async () => {
    const pool = spionPool({ rows: [] });
    await getUserMemberships(pool, "user-1");

    assert.equal(pool.abfragen.length, 1);
    assert.deepEqual(
      pool.abfragen[0].params,
      ["user-1"],
      "Die Abfrage muss an DIESEN Nutzer gebunden sein. Ein vertauschter oder falscher " +
        "Parameter stuerzt nicht ab — er liefert lautlos die Mitgliedschaften eines anderen"
    );
  });

  it("nr 72: getPrimaryOrg bindet den Schnellpfad an die userId", async () => {
    const pool = spionPool({ rows: [{ org_id: null }] });
    await getPrimaryOrg(pool, "user-1");

    const schnellpfad = finde(pool, /SELECT org_id FROM users/i);
    assert.ok(schnellpfad, "Der Schnellpfad ueber users.org_id lief nicht");
    assert.deepEqual(schnellpfad.params, ["user-1"]);
  });

  it("nr 73: getPrimaryOrg bindet auch den Rueckfall an die userId", async () => {
    // users.org_id leer -> Rueckfall auf die aelteste aktive Mitgliedschaft.
    const pool = spionPool((sql) =>
      /SELECT org_id FROM users/i.test(sql) ? { rows: [{ org_id: null }] } : { rows: [] }
    );
    await getPrimaryOrg(pool, "user-1");

    const rueckfall = finde(pool, /ORDER BY om\.created_at ASC LIMIT 1/i);
    assert.ok(rueckfall, "Der Rueckfall auf die erste Mitgliedschaft lief nicht");
    assert.deepEqual(
      rueckfall.params,
      ["user-1"],
      "Der Rueckfall waehlt die aelteste aktive Mitgliedschaft — er muss dabei an DIESEN " +
        "Nutzer gebunden sein, sonst waehlt er lautlos die eines anderen"
    );
  });

  it("nr 74: createOrganization macht GENAU den Gruender zum Owner", async () => {
    const pool = transaktionsPool({ id: "org-neu", name: "Acme" });
    await createOrganization(pool, "user-1", { name: "Acme", slug: "acme", type: "company" });

    const mitgliedschaft = finde(pool, /INSERT INTO org_memberships/i);
    assert.ok(mitgliedschaft, "Die Owner-Mitgliedschaft wurde nicht angelegt");
    assert.deepEqual(mitgliedschaft.params, ["user-1", "org-neu"]);
  });

  it("nr 75: createOrganization schreibt die Org an GENAU diesen Nutzer", async () => {
    const pool = transaktionsPool({ id: "org-neu", name: "Acme" });
    await createOrganization(pool, "user-1", { name: "Acme", slug: "acme", type: "company" });

    const zuordnung = finde(pool, /UPDATE users SET org_id/i);
    assert.ok(zuordnung, "users.org_id wurde nicht gesetzt");
    assert.deepEqual(
      zuordnung.params,
      ["org-neu", "user-1"],
      "Reihenfolge zaehlt: $1 ist die Org, $2 der Nutzer"
    );
  });

  it("nr 77: countActiveOwners zaehlt nur die Owner DIESER Organisation", async () => {
    const pool = spionPool({ rows: [{ n: 2 }] });
    await countActiveOwners(pool, "org-1");

    assert.deepEqual(
      pool.abfragen[0].params,
      ["org-1"],
      "Der Letzter-Owner-Schutz haengt an dieser Zaehlung. Zaehlt sie die Owner einer " +
        "ANDEREN Org, greift der Schutz zur falschen Zeit — oder nie"
    );
  });

  it("nr 88: locationBelongsToOrg prueft Standort GEGEN die Organisation", async () => {
    const pool = spionPool({ rows: [{ "?column?": 1 }] });
    await locationBelongsToOrg(pool, "loc-1", "org-1");

    assert.deepEqual(pool.abfragen[0].params, ["loc-1", "org-1"]);
    assert.match(pool.abfragen[0].sql, /org_id = \$2/);
  });

  it("nr 88 (Gegenprobe): keine Zeile bedeutet false, nicht 'irgendwas'", async () => {
    // Der Mock antwortet parameterunabhaengig. Dass die Grenze WIRKLICH gezogen
    // wird, belegt die Parameter-Zusicherung darueber — hier geht es nur darum,
    // dass ein leeres Ergebnis sauber zu false wird.
    const pool = spionPool({ rows: [] });
    assert.equal(await locationBelongsToOrg(pool, "loc-fremd", "org-1"), false);
  });
});

/* ═══════════════════════════════════════════════════════════
 *  Letzter-Owner-Schutz — der Waechter, der sich lautlos abschalten laesst
 * ═══════════════════════════════════════════════════════════ */

describe("M1 — der Letzter-Owner-Schutz bekommt sein Ziel", () => {
  it("nr 80: deactivateMember nennt dem Waechter den Nutzer, um den es geht", async () => {
    const pool = spionPool((sql) => {
      if (/SELECT 1 FROM org_memberships/i.test(sql)) return { rowCount: 1, rows: [{ ok: 1 }] };
      if (/COUNT\(/i.test(sql)) return { rows: [{ n: 3 }] };
      return { rowCount: 1, rows: [] };
    });

    await deactivateMember(pool, "org-1", "user-1");

    const waechter = finde(pool, /SELECT 1 FROM org_memberships WHERE user_id/i);
    assert.ok(waechter, "Der Waechter hat gar nicht nach dem Ziel gesucht");
    assert.deepEqual(
      waechter.params,
      ["user-1", "org-1"],
      "Ohne Ziel findet der Waechter nichts, haelt das Mitglied fuer unkritisch und laesst durch"
    );
  });

  it("nr 80 (Gegenprobe): der einzige Owner laesst sich nicht deaktivieren", async () => {
    const pool = spionPool((sql) => {
      if (/SELECT 1 FROM org_memberships/i.test(sql)) return { rowCount: 1, rows: [{ ok: 1 }] };
      if (/COUNT\(/i.test(sql)) return { rows: [{ n: 1 }] };
      return { rowCount: 1, rows: [] };
    });

    // Auf den CODE pruefen, nicht auf den Meldungstext: die message ist in
    // triage.json (nr 78) ausdruecklich als nicht tragend eingestuft, weil kein
    // Verbraucher sie vergleicht. Ein Test, der sie festnagelt, widerspraeche
    // der eigenen Einstufung und wuerde schon bei Textpflege rot.
    await assert.rejects(
      () => deactivateMember(pool, "org-1", "user-1"),
      (err) => err.code === "LAST_OWNER" && err.status === 409
    );
    assert.equal(
      finde(pool, /SET is_active = FALSE/i),
      undefined,
      "Nach LAST_OWNER darf die Deaktivierung nicht mehr laufen"
    );
  });

  it("nr 81 + 82: die Ernennung ZUM Owner laeuft ohne Waechter durch", async () => {
    const pool = spionPool((sql) =>
      /UPDATE org_memberships SET role_key/i.test(sql)
        ? { rows: [{ id: "m-1", role_key: "owner" }] }
        : { rowCount: 0, rows: [] }
    );

    const ergebnis = await updateMemberRoleByMembershipId(pool, "org-1", "m-1", "owner");

    assert.equal(
      finde(pool, /SELECT 1 FROM org_memberships/i),
      undefined,
      "Beim Heraufsetzen auf owner wird der Waechter gar nicht erst befragt — die Ausnahme " +
        "steht in der Bedingung, nicht im Waechter, und genau sie ist hier belegt"
    );
    assert.equal(ergebnis.role_key, "owner");
  });

  it("nr 82 (Gegenrichtung): jede ANDERE Rolle laeuft durch den Waechter", async () => {
    const pool = spionPool((sql) => {
      if (/SELECT 1 FROM org_memberships/i.test(sql)) return { rowCount: 0, rows: [] };
      if (/UPDATE org_memberships SET role_key/i.test(sql)) return { rows: [{ id: "m-1", role_key: "admin" }] };
      return { rowCount: 0, rows: [] };
    });

    await updateMemberRoleByMembershipId(pool, "org-1", "m-1", "admin");

    const waechter = finde(pool, /SELECT 1 FROM org_memberships WHERE id/i);
    assert.ok(waechter, "Beim Herabsetzen MUSS der Letzter-Owner-Schutz laufen");
    assert.deepEqual(waechter.params, ["m-1", "org-1"]);
  });
});

/* ═══════════════════════════════════════════════════════════
 *  Rollenaenderung per Membership-PK — SQL, Parameter, Rueckgabe
 * ═══════════════════════════════════════════════════════════ */

describe("M1 — die Rollenaenderung bleibt in ihrer Organisation", () => {
  function aenderungsPool(zeilen) {
    return spionPool((sql) => {
      if (/SELECT 1 FROM org_memberships/i.test(sql)) return { rowCount: 0, rows: [] };
      if (/UPDATE org_memberships SET role_key/i.test(sql)) return { rows: zeilen };
      return { rowCount: 0, rows: [] };
    });
  }

  it("nr 83: die Abfrage traegt die Mandantengrenze im SQL", async () => {
    const pool = aenderungsPool([{ id: "m-1", role_key: "admin" }]);
    await updateMemberRoleByMembershipId(pool, "org-1", "m-1", "admin");

    const update = finde(pool, /UPDATE org_memberships SET role_key/i);
    assert.ok(update, "Es lief gar keine Aenderung");
    // Bewusst tolerant gegen Schreibweise (Leerzeichen, Platzhalter-Nummer):
    // gepruefft wird, dass die Klausel DA ist, nicht wie sie formatiert ist.
    assert.match(update.sql, /org_id\s*=\s*\$\d/, "Ohne org_id-Klausel waere eine fremde Mitgliedschaft aenderbar");
    assert.match(update.sql, /is_active\s*=\s*TRUE/i);
  });

  it("nr 85: die Abfrage traegt die Mandantengrenze auch als Parameter", async () => {
    const pool = aenderungsPool([{ id: "m-1", role_key: "admin" }]);
    await updateMemberRoleByMembershipId(pool, "org-1", "m-1", "admin");

    assert.deepEqual(finde(pool, /UPDATE org_memberships SET role_key/i).params, ["m-1", "org-1", "admin"]);
  });

  it("nr 84 + 87: der Erfolgsfall liefert die geaenderte Mitgliedschaft, keinen Wahrheitswert", async () => {
    const pool = aenderungsPool([{ id: "m-1", role_key: "admin", org_id: "org-1" }]);
    const ergebnis = await updateMemberRoleByMembershipId(pool, "org-1", "m-1", "admin");

    assert.equal(typeof ergebnis, "object");
    assert.notEqual(ergebnis, null);
    assert.equal(ergebnis.role_key, "admin", "Der Aufrufer muss die neue Rolle sehen, nicht nur 'es hat geklappt'");
  });

  it("nr 86: trifft die Abfrage keine Zeile, ist das Ergebnis null — nicht 'irgendwas'", async () => {
    const pool = aenderungsPool([]);
    assert.equal(
      await updateMemberRoleByMembershipId(pool, "org-1", "m-fremd", "admin"),
      null,
      "Kein Treffer muss null ergeben, damit die Route sauber 404 melden kann"
    );
    // Anmerkung zur Reichweite: dass die Abfrage die Mandantengrenze WIRKLICH
    // zieht, kann dieser Mock nicht zeigen — er antwortet unabhaengig von orgId.
    // Das belegen 'nr 83' (Klausel im SQL) und 'nr 85' (orgId als Parameter).
  });
});
