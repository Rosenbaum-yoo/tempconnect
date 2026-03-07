/**
 * List all registered routes. Run from api/: node scripts/list-routes.js
 */
import { createApp } from "../app.js";

function getPrefix(regexp) {
  if (!regexp || !regexp.source) return "";
  let s = regexp.source.replace(/^\^/, "").replace(/\\\$.*$/, "").replace(/\\\//g, "/").replace(/\(\?:\\\/\)\?\$/i, "").replace(/\/\?$/i, "").trim();
  if (!s.startsWith("/")) s = "/" + s;
  return s || "";
}

function listRoutes(app, prefix = "") {
  const out = [];
  const stack = app.stack || app._router?.stack || [];
  for (const layer of stack) {
    if (layer.route) {
      const path = (prefix + (layer.route.path === "/" ? "" : layer.route.path)).replace(/\/+/g, "/") || "/";
      for (const method of Object.keys(layer.route.methods).filter((m) => m !== "_all")) {
        out.push({ method: method.toUpperCase(), path });
      }
    } else if (layer.name === "router" && layer.handle) {
      const mount = getPrefix(layer.regexp);
      const p = (prefix + mount).replace(/\/+/g, "/") || "/";
      out.push(...listRoutes(layer.handle, p));
    }
  }
  return out;
}

const app = await createApp();
const routes = listRoutes(app);
routes.sort((a, b) => (a.path === b.path ? a.method.localeCompare(b.method) : a.path.localeCompare(b.path)));
console.log("Registered routes:\n");
for (const r of routes) {
  console.log("  " + r.method.padEnd(6) + " " + (r.path || "/"));
}
console.log("\nTotal: " + routes.length);
