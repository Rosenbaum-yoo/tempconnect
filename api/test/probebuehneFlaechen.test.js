/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DREI GETRENNTE FLÄCHEN, EIN KONTO (Y4.1)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Gemessen am 2026-10-02 gegen die laufende Datenbank:
 *
 *   tempconnect_staff    1 Zeile    dennisstegemann04@gmail.com
 *   occ_owner_access     1 Zeile    dennisstegemann04@gmail.com
 *   support_agents       2 Zeilen   dennisstegemann04@gmail.com + demo@firma.de
 *
 * Das ist nicht „wenig Daten", das ist EIN KONTO mit allen drei Zugängen. Der
 * Plan verlangt wörtlich: „Die drei Flächen sind EINZELN durchspielbar."
 * Einzeln heißt, dass ein Zugang eine Fläche zeigt UND durch sein Scheitern
 * beweist, dass die beiden anderen zu sind. Mit einem Konto, das alle drei
 * hält, ist genau dieser Beweis nicht führbar.
 *
 * Und der schärfere Befund daneben: `api/config/staffRollen.js` trennt SECHS
 * Staff-Rollen scharf — besetzt war davon EINE (`staff_member`). Fünf
 * dokumentierte, indizierte, von `darfStaffBereich()` ausgewertete
 * Einschränkungen hatte nie jemand getragen. Dieselbe Fehlerklasse wie die
 * zwölf unbesetzten Zustände aus Y1.3.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WARUM DIESER WÄCHTER AN DEN CODE GEBUNDEN IST UND NICHT AN EINE ABSCHRIFT
 * ───────────────────────────────────────────────────────────────────────────
 *
 * `STAFF_ROLLEN` wird aus `api/config/staffRollen.js` IMPORTIERT. Eine Liste
 * von sechs Zeichenketten hier im Test wäre eine Kopie, und eine Kopie geht
 * beim siebten Wert auseinander, ohne dass etwas rot wird. So fällt die Probe
 * rot, sobald der Code eine Rolle hinzufügt oder entfernt — und das ist der
 * einzige Zeitpunkt, an dem jemand die Bühne nachziehen kann.
 *
 * Run: node --test --test-force-exit test/probebuehneFlaechen.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { STAFF_ROLLEN } from "../config/staffRollen.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* Aufwaerts suchen statt Ebenen raten — Stryker laeuft in einem Sandkasten. */
function findeWurzel(relPfad) {
  for (const start of [process.cwd(), __dirname]) {
    let dir = path.resolve(start);
    for (let i = 0; i < 8; i++) {
      if (fs.existsSync(path.join(dir, relPfad))) return dir;
      const eltern = path.dirname(dir);
      if (eltern === dir) break;
      dir = eltern;
    }
  }
  return null;
}

const SAAT_REL = path.join("sql", "seeds", "y4-flaechen.sql");
const ROOT = findeWurzel(SAAT_REL);
const suite = ROOT ? describe : describe.skip;

const SAAT = ROOT ? fs.readFileSync(path.join(ROOT, SAAT_REL), "utf8") : "";

/* Kommentare ausblenden. Diese Saat BESCHREIBT ihre Befunde ausfuehrlich — sie
 * nennt `staff_audit`, `full_internal` und `owner` im Fliesstext. Eine Probe,
 * die im ganzen Text sucht, liest die Begruendung und haelt sie fuer die
 * Anweisung. Das ist in dieser Welle fuenfmal passiert.
 *
 * ZUM SECHSTEN MAL am 2026-10-02, und diesmal fehlte die halbe Sorte: hier wurde
 * nur die ZEILEN-Sorte entfernt (die mit den zwei Bindestrichen). Die Saat trug
 * bis dahin keinen
 * BLOCK-Kommentar; mit Owner-Punkt 15 kam einer dazu, der die Datenreichweite
 * des externen Agenten begruendet und dabei `'vendor_scoped'` zitiert. Eine
 * Rueckmutation, die den Wert aus der ANWEISUNG nahm, blieb deshalb gruen — die
 * Probe las die Begruendung. Gemessen: `sup` war 2643 statt 1592 Zeichen lang,
 * weil der Block-Kommentar mitlief.
 *
 * Beide Sorten werden jetzt entfernt, und in dieser Reihenfolge: zuerst die
 * Bloecke, dann die Zeilen. Umgekehrt koennte ein `--` innerhalb eines Blocks
 * dessen Ende verschlucken. */
const OHNE_KOMMENTAR = SAAT
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/--[^\n]*/g, " ");

/* Und die Notbremse am Ende ist ebenfalls kein Datenteil: sie nennt alle drei
 * Tabellen und alle sechs Rollen, weil sie sie PRUEFT. Wer sie mitliest,
 * bekommt jede Zusicherung geschenkt. */
const DATENTEIL = (() => {
  const i = OHNE_KOMMENTAR.indexOf("DO $vollstaendig$");
  return i > 0 ? OHNE_KOMMENTAR.slice(0, i) : OHNE_KOMMENTAR;
})();

const BREMSEN = (() => {
  const i = OHNE_KOMMENTAR.indexOf("DO $vollstaendig$");
  return i > 0 ? OHNE_KOMMENTAR.slice(i) : "";
})();

/** Der Einfuege-Block einer Tabelle, bis zum abschliessenden Semikolon. */
function block(tabelle) {
  const m = DATENTEIL.match(new RegExp("INSERT\\s+INTO\\s+" + tabelle + "\\b[\\s\\S]*?;", "i"));
  return m ? m[0] : "";
}

const KENNUNG = "bd000000-0000-4000-8000-00000000f0";
const NUMMERN = ["01", "02", "03", "04", "05", "06", "07", "08", "09"];

suite("Y4.1 — drei Flaechen, je ein Zugang, und keiner haelt zwei", () => {

  it("die Saat ist da und wird wirklich gelesen", () => {
    /* Ohne diese Zusicherung ist jede folgende still gruen, sobald die Datei
     * umzieht. */
    assert.ok(SAAT.length > 4000, `Saat zu kurz (${SAAT.length} Zeichen) — wird sie noch gelesen?`);
    assert.ok(block("users").length > 300, "der users-Block fehlt");
    assert.ok(block("tempconnect_staff").length > 300, "der Staff-Block fehlt");
    assert.ok(block("support_agents").length > 200, "der Support-Block fehlt");
    assert.ok(block("occ_owner_access").length > 100, "der Owner-Block fehlt");
  });

  it("jede der sechs Staff-Rollen aus staffRollen.js ist besetzt — und keine erfundene", () => {
    const staff = block("tempconnect_staff");
    const fehlend = STAFF_ROLLEN.filter((r) => !staff.includes("'" + r + "'"));
    assert.deepEqual(fehlend, [],
      "Diese Staff-Rollen haben auf der Buehne kein Konto: " + fehlend.join(", ")
      + ". Eine Einschraenkung, die nie jemand getragen hat, ist eine Behauptung — "
      + "genau der Befund, den Y4.1 schliesst (gemessen: 1 von 6 besetzt).");

    /* Die Gegenrichtung, und sie ist die wichtigere: `tempconnect_staff.role`
     * hat KEINEN CHECK. Postgres nimmt jede Zeichenkette an; `darfStaffBereich`
     * weist sie dann mit ROLLE_UNBEKANNT ab. Ein Tippfehler in der Saat erzeugt
     * also ein Konto, das sich anmelden kann und danach nichts darf — und nichts
     * in der Datenbank sagt einem das. */
    const vergeben = [...staff.matchAll(/'(staff_[a-z_]+)'/g)].map((m) => m[1]);
    const erfunden = vergeben.filter((r) => !STAFF_ROLLEN.includes(r));
    assert.deepEqual(erfunden, [],
      "Diese Rollen stehen in der Saat, kennt der Code aber nicht: " + erfunden.join(", ")
      + ". Die Spalte hat keinen CHECK — Postgres nimmt den Wert an, "
      + "darfStaffBereich() weist ihn mit ROLLE_UNBEKANNT ab.");
    assert.ok(vergeben.length >= STAFF_ROLLEN.length,
      `nur ${vergeben.length} Rollen vergeben, der Code kennt ${STAFF_ROLLEN.length}`);
  });

  it("jedes Konto haelt GENAU EINE Flaeche — die Kernzusage von Y4.1", () => {
    /* Textlich gepruefte Disjunktheit: die Nummer eines Kontos darf in genau
     * einem der drei Zuteilungs-Bloecke auftauchen. Taucht sie in zwei auf, ist
     * der heutige Zustand wiederhergestellt — ein Konto, das zwei Welten haelt,
     * und damit kein Beweis mehr, dass die dritte zu ist. */
    const bloecke = {
      "Staff CC": block("tempconnect_staff"),
      "Support Center": block("support_agents"),
      "Owner Control Center": block("occ_owner_access")
    };
    const mehrfach = [];
    const ohne = [];
    for (const nr of NUMMERN) {
      const treffer = Object.entries(bloecke)
        .filter(([, b]) => new RegExp("\\('" + nr + "',").test(b) || b.includes(KENNUNG + nr + "'"))
        .map(([name]) => name);
      if (treffer.length > 1) mehrfach.push(`${nr} -> ${treffer.join(" + ")}`);
      if (treffer.length === 0) ohne.push(nr);
    }
    assert.deepEqual(mehrfach, [],
      "Diese Buehnen-Konten halten mehr als eine Flaeche: " + mehrfach.join(", ")
      + ". Genau das ist der Zustand, den der heutige Bestand hat "
      + "(dennisstegemann04@gmail.com haelt alle drei) und den Y4.1 aufloest.");
    assert.deepEqual(ohne, [],
      "Diese Buehnen-Konten halten keine Flaeche: " + ohne.join(", ")
      + " — ein Kundenkonto ohne Organisation, das aussieht wie Buehne.");
  });

  it("keines der internen Konten ist Kunde", () => {
    /* Das ist die DATENSEITE von Y4.2. Der vorhandene Waechter
     * (staffNieAusDerPlattform.test.js) prueft LINKS: kein Weg von der
     * Kundenplattform in eine interne Flaeche. Er kann nicht sehen, dass ein
     * KONTO in beiden Welten sitzt. Gemessen: demo@firma.de ist
     * `users.role = 'company'` mit einer Org-Mitgliedschaft UND externer
     * Support-Agent. Die Buehne macht diesen Fehler nicht nach. */
    const nutzer = block("users");
    assert.ok(/NULL,\s*\n\s*TRUE/.test(nutzer) || /\bNULL\b/.test(nutzer),
      "der users-Block setzt kein org_id = NULL");
    assert.match(nutzer, /org_id\s*=\s*NULL/,
      "der ON-CONFLICT-Zweig setzt org_id nicht auf NULL — der zweite Lauf koennte "
      + "ein internes Konto an eine Organisation haengen, die jemand von Hand gesetzt hat");
    assert.ok(!/INSERT\s+INTO\s+org_memberships/i.test(DATENTEIL),
      "diese Saat legt eine Org-Mitgliedschaft an. Ein interner Zugang gehoert nicht "
      + "an ein Kundenkonto — siehe demo@firma.de.");
    assert.ok(!/customer_stage/i.test(DATENTEIL),
      "diese Saat setzt customer_stage. Interne Konten haben keine Kundenphase.");
  });

  it("jeder Staff-Zugang laeuft ab, relativ und ohne festes Datum", () => {
    /* DIE SICHERHEITSEIGENSCHAFT DIESER SAAT. Eine Saat, die Staff-Zugaenge
     * anlegt, ist gefaehrlicher als eine, die Rechnungen anlegt. `expires_at`
     * ist der Unterschied zwischen einer Buehne und einer Hintertuer: die
     * Middleware prueft die Spalte seit 2026-08-22 in BEIDEN Toren (Anmeldung
     * und Zugriff), im WHERE. Ein vergessener Buehnen-Zugang wird damit von
     * selbst wertlos. */
    const staff = block("tempconnect_staff");
    assert.match(staff, /NOW\(\)\s*\+\s*INTERVAL\s*'\d+\s*days'/i,
      "kein relatives Ablaufdatum im Staff-Block — ohne expires_at ist ein "
      + "Buehnen-Zugang unbefristet, und die Middleware prueft die Spalte wirklich");
    assert.ok(!/expires_at\s*=\s*NULL/i.test(staff),
      "der ON-CONFLICT-Zweig setzt expires_at auf NULL und hebt den Ablauf beim "
      + "zweiten Lauf auf — genau die Luecke, die der Bootstrap-Zweig in "
      + "staffControlAccess.js ausdruecklich vermeidet");
    assert.match(staff, /expires_at\s*=\s*EXCLUDED\.expires_at/i,
      "der zweite Lauf verlaengert den Ablauf nicht — dann stirbt die Buehne "
      + "nach 180 Tagen, ohne dass das erneute Laden sie wiederbelebt");
    const feste = OHNE_KOMMENTAR.match(/'20\d\d-\d\d-\d\d/g) || [];
    assert.deepEqual(feste, [],
      "feste Daten in der Saat (Y6.2 verlangt relative): " + feste.join(", "));
  });

  it("der Step-up bleibt scharf — auch beim zweiten Lauf", () => {
    /* Die Owner-Zeile hat `requires_step_up = FALSE`: das eine Konto, das im
     * Staff CC alles darf, bestaetigt vor einer schreibenden Aktion nichts
     * erneut. Die Buehne erbt das nicht. Und das kostet sie nichts — der
     * Step-up ist eine PASSWORT-Wiedereingabe (bcrypt gegen
     * users.password_hash), kein TOTP. Ein TOTP-Geheimnis duerfte in keiner
     * Saat stehen; damit waere die Flaeche nur halb durchspielbar. */
    const staff = block("tempconnect_staff");
    assert.ok(!/requires_step_up\s*=\s*FALSE/i.test(staff),
      "die Saat schaltet den Step-up ab. Er kostet die Buehne nichts: er ist eine "
      + "Passwort-Wiedereingabe, kein TOTP.");
    const zuweisungen = (staff.match(/requires_step_up\s*=\s*TRUE/gi) || []).length;
    assert.ok(zuweisungen >= 1,
      "der ON-CONFLICT-Zweig setzt requires_step_up nicht auf TRUE — ein zweiter "
      + "Lauf koennte eine von Hand abgeschaltete Pflicht nicht zuruecksetzen");

    /* UND DAS IST DIE EIGENTLICHE SICHERUNG — gefunden durch eine
     * Rueckmutation, die NICHT rot wurde. Die beiden Pruefungen oben lesen eine
     * ZUWEISUNG (`requires_step_up = ...`), und die steht nur im
     * ON-CONFLICT-Zweig. In der SELECT-Liste steht der Wert OHNE Spaltennamen,
     * als nacktes `TRUE` an vierter Position. Wer es dort auf `FALSE` setzt,
     * legt sechs Staff-Zugaenge ohne Wiederbestaetigung an — und keine
     * Textprobe sieht es, weil an einer Position kein Name steht.
     *
     * Dagegen hilft keine schaerfere Zeichenkette, sondern die Notbremse der
     * Saat: sie fragt die DATENBANK nach `requires_step_up IS NOT TRUE` und
     * bricht den Lauf ab, bevor er committet. Diese Probe haelt also nicht den
     * Wert, sondern den WAECHTER des Wertes — und der sieht jede Position. */
    assert.match(BREMSEN, /requires_step_up IS NOT TRUE/,
      "die Notbremse prueft den Step-up nicht. Eine Textprobe kann ihn nicht halten: "
      + "in der SELECT-Liste steht der Wert als nacktes TRUE an einer Position, ohne "
      + "Spaltennamen. Nur die Abfrage gegen die Datenbank sieht ihn dort.");
  });

  it("zwei Support-Zugaenge mit VERSCHIEDENER Datenreichweite", () => {
    /* `data_scope` ist die eigentliche Zusage des Support Centers. Mit EINEM
     * Zugang ist nicht pruefbar, ob die Verengung verengt — man sieht eine
     * Liste und hat keinen Vergleich. */
    const sup = block("support_agents");

    /* DIE PAAR-PRUEFUNG STEHT ZUERST, und das ist keine Stilfrage. Sie stand
     * unter den beiden Anwesenheits-Pruefungen darunter — und war damit
     * UNERREICHBAR: jede Mutation, die zwei gleiche Reichweiten erzeugt, nimmt
     * zwangslaeufig eine der beiden Zeichenketten weg, also schlaegt die
     * Anwesenheit zuerst an und die Paar-Pruefung kommt nie dran. Eine
     * Zusicherung, die man nicht rot machen kann, ist Deko. Gefunden von der
     * Rueckmutation, nicht beim Schreiben. */
    const paare = [...sup.matchAll(/\('(\d\d)',\s*'([a-z_]+)',\s*'([a-z_]+)'\)/g)]
      .map((m) => ({ nr: m[1], rolle: m[2], reichweite: m[3] }));
    assert.equal(paare.length, 2, `${paare.length} Support-Zuteilungen gefunden, erwartet 2`);
    assert.notEqual(paare[0].nr, paare[1].nr, "beide Support-Zugaenge haengen am selben Konto");
    assert.notEqual(paare[0].reichweite, paare[1].reichweite,
      "beide Support-Zugaenge haben dieselbe Datenreichweite — dann beweist der Vergleich nichts");

    /* Und erst danach: dass es die beiden Reichweiten sind, die der CHECK der
     * Tabelle kennt. Sonst waeren zwei frei erfundene Werte „verschieden". */
    assert.ok(sup.includes("'full_internal'"), "die weite Reichweite fehlt");
    assert.ok(sup.includes("'assigned_only'"), "die enge Reichweite fehlt");

    /* ─────────────────────────────────────────────────────────────────────────
     * DIESE ZUSICHERUNG HAT DIE RICHTUNG GEWECHSELT (Owner-Punkt 15, 2026-10-02)
     * ─────────────────────────────────────────────────────────────────────────
     *
     * Hier stand: `assert.ok(!/'external'/.test(sup), "die Buehne legt einen
     * EXTERNEN Support-Zugang an — der haengt an support_vendors und an dessen
     * Verifizierung")`. Das war richtig, solange der externe Weg einen Halter
     * hatte. Er hatte einen: `demo@firma.de` — ein KUNDENKONTO. Punkt 15 nimmt
     * ihm den Zugang (Migration 232), und damit blieben GEMESSEN null aktive
     * externe Agenten. Eine Buehne, die den externen Weg auslaesst, haette danach
     * eine Luecke statt einer Besetzung.
     *
     * Die alte Begruendung war aber kein Vorwand, sondern eine echte Warnung, und
     * sie wird hier BEANTWORTET statt umgangen. Gemessen an
     * `api/middleware/supportAccess.js` (Zeilen 289-303) verlangt das Tor fuer
     * `scope = 'external'` drei Dinge, und `support_vendors.status` hat die
     * VORGABE `'pending'`: ein Lieferant, den man nur anlegt, ist unverifiziert,
     * der Agent bekommt 403 VENDOR_NOT_VERIFIED, und die Saat waere ein Eintrag
     * in einer Tabelle statt eines durchspielbaren Wegs.
     * ───────────────────────────────────────────────────────────────────────── */
    /* ─────────────────────────────────────────────────────────────────────
     * DER GEGENSTAND WIRD HERAUSGESCHNITTEN, NICHT IN EINEM FENSTER GESUCHT.
     * ─────────────────────────────────────────────────────────────────────
     *
     * Vier Zusicherungen standen hier zuerst als Fenster bzw. gegen die ganze
     * Block-Scheibe. ALLE VIER blieben in der Rückmutation GRÜN, und zwar aus
     * demselben Grund: nimmt man den Wert aus der `VALUES`-Liste, steht er immer
     * noch in der `ON CONFLICT`-Klausel — die wiederholt jeden Wert, das ist ihr
     * Zweck. Ein Fenster findet, was zufällig darin liegt.
     *
     * Jetzt werden die beiden Hälften getrennt und BEIDE geprüft. Das ist auch
     * sachlich richtig: steht `status = 'active'` nur in der VALUES-Liste und
     * nicht im ON-CONFLICT-Zweig, verliert der Lieferant seine Verifizierung beim
     * zweiten Laden — und die Saat ist nicht mehr wiederholbar.
     * ───────────────────────────────────────────────────────────────────────── */
    const zweiHaelften = (text, name) => {
      const k = text.search(/ON\s+CONFLICT/i);
      assert.ok(k > 0, `${name}: keine ON-CONFLICT-Klausel — dann ist die Saat nicht wiederholbar`);
      return { werte: text.slice(0, k), upsert: text.slice(k) };
    };

    /* ── Der externe Agent ──────────────────────────────────────────────── */
    const iExtern = sup.search(/gewollt_extern\s+AS\s*\(/);
    assert.ok(iExtern > 0,
      "der externe Support-Zugang fehlt. Nach Migration 232 hat der externe Weg NULL Halter — "
      + "Punkt 15 waere dann keine Trennung, sondern das Abschalten einer Flaeche.");
    const extern = zweiHaelften(sup.slice(iExtern), "externer Zweig");
    for (const [wo, text] of Object.entries(extern)) {
      assert.match(text, /'external_support_agent'/,
        `der externe Zweig vergibt die Rolle external_support_agent nicht (${wo}). Im `
        + "ON-CONFLICT-Pfad fehlt sie genauso schwer: dann rollt der zweite Lauf den Zugang um.");
      assert.match(text, /'vendor_scoped'/,
        `der externe Zugang hat nicht die enge Datenreichweite (${wo}). Ein fremder `
        + "Dienstleister sieht nur das ihm Zugeteilte — das ist der Unterschied zum internen Weg.");
      assert.match(text, /'external'/,
        `der externe Zweig setzt scope nicht auf 'external' (${wo})`);
    }

    /* ── Der Lieferant, und ob er BENUTZBAR ist ─────────────────────────── */
    const mLief = SAAT.match(/INSERT\s+INTO\s+support_vendors\s*\([\s\S]*?;/i);
    assert.ok(mLief,
      "y4 legt keinen eigenen Dienstleister an. Dann haengt die Buehne an einer Zeile, die nur in "
      + "der Entwicklungsdatenbank existiert — auf einem Frischinstall waere sie rot ohne "
      + "eigenen Fehler.");
    const lief = zweiHaelften(mLief[0], "Lieferant");
    for (const [wo, text] of Object.entries(lief)) {
      assert.match(text, /'active'/,
        `der Lieferant wird nicht auf status='active' gesetzt (${wo}). Die Spalte hat die VORGABE `
        + "'pending', und das Tor antwortet darauf mit 403 VENDOR_NOT_VERIFIED — der externe "
        + "Zugang waere Deko. Fehlt es nur im ON-CONFLICT-Pfad, verliert der Lieferant die "
        + "Verifizierung beim zweiten Laden.");
      assert.ok(!/'pending'/.test(text),
        `der Lieferant wird auf 'pending' gesetzt (${wo}) — das ist genau der unverifizierte `
        + "Zustand, den das Tor mit 403 beantwortet");
      assert.match(text, /allowed_ip_cidrs/,
        `der Lieferant nennt allowed_ip_cidrs nicht (${wo}). Die Spalte hat die Vorgabe '{}', aber `
        + "ein ON-CONFLICT-Pfad ohne sie laesst eine von Hand gesetzte Allowlist stehen.");
      assert.ok(!/\d+\.\d+\.\d+\.\d+\/\d+/.test(text),
        `der Lieferant bekommt eine IP-Allowlist (${wo}). ipAllowed laesst bei LEERER Liste alles `
        + "durch und sperrt bei gefuellter alles ausserhalb — eine Allowlist auf einer Buehne "
        + "sperrt den eigenen Rechner aus (Vorbild des Fehlers: der vorhandene Lieferant traegt "
        + "203.0.113.0/24, ein Dokumentations-Netz, aus dem niemand kommt).");
    }
    assert.match(lief.werte, /verified_at/,
      "die Spaltenliste des Lieferanten nennt verified_at nicht — dann behauptet die Saat eine "
      + "Verifizierung, die nicht datiert ist");
    assert.match(lief.upsert, /verified_at\s*=/,
      "der ON-CONFLICT-Pfad setzt verified_at nicht — ein Lieferant, der beim zweiten Laden sein "
      + "Pruefdatum verliert, ist nicht wiederholbar");
  });

  it("die Support-Zeilen haben feste Kennungen — die Tabelle hat keine Eindeutigkeit auf user_id", () => {
    /* GEMESSEN: `support_agents` hat nur einen Fremdschluessel auf `user_id`,
     * KEINE Eindeutigkeit. Ohne feste `id` und `ON CONFLICT (id)` legt jeder
     * zweite Lauf Doppel an — und ein doppelter Support-Zugang ist kein
     * harmloser Datenmuell: die weitere Zeile kann eine andere Reichweite
     * tragen, und welche gilt, entscheidet dann die Reihenfolge. */
    const sup = block("support_agents");
    assert.match(sup, /ON CONFLICT \(id\)/,
      "ohne ON CONFLICT (id) legt der zweite Lauf Doppel an (keine Eindeutigkeit auf user_id)");
    assert.ok(/bd000000-0000-4000-8000-00000000e0/.test(sup),
      "der Support-Block vergibt keine festen Kennungen");
  });

  it("die Owner-Sicht ist 'co-owner', nicht 'owner'", () => {
    /* Das Tor (`requireOwnerControlAccess`) unterscheidet die beiden NICHT —
     * beide kommen gleich weit. Die Zeile ist aber auch ein Protokoll: wer sie
     * in einem halben Jahr liest, soll nicht glauben, es habe einen zweiten
     * Eigentuemer gegeben. */
    const occ = block("occ_owner_access");
    assert.ok(occ.includes("'co-owner'"), "die Owner-Sicht traegt nicht 'co-owner'");
    assert.ok(!/'owner'/.test(occ),
      "die Buehne vergibt die Rolle 'owner'. Das Tor unterscheidet sie nicht von "
      + "'co-owner' — aber die Zeile ist auch ein Protokoll.");
    assert.match(occ, /ON CONFLICT \(user_id\)/,
      "occ_owner_access hat UNIQUE (user_id) — ohne ON CONFLICT bricht der zweite Lauf");
    assert.match(occ, /revoked_at\s*=\s*NULL/,
      "ein widerrufener Zugang bleibt beim erneuten Laden widerrufen");
  });

  it("die Notbremse prueft die Kernzusage ueber alle drei Tabellen", () => {
    /* Eine Bremse, die nur nachzaehlt, was die Zeile ueber ihr geschrieben hat,
     * ist eine Quittung. Diese hier muss alle drei Tabellen nennen UND die
     * Schwelle `> 1` tragen — sonst prueft sie nicht die Trennung, sondern die
     * Anwesenheit. */
    assert.ok(BREMSEN.length > 1000, "der Bremsen-Block fehlt oder ist zu kurz");
    for (const t of ["tempconnect_staff", "support_agents", "occ_owner_access"]) {
      assert.ok(BREMSEN.includes(t), `die Notbremse prueft ${t} nicht`);
    }
    assert.match(BREMSEN, /\)\s*>\s*1/,
      "keine Schwelle '> 1' in der Notbremse — ohne sie prueft sie Anwesenheit, nicht Trennung");
    assert.match(BREMSEN, /org_memberships/,
      "die Notbremse prueft nicht, dass kein internes Konto an einer Organisation haengt");
    assert.match(BREMSEN, /expires_at IS NULL OR\s+s\.expires_at <= NOW\(\)/,
      "die Notbremse prueft das Ablaufdatum nicht auf WIRKSAMKEIT (NULL oder Vergangenheit)");
  });

  it("die Saat ist MASSGEBLICH: was sie nicht mehr nennt, wird widerrufen", () => {
    /* BEFUND 2026-10-02, gefunden durch eine Rueckmutation, die NICHT ansprang.
     * Nimmt man ein Konto aus der Saat heraus, verliert es seinen Zugang nicht:
     * der Einfuege-Befehl legt an und aendert, er raeumt nicht auf. Bei einer
     * Saat fuer Rechnungen ist das Datenmuell. Bei einer Saat fuer
     * STAFF-ZUGAENGE ist es eine Hintertuer, die niemand mehr sieht, weil sie
     * in keiner Datei steht.
     *
     * Zwei Rueckmutationen gingen deshalb ins Leere: der ON-CONFLICT-Zweig
     * heilte die eine, die stehengebliebene Zeile die andere. Erst der Widerruf
     * macht die Saat zur Wahrheit — und die Proben zu Proben. */
    /* DER WIDERRUF WIRD HERAUSGESCHNITTEN, BEVOR ER GEPRUEFT WIRD.
     *
     * Erster Entwurf pruefte den ganzen Abschnitt je Tabelle — und eine
     * Rueckmutation, die den Buehnen-Praefix aus der WHERE-Klausel des Widerrufs
     * ENTFERNTE, blieb gruen: der Praefix steht im selben Abschnitt auch im JOIN
     * des Einfuege-Befehls. Die Zusicherung fand ihn dort und war zufrieden,
     * waehrend der Widerruf jeden Staff-Zugang der Welt getroffen haette.
     * Dieselbe Falle wie in Welle K3: der Gegenstand muss herausgeschnitten
     * werden, sonst prueft man die Nachbarschaft. */
    function widerruf(tabelle) {
      const i = DATENTEIL.indexOf("UPDATE " + tabelle + " ");
      if (i < 0) return "";
      const bis = DATENTEIL.indexOf(";", i);
      return bis > 0 ? DATENTEIL.slice(i, bis + 1) : DATENTEIL.slice(i);
    }

    for (const [tabelle, spalte] of [
      ["tempconnect_staff", "revoked_at = NOW()"],
      ["support_agents", "is_active = FALSE"],
      ["occ_owner_access", "revoked_at = NOW()"]
    ]) {
      const i = DATENTEIL.indexOf("INSERT INTO " + tabelle);
      assert.ok(i > 0, `kein Einfuege-Befehl fuer ${tabelle}`);
      assert.ok(/WITH gewollt AS \(\s*$/.test(DATENTEIL.slice(Math.max(0, i - 40), i)),
        `der Block fuer ${tabelle} leitet die gewollte Menge nicht aus dem eigenen `
        + "RETURNING ab — eine zweite Liste daneben ist genau die Drift, die hier behoben wird");

      const w = widerruf(tabelle);
      assert.ok(w.length > 80, `kein Widerruf fuer ${tabelle} — die Saat raeumt nicht auf`);

      /* Der Widerruf muss UNMITTELBAR an der schliessenden Klammer des CTE
       * haengen. Steht eine Anweisung dazwischen, ist `gewollt` fuer den Widerruf
       * nicht mehr sichtbar — die Saat bricht dann zwar beim Laden, aber eine
       * Textprobe, die nur Zeichenketten zaehlt, saehe nichts. Gefunden von
       * einer Rueckmutation, die genau das einschob und gruen blieb. */
      const davor = DATENTEIL.slice(Math.max(0, DATENTEIL.indexOf("UPDATE " + tabelle + " ") - 60),
        DATENTEIL.indexOf("UPDATE " + tabelle + " "));
      assert.match(davor, /RETURNING\s+\w+\s*\)\s*$/,
        `${tabelle}: zwischen dem RETURNING und dem Widerruf steht eine weitere `
        + "Anweisung — damit sieht der Widerruf die gewollte Menge nicht mehr");

      assert.ok(w.includes(spalte), `${tabelle}: der Widerruf setzt nicht ${spalte}`);
      assert.ok(w.includes("NOT IN (SELECT"),
        `${tabelle}: der Widerruf grenzt nicht auf die NICHT mehr genannten Zeilen ein `
        + "— so widerriefe er auch die, die er gerade angelegt hat");
      assert.ok(w.includes(KENNUNG),
        `${tabelle}: der Widerruf ist nicht auf den Buehnen-Praefix begrenzt und kann `
        + "damit einen ECHTEN Zugang treffen");
    }

    /* UND NIEMALS MIT DELETE AUF support_agents. Gemessen: SECHS Tabellen zeigen
     * auf `support_agents.id`, alle mit ON DELETE SET NULL — darunter
     * `support_audit_log.agent_id`. Ein DELETE wuerde den AKTEUR EINES
     * AUDIT-EINTRAGS stillschweigend auf NULL setzen. Ein Aufraeumen, das ein
     * Protokoll anonymisiert, ist schlimmer als die Zeile, die es aufraeumt. */
    assert.ok(!/DELETE\s+FROM\s+support_agents/i.test(SAAT),
      "die Saat loescht Support-Agenten. Sechs Tabellen zeigen mit ON DELETE SET NULL "
      + "auf support_agents.id — darunter support_audit_log.agent_id. Der Widerruf "
      + "heisst hier is_active = FALSE, nicht DELETE.");
    assert.ok(!/DELETE\s+FROM\s+(tempconnect_staff|occ_owner_access|users)/i.test(SAAT),
      "die Saat loescht Zugangs- oder Nutzerzeilen. Widerruf laesst eine Spur, DELETE nicht.");
  });

  it("kein Passwort und kein Hash in der Datei", () => {
    /* Y6.3 im Vorgriff. Diese Saat legt neun anmeldbare Konten an und ist damit
     * der naheliegendste Ort fuer die Umgehung. */
    assert.match(DATENTEIL, /crypt\(current_setting\('app\.seed_passwort'\)/,
      "das Passwort wird nicht beim Laden gehasht");
    assert.ok(!/\$2[aby]?\$\d\d\$/.test(SAAT), "ein bcrypt-Hash steht in der Datei");
    assert.match(OHNE_KOMMENTAR, /app\.seed_passwort', true\), ''\) = ''/,
      "die Saat verweigert nicht, wenn app.seed_passwort fehlt");
  });

  it("der Lader verlangt das Passwort GEMESSEN, nicht per Dateiname", () => {
    /* BEFUND 2026-10-02: in `scripts/dev/seed-data.sh` stand
     *   [ "$TARGET_FILE" = "y1-2-standorte.sql" ]
     * und darueber der Satz „Nur dort noetig". Beides war zu dem Zeitpunkt
     * schon falsch — gemessen lesen FUENF Saaten `app.seed_passwort`. Wer
     * `--file=y4-flaechen.sql` ohne SEED_PASSWORT aufrief, kam an dem Riegel
     * vorbei und lief erst in der Datenbank auf.
     *
     * Eine Aufzaehlung von Dateinamen in einer Bedingung veraltet mit der
     * naechsten Saat, und zwar LAUTLOS: die Bedingung bleibt syntaktisch
     * gueltig und wird nur unvollstaendig. */
    const lader = fs.readFileSync(path.join(ROOT, "scripts", "dev", "seed-data.sh"), "utf8");
    const ohneKommentar = lader.replace(/^\s*#.*$/gm, " ");

    const saaten = fs.readdirSync(path.join(ROOT, "sql", "seeds"))
      .filter((f) => f.endsWith(".sql"))
      .filter((f) => fs.readFileSync(path.join(ROOT, "sql", "seeds", f), "utf8").includes("app.seed_passwort"));
    assert.ok(saaten.length > 1,
      `nur ${saaten.length} Saat liest app.seed_passwort — dann waere eine Aufzaehlung noch vertretbar`);

    assert.match(ohneKommentar, /grep -l 'app\\\.seed_passwort'/,
      "der Lader leitet die Passwort-Pflicht nicht aus dem INHALT der Saaten ab");
    const vergleiche = ohneKommentar.match(/TARGET_FILE"?\s*=\s*"[a-z0-9.-]+\.sql"/gi) || [];
    assert.deepEqual(vergleiche, [],
      "der Lader vergleicht TARGET_FILE wieder mit einem festen Dateinamen: "
      + vergleiche.join(", ") + ". Das veraltet mit der naechsten Saat, lautlos.");

    /* Beide Wege, einzeln und gesammelt — ein Riegel, der nur den Sammellauf
     * deckt, laesst `--file=` durch, und genau so ist der Befund entstanden. */
    assert.ok(ohneKommentar.includes('"$SEED_DIR/$TARGET_FILE"'),
      "der Einzeldatei-Weg (--file=) ist von der Passwort-Pflicht nicht erfasst");
    assert.ok(ohneKommentar.includes('"$SEED_DIR"/*.sql'),
      "der Sammellauf ist von der Passwort-Pflicht nicht erfasst");
  });

  it("die Kennungen stossen mit keiner anderen Saat zusammen", () => {
    /* Neun feste UUIDs. Kollidiert der Praefix mit einer anderen Saat, ueber-
     * schreibt ein Lauf die Konten der anderen Buehne — und zwar lautlos, weil
     * ON CONFLICT (id) genau dafuer da ist. */
    const verzeichnis = path.join(ROOT, "sql", "seeds");
    const fremd = fs.readdirSync(verzeichnis)
      .filter((f) => f.endsWith(".sql") && f !== "y4-flaechen.sql")
      .filter((f) => fs.readFileSync(path.join(verzeichnis, f), "utf8").includes(KENNUNG));
    assert.deepEqual(fremd, [],
      "der Kennungs-Praefix " + KENNUNG + " wird auch von " + fremd.join(", ")
      + " benutzt — ein Lauf ueberschreibt die Konten der anderen Saat");
    for (const nr of NUMMERN) {
      assert.ok(DATENTEIL.includes(KENNUNG + "' || o.nr") || DATENTEIL.includes(KENNUNG + nr),
        `Kennung ${nr} fehlt`);
    }
  });
});
