/**
 * openapi/registry.js — Single Source der API-Spezifikation: generiert OpenAPI 3.0.3
 * DIREKT aus den echten Zod-Schemas (api/middleware/validate.js → Schemas). Damit kann
 * die Doku NIE mehr von der Validierung driften (A.2, beendet den Doku-Drift strukturell).
 *
 * BUILD-TIME-ISOLIERT: Dieses Modul ruft extendZodWithOpenApi() und wird AUSSCHLIESSLICH
 * vom Generator-Script (scripts/generate-openapi.js) und vom Drift-Test importiert —
 * NIEMALS von app.js/server.js. Die laufende App serviert nur die fertige openapi/spec.json.
 * → null Produktions-Runtime-Effekt, keine neue Runtime-Dependency.
 *
 * ZUKUNFTSSICHER: Neue Endpunkte hier in PATHS ergaenzen (oder neue Schemas in validate.js
 * registrieren sich automatisch als Components). Coverage waechst inkrementell ohne Refactor.
 */

import { z } from "zod";
import { extendZodWithOpenApi, OpenAPIRegistry, OpenApiGeneratorV3 } from "@asteasolutions/zod-to-openapi";
import { Schemas } from "../middleware/validate.js";

extendZodWithOpenApi(z);

const CATALOG_VERSION = "2.0.0";

/* ── Wiederverwendbare Fehler-Hülle (Plattform-Standard) ────────────────────── */
const ErrorResponse = z.object({
  error: z.string().openapi({ example: "VALIDATION" }),
  message: z.string().optional(),
  code: z.string().optional(),
  details: z.array(z.unknown()).optional()
}).openapi("ErrorResponse");

/** Standard-Fehlerantworten für geschützte, mutierende Endpunkte. */
function stdErrors(extra = {}) {
  const base = {
    400: { description: "Validierungsfehler", content: { "application/json": { schema: ErrorResponse } } },
    401: { description: "Nicht authentifiziert", content: { "application/json": { schema: ErrorResponse } } },
    403: { description: "Keine Berechtigung / Org-Boundary", content: { "application/json": { schema: ErrorResponse } } },
    429: { description: "Rate-Limit erreicht", content: { "application/json": { schema: ErrorResponse } } }
  };
  return { ...base, ...extra };
}

/**
 * Baut das vollständige OpenAPI-3.0.3-Dokument aus der Registry.
 * @returns {object} OpenAPI-Dokument (JSON-serialisierbar)
 */
export function buildOpenApiDocument() {
  const registry = new OpenAPIRegistry();

  // ── Security-Schemes: 3 reale Auth-Wege der Plattform ──
  const sessionCookie = registry.registerComponent("securitySchemes", "sessionCookie", {
    type: "apiKey", in: "cookie", name: "tc.sid",
    description: "Plattform-Session-Cookie (Login via POST /auth/login)."
  });
  const csrfToken = registry.registerComponent("securitySchemes", "csrfToken", {
    type: "apiKey", in: "header", name: "x-csrf-token",
    description: "CSRF-Token (GET /csrf) — Pflicht bei allen mutierenden Requests."
  });
  registry.registerComponent("securitySchemes", "apiKey", {
    type: "http", scheme: "bearer",
    description: "Maschinen-API-Key (Bearer) für Integrationen; Scopes default-deny."
  });

  // ── Components: ALLE zentralen Zod-Schemas automatisch registrieren ──
  // Flach in validate.js → 1:1 als benannte Components. Neue Schemas erscheinen automatisch.
  const components = {};
  for (const [name, schema] of Object.entries(Schemas)) {
    if (schema && typeof schema.safeParse === "function") {
      const compName = name.charAt(0).toUpperCase() + name.slice(1);
      components[name] = registry.register(compName, schema);
    }
  }

  const sessionSec = [{ [sessionCookie.name]: [] }, { [csrfToken.name]: [] }];
  // Daten-Endpunkte akzeptieren Session (Cookie+CSRF) ODER Maschinen-API-Key (Bearer + Scope).
  const dataSec = [...sessionSec, { apiKey: [] }];
  const scopeNote = (scope) => ` · API-Key-Scope: \`${scope}\``;
  const jsonBody = (schema) => ({ content: { "application/json": { schema } }, required: true });
  const okJson = (desc, schema) => ({ description: desc, content: { "application/json": { schema: schema || z.object({}).openapi("OkResponse") } } });
  const notFound = { 404: { description: "Nicht gefunden / Org-fremd", content: { "application/json": { schema: ErrorResponse } } } };
  const csvText = z.string().openapi("CsvExport");
  const csvOk = (desc) => ({ description: desc, content: { "text/csv": { schema: csvText } } });

  // ── Pfade: kuratierte Kern-Endpunkte (referenzieren die echten Schemas) ──
  // Zukunftssicher: weitere Pfade hier ergänzen; Request-Bodies bleiben an die Zod-Wahrheit gebunden.

  registry.registerPath({
    method: "post", path: "/auth/register", tags: ["Auth"], summary: "Registrierung (Unternehmen/Agentur/Worker)",
    request: { body: jsonBody(components.register) },
    responses: { 201: okJson("Registriert + eingeloggt"), ...stdErrors() }
  });
  registry.registerPath({
    method: "post", path: "/auth/login", tags: ["Auth"], summary: "Login",
    request: { body: jsonBody(components.login) },
    responses: { 200: okJson("Eingeloggt"), ...stdErrors() }
  });
  registry.registerPath({
    method: "post", path: "/me/password", tags: ["Auth"], summary: "Passwort ändern", security: sessionSec,
    request: { body: jsonBody(components.passwordChange) },
    responses: { 200: okJson("Passwort geändert"), ...stdErrors() }
  });

  registry.registerPath({
    method: "post", path: "/organizations", tags: ["Organizations"], summary: "Organisation anlegen", security: sessionSec,
    request: { body: jsonBody(components.organizationCreate) },
    responses: { 201: okJson("Organisation angelegt"), ...stdErrors() }
  });
  registry.registerPath({
    method: "post", path: "/org/members/invite", tags: ["Organizations"], summary: "Mitglied einladen", security: sessionSec,
    request: { body: jsonBody(components.inviteMember) },
    responses: { 201: okJson("Einladung versendet"), ...stdErrors() }
  });

  registry.registerPath({
    method: "get", path: "/requisitions", tags: ["Requisitions"], summary: "Bedarfe auflisten", security: sessionSec,
    request: { query: components.pagination },
    responses: { 200: okJson("Liste der Bedarfe"), ...stdErrors() }
  });
  registry.registerPath({
    method: "post", path: "/requisitions", tags: ["Requisitions"], summary: "Bedarf anlegen", security: sessionSec,
    request: { body: jsonBody(components.requisitionCreate) },
    responses: { 201: okJson("Bedarf angelegt"), ...stdErrors() }
  });

  registry.registerPath({
    method: "post", path: "/capacity-exchange/entries", tags: ["Marketplace"], summary: "Personal/Kapazität einstellen", security: sessionSec,
    request: { body: jsonBody(components.capacityPostCreate) },
    responses: { 201: okJson("Kapazität veröffentlicht"), ...stdErrors() }
  });
  registry.registerPath({
    method: "post", path: "/marketplace/capacity-posts/{id}/accept-deal", tags: ["Marketplace"], summary: "Deal-Konditionen zustimmen", security: sessionSec,
    request: { params: z.object({ id: z.string().uuid() }).openapi("CapacityIdParam"), body: jsonBody(components.dealCreate) },
    responses: { 200: okJson("Deal gestartet"), 404: { description: "Nicht gefunden", content: { "application/json": { schema: ErrorResponse } } }, ...stdErrors() }
  });

  registry.registerPath({
    method: "post", path: "/timesheets", tags: ["Timesheets"], summary: "Stundenzettel einreichen", security: sessionSec,
    request: { body: jsonBody(components.timesheetSubmit) },
    responses: { 201: okJson("Stundenzettel angelegt"), ...stdErrors() }
  });

  registry.registerPath({
    method: "post", path: "/payment/checkout", tags: ["Billing"], summary: "Plan buchen (Checkout)", security: sessionSec,
    request: { body: jsonBody(components.paymentCheckout) },
    responses: { 200: okJson("Checkout-Session erstellt"), ...stdErrors() }
  });

  // ── Integrations-Vertrag: maschinenlesbare Daten-Endpunkte (Session ODER API-Key + Scope) ──
  // Diese Endpunkte sind der dokumentierte Andock-Punkt fuer SAP/HR/Lohn-Systeme.
  const idParam = { params: components.uuidParam };

  // Workers (Personalstamm)
  registry.registerPath({ method: "get", path: "/workers", tags: ["Workers"], summary: "Mitarbeiter auflisten" + scopeNote("read:workers"), security: dataSec, request: { query: components.pagination }, responses: { 200: okJson("Liste der Mitarbeiter"), ...stdErrors() } });
  registry.registerPath({ method: "get", path: "/workers/{id}", tags: ["Workers"], summary: "Mitarbeiter-Detail" + scopeNote("read:workers"), security: dataSec, request: idParam, responses: { 200: okJson("Mitarbeiter"), ...notFound, ...stdErrors() } });

  // Assignments (Einsaetze)
  registry.registerPath({ method: "get", path: "/assignments", tags: ["Assignments"], summary: "Einsaetze auflisten" + scopeNote("read:assignments"), security: dataSec, request: { query: components.pagination }, responses: { 200: okJson("Liste der Einsaetze"), ...stdErrors() } });
  registry.registerPath({ method: "get", path: "/assignments/{id}", tags: ["Assignments"], summary: "Einsatz-Detail" + scopeNote("read:assignments"), security: dataSec, request: idParam, responses: { 200: okJson("Einsatz"), ...notFound, ...stdErrors() } });

  // Timesheets (Stundenzettel — Kern fuer Lohn-Export)
  registry.registerPath({ method: "get", path: "/timesheets", tags: ["Timesheets"], summary: "Stundenzettel auflisten (Filter: status, supplier_org_id, week_start_from/to)" + scopeNote("read:timesheets"), security: dataSec, request: { query: components.pagination }, responses: { 200: okJson("Liste der Stundenzettel"), ...stdErrors() } });
  registry.registerPath({ method: "get", path: "/timesheets/{id}", tags: ["Timesheets"], summary: "Stundenzettel-Detail (inkl. Tageseintraege)" + scopeNote("read:timesheets"), security: dataSec, request: idParam, responses: { 200: okJson("Stundenzettel"), ...notFound, ...stdErrors() } });
  registry.registerPath({ method: "get", path: "/timesheets/export/csv", tags: ["Timesheets"], summary: "Stundenzettel als CSV exportieren" + scopeNote("read:timesheets"), security: dataSec, responses: { 200: csvOk("CSV-Datei (Stundenzettel)"), ...stdErrors() } });
  registry.registerPath({ method: "get", path: "/timesheets/export/datev-lohn", tags: ["Timesheets"], summary: "DATEV-Lohn-Bewegungsdaten (freigegebene Stunden je Mitarbeiter/Monat) — Lohnarten aus DATEV-ERP-Mapping" + scopeNote("read:timesheets"), security: dataSec, responses: { 200: { description: "DATEV-Lohn-Bewegungsdaten (ISO-8859-1)", content: { "text/csv": { schema: csvText } } }, ...stdErrors() } });
  registry.registerPath({ method: "post", path: "/timesheets/{id}/approve", tags: ["Timesheets"], summary: "Stundenzettel freigeben" + scopeNote("write:timesheets"), security: dataSec, request: idParam, responses: { 200: okJson("Freigegeben"), ...notFound, ...stdErrors() } });

  // Invoices (Rechnungen — Fibu-Export)
  registry.registerPath({ method: "get", path: "/invoices", tags: ["Billing"], summary: "Rechnungen auflisten (Filter: status, supplier_org_id, Zeitraum)" + scopeNote("read:invoices"), security: dataSec, request: { query: components.pagination }, responses: { 200: okJson("Liste der Rechnungen"), ...stdErrors() } });
  registry.registerPath({ method: "get", path: "/invoices/{id}", tags: ["Billing"], summary: "Rechnungs-Detail" + scopeNote("read:invoices"), security: dataSec, request: idParam, responses: { 200: okJson("Rechnung"), ...notFound, ...stdErrors() } });
  registry.registerPath({ method: "get", path: "/invoices/export", tags: ["Billing"], summary: "Rechnungen als CSV exportieren (Fibu/DATEV-Vorstufe)" + scopeNote("read:invoices"), security: dataSec, responses: { 200: csvOk("CSV-Datei (Rechnungen)"), ...stdErrors() } });
  registry.registerPath({ method: "get", path: "/invoices/export/datev", tags: ["Billing"], summary: "Rechnungen als DATEV-Buchungsstapel (EXTF 700) exportieren — Konten/SKR aus dem DATEV-ERP-Mapping" + scopeNote("read:invoices"), security: dataSec, responses: { 200: { description: "DATEV-EXTF-Buchungsstapel (ISO-8859-1)", content: { "text/csv": { schema: csvText } } }, ...stdErrors() } });
  registry.registerPath({ method: "post", path: "/oauth/token", tags: ["Integrations"], summary: "OIDC client_credentials: API-Key → kurzlebiges M2M-Bearer-JWT (nur bei OAUTH_M2M_ENABLED). client_id/client_secret via Form-Body oder HTTP-Basic.", responses: { 200: { description: "access_token (JSON: access_token, token_type=Bearer, expires_in, scope)" }, 400: { description: "unsupported_grant_type / invalid_request" }, 401: { description: "invalid_client" }, 404: { description: "M2M deaktiviert" } } });
  registry.registerPath({ method: "get", path: "/.well-known/openid-configuration", tags: ["Integrations"], summary: "OIDC-Discovery (token_endpoint, unterstützte Grants)", responses: { 200: { description: "OIDC-Provider-Metadaten" } } });

  // Capacity / Requisitions (Read fuer externe Disposition)
  registry.registerPath({ method: "get", path: "/capacity-exchange/feed", tags: ["Marketplace"], summary: "Marktplatz-Feed (Angebot/Nachfrage)" + scopeNote("read:capacity"), security: dataSec, request: { query: components.pagination }, responses: { 200: okJson("Feed"), ...stdErrors() } });
  registry.registerPath({ method: "get", path: "/requisitions/{id}", tags: ["Requisitions"], summary: "Bedarf-Detail" + scopeNote("read:requisitions"), security: dataSec, request: idParam, responses: { 200: okJson("Bedarf"), ...notFound, ...stdErrors() } });

  // Integrationen (Webhook-Abos fuer Outbound-Events an SAP/HR)
  registry.registerPath({ method: "get", path: "/integrations", tags: ["Integrations"], summary: "Webhook-Integrationen auflisten", security: sessionSec, responses: { 200: okJson("Liste der Integrationen"), ...stdErrors() } });
  registry.registerPath({ method: "post", path: "/integrations", tags: ["Integrations"], summary: "Webhook-Integration anlegen (Slack/Teams/HR-System; HMAC-signiert)", security: sessionSec, responses: { 201: okJson("Integration angelegt"), ...stdErrors() } });
  registry.registerPath({ method: "get", path: "/org/api-keys/scopes", tags: ["Integrations"], summary: "Verfuegbare API-Key-Scopes auflisten", security: sessionSec, responses: { 200: okJson("Scope-Liste"), ...stdErrors() } });

  // ERP/HR-Konnektor-Registry (Org ↔ SAP/DATEV/zvoove/…)
  registry.registerPath({ method: "get", path: "/org/erp-mappings", tags: ["Integrations"], summary: "ERP/HR-Konnektor-Mappings auflisten (SAP/DATEV/zvoove)", security: sessionSec, responses: { 200: okJson("Liste der ERP-Mappings"), ...stdErrors() } });
  registry.registerPath({ method: "post", path: "/org/erp-mappings", tags: ["Integrations"], summary: "ERP/HR-Konnektor-Mapping anlegen (system_type, Mandant, sync_config)", security: sessionSec, responses: { 201: okJson("Mapping angelegt"), 409: { description: "Mapping fuer dieses System existiert bereits", content: { "application/json": { schema: ErrorResponse } } }, ...stdErrors() } });

  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: "3.0.3",
    info: {
      title: "TempConnect API",
      version: CATALOG_VERSION,
      description:
        "B2B-Workforce-Management-Plattform (Zeitarbeit). Diese Spezifikation wird AUTOMATISCH " +
        "aus den echten Zod-Validierungs-Schemas generiert (api/openapi/registry.js) — die " +
        "Request-Bodies sind damit immer deckungsgleich mit der Laufzeit-Validierung (kein Drift). " +
        "Alle mutierenden Endpunkte erfordern Session-Cookie + x-csrf-token."
    },
    servers: [{ url: "/api", description: "TempConnect API (relativ zur Plattform-Domain)" }],
    tags: [
      { name: "Auth", description: "Registrierung, Login, Passwort" },
      { name: "Organizations", description: "Organisationen & Mitglieder" },
      { name: "Requisitions", description: "Bedarfe (Stellenanforderungen)" },
      { name: "Marketplace", description: "Kapazitäten, Angebote, Deals" },
      { name: "Workers", description: "Mitarbeiter / Personalstamm (read:workers / write:workers)" },
      { name: "Assignments", description: "Einsätze (read:assignments / write:assignments)" },
      { name: "Timesheets", description: "Stundenzettel (read:timesheets / write:timesheets) — Kern für Lohn-Export" },
      { name: "Billing", description: "Tarife, Zahlung & Rechnungen (read:invoices) — Fibu-/DATEV-Export" },
      { name: "Integrations", description: "Webhooks & API-Keys — Andock-Punkt für SAP/HR/Lohn-Systeme" }
    ]
  });
}

export default buildOpenApiDocument;
