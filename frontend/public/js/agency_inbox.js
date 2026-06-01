var API = "/api";
function getCsrf() {
  return fetch(API + "/csrf", { credentials: "include" }).then(function(r) { return r.ok ? r.json() : null; });
}
function api(path, opts) {
  opts = opts || {};
  var m = opts.method || "GET", h = { "Content-Type": "application/json" };
  if (["POST","PATCH","PUT","DELETE"].indexOf(m) >= 0) h["X-CSRF-Token"] = opts.csrf || "";
  return fetch(API + path, { method: m, headers: h, body: opts.body ? JSON.stringify(opts.body) : undefined, credentials: "include" });
}
function checkAuth(r) { if (r.status === 401) { window.location.href = "/"; return false; } return true; }
var STATUS_MAP={SENT:{badge:"pending",label:"Gesendet"},ACCEPTED:{badge:"approved",label:"Angenommen"},DECLINED:{badge:"rejected",label:"Abgelehnt"},FILLED:{badge:"completed",label:"Besetzt"},FINALIZED:{badge:"completed",label:"Abgeschlossen"},CANCELED:{badge:"expired",label:"Storniert"},OFFERED:{badge:"in-review",label:"Angebot gesendet"},CONFIRMED:{badge:"approved",label:"Best\u00e4tigt"}};
function reqStatusBadge(s){var m=STATUS_MAP[s]||{badge:"pending",label:s||"?"};return '<span class="approval-badge approval-badge--'+m.badge+'"><span class="approval-badge__dot"></span>'+(m.label)+'</span>';}
function slaBadge(respondBy, status) {
  if (status === "BREACHED") return '<span class="approval-badge approval-badge--rejected"><span class="approval-badge__dot"></span>Pulse \u00fcberschritten</span>';
  if (!respondBy) return '';
  var min = Math.floor((new Date(respondBy).getTime() - Date.now()) / 60000);
  if (min <= 0) return '<span class="approval-badge approval-badge--rejected"><span class="approval-badge__dot"></span>Abgelaufen</span>';
  if (min <= 15) return '<span class="approval-badge approval-badge--correction"><span class="approval-badge__dot"></span>' + min + ' min</span>';
  return '<span class="approval-badge approval-badge--approved"><span class="approval-badge__dot"></span>' + min + ' min</span>';
}
function setStatus(rid, status) {
  getCsrf().then(function(c) {
    return api("/requests/" + rid + "/status", { method: "PATCH", body: { status: status }, csrf: c && c.token });
  }).then(function(r) {
    if (!checkAuth(r)) return;
    if (r.ok) load(); else r.json().then(function(j) { alert(j.error || "Fehler"); });
  });
}
function load() {
  api("/my/requests/received").then(function(r) {
    if (!checkAuth(r)) return;
    return r.ok ? r.json() : null;
  }).then(function(data) {
    var list = document.getElementById("list");
    if (!data || !data.length) { list.innerHTML = "<div class=\"empty\">Keine eingegangenen Anfragen.</div>"; return; }
    var html = "";
    function compBadge(s) {
      if (!s) return "";
      var c = (s + "").toUpperCase(), cls = c === "GREEN" ? "approved" : c === "YELLOW" ? "correction" : "rejected";
      return '<span class="approval-badge approval-badge--' + cls + '"><span class="approval-badge__dot"></span>' + s + '</span> ';
    }
    data.forEach(function(r) {
      var role = r.role || r.capacity_role || r.listing_category || "Anfrage";
      var from = r.requester_company || r.requester_email || "Unternehmen";
      var sla = slaBadge(r.sla_respond_by, r.sla_status);
      var comp = compBadge(r.compliance_status);
      html += '<div class="card"><div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">';
      html += '<div>' + comp + sla + ' <strong>' + role + '</strong> von ' + from + ' ' + reqStatusBadge(r.status) + '</div>';
      html += '<div style="display:flex;gap:8px">';
      html += '<a href="/public/request_detail.html?id=' + r.id + '" class="btn">Details</a>';
      if (r.status === "SENT" || r.status === "OFFERED") {
        html += '<button type="button" class="approval-btn approval-btn--approve" data-id="' + r.id + '" data-action="ACCEPTED">Annehmen</button>';
        html += '<button type="button" class="approval-btn approval-btn--reject" data-id="' + r.id + '" data-action="DECLINED">Ablehnen</button>';
      }
      html += '</div></div></div>';
    });
    list.innerHTML = html;
    list.querySelectorAll("[data-action]").forEach(function(btn) {
      btn.onclick = function() { setStatus(btn.getAttribute("data-id"), btn.getAttribute("data-action")); };
    });
  });
}
load();
