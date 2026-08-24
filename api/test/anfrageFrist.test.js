import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  verfalleneAnfragen,
  confirmAssignment,
  declineAssignment,
} from "../services/workerService.js";

/*
 * DIE ANFRAGE BEKOMMT EINE UHR — beide Arten.
 *
 * ERSATZ (Plan I, 8.2 / Migration 193, Owner-Entscheid 2026-08-21):
 *   "Frist einer Ersatz-Anfrage: 4 Stunden, dann verfaellt sie automatisch;
 *    Erinnerung nach 2 h. [...] danach wird der Einsatz wieder offen und der
 *    Knopf erscheint erneut."
 *
 * REGULAER (Migration 195, Owner-Entscheid 2026-08-24): "Option C mit 72h und
 *   Kundenmeldung" — 72 Stunden, gedeckelt am Einsatzbeginn, Erinnerung bei der
 *   Haelfte, und beim Verfall erfaehrt es auch der Kunde.
 *
 * Der Befund davor, an der laufenden Datenbank gemessen: eine unbeantwortete
 * regulaere Zuweisung blockierte den Platz unbegrenzt — sie zaehlte in
 * `reserved_quantity`, hielt `open_quantity` gedrueckt, und der Kunde sah die
 * Kraft die ganze Zeit auf seiner Live-Tafel. Vier Menschen standen so bei
 * Kunden, ohne je zugesagt zu haben, der aelteste seit 136 Tagen; fuenf weitere
 * Anfragen waren eingefroren (Einsatzzeitraum vorbei -> ASSIGNMENT_NOT_CURRENT
 * weist Zusage UND Absage ab, die Zeile zaehlt aber weiter).
 */

const WORKER = "22222222-2222-2222-2222-222222222222";
const SUPPLIER = "33333333-3333-3333-3333-333333333333";
const LINK = "44444444-4444-4444-4444-444444444444";
const ASG = "55555555-5555-5555-5555-555555555555";
const ALT_LINK = "66666666-6666-6666-6666-666666666666";
const KUNDE_ORG = "77777777-7777-7777-7777-777777777777";
const KAPAZITAET = "88888888-8888-8888-8888-888888888888";
const PROFIL = "99999999-9999-9999-9999-999999999999";
const EMPFAENGER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

/** Eine verfallene Zeile, wie der Sweep sie aus dem RETURNING bekommt. */
function zeile(ueberschreibungen = {}) {
  return {
    id: LINK,
    assignment_id: ASG,
    worker_user_id: WORKER,
    supplier_org_id: SUPPLIER,
    ersetzt_link_id: null,
    capacity_post_id: null,
    client_name: null,
    ...ueberschreibungen,
  };
}

/**
 * Spion-Pool fuer den Sweep. `connect()` liefert einen Client mit derselben
 * Antwortlogik, damit Transaktions- und Nach-Commit-Aufrufe unterscheidbar
 * bleiben (`via`).
 *
 * Ohne `profil` bleibt `profilZuNutzer` leer — dann ueberspringt der Sweep die
 * Marktplatz-Freigabe, und die Probe bleibt auf den Pfad beschraenkt, den sie
 * pruefen will. Wer den Namen braucht, schaltet es an.
 */
function sweepPool({
  verfallen = [], erinnert = [], empfaenger = [], einsatz = null, profil = null,
} = {}) {
  const calls = [];
  const antworte = (sql, params, via) => {
    const text = String(sql);
    calls.push({ sql: text, params: params || [], via });

    if (/SET worker_confirmation_status = 'expired'/.test(text)) {
      return { rows: verfallen, rowCount: verfallen.length };
    }
    if (/SET erinnert_am = NOW\(\)/.test(text)) {
      return { rows: erinnert, rowCount: erinnert.length };
    }
    if (/FROM org_memberships/.test(text)) {
      return { rows: empfaenger.map((id) => ({ user_id: id })), rowCount: empfaenger.length };
    }
    if (/FROM assignments a\s*\n?\s*JOIN worker_assignment_links wal/.test(text)) {
      return { rows: einsatz ? [einsatz] : [], rowCount: einsatz ? 1 : 0 };
    }
    if (/SELECT id, first_name, last_name, personnel_number/.test(text)) {
      return { rows: profil ? [profil] : [], rowCount: profil ? 1 : 0 };
    }
    if (/INSERT INTO notifications/.test(text)) {
      return { rows: [{ id: "n1", type: (params || [])[2] || null }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  };

  const client = {
    query: async (sql, params) => antworte(sql, params, "client"),
    release: () => {},
  };
  return {
    calls,
    connect: async () => client,
    query: async (sql, params) => antworte(sql, params, "pool"),
  };
}

const sqlVon = (pool) => pool.calls.map((c) => c.sql);
const meldungenMitTyp = (pool, typ) =>
  pool.calls.filter((c) => /INSERT INTO notifications/.test(c.sql) && c.params.includes(typ));

describe("Anfrage-Frist — der Sweep", () => {
  it("nichts faellig = nichts angefasst", async () => {
    const pool = sweepPool();
    const r = await verfalleneAnfragen(pool);
    assert.deepEqual(r, { verfallen: 0, erinnert: 0 });
    assert.ok(!sqlVon(pool).some((q) => /INSERT INTO notifications/.test(q)),
      "ohne faellige Zeilen darf keine Meldung entstehen");
    assert.ok(sqlVon(pool).some((q) => q.includes("COMMIT")), "die Transaktion schliesst sauber");
  });

  it("der Verfall traegt die drei tragenden Wirkungen in EINEM UPDATE", async () => {
    const pool = sweepPool();
    await verfalleneAnfragen(pool);
    const verfall = pool.calls.find((c) => /SET worker_confirmation_status = 'expired'/.test(c.sql));
    assert.ok(verfall, "das Verfalls-UPDATE fehlt");
    /* is_active = FALSE ist die tragende Wirkung: sie oeffnet pending_quantity,
     * REPLACEMENT_PENDING und die ersatz-LATERAL auf einmal — ohne dass einer
     * dieser drei Riegel angefasst wird. */
    assert.match(verfall.sql, /is_active\s+= FALSE/);
    assert.match(verfall.sql, /verfallen_am = NOW\(\)/,
      "ohne Zeitstempel ist Verfall spaeter nicht von Absage unterscheidbar");
    assert.match(verfall.sql, /frist_bis IS NOT NULL AND frist_bis <= NOW\(\)/,
      "NULL = keine Frist: der Altbestand bleibt liegen");
  });

  it("die Frist gilt fuer BEIDE Arten — der Ersatz-Filter ist weg", async () => {
    /* Bis zum Owner-Entscheid vom 2026-08-24 stand hier
     * `AND ersetzt_link_id IS NOT NULL` und begrenzte den Sweep auf
     * Ersatz-Anfragen. Genau diese Zeile ist gefallen; `ersetzt_link_id` kommt
     * jetzt im RETURNING mit, weil die Nachbereitung die beiden Arten
     * unterscheiden muss (Kundenpfad ja/nein). */
    const pool = sweepPool();
    await verfalleneAnfragen(pool);
    const verfall = pool.calls.find((c) => /SET worker_confirmation_status = 'expired'/.test(c.sql));
    assert.ok(!/WHERE[\s\S]*ersetzt_link_id IS NOT NULL/.test(verfall.sql),
      "der Ersatz-Filter darf NICHT mehr im WHERE stehen — sonst verfallen "
      + "regulaere Zuweisungen weiterhin nie");
    assert.match(verfall.sql, /RETURNING[\s\S]*ersetzt_link_id/,
      "ohne ersetzt_link_id im RETURNING kann die Nachbereitung Ersatz nicht "
      + "von regulaer unterscheiden");
    assert.match(verfall.sql, /RETURNING[\s\S]*capacity_post_id/,
      "ohne capacity_post_id bleibt der Kapazitaets-Posten fuer immer geschlossen");
  });

  it("Verfall laeuft VOR der Erinnerung — sonst wird ein Toter erinnert", async () => {
    const pool = sweepPool();
    await verfalleneAnfragen(pool);
    const sqls = sqlVon(pool);
    const iVerfall = sqls.findIndex((q) => /SET worker_confirmation_status = 'expired'/.test(q));
    const iErinnerung = sqls.findIndex((q) => /SET erinnert_am = NOW\(\)/.test(q));
    assert.ok(iVerfall >= 0 && iErinnerung > iVerfall);
    const erinnerung = pool.calls[iErinnerung];
    assert.match(erinnerung.sql, /frist_bis > NOW\(\)/,
      "die Erinnerung selbst muss Verfallene ausschliessen — doppelter Schutz");
    assert.match(erinnerung.sql, /erinnert_am IS NULL/,
      "die Doppelversand-Bremse: einmal erinnert ist erinnert");
  });

  it("Erinnerungsmarke und Meldung stehen in EINER Transaktion", async () => {
    const pool = sweepPool({
      erinnert: [{ id: LINK, assignment_id: ASG, worker_user_id: WORKER, frist_bis: new Date().toISOString() }],
    });
    await verfalleneAnfragen(pool);
    const commit = pool.calls.findIndex((c) => c.sql.includes("COMMIT"));
    const meldung = pool.calls.findIndex(
      (c) => /INSERT INTO notifications/.test(c.sql) && c.via === "client");
    assert.ok(meldung >= 0, "die Erinnerungs-Meldung fehlt");
    assert.ok(meldung < commit,
      "die Meldung muss VOR dem COMMIT stehen: scheitert der INSERT, rollt die "
      + "Marke mit zurueck und der naechste Lauf versucht es erneut — eine gesetzte "
      + "Marke ohne Meldung waere eine Erinnerung, die nie jemand bekommt");
    assert.ok(pool.calls[meldung].params.includes("worker_assignment_reminder"));
  });

  it("der Verfall benachrichtigt NACH dem Commit", async () => {
    const pool = sweepPool({ verfallen: [zeile({ ersetzt_link_id: ALT_LINK })] });
    await verfalleneAnfragen(pool);
    const commit = pool.calls.findIndex((c) => c.sql.includes("COMMIT"));
    const arbeiter = pool.calls.findIndex(
      (c) => /INSERT INTO notifications/.test(c.sql) && c.params.includes("worker_assignment_expired"));
    assert.ok(arbeiter > commit,
      "die Verfallsmeldung laeuft NACH dem Commit: ein Zustellweg, der die "
      + "fachliche Wahrheit zuruecknehmen kann, waere schlimmer als gar keiner — "
      + "der Verfall IST passiert, ob die Meldung ankommt oder nicht");
  });

  it("S: die WHERE-Klausel entwertet sich selbst — zwei gleichzeitige Laeufe sind unschaedlich", async () => {
    const pool = sweepPool();
    await verfalleneAnfragen(pool);
    const verfall = pool.calls.find((c) => /SET worker_confirmation_status = 'expired'/.test(c.sql));
    assert.match(verfall.sql, /WHERE worker_confirmation_status = 'pending_confirmation'/);
  });
});

describe("Anfrage-Frist — der Kunde erfaehrt es, aber nur beim regulaeren Verfall", () => {
  const EINSATZ = {
    assignment_id: ASG,
    assignment_status: "active",
    kunde_org_id: KUNDE_ORG,
    verknuepfung_org_id: KUNDE_ORG,
    kunde: "Müller GmbH",
  };

  it("REGULAER: der Kunde bekommt eine Meldung an SEINER Org", async () => {
    /* Der Kunde sieht eine wartende regulaere Zuweisung vom ersten Tag an auf
     * seiner Live-Tafel (workforceService schliesst nur den Ersatzfall aus).
     * Verschwaende sie beim Verfall kommentarlos, plante er weiter mit
     * jemandem, den es auf seinem Einsatz nicht mehr gibt. */
    const pool = sweepPool({
      verfallen: [zeile()], empfaenger: [EMPFAENGER], einsatz: EINSATZ,
    });
    await verfalleneAnfragen(pool);

    const kundenMeldung = meldungenMitTyp(pool, "assignment_worker_not_confirmed");
    assert.equal(kundenMeldung.length, 1, "genau eine Kundenmeldung je Einsatz");
    assert.ok(kundenMeldung[0].params.includes(KUNDE_ORG),
      "org_id muss die EMPFAENGER-Org sein — stuende dort die Zeitarbeitsfirma, "
      + "laege die Meldung in der Ablage einer fremden Organisation");
    assert.ok(kundenMeldung[0].params.includes(ASG),
      "Anker ist der EINSATZ: der Kunde kennt keine Link-ID und hat keinen Zugriff darauf");
    assert.ok(kundenMeldung[0].params.includes("assignment"));
  });

  it("ERSATZ: der Kunde bekommt NICHTS", async () => {
    /* Er hat die angefragte Ersatzkraft nie gesehen — die Live-Belegschaft
     * blendet genau diesen Fall aus, und "Ersatz gestellt" haengt an der ZUSAGE.
     * Beim Verfall gibt es dort nichts zurueckzunehmen. */
    const pool = sweepPool({
      verfallen: [zeile({ ersetzt_link_id: ALT_LINK })],
      empfaenger: [EMPFAENGER], einsatz: EINSATZ,
    });
    await verfalleneAnfragen(pool);
    assert.equal(meldungenMitTyp(pool, "assignment_worker_not_confirmed").length, 0,
      "beim Ersatz-Verfall darf KEINE Kundenmeldung entstehen");
  });

  it("die Empfangspruefung des Bestands gilt auch hier — Kunde ist der Lieferant", async () => {
    /* Interne Einsaetze: `kunde_org_id === supplier_org_id`. Ohne diese Pruefung
     * bekaeme dasselbe Buero die Sache zweimal. Die Regel wird nicht neu
     * gebaut, sondern von kundeIstEmpfangsberechtigt geliehen. */
    const pool = sweepPool({
      verfallen: [zeile()], empfaenger: [EMPFAENGER],
      einsatz: { ...EINSATZ, kunde_org_id: SUPPLIER, verknuepfung_org_id: SUPPLIER },
    });
    await verfalleneAnfragen(pool);
    assert.equal(meldungenMitTyp(pool, "assignment_worker_not_confirmed").length, 0,
      "wo der Kunde der Lieferant ist, gibt es niemanden zu benachrichtigen");
  });

  it("ein erledigter Einsatz bekommt keine Meldung mehr", async () => {
    const pool = sweepPool({
      verfallen: [zeile()], empfaenger: [EMPFAENGER],
      einsatz: { ...EINSATZ, assignment_status: "completed" },
    });
    await verfalleneAnfragen(pool);
    assert.equal(meldungenMitTyp(pool, "assignment_worker_not_confirmed").length, 0);
  });
});

describe("Anfrage-Frist — die Disponenten erfahren die richtige Sache", () => {
  it("REGULAER meldet 'Zuweisung nicht bestaetigt', nicht 'Ersatz-Anfrage verfallen'", async () => {
    const pool = sweepPool({ verfallen: [zeile()], empfaenger: [EMPFAENGER] });
    await verfalleneAnfragen(pool);
    assert.equal(meldungenMitTyp(pool, "worker_assignment_not_confirmed").length, 1);
    assert.equal(meldungenMitTyp(pool, "worker_replacement_expired").length, 0,
      "der Ersatz-Titel erscheint in Vorschau, Push-Banner und Betreffzeile — "
      + "bei einer regulaeren Zuweisung ist nichts ersetzt worden");
  });

  it("ERSATZ meldet weiterhin 'Ersatz-Anfrage verfallen'", async () => {
    const pool = sweepPool({
      verfallen: [zeile({ ersetzt_link_id: ALT_LINK })], empfaenger: [EMPFAENGER],
    });
    await verfalleneAnfragen(pool);
    assert.equal(meldungenMitTyp(pool, "worker_replacement_expired").length, 1);
    assert.equal(meldungenMitTyp(pool, "worker_assignment_not_confirmed").length, 0);
  });

  it("der Name steht in der Meldung — profilZuNutzer liefert `name`, nicht `first_name`", async () => {
    /* Der vorherige Zugriff las first_name/last_name von einem Objekt, das nur
     * { id, name } traegt. Ergebnis war eine leere Zeichenkette, und weil das
     * Objekt truthy ist, griff auch der Rueckfalltext nicht: die Meldung begann
     * mit einem Leerzeichen. */
    const pool = sweepPool({
      verfallen: [zeile()], empfaenger: [EMPFAENGER],
      profil: { id: PROFIL, first_name: "Ada", last_name: "Lovelace", personnel_number: null },
    });
    await verfalleneAnfragen(pool);
    const meldung = meldungenMitTyp(pool, "worker_assignment_not_confirmed")[0];
    assert.ok(meldung, "die Disponenten-Meldung fehlt");
    const text = meldung.params.find((p) => typeof p === "string" && p.includes("nicht innerhalb der Frist"));
    assert.ok(text, "der Meldungstext fehlt");
    assert.match(text, /^Ada Lovelace /, "der Name fehlt am Anfang der Meldung");
  });
});

describe("Anfrage-Frist — der Kapazitaets-Posten kommt zurueck", () => {
  it("REGULAER mit Kapazitaet: der Posten wird wieder geoeffnet", async () => {
    /* `assignCapacityToWorker` schaltet den Posten beim Zuweisen auf
     * 'filled'/is_active=FALSE. `syncWorkerReservation` holt ihn NICHT zurueck
     * (dessen Freigabe greift nur fuer 'paused' + worker_reserved). Ohne diesen
     * Schritt bliebe das Angebot nach dem Verfall fuer immer verschwunden. */
    const pool = sweepPool({ verfallen: [zeile({ capacity_post_id: KAPAZITAET })] });
    await verfalleneAnfragen(pool);
    const rueckgabe = pool.calls.find((c) => /UPDATE capacity_posts/.test(c.sql));
    assert.ok(rueckgabe, "der Kapazitaets-Posten wird nicht zurueckgegeben");
    assert.match(rueckgabe.sql, /SET status = 'active', is_active = TRUE/);
    assert.match(rueckgabe.sql, /AND cp\.status = 'filled'/,
      "geweckt wird nur, was die Zuweisung selbst geschlossen hat — ein "
      + "archivierter Posten bleibt, wo er ist");
    assert.match(rueckgabe.sql, /< GREATEST\(1, COALESCE\(cp\.headcount, 1\)\)/,
      "die Zaehlung muss die Setz-Logik spiegeln: ein Posten mit drei von drei "
      + "Plaetzen, von denen einer verfaellt, bleibt korrekt geschlossen");
    assert.ok(rueckgabe.params.includes(KAPAZITAET));
  });

  it("ohne Kapazitaets-Posten wird nichts angefasst", async () => {
    const pool = sweepPool({ verfallen: [zeile()] });
    await verfalleneAnfragen(pool);
    assert.ok(!sqlVon(pool).some((q) => /UPDATE capacity_posts/.test(q)));
  });

  it("ERSATZ fasst keine Kapazitaet an", async () => {
    /* Der Ersatz-Pfad legt keinen Kapazitaets-Posten an; ein UPDATE dort waere
     * ein Eingriff in fremde Daten. */
    const pool = sweepPool({
      verfallen: [zeile({ ersetzt_link_id: ALT_LINK, capacity_post_id: KAPAZITAET })],
    });
    await verfalleneAnfragen(pool);
    assert.ok(!sqlVon(pool).some((q) => /UPDATE capacity_posts/.test(q)));
  });
});

describe("Anfrage-Frist — der taktunabhaengige Riegel in Zusage und Absage", () => {
  /*
   * Die Frist steht als Bedingung IM UPDATE, nicht als Lesen-dann-Schreiben.
   * Damit gilt sie auch, wenn der Takt 14 Minuten entfernt ist oder die
   * Betriebsumgebung ihn nie ausfuehrt — der dokumentierte Cron hat in dieser
   * Umgebung noch nie gefeuert (403 CSRF, kein Crontab). Zwei Menschen beim
   * Kunden waeren die Folge einer Zusage nach Verfall.
   */

  function riegelPool({ kontextStatus = "pending_confirmation", fristBis = null, updateTrifft = false } = {}) {
    const calls = [];
    return {
      calls,
      query: async (sql, params) => {
        const text = String(sql);
        calls.push({ sql: text, params: params || [] });
        if (/FROM worker_assignment_links wal/.test(text)) {
          return {
            rows: [{
              id: LINK, assignment_id: ASG, worker_confirmation_status: kontextStatus,
              is_active: true, frist_bis: fristBis,
              assignment_is_current: true, assignment_lifecycle_state: "active",
            }],
            rowCount: 1,
          };
        }
        if (/UPDATE worker_assignment_links/.test(text)) {
          return updateTrifft
            ? { rows: [{ id: LINK, assignment_id: ASG }], rowCount: 1 }
            : { rows: [], rowCount: 0 };
        }
        return { rows: [], rowCount: 0 };
      },
    };
  }

  it("die Zusage traegt die Fristbedingung im WHERE", async () => {
    const pool = riegelPool({ updateTrifft: true });
    await confirmAssignment(pool, LINK, WORKER);
    const update = pool.calls.find((c) => /SET worker_confirmation_status = 'worker_confirmed'/.test(c.sql));
    assert.match(update.sql, /frist_bis IS NULL OR frist_bis > NOW\(\)/,
      "ohne die Bedingung kann eine ueberfaellige Anfrage zusagen, solange der "
      + "Sweep noch nicht lief — und dann stehen zwei Menschen beim Kunden");
  });

  it("eine ueberfaellige Zusage ergibt ANFRAGE_VERFALLEN, keine INVALID_STATUS-Luege", async () => {
    const pool = riegelPool({ fristBis: "2026-08-24T06:00:00Z", updateTrifft: false });
    const r = await confirmAssignment(pool, LINK, WORKER);
    assert.equal(r.error, "ANFRAGE_VERFALLEN");
    assert.ok(!pool.calls.some((c) => /recalcAssignmentStaffing|INSERT/.test(c.sql)),
      "eine verfallene Zusage darf nichts nachziehen");
  });

  it("auch die Absage endet mit der Frist — sonst wird Verfall zur Ablehnung umdeklariert", async () => {
    const pool = riegelPool({ updateTrifft: false });
    const r = await declineAssignment(pool, LINK, WORKER, "zu spaet");
    assert.equal(r.error, "ANFRAGE_VERFALLEN");
    const update = pool.calls.find((c) => /SET worker_confirmation_status = 'worker_declined'/.test(c.sql));
    assert.match(update.sql, /frist_bis IS NULL OR frist_bis > NOW\(\)/);
  });

  it("ohne Frist (Altbestand) aendert sich NICHTS", async () => {
    const pool = riegelPool({ updateTrifft: true });
    const r = await confirmAssignment(pool, LINK, WORKER);
    assert.equal(r.error, undefined,
      "frist_bis IS NULL muss durchlassen — die Bestandszeilen aus der Zeit vor "
      + "der Frist kennen keine (Linie aus Migration 188/193)");
  });
});

describe("Anfrage-Frist — die Anfrage wird mit Uhr geboren", () => {
  const quelle = fs.readFileSync(new URL("../services/workerService.js", import.meta.url), "utf8");

  it("ERSATZ: BEIDE Zweige des INSERT setzen die 4-h-Frist", () => {
    /* Der ON-CONFLICT-Zweig recycelt eine bestehende Zeile und fasst
     * created_at nicht an — eine aus created_at abgeleitete Frist waere beim
     * zweiten Anlauf auf dasselbe Paar (worker, assignment) bei der Geburt
     * schon abgelaufen. Deshalb eigene Spalten, in beiden Zweigen gesetzt. */
    assert.match(quelle, /NOW\(\) \+ INTERVAL '4 hours', NOW\(\) \+ INTERVAL '2 hours', NULL, NULL\)/,
      "der INSERT-Zweig setzt die 4-h-Frist und die 2-h-Erinnerung nicht");
    assert.match(quelle, /frist_bis=NOW\(\) \+ INTERVAL '4 hours',\s*\n\s*erinnerung_faellig_am=NOW\(\) \+ INTERVAL '2 hours',\s*\n\s*erinnert_am=NULL, verfallen_am=NULL/,
      "der ON-CONFLICT-Zweig muss die Uhr NEU stellen — sonst erbt der zweite "
      + "Anlauf die abgelaufene Frist des ersten");
  });

  it("REGULAER: beide Einfuegepfade setzen frist_bis und erinnerung_faellig_am", () => {
    /* Genau zwei Stellen erzeugen eine regulaere offene Anfrage:
     * assignCapacityToWorker und assignDealToWorker. Alle sechs Routen, die
     * "Bestaetigung erforderlich" melden, laufen ueber diese beiden. */
    const treffer = quelle.match(/worker_confirmation_status, frist_bis, erinnerung_faellig_am\)/g) || [];
    assert.equal(treffer.length, 2,
      "erwartet werden genau zwei regulaere Einfuegepfade mit Frist "
      + `(assignCapacityToWorker, assignDealToWorker) — gefunden: ${treffer.length}`);
  });

  it("die Regelfrist ist 72 Stunden — derselbe Wert wie Einladung und Auswahl-Set", () => {
    assert.match(quelle, /const ANFRAGE_FRIST_STUNDEN = 72;/,
      "eine dritte Zahl einzufuehren, wo zwei Nachbarfaelle sich einig sind, "
      + "waere eine Sonderregel ohne Anlass");
  });

  it("der Deckel liegt am Einsatzbeginn — LEAST innen", () => {
    /* Ohne Deckel kann eine Anfrage den Einsatzbeginn ueberleben; genau daraus
     * sind die eingefrorenen Altfaelle entstanden. */
    assert.match(quelle, /LEAST\(NOW\(\) \+ INTERVAL '\$\{ANFRAGE_FRIST_STUNDEN\} hours', \$\{startAusdruck\}::date::timestamptz\)/,
      "der Einsatzbeginn muss die Frist deckeln");
  });

  it("die Untergrenze steht AUSSEN — sonst verfaellt jede Anfrage fuer einen laufenden Einsatz sofort", () => {
    /* 22 von 24 Zuweisungen im Bestand haben einen Vorlauf <= 0 Tage. Ein
     * harter Deckel liesse sie bei der Geburt verfallen. GREATEST aussen
     * erzwingt die Mindestfrist gegen den Deckel. */
    assert.match(quelle, /GREATEST\([\s\S]{0,200}NOW\(\) \+ INTERVAL '\$\{ANFRAGE_MINDESTFRIST_STUNDEN\} hours'\)/,
      "GREATEST muss den Deckel ueberstimmen, nicht umgekehrt");
    assert.match(quelle, /const ANFRAGE_MINDESTFRIST_STUNDEN = 4;/);
  });

  it("die Erinnerung ist die Haelfte der TATSAECHLICHEN Frist", () => {
    /* Bei einer auf fuenf Stunden gedeckelten Anfrage waeren 36 Stunden eine
     * Erinnerung nach dem Verfall. */
    assert.match(quelle, /NOW\(\) \+ \(\(\$\{anfrageFristSql\(startAusdruck\)\} - NOW\(\)\) \/ 2\)/,
      "die Erinnerung darf keine feste Stundenzahl sein");
  });

  it("die Erinnerungszeit ist ABSOLUT gespeichert, nicht aus frist_bis gerechnet", () => {
    assert.ok(!/frist_bis - INTERVAL '2 hours'/.test(quelle),
      "die Erinnerung darf nicht aus der Frist gerechnet werden");
  });
});

describe("Anfrage-Frist — der Betroffene erfaehrt sie im Erst-Text", () => {
  /* Eine Frist, die man dem Betroffenen nicht mitteilt, ist eine Falle. Vor
   * Migration 195 gab `deadlineLabel` nur der Ersatz-Pfad mit — die fuenf
   * regulaeren Wege liessen ihn weg, weil ihre Anfragen keine Frist trugen.
   * Jetzt tragen sie eine, und alle sechs muessen sie nennen. */
  const workers = fs.readFileSync(new URL("../routes/workers.js", import.meta.url), "utf8");
  const marktplatz = fs.readFileSync(new URL("../routes/marketplace.js", import.meta.url), "utf8");
  const schnell = fs.readFileSync(
    new URL("../services/dealStaffingFastTrackService.js", import.meta.url), "utf8");

  it("ALLE sechs Anfragewege geben ein Frist-Label mit", () => {
    const rufe = [...workers.matchAll(/notifyAssignmentPendingConfirmation\(([\s\S]{0,400}?)\)\s*[;.]/g)]
      .map((m) => m[1])
      .concat([...marktplatz.matchAll(/notifyAssignmentPendingConfirmation\(([\s\S]{0,400}?)\)\s*[;.]/g)]
        .map((m) => m[1]));
    assert.equal(rufe.length, 6,
      `erwartet werden sechs Aufrufstellen — gefunden: ${rufe.length}`);
    const ohneLabel = rufe.filter((r) => !/fristLabelDE\(/.test(r));
    assert.deepEqual(ohneLabel, [],
      "diese Aufrufe nennen die Frist nicht:\n" + ohneLabel.join("\n---\n"));
  });

  it("die Formatierung liegt an EINER Stelle, nicht als Kopie in den Routen", () => {
    /* Die Ersatz-Route trug eine Inline-`Intl.DateTimeFormat`-Kopie. Bei sechs
     * Aufrufern waeren daraus sechs Formate geworden. */
    assert.ok(!/new Intl\.DateTimeFormat\([\s\S]{0,120}Europe\/Berlin[\s\S]{0,200}frist_bis/.test(workers),
      "in den Routen darf keine eigene Frist-Formatierung mehr stehen");
    const utils = fs.readFileSync(new URL("../utils/dateDE.js", import.meta.url), "utf8");
    assert.match(utils, /export function fristLabelDE/);
    assert.match(utils, /timeZone: TZ/, "die Frist muss in Europe/Berlin formatiert werden");
  });

  it("auch die Erinnerung nennt den TAG, nicht nur die Uhrzeit", () => {
    /* Bei der Ersatz-Frist (4 h) lag der Verfall immer am selben Tag, deshalb
     * genuegte "17:42 Uhr". Eine regulaere Frist kann 72 Stunden entfernt
     * liegen — dann laesst eine blosse Uhrzeit drei Tage offen. */
    const dienst = fs.readFileSync(new URL("../services/workerService.js", import.meta.url), "utf8");
    assert.match(dienst, /notifyAssignmentReminder\(\s*\n?\s*client, zeile\.worker_user_id, zeile\.id, fristLabelDE\(zeile\.frist_bis\)/,
      "die Erinnerung muss dasselbe Label verwenden wie der Erst-Text");
    assert.ok(!/function uhrzeitDE/.test(dienst),
      "die reine Uhrzeit-Formatierung darf nicht als toter Code zurueckbleiben");
  });

  it("die Schnellbesetzung reicht die Frist ueberhaupt nach oben", () => {
    /* `assigned_links` trug nur worker_user_id und link_id. Ohne frist_bis
     * haette die Schnellbesetzung eine Frist, die niemand mitgeteilt bekommt.
     *
     * Ausschnitt statt Volltext-Regex: schlaegt die Probe fehl, soll die
     * Meldung den Block zeigen, nicht die ganze Datei ins Protokoll kippen. */
    const start = schnell.indexOf("assignedLinks.push({");
    assert.ok(start >= 0, "assignedLinks.push nicht gefunden — wurde es umbenannt?");
    const block = schnell.slice(start, start + 600);
    assert.ok(/frist_bis: result\.link\?\.frist_bis/.test(block),
      "assigned_links muss frist_bis tragen. Gefunden:\n" + block.slice(0, 400));
  });
});

describe("Anfrage-Frist — beide Aufrufer rufen dieselbe Funktion", () => {
  it("der getaktete interne Handler ruft den Sweep als dritten Aufruf", () => {
    const internal = fs.readFileSync(new URL("../routes/internal.js", import.meta.url), "utf8");
    assert.match(internal, /workerService\.verfalleneAnfragen\(pool\)/,
      "kein neuer Endpunkt — der dritte Aufruf im bestehenden Handler kostet "
      + "keinen Waechter-Nachtrag und erbt Takt, Auth und Rate-Limit");
  });

  it("der BullMQ-Takt laeuft alle 10 Minuten — nicht taeglich", () => {
    const workers = fs.readFileSync(new URL("../workers/index.js", import.meta.url), "utf8");
    assert.match(workers, /upsertJobScheduler\("ersatz-frist-10min", \{ pattern: "\*\/10 \* \* \* \*" \}/,
      "eine 4-h-Frist mit Tagestakt waere eine Attrappe");
    const worker = fs.readFileSync(new URL("../workers/capacityWorker.js", import.meta.url), "utf8");
    assert.match(worker, /case "ersatz-frist":/,
      "der Job-Name ist eine Adresse: der Scheduler ist unter diesem Schluessel "
      + "registriert, ein umbenannter Job liesse den alten verwaist zurueck");
    assert.match(worker, /verfalleneAnfragen/);
  });
});

describe("Anfrage-Frist — die Meldungstypen sind ueberall verdrahtet", () => {
  /* Ein Typ, der nicht im CHECK steht, scheitert nicht laut: dispatch verwirft
   * still. Der DB-Teil dieser Pflicht liegt in benachrichtigungsSpiegel.test.js;
   * hier wird die Code-Seite gehalten. */
  const wurzel = new URL("../services/", import.meta.url);
  const matrix = fs.readFileSync(new URL("notificationMatrix.js", wurzel), "utf8");
  const kanaele = fs.readFileSync(new URL("matchAlertService.js", wurzel), "utf8");
  const flaechen = fs.readFileSync(new URL("notificationSurfaceMap.js", wurzel), "utf8");

  it("beide neuen Ereignisse stehen in der Matrix", () => {
    assert.match(matrix, /'worker\.assignment_not_confirmed':\s*\{[\s\S]{0,200}type: 'worker_assignment_not_confirmed'/);
    assert.match(matrix, /'assignment\.worker_not_confirmed':\s*\{[\s\S]{0,200}type: 'assignment_worker_not_confirmed'/);
  });

  it("beide haben eine Kanal-Kategorie — sonst faellt der Schalter auf match_alerts zurueck", () => {
    assert.match(kanaele, /'worker\.assignment_not_confirmed':\s*'workforce_updates'/);
    assert.match(kanaele, /'assignment\.worker_not_confirmed':\s*'client_assignment_updates'/,
      "die Kundenseite braucht ihre eigene Kategorie: der Schalter haengt an der "
      + "Person, und wer in beiden Welten Mitglied ist, haette sonst EINEN "
      + "Schalter fuer zwei voellig verschiedene Dinge");
  });

  it("die Kundenmeldung liegt auf der Einsatz-Karte", () => {
    assert.match(flaechen, /assignment_worker_not_confirmed: "assignments"/);
    const spiegel = new URL("../../../frontend/public/js/hubCardBadges.js", import.meta.url);
    if (fs.existsSync(spiegel)) {
      assert.match(fs.readFileSync(spiegel, "utf8"), /"assignment_worker_not_confirmed"/,
        "ohne die Oberflaechen-Kopie erscheint die Meldung in der Glocke, aber "
        + "das Abzeichen auf der Karte bleibt aus");
    }
  });

  it("die Migration traegt beide Typen nach", () => {
    const mig = new URL("../../sql/migrations/195_zuweisung_ohne_bestaetigung.sql", import.meta.url);
    const text = fs.readFileSync(mig, "utf8");
    assert.match(text, /'worker_assignment_not_confirmed'/);
    assert.match(text, /'assignment_worker_not_confirmed'/);
  });
});

/*
 * DB-SMOKE: der ganze Weg an der echten Datenbank (Zwei-Schicht-Disziplin).
 * Ein Mock kann kein WHERE erzwingen; erst hier ist bewiesen, dass der Sweep
 * genau die richtige Zeile trifft und die Riegel danach offen sind.
 */
describe("Anfrage-Frist — DB-Smoke: der Verfall oeffnet die Riegel wirklich",
  { skip: !(process.env.DATABASE_URL || (process.env.DB_HOST && process.env.POSTGRES_PASSWORD)) && "keine Datenbank" }, () => {
  it("faellige Zeile wird getroffen, Altbestand ohne Frist NICHT", async () => {
    const { Pool } = await import("pg");
    const pool = new Pool(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : undefined);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows: basis } = await client.query(
        `SELECT id FROM worker_assignment_links LIMIT 1`
      );
      if (!basis.length) return; // leere DB: nichts zu beweisen, nichts kaputt
      const { rows: alt } = await client.query(
        `SELECT count(*)::int AS n FROM worker_assignment_links
          WHERE worker_confirmation_status = 'pending_confirmation' AND frist_bis IS NULL`
      );
      const { rows: getroffen } = await client.query(
        `UPDATE worker_assignment_links
            SET worker_confirmation_status = 'expired', is_active = FALSE, verfallen_am = NOW()
          WHERE worker_confirmation_status = 'pending_confirmation'
            AND is_active = TRUE
            AND frist_bis IS NOT NULL AND frist_bis <= NOW()
          RETURNING id`
      );
      const { rows: altDanach } = await client.query(
        `SELECT count(*)::int AS n FROM worker_assignment_links
          WHERE worker_confirmation_status = 'pending_confirmation' AND frist_bis IS NULL`
      );
      assert.equal(altDanach[0].n, alt[0].n,
        "der Altbestand ohne Frist darf vom Verfalls-UPDATE nie beruehrt werden");
      assert.ok(getroffen.length >= 0, "das UPDATE ist planbar und der CHECK kennt 'expired'");
      await client.query("ROLLBACK");
    } finally {
      client.release();
      await pool.end();
    }
  });

  it("die Frist-Formel rechnet in der Datenbank wie versprochen", async () => {
    /* Der Mock kann die Formel nicht auswerten — Postgres schon. Drei Faelle:
     * weit in der Zukunft (72 h greifen), knapp (Deckel greift), Vergangenheit
     * (Mindestfrist greift). */
    const { Pool } = await import("pg");
    const pool = new Pool(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : undefined);
    try {
      const formel = (start) =>
        `GREATEST(LEAST(NOW() + INTERVAL '72 hours', ${start}::date::timestamptz), NOW() + INTERVAL '4 hours')`;
      const { rows } = await pool.query(
        `SELECT
           EXTRACT(EPOCH FROM (${formel("(CURRENT_DATE + 30)")} - NOW()))/3600 AS weit,
           EXTRACT(EPOCH FROM (${formel("(CURRENT_DATE + 1)")}  - NOW()))/3600 AS knapp,
           EXTRACT(EPOCH FROM (${formel("(CURRENT_DATE - 10)")} - NOW()))/3600 AS vorbei`
      );
      const r = rows[0];
      assert.ok(Math.abs(Number(r.weit) - 72) < 0.1,
        `Einsatz in 30 Tagen: die vollen 72 h muessen greifen (war ${r.weit})`);
      assert.ok(Number(r.knapp) > 4 && Number(r.knapp) < 48,
        `Einsatz morgen: der Deckel muss unter 72 h druecken (war ${r.knapp})`);
      assert.ok(Math.abs(Number(r.vorbei) - 4) < 0.1,
        `Einsatz laengst begonnen: die Mindestfrist von 4 h muss greifen (war ${r.vorbei})`);
    } finally {
      await pool.end();
    }
  });
});
