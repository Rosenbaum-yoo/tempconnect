/**
 * Die Wiedervorlage fuer nicht angenommene Einladungen (M3.5, 2026-09-04).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WAS HIER BEWACHT WIRD
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Eine Einladung, die niemand annimmt, verfaellt nach sieben Tagen — still. Der
 * Mensch hat die Mail vielleicht uebersehen, die Zeitarbeitsfirma erfaehrt es
 * nicht, und der Einsatz beginnt ohne Portalkonto.
 *
 * DIE ENTSCHEIDUNG, DIE DIESEN LAUF UNGEFAEHRLICH MACHT: erinnert wird, was in
 * den naechsten 48 Stunden ABLAEUFT — nicht, was alt ist. Der naheliegende Bau
 * ("erinnere alles aelter als N Tage") hat zwei Fehler:
 *
 *   1. Er nennt dem Menschen keinen Grund, JETZT zu handeln.
 *   2. Er erzeugt beim ersten Lauf in einer bestehenden Installation einen
 *      Schwall — jede vergessene Einladung der letzten Monate auf einmal.
 *
 * An die Frist gebunden begrenzt er sich von selbst: aeltere Einladungen sind
 * bereits abgelaufen und fallen aus der Menge.
 *
 * Abnahme aus dem Plan (M3.5): **Rueckmutation: Erinnerung entfernen → Probe
 * rot.**
 *
 * Run: node --test --test-force-exit test/einladungWiedervorlage.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  sendeEinladungsErinnerungen,
  EINLADUNG_ERINNERUNG_VORLAUF_STUNDEN,
  EINLADUNG_ERINNERUNG_MAX
} from "../services/workerService.js";

/* ── Vorrichtung ─────────────────────────────────────────────────────── */

/** Ein Zugang, der jede Abfrage mitschreibt und die Auswahl fest liefert. */
function musterPool(einladungen = []) {
  const abfragen = [];
  return {
    abfragen,
    query: async (sql, params) => {
      abfragen.push({ sql: String(sql), params: params || [] });
      if (/FROM\s+worker_invites/i.test(String(sql))) {
        return { rows: einladungen, rowCount: einladungen.length };
      }
      return { rows: [], rowCount: 0 };
    }
  };
}

function einladung(over = {}) {
  return {
    id: "inv-1", email: "wer@da.de", first_name: "Mara",
    token: "tok-1", expires_at: new Date("2026-09-06T10:00:00Z"),
    org_name: "Zeitkraft GmbH",
    ...over
  };
}

/** Sammelt die Mails; wirft auf Wunsch bei einer bestimmten Adresse. */
function mailer(scheiternBei = null) {
  const mails = [];
  const fn = async (to, betreff, html, opts) => {
    if (scheiternBei && to === scheiternBei) throw new Error("Zustellung gescheitert");
    mails.push({ to, betreff, html, opts });
    return true;
  };
  fn.mails = mails;
  return fn;
}

/* ── 1. Die Auswahl ──────────────────────────────────────────────────── */

describe("M3.5 · wen die Wiedervorlage ueberhaupt anfasst", () => {
  it("die Abfrage bindet sich an die FRIST, nicht an das Alter", async () => {
    const pool = musterPool([]);
    await sendeEinladungsErinnerungen(pool, { sendMail: mailer() });

    const { sql, params } = pool.abfragen[0];
    /* Form-Probe je Bestandteil — der Muster-Pool fuehrt die Abfrage nie aus,
       also muss ihr Vertrag hier stehen. */
    assert.match(sql, /wi\.status = 'pending'/, "auch angenommene/widerrufene wuerden erinnert");
    assert.match(sql, /wi\.accepted_at IS NULL/, "wer schon angenommen hat, bekaeme Post");
    assert.match(sql, /wi\.expires_at > NOW\(\)/,
      "bereits abgelaufene Einladungen wuerden erinnert — der Link waere tot");
    assert.match(sql, /wi\.expires_at <= NOW\(\) \+ \(\$1 \|\| ' hours'\)::interval/,
      "die Bindung an die Frist fehlt — daraus wuerde 'alles Offene auf einmal'");
    assert.match(sql, /wi\.resend_count = 0/,
      "ohne diese Bedingung erinnert der Lauf jeden Tag erneut");

    /* Bindungs-Probe: die Form allein filtert nichts. */
    assert.equal(params[0], String(EINLADUNG_ERINNERUNG_VORLAUF_STUNDEN));
    assert.equal(params[1], EINLADUNG_ERINNERUNG_MAX);
  });

  it("der Vorlauf ist 48 Stunden und die Menge gedeckelt", () => {
    assert.equal(EINLADUNG_ERINNERUNG_VORLAUF_STUNDEN, 48);
    assert.ok(EINLADUNG_ERINNERUNG_MAX > 0 && EINLADUNG_ERINNERUNG_MAX <= 500,
      "die Obergrenze ist keine — ein Lauf koennte unbegrenzt Mails erzeugen");
  });

  it("ein eigener Vorlauf wird uebernommen, ein unsinniger nicht", async () => {
    const pool = musterPool([]);
    await sendeEinladungsErinnerungen(pool, { sendMail: mailer(), vorlaufStunden: 12 });
    assert.equal(pool.abfragen[0].params[0], "12");

    for (const unsinn of [0, -5, "abc", null]) {
      const p = musterPool([]);
      await sendeEinladungsErinnerungen(p, { sendMail: mailer(), vorlaufStunden: unsinn });
      assert.equal(p.abfragen[0].params[0], String(EINLADUNG_ERINNERUNG_VORLAUF_STUNDEN),
        `Vorlauf ${JSON.stringify(unsinn)} haette den Standard ueberschreiben duerfen`);
    }
  });

  it("die Organisation wird mitgelesen — die Mail nennt sie", async () => {
    const pool = musterPool([]);
    await sendeEinladungsErinnerungen(pool, { sendMail: mailer() });
    assert.match(pool.abfragen[0].sql, /JOIN organizations o ON o\.id = wi\.supplier_org_id/,
      "ohne den Namen der Firma steht in der Mail 'Ihre Zeitarbeitsfirma' — richtig "
      + "als Rueckfall, falsch als Normalfall");
  });
});

/* ── 2. Der Versand ──────────────────────────────────────────────────── */

describe("M3.5 · was hinausgeht und was danach dasteht", () => {
  it("die Mail nennt Frist, Firma und den Weg hinein", async () => {
    const pool = musterPool([einladung()]);
    const send = mailer();
    const ergebnis = await sendeEinladungsErinnerungen(pool, {
      sendMail: send, baseUrl: "https://tempconnect.example"
    });

    assert.equal(ergebnis.erinnert, 1);
    assert.equal(send.mails.length, 1);
    const m = send.mails[0];
    assert.equal(m.to, "wer@da.de");
    assert.match(m.html, /Zeitkraft GmbH/, "die einladende Firma fehlt");
    assert.match(m.html, /06\.09\.2026/, "das Ablaufdatum fehlt — der Grund zu handeln");
    assert.match(m.html, /worker-login\.html\?invite=tok-1/,
      "der Weg ins Portal fehlt oder traegt den falschen Token");
    assert.equal(m.opts?.zweck, "worker-einladung-erinnerung",
      "ohne Zweck zaehlt die Mail im Versandprotokoll unter 'unbenannt'");
  });

  it("markiert wird ERST NACH dem Versand", async () => {
    /*
     * Andersherum waere eine gescheiterte Mail als erinnert gezaehlt — und weil
     * `resend_count` zugleich die Sperre gegen eine zweite Erinnerung ist,
     * bekaeme der Mensch NIE wieder eine. Ein stiller Totalausfall fuer genau
     * die Faelle, in denen der Versand klemmt.
     */
    const pool = musterPool([einladung()]);
    await sendeEinladungsErinnerungen(pool, { sendMail: mailer() });

    const update = pool.abfragen.find((a) => /UPDATE worker_invites/i.test(a.sql));
    assert.ok(update, "es wurde gar nicht markiert — der Lauf erinnert morgen erneut");
    assert.match(update.sql, /resend_count = resend_count \+ 1/);
    assert.match(update.sql, /WHERE id = \$1 AND resend_count = 0/,
      "ohne die Bedingung im WHERE koennten zwei gleichzeitige Laeufe doppelt zaehlen");
    assert.deepEqual(update.params, ["inv-1"]);
  });

  it("eine gescheiterte Mail wird NICHT markiert", async () => {
    const pool = musterPool([einladung()]);
    const ergebnis = await sendeEinladungsErinnerungen(pool, {
      sendMail: mailer("wer@da.de"), logger: { warn() {} }
    });

    assert.equal(ergebnis.erinnert, 0);
    assert.equal(ergebnis.fehlgeschlagen, 1);
    assert.equal(pool.abfragen.filter((a) => /UPDATE worker_invites/i.test(a.sql)).length, 0,
      "eine gescheiterte Erinnerung wurde als erledigt markiert — der Mensch bekaeme "
      + "nie wieder eine");
  });

  it("ein Fehlschlag stoppt die uebrigen nicht", async () => {
    const pool = musterPool([
      einladung({ id: "inv-1", email: "kaputt@da.de" }),
      einladung({ id: "inv-2", email: "geht@da.de" })
    ]);
    const ergebnis = await sendeEinladungsErinnerungen(pool, {
      sendMail: mailer("kaputt@da.de"), logger: { warn() {} }
    });
    assert.equal(ergebnis.geprueft, 2);
    assert.equal(ergebnis.erinnert, 1, "der zweite Mensch wurde uebersprungen");
    assert.equal(ergebnis.fehlgeschlagen, 1);
  });

  it("ohne Versandweg wird NICHTS markiert und nichts behauptet", async () => {
    /* Dieselbe Entscheidung wie im Mahnlauf (M1.9): eine Erinnerung, die als
     * verschickt gilt, ohne es zu sein, waere schlimmer als keine — sie kommt
     * nie wieder. */
    const pool = musterPool([einladung()]);
    const ergebnis = await sendeEinladungsErinnerungen(pool, {});

    assert.equal(ergebnis.note, "NO_MAILER");
    assert.equal(ergebnis.erinnert, 0);
    assert.equal(pool.abfragen.length, 0,
      "es wurde abgefragt, obwohl gar nichts versendet werden konnte");
  });

  it("die Frist wird NICHT verlaengert und kein neuer Token gezogen", async () => {
    /*
     * `resendInvite` (die Handlung eines Menschen) erneuert beides — dort
     * richtig. Hier waere es falsch: eine Automatik, die Fristen verlaengert,
     * schafft die Frist ab, und dann laeuft nie eine Einladung aus.
     */
    const pool = musterPool([einladung()]);
    await sendeEinladungsErinnerungen(pool, { sendMail: mailer() });
    const update = pool.abfragen.find((a) => /UPDATE worker_invites/i.test(a.sql));
    assert.ok(!/expires_at\s*=/.test(update.sql), "die Frist wurde verlaengert");
    assert.ok(!/token\s*=/.test(update.sql), "es wurde ein neuer Token gezogen");
  });
});

/* ── 3. Der Takt ─────────────────────────────────────────────────────── */

describe("M3.5 · der Lauf haengt in der Takt-Maschinerie", () => {
  it("er wirft, wenn ihm der Versandweg fehlt", async () => {
    /*
     * `sendeEinladungsErinnerungen` gibt ohne Mailer brav `NO_MAILER` zurueck.
     * Fuer den TAKT waere das ein gelungener Lauf: Job `completed`, Herzschlag
     * gruen, Kachel "laeuft" — und keine einzige Erinnerung geht hinaus.
     * Dieselbe Lehre wie beim Mahnlauf in M1.9.
     */
    const { einladungErinnerung } = await import("../services/betriebsTaktLaeufe.js");
    await assert.rejects(
      () => einladungErinnerung({ query: async () => ({ rows: [] }) }, { config: {} }),
      /kein.*Versandweg|Versandweg/i,
      "ein Erinnerungslauf ohne Versandweg muss scheitern, nicht gruen durchlaufen");
  });

  it("Soll, Ausloesung und Verarbeitung nennen denselben Namen", async () => {
    /* Das Dreieck aus M1.9. Weicht ein Name ab, wirft der Arbeiter jede Nacht
       "Unbekannter Betriebstakt" — oder der Lauf ist gebaut und stumm. */
    const { TAKTE } = await import("../services/betriebsTaktService.js");
    const { LAEUFE } = await import("../services/betriebsTaktLaeufe.js");
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const HIER = path.dirname(fileURLToPath(import.meta.url));
    const worker = fs.readFileSync(path.join(HIER, "..", "workers", "index.js"), "utf8");

    assert.ok(TAKTE["einladung-erinnerung"], "kein Soll in der Registratur");
    assert.equal(typeof LAEUFE["einladung-erinnerung"], "function", "kein Lauf");
    assert.match(worker, /\{ name: "einladung-erinnerung" \}/, "keine Einplanung");
  });

  it("er laeuft morgens, nicht mitten in der Nacht", async () => {
    /* Eine Erinnerung, die um 02:40 ankommt, wird zwischen der Nachtpost
       uebersehen. Das ist kein Schoenheitsargument: der Lauf hat genau EINEN
       Versuch je Einladung. */
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const HIER = path.dirname(fileURLToPath(import.meta.url));
    const worker = fs.readFileSync(path.join(HIER, "..", "workers", "index.js"), "utf8");
    const m = /upsertJobScheduler\("einladung-erinnerung-daily", \{ pattern: "([^"]+)" \}/.exec(worker);
    assert.ok(m, "die Einplanung wurde nicht gefunden");
    const stunde = Number(m[1].split(" ")[1]);
    assert.ok(stunde >= 7 && stunde <= 18,
      `der Takt laeuft um ${stunde} Uhr — eine Erinnerung gehoert in den Tag`);
  });
});
