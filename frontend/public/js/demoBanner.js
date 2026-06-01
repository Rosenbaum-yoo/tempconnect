/**
 * demoBanner.js – Zeigt einen persistenten Demo-Banner an, wenn die aktuelle
 * Session ein Demo-Account ist.  Prüft /api/me auf is_demo und blendet
 * den Banner einmalig ein.
 *
 * Einbindung: <script src="/public/js/demoBanner.js" defer></script>
 */
(function () {
  "use strict";

  const BANNER_ID = "tc-demo-banner";

  // Nicht doppelt einfügen
  if (document.getElementById(BANNER_ID)) return;

  async function init() {
    try {
      const res = await fetch("/api/me", { credentials: "include" });
      if (!res.ok) return;          // nicht eingeloggt → kein Banner
      const me = await res.json();
      if (!me.is_demo) return;       // kein Demo-Account

      render(me.plan || "DEMO");
    } catch {
      // silent – kein Banner bei Fehler
    }
  }

  function render(plan) {
    const banner = document.createElement("div");
    banner.id = BANNER_ID;
    Object.assign(banner.style, {
      position: "fixed",
      top: "0",
      left: "0",
      right: "0",
      zIndex: "9999",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "12px",
      padding: "10px 18px",
      background: "linear-gradient(135deg, rgba(74,163,255,.92), rgba(124,92,255,.92))",
      color: "#fff",
      fontSize: "13px",
      fontWeight: "700",
      fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
      boxShadow: "0 2px 12px rgba(0,0,0,.35)",
      backdropFilter: "blur(8px)"
    });

    banner.innerHTML = `
      <span style="display:flex;align-items:center;gap:6px">
        <span style="font-size:16px">&#9432;</span>
        Demo-Modus · Plan: <strong>${plan}</strong> · Alle Daten sind Testdaten
      </span>
      <a href="/?action=register"
         style="padding:6px 14px;border-radius:8px;background:rgba(255,255,255,.2);color:#fff;
                font-weight:800;text-decoration:none;white-space:nowrap;border:1px solid rgba(255,255,255,.3);
                transition:background .15s"
         onmouseover="this.style.background='rgba(255,255,255,.35)'"
         onmouseout="this.style.background='rgba(255,255,255,.2)'">
        Jetzt registrieren
      </a>
      <a href="/demo.html"
         style="padding:6px 14px;border-radius:8px;background:transparent;color:rgba(255,255,255,.8);
                font-weight:600;text-decoration:none;white-space:nowrap;border:1px solid rgba(255,255,255,.2);
                transition:background .15s"
         onmouseover="this.style.background='rgba(255,255,255,.1)'"
         onmouseout="this.style.background='transparent'">
        Plan wechseln
      </a>
    `;

    document.body.prepend(banner);

    // Push body content down so banner doesn't overlap
    document.body.style.paddingTop = banner.offsetHeight + "px";
  }

  // Init once DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
