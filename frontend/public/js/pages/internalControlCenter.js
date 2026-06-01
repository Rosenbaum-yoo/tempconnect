(function () {
  "use strict";

  function esc(s) { const d = document.createElement("div"); d.textContent = s == null ? "" : String(s); return d.innerHTML; }

  function setTab(tab) {
    document.querySelectorAll(".icc-tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    document.querySelectorAll(".icc-panel").forEach((p) => p.classList.remove("active"));
    const panel = document.getElementById("icc-" + tab);
    if (panel) panel.classList.add("active");
  }

  async function bootstrap() {
    try {
      const me = await TC.api.get("/internal-control/me");
      if (!me?.data?.roles?.length) throw new Error("NO_INTERNAL_ACCESS");
      document.getElementById("iccApp").style.display = "block";
      bindEvents();
      await Promise.all([loadPlatform(), loadOperations(), loadAudit()]);
    } catch (_e) {
      document.getElementById("iccDenied").style.display = "block";
    }
  }

  async function loadPlatform() {
    try {
      const d = await TC.api.get("/internal-control/platform/dashboard");
      const m = d.data || {};
      const tiles = [
        ["Nutzer", m.users_total || 0],
        ["Organisationen", m.organizations_total || 0],
        ["Offene Requests", m.open_requests_total || 0],
        ["Kritische Events (7d)", m.critical_events_7d || 0]
      ];
      document.getElementById("iccPlatformMetrics").innerHTML = tiles.map((t) =>
        '<div class="icc-kpi"><div class="val">' + esc(t[1]) + '</div><div class="lbl">' + esc(t[0]) + "</div></div>"
      ).join("");
      try {
        const insight = await TC.api.get("/internal-control/platform/product-insights/overview?days=30");
        const top = (insight?.data?.top_events || []).slice(0, 4).map((e) => esc(e.event_name) + ": " + esc(e.count)).join(" | ");
        document.getElementById("iccPlatformMetrics").insertAdjacentHTML(
          "beforeend",
          '<div class="icc-kpi"><div class="val">Product Insights</div><div class="lbl">' + (top || "Keine Events") + "</div></div>"
        );
      } catch { /* ignore if no access */ }
      await loadOrganizations();
    } catch {
      document.getElementById("iccPlatformMetrics").innerHTML = '<div class="icc-empty">Keine Berechtigung fuer Platform Console.</div>';
    }
  }

  async function loadOrganizations() {
    const q = document.getElementById("iccOrgSearch").value.trim();
    try {
      const d = await TC.api.get("/internal-control/platform/organizations?limit=25" + (q ? "&q=" + encodeURIComponent(q) : ""));
      const items = d?.data?.items || [];
      if (!items.length) {
        document.getElementById("iccOrgList").innerHTML = '<p class="icc-empty">Keine Organisation gefunden.</p>';
        return;
      }
      let html = '<table class="icc-table"><thead><tr><th>Name</th><th>Typ</th><th>Plan</th><th>Mitglieder</th></tr></thead><tbody>';
      items.forEach((o) => {
        html += "<tr><td>" + esc(o.name) + "</td><td>" + esc(o.type) + "</td><td>" + esc(o.plan) + "</td><td>" + esc(o.member_count) + "</td></tr>";
      });
      html += "</tbody></table>";
      document.getElementById("iccOrgList").innerHTML = html;
    } catch {
      document.getElementById("iccOrgList").innerHTML = '<p class="icc-empty">Keine Berechtigung fuer Organisationsansicht.</p>';
    }
  }

  async function loadSupport() {
    const q = document.getElementById("iccSupportSearch").value.trim();
    if (!q) return;
    try {
      const d = await TC.api.get("/internal-control/support/search?q=" + encodeURIComponent(q));
      const items = d?.data?.items || [];
      if (!items.length) {
        document.getElementById("iccSupportList").innerHTML = '<p class="icc-empty">Keine Treffer.</p>';
        return;
      }
      let html = '<table class="icc-table"><thead><tr><th>E-Mail</th><th>Organisation</th><th>Status</th><th>Aktion</th></tr></thead><tbody>';
      items.forEach((u) => {
        html += "<tr>";
        html += "<td>" + esc(u.email) + "</td>";
        html += "<td>" + esc(u.org_name || "-") + "</td>";
        html += "<td>" + (u.is_verified ? "Verifiziert" : "Nicht verifiziert") + "</td>";
        html += '<td><button class="btn ds-btn--xs" data-user-id="' + esc(u.id) + '">Verifizierungs-Mail senden</button></td>';
        html += "</tr>";
      });
      html += "</tbody></table>";
      document.getElementById("iccSupportList").innerHTML = html;
      document.querySelectorAll("#iccSupportList button[data-user-id]").forEach((btn) => {
        btn.addEventListener("click", () => supportResendVerification(btn.dataset.userId));
      });
    } catch {
      document.getElementById("iccSupportList").innerHTML = '<p class="icc-empty">Keine Berechtigung fuer Support Console.</p>';
    }
  }

  async function supportResendVerification(userId) {
    const reason = prompt("Grund fuer den manuellen Eingriff (mind. 8 Zeichen):");
    if (!reason || reason.trim().length < 8) return;
    const confirmText = prompt('Zur Bestaetigung "CONFIRM" eingeben:');
    if (confirmText !== "CONFIRM") return;
    try {
      await TC.api.post("/internal-control/support/users/" + encodeURIComponent(userId) + "/resend-verification", {
        reason: reason.trim(),
        confirm: true
      });
      alert("Verifizierungs-Mail wurde ausgelost und auditiert.");
    } catch (e) {
      alert("Aktion fehlgeschlagen: " + (e.code || e.message || "Unbekannt"));
    }
  }

  async function loadOperations() {
    try {
      const d = await TC.api.get("/internal-control/operations/overview");
      const plans = d?.data?.plans || [];
      const pending = d?.data?.pending_approvals || 0;
      const rows = plans.map((p) => "<li>" + esc(p.plan) + ": " + esc(p.count) + "</li>").join("");
      document.getElementById("iccOperationsData").innerHTML =
        "<h3>Readonly Operations View</h3><p>Pending Approvals: <strong>" + esc(pending) + "</strong></p><ul>" + rows + "</ul>";
    } catch {
      document.getElementById("iccOperationsData").innerHTML = '<p class="icc-empty">Keine Berechtigung fuer Operations Console.</p>';
    }
  }

  async function loadAudit() {
    try {
      const d = await TC.api.get("/internal-control/audit?limit=50");
      const items = d?.data?.items || [];
      if (!items.length) {
        document.getElementById("iccAuditList").innerHTML = '<p class="icc-empty">Keine Audit-Eintraege.</p>';
        return;
      }
      let html = '<table class="icc-table"><thead><tr><th>Zeit</th><th>Aktion</th><th>Objekt</th><th>Akteur</th><th>Status</th></tr></thead><tbody>';
      items.forEach((a) => {
        html += "<tr><td>" + esc(new Date(a.created_at).toLocaleString("de-DE")) + "</td><td>" + esc(a.action) + "</td><td>" + esc(a.entity_type) + " #" + esc(a.entity_id || "-") + "</td><td>" + esc(a.actor_email || "-") + "</td><td>" + esc(a.status || "-") + "</td></tr>";
      });
      html += "</tbody></table>";
      document.getElementById("iccAuditList").innerHTML = html;
    } catch {
      document.getElementById("iccAuditList").innerHTML = '<p class="icc-empty">Keine Berechtigung fuer Audit.</p>';
    }
  }

  function bindEvents() {
    document.querySelectorAll(".icc-tab").forEach((btn) => btn.addEventListener("click", () => setTab(btn.dataset.tab)));
    document.getElementById("iccOrgSearchBtn").addEventListener("click", loadOrganizations);
    document.getElementById("iccSupportSearchBtn").addEventListener("click", loadSupport);
    document.getElementById("iccAuditRefresh").addEventListener("click", loadAudit);
  }

  bootstrap();
})();
