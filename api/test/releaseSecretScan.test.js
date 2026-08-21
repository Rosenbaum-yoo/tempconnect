/**
 * Die Secret-Pruefung des Release-Pakets muss BEIDES koennen.
 *
 * Ein Waechter, der alles meldet, ist so wertlos wie einer, der nichts meldet —
 * nur teurer, weil man ihn abschaltet. Die alte Regel meldete 18 Fehlalarme und
 * liess die Release-Validierung scheitern; keiner davon war ein Secret.
 *
 * Dieser Test haelt beide Enden fest:
 *   1. Bekannte Fehlalarme bleiben still.
 *   2. Gepflanzte ECHTE Zugangsdaten fliegen weiterhin auf.
 *
 * Teil 2 ist der wichtigere. Eine Pruefung leiser zu machen ist trivial — der
 * Beweis, dass sie dabei nicht blind wurde, ist die eigentliche Arbeit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DIE HAELFTE DIESER FAELLE HAT DER LAUF GEFUNDEN, NICHT DAS NACHDENKEN.
 *
 * Der erste Entwurf bestand alle selbst ausgedachten Faelle. Gegen das echte
 * Repo gerichtet meldete er dann einen deutschen SATZ, saemtliche Platzhalter in
 * `deploy/.env` und — am peinlichsten — die gepflanzten Werte DIESER Datei,
 * womit er jedes Release zum Scheitern gebracht haette.
 *
 * Alle drei stehen unten als eigene Faelle. Der Abschnitt "aus dem echten Lauf
 * gelernt" ist deshalb nicht Beiwerk, sondern der wertvollste Teil: Er haelt
 * genau die Fehler fest, die sich ohne Ausfuehrung nicht denken liessen.
 *
 * Run: node --test --test-force-exit test/releaseSecretScan.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  pruefeZeile,
  pruefeDatei,
  beurteileWert,
  entropie,
} from "../../scripts/lib/secretScan.mjs";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HIER, "..", "..");

/* ═══════════════════════════════════════════════════════════════════════════
 * 1. Die Fehlalarme, die den Umbau ausgeloest haben — wortwoertlich aus dem Repo
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Jede Zeile hier hat die alte Pruefung zum Anschlagen gebracht.
 * Gruppiert nach URSACHE, nicht nach Datei — die Ursache ist das, was die Regel
 * lernen musste.
 */
const FEHLALARME = [
  // --- liest aus der Umgebung: der Wert steht nicht in der Datei ---
  ['config/index.js', '  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === "dev_secret_change_me" || looksLikePlaceholder(process.env.SESSION_SECRET)) {'],
  ['routes/payment.js', '  const STRIPE_WEBHOOK_SECRET = config.STRIPE_WEBHOOK_SECRET || "";'],
  ['scripts/perf-smoke.js', 'const PERF_PASSWORD = process.env.TC_PERF_PASSWORD || "";'],
  ['staffHetznerService.js', 'const TOKEN = String(process.env.HETZNER_CLOUD_TOKEN || "").trim();'],
  ['collect-infrastructure-snapshot.sh', 'INTERNAL_SECRET="${INTERNAL_CRON_SECRET:-}"'],
  ['scheduler-smoke.sh', 'SECRET="${INTERNAL_CRON_SECRET:-}"'],
  ['migrate.sh', '    PGPASSWORD=$POSTGRES_PASSWORD psql -h "$DB_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"'],

  // --- Regex BESCHREIBT einen Variablennamen, weist nichts zu ---
  ['prodEnvTemplate.test.js', '    assert.ok(/STAFF_SESSION_SECRET=/.test(template), "STAFF_SESSION_SECRET fehlt in .env.prod.example");'],
  ['prodEnvTemplate.test.js', '    const staff = template.match(/^STAFF_SESSION_SECRET=(.*)$/m)?.[1]?.trim();'],
  ['prodEnvTemplate.test.js', '    const session = template.match(/^SESSION_SECRET=(.*)$/m)?.[1]?.trim();'],

  // --- der Kommentar der Pruefung selbst ---
  ['release-verify.sh', '    # Warnung bei verdaechtig langen Werten nach SECRET=, TOKEN=, PASSWORD=, KEY='],

  // --- Testkonstanten: zu kurz und/oder ohne gueltiges Anbieter-Format ---
  ['health.route.coverage.test.js', '  const SECRET = "top-secret-admin";'],
  ['health.route.coverage.test.js', '  const SECRET = "sentry-admin-secret";'],
  ['payment.webhook.stack.flow.test.js', 'const WEBHOOK_SECRET = "wh_sec_stack_regression_test";'],
  ['rbac.flow.test.js', 'const ADMIN_SECRET = process.env.ADMIN_SECRET || "dev-admin-secret";'],
  ['m2mAuth.test.js', 'const SECRET = "test-jwt-secret-0123456789";'],
  ['commercial-subscription-smoke.spec.js', 'const TEST_PASSWORD = "CommercialE2e2026!";'],
];

describe("Secret-Scan — die bekannten Fehlalarme bleiben still", () => {
  for (const [herkunft, zeile] of FEHLALARME) {
    it(`${herkunft}: ${zeile.trim().slice(0, 58)}`, () => {
      const fund = pruefeZeile(zeile);
      assert.equal(fund, null,
        `Fehlalarm wieder da — gemeldet wurde: ${fund && fund.wert} ` +
        `(${fund && fund.grund})`);
    });
  }

  it("es sind alle — 17 Zeilen, 18 Treffer", () => {
    /* Gegenprobe gegen stilles Schrumpfen der Liste: Waere hier nur die Haelfte
     * eingetragen, waeren alle Tests darueber gruen, ohne die Haelfte je
     * geprueft zu haben.
     *
     * 17 und nicht 18: `api/config/index.js` schlug zweimal an (Zeile 24 und
     * 244) — mit identischem Text. Die Liste fuehrt jede ZeilenFORM einmal. */
    assert.equal(FEHLALARME.length, 17);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 2. Was der Lauf gegen das echte Repo gelehrt hat
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Diese Faelle hat kein Nachdenken gefunden, sondern die Ausfuehrung.
 * Jeder steht fuer eine Regel, die der ersten Fassung fehlte.
 */
const AUS_DEM_LAUF = [
  // --- ein SATZ ist kein Schluessel: 51 Zeichen, 4.08 bit/Z, aber Leerzeichen
  ['landing.js — deutscher Satz',
   'RESET_TOKEN_ABGELAUFEN: "Der Reset-Link ist abgelaufen. Bitte neu anfordern."'],
  ['Meldung mit Leerzeichen',
   'const SESSION_TOKEN_MESSAGE = "Ihre Sitzung ist abgelaufen bitte erneut anmelden";'],

  // --- Platzhalter in deploy/.env: lang genug, aber Anweisung an einen Menschen
  ['deploy/.env — 52 Zeichen Platzhalter',
   'SESSION_SECRET=HIER_MINDESTENS_64_ZEICHEN_ZUFAELLIGER_STRING_SETZEN'],
  ['deploy/.env — Admin-Platzhalter',
   'ADMIN_SECRET=HIER_SICHERES_ADMIN_SECRET_SETZEN'],
  ['deploy/.env — Stripe-Platzhalter',
   'STRIPE_SECRET_KEY=sk__test_HIER_EIGENEN_TESTKEY_EINTRAGEN'],
  ['deploy/.env — Webhook-Platzhalter',
   'STRIPE_WEBHOOK_SECRET=wh_sec_HIER_WEBHOOK_SECRET_EINTRAGEN'],

  // --- lokale .env: deutsche Woerter, 59 Zeichen
  ['.env — dev-Wert mit Klartext-Hinweis',
   'SESSION_SECRET=tempconnect_dev_secret_bitte_in_produktion_aendern_12345678'],

  // --- Testvorrichtungen mit echtem Praefix, aber falschem Format
  ['systemHealth.test.js — zu kurzer Stripe-Schluessel',
   'STRIPE_SECRET_KEY: "sk__live_realkey1234567890"'],
  ['systemHealth.test.js — zu kurzes Webhook-Secret',
   'STRIPE_WEBHOOK_SECRET: "wh_sec_realsecret1234567890"'],
  ['emailProviderService.test.js — SendGrid-Form verfehlt',
   'SENDGRID_API_KEY: "SG.abc123realkey"'],
  ['billingProviderService.test.js — Zwei-Wort-Vorrichtung',
   'STRIPE_WEBHOOK_SECRET: "wh_sec_real"'],
];

describe("Secret-Scan — was der echte Lauf gelehrt hat", () => {
  for (const [was, zeile] of AUS_DEM_LAUF) {
    it(`still bei: ${was}`, () => {
      const fund = pruefeZeile(zeile);
      assert.equal(fund, null,
        `wieder gemeldet: ${fund && fund.wert} (${fund && fund.grund})`);
    });
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 3. Echte Zugangsdaten — der Teil, der beweist, dass nichts blind wurde
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Erfundene, aber FORMECHTE Zugangsdaten.
 *
 * Keiner dieser Werte ist echt — sie tragen Laenge, Zeichenvorrat und Aufbau
 * echter Schluessel. Genau darauf muss die Pruefung reagieren.
 *
 * Die Zeilen sind einzeln freigegeben, damit der Scan diese Datei nicht selbst
 * meldet. Die Freigabe steht an der ZEILE und nicht in einer Ausnahmeliste:
 * so bleibt sie sichtbar, und ein echter Fund anderswo in dieser Datei faellt
 * weiterhin auf.
 */
const ECHTE_SECRETS = [
  ['Session-Secret in .env',
   'SESSION_SECRET=u7Qf2xLp9vRt4Nz8Ka3Wd6Yb1Mc5Hj0Gs7Er4Tv2Pn9Lq6Zx3Bw8Fd5Rk1Jm'], // secret-scan: erlaubt
  ['JWT-Secret in JavaScript',
   'const JWT_SECRET = "Zx3Bw8Fd5Rk1Jm7Qf2xLp9vRt4Nz8Ka3Wd6Yb1Mc5Hj0Gs7Er4Tv2Pn9Lq6U";'], // secret-scan: erlaubt
  ['Stripe-Live-Schluessel',
   'STRIPE_API_KEY=sk__live_51H8xKLMnOpQrStUvWxYz0123456789AbCdEfGhIjKlMnOpQrStUvWxYz'], // secret-scan: erlaubt
  ['Stripe-Webhook-Secret',
   'const STRIPE_WEBHOOK_SECRET = "wh_sec_9KpQmR3nT7vX2wY5zA8bC1dE4fG6hJ0k";'], // secret-scan: erlaubt
  ['GitHub Personal Access Token',
   'GITHUB_TOKEN=gh_p_16C7e42F292c6912E7710c838347Ae178B4a'], // secret-scan: erlaubt
  ['AWS Access Key',
   /* NICHT der Schluessel aus der AWS-Doku: der traegt bauartbedingt das Wort
    * EXAMPLE und ist damit als Vorrichtung erkennbar — als Beleg fuer "echter
    * Schluessel" taugt er nicht. Dies ist die Form eines realen: AK_IA + 16. */
   'AWS_ACCESS_KEY_ID=AK_IA4NZ7QP2XVBM6LKDT'], // secret-scan: erlaubt
  ['Hetzner Cloud Token',
   'HETZNER_CLOUD_TOKEN=LRK9mPq2vN8xW4tY6zB1cD3fG5hJ7kM0nQ2rS4uV6wX8yZ0aB2cD4eF6gH8i'], // secret-scan: erlaubt
  ['Datenbank-Passwort in YAML',
   '      POSTGRES_PASSWORD: kQ7mR2nP9vT4xW6zB1cD3fG5hJ8kL0mN'], // secret-scan: erlaubt
  ['Slack-Bot-Token',
   'SLACK_TOKEN=xo_xb-2401234567890-2401234567890-AbCdEfGhIjKlMnOpQrStUvWx'], // secret-scan: erlaubt
  ['Anthropic-Schluessel',
   'ANTHROPIC_API_KEY=sk-ant-api_03-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789'], // secret-scan: erlaubt
];

describe("Secret-Scan — echte Zugangsdaten fliegen weiterhin auf", () => {
  for (const [was, zeile] of ECHTE_SECRETS) {
    it(`findet: ${was}`, () => {
      const fund = pruefeZeile(zeile);
      assert.notEqual(fund, null,
        `DURCHGERUTSCHT — die Pruefung ist blind fuer: ${zeile}`);
    });
  }

  it("ein echter sk__test_-Schluessel zaehlt trotz 'test' im Wert", () => {
    /* Der Grenzfall, der eine Wortliste aushebeln wuerde: Ein echter
     * Stripe-Testschluessel traegt das Wort "test" im Praefix. Entschieden wird
     * hier nicht ueber Vokabular, sondern ueber das Format — und das erfuellt
     * er. */
    const fund = beurteileWert(
      "sk__test_51H8xKLMnOpQrStUvWxYzAbCdEfGhIjKlMnOpQrStUvWxYz"
    ); // secret-scan: erlaubt
    assert.notEqual(fund, null,
      "ein echter Testschluessel darf nicht am Wort 'test' vorbeirutschen");
  });

  it("die aufsteigende Ziffernfolge verwirft keinen echten Token", () => {
    /* "1234567890" stand zuerst in der Platzhalterliste. Ein echter
     * Slack-Token traegt die Folge mitten in der Team-Kennung — die Liste
     * haette ihn verworfen. Dieser Test haelt die Korrektur fest. */
    const fund = beurteileWert(
      "xo_xb-2401234567890-2401234567890-AbCdEfGhIjKlMnOpQrStUvWx"
    ); // secret-scan: erlaubt
    assert.notEqual(fund, null,
      "die Ziffernfolge macht die Pruefung wieder blind fuer echte Token");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 4. Die Entscheidungsgrenzen selbst
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("Secret-Scan — die Grenzen sind gemessen, nicht geraten", () => {
  it("Entropie trennt Sprache von Zufall", () => {
    const zufall = entropie("u7Qf2xLp9vRt4Nz8Ka3Wd6Yb1Mc5Hj0Gs7Er4Tv2Pn9Lq6Z"); // secret-scan: erlaubt
    const sprache = entropie("bitte_in_produktion_aendern_dieser_wert");
    assert.ok(zufall > 4.5, `Zufallswert nur bei ${zufall.toFixed(2)} bit/Z`);
    assert.ok(sprache < 4.5, `Sprache bereits bei ${sprache.toFixed(2)} bit/Z`);
  });

  it("knapp unter 32 Zeichen zaehlt nicht — das lehnt die Produktion ab", () => {
    /* 31 Zeichen: envValidator.isWeak() verwirft den Wert beim Start. Was
     * keine Produktion annimmt, kann kein Produktions-Secret sein. */
    const kurz = "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p";
    assert.equal(kurz.length, 31);
    assert.equal(beurteileWert(kurz), null);
  });

  it("genau 32 Zeichen mit hoher Entropie zaehlt", () => {
    const grenze = "kQ7mR2nP9vT4xW6zB1cD3fG5hJ8kL0mN"; // secret-scan: erlaubt
    assert.equal(grenze.length, 32);
    assert.notEqual(beurteileWert(grenze), null);
  });

  it("ein Praefix ohne gueltiges Format faellt durch, nicht auf die generische Regel zurueck", () => {
    /* Wer `wh_sec_` schreibt, meint einen Stripe-Schluessel. Erfuellt der Wert
     * dessen Format nicht, ist er eine Vorrichtung — und darf nicht ersatzweise
     * ueber Laenge und Entropie doch noch als Fund gelten. */
    assert.equal(beurteileWert("wh_sec_KURZ"), null);
    assert.equal(beurteileWert("wh_sec_diese_form_gibt_es_bei_stripe_nicht"), null);
  });

  it("Leerzeichen schliessen einen Wert immer aus", () => {
    assert.equal(beurteileWert("dies ist ein satz mit sehr vielen zeichen darin"), null);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 5. Das Repo selbst
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("Secret-Scan — die ausgelieferten Dateien sind sauber", () => {
  /** Genau die Dateien, die die alte Pruefung gemeldet hat. */
  const GEMELDETE = [
    "api/config/index.js",
    "api/routes/payment.js",
    "api/scripts/perf-smoke.js",
    "api/services/staffHetznerService.js",
    "api/test/health.route.coverage.test.js",
    "api/test/integration/payment.webhook.stack.flow.test.js",
    "api/test/integration/rbac.flow.test.js",
    "api/test/m2mAuth.test.js",
    "api/test/prodEnvTemplate.test.js",
    "api/test/systemHealth.test.js",
    "api/test/billingProviderService.test.js",
    "api/test/emailProviderService.test.js",
    "e2e/tests/commercial-subscription-smoke.spec.js",
    "frontend/public/js/pages/landing.js",
    "scripts/collect-infrastructure-snapshot.sh",
    "scripts/release-verify.sh",
    "scripts/scheduler-smoke.sh",
    "sql/migrate.sh",
    "deploy/.env",
  ];

  for (const rel of GEMELDETE) {
    it(`${rel} meldet nichts mehr`, () => {
      const abs = path.join(REPO, rel);
      if (!fs.existsSync(abs)) {
        assert.fail(`${rel} fehlt — die Liste passt nicht mehr zum Repo`);
      }
      const funde = pruefeDatei(fs.readFileSync(abs, "utf8"));
      assert.deepEqual(funde, [],
        `${rel} meldet wieder: ` +
        funde.map((f) => `Z${f.zeile} "${f.wert}" (${f.grund})`).join(", "));
    });
  }

  it("diese Testdatei meldet sich nicht selbst", () => {
    /* Der peinlichste Befund des ersten Laufs: Die gepflanzten Werte dieser
     * Datei sind formecht — und haetten damit JEDES Release scheitern lassen.
     * Sie tragen deshalb je eine Zeilen-Freigabe. */
    const funde = pruefeDatei(fs.readFileSync(path.join(HIER, "releaseSecretScan.test.js"), "utf8"));
    assert.deepEqual(funde, [],
      "der eigene Test bringt die Release-Pruefung zu Fall: " +
      funde.map((f) => `Z${f.zeile} "${f.wert}"`).join(", "));
  });

  it("die Pruefung liest wirklich etwas — Gegenprobe", () => {
    /* Ohne diese Probe koennte pruefeDatei() stillschweigend an jeder Datei
     * scheitern und alle Tests darueber waeren gruen, ohne je etwas geprueft zu
     * haben. Dieselbe Falle wie beim CRLF-Fehler in composeStartfaehig. */
    const funde = pruefeDatei(
      "harmlos = 1\nSESSION_SECRET=u7Qf2xLp9vRt4Nz8Ka3Wd6Yb1Mc5Hj0Gs7Er4Tv2Pn9Lq6Z\nauch harmlos" // secret-scan: erlaubt
    );
    assert.equal(funde.length, 1, "die Datei-Pruefung findet nichts mehr");
    assert.equal(funde[0].zeile, 2, "die Zeilennummer stimmt nicht");
  });

  it("CRLF verfaelscht Laenge und Entropie nicht", () => {
    /* Ein angehaengtes Wagenruecklauf-Zeichen wuerde einen 31-Zeichen-Wert auf
     * 32 heben und damit einen Fehlalarm erzeugen — auf Windows bei jedem Lauf. */
    const kurz = "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p";      // 31 Zeichen
    assert.equal(kurz.length, 31);
    const funde = pruefeDatei(`MY_SECRET=${kurz}\r\nnaechste Zeile`);
    assert.deepEqual(funde, [],
      "das Wagenruecklauf-Zeichen wird in den Wert gezogen");
  });

  it("die Freigabe wirkt nur auf ihrer eigenen Zeile", () => {
    /* Sonst waere sie ein Generalschluessel: Ein Kommentar am Dateianfang
     * wuerde alles darunter unsichtbar machen. */
    const inhalt =
      "A_SECRET=u7Qf2xLp9vRt4Nz8Ka3Wd6Yb1Mc5Hj0Gs7Er4Tv2Pn9Lq6Z // secret-scan: erlaubt\n" +
      "B_SECRET=LRK9mPq2vN8xW4tY6zB1cD3fG5hJ7kM0nQ2rS4uV6wX8yZ0a"; // secret-scan: erlaubt
    /* Die Freigabe steht hinter dem Semikolon, NICHT in der Zeichenkette: So
     * ueberspringt der Scan diese Quellzeile, waehrend der gepruefte Text sie
     * nicht enthaelt — der Kontrollfall bleibt also ein Fund. Stuende sie
     * innerhalb der Anfuehrungszeichen, wuerde dieser Test sich selbst
     * entwaffnen und dabei gruen bleiben. */
    const funde = pruefeDatei(inhalt);
    assert.equal(funde.length, 1, "die Freigabe greift ueber ihre Zeile hinaus");
    assert.equal(funde[0].zeile, 2);
  });
});
