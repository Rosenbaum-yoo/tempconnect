/**
 * Tor-Marke und Abholskript (Owner 2026-10-01: „und auch mergen in gewissen
 * Abständen immer wenn etwas neues im frontend zu sehen wäre automatisch,
 * damit ich lokal auch gucken kann").
 *
 * Drei Dinge werden hier festgehalten:
 *  1. die Marke selbst (api/scripts/lib/torMarke.mjs) — fail-soft, je Prozess;
 *  2. dass der Testlauf sie wirklich legt und wegraeumt — sonst wartet das
 *     Skript auf eine Marke, die niemand legt, und fuehrt mitten in einen Lauf
 *     hinein zusammen (Eiserne Regel: „Ein volles Tor ueber einen Baum, an dem
 *     zwei schreiben, beweist nichts");
 *  3. dass scripts/dev/cloud-stand-holen.sh seine Zusagen haelt: nichts
 *     anfassen bei ungesicherten Aenderungen, bei liegender Marke und bei
 *     Konflikt — am echten Git in einem Wegwerf-Ordner, nicht am Text.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync, copyFileSync, mkdirSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  TOR_MARKE_PRAEFIX,
  torMarkePfad,
  setzeTorMarke,
  loescheTorMarke,
} from "../scripts/lib/torMarke.mjs";

const WURZEL = resolve(import.meta.dirname, "..", "..");
const SKRIPT = join(WURZEL, "scripts", "dev", "cloud-stand-holen.sh");
const CMD = join(WURZEL, "scripts", "dev", "cloud-stand-holen.cmd");
const RUNNER = join(WURZEL, "api", "scripts", "run-tests.js");

describe("Tor-Marke: der Baustein", () => {
  it("fragt Git nach dem Pfad je Prozess und loest ihn gegen das Aufrufverzeichnis auf", () => {
    const aufrufe = [];
    const pfad = torMarkePfad({
      cwd: "/projekt/api",
      pid: 4711,
      ausfuehren: (befehl, args, opts) => {
        aufrufe.push({ befehl, args, cwd: opts.cwd });
        return "../.git/tor-laeuft-4711\n";
      },
    });
    assert.deepEqual(aufrufe, [{ befehl: "git", args: ["rev-parse", "--git-path", "tor-laeuft-4711"], cwd: "/projekt/api" }]);
    assert.equal(pfad, resolve("/projekt/api", "../.git/tor-laeuft-4711"));
    assert.equal(TOR_MARKE_PRAEFIX, "tor-laeuft-");
  });

  it("ohne Git (Container-Abbild) gibt es keine Marke — und keinen Fehler", () => {
    assert.equal(torMarkePfad({ cwd: "/app", ausfuehren: () => { throw new Error("git: not found"); } }), null);
    assert.equal(torMarkePfad({ cwd: "/app", ausfuehren: () => "  \n" }), null);
    assert.equal(setzeTorMarke(null, { suite: "all" }), null);
    assert.doesNotThrow(() => loescheTorMarke(null));
  });

  it("setzen schreibt Suite, Prozess und Beginn; ein Schreibfehler stoert den Lauf nicht", () => {
    const geschrieben = [];
    const jetzt = new Date("2026-10-01T08:00:00Z");
    const pfad = setzeTorMarke("/x/.git/tor-laeuft-7", {
      suite: "all", pid: 7, jetzt, schreiben: (p, inhalt) => geschrieben.push([p, inhalt]),
    });
    assert.equal(pfad, "/x/.git/tor-laeuft-7");
    assert.deepEqual(JSON.parse(geschrieben[0][1]), { suite: "all", pid: 7, seit: "2026-10-01T08:00:00.000Z" });
    assert.equal(setzeTorMarke("/x", { schreiben: () => { throw new Error("EACCES"); } }), null);
    assert.doesNotThrow(() => loescheTorMarke("/x", { loeschen: () => { throw new Error("EBUSY"); } }));
  });

  it("am echten Dateisystem: liegt nach dem Setzen, ist nach dem Loeschen weg", () => {
    const ordner = mkdtempSync(join(tmpdir(), "tormarke-"));
    try {
      const pfad = setzeTorMarke(join(ordner, "tor-laeuft-1"), { suite: "pilot" });
      assert.ok(existsSync(pfad));
      loescheTorMarke(pfad);
      assert.equal(existsSync(pfad), false);
      assert.doesNotThrow(() => loescheTorMarke(pfad), "zweimal loeschen ist kein Fehler");
    } finally {
      rmSync(ordner, { recursive: true, force: true });
    }
  });
});

describe("Tor-Marke: der Testlauf legt sie wirklich", () => {
  const quelle = readFileSync(RUNNER, "utf8");

  it("importiert die Marke und legt sie, bevor der Lauf startet", () => {
    assert.match(quelle, /from "\.\/lib\/torMarke\.mjs"/);
    const setzen = quelle.indexOf("setzeTorMarke(torMarkePfad(");
    const lauf = quelle.indexOf("await starteLauf()");
    assert.ok(setzen > 0, "setzeTorMarke(torMarkePfad(...)) fehlt");
    assert.ok(lauf > setzen, "die Marke muss vor dem ersten Lauf liegen");
  });

  it("raeumt sie bei jedem Ende weg — regulaer und bei Strg+C", () => {
    assert.match(quelle, /process\.on\("exit", \(\) => loescheTorMarke\(torMarke\)\)/);
    assert.match(quelle, /\["SIGINT", "SIGTERM"\]/);
    assert.match(quelle, /process\.once\(signal, \(\) => \{\s*loescheTorMarke\(torMarke\);\s*process\.kill\(process\.pid, signal\);/);
  });
});

describe("Abholskript: Kopplung und Zusagen", () => {
  const text = readFileSync(SKRIPT, "utf8");
  const code = text.split("\n").filter((z) => !/^\s*#/.test(z)).join("\n");

  it("wartet auf genau die Marke, die der Testlauf legt — vor dem Holen", () => {
    assert.ok(code.includes(`-name '${TOR_MARKE_PRAEFIX}*'`), "Skript sucht eine andere Marke als die, die gelegt wird");
    assert.ok(code.includes(`git rev-parse --git-path ${TOR_MARKE_PRAEFIX}`), "Skript sucht die Marke nicht im Git-Verzeichnis");
    const innen = code.slice(code.indexOf("lauf_innen() {"));
    assert.ok(innen.indexOf("tor_laeuft") < innen.indexOf("git fetch"), "die Marke muss vor dem Holen geprueft werden");
    assert.ok(innen.indexOf("--untracked-files=no") < innen.indexOf("git fetch"));
  });

  it("schreibt nie Historie um und pusht nie", () => {
    for (const verboten of [/git push/, /git reset/, /git rebase/, /git checkout/, /git clean/, /git stash/, /--force/]) {
      assert.doesNotMatch(code, verboten, `verboten im Skript: ${verboten}`);
    }
    assert.match(code, /git merge --ff-only/);
  });

  it("zeigt den Abschnitt „Neu sichtbar“ der Uebergabe — und der endet, wo das Skript ihn enden laesst", () => {
    assert.ok(code.includes("/^### Neu sichtbar im Frontend/"));
    assert.ok(code.includes("/^\\*\\*K1-Routine/"));
    const uebergabe = readFileSync(join(WURZEL, "docs", "UEBERGABE.md"), "utf8");
    const ab = uebergabe.indexOf("\n### Neu sichtbar im Frontend");
    assert.ok(ab > 0, "Abschnitt fehlt in docs/UEBERGABE.md");
    const rest = uebergabe.slice(ab + 1);
    const routine = rest.indexOf("\n**K1-Routine");
    const naechste = rest.indexOf("\n#", 1);
    assert.ok(routine > 0 && routine < naechste, "die Routine-Zeile muss den Abschnitt beenden");
    assert.match(rest.slice(0, routine), /\| Was \| Wo ansehen \| Lokal nötig \|/);
  });

  it("die Windows-Huelle ist reines ASCII und ruft das Skript", () => {
    const roh = readFileSync(CMD);
    assert.ok(roh.every((b) => b < 0x80), "cmd.exe liest in der OEM-Codepage — nur ASCII");
    assert.match(roh.toString("ascii"), /cloud-stand-holen\.sh --bauen --wiederholen 30/);
    const attribute = readFileSync(join(WURZEL, ".gitattributes"), "utf8");
    assert.match(attribute, /^\*\.cmd\s+text eol=crlf$/m);
    assert.match(attribute, /^\*\.sh\s+text eol=lf$/m);
  });
});

/* Am echten Git, in einem Wegwerf-Ordner. Ohne bash oder git (z. B. node aus
   PowerShell ohne Git im PATH) wird uebersprungen — der Lauf in Git Bash und in
   der Cloud hat beides. */
const hatWerkzeuge = ["bash", "git"].every((w) => spawnSync(w, ["--version"], { encoding: "utf8" }).status === 0);

describe("Abholskript am echten Git", { skip: !hatWerkzeuge && "bash oder git nicht im PATH" }, () => {
  let ordner, quelle, klon, alt, neu;
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: "Probe", GIT_AUTHOR_EMAIL: "probe@tempconnect.test",
    GIT_COMMITTER_NAME: "Probe", GIT_COMMITTER_EMAIL: "probe@tempconnect.test",
    GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "commit.gpgsign", GIT_CONFIG_VALUE_0: "false",
    CLOUD_BRANCH: "cloud", CLOUD_REMOTE: "origin",
  };
  const git = (cwd, ...args) => {
    const r = spawnSync("git", args, { cwd, env, encoding: "utf8" });
    assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
    return r.stdout.trim();
  };
  const holen = () => spawnSync("bash", ["scripts/dev/cloud-stand-holen.sh"], { cwd: klon, env, encoding: "utf8", timeout: 30000 });
  // Nur im Wegwerf-Klon; cwd steht in jedem Aufruf ausdruecklich da.
  const zurueck = () => git(klon, "reset", "--quiet", "--hard", alt);

  before(() => {
    ordner = mkdtempSync(join(tmpdir(), "cloudstand-"));
    quelle = join(ordner, "quelle");
    klon = join(ordner, "klon");
    mkdirSync(quelle);
    git(quelle, "init", "-q", "-b", "cloud");
    writeFileSync(join(quelle, "seite.html"), "alt\n");
    git(quelle, "add", "seite.html");
    git(quelle, "commit", "-q", "-m", "alt");
    alt = git(quelle, "rev-parse", "HEAD");
    git(ordner, "clone", "-q", quelle, "klon");
    writeFileSync(join(quelle, "seite.html"), "neu aus der Cloud\n");
    git(quelle, "commit", "-q", "-am", "neu");
    neu = git(quelle, "rev-parse", "HEAD");
    // Das Skript findet seinen Projektordner ueber den eigenen Ort — also hinein.
    mkdirSync(join(klon, "scripts", "dev"), { recursive: true });
    copyFileSync(SKRIPT, join(klon, "scripts", "dev", "cloud-stand-holen.sh"));
  });

  after(() => {
    if (ordner) rmSync(ordner, { recursive: true, force: true });
  });

  it("sauberer Ordner: spult auf den Cloud-Stand vor", () => {
    zurueck();
    const r = holen();
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Vorgespult/);
    assert.equal(git(klon, "rev-parse", "HEAD"), neu);
    assert.equal(holen().stdout.includes("Nichts Neues"), true, "zweiter Lauf: nichts mehr zu holen");
  });

  it("ungesicherte Aenderung: fasst nichts an", () => {
    zurueck();
    writeFileSync(join(klon, "seite.html"), "K1 arbeitet gerade\n");
    const r = holen();
    assert.match(r.stdout, /Ungesicherte Aenderungen/);
    assert.equal(git(klon, "rev-parse", "HEAD"), alt);
    assert.equal(readFileSync(join(klon, "seite.html"), "utf8"), "K1 arbeitet gerade\n");
  });

  it("liegende Tor-Marke: fasst nichts an; eine verwaiste haelt nicht auf", () => {
    zurueck();
    const marke = join(klon, ".git", `${TOR_MARKE_PRAEFIX}4711`);
    writeFileSync(marke, "{}\n");
    try {
      const r = holen();
      assert.match(r.stdout, /Testlauf geht gerade/);
      assert.equal(git(klon, "rev-parse", "HEAD"), alt);
      // Abgestuerzter Lauf: nach zwei Stunden gilt die Marke als verwaist.
      const vorDreiStunden = new Date(Date.now() - 3 * 3600 * 1000);
      utimesSync(marke, vorDreiStunden, vorDreiStunden);
      assert.match(holen().stdout, /Vorgespult/);
      assert.equal(git(klon, "rev-parse", "HEAD"), neu);
    } finally {
      rmSync(marke, { force: true });
    }
  });

  it("kann es nicht pruefen (falsches find im PATH), fasst es nichts an", () => {
    zurueck();
    const attrappen = join(ordner, "falsches-find");
    mkdirSync(attrappen, { recursive: true });
    // Windows' find.exe kennt keine dieser Angaben und endet mit einem Fehler.
    writeFileSync(join(attrappen, "find"), "#!/bin/sh\necho 'FIND: Parameter format not correct' >&2\nexit 2\n", { mode: 0o755 });
    const r = spawnSync("bash", ["scripts/dev/cloud-stand-holen.sh"], {
      cwd: klon, encoding: "utf8", timeout: 30000,
      env: { ...env, PATH: `${attrappen}${process.platform === "win32" ? ";" : ":"}${env.PATH}` },
    });
    assert.match(r.stdout, /Kann nicht pruefen, ob ein Testlauf laeuft/);
    assert.equal(git(klon, "rev-parse", "HEAD"), alt);
  });

  it("Konflikt: bricht ab, nichts bleibt haengen", () => {
    zurueck();
    writeFileSync(join(klon, "seite.html"), "K1 hat es anders geaendert\n");
    git(klon, "commit", "-q", "-am", "k1");
    const vorher = git(klon, "rev-parse", "HEAD");
    const r = holen();
    assert.equal(r.status, 1);
    assert.match(r.stdout, /KONFLIKT — abgebrochen/);
    assert.equal(git(klon, "rev-parse", "HEAD"), vorher);
    assert.equal(existsSync(join(klon, ".git", "MERGE_HEAD")), false);
    assert.equal(git(klon, "status", "--porcelain", "--untracked-files=no"), "");
  });
});
