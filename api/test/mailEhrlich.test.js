/**
 * Der Mailversand meldet nur noch, was wirklich passiert ist (M1.3).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WAS HIER BEWACHT WIRD, UND WARUM
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Gemessen am 2026-09-02, drei ineinandergreifende stille Ausfaelle:
 *
 *   1. `app.js`s `sendMail` endete ohne Transport mit `return true`.
 *   2. `emailService.sendMail` gab `{ accepted: [to], rejected: [] }` zurueck —
 *      ein Ergebnis, das von einem echten Versand nicht zu unterscheiden ist.
 *   3. Die Masseneinladung umschloss den Versand mit `try/catch` und fuehrte
 *      eine Liste `failed`. Nur wirft `sendMail` bei einem Transportfehler
 *      NIE — es faengt selbst und gibt `false` zurueck. Der `catch` war toter
 *      Code, `failed` blieb IMMER leer, und der Disponent las
 *      "alle eingeladen", auch wenn keine einzige Mail hinausging.
 *
 * Von 42 Aufrufern pruefen 6 die Rueckgabe. Der schlimmste Fall war damit
 * nicht "eine Mail geht verloren", sondern "hundert Einladungen melden
 * Zustellung, und niemand erfaehrt es je".
 *
 * Die Antwort hat zwei Haelften, und die Proben pruefen beide:
 *   DER RIEGEL — in Produktion ohne Versandweg wird hart abgelehnt.
 *   DIE SICHT  — jeder Versuch zaehlt je Zweck und Tag, auch der ignorierte.
 *
 * Run: node --test --test-force-exit test/mailEhrlich.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { versandwegPflicht, startPruefung } from "../services/emailProviderService.js";
import {
  mailNotieren, mailStand, zweckNormalisieren,
  ZWECK_UNBENANNT, ZWECKE_ERWARTET, KeinVersandweg
} from "../services/mailProtokollService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API = path.resolve(__dirname, "..");
const quelle = (rel) => fs.readFileSync(path.join(API, rel), "utf8");

/** Quelltext ohne Kommentare — sonst erfuellt eine Erklaerung die Probe. */
function ohneKommentare(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function musterPool(fn) {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql: String(sql || ""), params: params || [] });
      const r = fn ? await fn(String(sql || ""), params || []) : null;
      return r === undefined || r === null ? { rows: [], rowCount: 0 } : r;
    }
  };
}

/* ── Der Riegel ───────────────────────────────────────────────────────── */

describe("M1.3 · darf ueberhaupt gesendet werden", () => {
  it("ENTWICKLUNG ohne Versandweg: nicht senden, aber auch nicht scheitern", () => {
    const r = versandwegPflicht({}, { produktion: false });
    assert.equal(r.senden, false);
    assert.equal(r.hart, false, "in Entwicklung ist console der Normalzustand");
    assert.equal(r.weg, "console");
  });

  it("PRODUKTION ohne Versandweg: harter Riegel — der ganze Anlass", () => {
    const r = versandwegPflicht({}, { produktion: true });
    assert.equal(r.senden, false);
    assert.equal(r.hart, true, "hier wurde vorher still Erfolg gemeldet");
    assert.match(r.grund, /Versandweg/);
  });

  it("SMTP und SendGrid zaehlen beide als Versandweg", () => {
    const smtp = versandwegPflicht({ SMTP_HOST: "mail.example.de" }, { produktion: true });
    assert.equal(smtp.senden, true);
    assert.equal(smtp.weg, "smtp");
    assert.equal(smtp.hart, false);

    const sg = versandwegPflicht({ SENDGRID_API_KEY: "SG.echterschluessel" }, { produktion: true });
    assert.equal(sg.senden, true);
    assert.equal(sg.weg, "sendgrid");
  });

  it("ein PLATZHALTER ist kein Versandweg", () => {
    /* `.env.example` traegt Platzhalter. Wer sie kopiert und deployt, haette
     * sonst einen "konfigurierten" Versandweg, der nichts versendet — genau
     * die Sorte falsches Gruen, gegen die diese Welle gebaut ist. */
    const r = versandwegPflicht({ SMTP_HOST: "HIER_DEIN_SMTP_HOST" }, { produktion: true });
    assert.equal(r.senden, false);
    assert.equal(r.hart, true);
  });

  it("EMAIL_PROVIDER=smtp ohne Host meldet nicht sendebereit", () => {
    const r = versandwegPflicht({ EMAIL_PROVIDER: "smtp" }, { produktion: true });
    assert.equal(r.senden, false, "ausdruecklich smtp, aber kein Host — das sendet nichts");
    assert.equal(r.hart, true);
  });
});

describe("M1.3 · die Startpruefung", () => {
  it("PRODUKTION ohne eingerichteten Weg: der Prozess kommt nicht hoch", () => {
    const m = startPruefung({}, { produktion: true });
    assert.ok(m, "vorher war das nur eine Warnung, und die war folgenlos");
    assert.match(m, /SMTP_HOST oder SENDGRID_API_KEY/);
    assert.match(m, /EMAIL_PROVIDER=disabled/, "der ehrliche Ausweg muss in der Meldung stehen");
  });

  it("AUSDRUECKLICH abgeschaltet ist eine Entscheidung, kein Versehen", () => {
    assert.equal(startPruefung({ EMAIL_PROVIDER: "disabled" }, { produktion: true }), null);
  });

  it("mit Versandweg und ausserhalb der Produktion: still", () => {
    assert.equal(startPruefung({ SMTP_HOST: "mail.example.de" }, { produktion: true }), null);
    assert.equal(startPruefung({}, { produktion: false }), null);
  });
});

/* ── Der Zweck ────────────────────────────────────────────────────────── */

describe("M1.3 · der Zweck", () => {
  it("wird zu einer Marke, die ein Mensch lesen kann", () => {
    assert.equal(zweckNormalisieren("Worker Einladung!!"), "worker-einladung");
    assert.equal(zweckNormalisieren("  ZAHLUNGSERINNERUNG  "), "zahlungserinnerung");
  });

  it("ohne Angabe faellt er auf den SICHTBAREN Sammelposten", () => {
    /* Nicht auf null oder "": ein Zweck, der nirgends auftaucht, waere genau
     * das Loch, gegen das dieser Dienst gebaut ist. */
    assert.equal(zweckNormalisieren(""), ZWECK_UNBENANNT);
    assert.equal(zweckNormalisieren(null), ZWECK_UNBENANNT);
    assert.equal(zweckNormalisieren("!!!"), ZWECK_UNBENANNT);
  });

  it("wird gekuerzt, nicht verworfen", () => {
    assert.equal(zweckNormalisieren("a".repeat(200)).length, 64);
  });
});

/* ── Die Sicht: schreiben ─────────────────────────────────────────────── */

describe("M1.3 · ein Versandversuch wird festgehalten", () => {
  it("die Bindungen stimmen und der Tag ist deutsch, nicht UTC", async () => {
    const pool = musterPool();
    await mailNotieren(pool, { zweck: "worker-einladung", ergebnis: "zugestellt", weg: "smtp" });
    assert.equal(pool.calls.length, 1);
    const [zweck, tag, ergebnis, weg, fehler] = pool.calls[0].params;
    assert.equal(zweck, "worker-einladung");
    assert.match(tag, /^\d{4}-\d{2}-\d{2}$/, "todayDE liefert einen Kalendertag, keinen Zeitstempel");
    assert.equal(ergebnis, "zugestellt");
    assert.equal(weg, "smtp");
    assert.equal(fehler, null, "ein gelungener Versand traegt keinen Fehler");
  });

  it("die Abfrage schreibt fort statt zu verdoppeln", () => {
    const pool = musterPool();
    return mailNotieren(pool, { zweck: "x", ergebnis: "zugestellt" }).then(() => {
      const sql = pool.calls[0].sql;
      assert.ok(sql.includes("ON CONFLICT (zweck, tag)"), "sonst waechst die Tabelle je Mail");
      assert.ok(sql.includes("mail_versand.versucht + 1"));
      assert.ok(sql.includes("ohne_versandweg = mail_versand.ohne_versandweg + EXCLUDED.ohne_versandweg"));
    });
  });

  it("OHNE VERSANDWEG zaehlt getrennt von FEHLGESCHLAGEN", async () => {
    /* Das eine ist ein Konfigurationsfehler, das andere ein Betriebsvorfall.
     * In einem Topf sind sie nicht zu unterscheiden — und die Antwort darauf
     * ist eine voellig andere. */
    const a = musterPool();
    await mailNotieren(a, { zweck: "x", ergebnis: "ohne_versandweg", fehler: "kein Transport" });
    const b = musterPool();
    await mailNotieren(b, { zweck: "x", ergebnis: "fehlgeschlagen", fehler: "550 abgelehnt" });
    assert.equal(a.calls[0].params[2], "ohne_versandweg");
    assert.equal(b.calls[0].params[2], "fehlgeschlagen");
    assert.equal(a.calls[0].params[4], "kein Transport");
  });

  it("eine ueberlange Fehlermeldung wird gekuerzt, nicht verworfen", async () => {
    const pool = musterPool();
    await mailNotieren(pool, { zweck: "x", ergebnis: "fehlgeschlagen", fehler: "y".repeat(2000) });
    assert.equal(pool.calls[0].params[4].length, 500);
  });

  it("DER SCHREIBER WIRFT NIE — auch nicht ohne Tabelle", async () => {
    const pool = musterPool(() => { throw new Error("relation mail_versand does not exist"); });
    const r = await mailNotieren(pool, { zweck: "x", ergebnis: "zugestellt" });
    assert.equal(r, false, "er meldet den Fehlschlag als Rueckgabe, nicht als Wurf");
  });

  it("ohne Pool wird gar nicht erst geschrieben", async () => {
    assert.equal(await mailNotieren(null, { zweck: "x" }), false);
    assert.equal(await mailNotieren({}, { zweck: "x" }), false);
  });

  it("der letzte Fehler ueberlebt einen spaeteren Erfolg", () => {
    const pool = musterPool();
    return mailNotieren(pool, { zweck: "x", ergebnis: "zugestellt" }).then(() => {
      const sql = pool.calls[0].sql;
      assert.ok(sql.includes("letzter_fehler    = COALESCE(EXCLUDED.letzter_fehler, mail_versand.letzter_fehler)"),
        "sonst waere der Grund genau dann weg, wenn jemand nachsieht");
    });
  });
});

/* ── Die Sicht: lesen ─────────────────────────────────────────────────── */

describe("M1.3 · der Stand geht von der ERWARTUNG aus", () => {
  it("ein Zweck OHNE JEDE ZEILE erscheint trotzdem — und faellt auf", async () => {
    /* Der Kern der Sache. Ein Zweck, zu dem nie gesendet wurde, hat keine
     * Zeile; wer Zeilen zaehlt, zaehlt ihn nicht. Genau so ist die
     * Marktplatz-Automatik ein Jahr lang durchgerutscht. */
    const pool = musterPool(() => ({ rows: [], rowCount: 0 }));
    const stand = await mailStand(pool);
    assert.equal(stand.verfuegbar, true);
    assert.equal(stand.zwecke.length, ZWECKE_ERWARTET.length);
    for (const z of stand.zwecke) {
      assert.equal(z.stumm, true);
      assert.equal(z.auffaellig, true, `${z.zweck} schweigt und muesste auffallen`);
    }
    assert.equal(stand.zusammenfassung.stumm, ZWECKE_ERWARTET.length);
  });

  it("EINE Abfrage, nicht eine je Zweck", async () => {
    const pool = musterPool(() => ({ rows: [], rowCount: 0 }));
    await mailStand(pool);
    assert.equal(pool.calls.length, 1, "sonst waere das ein N+1 auf einer Aufsichtsseite");
  });

  it("ein Zweck, der zustellt, faellt NICHT auf", async () => {
    const pool = musterPool(() => ({
      rows: ZWECKE_ERWARTET.map((zweck) => ({
        zweck, versucht: "5", zugestellt: "5", fehlgeschlagen: "0",
        ohne_versandweg: "0", letzte_um: new Date(), letzter_weg: "smtp", letzter_fehler: null
      }))
    }));
    const stand = await mailStand(pool);
    assert.equal(stand.zwecke.filter((z) => z.auffaellig).length, 0);
    assert.equal(stand.zusammenfassung.zugestellt, 5 * ZWECKE_ERWARTET.length);
  });

  it("EIN Versand ohne Weg genuegt, damit der Zweck auffaellt", async () => {
    const pool = musterPool(() => ({
      rows: [{ zweck: "worker-einladung", versucht: "10", zugestellt: "9",
               fehlgeschlagen: "0", ohne_versandweg: "1",
               letzte_um: new Date(), letzter_weg: "console", letzter_fehler: "kein Transport" }]
    }));
    const stand = await mailStand(pool);
    const e = stand.zwecke.find((z) => z.zweck === "worker-einladung");
    assert.equal(e.auffaellig, true);
    assert.equal(e.ohne_versandweg, 1);
    assert.equal(e.stumm, false, "es wurde gesendet — nur nicht auf einem Weg");
  });

  it("ein unbekannter Zweck aus der Tabelle kommt dazu, statt zu verschwinden", async () => {
    const pool = musterPool(() => ({
      rows: [{ zweck: "unbenannt", versucht: "3", zugestellt: "3", fehlgeschlagen: "0",
               ohne_versandweg: "0", letzte_um: new Date(), letzter_weg: "smtp", letzter_fehler: null }]
    }));
    const stand = await mailStand(pool);
    const u = stand.zwecke.find((z) => z.zweck === "unbenannt");
    assert.ok(u, "der Sammelposten muss sichtbar sein — er ist die Restliste");
    assert.equal(u.erwartet, false);
  });

  it("OHNE TABELLE ist die ehrliche Antwort 'nicht verfuegbar', nicht 'alles gut'", async () => {
    const pool = musterPool(() => { throw new Error("relation mail_versand does not exist"); });
    const stand = await mailStand(pool);
    assert.equal(stand.verfuegbar, false);
    assert.deepEqual(stand.zwecke, []);
  });

  it("das Fenster wird begrenzt, nicht geglaubt", async () => {
    const pool = musterPool(() => ({ rows: [] }));
    assert.equal((await mailStand(pool, { tage: 9999 })).fenster_tage, 90);
    assert.equal((await mailStand(pool, { tage: 0 })).fenster_tage, 7);
    assert.equal((await mailStand(pool, { tage: -5 })).fenster_tage, 7);
  });
});

/* ── Die Verdrahtung ──────────────────────────────────────────────────── */

describe("M1.3 · beide Mailwege benutzen DIESELBE Entscheidung", () => {
  it("app.js fragt den Riegel, statt eigenmaechtig true zu melden", () => {
    const s = ohneKommentare(quelle("app.js"));
    assert.ok(s.includes("versandwegPflicht(config)"), "der Riegel fehlt im ersten Weg");
    assert.ok(s.includes("throw new KeinVersandweg"), "in Produktion muss es scheitern");
    assert.ok(!/if \(!transporter\) \{\s*return true/.test(s),
      "das alte stille 'return true' steht noch");
  });

  it("emailService.js fragt denselben Riegel", () => {
    const s = ohneKommentare(quelle("services/emailService.js"));
    assert.ok(s.includes("versandwegPflicht(config)"), "der Riegel fehlt im zweiten Weg");
    assert.ok(s.includes("throw new KeinVersandweg"));
    assert.ok(!s.includes("accepted: [to], rejected: []"),
      "die erfolgreich aussehende Attrappe steht noch");
  });

  it("die Startpruefung ist ein Fehlerstart, keine Warnung mehr", () => {
    const s = ohneKommentare(quelle("config/index.js"));
    assert.ok(s.includes("mailStartPruefung(config"), "die Pruefung fehlt");
    assert.ok(/if \(mailFehler\) fatal\(mailFehler\)/.test(s),
      "sie muss den Start beenden wie jede andere Pflichtangabe");
    assert.ok(!s.includes("E-Mails werden in Produktion NICHT gesendet!"),
      "die folgenlose Warnung steht noch");
  });

  it("jeder Versandausgang wird protokolliert — auch der Fehlschlag", () => {
    const a = ohneKommentare(quelle("app.js"));
    const b = ohneKommentare(quelle("services/emailService.js"));
    for (const [name, s] of [["app.js", a], ["emailService.js", b]]) {
      assert.ok(s.includes('ergebnis: "zugestellt"'), `${name}: Erfolg wird nicht gezaehlt`);
      assert.ok(s.includes('ergebnis: "fehlgeschlagen"'), `${name}: Fehlschlag wird nicht gezaehlt`);
      assert.ok(s.includes('ergebnis: "ohne_versandweg"'), `${name}: der Nichtversand wird nicht gezaehlt`);
    }
  });
});

describe("M1.3 · die Masseneinladung luegt nicht mehr", () => {
  it("DIE RUECKGABE WIRD GEPRUEFT — der catch allein war toter Code", () => {
    const s = ohneKommentare(quelle("routes/workers.js"));
    assert.ok(/const ok = await deps\.sendMail\(/.test(s),
      "ohne Pruefung der Rueckgabe bleibt `failed` immer leer");
    assert.ok(/if \(ok\) invited\.push/.test(s));
    assert.ok(/else failed\.push/.test(s));
  });

  it("der Versand verlaesst die Anfrage, wenn die Warteschlange da ist", () => {
    const s = ohneKommentare(quelle("routes/workers.js"));
    assert.ok(s.includes("schlange.addBulk("),
      "200 Einladungen duerfen nicht 200 SMTP-Gespraeche in der Anfrage sein");
    assert.ok(s.includes('name: "worker-einladung"'));
    assert.ok(s.includes('zweck: "worker-einladung"'), "sonst zaehlt die Masseneinladung als 'unbenannt'");
  });

  it("faellt die Warteschlange aus, wird direkt gesendet statt still nichts", () => {
    const s = ohneKommentare(quelle("routes/workers.js"));
    assert.ok(/catch \(qErr\)[\s\S]{0,200}queued = 0;/.test(s),
      "ohne Rueckfall waere eine unerreichbare Warteschlange ein stiller Totalausfall");
    assert.ok(/if \(!queued\) \{/.test(s), "der direkte Weg muss danach greifen");
  });

  it("die Antwort trennt EINGEREIHT von ZUGESTELLT", () => {
    const s = ohneKommentare(quelle("routes/workers.js"));
    assert.ok(s.includes("queued_count: queued"));
    assert.ok(s.includes('versandweg: queued ? "queue" : "direkt"'));
  });

  it("die EINZELNE Einladung meldet so ehrlich wie die SMS daneben", () => {
    const s = ohneKommentare(quelle("routes/workers.js"));
    assert.ok(s.includes("mail: { sent: mailErgebnis.sent, reason: mailErgebnis.reason }"),
      "die Antwort trug sms.sent, aber nichts ueber den verlaesslichen Kanal");
    assert.ok(s.includes("mail_sent: mailErgebnis.sent === true"), "und das Audit ebenso");
  });

  it("der Arbeiter reicht den Zweck durch", () => {
    const s = ohneKommentare(quelle("workers/emailWorker.js"));
    assert.ok(/sendMail\(\{ to, subject, html, text, zweck \}\)/.test(s),
      "sonst faellt gerade die Masseneinladung in den Sammelposten");
  });
});

describe("M1.3 · der Fehler traegt seine Bedeutung", () => {
  it("503 und nicht 500 — die Anfrage war richtig, der Dienst ist es nicht", () => {
    const e = new KeinVersandweg("kein Weg");
    assert.equal(e.status, 503);
    assert.equal(e.code, "MAIL_NO_TRANSPORT");
    assert.ok(e instanceof Error);
  });

  it("die Migration legt eine Zeile je Zweck und Tag an, kein Mailprotokoll", () => {
    const roh = fs.readFileSync(
      path.join(API, "..", "sql", "migrations", "213_mail_versand.sql"), "utf8");
    /* Kommentare RAUS, bevor gesucht wird. Beim ersten Anlauf schlug diese
     * Probe an — an der eigenen Begruendung, in der das Wort "Empfaenger"
     * steht. Dieselbe Falle wie bei den Waechtern in M1.1: eine Erklaerung
     * erfuellt die Bedingung, und die Probe prueft die Prosa statt die DDL. */
    const sql = roh.replace(/--.*$/gm, "");
    assert.match(sql, /PRIMARY KEY \(zweck, tag\)/,
      "eine Zeile je Mail waechst unbegrenzt und traegt Personenbezug");

    /*
     * Geprueft wird die SPALTENLISTE, nicht die Datei.
     *
     * Zwei Anlaeufe daneben, und beide lehrreich: erst schlug die Probe an der
     * eigenen `--`-Begruendung an, dann am Wort "Empfaengeradresse" in einem
     * `COMMENT ON`-Text — also in echtem SQL, das kein Strippen von Kommentaren
     * entfernt. Eine Probe, die Prosa liest, prueft Prosa. Der Anspruch lautet
     * "es gibt keine Adress-SPALTE", also wird genau das gelesen.
     */
    const tabelle = sql.slice(
      sql.indexOf("CREATE TABLE IF NOT EXISTS mail_versand"),
      sql.indexOf("CREATE INDEX")
    );
    assert.ok(tabelle.length > 200, "der CREATE-TABLE-Block wurde nicht gefunden");
    const spalten = [...tabelle.matchAll(/^\s{2}([a-z_]+)\s+(TEXT|DATE|BIGINT|TIMESTAMPTZ)/gm)]
      .map((m) => m[1]);
    assert.ok(spalten.length >= 8, `nur ${spalten.length} Spalten erkannt — Muster defekt`);
    assert.ok(spalten.includes("zweck") && spalten.includes("ohne_versandweg"),
      "Selbstprobe: die erwarteten Spalten fehlen, das Muster liest daneben");
    for (const s of spalten) {
      assert.ok(!/empfaenger|recipient|email|adresse|betreff|subject/.test(s),
        `Spalte "${s}" traegt Personenbezug — damit entstuende eine Loeschpflicht`);
    }
    assert.match(sql, /ohne_versandweg/);
    assert.match(roh, /-- ROLLBACK/, "der Rueckbauweg steht im Kommentar");
  });
});
