/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DIE ROUTE DER WIRKUNGSVORSCHAU (U6.2b)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * DIESE DATEI EXISTIERT WEGEN EINER ENTWISCHTEN RÜCKMUTATION.
 *
 * Unter den 28 Rückmutationen dieser Welle ist genau eine durchgekommen, und
 * zwar diese: die Route liest die Org nicht mehr aus dem geprüften Eintrag,
 * sondern aus der Anfrage —
 *
 *     req.query.org_id || existing.client_org_id
 *
 * Der Org-Grenzen-Wächter blieb grün, weil er die Route ohne `?org_id=` aufruft:
 * der Fallback greift, die Antwort ist richtig, und die 403 für die fremde Org
 * kommt weiterhin. Die Lücke wird erst sichtbar, wenn jemand den Parameter
 * SETZT: dann besteht der Aufrufer die Grenzprüfung auf dem EINTRAG (der ist ja
 * sein eigener) und bekommt anschliessend die Zahlen einer FREMDEN Org —
 * Rahmenverträge, laufende Einsätze, Konditionskarten.
 *
 * Das ist keine theoretische Mutation. Es ist das Muster „Prüfung auf A,
 * Ausführung mit B", und es ist in dieser Codebasis schon mehrfach
 * aufgetreten. Ein Wächter, der nur den Normalfall fährt, kann es nicht sehen.
 *
 * Geprüft wird deshalb nicht die Antwort, sondern die BINDUNG: mit welchen
 * Parametern die Abfrage wirklich losgeht. Eine Zusicherung auf den
 * Rückgabewert wäre hier wertlos — der Muster-Pool liefert ohnehin, was man ihm
 * sagt.
 *
 * Run: node --test --test-force-exit test/wirkungsvorschauRoute.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  mockReq, mockRes, noop, baseDeps, findHandlerExact, ORG_A, ORG_B, USER_A
} from "./helpers/security-mocks.js";
import { createVendorPoolRouter } from "../routes/vendorPool.js";

const EINTRAG = "vp-u62b-1";
const LIEFERANT = "sup-u62b-1";

/**
 * Pool, der jede Abfrage mitschreibt. Die erste Abfrage ist `getEntry`, die
 * zweite die Vorschau — getrennt erkennbar an ihrem Text, nicht an der
 * Reihenfolge: eine Zusicherung auf "die zweite Abfrage" würde bei einer
 * zusätzlichen Abfrage leise auf die falsche zeigen.
 */
function spion(eintrag) {
  return {
    calls: [],
    async query(sql, params) {
      this.calls.push({ sql, params });
      if (/FROM vendor_pool vp\s/i.test(sql) && /vp\.id = \$1/i.test(sql)) {
        return { rows: eintrag ? [eintrag] : [] };
      }
      return { rows: [{ konditionskarten: 2, rahmenvertraege: 1, einsaetze_aus_abschluss: 0, laufende_einsaetze: 3, offene_verteilungen: 0 }] };
    },
    vorschau() {
      return this.calls.find(c => /AS konditionskarten/i.test(c.sql)) || null;
    }
  };
}

const eintragA = {
  id: EINTRAG, client_org_id: ORG_A, supplier_org_id: LIEFERANT,
  tier: "PREFERRED", status: "active"
};

describe("U6.2b · GET /vendor-pool/:id/wirkung", () => {
  it("die Vorschau wird mit der Org DES EINTRAGS gerechnet, nie mit einer aus der Anfrage", async () => {
    /*
     * DIE ZUSICHERUNG, DIE DIE ENTWISCHTE RÜCKMUTATION FÄNGT. Die Anfrage bringt
     * eine FREMDE Org in Query und Body mit — beide müssen wirkungslos bleiben.
     */
    const pool = spion(eintragA);
    const router = createVendorPoolRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "get", "/vendor-pool/:id/wirkung");
    assert.ok(handler, "die Route ist nicht da");

    const req = mockReq({
      orgId: ORG_A,
      session: { userId: USER_A },
      params: { id: EINTRAG },
      query: { org_id: ORG_B, client_org_id: ORG_B, supplier_org_id: ORG_B },
      body: { org_id: ORG_B }
    });
    const res = mockRes();
    await handler(req, res, noop);

    const v = pool.vorschau();
    assert.ok(v, "die Vorschau-Abfrage wurde nicht abgesetzt");
    /*
     * Die ersten ZWEI Bindungen sind Kunde und Lieferant; die dritte ist der
     * Stichtag, der mit U6.2a hinzukam (die Stufen-Teilabfrage bezieht ihre
     * Bedingung seit dann aus `poolBedingungenSql` und prüft damit auch das
     * Gültigkeitsfenster). Genau das hat das volle Tor hier gefangen: ich hatte
     * nach dem Umbau die Form- und die DB-Probe erneut laufen lassen, diese
     * Routen-Probe aber nicht — ein `deepEqual` auf die ganze Parameterliste ist
     * gegen eine legitime neue Bindung spröde. Geprüft wird jetzt, was die
     * Zusicherung meint: WELCHE Org gebunden wird.
     */
    assert.deepEqual(v.params.slice(0, 2), [ORG_A, LIEFERANT],
      "die Vorschau wurde mit einer Org aus der ANFRAGE gerechnet statt mit der " +
      "des geprüften Eintrags — wer seinen eigenen Eintrag kennt, liest damit " +
      "die Geschäftszahlen einer fremden Org");
    assert.ok(!JSON.stringify(v.params).includes(ORG_B),
      "die fremde Org taucht in den Bindungen auf");
  });

  it("eine fremde Org bekommt 403 und es wird GAR NICHT gerechnet", async () => {
    /* Nicht nur der Statuscode: die Vorschau darf nicht einmal abgesetzt
       werden. Eine Route, die erst rechnet und dann 403 schickt, hat die Zahlen
       bereits aus der Datenbank geholt — und bei einem späteren Umbau der
       Antwort steht sie dann im Körper. */
    const pool = spion(eintragA);
    const router = createVendorPoolRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "get", "/vendor-pool/:id/wirkung");
    const req = mockReq({ orgId: ORG_B, session: { userId: USER_A }, params: { id: EINTRAG } });
    const res = mockRes();
    await handler(req, res, noop);

    assert.equal(res._status, 403);
    assert.equal(res._json.error, "ORG_BOUNDARY_VIOLATION");
    assert.equal(pool.vorschau(), null,
      "die Vorschau wurde trotz 403 gerechnet");
  });

  it("der LIEFERANT darf die Vorschau nicht lesen — anders als den Eintrag selbst", async () => {
    /*
     * BEWUSSTE ASYMMETRIE, und darum geprüft: `GET /vendor-pool/:id` daneben ist
     * ZWEISEITIG (client ODER supplier), weil der Lieferant seine eigene
     * Zugehörigkeit sehen darf. Die Vorschau ist EINSEITIG: sie nennt Zahlen zu
     * Rahmenverträgen und laufenden Einsätzen des KUNDEN. Ein Lieferant, der sie
     * liest, erfährt die Geschäftslage seines Auftraggebers — und aus
     * `bleibt_partner: false` sogar, dass er ohne Vertrag dasteht.
     *
     * Wer diese Route später "zur Einheitlichkeit" an die Nachbarroute
     * angleicht, macht daraus ein Leck. Diese Probe steht dagegen.
     */
    const pool = spion(eintragA);
    const router = createVendorPoolRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "get", "/vendor-pool/:id/wirkung");
    const req = mockReq({ orgId: LIEFERANT, session: { userId: USER_A }, params: { id: EINTRAG } });
    const res = mockRes();
    await handler(req, res, noop);

    assert.equal(res._status, 403,
      "der Lieferant bekommt die Wirkungsvorschau seines Kunden zu sehen");
    assert.equal(pool.vorschau(), null);
  });

  it("ein unbekannter Eintrag ist 404, nicht 200 mit leeren Zahlen", async () => {
    const pool = spion(null);
    const router = createVendorPoolRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "get", "/vendor-pool/:id/wirkung");
    const req = mockReq({ orgId: ORG_A, session: { userId: USER_A }, params: { id: "gibtsnicht" } });
    const res = mockRes();
    await handler(req, res, noop);

    assert.equal(res._status, 404);
    assert.equal(pool.vorschau(), null);
  });

  it("die Antwort nennt den Eintrag, auf den sie sich bezieht", async () => {
    /* Ohne Bezug kann die Oberfläche eine Antwort nicht einer Zeile zuordnen —
       und bei zwei schnell aufeinander geöffneten Dialogen zeigt sie die Folge
       des falschen Lieferanten. Die Oberfläche prüft das zusätzlich selbst
       (Zielwechsel während des Ladens), aber der Bezug muss aus der Antwort
       kommen, nicht aus der Hoffnung. */
    const pool = spion(eintragA);
    const router = createVendorPoolRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "get", "/vendor-pool/:id/wirkung");
    const req = mockReq({ orgId: ORG_A, session: { userId: USER_A }, params: { id: EINTRAG } });
    const res = mockRes();
    await handler(req, res, noop);

    assert.equal(res._json.entry_id, EINTRAG);
    assert.equal(res._json.supplier_org_id, LIEFERANT);
    assert.equal(res._json.tier, "PREFERRED");
    assert.equal(typeof res._json.wirkung, "object");
    assert.equal(res._json.wirkung.konditionskarten, 2);
    assert.equal(res._json.wirkung.bleibt_partner, true, "1 Rahmenvertrag hält die Partnerschaft");
  });

  it("die Route trägt dieselben Riegel wie die Handlung, nicht die eines Lesepfads", () => {
    /*
     * Die Antwort nennt Geschäftszahlen. Wer sie sehen darf, ist genau der, der
     * auch entfernen darf — `vendor_pool.manage`, nicht `.view`. Geprüft wird
     * die KETTE der Route, nicht der Quelltext: ein Muster auf die Datei hätte
     * auch angeschlagen, wenn das Recht an einer anderen Route steht.
     */
    const pool = spion(eintragA);
    const router = createVendorPoolRouter(baseDeps(pool));
    const schicht = router.stack.find(s => s.route
      && s.route.path === "/vendor-pool/:id/wirkung"
      && s.route.methods.get);
    assert.ok(schicht, "die Route ist nicht im Router");
    const namen = schicht.route.stack.map(s => s.handle.name || "(anonym)");
    /* requirePermission liefert eine benannte oder anonyme Middleware; geprüft
       wird die ANZAHL der Riegel gegen die der DELETE-Route daneben: beide
       müssen gleich viele tragen. Fällt einer weg, bricht die Zahl. */
    const deleteSchicht = router.stack.find(s => s.route
      && s.route.path === "/vendor-pool/:id"
      && s.route.methods.delete);
    assert.ok(deleteSchicht, "die DELETE-Route als Vergleich ist nicht da");
    assert.equal(
      schicht.route.stack.length, deleteSchicht.route.stack.length,
      "die Vorschau trägt " + schicht.route.stack.length + " Riegel, das Entfernen " +
      deleteSchicht.route.stack.length + " — die Vorschau zeigt dieselben Zahlen " +
      "und muss dieselben Riegel tragen (Riegel der Vorschau: " + namen.join(", ") + ")"
    );
  });
});
