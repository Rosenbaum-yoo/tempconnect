/**
 * ═══════════════════════════════════════════════════════════════════════════
 * VIER STADIEN, ZWEI OHNE BEISPIEL (Y3.1 / Y3.3)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * GEMESSEN AM 2026-10-01, Stadium für Stadium:
 *
 *   1. eingeladen, nicht registriert   **0**  — sechs Einladungen, ALLE abgelaufen
 *   2. registriert ohne Fähigkeiten     34
 *   3. vollständig MIT Nachweis        **0**  — `worker_profile_documents` leer
 *   4. im Einsatz                       15
 *
 * Das erste ist das aufschlussreichere: Einladungen GAB es, sie waren nur alle
 * verfallen. Der Zustand „eingeladen, wartet" — der einzige, in dem die
 * Einladungsfläche etwas zeigt — hatte kein Beispiel. Dieselbe Klasse wie die
 * zwölf unbesetzten Zustände aus Y1.3: nicht fehlende Daten, ein fehlender
 * ZUSTAND.
 *
 * Nach `sql/seeds/y3-arbeiterstadien.sql`: 1 · 34 · 1 · 15. Der Nachweis belegt
 * dabei die EIGENE Fähigkeit der Kraft (gemessen: `qualification_name` =
 * Katalogname der Fähigkeit, die sie trägt) — das ist der Katalogbezug, den
 * N8.1b verlangt, und nicht freier Text.
 *
 * DER EINLADUNGS-TOKEN IST HEIKLER ALS EIN PASSWORT. `worker_invites.token` ist
 * der ROHE Token, mit dem jemand ein Konto anlegt. Stünde er in der Datei, wäre
 * er in einem öffentlichen Repo ein gültiger Zugangsschlüssel. Er entsteht
 * deshalb beim Laden aus `gen_random_bytes(32)`; `token_hash` ist sein SHA-256,
 * genau wie der Code es bildet. Gemessen: 64 Zeichen, Hash stimmt, Token steht
 * nicht in der Datei — und ein zweiter Lauf lässt ihn unverändert, damit ein
 * schon verschickter Link gültig bleibt.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function findeWurzel() {
  for (const start of [__dirname, process.cwd()]) {
    let dir = path.resolve(start);
    for (let i = 0; i < 8; i++) {
      const saat = path.join(dir, "sql", "seeds", "y3-arbeiterstadien.sql");
      if (fs.existsSync(saat) && fs.statSync(saat).size > 2000) return dir;
      const eltern = path.dirname(dir);
      if (eltern === dir) break;
      dir = eltern;
    }
  }
  return null;
}

const ROOT = findeWurzel();
const suite = ROOT ? describe : describe.skip;
const SAAT = ROOT ? fs.readFileSync(path.join(ROOT, "sql", "seeds", "y3-arbeiterstadien.sql"), "utf8") : "";
const OHNE_KOMMENTAR = SAAT.replace(/--[^\n]*/g, " ");
const DIENST = ROOT ? fs.readFileSync(path.join(ROOT, "api", "services", "orgInviteService.js"), "utf8") : "";

/* Nur der Teil, der Zeilen anlegt — ohne die Notbremse am Ende, die jeden
   geprüften Zustand ja selbst nennt. Diese Trennung hat in Y1.3 zwei
   Rückmutationen davor bewahrt, grün zu bleiben. */
const DATENTEIL = (() => {
  const i = OHNE_KOMMENTAR.indexOf("DO $vollstaendig$");
  return i > 0 ? OHNE_KOMMENTAR.slice(0, i) : OHNE_KOMMENTAR;
})();

suite("Y3 — die vier Stadien eines Arbeiters", () => {

  it("Stadium 1: die Einladung ist OFFEN und läuft in die ZUKUNFT", () => {
    assert.match(DATENTEIL, /INSERT INTO worker_invites/i,
      "keine Einladung — Stadium 1 bleibt ohne Beispiel");
    /* NUR die EINFÜGUNG prüfen, nicht die ON-CONFLICT-Klausel dahinter. Die
       enthält `status = 'pending'` und dieselbe Laufzeit — eine Prüfung über den
       ganzen Datenteil blieb deshalb grün, als die eingefügte Zeile auf
       'expired' bzw. auf ein vergangenes Datum gesetzt wurde. Zwei
       Rückmutationen sind genau daran entwischt. */
    const einfuegung = (DATENTEIL.match(/INSERT INTO worker_invites[\s\S]*?(?=ON CONFLICT)/i) || [""])[0];
    assert.ok(einfuegung.length > 200, "die Einfügung in worker_invites ließ sich nicht abgrenzen");
    assert.match(einfuegung, /'pending'/,
      "Die EINGEFÜGTE Einladung steht nicht auf 'pending'. 'expired' oder 'revoked' zeigen den "
      + "Verfall, nicht das Warten — und genau das war der Befund: sechs Einladungen, alle "
      + "abgelaufen.");
    assert.match(einfuegung, /now\(\) \+ interval '14 days'/,
      "Die EINGEFÜGTE Einladung läuft nicht in die Zukunft. Mit einem festen oder vergangenen "
      + "Datum verfällt sie und das Stadium verschwindet wieder.");
    assert.ok(!/now\(\) - interval '\d+ day/.test(einfuegung.replace(/last_sent_at[\s\S]*$/, "")),
      "Ein Datum der Einfügung liegt in der Vergangenheit (außer last_sent_at, das dort "
      + "hingehört) — eine verfallene Einladung ist kein Stadium 1.");
    /* Und sie darf beim Wiederholen nicht verfallen: ohne Auffrischen der
       Laufzeit wäre die Bühne nach 14 Tagen wieder unvollständig. */
    assert.match(OHNE_KOMMENTAR, /ON CONFLICT \(id\) DO UPDATE SET[\s\S]{0,200}expires_at = now\(\) \+ interval '14 days'/,
      "Ein zweiter Lauf frischt die Laufzeit nicht auf. Dann verfällt die Einladung mit der "
      + "Zeit und Stadium 1 verliert sein Beispiel — lautlos.");
  });

  it("der Einladungs-Token entsteht ZUFÄLLIG beim Laden, nicht in der Datei", () => {
    /* Heikler als ein Passwort: der rohe Token legt ein Konto an. */
    assert.match(DATENTEIL, /encode\(gen_random_bytes\(32\), 'hex'\)/,
      "Der Token wird nicht zufällig erzeugt. Ein Token in der Datei ist in einem öffentlichen "
      + "Repo ein gültiger Zugangsschlüssel — schlimmer als ein Passwort, weil er ohne "
      + "Anmeldung wirkt.");
    assert.match(DATENTEIL, /encode\(digest\(t\.roh, 'sha256'\), 'hex'\)/,
      "token_hash ist nicht der SHA-256 des Tokens. Der Code bildet ihn mit "
      + "crypto.createHash(\"sha256\")…digest(\"hex\") — eine andere Form macht die Einladung "
      + "unlesbar, und zwar erst beim Einlösen.");
    assert.match(DIENST, /createHash\("sha256"\)/,
      "Der Dienst hasht nicht mehr mit SHA-256 — diese Zusicherung beruft sich darauf und "
      + "müsste neu gelesen werden");
    /* Kein 64-stelliger Hex-Block in der Datei: das wäre ein eingetragener Token. */
    const hex = (OHNE_KOMMENTAR.match(/'[0-9a-f]{40,}'/g) || []);
    assert.deepEqual(hex, [],
      `Die Saat trägt einen langen Hex-Wert (${hex.join(", ")}). Das sieht nach einem `
      + "eingetragenen Token oder Hash aus — beides gehört nicht ins Repo.");
    /* Und der Token darf beim Wiederholen NICHT neu entstehen. */
    assert.ok(!/ON CONFLICT \(id\) DO UPDATE SET[\s\S]{0,400}token =/.test(OHNE_KOMMENTAR),
      "Ein zweiter Lauf überschreibt den Token. Damit würde ein schon verschickter "
      + "Einladungslink ungültig, ohne dass jemand es merkt.");
  });

  it("Stadium 3: der Nachweis trägt einen KATALOGBEZUG, keinen freien Text", () => {
    assert.match(DATENTEIL, /INSERT INTO worker_profile_documents/i,
      "kein Nachweis — Stadium 3 bleibt ohne Beispiel (gemessen: die Tabelle war LEER)");
    /* Der Name kommt AUS dem Katalog, nicht aus der Datei: ein Tippfehler würde
       den Katalogbezug lautlos verlieren, und die INSERT..SELECT legte keine
       Zeile an, ohne zu scheitern. */
    assert.match(DATENTEIL, /FROM platform_skills ps\s*\n?\s*WHERE ps\.name = 'Lagerhelfer:in' AND ps\.is_active AND ps\.status = 'approved'/,
      "Der Nachweis liest seinen Katalognamen nicht aus platform_skills. Mit einem getippten "
      + "Namen wäre der Katalogbezug nicht mehr garantiert — und seit N8.1b ist er Pflicht.");
    assert.match(DATENTEIL, /qualification_name/,
      "qualification_name fehlt. Der Code liest LOWER(COALESCE(qualification_name, title)) — "
      + "ohne das Feld fällt er auf den Titel zurück, und der ist freier Text.");
    assert.match(DATENTEIL, /'verified'/,
      "Der Nachweis ist nicht geprüft. 'pending_review' zählt in "
      + "assignmentStaffingService nicht als verified_doc — das Stadium „vollständig\" "
      + "wäre damit nicht erreicht.");
    assert.match(DATENTEIL, /valid_until[\s\S]{0,400}CURRENT_DATE \+ 330/,
      "Die Gültigkeit endet nicht relativ in der Zukunft. Ein abgelaufener Nachweis zählt als "
      + "expired_doc und zeigt das Gegenteil.");
  });

  it("der Nachweis belegt die EIGENE Fähigkeit der Kraft", () => {
    /* Gemessen: qualification_name = Katalogname der Fähigkeit, die d001 trägt
       (Lagerhelfer:in). Ein Nachweis über eine fremde Fähigkeit wäre formal
       gültig und inhaltlich sinnlos. */
    assert.match(DATENTEIL, /'b1000000-0000-4000-8000-00000000d001'/,
      "Der Nachweis hängt nicht an der Kraft d001. Jonas Harms trägt die Fähigkeit "
      + "„Lagerhelfer:in\" — nur dann belegt der Nachweis etwas.");
    assert.match(DATENTEIL, /'Lagerhelfer:in'/,
      "Der Katalogname passt nicht zur Fähigkeit der Kraft. Ein Nachweis über eine fremde "
      + "Fähigkeit ist formal gültig und inhaltlich sinnlos.");
  });

  it("die Saat verlangt die Belegschaft aus Y1.4 — und sagt es", () => {
    assert.match(SAAT, /IF NOT EXISTS \(SELECT 1 FROM organizations WHERE id = 'b1000000-0000-4000-8000-000000000001'\) THEN/,
      "Die Saat prüft nicht, ob die Agentur aus Y1.4 geladen ist. Ohne Prüfung bricht sie mit "
      + "einem Fremdschlüsselfehler ab, und niemand erkennt, dass nur die Reihenfolge fehlte.");
    assert.match(SAAT, /IF NOT EXISTS \(SELECT 1 FROM worker_profiles WHERE id = 'b1000000-0000-4000-8000-00000000d001'\) THEN/,
      "Die Saat prüft nicht, ob die Kraft d001 existiert — Stadium 3 hängt an ihr");
    assert.match(SAAT, /y1-4-belegschaft\.sql/,
      "Die Fehlermeldung nennt nicht, welche Saat zuerst laufen muss");
  });

  it("die Notbremse prüft die ZUSTÄNDE, nicht ihren Text", () => {
    /* Die Lehre aus Y1.4 und Y1.3: eine Zusicherung auf den Meldungstext
       überlebt `IF false`. */
    assert.match(SAAT, /array_length\(fehlt, 1\) > 0/,
      "Die Notbremse wertet ihre Sammelliste nicht aus");
    assert.match(SAAT, /status = 'pending' AND accepted_at IS NULL AND expires_at > now\(\)/,
      "Die Notbremse prüft Stadium 1 nicht an seiner Bedingung");
    assert.match(SAAT, /lower\(ps\.name\) = lower\(d\.qualification_name\)/,
      "Die Notbremse prüft den Katalogbezug nicht — dann könnte Stadium 3 mit freiem Text "
      + "„erledigt\" aussehen");
  });

  it("KEIN Passwort und KEIN Hash in der Datei", () => {
    const hashes = SAAT.match(/\$2[aby]\$\d\d\$[./A-Za-z0-9]{10,}/g) || [];
    assert.deepEqual(hashes, [], "Die Saat trägt einen bcrypt-Hash");
    for (const wort of ["DemoPass2026!", "Demo2026!", "password123"]) {
      assert.ok(!OHNE_KOMMENTAR.includes(wort), `'${wort}' steht in einer ANWEISUNG`);
    }
    assert.match(SAAT, /crypt\(current_setting\('app\.seed_passwort'\), gen_salt\('bf', 10\)\)/,
      "Der Hash entsteht nicht aus dem Schalter");
    assert.match(SAAT, /app\.seed_demo_world[\s\S]{0,300}RAISE EXCEPTION/,
      "Die Sperre fehlt oder wirft nicht");
  });

  it("Y3.4: die Bühne weicht die harte Trennung NICHT auf", () => {
    /*
     * Y3.4 verlangt keine Daten, sondern eine Zusage: „kein Arbeiterkonto
     * erreicht die Plattform, kein Firmenkonto das Portal — bestehende Wächter
     * bleiben grün, diese Zusage darf die Bühne nicht aufweichen."
     *
     * Die Gefahr ist konkret: wer einem Arbeiterkonto eine Mitgliedschaft mit
     * einer Firmenrolle gibt — aus Bequemlichkeit, damit „man alles sieht" —,
     * hebelt `hidden_worker` aus, und zwar in den DATEN, wo kein RBAC-Wächter
     * hinsieht. Gemessen am 2026-10-01: 0 solche Konten im Bestand. Diese
     * Zusicherung hält das über ALLE Bühnen-Saaten fest, nicht nur über diese.
     */
    const seeds = ["y1-2-standorte.sql", "y1-3-sonderzustaende.sql",
      "y1-4-belegschaft.sql", "y3-arbeiterstadien.sql"];
    const FIRMENROLLEN = ["owner", "admin", "program_manager", "hiring_manager",
      "supplier_manager", "finance", "member", "platform_admin", "dispatcher", "recruiter"];
    /* NOTBREMSE ÜBER ALLE SAATEN. Der erste Entwurf dieser Zusicherung sammelte
       die Arbeiterkonten mit `\('…` — ohne Weißraum dazwischen. In dieser Datei
       steht nach dem `(` ein Zeilenumbruch, die Menge blieb leer, und ein
       `continue` bei leerer Menge machte die Prüfung lautlos grün: eine
       Gegenprobe, die einem Arbeiterkonto die Rolle 'admin' gab, wurde NICHT
       gefangen. Ohne diese Zählung bliebe derselbe Fehler unsichtbar. */
    let gesehen = 0;
    for (const name of seeds) {
      const p = path.join(ROOT, "sql", "seeds", name);
      if (!fs.existsSync(p)) continue;
      const t = fs.readFileSync(p, "utf8").replace(/--[^\n]*/g, " ");
      /* Jede Kennung, die als Arbeiterkonto angelegt wird — Weißraum erlaubt. */
      const arbeiter = new Set();
      for (const m of t.matchAll(/\(\s*'(b[0-9a-f]{7}-[0-9a-f-]+)',\s*'worker',/g)) arbeiter.add(m[1]);
      gesehen += arbeiter.size;
      if (arbeiter.size === 0) continue;
      const mitgliedschaften = (t.match(/INSERT INTO org_memberships[\s\S]*?;/gi) || []).join("\n");
      for (const id of arbeiter) {
        /* Die Zeile dieser Kennung in den Mitgliedschaften. */
        const zeile = (mitgliedschaften.match(new RegExp("'" + id + "'[^\\n]*(\\n[^\\n]*)?")) || [""])[0];
        for (const rolle of FIRMENROLLEN) {
          assert.ok(!new RegExp("'" + rolle + "'").test(zeile),
            `${name}: das Arbeiterkonto ${id} bekommt die Firmenrolle '${rolle}'. Das hebelt `
            + "`hidden_worker` in den DATEN aus, wo kein RBAC-Wächter hinsieht — Y3.4 verlangt "
            + "ausdrücklich, dass die Bühne diese Zusage nicht aufweicht.");
        }
      }
    }
    assert.ok(gesehen >= 3,
      `Nur ${gesehen} Arbeiterkonten in den Bühnen-Saaten gefunden, erwartet mindestens drei `
      + "(gemessen 2026-10-01: zwei in y1-4-belegschaft.sql, eines in y3-arbeiterstadien.sql). "
      + "Findet die Prüfung keine, prüft sie NICHTS — und genau so war der erste Entwurf "
      + "dieser Zusicherung lautlos grün.");
  });

  it("ein zweiter Lauf verdoppelt nichts und nimmt dem Profil sein Konto nicht weg", () => {
    const konflikte = (OHNE_KOMMENTAR.match(/ON CONFLICT/g) || []).length;
    assert.ok(konflikte >= 4,
      `Nur ${konflikte} ON-CONFLICT-Klauseln, erwartet mindestens vier`);
    /* Das UPDATE auf worker_profiles muss idempotent UND behutsam sein: es darf
       ein fremdes Konto nicht überschreiben. */
    assert.match(OHNE_KOMMENTAR, /UPDATE worker_profiles[\s\S]{0,400}AND \(user_id IS NULL OR user_id = 'b5000000-0000-4000-8000-00000000c001'\)/,
      "Das UPDATE auf worker_profiles prüft nicht, ob das Profil schon ein ANDERES Konto hat. "
      + "Ohne diese Bedingung nimmt ein zweiter Lauf einer Kraft ihren echten Zugang weg.");
    assert.ok(!/uuid_generate_v4\(\)/.test(OHNE_KOMMENTAR),
      "Die Saat erzeugt UUIDs zur Laufzeit — dann ist sie nicht wiederholbar");
  });
});
