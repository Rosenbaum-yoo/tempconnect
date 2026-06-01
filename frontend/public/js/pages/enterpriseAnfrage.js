/* ══════════════════════════════════════════════════════
   Individueller Tarif Anfrage — Page Logic

   Ab Welle 8 Schritt 13 holt diese Datei ALLE Add-ons (`addons[]`) UND den
   Individuell-Sockel (`individuell_baseline`) aus `GET /api/public/catalog`
   ueber `TC.catalog`. Hartcodierte Preise / Seat-Limits / Add-on-Listen
   sind entfernt. Submit-Payload bleibt zur bestehenden
   `enterprise_config`-Backend-Logik kompatibel (EUR-Werte; Server multipliziert
   *100 zu Cents).
   ═════════════════════════════════════════════════════ */
  (function() {
    function R() { return (window.TC && window.TC.catalog) ? window.TC.catalog : null; }

    /* ── Catalog-State (gefuellt im init aus /api/public/catalog) ─── */
    var ADDONS = [];                  // Aktive Add-ons (interval=monthly|onetime)
    var BASE_PRICE = 2499;            // EUR Sockel (Default-Fallback)
    var SEAT_INCLUDED = 50;
    var SEAT_PRICE = 29;
    var selectedAddons = {};
    var catalogReady = false;
    var catalogError = null;
    var lastEstimate = { monthly: BASE_PRICE, onetime: 0 };

    /**
     * Mappt einen Catalog-Addon-Eintrag (Cents) auf das interne Render-Format
     * (EUR + unit-Label). `id` muss dem `key` entsprechen, damit der bestehende
     * Submit-Payload (`addons:[{id,name,price,type}]`) kompatibel bleibt.
     */
    function mapCatalogAddon(a) {
      if (!a) return null;
      var priceEur = (typeof a.price_cents === "number" && isFinite(a.price_cents))
        ? Math.round(a.price_cents / 100) : 0;
      var unit = (a.interval === "onetime") ? "einmalig" : "/Monat";
      return {
        id: a.key,
        name: a.name,
        desc: a.description || "",
        price: priceEur,
        unit: unit,
        type: (a.interval === "onetime") ? "onetime" : "monthly",
        soon: a.coming_soon === true
      };
    }

    function applyCatalog(cat) {
      if (!cat) { catalogError = catalogError || new Error("NO_CATALOG"); return; }
      var addons = Array.isArray(cat.addons) ? cat.addons : [];
      ADDONS = addons.map(mapCatalogAddon).filter(Boolean);
      var baseline = cat.individuell_baseline || null;
      if (baseline) {
        if (typeof baseline.base_monthly_cents === "number") BASE_PRICE = Math.round(baseline.base_monthly_cents / 100);
        if (typeof baseline.seats_included === "number") SEAT_INCLUDED = baseline.seats_included;
        if (typeof baseline.extra_seat_cents_per_month === "number") SEAT_PRICE = Math.round(baseline.extra_seat_cents_per_month / 100);
      }
      catalogReady = true;
    }

    /* ── Render Add-on Grid ──────────────────────────── */
    function renderAddons() {
      var grid = document.getElementById("addonGrid");
      if (!grid) return;
      grid.innerHTML = "";
      if (!catalogReady) {
        if (catalogError) {
          grid.innerHTML = '<div class="addon-empty" style="padding:var(--ds-space-4);color:var(--ds-text-secondary);font-size:13px">Add-ons konnten nicht geladen werden. <button type="button" class="ds-btn ds-btn--sm" style="margin-left:8px" onclick="location.reload()">Erneut versuchen</button></div>';
        } else {
          grid.innerHTML = '<div class="addon-empty" style="padding:var(--ds-space-4);color:var(--ds-text-secondary);font-size:13px">Lade Add-ons&hellip;</div>';
        }
        return;
      }
      if (!ADDONS.length) {
        grid.innerHTML = '<div class="addon-empty" style="padding:var(--ds-space-4);color:var(--ds-text-secondary);font-size:13px">Aktuell keine Add-ons verf&uuml;gbar.</div>';
        return;
      }
      ADDONS.forEach(function(a) {
        var item = document.createElement("label");
        item.className = "addon-item";
        item.setAttribute("data-addon", a.id);

        var cb = document.createElement("input");
        cb.type = "checkbox";
        cb.disabled = a.soon === true;
        cb.onchange = function() { toggleAddon(a.id, cb.checked); };

        var info = document.createElement("div");
        info.className = "addon-info";
        var soonHtml = a.soon ? " <span class='soon-tag'>Bald verf\u00fcgbar</span>" : "";
        info.innerHTML = "<div class='addon-name'>" + esc(a.name) + soonHtml + "</div><div class='addon-desc'>" + esc(a.desc) + "</div>";

        var price = document.createElement("div");
        price.className = "addon-price";
        price.innerHTML = a.price + " EUR<span>" + esc(a.unit) + "</span>";

        item.appendChild(cb);
        item.appendChild(info);
        item.appendChild(price);
        grid.appendChild(item);
      });
    }

    function applyBaselineToDom() {
      // Baseline-Texte ("Basispaket / 50 Nutzer / 29 EUR") auf der rechten
      // Invoice-Seite synchron halten. HTML hat statische Strings,
      // die wir hier mit Catalog-Daten ueberschreiben (idempotent).
      var renderer = R();
      var fmt = renderer ? renderer.fmtCents : null;
      var baseLine = document.querySelector(".invoice-line.base .amount");
      if (baseLine && fmt) {
        var fmtBase = fmt(BASE_PRICE * 100);
        if (fmtBase) baseLine.textContent = fmtBase;
      }
      var hint = document.querySelector(".invoice-line.base + div");
      if (hint) hint.textContent = "Alle Standard-Features, bis " + SEAT_INCLUDED + " Nutzer";
    }

    function toggleAddon(id, checked) {
      if (checked) {
        selectedAddons[id] = true;
      } else {
        delete selectedAddons[id];
      }
      // Visual state
      var item = document.querySelector('.addon-item[data-addon="' + id + '"]');
      if (item) { item.classList.toggle("selected", checked); }
      window.recalc();
    }

    /* ── Recalculate Invoice ───────────────────────── */
    window.recalc = function recalc() {
      var monthly = BASE_PRICE;
      var onetime = 0;
      var addonHtml = "";

      // Add-ons
      ADDONS.forEach(function(a) {
        if (!selectedAddons[a.id]) return;
        if (a.type === "monthly") {
          monthly += a.price;
          addonHtml += "<div class='invoice-line addon'><span class='label'>" + esc(a.name) + "</span><span class='amount'>" + a.price + " EUR</span></div>";
        } else {
          onetime += a.price;
        }
      });
      document.getElementById("invoiceAddons").innerHTML = addonHtml;

      // Seats
      var seats = parseInt(document.getElementById("seatCount").value) || 50;
      if (seats < 1) seats = 1;
      var extraSeats = Math.max(0, seats - SEAT_INCLUDED);
      var seatCost = extraSeats * SEAT_PRICE;
      monthly += seatCost;

      var seatLabel = document.getElementById("seatCostLabel");
      var seatLine = document.getElementById("invoiceSeatLine");
      if (extraSeats > 0) {
        seatLabel.textContent = "+" + seatCost + " EUR/Monat";
        seatLine.style.display = "flex";
        document.getElementById("invoiceSeatQty").textContent = extraSeats + " x " + SEAT_PRICE + " EUR";
        document.getElementById("invoiceSeatAmount").textContent = seatCost + " EUR";
      } else {
        seatLabel.textContent = "Im Standard enthalten";
        seatLine.style.display = "none";
      }

      // Totals
      document.getElementById("invoiceMonthly").textContent = fmtPrice(monthly) + " EUR";

      var einmaligRow = document.getElementById("invoiceEinmaligRow");
      if (onetime > 0) {
        einmaligRow.style.display = "flex";
        document.getElementById("invoiceEinmalig").textContent = fmtPrice(onetime) + " EUR";
      } else {
        einmaligRow.style.display = "none";
      }

      lastEstimate.monthly = monthly;
      lastEstimate.onetime = onetime;
    };

    /* ── Submit ───────────────────────────────────────────── */
    window.submitRequest = function() {
      var company = document.getElementById("fCompany").value.trim();
      var contact = document.getElementById("fContact").value.trim();
      var email   = document.getElementById("fEmail").value.trim();
      var contactRole = document.getElementById("fContactRole") ? document.getElementById("fContactRole").value.trim() : "";

      if (!company || !contact || !email) {
        alert("Bitte Firma, Ansprechpartner und E-Mail ausfuellen.");
        return;
      }

      var errEl = document.getElementById("submitError");
      if (errEl) { errEl.style.display = "none"; errEl.textContent = ""; }

      var btn = document.getElementById("btnSubmit");
      btn.disabled = true;
      btn.textContent = "Wird gesendet\u2026";

      // Konfiguration einsammeln
      var seats = parseInt(document.getElementById("seatCount").value) || 50;
      if (seats < 1) seats = 1;
      var addons = [];
      ADDONS.forEach(function(a) {
        if (selectedAddons[a.id]) addons.push({ id: a.id, name: a.name, price: a.price, type: a.type });
      });

      var payload = {
        // Plan-Wunsch (Server normalisiert ENTERPRISE -> INDIVIDUELL).
        plan: "INDIVIDUELL",
        base_price: BASE_PRICE,
        addons: addons,
        seats: seats,
        seats_included: SEAT_INCLUDED,
        extra_seat_price: SEAT_PRICE,
        monthly_estimate: lastEstimate.monthly,
        onetime_estimate: lastEstimate.onetime,
        company: company,
        contact: contact,
        email: email,
        phone: document.getElementById("fPhone").value.trim(),
        street: document.getElementById("fStreet").value.trim(),
        city: document.getElementById("fCity").value.trim(),
        vat_id: document.getElementById("fVat").value.trim(),
        expected_start: document.getElementById("fStart").value,
        notes: document.getElementById("fNotes").value.trim(),

        // Optionaler Kooperations-Block (kein Vertragsabschluss).
        strategic_collaboration_interest: document.getElementById("fStrategicCollabInterest")
          ? document.getElementById("fStrategicCollabInterest").checked === true
          : false,
        strategic_collaboration_message: document.getElementById("fStrategicCollabMessage")
          ? (document.getElementById("fStrategicCollabMessage").value.trim() || null)
          : null,
        strategic_collaboration_site_count: document.getElementById("fStrategicCollabSiteCount")
          ? (document.getElementById("fStrategicCollabSiteCount").value
              ? Number(document.getElementById("fStrategicCollabSiteCount").value)
              : null)
          : null,
        strategic_collaboration_region_scope: document.getElementById("fStrategicCollabRegionScope")
          ? (document.getElementById("fStrategicCollabRegionScope").value.trim() || null)
          : null
      };
      // Technische Anforderungen (SSO/MFA/API/Compliance) in Notes zusammenfuehren
      var techReqs = [];
      if (document.getElementById("fReqSso") && document.getElementById("fReqSso").checked) techReqs.push("SSO/SAML");
      if (document.getElementById("fReqMfa") && document.getElementById("fReqMfa").checked) techReqs.push("MFA-Pflicht");
      if (document.getElementById("fReqApi") && document.getElementById("fReqApi").checked) techReqs.push("REST-API/Integration");
      if (document.getElementById("fReqCompliance") && document.getElementById("fReqCompliance").checked) techReqs.push("Compliance/Audit");
      if (techReqs.length) {
        var techNote = "Technische Anforderungen: " + techReqs.join(", ");
        payload.notes = techNote + (payload.notes ? " \u00b7 " + payload.notes : "");
      }

      if (contactRole) {
        var note = payload.notes || "";
        if (note.indexOf("Kontaktrolle:") === -1) {
          payload.notes = ("Kontaktrolle: " + contactRole + (note ? " \u00b7 " + note : "")).trim();
        }
      }

      function showError(msg) {
        if (!errEl) { alert(msg); return; }
        errEl.textContent = msg;
        errEl.style.display = "block";
      }

      function describeError(httpStatus, payloadData) {
        if (!payloadData) {
          if (httpStatus === 0) return "Verbindung fehlgeschlagen. Bitte Internetverbindung pruefen und erneut versuchen.";
          if (httpStatus >= 500) return "Server nicht erreichbar. Bitte spaeter erneut versuchen.";
          return "Anfrage fehlgeschlagen (Status " + httpStatus + ").";
        }
        // Backend liefert in v1 entweder { error: "CODE", message } oder
        // { error: { code, message } }.
        var code = (payloadData.error && payloadData.error.code) || payloadData.error || null;
        var msg = (payloadData.error && payloadData.error.message) || payloadData.message || null;
        if (code === "VALIDATION") {
          var details = payloadData.details || (payloadData.error && payloadData.error.details) || [];
          if (Array.isArray(details) && details.length) {
            var first = details[0];
            var path = Array.isArray(first.path) ? first.path.join(".") : (first.path || "");
            return "Bitte Eingaben pruefen" + (path ? " (" + path + ")" : "") + ".";
          }
          return "Bitte Eingaben pruefen.";
        }
        if (code === "RATE_LIMITED") return "Zu viele Anfragen in kurzer Zeit. Bitte einige Minuten warten.";
        if (code === "DUPLICATE_OPEN_REQUEST") return "Wir haben bereits eine offene Anfrage zu dieser E-Mail. Wir melden uns in Kuerze.";
        if (code === "CSRF_INVALID") return "Sicherheitstoken abgelaufen. Bitte Seite neu laden und erneut versuchen.";
        if (msg) return msg;
        if (typeof code === "string") return code;
        return "Anfrage fehlgeschlagen. Bitte erneut versuchen.";
      }

      // Backend-Call. Public-Visitors bekommen via GET /api/csrf eine Session.
      fetch("/api/csrf", { credentials: "include" })
        .then(function(r) { return r.ok ? r.json() : {}; })
        .then(function(csrf) {
          return fetch("/api/enterprise-request", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-csrf-token": csrf.csrfToken || csrf.token || ""
            },
            body: JSON.stringify(payload),
            credentials: "include"
          }).then(function(resp) {
            return resp.json().catch(function() { return null; }).then(function(data) {
              return { status: resp.status, ok: resp.ok, data: data };
            });
          });
        })
        .then(function(result) {
          if (!result.ok) {
            showError(describeError(result.status, result.data));
            btn.disabled = false;
            btn.textContent = "Anfrage absenden";
            return;
          }
          showSuccess(result.data && result.data.data ? result.data.data : result.data);
        })
        .catch(function(e) {
          showError(describeError(0, null));
          if (e && e.message && window.console) { window.console.warn("enterprise-request submit failed", e); }
          btn.disabled = false;
          btn.textContent = "Anfrage absenden";
        });
    };

    function showSuccess(responseData) {
      document.getElementById("contactCard").style.display = "none";
      document.getElementById("successMsg").classList.add("visible");
      renderSuccessPreviewDocument(responseData);
      var actions = document.getElementById("successActions");
      if (actions && actions.dataset && actions.dataset.ready === "true") {
        actions.style.display = "flex";
      }
      window.scrollTo({ top: document.getElementById("successMsg").offsetTop - 80, behavior: "smooth" });
    }

    function renderSuccessPreviewDocument(responseData) {
      var success = document.getElementById("successMsg");
      if (!success) return;
      var existing = document.getElementById("successPreviewDocument");
      if (existing) existing.remove();
      var doc = responseData && (responseData.cost_preview_document || responseData.costPreviewDocument || responseData.document);
      if (!doc || !doc.id || !doc.download_url) return;
      var url = safePublicPreviewDownloadUrl(doc.download_url);
      if (!url) return;
      var block = document.createElement("div");
      block.id = "successPreviewDocument";
      block.style.marginTop = "var(--ds-space-4)";
      block.style.padding = "var(--ds-space-3)";
      block.style.border = "1px solid rgba(57,217,138,.25)";
      block.style.borderRadius = "var(--ds-radius-md)";
      block.style.background = "rgba(0,0,0,.08)";
      block.innerHTML =
        '<div style="font-size:12px;color:var(--ds-text-secondary);margin-bottom:6px">Ihre unverbindliche Kostenvorschau wurde erzeugt.</div>' +
        '<div style="font-size:13px;margin-bottom:8px"><strong>Dokument-ID:</strong> <code>' + esc(doc.id) + '</code>' +
          (doc.document_number ? ' <span style="color:var(--ds-text-secondary)">(' + esc(doc.document_number) + ')</span>' : '') +
        '</div>' +
        '<a class="ds-btn ds-btn--primary" href="' + esc(url) + '" target="_blank" rel="noopener">Kostenvorschau herunterladen</a>' +
        '<div style="font-size:11px;color:var(--ds-text-tertiary);margin-top:8px">Unverbindliche Preview; das verbindliche Angebot folgt nach Pruefung durch das Tarif-Team.</div>';
      var actions = document.getElementById("successActions");
      if (actions && actions.parentNode === success) {
        success.insertBefore(block, actions);
      } else {
        success.appendChild(block);
      }
    }

    function safePublicPreviewDownloadUrl(value) {
      var v = String(value || "").trim();
      if (!v) return "";
      if (v.startsWith("//") || v.startsWith("http://") || v.startsWith("https://")) return "";
      if (!/^\/api\/subscription-documents\/[^/]+\/public-download$/.test(v)) return "";
      return v;
    }

    /* ── Print ────────────────────────────────────────────── */
    window.printInvoice = function() { window.print(); };

    window.toggleStrategicCollabBlock = function toggleStrategicCollabBlock() {
      var cb = document.getElementById("fStrategicCollabInterest");
      var msg = document.getElementById("fStrategicCollabMessage");
      var sites = document.getElementById("fStrategicCollabSiteCount");
      var scope = document.getElementById("fStrategicCollabRegionScope");
      if (!cb || !msg || !sites || !scope) return;
      var enabled = cb.checked === true;
      msg.disabled = !enabled;
      sites.disabled = !enabled;
      scope.disabled = !enabled;
    };
    /* ── Prefill Contact Fields ─────────────────────────── */
    function safeTrim(v) { return String(v || "").trim(); }
    function firstNonEmpty() {
      for (var i = 0; i < arguments.length; i++) {
        var v = safeTrim(arguments[i]);
        if (v) return v;
      }
      return "";
    }
    function setIfEmpty(id, value) {
      var el = document.getElementById(id);
      if (!el) return;
      if (safeTrim(el.value)) return;
      var v = safeTrim(value);
      if (!v) return;
      el.value = v;
    }
    function formatCity(postalCode, city) {
      var p = safeTrim(postalCode);
      var c = safeTrim(city);
      if (p && c) return p + " " + c;
      return p || c || "";
    }
    function unwrapProfileResponse(payload) {
      if (!payload) return null;
      return payload.data || payload;
    }
    function pickPrimaryContact(contacts) {
      if (!Array.isArray(contacts) || !contacts.length) return null;
      for (var i = 0; i < contacts.length; i++) {
        if (contacts[i] && contacts[i].is_primary) return contacts[i];
      }
      return contacts[0] || null;
    }
    function isBillingContact(contact) {
      if (!contact) return false;
      var role = safeTrim(contact.role_title).toLowerCase();
      var email = safeTrim(contact.email).toLowerCase();
      var keywords = ["billing", "rechnung", "finance", "buchhaltung", "accounting", "invoice"];
      for (var i = 0; i < keywords.length; i++) {
        if (role.indexOf(keywords[i]) >= 0) return true;
      }
      return email.indexOf("billing") >= 0 || email.indexOf("rechnung") >= 0 || email.indexOf("invoice") >= 0;
    }
    function pickBillingContact(contacts) {
      if (!Array.isArray(contacts) || !contacts.length) return null;
      for (var i = 0; i < contacts.length; i++) {
        if (contacts[i] && isBillingContact(contacts[i])) return contacts[i];
      }
      return null;
    }
    function fetchJson(path) {
      return fetch(path, { credentials: "include" })
        .then(function(r) { return r.ok ? r.json() : null; })
        .catch(function() { return null; });
    }
    function prefillContactFields() {
      return fetchJson("/api/me").then(function(me) {
        var orgFetch = (me && me.org_id) ? fetchJson("/api/organizations/" + encodeURIComponent(me.org_id)) : Promise.resolve(null);
        return Promise.all([Promise.resolve(me || {}), fetchJson("/api/company-profile"), orgFetch]);
      }).then(function(results) {
          var me = results[0] || {};
          var profilePayload = unwrapProfileResponse(results[1]) || {};
          var org = results[2] || {};
          var profile = profilePayload.profile || {};
          var user = profilePayload.user || {};
          var contacts = profilePayload.contacts || [];
          var billingContact = pickBillingContact(contacts) || {};
          var primaryContact = pickPrimaryContact(contacts) || {};
          var roleMap = {
            owner: "Owner",
            admin: "Admin",
            finance: "Finance",
            program_manager: "Programm-Manager",
            hiring_manager: "Hiring Manager",
            supplier_manager: "Supplier Manager",
            member: "Mitglied",
            viewer: "Viewer",
            supplier_user: "Lieferant",
            recruiter: "Recruiter",
            dispatcher: "Dispatcher",
            platform_admin: "Platform Admin"
          };
          var roleTitle = firstNonEmpty(
            billingContact.role_title,
            primaryContact.role_title,
            roleMap[String(me.org_role || "").toLowerCase()] || ""
          );

          var companyName = firstNonEmpty(
            org.legal_name,
            org.name,
            profile.legal_name,
            me.org_name,
            user.company_name,
            me.company_name
          );
          var contactName = firstNonEmpty(
            billingContact.name,
            org.billing_contact,
            primaryContact.name,
            me.contact_person,
            user.contact_person
          );
          var email = firstNonEmpty(
            org.billing_email,
            billingContact.email,
            primaryContact.email,
            profile.contact_email,
            me.email,
            user.email
          );
          var phone = firstNonEmpty(
            billingContact.phone,
            primaryContact.phone,
            profile.contact_phone,
            me.phone,
            user.phone
          );
          var street = firstNonEmpty(
            me.street,
            user.street
          );
          var cityLine = formatCity(
            firstNonEmpty(me.postal_code, user.postal_code),
            firstNonEmpty(me.city, user.city)
          );
          var vatId = firstNonEmpty(
            me.vat_id,
            user.vat_id
          );

          setIfEmpty("fCompany", companyName);
          setIfEmpty("fContact", contactName);
          setIfEmpty("fEmail", email);
          setIfEmpty("fContactRole", roleTitle);
          setIfEmpty("fPhone", phone);
          setIfEmpty("fStreet", street);
          setIfEmpty("fCity", cityLine);
          setIfEmpty("fVat", vatId);
          return { me: me, org: org, profile: profile, contacts: contacts };
        });
    }
    /* ── Context / Prefill from URL ─────────────────────── */
    function normalizePlanKey(plan) {
      var p = String(plan || "").toUpperCase();
      if (p === "FREE") p = "DEMO";
      if (p === "ENTERPRISE" || p === "INDIVIDUAL") p = "INDIVIDUELL";
      return p || "";
    }
    function getPlanLabel(plan) {
      var key = normalizePlanKey(plan);
      if (!key) return "";
      if (key === "INDIVIDUELL") return "Individueller Tarif";
      return key;
    }
    function getSourceLabel(source) {
      var s = String(source || "").toLowerCase();
      var map = {
        sla_abo: "Abo-Modelle",
        pricing: "Pricing",
        landing: "Landing",
        enterprise: "Enterprise"
      };
      return map[s] || (s ? s : "");
    }
    function getIntentLabel(intent) {
      var i = String(intent || "").toLowerCase();
      if (!i) return "";
      if (i === "upgrade") return "Upgrade auf individuellen Tarif";
      if (i === "request") return "Individuellen Tarif anfragen";
      return i;
    }
    function parseContextParams() {
      var params = new URLSearchParams(window.location.search || "");
      var source = params.get("source") || params.get("context") || "";
      var plan = normalizePlanKey(params.get("plan") || "");
      var currentPlan = normalizePlanKey(params.get("current_plan") || params.get("currentPlan") || "");
      var intent = params.get("intent") || "";
      var returnTo = params.get("return_to") || "";
      if (!returnTo && source === "sla_abo") returnTo = "/public/sla_abo.html";
      return {
        source: source,
        sourceLabel: getSourceLabel(source),
        plan: plan,
        planLabel: getPlanLabel(plan),
        currentPlan: currentPlan,
        currentPlanLabel: getPlanLabel(currentPlan),
        intent: intent,
        intentLabel: getIntentLabel(intent),
        returnTo: returnTo
      };
    }
    function safeReturnPath(value) {
      var v = String(value || "").trim();
      if (!v) return "";
      if (v.startsWith("//") || v.startsWith("http://") || v.startsWith("https://")) return "";
      if (!v.startsWith("/")) return "";
      return v;
    }
    function applyContextBanner(ctx) {
      var banner = document.getElementById("contextBanner");
      if (!banner) return;
      if (!ctx || (!ctx.source && !ctx.plan && !ctx.currentPlan)) return;
      banner.style.display = "block";
      var textEl = document.getElementById("contextBannerText");
      if (textEl) {
        if (ctx.source === "sla_abo") {
          textEl.textContent = "Sie starten eine Anfrage aus den Abo-Modellen. Wir nehmen Ihre Anforderungen auf und erstellen ein individuelles Angebot.";
        } else {
          textEl.textContent = "Sie starten eine Anfrage fuer den individuellen Tarif. Unser Team begleitet Sie bis zum Angebot.";
        }
      }
      var meta = [];
      if (ctx.sourceLabel) meta.push("Quelle: " + ctx.sourceLabel);
      if (ctx.currentPlanLabel) meta.push("Aktueller Plan: " + ctx.currentPlanLabel);
      if (ctx.planLabel) meta.push("Interesse: " + ctx.planLabel);
      if (ctx.intentLabel) meta.push("Ziel: " + ctx.intentLabel);
      var metaEl = document.getElementById("contextBannerMeta");
      if (metaEl) metaEl.textContent = meta.join(" • ");
    }
    function applyContextPrefill(ctx) {
      if (!ctx) return;
      var notes = document.getElementById("fNotes");
      if (!notes) return;
      if (safeTrim(notes.value)) return;
      var parts = [];
      if (ctx.sourceLabel) parts.push("Quelle: " + ctx.sourceLabel);
      if (ctx.planLabel) parts.push("Interesse: " + ctx.planLabel);
      if (ctx.currentPlanLabel) parts.push("Aktueller Plan: " + ctx.currentPlanLabel);
      if (ctx.intentLabel) parts.push("Ziel: " + ctx.intentLabel);
      if (parts.length) notes.value = parts.join(" · ");
    }
    function prepareSuccessReturn(ctx) {
      var actions = document.getElementById("successActions");
      var link = document.getElementById("successReturnLink");
      if (!actions || !link || !ctx) return;
      var safePath = safeReturnPath(ctx.returnTo);
      if (!safePath) return;
      link.setAttribute("href", safePath);
      actions.dataset.ready = "true";
    }

    /* ── Helpers ──────────────────────────────────────────── */
    function esc(s) { return String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
    function fmtPrice(n) { return n.toLocaleString("de-DE"); }

    /* ── Init ─────────────────────────────────────── */
    function loadCatalogSafe() {
      if (!R()) {
        catalogError = new Error("catalogRenderer fehlt (TC.catalog)");
        return Promise.resolve(null);
      }
      return R().load().then(function (cat) {
        applyCatalog(cat);
        return cat;
      }).catch(function (err) {
        catalogError = err;
        return null;
      });
    }

    // Erste Render-Phase mit Defaults (Sockel/Seats), damit das Skelett da ist.
    renderAddons();
    window.toggleStrategicCollabBlock();
    var requestContext = parseContextParams();
    applyContextBanner(requestContext);
    prepareSuccessReturn(requestContext);

    // Catalog laden, dann erneut rendern + recalc.
    loadCatalogSafe().then(function () {
      applyBaselineToDom();
      renderAddons();
      window.recalc();
    });

    prefillContactFields().then(function(result) {
      var me = result && result.me ? result.me : null;
      if (me && !requestContext.currentPlan) {
        var fallbackPlan = normalizePlanKey(me.plan || "");
        if (fallbackPlan) {
          requestContext.currentPlan = fallbackPlan;
          requestContext.currentPlanLabel = getPlanLabel(fallbackPlan);
        }
      }
      applyContextBanner(requestContext);
      applyContextPrefill(requestContext);
    });
  })();
