/**
 * P10 Spur D / Welle D5 — ein Mitarbeiter existiert, bevor er sich anmeldet.
 *
 * DIE AUSGANGSLAGE
 * Der Owner hat entschieden (D-E1): Import ohne E-Mail, wenn eine
 * Personalnummer vorliegt. In Welle D4 stellte sich heraus, dass das
 * Datenmodell es verbietet — `users.email` NOT NULL, `users.password_hash`
 * NOT NULL, `worker_profiles.user_id` NOT NULL. Wer keine E-Mail hat, existiert
 * nicht, obwohl er real jeden Tag auf der Baustelle steht.
 *
 * WAS HIER GEPRUEFT WIRD
 * Nicht nur, dass es jetzt geht — sondern dass die vier Fallen zu sind, die
 * dabei aufgehen:
 *
 *   1. Der INNER JOIN. Ein kontoloses Profil verschwindet lautlos aus jeder
 *      Liste: kein Fehler, kein Zaehler, es ist einfach weg.
 *   2. Die Adressierung. Die Oberflaeche spricht Mitarbeiter ueber die
 *      Konto-ID an — ohne Konto entsteht woertlich openEdit('null').
 *   3. Das zweite Profil. `acceptInvite` legt beim Annehmen ein Profil an; fuer
 *      einen bereits Erfassten entstuende ein ZWEITER Datensatz, und der erste
 *      bliebe verwaist mit Personalnummer, Anschrift und Notizen.
 *   4. Die Wiedererkennung. Ohne E-Mail traegt die Personalnummer sie allein —
 *      ohne Eindeutigkeit legt jeder Folgeimport denselben Menschen erneut an.
 *
 * Run: node --test --test-force-exit test/mitarbeiterOhneKonto.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as svc from "../services/workerService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Migrationen liegen im Container als Lese-Mount unter /app, lokal im Repo. */
function migrationsPfad(datei) {
  const rel = `sql/migrations/${datei}`;
  return [process.cwd(), path.resolve(__dirname, "..", "..")]
    .map((w) => path.join(w, rel))
    .find((p) => fs.existsSync(p)) || path.resolve(__dirname, "..", "..", rel);
}

function protokollPool(antworten) {
  const abfragen = [];
  return {
    abfragen,
    query: async (text, params) => {
      abfragen.push({ text, params });
      const naechste = antworten.shift();
      if (naechste instanceof Error) throw naechste;
      return naechste || { rows: [] };
    }
  };
}

/* ── Das Datenmodell ──────────────────────────────────────────────────────── */

describe("P10/D5 · Migration 175 macht das Konto optional — mit Sicherungen", () => {
  const datei = migrationsPfad("175_mitarbeiter_ohne_konto.sql");
  const da = fs.existsSync(datei);
  const sql = da ? fs.readFileSync(datei, "utf8") : "";

  it("die Migration ist da", () => {
    assert.ok(da, "175_mitarbeiter_ohne_konto.sql nicht gefunden");
  });

  it("loest den Zwang zum Konto", { skip: !da }, () => {
    assert.match(sql, /ALTER TABLE worker_profiles ALTER COLUMN user_id DROP NOT NULL/);
  });

  it("verlangt ohne Konto eine Personalnummer", { skip: !da }, () => {
    /*
     * Ohne diese Bedingung entstuende ein Datensatz, den kein Folgeimport
     * wiederfindet — dieselbe Person waechst mit jedem Import um eine Zeile.
     */
    assert.match(sql, /ADD CONSTRAINT worker_profiles_identitaet_chk/);
    assert.match(sql, /user_id IS NOT NULL[\s\S]{0,120}personnel_number IS NOT NULL/);
  });

  it("prueft den Bestand, bevor sie die Bedingung anlegt", { skip: !da }, () => {
    assert.match(sql, /RAISE EXCEPTION[\s\S]{0,200}ohne Konto UND ohne Personalnummer/,
      "eine Bedingung, die an Altdaten scheitert, muss das VORHER sagen");
  });

  it("macht die Personalnummer nur dort eindeutig, wo sie der Schluessel ist", { skip: !da }, () => {
    assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS worker_profiles_personalnummer_ohne_konto_idx/);
    assert.match(sql, /WHERE user_id IS NULL/,
      "eine Eindeutigkeit ueber ALLE Zeilen waere an echten Daten gescheitert — " +
      "im Bestand liegt ein legitimes Paar mit gleicher Nummer, beide mit Konto");
    assert.match(sql, /lower\(btrim\(personnel_number\)\)/,
      "sonst waeren ' P-1 ' und 'p-1' zwei verschiedene Menschen");
  });

  it("nennt ihren Rueckweg — samt Vorbedingung", { skip: !da }, () => {
    assert.match(sql, /ROLLBACK/i);
    assert.match(sql, /SET NOT NULL/, "das Zuruecksetzen muss die Spalte wieder schliessen");
    assert.match(sql, /SELECT count\(\*\) FROM worker_profiles WHERE user_id IS NULL/,
      "wer zurueckrollt, muss vorher wissen, ob dabei Zeilen verloren gehen");
  });
});

describe("P10/D5 · Migration 176 gibt der Einladung einen Adressaten", () => {
  const datei = migrationsPfad("176_einladung_kennt_das_profil.sql");
  const da = fs.existsSync(datei);
  const sql = da ? fs.readFileSync(datei, "utf8") : "";

  it("die Migration ist da", () => {
    assert.ok(da, "176_einladung_kennt_das_profil.sql nicht gefunden");
  });

  it("verbindet Einladung und Profil", { skip: !da }, () => {
    assert.match(sql, /ADD COLUMN IF NOT EXISTS worker_profile_id UUID/);
    assert.match(sql, /REFERENCES worker_profiles\(id\) ON DELETE CASCADE/,
      "eine Einladung auf ein geloeschtes Profil griffe beim Annehmen ins Leere");
  });

  it("laesst nur EINE offene Einladung je Profil zu", { skip: !da }, () => {
    /*
     * Zwei angenommene Einladungen ergaeben zwei Konten fuer denselben
     * Menschen — und nur eines liesse sich verbinden. Welches, entschiede die
     * Reihenfolge.
     */
    assert.match(sql, /worker_invites_ein_offener_je_profil_idx/);
    assert.match(sql, /status = 'pending'/);
  });

  it("nennt ihren Rueckweg", { skip: !da }, () => {
    assert.match(sql, /ROLLBACK/i);
    assert.match(sql, /DROP COLUMN IF EXISTS worker_profile_id/);
  });
});

/* ── Anlegen ohne Konto ───────────────────────────────────────────────────── */

describe("P10/D5 · Ein Profil entsteht ohne Konto", () => {
  const zeile = { id: "p1", user_id: null, first_name: "Anna", last_name: "Beck", personnel_number: "P-4711" };

  it("legt das Profil mit user_id NULL an", async () => {
    const pool = protokollPool([{ rows: [zeile] }]);
    const { user, profile } = await svc.createWorkerProfileWithoutAccount(pool, {
      supplierOrgId: "o1", firstName: "Anna", lastName: "Beck", personnelNumber: "P-4711", createdBy: "u1"
    });

    assert.equal(user, null, "kein Konto heisst KEIN Konto — kein Platzhalter, kein Zufallspasswort");
    assert.equal(profile.id, "p1");
    assert.match(pool.abfragen[0].text, /INSERT INTO worker_profiles/);
    assert.match(pool.abfragen[0].text, /VALUES \(NULL,/, "das Konto bleibt ausdruecklich leer");
    assert.equal(pool.abfragen.length, 1,
      "keine users-Zeile, keine org_memberships-Zeile — ein halbes Konto waere schlimmer als keines");
  });

  it("besteht auf der Personalnummer", async () => {
    const pool = protokollPool([]);
    await assert.rejects(
      () => svc.createWorkerProfileWithoutAccount(pool, {
        supplierOrgId: "o1", firstName: "Anna", lastName: "Beck", personnelNumber: "  ", createdBy: "u1"
      }),
      (err) => err.code === "PERSONNEL_NUMBER_REQUIRED"
    );
    assert.equal(pool.abfragen.length, 0, "es darf gar nicht erst geschrieben werden");
  });

  it("schneidet Rand-Leerzeichen aus der Nummer", async () => {
    const pool = protokollPool([{ rows: [zeile] }]);
    await svc.createWorkerProfileWithoutAccount(pool, {
      supplierOrgId: "o1", firstName: "A", lastName: "B", personnelNumber: " P-4711 ", createdBy: "u1"
    });
    assert.ok(pool.abfragen[0].params.includes("P-4711"),
      "sonst waeren ' P-1 ' und 'P-1' zwei Menschen — und der eindeutige Index sieht sie als einen");
  });

  it("meldet einen leeren Rueckgabewert verstaendlich", async () => {
    // Kann im Normalbetrieb nicht eintreten. Ohne Zweig hiesse die Meldung im
    // Importbericht "Cannot read properties of null" — eine Sackgasse.
    const pool = protokollPool([{ rows: [] }]);
    await assert.rejects(
      () => svc.createWorkerProfileWithoutAccount(pool, {
        supplierOrgId: "o1", firstName: "A", lastName: "B", personnelNumber: "P-1", createdBy: "u1"
      }),
      (err) => err.code === "PROFILE_INSERT_EMPTY"
    );
  });
});

/* ── Verbinden ────────────────────────────────────────────────────────────── */

describe("P10/D5 · Aus dem Stammdatensatz wird ein Konto", () => {
  it("haengt nur an, was noch kein Konto hat", async () => {
    const pool = protokollPool([{ rows: [{ id: "p1", user_id: "u9" }] }]);
    await svc.verknuepfeKonto(pool, { profileId: "p1", supplierOrgId: "o1", userId: "u9" });

    assert.match(pool.abfragen[0].text, /user_id IS NULL/,
      "ein Profil einem anderen Konto zuzuschlagen waere eine Identitaetsverwechslung " +
      "mit Datenzugriff als Folge");
    assert.match(pool.abfragen[0].text, /supplier_org_id = \$3/,
      "ohne Org-Bindung liesse sich ein fremdes Profil uebernehmen");
  });

  it("gibt null zurueck, wenn nichts passt", async () => {
    const pool = protokollPool([{ rows: [] }]);
    const r = await svc.verknuepfeKonto(pool, { profileId: "p1", supplierOrgId: "o1", userId: "u9" });
    assert.equal(r, null, "ein stiller Erfolg waere hier das gefaehrlichste Ergebnis");
  });
});

/* ── Die Leseseite ────────────────────────────────────────────────────────── */

describe("P10/D5 · Kontolose Mitarbeiter verschwinden nicht", () => {
  it("listWorkers verbindet users per LEFT JOIN", async () => {
    const pool = protokollPool([{ rows: [] }]);
    await svc.listWorkers(pool, { supplierOrgId: "o1" });
    const q = pool.abfragen[0].text;

    assert.match(q, /LEFT JOIN users u ON u\.id = wp\.user_id/,
      "mit INNER JOIN faellt ein kontoloser Mitarbeiter lautlos aus der Liste — " +
      "kein Fehler, kein Zaehler, er ist einfach weg");
    assert.ok(!/\n\s*JOIN users u/.test(q), "es darf kein INNER JOIN uebrig sein");
  });

  it("listWorkers nimmt das Profil als Zeilen-Identitaet", async () => {
    const pool = protokollPool([{ rows: [] }]);
    await svc.listWorkers(pool, { supplierOrgId: "o1" });
    const q = pool.abfragen[0].text;

    assert.match(q, /wp\.id AS id/,
      "mit u.id AS id waere die Zeilen-ID ohne Konto NULL — die Oberflaeche erzeugte onclick=\"...('null')\"");
    assert.match(q, /\(wp\.user_id IS NOT NULL\) AS has_account/,
      "die Oberflaeche muss den Zustand kennen, um ihn ausweisen zu koennen");
  });

  it("listWorkers zaehlt Kennzahlen ueber wp.user_id, nicht ueber u.id", async () => {
    const pool = protokollPool([{ rows: [] }]);
    await svc.listWorkers(pool, { supplierOrgId: "o1" });
    const q = pool.abfragen[0].text;

    assert.ok(!/worker_user_id = u\.id/.test(q),
      "ohne Konto ist u.id NULL — die Unterabfragen muessen ueber wp.user_id korrelieren, " +
      "dann stehen die Zaehler sauber auf 0");
    assert.match(q, /worker_user_id = wp\.user_id/);
  });

  it("listWorkers findet den Einladungsstatus auch ohne Adresse", async () => {
    const pool = protokollPool([{ rows: [] }]);
    await svc.listWorkers(pool, { supplierOrgId: "o1" });
    assert.match(pool.abfragen[0].text, /wi\.worker_profile_id = wp\.id/,
      "ueber die E-Mail allein haette ausgerechnet der Erstimport nie einen Einladungsstatus");
  });

  it("getWorkerProfile nimmt Konto-ID ODER Profil-ID", async () => {
    const pool = protokollPool([{ rows: [] }]);
    await svc.getWorkerProfile(pool, "irgendeine-id");
    const q = pool.abfragen[0].text;

    assert.match(q, /WHERE wp\.user_id = \$1 OR wp\.id = \$1/,
      "ohne den zweiten Weg ist ein kontoloser Mitarbeiter nicht abrufbar");
    assert.match(q, /LEFT JOIN users u/,
      "mit INNER JOIN faende die Funktion ihn nicht — und getWorkerHub gibt bei null sofort auf");
  });
});

/* ── Die Annahme der Einladung ────────────────────────────────────────────── */

/**
 * acceptInvite arbeitet auf einem Client aus dem Pool. Der Mock protokolliert
 * jede Anweisung, damit sich pruefen laesst, WELCHER Weg gegangen wurde.
 */
function einladungsPool({ invite, antworten }) {
  const abfragen = [];
  const client = {
    query: async (text, params) => {
      abfragen.push({ text, params });
      if (/^\s*(BEGIN|COMMIT|ROLLBACK)/i.test(text)) return { rows: [] };
      const naechste = antworten.shift();
      return naechste || { rows: [] };
    },
    release: () => {}
  };
  return {
    abfragen,
    // getInviteByToken laeuft ueber den Pool, nicht ueber den Client.
    query: async () => ({ rows: [invite] }),
    connect: async () => client
  };
}

const GUELTIGE_EINLADUNG = {
  id: "i1", status: "pending", email: "anna@firma.de",
  expires_at: new Date(Date.now() + 86400000).toISOString(),
  supplier_org_id: "o1", first_name: "Anna", last_name: "Beck",
  personnel_number: "P-4711", invited_by: "u1"
};

describe("P10/D5 · Die Einladung verbindet, statt zu verdoppeln", () => {
  it("haengt das vorhandene Profil an das neue Konto", async () => {
    const pool = einladungsPool({
      invite: { ...GUELTIGE_EINLADUNG, worker_profile_id: "p1" },
      antworten: [
        { rows: [{ id: "u9", email: "anna@firma.de", role: "worker" }] }, // users
        { rows: [] },                                                     // org_memberships
        { rows: [{ id: "p1", user_id: "u9", first_name: "Anna", last_name: "Beck" }] }, // UPDATE
        { rows: [] }                                                      // invite abschliessen
      ]
    });

    const r = await svc.acceptInvite(pool, { token: "t", passwordHash: "h" });
    assert.equal(r.error, undefined);
    assert.equal(r.profile.id, "p1", "es muss DASSELBE Profil sein, nicht ein neues");

    const profilAnweisung = pool.abfragen.find((a) => /worker_profiles/.test(a.text));
    assert.match(profilAnweisung.text, /UPDATE worker_profiles/,
      "ein INSERT haette ein ZWEITES Profil erzeugt — und das erste bliebe verwaist zurueck, " +
      "mit Personalnummer, Anschrift und Notizen");
    assert.match(profilAnweisung.text, /user_id IS NULL/,
      "ein Profil, das schon an einem Konto haengt, darf nie umgehaengt werden");
    assert.ok(!pool.abfragen.some((a) => /INSERT INTO worker_profiles/.test(a.text)),
      "im Verbinde-Zweig darf ueberhaupt kein Profil angelegt werden");
  });

  it("legt weiterhin an, wenn es den Menschen noch nicht gibt", async () => {
    const pool = einladungsPool({
      invite: { ...GUELTIGE_EINLADUNG, worker_profile_id: null },
      antworten: [
        { rows: [{ id: "u9", email: "anna@firma.de", role: "worker" }] },
        { rows: [] },
        { rows: [{ id: "p2", user_id: "u9" }] },
        { rows: [] }
      ]
    });

    const r = await svc.acceptInvite(pool, { token: "t", passwordHash: "h" });
    assert.equal(r.error, undefined);
    assert.ok(pool.abfragen.some((a) => /INSERT INTO worker_profiles/.test(a.text)),
      "der bisherige Weg muss unveraendert bleiben — die allermeisten Einladungen gehen an Neue");
  });

  it("bricht ab, statt still ein zweites Profil anzulegen", async () => {
    // Der Profilbezug zeigt ins Leere oder das Profil haengt schon an einem
    // Konto: dann liefert das UPDATE keine Zeile.
    const pool = einladungsPool({
      invite: { ...GUELTIGE_EINLADUNG, worker_profile_id: "p1" },
      antworten: [
        { rows: [{ id: "u9", email: "anna@firma.de", role: "worker" }] },
        { rows: [] },
        { rows: [] }   // UPDATE trifft nichts
      ]
    });

    const r = await svc.acceptInvite(pool, { token: "t", passwordHash: "h" });
    assert.equal(r.error, "PROFILE_ALREADY_LINKED");
    assert.ok(pool.abfragen.some((a) => /^\s*ROLLBACK/i.test(a.text)),
      "ohne Rollback bliebe ein Konto ohne Profil zurueck");
    assert.ok(!pool.abfragen.some((a) => /INSERT INTO worker_profiles/.test(a.text)),
      "genau hier waere das stille Anlegen der Schaden, den diese Welle verhindert");
  });
});

/* ── Bearbeitbar und zaehlbar ─────────────────────────────────────────────── */

describe("P10/D5 · Ein Mitarbeiter ohne Konto ist trotzdem verwaltbar", () => {
  it("laesst sich bearbeiten", async () => {
    const pool = protokollPool([{ rows: [{ id: "p1" }] }]);
    await svc.updateWorkerProfile(pool, "p1", "o1", { phone: "030 1" });
    assert.match(pool.abfragen[0].text, /\(user_id=\$\d+ OR id=\$\d+\)/,
      "ohne den zweiten Weg meldete die Oberflaeche 'nicht gefunden' fuer jemanden, " +
      "der in der Liste direkt davor steht");
    assert.match(pool.abfragen[0].text, /supplier_org_id=\$/, "die Org-Bindung bleibt");
  });

  it("laesst sich deaktivieren", async () => {
    const abfragen = [];
    const client = { query: async (t, p) => { abfragen.push(t); return { rows: [] }; }, release: () => {} };
    await svc.setWorkerActive({ connect: async () => client }, "p1", "o1", false);
    assert.ok(abfragen.some((t) => /UPDATE worker_profiles[\s\S]*\(user_id=\$2 OR id=\$2\)/.test(t)));
  });

  it("zaehlt gegen das Planlimit", async () => {
    const billing = await import("../services/billingMetricsService.js");
    const pool = protokollPool([{ rows: [{ cnt: "3" }] }]);
    await billing.countActiveWorkers(pool, "o1");
    assert.match(pool.abfragen[0].text, /COUNT\(DISTINCT wp\.id\)/,
      "COUNT(DISTINCT wp.user_id) uebergeht NULL still — 500 importierte Mitarbeiter " +
      "ergaeben null im Zaehler, das Planlimit griffe nicht und abgerechnet wuerde zu wenig");
    assert.ok(!/COUNT\(DISTINCT wp\.user_id\)/.test(pool.abfragen[0].text));
  });

  it("wird NICHT als Ersatzkraft angeboten — das waere eine Falle", () => {
    /*
     * Bewusste Grenze: Einsaetze haengen an users(id). Ein Mitarbeiter ohne
     * Konto kann keinem Einsatz zugewiesen werden. Die Pruefung der Ersatzkraft
     * bleibt deshalb absichtlich am Konto — ihn dort zuzulassen hiesse, ihn
     * auswaehlbar zu machen und erst beim Speichern scheitern zu lassen.
     */
    const quelle = fs.readFileSync(path.resolve(__dirname, "..", "services", "workerService.js"), "utf8");
    assert.match(quelle, /SELECT wp\.user_id, wp\.is_active\s+FROM worker_profiles wp\s+WHERE wp\.user_id = \$1/,
      "diese Pruefung soll am Konto bleiben");
  });
});

/* ── Die Route ────────────────────────────────────────────────────────────── */

describe("P10/D5 · Der Profilbezug wird geprueft, nicht geglaubt", () => {
  const datei = path.resolve(__dirname, "..", "routes", "workers.js");
  const code = fs.readFileSync(datei, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n").filter((z) => !/^\s*\/\//.test(z)).join("\n");

  it("nimmt worker_profile_id nur als UUID entgegen", () => {
    assert.match(code, /worker_profile_id:\s*z\.string\(\)\.uuid\(\)/);
  });

  it("prueft Org-Zugehoerigkeit UND dass noch kein Konto haengt", () => {
    /*
     * Der Bezug kommt aus dem Browser und entscheidet, welches Profil spaeter an
     * ein neues Konto gehaengt wird. Ungeprueft koennte jemand die Einladung
     * eines fremden Mitarbeiters auf sein eigenes Profil zeigen lassen — und
     * bekaeme damit Zugriff auf dessen Daten.
     */
    assert.match(code, /FROM worker_profiles[\s\S]{0,160}supplier_org_id = \$2[\s\S]{0,60}user_id IS NULL/,
      "beide Bedingungen muessen im selben Query stehen");
    assert.match(code, /PROFILE_NOT_INVITABLE/);
  });

  it("prueft VOR dem Anlegen der Einladung", () => {
    const iPruefung = code.indexOf("PROFILE_NOT_INVITABLE");
    const iAnlegen  = code.indexOf("workerService.createWorkerInvite");
    assert.ok(iPruefung > 0 && iPruefung < iAnlegen,
      "eine Pruefung nach dem Schreiben ist keine Pruefung");
  });

  it("reicht den Bezug an den Dienst durch", () => {
    assert.match(code, /workerProfileId:\s*parsed\.data\.worker_profile_id/,
      "ohne Durchreichen bliebe die Spalte leer und acceptInvite legte doch ein zweites Profil an");
  });
});

/* ── Der Import ───────────────────────────────────────────────────────────── */

describe("P10/D5 · Der Import kennt beide Wege", () => {
  it("laedt den Bestand so, dass kontolose Profile dabei sind", async () => {
    const pool = protokollPool([{ rows: [] }, { rows: [] }]);
    await svc.bulkImportWorkers(pool, {
      supplierOrgId: "o1",
      workers: [{ email: "a@b.de", first_name: "A", last_name: "B" }],
      createdBy: "u1"
    });
    assert.match(pool.abfragen[0].text, /LEFT JOIN users u/,
      "mit INNER JOIN waere ein kontoloser Mitarbeiter bei der Duplikatpruefung unsichtbar — " +
      "jeder Folgeimport legte ihn erneut an");
    assert.match(pool.abfragen[0].text, /wp\.personnel_number/,
      "ohne die Nummer gibt es fuer ihn keinen zweiten Schluessel");
  });

  it("lehnt eine Zeile ohne E-Mail UND ohne Nummer klar begruendet ab", async () => {
    const pool = protokollPool([{ rows: [] }]);
    const res = await svc.bulkImportWorkers(pool, {
      supplierOrgId: "o1",
      workers: [{ first_name: "A", last_name: "B" }],
      createdBy: "u1"
    });
    assert.equal(res.errors.length, 1);
    assert.equal(res.errors[0].error, "MISSING_IDENTITY");
    assert.match(res.errors[0].message, /Personalnummer/,
      "der Nutzer muss erfahren, was er tun kann — nicht nur, dass etwas fehlt");
  });
});
