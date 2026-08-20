/**
 * Shared Security Test Utilities
 *
 * Deterministic, database-free mock factories for security regression tests.
 * All security test suites import from this single module.
 *
 * Usage:
 *   import { USER_A, ORG_B, membership, mockReq, ... } from "../helpers/security-mocks.js";
 */

// ── Standard identifiers for two-tenant testing ─────────────────────────────

export const USER_A = "user-alpha-001";
export const USER_B = "user-beta-002";
export const ORG_A  = "org-alpha-001";
export const ORG_B  = "org-beta-002";

// ── Membership fixture factory ──────────────────────────────────────────────

/**
 * Create an org membership fixture for a given role.
 * @param {string} role - e.g. "owner", "admin", "member", "viewer"
 * @param {string} [userId=USER_A]
 * @param {string} [orgId=ORG_A]
 */
export function membership(role, userId = USER_A, orgId = ORG_A) {
  return {
    user_id: userId,
    org_id: orgId,
    role_key: role,
    is_active: true,
    org_name: `Test Org (${orgId.slice(-3)})`,
    org_type: "company",
    org_plan: "PRO"
  };
}

/** Alias matching the spec name: mockOrgMembership */
export const mockOrgMembership = membership;

/** Pre-built membership fixtures for common test scenarios. */
export const MEMBERSHIPS = {
  ownerA:     membership("owner",            USER_A, ORG_A),
  adminA:     membership("admin",            USER_A, ORG_A),
  managerA:   membership("program_manager",  USER_A, ORG_A),
  hiringA:    membership("hiring_manager",   USER_A, ORG_A),
  supplierA:  membership("supplier_manager", USER_A, ORG_A),
  financeA:   membership("finance",          USER_A, ORG_A),
  recruiterA: membership("recruiter",        USER_A, ORG_A),
  memberA:    membership("member",           USER_A, ORG_A),
  viewerA:    membership("viewer",           USER_A, ORG_A),
  ownerB:     membership("owner",            USER_B, ORG_B),
  memberB:    membership("member",           USER_B, ORG_B),
  viewerB:    membership("viewer",           USER_B, ORG_B),
};

// ── Pool mocks ──────────────────────────────────────────────────────────────

/** Mock pool returning the same rows for every query. */
export function returnPool(rows = []) {
  return { query: async () => ({ rows }) };
}

/** Alias matching the spec name: mockPoolQuery */
export const mockPoolQuery = returnPool;

/** Mock pool returning responses in call order. Throws on unexpected calls. */
export function sequencePool(...responses) {
  let idx = 0;
  return {
    query: async () => {
      if (idx >= responses.length) throw new Error(`Unexpected query #${idx + 1}`);
      return responses[idx++];
    }
  };
}

// ── Logger mock ─────────────────────────────────────────────────────────────

export function mockLogger() {
  const calls = { warn: [], error: [] };
  return {
    info() {}, debug() {}, trace() {}, fatal() {},
    warn(...a)  { calls.warn.push(a); },
    error(...a) { calls.error.push(a); },
    calls
  };
}

// ── Request / Response mocks ────────────────────────────────────────────────

/** Create a mock session. */
export function mockSession(overrides = {}) {
  return { userId: USER_A, ...overrides };
}

/** Create a mock user object. */
export function mockUser(overrides = {}) {
  return { id: USER_A, email: "test@example.com", role: "company", ...overrides };
}

/** Create a mock Express request with sensible defaults. */
export function mockReq(overrides = {}) {
  return {
    session: mockSession(),
    headers: {},
    query: {},
    body: {},
    params: {},
    orgId: ORG_A,
    orgRole: "owner",
    orgMembership: MEMBERSHIPS.ownerA,
    user: { id: USER_A },
    ...overrides
  };
}

/** Create a mock Express response. */
export function mockRes() {
  const res = {
    _status: 200,
    _json: null,
    locals: {},
    status(code) { res._status = code; return res; },
    json(data)   { res._json = data;   return res; },
    setHeader()  { return res; },
    send()       { return res; }
  };
  return res;
}

// ── Middleware stubs ─────────────────────────────────────────────────────────

/** Pass-through requireAuth for route factory injection. */
export const requireAuth = (_req, _res, next) => next();

/** No-op callback for next(). */
export const noop = () => {};

// ── Route factory helpers ───────────────────────────────────────────────────

/** Base dependency object for route factories. */
export function baseDeps(pool, extras = {}) {
  return {
    pool: pool || returnPool(),
    requireAuth,
    logger: mockLogger(),
    config: {},
    ...extras
  };
}

/** Extract the final handler from a route (exact path match). */
export function findHandlerExact(router, method, path) {
  for (const layer of router.stack) {
    if (layer.route && layer.route.path === path) {
      const routeMethod = Object.keys(layer.route.methods)[0];
      if (routeMethod === method) {
        return layer.route.stack.map(s => s.handle).pop();
      }
    }
  }
  throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
}

/** Count middleware functions in a route's stack. RBAC routes have >= 3 (auth + permission + handler). */
export function getMiddlewareCount(router, method, path) {
  for (const layer of router.stack) {
    if (layer.route && layer.route.path === path) {
      const routeMethod = Object.keys(layer.route.methods)[0];
      if (routeMethod === method) {
        return layer.route.stack.length;
      }
    }
  }
  return 0;
}

/** Enumerate all routes in a router. */
export function listRoutes(router) {
  const routes = [];
  for (const layer of router.stack) {
    if (layer.route) {
      routes.push({
        method: Object.keys(layer.route.methods)[0],
        path: layer.route.path,
        middlewareCount: layer.route.stack.length
      });
    }
  }
  return routes;
}

/**
 * Die Kette einer Route ab einem BENANNTEN Middleware ausfuehren.
 *
 * Warum das noetig ist: `findHandlerExact` liefert nur den letzten Handler.
 * Steht die Mandantengrenze in einem vorgelagerten Middleware (in
 * `organizations.js` heisst es `sameOrgParam`), sieht eine Probe auf dem
 * Handler sie nicht — und meldet eine bewachte Route als Luecke. Genau dieser
 * blinde Fleck steht als Fallstrick 5 im Plan H2.
 *
 * Ausgefuehrt wird ab dem benannten Middleware bis zum Ende der Kette, wobei
 * die dazwischenliegenden anonymen Gates (requirePermission, requireOrgFeature,
 * requireOrgLimit — sie brauchen eine echte Datenbank) uebersprungen werden.
 * Der Name ist eine BINDUNG an den Bestand: verschwindet der Middleware aus der
 * Kette, wirft diese Funktion.
 */
/**
 * Ein per `router.use(praefix, ...)` montiertes Middleware finden.
 *
 * WARUM ES DAS BRAUCHT: `support.js` setzt sein Tor nicht je Route, sondern
 * einmal auf dem Praefix (`router.use("/support", ..., supportAuth)`). Das ist
 * die STRENGERE Bauart — auf einer neuen Route kann man es nicht vergessen —,
 * aber ein Test, der nur `route.stack` liest, sieht es nicht und haelt die
 * Flaeche faelschlich fuer ungeschuetzt.
 *
 * Gibt `{ handler, praefix }` zurueck oder null.
 */
export function findPrefixMiddleware(router, mwName) {
  for (const layer of router.stack) {
    if (layer.route) continue;
    const handler = layer.handle;
    if (typeof handler !== "function" || handler.name !== mwName) continue;
    // Express speichert den Montagepfad nur als Regexp; die Rohform steht in
    // layer.regexp.source. Fuer die Abdeckungspruefung reicht der Test selbst.
    return { handler, deckt: (pfad) => layer.regexp.test(pfad.split("?")[0]) };
  }
  return null;
}

export function findChainFrom(router, method, path, mwName) {
  for (const layer of router.stack) {
    if (!layer.route || layer.route.path !== path) continue;
    if (Object.keys(layer.route.methods)[0] !== method) continue;

    const stack = layer.route.stack.map((s) => s.handle);
    const start = stack.findIndex((h) => h.name === mwName);
    let kette;
    if (start === -1) {
      // Zweite Bauart: das Tor haengt am Praefix statt an der Route.
      const praefix = findPrefixMiddleware(router, mwName);
      if (!praefix) {
        throw new Error(
          `Route ${method.toUpperCase()} ${path} traegt keinen Middleware '${mwName}' mehr — ` +
          "weder auf der Route noch auf dem Praefix. Das Register behauptet, dort liege die Grenze."
        );
      }
      if (!praefix.deckt(path)) {
        throw new Error(
          `Route ${method.toUpperCase()} ${path} liegt AUSSERHALB des Praefixes, auf dem ` +
          `'${mwName}' montiert ist — sie steht damit offen.`
        );
      }
      kette = [praefix.handler, stack[stack.length - 1]];
    } else {
      kette = [stack[start], stack[stack.length - 1]];
    }
    return async (req, res, next) => {
      for (const fn of kette) {
        let weiter = false;
        let fehler = null;
        await fn(req, res, (err) => { if (err) fehler = err; else weiter = true; });
        if (fehler) return next(fehler);
        if (!weiter) return;          // dieser Schritt hat geantwortet
      }
    };
  }
  throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
}

/**
 * Routen aufzaehlen — INKLUSIVE der per `router.use(pfad, subRouter)` montierten.
 *
 * WARUM ES DAS BRAUCHT: `listRoutes` sieht nur `layer.route`. Eine Datei, die
 * ausschliesslich Sub-Router montiert, meldet damit **null Routen** — und waere
 * im Register still als "abgedeckt, nichts zu pruefen" durchgegangen.
 * `routes/ownerControlCenter.js` ist genau so gebaut: 13 Sub-Router unter
 * `routes/occ/`, kein einziger eigener Endpunkt. Ein Waechter, der das nicht
 * sieht, bewacht eine Flaeche, die es an dieser Stelle gar nicht gibt.
 *
 * Der Montagepfad laesst sich aus `layer.regexp` nicht verlaesslich
 * zurueckrechnen. Er wird auch nicht gebraucht: fuer die Vollstaendigkeitsfrage
 * zaehlt, OB es Platzhalter-Routen gibt und wie sie heissen — nicht, unter
 * welchem Praefix sie haengen. Deshalb `montiert: true` statt eines geratenen
 * Pfades.
 */
/**
 * Den Montagepfad aus der Express-Regexp zurueckgewinnen.
 *
 * Express behaelt den rohen Pfad einer `router.use(pfad, ...)`-Schicht nicht —
 * nur die daraus gebaute Regexp. Ohne diese Rueckgewinnung meldet
 * `listRoutesTief` die INNEREN Pfade ("/bootstrap") statt der aufrufbaren
 * ("/owner-control/bootstrap"). Jede Pruefung der Form "liegt diese Route unter
 * dem Tor?" waere damit wertlos: sie verglaeche gegen einen Pfad, den es nach
 * aussen gar nicht gibt.
 *
 * Nur statische Praefixe werden zurueckgegeben. Traegt der Montagepfad selbst
 * einen Platzhalter, gibt es hier "" zurueck — lieber kein Praefix als ein
 * falsches, denn ein falsches Praefix wuerde eine ungeschuetzte Route als
 * geschuetzt ausweisen.
 */
function montagepfad(layer) {
  const quelle = layer?.regexp?.source;
  if (!quelle) return "";
  // Form: ^\/owner-control\/?(?=\/|$)   bzw.  ^\/?(?=\/|$)  fuer die Wurzel
  const kern = quelle
    .replace(/^\^/, "")
    .replace(/\\\/\?\(\?=\\\/\|\$\)$/, "")
    .replace(/\$$/, "");
  if (!kern || kern === "\\/") return "";
  const pfad = kern.replace(/\\(.)/g, "$1");
  // Ein Platzhalter im Montagepfad (Regexp-Sonderzeichen uebrig) waere geraten.
  if (/[()[\]{}*+?|^$]/.test(pfad)) return "";
  return pfad.startsWith("/") ? pfad : "";
}

export function listRoutesTief(router, tiefe = 0, praefix = "") {
  const routen = [];
  if (tiefe > 5) return routen;                 // Schleifenschutz
  for (const layer of router.stack || []) {
    if (layer.route) {
      routen.push({
        method: Object.keys(layer.route.methods)[0],
        path: praefix + layer.route.path,
        innerPath: layer.route.path,
        middlewareCount: layer.route.stack.length,
        montiert: tiefe > 0
      });
      continue;
    }
    // Ein montierter Sub-Router: express legt ihn als handle mit eigenem stack ab.
    const unter = layer.handle;
    if (unter && typeof unter === "function" && Array.isArray(unter.stack)) {
      routen.push(...listRoutesTief(unter, tiefe + 1, praefix + montagepfad(layer)));
    }
  }
  return routen;
}
