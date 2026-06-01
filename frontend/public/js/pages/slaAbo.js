/* ═══════════════════════════════════════════════════════
   SLA & Abo — Page Logic
   ═══════════════════════════════════════════════════════ */
/* ── Bounty-Teaser Widget ──────────────────────────── */
    (function(){
      fetch('/api/bounties/discount',{credentials:'include'}).then(function(r){return r.ok?r.json():null}).then(function(d){
        if(!d)return;
        document.getElementById('bountyTeaser').style.display='block';
        if(d.discount_pct>0){
          var el=document.getElementById('bountyTeaserCurrent');
          el.style.display='inline';
          el.textContent=' — Ihr aktueller Rabatt: '+d.discount_pct+'%';
        }
      }).catch(function(){});
    })();

/* ── Referral-Banner Widget ────────────────────────── */
    (function(){
      fetch('/api/referral/status',{credentials:'include'}).then(function(r){return r.ok?r.json():null}).then(function(d){
        if(!d)return;
        document.getElementById('slaRefBanner').style.display='block';
        var desc=document.getElementById('slaRefDesc');
        var stats=document.getElementById('slaRefStats');

        // Code anzeigen
        if(d.referral_code){
          document.getElementById('slaRefCodeRow').style.display='flex';
          document.getElementById('slaRefCode').textContent=d.referral_code;
        }

        if(d.is_pilot){
          document.getElementById('slaRefPilotBadge').style.display='inline';
          desc.innerHTML='<strong>'+d.free_months_total+' Gratis-Monate</strong> verdient ('+d.free_months_remaining+' verbleibend). Werben Sie weitere Kunden fuer mehr Gratis-Monate!';
          stats.innerHTML='<div style="text-align:center"><div style="font-size:22px;font-weight:900;color:var(--ds-success)">'+d.free_months_total+'</div><div style="font-size:10px;color:var(--ds-text-tertiary)">Gratis</div></div>'+
            '<div style="text-align:center"><div style="font-size:22px;font-weight:900;color:var(--ds-brand)">'+d.active_referrals+'/6</div><div style="font-size:10px;color:var(--ds-text-tertiary)">Referrals</div></div>';
        } else {
          desc.innerHTML='Werben Sie Kunden und erhalten Sie <strong>Geld zurueck</strong> &mdash; bis zu 6 Monate Cashback. <span style="color:var(--ds-accent);font-weight:600">'+d.cashback_months_earned+' Monate verdient</span>';
          stats.innerHTML='<div style="text-align:center"><div style="font-size:22px;font-weight:900;color:var(--ds-accent)">'+d.cashback_months_earned+'</div><div style="font-size:10px;color:var(--ds-text-tertiary)">Cashback</div></div>'+
            '<div style="text-align:center"><div style="font-size:22px;font-weight:900;color:var(--ds-text-tertiary)">6</div><div style="font-size:10px;color:var(--ds-text-tertiary)">Max</div></div>';
        }
      }).catch(function(){});
    })();

/* ── Main SLA/Abo Logic ────────────────────── */
/**
 * Ab Welle 8 Schritt 13 nutzt diese Datei den Shared-Renderer
 * `TC.catalog` aus `frontend/public/js/catalogRenderer.js`.
 * Plan-Preise, Plan-Features und Vergleichstabelle kommen aus
 * `GET /api/public/catalog` — keine Hardcodes mehr.
 *
 * Nicht angefasst: Bounty-/Referral-Banner, Checkout-Flow, Cancel-Logik
 * (live-State + Org-Rolle), Payment-History.
 */
  (function(){
    var API = "/api";
    var PLAN_ORDER = ["DEMO", "BASIS", "PLUS", "PRO", "INDIVIDUELL"];

    function R() { return (window.TC && window.TC.catalog) ? window.TC.catalog : null; }

    var catalog = null;            // Snapshot aus /api/public/catalog
    var catalogError = null;       // Fehler beim Laden (UI rendert Fallback)
    var paymentConfig = null;
    var currentPlan = "DEMO";
    var selectedPlan = null;
    var selectedMethod = null;
    var meData = null;
    var BILLING_ROLES = ["owner", "admin", "finance", "platform_admin"];

    function getPlanCents(planKey) {
      var p = R() && R().findPlan(catalog, planKey);
      return p ? p.monthly_price_cents : null;
    }
    function getPlanLabel(planKey) {
      var p = R() && R().findPlan(catalog, planKey);
      if (p && (p.display_label || p.label)) return p.display_label || p.label;
      return planKey;
    }
    function getPlanInterval(planKey) {
      var p = R() && R().findPlan(catalog, planKey);
      return p ? R().intervalLabel(p) : "";
    }

    function getSubscription() {
      return (meData && meData.subscription) ? meData.subscription : null;
    }

    function updateCancelButton() {
      var btn = document.getElementById("btnCancelSub");
      if (!btn) return;
      btn.onclick = null;
      btn.disabled = false;
      btn.style.opacity = "";
      btn.style.cursor = "";
      if (!meData) {
        btn.disabled = true;
        btn.textContent = "Abo kuendigen";
        return;
      }
      if (!hasBillingAccess()) {
        btn.disabled = true;
        btn.textContent = "Nur Owner/Admin/Finance";
        return;
      }
      if (currentPlan === "DEMO") {
        btn.disabled = true;
        btn.textContent = "Kein aktives Abo";
        return;
      }
      if (isCanceling()) {
        btn.disabled = true;
        btn.textContent = "Kuendigung vorgemerkt";
        return;
      }
      if (isIndividuellContract()) {
        btn.textContent = "Kuendigung anfragen";
        btn.onclick = function() { window.cancelSubscription(); };
        return;
      }
      btn.textContent = "Abo kuendigen";
      btn.onclick = function() { window.cancelSubscription(); };
    }

    function hasBillingAccess() {
      return !!(meData && BILLING_ROLES.indexOf(meData.org_role) !== -1);
    }

    function formatDate(value) {
      if (!value) return null;
      var d = new Date(value);
      if (isNaN(d.getTime())) return null;
      return d.toLocaleDateString("de-DE");
    }

    function getCancelPreviewDate() {
      var sub = getSubscription();
      return formatDate(sub && (sub.cancel_at || sub.current_period_end));
    }

    function isCanceling() {
      var sub = getSubscription();
      return !!(sub && sub.status === "canceling");
    }

    function isIndividuellContract() {
      if (currentPlan !== "INDIVIDUELL") return false;
      var billingMode = meData && meData.pilot ? meData.pilot.billing_mode : null;
      return billingMode !== "pilot_contract";
    }

    function esc(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
    function idempotencyKey() {
      try { return (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : "x-" + Math.random().toString(36).slice(2) + "-" + Date.now(); }
      catch(e) { return "x-" + Math.random().toString(36).slice(2) + "-" + Date.now(); }
    }
    function getCsrf() { return fetch(API + "/csrf", { credentials: "include" }).then(function(r) { return r.ok ? r.json() : null; }); }
    function apiCall(path, opts) {
      opts = opts || {};
      var method = opts.method || "GET";
      var headers = { "Content-Type": "application/json" };
      if (["POST","PATCH","PUT","DELETE"].indexOf(method) >= 0) {
        headers["X-CSRF-Token"] = opts.csrf || "";
        headers["Idempotency-Key"] = idempotencyKey();
      }
      return fetch(API + path, { method: method, headers: headers, body: opts.body ? JSON.stringify(opts.body) : undefined, credentials: "include" });
    }
    function normalizePlanParam(plan) {
      var p = String(plan || "").toUpperCase();
      if (p === "FREE") p = "DEMO";
      if (p === "ENTERPRISE" || p === "INDIVIDUAL") p = "INDIVIDUELL";
      return p || null;
    }
    function getIndividuellFormUrl() {
      var params = new URLSearchParams();
      params.set("source", "sla_abo");
      params.set("plan", "INDIVIDUELL");
      params.set("intent", "upgrade");
      params.set("return_to", "/public/sla_abo.html");
      if (currentPlan) params.set("current_plan", currentPlan);
      return "/public/enterprise_anfrage.html?" + params.toString();
    }

    function focusPlanCard(planKey) {
      var card = document.querySelector(".plan-card[data-plan='" + planKey + "']");
      if (!card) return;
      card.classList.add("plan-card--highlight");
      try { card.scrollIntoView({ behavior: "smooth", block: "center" }); }
      catch (e) { card.scrollIntoView(); }
      setTimeout(function() { card.classList.remove("plan-card--highlight"); }, 2800);
    }

    function clearPlanParam() {
      if (!urlParams.get("plan")) return;
      var url = new URL(window.location.href);
      url.searchParams.delete("plan");
      window.history.replaceState({}, "", url.pathname + url.search);
    }

    function maybePreselectPlan() {
      if (!preselectPlan) return;
      if (PLAN_ORDER.indexOf(preselectPlan) === -1) return;
      focusPlanCard(preselectPlan);
      if (!meData) { clearPlanParam(); return; }
      var targetIdx = PLAN_ORDER.indexOf(preselectPlan);
      var currentIdx = PLAN_ORDER.indexOf(currentPlan);
      if (targetIdx <= currentIdx) { clearPlanParam(); return; }
      if (preselectPlan === "INDIVIDUELL") { clearPlanParam(); return; }
      window._setPlan(preselectPlan);
      clearPlanParam();
    }

    /* -- URL params (success/cancel from Stripe redirect) -- */
    var urlParams = new URLSearchParams(window.location.search);
    var preselectPlan = normalizePlanParam(urlParams.get("plan"));
    if (urlParams.get("payment") === "success") {
      document.getElementById("successBanner").style.display = "block";
      window.history.replaceState({}, "", "/public/sla_abo.html");
    }
    if (urlParams.get("payment") === "cancelled") {
      document.getElementById("cancelBanner").style.display = "block";
      window.history.replaceState({}, "", "/public/sla_abo.html");
    }

    /* -- Render Plan Grid via Shared-Renderer (Catalog) -- */
    function renderPlans() {
      var grid = document.getElementById("planGrid");
      if (!grid) return;
      var renderer = R();
      var plans = (catalog && Array.isArray(catalog.plans)) ? catalog.plans : [];

      if (!renderer || !plans.length) {
        if (catalogError) {
          grid.innerHTML = '<div class="empty-block">Tarife konnten nicht geladen werden. ' +
            '<button type="button" class="ds-btn ds-btn--sm" style="margin-left:8px" onclick="location.reload()">Erneut versuchen</button></div>';
        } else {
          grid.innerHTML = '<div class="empty-block">Lade Tarife&hellip;</div>';
        }
        return;
      }

      grid.innerHTML = plans
        .slice()
        .sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); })
        .map(function (plan) {
          var isCurrent = currentPlan === plan.key;
          var cta;
          if (isCurrent) {
            cta = null; // Renderer rendert disabled "Aktuell"-Knopf bei isCurrent.
          } else if (plan.key === "INDIVIDUELL") {
            cta = meData ? {
              onclick: "window.TC && window.TC.accountSubscription && window.TC.accountSubscription.requestUpgrade('INDIVIDUELL')",
              label: "Individuell anfragen",
              primary: true
            } : {
              href: getIndividuellFormUrl(),
              label: "Individuell anfragen",
              primary: true
            };
          } else if (plan.key === "DEMO") {
            cta = { href: "/demo.html", label: "Demo starten" };
          } else {
            cta = {
              onclick: "window._setPlan('" + plan.key + "')",
              label: "Plan waehlen",
              primary: plan.key === "PLUS"
            };
          }
          return renderer.renderPlanCard(plan, {
            highlights: renderer.planHighlights(catalog, plan.key, 6),
            isCurrent: isCurrent,
            isCanceling: isCurrent && isCanceling(),
            cta: cta
          });
        }).join("");
    }

    /* -- Aktueller Plan Info -- */
    function renderCurrentPlan() {
      var el = document.getElementById("currentPlanInfo");
      if (!meData) { el.innerHTML = "<span style='color:var(--ds-text-secondary)'>-</span>"; updateCancelButton(); return; }
      var displayPlan = meData.plan || "DEMO";
      if (displayPlan === "FREE") displayPlan = "DEMO";
      var displayLabel = (window.PlanFeatures && typeof window.PlanFeatures.getDisplayPlanLabel === "function")
        ? window.PlanFeatures.getDisplayPlanLabel(displayPlan)
        : (displayPlan === "INDIVIDUELL" ? "Individueller Tarif" : displayPlan);
      var html = "<div style='font-size:14px'>Plan: <b>" + esc(displayLabel) + "</b></div>";
      if (meData.limits) {
        html += "<div style='margin-top:var(--ds-space-2);font-size:13px;color:var(--ds-text-secondary)'>";
        if (meData.limits.requests_send === -1) {
          html += "Unbegrenzte Nutzung";
        } else {
          html += "Anfragen: " + (meData.usage ? meData.usage.sent_count : 0) + " / " + meData.limits.requests_send;
          html += "<br/>Karteikarten: " + (meData.usage ? meData.usage.listings_count : 0) + " / " + meData.limits.listings;
        }
        html += "<br/>Notdienst: " + (meData.limits.notdienst ? "Ja" : "Nein");
        html += "</div>";
      }
      var sub = getSubscription();
      if (sub && sub.status === "canceling") {
        var cancelLabel = getCancelPreviewDate() || "Laufzeitende";
        html += "<div style='margin-top:var(--ds-space-3);padding:var(--ds-space-3);border-radius:var(--ds-radius-md);border:1px solid rgba(255,204,0,.35);background:rgba(255,204,0,.08);font-size:12px;color:var(--ds-text-secondary)'>";
        html += "<strong style='color:#ffe680'>Kuendigung vorgemerkt</strong><br/>Aktiv bis " + esc(cancelLabel) + ". Zugriff bleibt bis dahin erhalten.";
        html += "</div>";
      } else if (sub && sub.status === "canceled") {
        html += "<div style='margin-top:var(--ds-space-3);padding:var(--ds-space-3);border-radius:var(--ds-radius-md);border:1px solid rgba(255,92,122,.35);background:rgba(255,92,122,.08);font-size:12px;color:var(--ds-text-secondary)'>";
        html += "<strong style='color:#ffd0d8'>Abo gekuendigt</strong><br/>Der Zugang wurde bereits auf DEMO umgestellt.";
        html += "</div>";
      }
      if (isIndividuellContract()) {
        html += "<div style='margin-top:var(--ds-space-3);padding:var(--ds-space-3);border-radius:var(--ds-radius-md);border:1px solid rgba(124,92,255,.35);background:rgba(124,92,255,.08);font-size:12px;color:var(--ds-text-secondary)'>";
        html += "<strong style='color:var(--ds-accent)'>Individueller Tarif</strong><br/>Kuendigung erfolgt ausschliesslich ueber das Account-Team.";
        html += "</div>";
      }
      el.innerHTML = html;
      updateCancelButton();
    }

    /* -- Downgrade Warning Logic (LOSS_MAP dynamisch aus Catalog) -- */
    var dgTargetPlan = null;
    var dgIsCancel = false;

    /**
     * Liefert Feature-Verluste beim Downgrade dynamisch aus dem Catalog.
     * Quelle: catalog.features[].included_in_plans (visible_in_pricing=true).
     * Fallback: leere Liste — niemals statische Hardcodes mehr.
     */
    function getDowngradeLosses(fromPlan, toPlan) {
      if (!R()) return [];
      var losses = R().deriveDowngradeLosses(catalog, fromPlan, toPlan);
      return losses.map(function (l) { return l.name; });
    }

    function showDowngradeWarning(targetPlan, isCancel) {
      dgTargetPlan = targetPlan;
      dgIsCancel = isCancel;
      var losses = getDowngradeLosses(currentPlan, targetPlan);
      var list = document.getElementById('dgLossList');
      list.innerHTML = losses.map(function(l) { return '<li style="padding:2px 0">' + l + '</li>'; }).join('');
      var lossTitle = document.getElementById('dgLossTitle');
      var altTitle = document.getElementById('dgAltTitle');
      var step2Btn = document.getElementById('dgStep2ConfirmBtn');
      var confirmBtn = document.getElementById('dgConfirmBtn');
      if (lossTitle) lossTitle.textContent = isCancel ? 'Das verlieren Sie bei einer Kuendigung:' : 'Das verlieren Sie bei einem Downgrade:';
      if (altTitle) altTitle.textContent = isCancel ? 'Alternativen zur Kuendigung' : 'Alternativen zum Downgrade';
      if (step2Btn) step2Btn.textContent = isCancel ? 'Kuendigung bestaetigen' : 'Downgrade bestaetigen';
      if (confirmBtn) confirmBtn.textContent = isCancel ? 'Kuendigung vormerken' : 'Jetzt downgraden';
      // Bounty warning
      fetch('/api/bounties/discount', { credentials: 'include' }).then(function(r) { return r.ok ? r.json() : null; }).then(function(d) {
        if (d && d.total_discount_pct > 0) {
          document.getElementById('dgBountyWarn').style.display = 'block';
          document.getElementById('dgBountyPct').textContent = d.total_discount_pct;
        } else {
          document.getElementById('dgBountyWarn').style.display = 'none';
        }
      }).catch(function() {});
      // Alt suggestion (Preis dynamisch aus Catalog)
      var altEl = document.getElementById('dgAltSuggestion');
      if (targetPlan === 'DEMO' && PLAN_ORDER.indexOf(currentPlan) >= 2) {
        var basisCents = getPlanCents('BASIS');
        var basisLabel = (R() ? R().fmtCents(basisCents) : null) || '150 EUR';
        altEl.innerHTML = '<strong>Tipp:</strong> Wechseln Sie zu <b>BASIS</b> (' + basisLabel + '/Mo) statt komplett zu kuendigen.';
      } else {
        altEl.innerHTML = '';
      }
      document.getElementById('dgTitle').textContent = isCancel ? 'Abo kuendigen' : 'Downgrade auf ' + getPlanLabel(targetPlan);
      var cancelDateLabel = getCancelPreviewDate();
      document.getElementById('dgFinalText').textContent = isCancel
        ? ('Ihre Kuendigung wird zum Laufzeitende' + (cancelDateLabel ? ' (' + cancelDateLabel + ')' : '') + ' wirksam. Bis dahin bleiben alle Premium-Funktionen aktiv.')
        : 'Ihr Plan wird auf ' + getPlanLabel(targetPlan) + ' herabgestuft. Einige Features werden sofort deaktiviert.';
      window.dgShowStep(1);
      document.getElementById('downgradeModal').style.display = 'grid';
    }

    window.dgShowStep = function(step) {
      document.getElementById('dgStep1').style.display = step === 1 ? 'block' : 'none';
      document.getElementById('dgStep2').style.display = step === 2 ? 'block' : 'none';
      document.getElementById('dgStep3').style.display = step === 3 ? 'block' : 'none';
    };
    window.closeDowngrade = function() {
      document.getElementById('downgradeModal').style.display = 'none';
      dgTargetPlan = null;
    };
    window.dgExecute = function() {
      document.getElementById('dgConfirmBtn').disabled = true;
      document.getElementById('dgConfirmBtn').textContent = 'Wird ausgefuehrt\u2026';
      var plan = dgIsCancel ? 'DEMO' : dgTargetPlan;
      var accountActions = window.TC && window.TC.accountSubscription ? window.TC.accountSubscription : null;
      if (accountActions && (dgIsCancel ? accountActions.requestCancellation : accountActions.requestDowngrade)) {
        var directPromise = dgIsCancel ? accountActions.requestCancellation() : accountActions.requestDowngrade(plan);
        Promise.resolve(directPromise).then(function(result) {
          document.getElementById('dgConfirmBtn').disabled = false;
          document.getElementById('dgConfirmBtn').textContent = dgIsCancel ? 'Kuendigung vormerken' : 'Jetzt downgraden';
          if (result !== false) window.closeDowngrade();
        }).catch(function() {
          document.getElementById('dgConfirmBtn').disabled = false;
          document.getElementById('dgConfirmBtn').textContent = dgIsCancel ? 'Kuendigung vormerken' : 'Jetzt downgraden';
        });
        return;
      }
      getCsrf().then(function(csrf) {
        var token = csrf && (csrf.csrfToken || csrf.token);
        return dgIsCancel
          ? apiCall('/me/plan/cancel', { method: 'POST', csrf: token })
          : apiCall('/me/plan', { method: 'POST', csrf: token, body: { plan: plan } });
      }).then(function(r) {
        if (!r.ok) return r.json().then(function(e) {
          var err = new Error(e.message || e.error || 'Fehler');
          err.code = e.error || null;
          err.details = e || null;
          throw err;
        });
        return r.json();
      }).then(function(me) {
        meData = me;
        currentPlan = me.plan || 'DEMO';
        renderPlans();
        renderCurrentPlan();
        window.closeDowngrade();
        if (dgIsCancel) {
          if (currentPlan === 'DEMO') {
            alert('Abo gekuendigt.');
          } else {
            var cancelDate = me && me.subscription ? formatDate(me.subscription.cancel_at) : null;
            alert(cancelDate ? ('Kuendigung vorgemerkt zum ' + cancelDate + '.') : 'Kuendigung vorgemerkt.');
          }
        } else {
          alert('Plan geaendert: ' + currentPlan);
        }
      }).catch(function(e) {
        var msg = e && e.message ? e.message : 'Unbekannter Fehler';
        if (e && e.code === 'PERMISSION_DENIED') msg = 'Nur Owner/Admin/Finance koennen kuendigen.';
        if (e && e.code === 'NO_ACTIVE_SUBSCRIPTION') msg = 'Kein aktives Abo zum Kuendigen.';
        if (e && e.code === 'ALREADY_CANCELING') msg = 'Kuendigung ist bereits vorgemerkt.';
        if (e && e.code === 'MANUAL_CANCELLATION_REQUIRED') {
          msg = 'Individueller Tarif kann nur ueber das Account-Team gekuendigt werden.';
          if (e.details && e.details.support_url) {
            if (confirm(msg + ' Jetzt Kontakt aufnehmen?')) {
              window.location.href = e.details.support_url;
              return;
            }
          }
        }
        alert('Fehler: ' + msg);
        document.getElementById('dgConfirmBtn').disabled = false;
        document.getElementById('dgConfirmBtn').textContent = dgIsCancel ? 'Kuendigung vormerken' : 'Jetzt downgraden';
      });
    };

    /* -- Checkout Modal -- */
    window._setPlan = function(planKey) {
      var targetIdx = PLAN_ORDER.indexOf(planKey);
      var currentIdx = PLAN_ORDER.indexOf(currentPlan);
      // Downgrade detection
      if (targetIdx < currentIdx) {
        showDowngradeWarning(planKey, false);
        return;
      }
      if (planKey === "DEMO") {
        showDowngradeWarning('DEMO', false);
        return;
      }
      // Individueller Tarif — Anfrageformular oeffnen
      if (planKey === "INDIVIDUELL") {
        if (meData && window.TC && window.TC.accountSubscription && window.TC.accountSubscription.requestUpgrade) {
          window.TC.accountSubscription.requestUpgrade("INDIVIDUELL");
          return;
        }
        window.location.href = getIndividuellFormUrl();
        return;
      }
      openCheckout(planKey);
    };

    function openCheckout(planKey) {
      selectedPlan = planKey;
      selectedMethod = null;
      var renderer = R();
      var label = getPlanLabel(planKey);
      var priceLabel = renderer ? (renderer.fmtCents(getPlanCents(planKey)) || "auf Anfrage") : (planKey + " Preis");
      var benefit = planKey === "BASIS" ? "Mehr Reichweite – finde schneller passende Partner."
        : planKey === "PLUS" ? "Noch mehr Reichweite – ideal fuer aktive Vermittlung."
        : planKey === "PRO" ? "Maximale Sichtbarkeit mit Pulse Notdienst und priorisiertem Matching." : "";

      document.getElementById("checkoutPlanInfo").innerHTML =
        "<div style='display:flex;justify-content:space-between;align-items:center'>" +
        "<div><b style='font-size:18px'>" + esc(label) + "</b>" +
        (benefit ? "<div style='font-size:13px;color:var(--ds-success);margin-top:4px'>" + esc(benefit) + "</div>" : "") + "</div>" +
        "<div style='font-size:24px;font-weight:900'>" + esc(priceLabel) + "<span style='font-size:12px;color:var(--ds-text-secondary)'>/Monat</span></div>" +
        "</div>";

      // Build payment method buttons
      var methods = [
        { key: "demo", icon: "&#128176;", label: "Demo-Zahlung", desc: "Testzahlung ohne echtes Geld", enabled: true },
        { key: "stripe", icon: "&#128179;", label: "Kreditkarte / SEPA / Klarna / Sofort", desc: paymentConfig && paymentConfig.stripe_enabled ? "Kreditkarte, SEPA, Sofort, Giropay" : "via Stripe (bald verfuegbar)", enabled: !!(paymentConfig && paymentConfig.stripe_enabled) },
        { key: "paypal", icon: "&#128176;", label: "PayPal", desc: paymentConfig && paymentConfig.paypal_enabled ? "Mit PayPal bezahlen" : "(bald verfuegbar)", enabled: !!(paymentConfig && paymentConfig.paypal_enabled) }
      ];
      var container = document.getElementById("paymentMethods");
      container.innerHTML = "";
      methods.forEach(function(m) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "payment-btn";
        btn.disabled = !m.enabled;
        btn.dataset.method = m.key;
        btn.innerHTML = "<span style='font-size:20px'>" + m.icon + "</span><div style='text-align:left'><b>" + esc(m.label) + "</b><div style='margin:0;font-size:12px;color:var(--ds-text-secondary)'>" + esc(m.desc) + "</div></div>";
        btn.onclick = function() { selectMethod(m.key); };
        container.appendChild(btn);
      });

      document.getElementById("checkoutDemoSection").style.display = "none";
      document.getElementById("checkoutStripeSection").style.display = "none";
      document.getElementById("checkoutStatus").style.display = "none";
      document.getElementById("checkoutModal").style.display = "grid";
    }

    function selectMethod(method) {
      selectedMethod = method;
      document.querySelectorAll(".payment-btn").forEach(function(b) { b.classList.remove("active"); });
      var active = document.querySelector(".payment-btn[data-method='" + method + "']");
      if (active) active.classList.add("active");
      document.getElementById("checkoutDemoSection").style.display = method === "demo" ? "block" : "none";
      document.getElementById("checkoutStripeSection").style.display = method === "stripe" ? "block" : "none";
    }

    window.closeCheckout = function() {
      document.getElementById("checkoutModal").style.display = "none";
      selectedPlan = null;
      selectedMethod = null;
    };

    function doCheckout(method) {
      if (!selectedPlan) return;
      var statusEl = document.getElementById("checkoutStatus");
      statusEl.style.display = "block";
      statusEl.textContent = "Checkout wird erstellt\u2026";
      var demoBtn = document.getElementById("btnDemoConfirm");
      var stripeBtn = document.getElementById("btnStripeCheckout");
      if (demoBtn) demoBtn.disabled = true;
      if (stripeBtn) stripeBtn.disabled = true;

      getCsrf().then(function(csrf) {
        var token = csrf && (csrf.csrfToken || csrf.token);
        return apiCall("/payment/checkout", { method: "POST", csrf: token, body: { plan: selectedPlan, payment_method: method } });
      }).then(function(r) {
        if (!r.ok) return r.json().then(function(err) { throw new Error(err.error || "CHECKOUT_ERROR"); });
        return r.json();
      }).then(function(data) {
        if (data.mode === "demo") {
          statusEl.textContent = "Demo-Modus \u2013 Abo wird aktiviert\u2026";
          return getCsrf().then(function(csrf) {
            var token = csrf && (csrf.csrfToken || csrf.token);
            return apiCall("/payment/confirm", { method: "POST", csrf: token, body: { checkout_id: data.checkout_id } });
          }).then(function(r) {
            if (!r.ok) throw new Error("CONFIRM_FAILED");
            return r.json();
          }).then(function(result) {
            statusEl.textContent = "Abo aktiviert! Seite wird neu geladen\u2026";
            setTimeout(function() { window.location.href = "/public/sla_abo.html"; }, 1500);
          });
        }
        if (data.mode === "stripe" && data.redirect_url) {
          statusEl.textContent = "Weiterleitung zu Stripe\u00AE";
          window.location.href = data.redirect_url;
          return;
        }
        if (data.mode === "paypal" && data.redirect_url) {
          statusEl.textContent = "Weiterleitung zu PayPal\u00AE";
          window.location.href = data.redirect_url;
          return;
        }
        throw new Error("UNKNOWN_MODE");
      }).catch(function(err) {
        statusEl.textContent = "Fehler: " + (err.message || "Unbekannter Fehler");
        if (demoBtn) demoBtn.disabled = false;
        if (stripeBtn) stripeBtn.disabled = false;
      });
    }

    document.getElementById("btnDemoConfirm").onclick = function() { doCheckout("demo"); };
    document.getElementById("btnStripeCheckout").onclick = function() { doCheckout("stripe"); };

    /* -- Cancel Subscription (via downgrade warning) -- */
    window.cancelSubscription = function() {
      if (!meData) return;
      if (!hasBillingAccess()) {
        alert('Nur Owner/Admin/Finance koennen das Abo kuendigen.');
        return;
      }
      if (currentPlan === 'DEMO') {
        alert('Kein aktives Abo zum Kuendigen.');
        return;
      }
      if (isCanceling()) {
        alert('Kuendigung ist bereits vorgemerkt.');
        return;
      }
      if (isIndividuellContract()) {
        if (window.TC && window.TC.accountSubscription && window.TC.accountSubscription.requestCancellation) {
          showDowngradeWarning('DEMO', true);
          return;
        }
        if (confirm('Individueller Tarif kann nur ueber das Account-Team gekuendigt werden. Kontakt aufnehmen?')) {
          window.location.href = '/public/enterprise_anfrage.html';
        }
        return;
      }
      showDowngradeWarning('DEMO', true);
    };

    /* -- Payment History -- */
    function loadHistory() {
      apiCall("/payment/history").then(function(r) {
        if (!r.ok) return [];
        return r.json();
      }).then(function(rows) {
        var el = document.getElementById("paymentHistory");
        if (!Array.isArray(rows) || rows.length === 0) {
          el.innerHTML = "<p style='color:var(--ds-text-secondary);font-size:13px'>Noch keine Zahlungen.</p>";
          return;
        }
        var html = "<table class='history-table'><thead><tr><th>Datum</th><th>Plan</th><th>Betrag</th><th>Methode</th><th>Status</th></tr></thead><tbody>";
        rows.forEach(function(r) {
          var date = r.created_at ? new Date(r.created_at).toLocaleDateString("de-DE") : "\u2013";
          var statusCls = r.status === "completed" ? "color:var(--ds-success)" : r.status === "failed" ? "color:var(--ds-error)" : "color:var(--ds-warning)";
          var planLabel = (window.PlanFeatures && typeof window.PlanFeatures.getDisplayPlanLabel === "function")
            ? window.PlanFeatures.getDisplayPlanLabel(r.plan)
            : (r.plan === "INDIVIDUELL" ? "Individueller Tarif" : r.plan);
          html += "<tr><td>" + esc(date) + "</td><td>" + esc(planLabel) + "</td><td>" + r.amount + " EUR</td><td>" + esc(r.method) + "</td><td style='" + statusCls + "'>" + esc(r.status) + "</td></tr>";
        });
        html += "</tbody></table>";
        el.innerHTML = html;
      }).catch(function() {
        document.getElementById("paymentHistory").innerHTML = "<p style='color:var(--ds-text-secondary);font-size:13px'>Fehler beim Laden.</p>";
      });
    }

    /* -- Init -- */
    function loadCatalogSafe() {
      if (!R()) {
        catalogError = new Error("catalogRenderer fehlt (TC.catalog)");
        return Promise.resolve(null);
      }
      return R().load().then(function (cat) {
        catalog = cat;
        catalogError = null;
        return cat;
      }).catch(function (err) {
        catalogError = err;
        return null;
      });
    }

    Promise.all([
      fetch(API + "/me", { credentials: "include" }).then(function(r) { return r.ok ? r.json() : null; }),
      apiCall("/payment/config").then(function(r) { return r.ok ? r.json() : null; }),
      loadCatalogSafe()
    ]).then(function(results) {
      meData = results[0];
      paymentConfig = results[1];
      // Plan kanonisieren über Shared-Renderer (mit Backward-Compat-Fallbacks).
      var raw = (meData && meData.plan) ? meData.plan : "DEMO";
      currentPlan = R() ? R().normalizePlanKey(raw, "DEMO") : (raw === "FREE" ? "DEMO" : (raw === "ENTERPRISE" || raw === "INDIVIDUAL") ? "INDIVIDUELL" : raw);
      renderPlans();
      renderCurrentPlan();
      maybePreselectPlan();
      loadHistory();
    }).catch(function() {
      renderPlans();
      renderCurrentPlan();
      maybePreselectPlan();
      loadHistory();
    });
  })();
