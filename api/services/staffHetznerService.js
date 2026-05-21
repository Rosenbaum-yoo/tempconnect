/**
 * staffHetznerService.js - kontrollierte Hetzner Cloud API-Integration fuer das
 * TempConnect-Team. Regeln:
 *  - Nur whitelisted Read-Pfade + 4 Safe-Actions (Snapshot, Reboot, Backup, LB-Service-Add).
 *  - Kein SSH, kein Rescue, kein Delete, keine Firewall-Mutation.
 *  - Ohne HETZNER_CLOUD_TOKEN laeuft der Service im Stub-Mode mit deterministischen Mock-Daten.
 */

const HETZNER_API = "https://api.hetzner.cloud/v1";
const TOKEN = String(process.env.HETZNER_CLOUD_TOKEN || "").trim();
export const HETZNER_MODE = TOKEN ? "live" : "stub";

const FORBIDDEN_METHODS = new Set(["DELETE"]);
const ALLOWED_READ_PATHS = [
  "/servers", "/volumes", "/load_balancers", "/floating_ips",
  "/datacenters", "/firewalls", "/certificates", "/placement_groups"
];
const ALLOWED_SAFE_ACTIONS = new Set([
  "server.create_image",
  "server.reboot",
  "load_balancer.add_service",
  "server.enable_backup"
]);

function assertReadPath(pathOnly) {
  if (!ALLOWED_READ_PATHS.some((p) => pathOnly === p || pathOnly.startsWith(p + "/"))) {
    const err = new Error("HETZNER_READ_PATH_DENIED");
    err.code = "HETZNER_READ_PATH_DENIED"; err.path = pathOnly; throw err;
  }
}

async function callHetzner(pathOnly, opts = {}) {
  if (HETZNER_MODE === "stub") return { stub: true, path: pathOnly, data: stubForPath(pathOnly) };
  const method = String(opts.method || "GET").toUpperCase();
  if (FORBIDDEN_METHODS.has(method)) {
    throw Object.assign(new Error("HETZNER_METHOD_FORBIDDEN"), { code: "HETZNER_METHOD_FORBIDDEN" });
  }
  const res = await fetch(HETZNER_API + pathOnly, {
    method,
    headers: { "Authorization": "Bearer " + TOKEN, "Content-Type": "application/json" },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) {
    const err = new Error("HETZNER_API_ERROR");
    err.code = "HETZNER_API_ERROR"; err.status = res.status; err.body = data;
    throw err;
  }
  return data;
}

function stubForPath(pathOnly) {
  if (pathOnly === "/servers") {
    return { servers: [
      { id: 1, name: "tc-lb-1",  status: "running", datacenter: { name: "nbg1-dc3" }, server_type: { name: "cx21" }, public_net: { ipv4: { ip: "203.0.113.10" } } },
      { id: 2, name: "tc-app-1", status: "running", datacenter: { name: "nbg1-dc3" }, server_type: { name: "cx22" }, public_net: { ipv4: { ip: "203.0.113.11" } } },
      { id: 3, name: "tc-app-2", status: "running", datacenter: { name: "nbg1-dc3" }, server_type: { name: "cx22" }, public_net: { ipv4: { ip: "203.0.113.12" } } }
    ]};
  }
  if (pathOnly === "/volumes") return { volumes: [] };
  if (pathOnly === "/load_balancers") {
    return { load_balancers: [{ id: 10, name: "tc-lb-main", location: { name: "nbg1" }, public_net: { ipv4: { ip: "203.0.113.50" } } }] };
  }
  if (pathOnly === "/floating_ips") return { floating_ips: [] };
  if (pathOnly === "/datacenters")  return { datacenters: [{ id: 1, name: "nbg1-dc3" }] };
  if (pathOnly === "/firewalls")    return { firewalls: [] };
  return { note: "stub-empty" };
}

export async function listServers()        { assertReadPath("/servers");        return await callHetzner("/servers"); }
export async function listLoadBalancers()  { assertReadPath("/load_balancers"); return await callHetzner("/load_balancers"); }
export async function listVolumes()        { assertReadPath("/volumes");        return await callHetzner("/volumes"); }
export async function listFloatingIps()    { assertReadPath("/floating_ips");   return await callHetzner("/floating_ips"); }
export async function listDatacenters()    { assertReadPath("/datacenters");    return await callHetzner("/datacenters"); }
export async function listFirewalls()      { assertReadPath("/firewalls");      return await callHetzner("/firewalls"); }

export async function getInfraOverview() {
  const [servers, lbs, volumes, fips, dcs, fws] = await Promise.all([
    listServers().catch((err) => ({ error: String(err.code || err.message) })),
    listLoadBalancers().catch((err) => ({ error: String(err.code || err.message) })),
    listVolumes().catch((err) => ({ error: String(err.code || err.message) })),
    listFloatingIps().catch((err) => ({ error: String(err.code || err.message) })),
    listDatacenters().catch((err) => ({ error: String(err.code || err.message) })),
    listFirewalls().catch((err) => ({ error: String(err.code || err.message) }))
  ]);
  return {
    mode: HETZNER_MODE,
    generated_at: new Date().toISOString(),
    servers: servers.stub ? servers.data : servers,
    load_balancers: lbs.stub ? lbs.data : lbs,
    volumes: volumes.stub ? volumes.data : volumes,
    floating_ips: fips.stub ? fips.data : fips,
    datacenters: dcs.stub ? dcs.data : dcs,
    firewalls: fws.stub ? fws.data : fws
  };
}

export async function runSafeAction(actionKey, params = {}) {
  if (!ALLOWED_SAFE_ACTIONS.has(actionKey)) return { error: "HETZNER_ACTION_NOT_ALLOWED", action: actionKey };
  if (HETZNER_MODE === "stub") return { stub: true, action: actionKey, params, result: { status: "stubbed-ok" } };
  if (actionKey === "server.create_image") {
    const { serverId, description, type = "snapshot" } = params;
    if (!serverId) return { error: "MISSING_SERVER_ID" };
    return await callHetzner(`/servers/${Number(serverId)}/actions/create_image`, { method: "POST", body: { description, type } });
  }
  if (actionKey === "server.reboot") {
    const { serverId } = params;
    if (!serverId) return { error: "MISSING_SERVER_ID" };
    return await callHetzner(`/servers/${Number(serverId)}/actions/reboot`, { method: "POST" });
  }
  if (actionKey === "server.enable_backup") {
    const { serverId } = params;
    if (!serverId) return { error: "MISSING_SERVER_ID" };
    return await callHetzner(`/servers/${Number(serverId)}/actions/enable_backup`, { method: "POST" });
  }
  if (actionKey === "load_balancer.add_service") {
    const { lbId, service } = params;
    if (!lbId || !service) return { error: "MISSING_PARAMS" };
    return await callHetzner(`/load_balancers/${Number(lbId)}/actions/add_service`, { method: "POST", body: service });
  }
  return { error: "HETZNER_ACTION_UNHANDLED", action: actionKey };
}

export function listSafeActions() {
  return [...ALLOWED_SAFE_ACTIONS].map((key) => ({ key }));
}
