/**
 * Product updates ("What's New") — subtle topbar badge, optional one-shot modal, no spam.
 * Depends: page with [data-notif-topbar] or #tc-shell; CSRF via /api/csrf for POSTs.
 */
(function () {
  "use strict";

  var POLL_MS = 120000;
  var _csrf = null;

  function getCsrf() {
    if (_csrf) return Promise.resolve(_csrf);
    return fetch("/api/csrf", { credentials: "include" })
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (d) {
        _csrf = d.csrfToken || d.token || null;
        return _csrf;
      });
  }

  function esc(s) {
    var d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function postJson(url, body) {
    return getCsrf().then(function (token) {
      return fetch(url, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": token || ""
        },
        body: JSON.stringify(body || {})
      });
    });
  }

  function findNav() {
    return document.querySelector(".tc-shell-nav") || document.querySelector(".ds-topbar__nav.tc-shell-nav");
  }

  function ensureBadgeMount() {
    var nav = findNav();
    if (!nav) return null;
    var a = nav.querySelector('a[href="/public/whats-new.html"]');
    if (!a) return null;
    if (!a.querySelector(".tc-pu-badge")) {
      a.insertAdjacentHTML("beforeend", '<span class="tc-pu-badge" style="display:none" aria-hidden="true"></span>');
    }
    return a;
  }

  function setBadge(count) {
    var link = document.querySelector('.tc-shell-nav a[href="/public/whats-new.html"]');
    if (!link) return;
    var b = link.querySelector(".tc-pu-badge");
    if (!b) return;
    if (count > 0) {
      b.style.display = "inline-block";
      b.style.marginLeft = "6px";
      b.style.fontSize = "10px";
      b.style.fontWeight = "800";
      b.style.lineHeight = "14px";
      b.style.minWidth = "14px";
      b.style.padding = "0 5px";
      b.style.borderRadius = "99px";
      b.style.background = "var(--ds-brand,#4a9eff)";
      b.style.color = "#fff";
      b.style.verticalAlign = "2px";
      b.textContent = String(count > 9 ? "9+" : count);
    } else {
      b.style.display = "none";
      b.textContent = "";
    }
  }

  function showModal(entry) {
    if (!entry || !entry.id) return;
    var ov = document.createElement("div");
    ov.className = "tc-pu-modal-overlay";
    ov.setAttribute("role", "dialog");
    ov.setAttribute("aria-modal", "true");
    ov.setAttribute("aria-labelledby", "tc-pu-modal-title");
    ov.style.cssText =
      "position:fixed;inset:0;z-index:100020;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:24px;";
    ov.innerHTML =
      '<div class="tc-pu-modal" style="max-width:480px;width:100%;background:var(--card,#1a1d24);border:1px solid var(--line,rgba(255,255,255,.12));border-radius:16px;box-shadow:0 24px 64px rgba(0,0,0,.5);padding:24px 28px">' +
      '<div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--ds-text-secondary,#8d9bba);margin-bottom:8px">Produkt-Update</div>' +
      '<h2 id="tc-pu-modal-title" style="margin:0 0 12px;font-size:1.25rem;line-height:1.3">' +
      esc(entry.title || "") +
      "</h2>" +
      '<p style="margin:0 0 20px;color:var(--ds-text-secondary,#b8c3d9);line-height:1.5;font-size:14px">' +
      esc(entry.summary || "") +
      "</p>" +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end">' +
      '<button type="button" class="ds-btn ds-btn--ghost tc-pu-later">Sp\u00e4ter</button>' +
      '<a href="/public/whats-new.html" class="ds-btn ds-btn--primary tc-pu-details">Details ansehen</a>' +
      "</div></div>";

    function close(dismiss) {
      if (dismiss) {
        postJson("/api/product-releases/" + entry.id + "/ack", { action: "modal_dismiss" }).catch(function () {});
      }
      ov.remove();
    }

    ov.addEventListener("click", function (e) {
      if (e.target === ov) close(true);
    });
    ov.querySelector(".tc-pu-later").addEventListener("click", function () {
      close(true);
    });
    ov.querySelector(".tc-pu-details").addEventListener("click", function () {
      postJson("/api/product-releases/" + entry.id + "/ack", { action: "modal_dismiss" }).catch(function () {});
    });
    document.body.appendChild(ov);
  }

  function refreshInbox() {
    return fetch("/api/product-releases/inbox", { credentials: "include" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.success || !d.data) return;
        var data = d.data;
        setBadge(data.unseen_count || 0);
        if (data.modal && sessionStorage.getItem("tc_pu_modal_displayed_" + data.modal.id) !== "1") {
          sessionStorage.setItem("tc_pu_modal_displayed_" + data.modal.id, "1");
          showModal(data.modal);
        }
      })
      .catch(function () {});
  }

  function injectEnterpriseStrip() {
    var host = document.getElementById("tc-release-strip-host");
    if (!host) return;
    fetch("/api/product-releases?in_app_only=true", { credentials: "include" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        var items = (d && d.data && d.data.items) || [];
        var pub = items.filter(function (x) {
          return x.status === "published" && x.published_at && x.is_unread;
        });
        if (!pub.length) return;
        var top = pub[0];
        host.innerHTML =
          '<div class="tc-pu-strip" style="margin:0 0 20px;padding:14px 18px;border-radius:12px;border:1px solid var(--line,rgba(255,255,255,.1));background:linear-gradient(135deg,rgba(74,158,255,.08),transparent)">' +
          '<div style="display:flex;flex-wrap:wrap;align-items:center;gap:12px;justify-content:space-between">' +
          '<div><strong style="font-size:14px">Neu bei TempConnect</strong>' +
          '<div style="font-size:13px;color:var(--ds-text-secondary,#9aa5bc);margin-top:4px">' +
          esc(top.title || "") +
          "</div></div>" +
          '<a href="/public/whats-new.html" class="ds-btn ds-btn--sm ds-btn--primary">Ansehen</a>' +
          "</div></div>";
      })
      .catch(function () {});
  }

  function init() {
    var hasShell = document.querySelector("[data-notif-topbar]") || document.getElementById("tc-shell");
    if (hasShell) {
      ensureBadgeMount();
    }
    refreshInbox();
    setInterval(refreshInbox, POLL_MS);
    injectEnterpriseStrip();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
