"use strict";

  (function() {
    var API = "/api";
    var params = new URLSearchParams(window.location.search);
    var entryId = params.get("id");
    var isOwner = params.get("owner") === "1";
    var feedType = params.get("type") || "supply";
    var isDemand = feedType === "demand";
    var currentEntry = null;
    var currentIsDemand = isDemand;
    var activeInteractionType = null;
    var viewerRole = null;
    var detailBooted = false;

    if (!entryId) { window.location.href = "/public/capacity_exchange_feed.html"; return; }

    function esc(s) { return s == null ? "" : String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
    function fmtDate(d) { return d ? String(d).substring(0,10) : "—"; }
    function fmtSize(bytes) { if (!bytes) return ""; if (bytes < 1024) return bytes + " B"; if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB"; return (bytes / 1048576).toFixed(1) + " MB"; }
    function toAssetUrl(rawPath) {
      var p = String(rawPath || "");
      if (!p) return "";
      if (p.startsWith("http://") || p.startsWith("https://") || p.startsWith("/")) return p;
      return "/" + p;
    }
    function count(value, fallback) {
      var num = Number(value);
      if (isFinite(num)) return Math.max(0, Math.trunc(num));
      return fallback;
    }
    function entryTotalHeadcount(entry) {
      return Math.max(1, count(entry && entry.headcount, 1));
    }
    function entryRemainingHeadcount(entry) {
      if (!entry) return 1;
      if (entry.remaining_open_count != null) return Math.max(0, count(entry.remaining_open_count, 0));
      if (entry.remaining_headcount != null) return Math.max(0, count(entry.remaining_headcount, 0));
      if (entry.capacity_remaining_headcount != null) return Math.max(0, count(entry.capacity_remaining_headcount, 0));
      return entryTotalHeadcount(entry);
    }
    function entryCommittedHeadcount(entry) {
      if (!entry) return 0;
      if (entry.committed_headcount != null) return Math.max(0, count(entry.committed_headcount, 0));
      if (entry.capacity_committed_headcount != null) return Math.max(0, count(entry.capacity_committed_headcount, 0));
      return 0;
    }
    function normalizeUrgency(value) {
      return String(value || "").toLowerCase();
    }
    function isEmergencyUrgency(value) {
      var u = normalizeUrgency(value);
      return u === "notdienst" || u === "urgent" || u === "critical";
    }
    function demandRemainingOpenCount(entry) {
      if (!entry) return 1;
      if (entry.remaining_open_count != null) return Math.max(0, count(entry.remaining_open_count, 0));
      if (entry.required_total_count != null || entry.currently_committed_count != null) {
        var total = Math.max(1, count(entry.required_total_count || entry.headcount, 1));
        var committed = Math.max(0, count(entry.currently_committed_count, 0));
        return Math.max(total - committed, 0);
      }
      return entryTotalHeadcount(entry);
    }
    function formatSupplyHeadcount(entry) {
      var total = entryTotalHeadcount(entry);
      var remaining = entryRemainingHeadcount(entry);
      var committed = entryCommittedHeadcount(entry);
      if (committed > 0 || remaining !== total || entry.status === "reserved") {
        return remaining + " frei / " + total + " gesamt" + (committed > 0 ? " · " + committed + " dealgebunden" : "");
      }
      return total + " Personen";
    }
    function formatStatusCapacityHint(entry) {
      if (!entry || currentIsDemand) return "";
      var total = entryTotalHeadcount(entry);
      var remaining = entryRemainingHeadcount(entry);
      if (entry.status === "reserved") {
        return "Voll reserviert · 0 von " + total + " frei";
      }
      if (remaining < total) {
        return remaining + " von " + total + " frei";
      }
      return "";
    }

    function toast(msg, type) {
      var el = document.getElementById("toast");
      el.textContent = msg;
      el.className = "ds-toast ds-alert ds-alert--" + (type || "info") + " show";
      clearTimeout(el._t);
      el._t = setTimeout(function() { el.classList.remove("show"); }, 3500);
    }

    function getCsrf() {
      return fetch(API + "/csrf", { credentials: "include" }).then(function(r) { return r.ok ? r.json() : {}; });
    }

    function interactionApiPath() {
      return currentIsDemand
        ? ("/marketplace/demand-requests/" + entryId + "/interactions")
        : ("/capacity-exchange/entries/" + entryId + "/interactions");
    }

    function apiFetch(path, opts) {
      opts = opts || {};
      var headers = { "Content-Type": "application/json" };
      if (opts.csrf) headers["X-CSRF-Token"] = opts.csrf;
      if (opts.method && opts.method !== "GET") {
        headers["Idempotency-Key"] = (crypto.randomUUID ? crypto.randomUUID() : "x-" + Math.random().toString(36).slice(2) + "-" + Date.now());
      }
      return fetch(API + path, { method: opts.method || "GET", headers: headers, body: opts.body ? JSON.stringify(opts.body) : undefined, credentials: "include" });
    }

    function getInteractionConfig(type) {
      var supply = !currentIsDemand;
      var map = {
        interest: {
          title: supply ? "Interesse am Angebot bekunden" : "Interesse am Arbeitsplatzangebot bekunden",
          subtitle: supply ? "Qualifizierter Erstkontakt fuer moegliche Besetzung" : "Qualifizierter Erstkontakt zur Besetzung",
          button: "Interesse senden",
          nextHint: "Die Gegenseite erhaelt Ihr strukturiertes Interesse und kann die naechste Deal-Abstimmung starten."
        },
        offer_request: {
          title: supply ? "Angebot anfragen" : "Verfuegbarkeit anfragen",
          subtitle: supply ? "Anfrage mit operativen Eckdaten statt Freitext" : "Rueckmeldung mit Umsetzungsdaten vorbereiten",
          button: supply ? "Anfrage senden" : "Rueckfrage senden",
          nextHint: "Die Anfrage wird mit Zeitraum, Umfang und Kontext gespeichert und kann direkt in den Deal-Prozess uebergehen."
        },
        question: {
          title: "Fachliche Rueckfrage stellen",
          subtitle: "Kontextbezogene Frage mit klarer Zuordnung zum Eintrag",
          button: "Frage senden",
          nextHint: "Die Rueckfrage ist dem Eintrag eindeutig zugeordnet und fuer beide Seiten nachvollziehbar."
        },
        contact: {
          title: "Kontakt abstimmen",
          subtitle: "Kommunikationsweg und naechsten operativen Schritt festlegen",
          button: "Kontaktanfrage senden",
          nextHint: "Die Kontaktpraeferenz wird dokumentiert, damit der Austausch ohne Medienbruch starten kann."
        },
        deal_accept: {
          title: "Konditionen zustimmen",
          subtitle: "Signalisieren Sie verbindliche Dealbereitschaft zu den angebotenen Konditionen.",
          button: "Zustimmung verbindlich uebermitteln",
          nextHint: "Die Zeitarbeitsfirma wird sofort informiert. Danach folgt die operative Abstimmung ueber TempConnect, E-Mail oder Telefon."
        },
        deal_negotiate: {
          title: "Um Verhandlung bitten",
          subtitle: "Teilen Sie mit, welche Konditionen angepasst werden sollen.",
          button: "Verhandlungsanfrage senden",
          nextHint: "Die Gegenseite erhaelt eine strukturierte Verhandlungsanfrage. Der Deal bleibt offen bis zur Einigung."
        },
        emergency_commit: {
          title: "Notdienst-Zusage senden",
          subtitle: "Schnelle Zusage fuer eine dringende Anfrage.",
          button: "Notdienst zusagen",
          nextHint: "Ihre Zusage wird sofort dokumentiert und an die anfragende Seite uebermittelt."
        }
      };
      return map[type] || map.question;
    }

    function buildActionZoneCopy() {
      var leadEl = document.getElementById("action-zone-lead");
      var titleEl = document.getElementById("interact-title");
      if (!leadEl) return;
      var isEmergencyDemand = currentIsDemand && currentEntry && isEmergencyUrgency(currentEntry.urgency);
      var remainingOpen = isEmergencyDemand && currentEntry ? demandRemainingOpenCount(currentEntry) : null;
      var emergencyBtn = document.getElementById("btn-emergency-commit");
      var emergencyMeta = document.getElementById("btn-emergency-commit-meta");
      if (emergencyBtn) {
        if (isEmergencyDemand) {
          emergencyBtn.style.display = "inline-flex";
          emergencyBtn.disabled = remainingOpen != null && remainingOpen <= 0;
          if (emergencyMeta) {
            emergencyMeta.textContent = remainingOpen != null ? (remainingOpen > 0 ? remainingOpen + " offen" : "voll") : "";
          }
        } else {
          emergencyBtn.style.display = "none";
        }
      }
      if (currentIsDemand) {
        if (titleEl) titleEl.textContent = "Naechste Schritte";
        if (isEmergencyDemand) {
          leadEl.textContent = "Notdienst-Anfrage mit sofortigem Handlungsbedarf." + (remainingOpen != null ? (" Noch " + remainingOpen + " offen.") : "");
        } else {
          leadEl.textContent = "Reagieren Sie auf dieses Arbeitsplatzangebot.";
        }
      } else {
        if (titleEl) titleEl.textContent = "Naechste Schritte";
        leadEl.textContent = "Reagieren Sie auf dieses Angebot der Zeitarbeitsfirma.";
      }
    }

    // Gegenseitenlogik: CTA nur anzeigen wenn Viewer die richtige Marktseite ist
    function shouldShowActionZone() {
      if (!viewerRole) return true; // Fallback: anzeigen wenn Rolle unbekannt
      if (currentIsDemand) {
        // Demand von Company: nur Agency darf reagieren
        return viewerRole === "agency";
      }
      // Supply von Agency: nur Company darf reagieren
      return viewerRole === "company";
    }

    function canUseActionZone() {
      if (!viewerRole) return true;
      if (viewerRole === "worker" || viewerRole === "admin") return false;
      if (currentIsDemand && viewerRole === "company") return false;
      if (!currentIsDemand && viewerRole === "agency") return false;
      return true;
    }

    function summarizeInteractionPayload(type, payload) {
      var parts = [];
      if (payload.start_date) parts.push("Start: " + payload.start_date);
      if (payload.end_date) parts.push("Ende: " + payload.end_date);
      if (payload.headcount) parts.push("Umfang: " + payload.headcount);
      if (payload.location_context) parts.push("Standort: " + payload.location_context);
      if (payload.response_deadline) parts.push("Rueckmeldung bis: " + payload.response_deadline);
      if (payload.contact_preference) parts.push("Kontakt: " + payload.contact_preference);
      var prefix = INTERACTION_LABELS[type] || "Interaktion";
      return prefix + " gesendet. " + (parts.length ? ("Erfasst: " + parts.join(" | ")) : "Kontextbezogene Nachricht erfasst.");
    }

    function buildInteractionMessage(type, payload) {
      var lines = [];
      lines.push("[TC-Interaction]");
      lines.push("Typ: " + (INTERACTION_LABELS[type] || type));
      lines.push("Eintrag: " + (currentEntry && currentEntry.title ? currentEntry.title : entryId));
      lines.push("Flow: " + (currentIsDemand ? "Nachfrage" : "Angebot"));
      if (payload.start_date) lines.push("Start: " + payload.start_date);
      if (payload.end_date) lines.push("Ende: " + payload.end_date);
      if (payload.headcount) lines.push("Umfang: " + payload.headcount);
      if (payload.location_context) lines.push("Standort: " + payload.location_context);
      if (payload.response_deadline) lines.push("Rueckmeldung bis: " + payload.response_deadline);
      if (payload.topic) lines.push("Thema: " + payload.topic);
      if (payload.requirements) lines.push("Anforderungen: " + payload.requirements);
      if (payload.contact_preference) lines.push("Kontaktpraeferenz: " + payload.contact_preference);
      if (payload.message) {
        lines.push("Nachricht:");
        lines.push(payload.message);
      }
      lines.push("Naechster Schritt: Kontakt/Deal-Abstimmung ueber TempConnect.");
      return lines.join("\n").substring(0, 2000);
    }

    /* ── Einsatzbestaetigungs-Dokumenten-Modal ───────────────── */
    function showAgreementModal(result) {
      var backdrop = document.getElementById("agreement-modal-backdrop");
      if (!backdrop) return;
      var refEl = document.getElementById("agreement-modal-ref");
      var statusEl = document.getElementById("agreement-modal-status");
      var docEl = document.getElementById("agreement-modal-doc");
      var downloadBtn = document.getElementById("agreement-modal-download");
      var conditionsBtn = document.getElementById("agreement-modal-conditions");
      var dealBtn = document.getElementById("agreement-modal-deal");
      var closeBtn = document.getElementById("agreement-modal-close");
      var condGrid = document.getElementById("agreement-modal-conditions-grid");

      if (refEl) refEl.textContent = result.agreement_ref
        ? "Einsatzvereinbarung " + result.agreement_ref + " erstellt"
        : "Einsatzbestaetigung erstellt";
      if (statusEl) {
        var remainingAfterDeal = count(result && result.remaining_headcount, null);
        var statusCopy = "Deal abgeschlossen \u2014 die Gegenseite wird benachrichtigt.";
        if (!currentIsDemand && remainingAfterDeal != null) {
          statusCopy = remainingAfterDeal > 0
            ? "Personalangebot teilweise gebunden \u2014 noch " + remainingAfterDeal + " freie Plaetze verbleiben."
            : "Personalangebot reserviert \u2014 keine freie Restmenge mehr.";
        }
        statusEl.innerHTML = '<div class="ds-alert ds-alert--success" style="text-align:center">' + esc(statusCopy) + '</div>';
      }

      // Konditions-Summary inline rendern (aus Entry-Daten)
      if (condGrid && currentEntry) {
        var e = currentEntry;
        var requestedHeadcount = count(result && result.requested_headcount, currentIsDemand ? entryTotalHeadcount(e) : entryRemainingHeadcount(e));
        var gridHtml = '';
        gridHtml += '<div><div style="font-size:10px;color:var(--ds-text-tertiary);text-transform:uppercase">Rolle</div><div style="font-weight:700">' + esc(e.role || '\u2014') + '</div></div>';
        gridHtml += '<div><div style="font-size:10px;color:var(--ds-text-tertiary);text-transform:uppercase">Ort</div><div style="font-weight:700">' + esc(e.location_city || '\u2014') + '</div></div>';
        gridHtml += '<div><div style="font-size:10px;color:var(--ds-text-tertiary);text-transform:uppercase">Personen im Deal</div><div style="font-weight:700">' + requestedHeadcount + '</div></div>';
        gridHtml += '<div><div style="font-size:10px;color:var(--ds-text-tertiary);text-transform:uppercase">Zeitraum</div><div style="font-weight:700">' + fmtDate(e.availability_from) + (e.availability_to ? ' \u2013 ' + fmtDate(e.availability_to) : '') + '</div></div>';
        if (!currentIsDemand && result && result.remaining_headcount != null) {
          gridHtml += '<div><div style="font-size:10px;color:var(--ds-text-tertiary);text-transform:uppercase">Restfrei nach Deal</div><div style="font-weight:700">' + count(result.remaining_headcount, 0) + '</div></div>';
          gridHtml += '<div><div style="font-size:10px;color:var(--ds-text-tertiary);text-transform:uppercase">Stellen gesamt</div><div style="font-weight:700">' + entryTotalHeadcount(e) + '</div></div>';
        }
        if (e.price_min || e.price_max) {
          gridHtml += '<div><div style="font-size:10px;color:var(--ds-text-tertiary);text-transform:uppercase">Preis</div><div style="font-weight:700;color:var(--ds-brand)">' + (e.price_min ? e.price_min + ' EUR' : '') + (e.price_max ? ' \u2013 ' + e.price_max + ' EUR' : '') + '</div></div>';
        }
        condGrid.innerHTML = gridHtml;
      }

      // Dokument als iframe laden (kompakte Preview)
      if (docEl && result.document_url) {
        docEl.innerHTML = '<iframe src="' + result.document_url + '" style="width:100%;height:100%;border:none" title="Einsatzvereinbarung"></iframe>';
      } else if (docEl) {
        docEl.innerHTML = '<div style="text-align:center;padding:var(--ds-space-6);color:#94a3b8">Dokument wird nach Bestaetigung finalisiert.</div>';
      }

      // Aktions-Buttons
      if (downloadBtn && result.document_url) {
        downloadBtn.href = result.document_url;
        downloadBtn.style.display = "inline-flex";
      }
      if (conditionsBtn && result.conditions_url) {
        conditionsBtn.href = result.conditions_url;
        conditionsBtn.style.display = "inline-flex";
      }
      if (dealBtn && result.offer && result.offer.id) {
        dealBtn.href = "/public/offer_detail.html?id=" + result.offer.id;
        dealBtn.style.display = "flex";
      }

      // Modal oeffnen
      backdrop.style.display = "flex";
      backdrop.setAttribute("aria-hidden", "false");
      document.body.classList.add("ce-modal-open");

      // Schliessen-Handler
      function closeAgreementModal() {
        backdrop.style.display = "none";
        backdrop.setAttribute("aria-hidden", "true");
        document.body.classList.remove("ce-modal-open");
      }
      if (closeBtn) closeBtn.onclick = closeAgreementModal;
      backdrop.onclick = function(ev) { if (ev.target === backdrop) closeAgreementModal(); };
    }

    function setActionZoneStatus(text, tone) {
      var el = document.getElementById("action-zone-status");
      if (!el) return;
      el.style.display = "block";
      el.className = "ce-action-status ds-alert ds-alert--" + (tone || "info");
      el.textContent = text;
    }

    function interactionErrorMessage(code) {
      var map = {
        ACTION_NOT_ALLOWED_ROLE: "Ihre Rolle kann diese Aktion hier nicht ausfuehren.",
        SELF_INTERACTION_FORBIDDEN: "Eigene Eintraege koennen nicht kontaktiert werden.",
        ENTRY_NOT_INTERACTABLE: "Dieser Eintrag ist aktuell nicht mehr fuer neue Anfragen offen.",
        DEMAND_NOT_INTERACTABLE: "Dieses Arbeitsplatzangebot ist aktuell nicht mehr fuer neue Rueckmeldungen offen.",
        SUPPLIER_NOT_MATCHED: "Nur gematchte Anbieter koennen eine Notdienst-Zusage senden.",
        OVERFILL_NOT_ALLOWED: "Die zugesagte Menge ueberschreitet die offenen Stellen.",
        NOT_EMERGENCY: "Dieses Arbeitsplatzangebot ist kein Notdienst.",
        NOT_OPEN: "Der Notdienst ist nicht mehr offen.",
        ALREADY_FULLY_COVERED: "Das Arbeitsplatzangebot ist bereits vollstaendig besetzt.",
        INVALID_QUANTITY: "Bitte geben Sie eine gueltige Menge an.",
        AGENCY_ONLY: "Nur Agenturen koennen eine Notdienst-Zusage senden.",
        NOT_FOUND: "Der Eintrag wurde nicht gefunden oder ist nicht mehr sichtbar.",
        CAPACITY_UNAVAILABLE: "Die verfügbaren Stellen reichen für diesen Deal nicht mehr aus.",
        VALIDATION: "Bitte pruefen Sie Ihre Eingaben und senden Sie erneut."
      };
      return map[code] || "Die Aktion konnte gerade nicht abgeschlossen werden. Bitte erneut versuchen.";
    }

    function setFieldVisibility(id, visible) {
      var el = document.getElementById(id);
      if (!el) return;
      var wrap = el.closest(".ce-field");
      if (wrap) wrap.style.display = visible ? "" : "none";
    }

    function openInteractionModal(type) {
      activeInteractionType = type;
      var cfg = getInteractionConfig(type);
      var backdrop = document.getElementById("interaction-modal-backdrop");
      var isEmergencyCommit = type === "emergency_commit";
      document.getElementById("interaction-modal-title").textContent = cfg.title;
      document.getElementById("interaction-modal-subtitle").textContent = cfg.subtitle;
      document.getElementById("interaction-modal-submit").textContent = cfg.button;
      document.getElementById("im-next-step-hint").textContent = cfg.nextHint;
      document.getElementById("interaction-modal-feedback").style.display = "none";

      var summary = [];
      summary.push("Bezug: " + (currentEntry && currentEntry.title ? currentEntry.title : "Eintrag"));
      summary.push("Rolle: " + (currentEntry && currentEntry.role ? currentEntry.role : "n/a"));
      summary.push("Ort: " + (currentEntry && currentEntry.location_city ? currentEntry.location_city : "n/a"));
      document.getElementById("interaction-modal-summary").textContent = summary.join(" | ");

      var showTopic = type === "question" || type === "contact";
      document.getElementById("im-topic-wrap").style.display = showTopic ? "block" : "none";
      setFieldVisibility("im-start", !isEmergencyCommit);
      setFieldVisibility("im-end", !isEmergencyCommit);
      setFieldVisibility("im-location", !isEmergencyCommit);
      setFieldVisibility("im-response-deadline", !isEmergencyCommit);
      setFieldVisibility("im-contact-pref", !isEmergencyCommit);
      setFieldVisibility("im-requirements", !isEmergencyCommit);

      // Preis-Felder nur bei Verhandlung einblenden
      var priceWrap = document.getElementById("im-price-wrap");
      if (priceWrap) {
        var showPrice = type === "deal_negotiate";
        priceWrap.style.display = showPrice ? "block" : "none";
        if (showPrice && currentEntry) {
          var pmn = document.getElementById("im-price-min");
          var pmx = document.getElementById("im-price-max");
          if (pmn && currentEntry.price_min != null) pmn.value = currentEntry.price_min;
          if (pmx && currentEntry.price_max != null) pmx.value = currentEntry.price_max;
        }
      }
      document.getElementById("im-start").value = "";
      document.getElementById("im-end").value = "";
      var headcountInput = document.getElementById("im-headcount");
      if (headcountInput) {
        var defaultHeadcount = currentEntry ? (currentIsDemand ? entryTotalHeadcount(currentEntry) : entryRemainingHeadcount(currentEntry)) : "";
        if (isEmergencyCommit && currentIsDemand && currentEntry) {
          var openCount = demandRemainingOpenCount(currentEntry);
          if (openCount > 0) defaultHeadcount = openCount;
          if (openCount > 0) {
            headcountInput.max = String(openCount);
          } else {
            headcountInput.removeAttribute("max");
          }
        } else {
          headcountInput.removeAttribute("max");
        }
        headcountInput.value = defaultHeadcount !== "" ? String(defaultHeadcount) : "";
      }
      document.getElementById("im-location").value = currentEntry && currentEntry.location_city ? currentEntry.location_city : "";
      document.getElementById("im-response-deadline").value = "";
      document.getElementById("im-contact-pref").value = "";
      document.getElementById("im-requirements").value = "";
      document.getElementById("im-message").value = "";

      backdrop.style.display = "flex";
      backdrop.setAttribute("aria-hidden", "false");
      document.body.classList.add("ce-modal-open");
    }

    function closeInteractionModal() {
      var backdrop = document.getElementById("interaction-modal-backdrop");
      backdrop.style.display = "none";
      backdrop.setAttribute("aria-hidden", "true");
      document.body.classList.remove("ce-modal-open");
      activeInteractionType = null;
    }

    function bindInteractionModal() {
      var closeBtn = document.getElementById("interaction-modal-close");
      var cancelBtn = document.getElementById("interaction-modal-cancel");
      var backdrop = document.getElementById("interaction-modal-backdrop");
      closeBtn.addEventListener("click", closeInteractionModal);
      cancelBtn.addEventListener("click", closeInteractionModal);
      backdrop.addEventListener("click", function(ev) {
        if (ev.target === backdrop) closeInteractionModal();
      });
      document.getElementById("interaction-modal-form").addEventListener("submit", function(ev) {
        ev.preventDefault();
        if (!activeInteractionType) return;
        var payload = {
          start_date: document.getElementById("im-start").value || null,
          end_date: document.getElementById("im-end").value || null,
          headcount: document.getElementById("im-headcount").value || null,
          location_context: document.getElementById("im-location").value.trim() || null,
          response_deadline: document.getElementById("im-response-deadline").value || null,
          contact_preference: document.getElementById("im-contact-pref").value || null,
          requirements: document.getElementById("im-requirements").value.trim() || null,
          topic: document.getElementById("im-topic-wrap").style.display === "block" ? (document.getElementById("im-topic").value || null) : null,
          message: document.getElementById("im-message").value.trim() || null,
          // Preis-Felder fuer Verhandlung
          price_min: document.getElementById("im-price-min") ? document.getElementById("im-price-min").value || null : null,
          price_max: document.getElementById("im-price-max") ? document.getElementById("im-price-max").value || null : null
        };
        if (!payload.message && activeInteractionType === "question") {
          var fbReq = document.getElementById("interaction-modal-feedback");
          fbReq.className = "ds-alert ds-alert--warning";
          fbReq.textContent = "Bitte formulieren Sie kurz Ihre Rueckfrage.";
          fbReq.style.display = "flex";
          return;
        }
        sendInteraction(activeInteractionType, payload);
      });
      document.querySelectorAll("[data-open-action]").forEach(function(btn) {
        btn.addEventListener("click", function() {
          var action = btn.getAttribute("data-open-action");

          // deal_accept: Direkt API-Call + Dokumenten-Modal
          // Supply: Company -> capacity-posts/accept-deal
          // Demand: Agency -> demand-requests/:id/offers (Offer erstellen) + accept
          if (action === "deal_accept") {
            btn.disabled = true;
            btn.textContent = "Deal wird vorbereitet\u2026";

            // Route abhaengig von Feed-Typ
            var acceptPath;
            var acceptBody = {};
            if (currentIsDemand) {
              // Agency reagiert auf Company-Demand: Offer erstellen + sofort accepten
              acceptPath = "/marketplace/demand-requests/" + entryId + "/accept-deal";
              acceptBody = {
                price_min: currentEntry && currentEntry.price_min != null ? currentEntry.price_min : null,
                price_max: currentEntry && currentEntry.price_max != null ? currentEntry.price_max : null,
                headcount: currentEntry ? entryTotalHeadcount(currentEntry) : 1
              };
            } else {
              // Company reagiert auf Agency-Supply: capacity-posts/accept-deal
              acceptPath = "/marketplace/capacity-posts/" + entryId + "/accept-deal";
              acceptBody = {
                headcount: currentEntry ? entryRemainingHeadcount(currentEntry) : 1
              };
            }

            getCsrf().then(function(c) {
              return apiFetch(acceptPath, {
                method: "POST", csrf: c.csrfToken || c.token, body: acceptBody
              });
            }).then(function(r) {
              if (!r.ok) return r.json().then(function(d) {
                var msg = d.error === "SELF_DEAL_FORBIDDEN" ? "Eigenes Angebot."
                  : d.error === "NOT_ACTIVE" ? "Nicht mehr verfuegbar."
                  : d.error === "CAPACITY_UNAVAILABLE" ? "Nicht mehr genügend freie Stellen."
                  : d.error === "COMPANY_ONLY" ? "Nur Unternehmen."
                  : "Fehler: " + (d.error || r.status);
                throw new Error(msg);
              });
              return r.json();
            }).then(function(result) {
              // Erfolg: Dokumenten-Modal oeffnen
              showAgreementModal(result);
              var remainingStatus = result && result.remaining_headcount != null && !currentIsDemand
                ? (count(result.remaining_headcount, 0) > 0
                    ? "Deal gestartet \u2014 " + count(result.remaining_headcount, 0) + " freie Plaetze verbleiben."
                    : "Deal gestartet \u2014 Personalangebot ist jetzt voll reserviert.")
                : "Deal gestartet \u2014 Einsatzbestaetigung " + (result.agreement_ref || "") + " erstellt.";
              setActionZoneStatus(remainingStatus, "success");
              toast("Konditionen zugestimmt \u2014 Einsatzbestaetigung erstellt", "success");
              // Deal-Buttons deaktivieren
              document.querySelectorAll('[data-open-action="deal_accept"],[data-open-action="deal_negotiate"]').forEach(function(b) {
                b.disabled = true; b.style.opacity = '.5';
              });
            }).catch(function(e) {
              setActionZoneStatus(e.message || "Deal-Aktion fehlgeschlagen.", "danger");
              toast(e.message || "Fehler", "danger");
              btn.disabled = false;
              btn.innerHTML = "&#10003; Konditionen zustimmen";
            });
            return;
          }

          openInteractionModal(action);
        });
      });
    }

    function sendInteraction(type, payload) {
      var submitBtn = document.getElementById("interaction-modal-submit");
      var fb = document.getElementById("interaction-modal-feedback");
      submitBtn.disabled = true;

      // ── Deal-Routen: accept und negotiate nutzen die echten Deal-APIs ──
      if (type === "deal_accept" || type === "deal_negotiate") {
        var dealPath;
        if (currentIsDemand) {
          dealPath = type === "deal_accept"
            ? "/marketplace/demand-requests/" + entryId + "/accept-deal"
            : "/marketplace/demand-requests/" + entryId + "/negotiate-deal";
        } else {
          dealPath = type === "deal_accept"
            ? "/marketplace/capacity-posts/" + entryId + "/accept-deal"
            : "/marketplace/capacity-posts/" + entryId + "/negotiate-deal";
        }
        var dealBody = {};
        if (type === "deal_negotiate") {
          dealBody.message = (payload && payload.message) || null;
          if (payload && payload.headcount) dealBody.headcount = parseInt(payload.headcount, 10);
          if (payload && payload.start_date) dealBody.start_date = payload.start_date;
          if (payload && payload.end_date) dealBody.end_date = payload.end_date;
          // Preis-Felder fuer strukturierte Verhandlung
          if (payload && payload.price_min) dealBody.price_min = parseFloat(payload.price_min);
          if (payload && payload.price_max) dealBody.price_max = parseFloat(payload.price_max);
          if (payload && payload.price_type) dealBody.price_type = payload.price_type;
        }
        getCsrf().then(function(c) {
          return apiFetch(dealPath, { method: "POST", csrf: c.csrfToken || c.token, body: dealBody });
        }).then(function(r) {
          if (!r.ok) return r.json().then(function(d) {
            var errMsg = d.error === "SELF_DEAL_FORBIDDEN" ? "Sie koennen nicht mit Ihrem eigenen Angebot handeln."
              : d.error === "NOT_ACTIVE" ? "Dieses Angebot ist nicht mehr verfuegbar."
              : d.error === "CAPACITY_UNAVAILABLE" ? "Die verfügbaren Stellen reichen für diese Anfrage nicht mehr aus."
              : d.error === "COMPANY_ONLY" ? "Nur Unternehmen koennen Deals starten."
              : interactionErrorMessage(d.error || "UNKNOWN");
            throw new Error(errMsg);
          });
          return r.json();
        }).then(function(result) {
          fb.className = "ds-alert ds-alert--success";
          if (type === "deal_accept") {
            var remainingAfterAccept = count(result && result.remaining_headcount, null);
            var acceptText = remainingAfterAccept != null && !currentIsDemand
              ? (remainingAfterAccept > 0
                  ? 'Einsatzvereinbarung ' + (result.agreement_ref || '') + ' erstellt. Noch ' + remainingAfterAccept + ' freie Plaetze verbleiben.'
                  : 'Einsatzvereinbarung ' + (result.agreement_ref || '') + ' erstellt. Das Personalangebot ist jetzt voll reserviert.')
              : 'Einsatzvereinbarung ' + (result.agreement_ref || '') + ' erstellt. Das Angebot wurde reserviert.';
            fb.innerHTML = '<strong>Deal gestartet!</strong> ' + acceptText;
            setActionZoneStatus("Deal abgeschlossen — " + acceptText, "success");
            // Offer-Detail-Seite verlinken
            if (result.offer && result.offer.id) {
              fb.innerHTML += '<br><a href="/public/offer_detail.html?id=' + result.offer.id + '" class="ds-btn ds-btn--sm" style="margin-top:8px">Zur Einsatzvereinbarung</a>';
            }
            toast("Konditionen zugestimmt — Deal gestartet", "success");
          } else {
            fb.innerHTML = '<strong>Verhandlung gestartet!</strong> Ihre Anpassungswuensche wurden an die Gegenseite uebermittelt.';
            setActionZoneStatus("Verhandlung gestartet — die Gegenseite wurde informiert.", "success");
            if (result.offer && result.offer.id) {
              fb.innerHTML += '<br><a href="/public/offer_detail.html?id=' + result.offer.id + '" class="ds-btn ds-btn--sm" style="margin-top:8px">Zum Verhandlungsvorgang</a>';
            }
            toast("Verhandlungsanfrage gesendet", "success");
          }
          fb.style.display = "flex";
          // Deal-Buttons deaktivieren nach erfolgreicher Aktion
          document.querySelectorAll('[data-open-action="deal_accept"],[data-open-action="deal_negotiate"]').forEach(function(btn) {
            btn.disabled = true; btn.style.opacity = '.5';
          });
          setTimeout(function() { closeInteractionModal(); }, 1500);
        }).catch(function(e) {
          fb.className = "ds-alert ds-alert--danger";
          fb.textContent = e.message || "Fehler";
          fb.style.display = "flex";
          setActionZoneStatus(e.message || "Deal-Aktion fehlgeschlagen.", "danger");
        }).finally(function() { submitBtn.disabled = false; });
        return;
      }
      if (type === "emergency_commit") {
        if (!currentIsDemand) {
          fb.className = "ds-alert ds-alert--danger";
          fb.textContent = "Notdienst-Zusagen sind nur fuer Arbeitsplatzangebote verfuegbar.";
          fb.style.display = "flex";
          submitBtn.disabled = false;
          return;
        }
        var qty = payload && payload.headcount ? parseInt(payload.headcount, 10) : 0;
        if (!qty || qty < 1) {
          fb.className = "ds-alert ds-alert--warning";
          fb.textContent = "Bitte geben Sie die zugesagte Menge an.";
          fb.style.display = "flex";
          submitBtn.disabled = false;
          return;
        }
        fb.className = "ds-alert ds-alert--info";
        fb.textContent = "Notdienst-Zusage wird uebermittelt\u2026";
        fb.style.display = "flex";
        getCsrf().then(function(c) {
          return apiFetch("/emergency/" + entryId + "/commitments", {
            method: "POST",
            csrf: c.csrfToken || c.token,
            body: { committed_quantity: qty, note: payload && payload.message ? payload.message : null }
          });
        }).then(function(r) {
          if (!r.ok) return r.json().then(function(d) {
            if (d && d.remaining_open_count != null) {
              var hc = document.getElementById("im-headcount");
              if (hc) {
                hc.max = String(d.remaining_open_count);
                if (parseInt(hc.value, 10) > d.remaining_open_count) hc.value = String(d.remaining_open_count);
              }
            }
            var err = new Error(interactionErrorMessage(d.error || "UNKNOWN"));
            err.code = d.error || "UNKNOWN";
            throw err;
          });
          return r.json();
        }).then(function(result) {
          var coverage = result && result.coverage ? result.coverage : null;
          if (coverage && currentEntry) {
            if (coverage.required_total_count != null) currentEntry.required_total_count = coverage.required_total_count;
            if (coverage.currently_committed_count != null) currentEntry.currently_committed_count = coverage.currently_committed_count;
            if (coverage.remaining_open_count != null) currentEntry.remaining_open_count = coverage.remaining_open_count;
            if (coverage.status) currentEntry.status = coverage.status;
          }
          var remaining = currentEntry ? demandRemainingOpenCount(currentEntry) : null;
          var statusText = remaining != null
            ? (remaining > 0
                ? "Notdienst-Zusage registriert — noch " + remaining + " offen."
                : "Notdienst-Zusage registriert — Angebot besetzt.")
            : "Notdienst-Zusage registriert.";
          fb.className = "ds-alert ds-alert--success";
          fb.textContent = statusText;
          fb.style.display = "flex";
          setActionZoneStatus(statusText, "success");
          toast("Notdienst-Zusage gesendet", "success");
          buildActionZoneCopy();
          setTimeout(function() { closeInteractionModal(); }, 900);
        }).catch(function(e) {
          fb.className = "ds-alert ds-alert--danger";
          fb.textContent = e.message || "Fehler";
          fb.style.display = "flex";
          setActionZoneStatus(e.message || "Notdienst-Zusage fehlgeschlagen.", "danger");
        }).finally(function() { submitBtn.disabled = false; });
        return;
      }

      // ── Standard-Interaktionen (Interesse, Frage, Kontakt etc.) ──
      var msg = buildInteractionMessage(type, payload || {});
      getCsrf().then(function(c) {
        return apiFetch(interactionApiPath(), {
          method: "POST", csrf: c.csrfToken || c.token,
          body: { interaction_type: type, message: msg || null }
        });
      }).then(function(r) {
        if (!r.ok) return r.json().then(function(d) {
          var err = new Error(interactionErrorMessage(d.error || "UNKNOWN"));
          err.code = d.error || "UNKNOWN";
          throw err;
        });
        return r.json();
      }).then(function() {
        fb.className = "ds-alert ds-alert--success";
        fb.textContent = summarizeInteractionPayload(type, payload || {});
        fb.style.display = "flex";
        setActionZoneStatus("Vorgang dokumentiert: " + summarizeInteractionPayload(type, payload || {}), "success");
        toast("Interaktion erfolgreich gesendet", "success");
        setTimeout(function() {
          closeInteractionModal();
        }, 700);
      }).catch(function(e) {
        fb.className = "ds-alert ds-alert--danger";
        fb.textContent = e.message || "Fehler";
        fb.style.display = "flex";
        setActionZoneStatus(e.message || "Aktion fehlgeschlagen.", "danger");
      }).finally(function() { submitBtn.disabled = false; });
    }

    var STATUS_MAP = {
      draft: { label:"Entwurf", css:"ds-badge--neutral" }, active: { label:"Aktiv", css:"ds-badge--success" },
      reserved: { label:"Reserviert", css:"ds-badge--brand" },
      paused: { label:"Pausiert", css:"ds-badge--warning" }, expired: { label:"Abgelaufen", css:"ds-badge--danger" },
      filled: { label:"Besetzt", css:"ds-badge--accent" }, archived: { label:"Archiviert", css:"ds-badge--neutral" },
      open: { label:"Offen", css:"ds-badge--success" }, partially_covered: { label:"Teilweise gedeckt", css:"ds-badge--warning" }, fulfilled: { label:"Erfuellt", css:"ds-badge--accent" }, closed: { label:"Geschlossen", css:"ds-badge--neutral" }
    };
    var SHIFT_LABELS = { day:"Tagschicht", night:"Nachtschicht", rotating:"Wechselschicht", flexible:"Flexibel", weekend:"Wochenende", on_call:"Bereitschaft" };
    var EMPLOYMENT_LABELS = { temporary:"ANUe", contract:"Werkvertrag", temp_to_perm:"Temp-to-Perm", project:"Projekt", on_call:"Abruf" };
    var AVAIL_LABELS = { immediate:"Sofort (heute oder morgen)", scheduled:"Geplant", flexible:"Flexibel" };
    var COMPLIANCE_MAP = { unknown:{ label:"Unbekannt", color:"--grey" }, pending:{ label:"In Pruefung", color:"--yellow" }, partial:{ label:"Teilweise", color:"--yellow" }, complete:{ label:"Vollstaendig", color:"--green" } };
    var INTERACTION_LABELS = { interest:"Interesse", offer_request:"Angebotsanfrage", question:"Frage", save:"Gespeichert", requisition_link:"Verknuepfung", deal_start:"Deal", contact:"Kontakt", deal_accept:"Konditionen zugestimmt", deal_negotiate:"Verhandlungsanfrage", emergency_commit:"Notdienst-Zusage" };

    function freshnessHtml(ts) {
      if (!ts) return '<span class="ce-freshness"><span class="ce-freshness__dot ce-freshness__dot--stale"></span>Nicht bestaetigt</span>';
      var h = (Date.now() - new Date(ts).getTime()) / 36e5;
      if (h < 48) return '<span class="ce-freshness"><span class="ce-freshness__dot ce-freshness__dot--fresh"></span>Aktuell – ' + fmtDate(ts) + '</span>';
      if (h < 96) return '<span class="ce-freshness"><span class="ce-freshness__dot ce-freshness__dot--aging"></span>Altert – ' + fmtDate(ts) + '</span>';
      return '<span class="ce-freshness"><span class="ce-freshness__dot ce-freshness__dot--stale"></span>Veraltet – ' + fmtDate(ts) + '</span>';
    }

    var GRADE_STYLES = {
      PLATINUM: { bg: 'rgba(168,85,247,.12)', color: '#a855f7', icon: '&#9733;' },
      GOLD:     { bg: 'rgba(234,179,8,.12)',   color: '#eab308', icon: '&#9733;' },
      SILVER:   { bg: 'rgba(148,163,184,.12)', color: '#94a3b8', icon: '&#9733;' },
      BRONZE:   { bg: 'rgba(180,83,9,.12)',    color: '#b45309', icon: '&#9733;' }
    };

    function trustBadgesHtml(ts) {
      if (!ts) return '<span class="ds-text-sm ds-text-muted">Keine Signale</span>';
      var html = "";

      // Reputation badge (primary, prominent)
      if (ts.reputation_score != null && ts.reputation_grade && ts.reputation_grade !== 'UNRATED') {
        var gs = GRADE_STYLES[ts.reputation_grade] || GRADE_STYLES.BRONZE;
        html += '<span class="ds-trust-badge" style="background:' + gs.bg + ';color:' + gs.color + ';font-weight:700;font-size:13px;padding:4px 10px">';
        html += gs.icon + ' ' + Number(ts.reputation_score).toFixed(0) + ' ' + ts.reputation_grade;
        html += '</span>';
      }

      // Deal success rate
      if (ts.deal_success_rate != null) {
        var dsColor = ts.deal_success_rate >= 80 ? 'var(--ds-success)' : ts.deal_success_rate >= 60 ? 'var(--ds-warning)' : 'var(--ds-danger)';
        html += '<span class="ds-trust-badge" style="color:' + dsColor + ';font-weight:600" title="Anteil erfolgreich abgeschlossener Deals">&#10003; ' + Math.round(ts.deal_success_rate) + '% Erfolgsrate</span>';
      }

      // Response time
      if (ts.response_time_label) {
        html += '<span class="ds-trust-badge ds-trust-badge--response">&#9201; ' + esc(ts.response_time_label) + ' Antwortzeit</span>';
      }

      if (ts.supplier_verified) html += '<span class="ds-trust-badge ds-trust-badge--verified" title="Mindestens ein Nachweis wurde verifiziert">&#10003; Verifiziert</span>';
      if (ts.compliance_complete) html += '<span class="ds-trust-badge ds-trust-badge--compliance" title="Alle Compliance-Dokumente sind verifiziert und gueltig">Compliance vollst.</span>';
      if (ts.active_subscriber) html += '<span class="ds-trust-badge ds-trust-badge--active" title="Nutzer hat einen aktiven kostenpflichtigen Tarif">Aktiver Abonnent</span>';
      if (ts.completed_deals > 0) html += '<span class="ds-trust-badge ds-trust-badge--deals" title="Anzahl erfolgreich abgeschlossener Deals auf der Plattform">' + ts.completed_deals + ' Deals</span>';
      if (ts.recently_confirmed) html += '<span class="ds-trust-badge ds-trust-badge--response" title="Das Personalangebot wurde in den letzten 48 Stunden als aktuell bestaetigt">Kürzlich bestätigt</span>';
      if (ts.profile_completeness != null) {
        var pcVal = ts.profile_completeness > 1 ? Math.round(ts.profile_completeness) : Math.round(ts.profile_completeness * 100);
        html += '<span class="ds-trust-badge" title="Wie vollstaendig das Firmenprofil ausgefuellt ist">Profil ' + pcVal + '%</span>';
      }
      return html || '<span class="ds-text-sm ds-text-muted">Keine Signale</span>';
    }

    function demandSignalsHtml(e) {
      var html = "";
      if (e.requester_company_name) {
        html += '<span class="ds-trust-badge ds-trust-badge--verified" title="Anfragende Organisation">&#127970; ' + esc(e.requester_company_name) + "</span>";
      }
      if (e.urgency) {
        var urgencyValue = normalizeUrgency(e.urgency);
        var urgencyLabel = "Normal";
        if (urgencyValue === "notdienst") urgencyLabel = "Notdienst";
        else if (urgencyValue === "critical") urgencyLabel = "Kritisch";
        else if (urgencyValue === "urgent") urgencyLabel = "Dringend";
        else if (urgencyValue === "high" || urgencyValue === "plus") urgencyLabel = "Priorisiert";
        html += '<span class="ds-trust-badge ds-trust-badge--response" title="Dringlichkeit des Arbeitsplatzangebots">&#9888; ' + esc(urgencyLabel) + "</span>";
      }
      if (e.start_date) {
        html += '<span class="ds-trust-badge" title="Gewuenschter Starttermin">&#128197; Start ' + esc(fmtDate(e.start_date)) + "</span>";
      }
      if (e.budget_min != null || e.budget_max != null) {
        var b = [];
        if (e.budget_min != null) b.push(Number(e.budget_min).toFixed(0));
        if (e.budget_max != null) b.push(Number(e.budget_max).toFixed(0));
        html += '<span class="ds-trust-badge ds-trust-badge--active" title="Budgetrahmen des Arbeitsplatzangebots">&#8364; ' + esc(b.join(" - ")) + "</span>";
      }
      if (e.headcount != null) {
        html += '<span class="ds-trust-badge ds-trust-badge--deals" title="Angefragter Umfang">&#128101; ' + esc(String(e.headcount)) + " Personen</span>";
      }
      if (e.created_at) {
        html += '<span class="ds-trust-badge" title="Erstellungsdatum">&#9201; erstellt ' + esc(fmtDate(e.created_at)) + "</span>";
      }
      return html || '<span class="ds-text-sm ds-text-muted">Angebotsdaten verfuegbar</span>';
    }

    // Load entry — cascading fallback for robust loading
    var endpoints = [];
    if (isOwner) {
      endpoints.push({ path: "/capacity-exchange/entries/" + entryId, type: "owner" });
      endpoints.push({ path: "/marketplace/demand-requests/" + entryId, type: "demand_owner" });
      endpoints.push({ path: "/capacity-exchange/feed/" + entryId, type: "supply" });
      endpoints.push({ path: "/marketplace/public/demand-requests/" + entryId, type: "demand" });
    } else if (isDemand) {
      endpoints.push({ path: "/marketplace/public/demand-requests/" + entryId, type: "demand" });
      endpoints.push({ path: "/capacity-exchange/feed/" + entryId, type: "supply" });
    } else {
      endpoints.push({ path: "/capacity-exchange/feed/" + entryId, type: "supply" });
      endpoints.push({ path: "/marketplace/public/demand-requests/" + entryId, type: "demand" });
    }

    function tryLoad(idx) {
      if (idx >= endpoints.length) {
        document.getElementById("loading").innerHTML = '<div class="ds-alert ds-alert--danger">Eintrag nicht gefunden – bitte pruefen Sie die URL.</div>';
        return Promise.resolve(null);
      }
      return apiFetch(endpoints[idx].path).then(function(r) {
        if (r.status === 401) { window.location.href = "/"; return null; }
        if (r.status === 404 || r.status === 403) return tryLoad(idx + 1);
        if (!r.ok) { toast("Fehler beim Laden (HTTP " + r.status + ")", "danger"); return null; }
        return r.json().then(function(data) { data._source = endpoints[idx].type; return data; });
      });
    }

    function initDetail() {
    tryLoad(0).then(function(e) {
      if (!e) return;
      currentEntry = e;

      // Adjust isOwner based on actually resolved endpoint
      if (e._source !== "owner" && e._source !== "demand_owner") isOwner = false;
      document.getElementById("loading").style.display = "none";
      document.getElementById("detail").style.display = "block";

      // P12-2: Zuletzt angesehen — save to localStorage
      try {
        var recentKey = "tc_recently_viewed";
        var recent = JSON.parse(localStorage.getItem(recentKey) || "[]");
        recent = recent.filter(function(r) { return r.id !== entryId; });
        recent.unshift({ id: entryId, title: "loading", ts: Date.now() });
        if (recent.length > 10) recent = recent.slice(0, 10);
        localStorage.setItem(recentKey, JSON.stringify(recent));
      } catch(_rvErr) { /* intentional: localStorage may be unavailable */ }
      document.title = esc(e.title) + " – TempConnect";

      // P12-2: Update recently-viewed with title + render sidebar
      try {
        var rvKey = "tc_recently_viewed";
        var rvList = JSON.parse(localStorage.getItem(rvKey) || "[]");
        if (rvList.length && rvList[0].id === entryId) { rvList[0].title = e.title; rvList[0].city = e.location_city || ""; localStorage.setItem(rvKey, JSON.stringify(rvList)); }
        var rvEl = document.getElementById("d-recently-viewed");
        if (rvEl && rvList.length > 1) {
          var rvH = "";
          rvList.forEach(function(rv, ri) { if (ri === 0) return; rvH += "<a href=\"/public/capacity_exchange_detail.html?id=" + esc(rv.id) + "\" class=\"ds-text-sm\" style=\"display:block;padding:4px 0;color:var(--ds-text-secondary);text-decoration:none\">" + esc(rv.title) + " <span class=\"ds-text-xs ds-text-muted\">" + esc(rv.city || "") + "</span></a>"; });
          if (rvH) { rvEl.innerHTML = rvH; rvEl.parentElement.style.display = "block"; }
        }
      } catch(_rv2) { /* intentional: localStorage may be unavailable */ }

      // Header
      // Auto-detect demand type from response data (not just URL param)
      var detectedDemand = isDemand || e._source === "demand" || (!e.availability_from && !!e.start_date);
      currentIsDemand = detectedDemand;

      // Demand owner has a dedicated, richer detail page. Avoid mixing supply actions/endpoints.
      // This prevents confusing "confirm" actions and capacity-exchange 404s for demand entries.
      if (detectedDemand && isOwner && e._source === "demand_owner") {
        window.location.replace("/public/marketplace_demand_detail.html?id=" + encodeURIComponent(entryId) + "&owner=1");
        return;
      }

      var typeLabel = detectedDemand ? "Nachfrage" : "Angebot";
      var typeBadgeCss = detectedDemand ? "ds-badge--warning" : "ds-badge--success";
      document.getElementById("d-title").innerHTML = esc(e.title) + ' <span class="ds-badge ' + typeBadgeCss + '" style="font-size:12px;vertical-align:middle">' + typeLabel + '</span>';
      // Always normalize fields regardless of URL param
      e.availability_from = e.availability_from || e.start_date;
      e.availability_to = e.availability_to || e.end_date;
      if (e.price_min == null && e.budget_min != null) e.price_min = e.budget_min;
      if (e.price_max == null && e.budget_max != null) e.price_max = e.budget_max;
      if (detectedDemand) {
        var sectTitle = document.querySelector(".ce-detail__main .ce-section .ce-section__title");
        if (sectTitle) {
          sectTitle.innerHTML = 'Arbeitsplatzangebot <span style="font-weight:400;font-size:11px;text-transform:none;letter-spacing:0;color:var(--ds-text-secondary)">&mdash; Welche Qualifikationen werden benötigt?</span>';
        }
      }
      document.getElementById("d-subtitle").textContent = e.role + (e.worker_category ? " – " + e.worker_category : "") + " – " + (e.location_city || "–");

      // Header actions
      var ha = document.getElementById("d-header-actions");
      if (isOwner) {
        ha.innerHTML = '<a href="/public/capacity_exchange_form.html?id=' + esc(e.id) + '" class="ds-btn">Bearbeiten</a><a href="/public/capacity_exchange_manage.html" class="ds-btn ds-btn--ghost">Zur Liste</a>';
      } else {
        ha.innerHTML = '<a href="/public/capacity_exchange_feed.html" class="ds-btn">Zurueck zur Boerse</a>';
      }

      // Status bar
      var sm = STATUS_MAP[e.status] || { label: e.status, css: "ds-badge--neutral" };
      var sb = document.getElementById("d-status-bar");
      sb.innerHTML = '<span class="ds-badge ' + sm.css + '">' + esc(sm.label) + '</span>' + freshnessHtml(e.last_confirmed_at);
      var capacityHint = formatStatusCapacityHint(e);
      if (capacityHint) sb.innerHTML += '<span class="ds-text-sm ds-text-muted">' + esc(capacityHint) + '</span>';
      if (e.valid_until) sb.innerHTML += '<span class="ds-text-sm ds-text-muted">Gueltig bis: ' + fmtDate(e.valid_until) + '</span>';

      // Workforce fields
      document.getElementById("d-role").textContent = e.role || "–";
      document.getElementById("d-category").textContent = e.worker_category || "–";
      document.getElementById("d-headcount").textContent = detectedDemand ? ((e.headcount || 1) + " Personen") : formatSupplyHeadcount(e);
      document.getElementById("d-skills").textContent = Array.isArray(e.skill_tags) && e.skill_tags.length ? e.skill_tags.join(", ") : "–";

      // Timing
      document.getElementById("d-dates").textContent = fmtDate(e.availability_from) + (e.availability_to ? " – " + fmtDate(e.availability_to) : " (offen)");
      document.getElementById("d-avail-type").textContent = AVAIL_LABELS[e.availability_type] || e.availability_type || "–";
      document.getElementById("d-shift").textContent = SHIFT_LABELS[e.shift_model] || e.shift_model || "–";
      var empLabel = EMPLOYMENT_LABELS[e.employment_type] || e.employment_type || "–";
      document.getElementById("d-employment").innerHTML = esc(empLabel) + (e.employment_type ? ' <span class="ds-badge ds-badge--neutral" style="font-size:11px;vertical-align:middle">' + esc(empLabel) + '</span>' : "");

      // Location
      document.getElementById("d-location").textContent = (e.location_city || "–") + (e.location_postal ? " " + e.location_postal : "");
      document.getElementById("d-radius").textContent = (e.radius_km || 25) + " km";
      document.getElementById("d-country").textContent = e.country || "DE";
      if (e.mobility_notes) {
        document.getElementById("d-mobility-wrap").style.display = "block";
        document.getElementById("d-mobility").textContent = e.mobility_notes;
      }

      // Qualifications
      if (e.qualification_summary || e.certifications_summary) {
        document.getElementById("sect-qual").style.display = "block";
        if (e.qualification_summary) { document.getElementById("d-qual-wrap").style.display = "block"; document.getElementById("d-qualifications").textContent = e.qualification_summary; }
        if (e.certifications_summary) { document.getElementById("d-cert-wrap").style.display = "block"; document.getElementById("d-certifications").textContent = e.certifications_summary; }
      }

      // Commercial
      if (e.price_type || e.price_min != null || e.price_max != null || e.price_hint) {
        document.getElementById("sect-price").style.display = "block";
        var ph = "";
        if (e.price_type) ph += '<div class="ce-field"><div class="ce-field__label">Preistyp</div><div class="ce-field__value">' + esc(e.price_type) + '</div></div>';
        if (e.price_min != null) ph += '<div class="ce-field"><div class="ce-field__label">Min</div><div class="ce-field__value">' + Number(e.price_min).toFixed(2) + ' EUR</div></div>';
        if (e.price_max != null) ph += '<div class="ce-field"><div class="ce-field__label">Max</div><div class="ce-field__value">' + Number(e.price_max).toFixed(2) + ' EUR</div></div>';
        if (e.price_hint) ph += '<div class="ce-field" style="grid-column:1/-1"><div class="ce-field__label">Hinweis</div><div class="ce-field__value">' + esc(e.price_hint) + '</div></div>';
        document.getElementById("d-price-fields").innerHTML = ph;
      }

      // Trust/Signals sidebar
      if (detectedDemand) {
        document.getElementById("d-trust").innerHTML = demandSignalsHtml(e);
      } else {
        document.getElementById("d-trust").innerHTML = trustBadgesHtml(e.trust_signals);
      }

      // Compliance
      if (detectedDemand) {
        document.getElementById("d-compliance-display").innerHTML = '<span class="ds-traffic-light ds-traffic-light--grey"></span>Arbeitsplatzangebot';
        document.getElementById("d-completeness").style.display = "none";
      } else {
        var comp = COMPLIANCE_MAP[e.compliance_status] || { label: "–", color: "--grey" };
        document.getElementById("d-compliance-display").innerHTML = '<span class="ds-traffic-light ds-traffic-light' + comp.color + '"></span>' + esc(comp.label);

        // Profile completeness bar
        var pc = e.trust_signals && e.trust_signals.profile_completeness;
        if (pc != null) {
          var pct = pc > 1 ? Math.round(pc) : Math.round(pc * 100);
          document.getElementById("d-completeness").style.display = "block";
          document.getElementById("d-completeness-fill").style.width = pct + "%";
          document.getElementById("d-completeness-fill").style.background = pct >= 80 ? "var(--ds-success)" : pct >= 50 ? "var(--ds-warning)" : "var(--ds-danger)";
          document.getElementById("d-completeness-label").textContent = "Profilvollstaendigkeit: " + pct + "%";
        } else {
          document.getElementById("d-completeness").style.display = "none";
        }
      }

      var interactionEnabled = !isOwner && (e.status === "active" || e.status === "open" || e.status === "partially_covered");

      // Buyer quick actions (save + share)
      if (interactionEnabled) {
        document.getElementById("sect-buyer-actions").style.display = "block";
        if (currentIsDemand) {
          var saveBtnLabel = document.getElementById("btn-save-entry");
          saveBtnLabel.innerHTML = "&#9734; Angebot merken";
          saveBtnLabel.title = "Nachfrage merken";
        }
        document.getElementById("btn-save-entry").addEventListener("click", function() {
          var btn = this;
          btn.disabled = true;
          getCsrf().then(function(c) {
            return apiFetch(interactionApiPath(), {
              method: "POST", csrf: c.csrfToken || c.token, body: { interaction_type: "save", message: null }
            });
          }).then(function(r) {
            btn.disabled = false;
            if (r.ok) {
              btn.innerHTML = currentIsDemand ? "&#9733; Angebot gemerkt" : "&#9733; Gemerkt";
              btn.title = currentIsDemand ? "Angebot gemerkt" : "Personal gemerkt";
              toast(currentIsDemand ? "Angebot gemerkt" : "Personal gemerkt", "success");
            }
          }).catch(function() { btn.disabled = false; });
        });
        document.getElementById("btn-share-entry").addEventListener("click", function() {
          var url = window.location.href;
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(function() { toast("Link kopiert", "success"); });
          } else {
            var inp = document.createElement("input"); inp.value = url; document.body.appendChild(inp); inp.select(); document.execCommand("copy"); document.body.removeChild(inp);
            toast("Link kopiert", "success");
          }
        });
      }

      // Buyer: show interaction panel (nur fuer Gegenseite!)
      if (interactionEnabled && canUseActionZone() && shouldShowActionZone()) {
        document.getElementById("sect-interact").style.display = "block";
        buildActionZoneCopy();

        // Inline Merken-Button
        var inlineSave = document.getElementById("btn-interact-save");
        if (inlineSave) {
          if (currentIsDemand) { inlineSave.innerHTML = "&#9734; Angebot merken"; inlineSave.title = "Angebot merken"; }
          inlineSave.addEventListener("click", function() {
            inlineSave.disabled = true;
            getCsrf().then(function(c) {
              return apiFetch(interactionApiPath(), { method: "POST", csrf: c.csrfToken || c.token, body: { interaction_type: "save", message: null } });
            }).then(function(r) {
              inlineSave.disabled = false;
              if (r.ok) { inlineSave.innerHTML = currentIsDemand ? "&#9733; Angebot gemerkt" : "&#9733; Gemerkt"; toast("Gemerkt", "success"); }
            }).catch(function() { inlineSave.disabled = false; });
          });
        }

        // Inline Link-kopieren-Button
        var inlineShare = document.getElementById("btn-interact-share");
        if (inlineShare) {
          inlineShare.addEventListener("click", function() {
            var url = window.location.href;
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(url).then(function() { toast("Link kopiert", "success"); });
            } else {
              var inp = document.createElement("input"); inp.value = url; document.body.appendChild(inp); inp.select(); document.execCommand("copy"); document.body.removeChild(inp);
              toast("Link kopiert", "success");
            }
          });
        }
      } else if (interactionEnabled && !canUseActionZone()) {
        setActionZoneStatus("Fuer diese Rolle ist hier keine direkte Interaktion vorgesehen.", "warning");
      }

      // Owner: show actions + matches + interactions
      if (isOwner) {
        showOwnerActions(e);
        loadMatches();
        loadInteractions();
      }

      // Assets laden (Bilder, Dokumente) — fuer alle Nutzer
      loadAssets();
    }).catch(function(err) {
      console.error("[capacity-detail] Ladefehler:", err);
      var msg = "Fehler beim Laden des Eintrags.";
      if (err && err.message) msg += " (" + err.message + ")";
      document.getElementById("loading").innerHTML = '<div class="ds-alert ds-alert--danger">' + esc(msg) + '</div>';
    });

    function showOwnerActions(e) {
      document.getElementById("sect-owner-actions").style.display = "block";
      var el = document.getElementById("d-owner-actions");
      var h = "", s = e.status;
      if (s === "draft") h += '<button class="ds-btn ds-btn--success" data-oa="activate">Aktivieren</button>';
      if (s === "active") h += '<button class="ds-btn" data-oa="confirm">Aktualitaet bestaetigen</button>';
      if (s === "active") h += '<button class="ds-btn ds-btn--ghost" data-oa="pause">Pausieren</button>';
      if (s === "paused" || s === "expired") h += '<button class="ds-btn ds-btn--success" data-oa="reactivate">Reaktivieren</button>';
      if (s === "active" || s === "paused") h += '<button class="ds-btn ds-btn--ghost" data-oa="fill">Als besetzt markieren</button>';
      if (s !== "archived") h += '<button class="ds-btn ds-btn--ghost" data-oa="archive" style="color:var(--ds-text-tertiary)">Archivieren</button>';
      el.innerHTML = h;
      el.querySelectorAll("[data-oa]").forEach(function(btn) {
        btn.addEventListener("click", function() {
          var action = btn.getAttribute("data-oa");
          if (action === "archive" && !confirm("Archivieren?")) return;
          btn.disabled = true;
          getCsrf().then(function(c) {
            return apiFetch("/capacity-exchange/entries/" + entryId + "/" + action, { method: "POST", csrf: c.csrfToken || c.token });
          }).then(function(r) {
            if (!r.ok) return r.json().then(function(d) { throw new Error(d.error || "Fehler"); });
            toast("Aktion ausgefuehrt", "success");
            setTimeout(function() { window.location.reload(); }, 800);
          }).catch(function(e) { toast(e.message, "danger"); btn.disabled = false; });
        });
      });
    }

    function loadMatches() {
      document.getElementById("sect-matches").style.display = "block";
      apiFetch("/capacity-exchange/entries/" + entryId + "/matches").then(function(r) { return r.ok ? r.json() : []; }).then(function(matches) {
        var el = document.getElementById("d-matches");
        if (!matches || !matches.length) { el.innerHTML = '<span class="ds-text-sm ds-text-muted">Keine passenden Anfragen gefunden.</span>'; return; }
        var h = "";
        matches.forEach(function(m) {
          h += '<div class="ce-match-card"><strong>' + esc(m.title || m.role || "Anfrage") + '</strong>';
          if (m.location_city) h += ' – ' + esc(m.location_city);
          if (m.match_score != null) h += ' <span class="ds-badge ds-badge--brand">Score ' + m.match_score + '</span>';
          h += '</div>';
        });
        el.innerHTML = h;
      }).catch(function() {
        document.getElementById("d-matches").innerHTML = '<span class="ds-text-sm ds-text-muted">Matching nicht verfuegbar.</span>';
      });
    }

    function loadInteractions() {
      document.getElementById("sect-interactions").style.display = "block";
      apiFetch("/capacity-exchange/entries/" + entryId + "/interactions").then(function(r) { return r.ok ? r.json() : []; }).then(function(items) {
        var el = document.getElementById("d-interactions");
        if (!items || !items.length) { el.innerHTML = '<span class="ds-text-sm ds-text-muted">Noch keine Interaktionen.</span>'; return; }
        var h = "";
        items.forEach(function(i) {
          var label = INTERACTION_LABELS[i.interaction_type] || i.interaction_type;
          h += '<div class="ce-interaction-item"><span class="ds-badge ds-badge--brand" style="margin-right:6px">' + esc(label) + '</span>';
          if (i.message) h += '<span class="ds-text-sm">' + esc(i.message) + '</span>';
          h += '<br><span class="ds-text-xs ds-text-muted">' + fmtDate(i.created_at) + '</span></div>';
        });
        el.innerHTML = h;
      }).catch(function() {
        document.getElementById("d-interactions").innerHTML = '<span class="ds-text-sm ds-text-muted">Fehler beim Laden.</span>';
      });
    }

    /* ── Offer Assets: Load & Render ─────────────────── */

    function loadAssets() {
      apiFetch("/offer-assets/" + entryId).then(function(r) {
        if (!r.ok) return null;
        return r.json();
      }).then(function(resp) {
        if (!resp || !resp.data) return;
        renderAssets(resp.data);
      }).catch(function(err) {
        console.warn("[assets] Laden fehlgeschlagen:", err);
      });
    }

    function renderAssets(data) {
      var entryLogoFallback = currentEntry && currentEntry.supplier_logo_url ? String(currentEntry.supplier_logo_url) : "";

      // Reset: Sektionen zuruecksetzen um doppelte Anzeige bei Re-Render zu verhindern
      document.getElementById("d-hero-img").style.display = "none";
      document.getElementById("d-hero-img").src = "";
      document.getElementById("d-hero-fallback").style.display = "flex";
      document.getElementById("sect-logo").style.display = "none";
      document.getElementById("d-logo-img").src = "";
      document.getElementById("d-logo-upload").innerHTML = "";
      document.getElementById("sect-safety").style.display = "none";
      document.getElementById("d-safety-images").innerHTML = "";
      document.getElementById("d-safety-upload").innerHTML = "";
      document.getElementById("sect-gallery").style.display = "none";
      document.getElementById("d-gallery-images").innerHTML = "";
      document.getElementById("d-gallery-upload").innerHTML = "";
      document.getElementById("sect-compliance-docs").style.display = "none";
      document.getElementById("d-compliance-docs").innerHTML = "";
      document.getElementById("d-compliance-upload").innerHTML = "";

      // Prominent entry preview: gallery image -> logo asset -> supplier logo -> fallback.
      var heroPath = "";
      if (data.gallery && data.gallery.length && data.gallery[0].file_path) {
        heroPath = data.gallery[0].file_path;
      } else if (data.logo && data.logo.file_path) {
        heroPath = data.logo.file_path;
      } else if (entryLogoFallback) {
        heroPath = entryLogoFallback;
      }
      if (heroPath) {
        var heroImg = document.getElementById("d-hero-img");
        var heroFallback = document.getElementById("d-hero-fallback");
        heroImg.src = toAssetUrl(heroPath);
        heroImg.style.display = "block";
        heroFallback.style.display = "none";
        heroImg.onerror = function() {
          heroImg.style.display = "none";
          heroFallback.style.display = "flex";
        };
      }

      // Logo
      if (data.logo && data.logo.file_path) {
        document.getElementById("sect-logo").style.display = "flex";
        document.getElementById("d-logo-img").src = toAssetUrl(data.logo.file_path);
      } else if (entryLogoFallback) {
        document.getElementById("sect-logo").style.display = "flex";
        document.getElementById("d-logo-img").src = toAssetUrl(entryLogoFallback);
      }
      if (isOwner) {
        var logoUpEl = document.getElementById("d-logo-upload");
        logoUpEl.style.display = "block";
        logoUpEl.innerHTML = '<label class="ds-btn ds-btn--sm ce-upload-btn">Logo hochladen<input type="file" accept="image/png,image/jpeg,image/webp" data-asset-type="logo"/></label>';
        logoUpEl.querySelector("input").addEventListener("change", function() { uploadAsset("logo", this); });
      }

      // Safety images
      if (data.safety_images && data.safety_images.length) {
        document.getElementById("sect-safety").style.display = "block";
        var sh = "";
        data.safety_images.forEach(function(a) {
          sh += '<img src="/' + esc(a.file_path) + '" alt="' + esc(a.original_name || 'Sicherheitsbild') + '" data-lightbox/>';
        });
        document.getElementById("d-safety-images").innerHTML = sh;
      }
      if (isOwner) {
        var safeUpEl = document.getElementById("d-safety-upload");
        safeUpEl.style.display = "flex";
        safeUpEl.innerHTML = '<label class="ds-btn ds-btn--sm ce-upload-btn">Sicherheitsbild hochladen<input type="file" accept="image/png,image/jpeg,image/webp" data-asset-type="safety"/></label>';
        safeUpEl.querySelector("input").addEventListener("change", function() { uploadAsset("safety", this); });
        document.getElementById("sect-safety").style.display = "block";
      }

      // Gallery
      if (data.gallery && data.gallery.length) {
        document.getElementById("sect-gallery").style.display = "block";
        var gh = "";
        data.gallery.forEach(function(a) {
          gh += '<img src="/' + esc(a.file_path) + '" alt="' + esc(a.original_name || 'Angebotsbild') + '" data-lightbox/>';
        });
        document.getElementById("d-gallery-images").innerHTML = gh;
      }
      if (isOwner) {
        var galUpEl = document.getElementById("d-gallery-upload");
        galUpEl.style.display = "flex";
        galUpEl.innerHTML = '<label class="ds-btn ds-btn--sm ce-upload-btn">Bild hochladen<input type="file" accept="image/png,image/jpeg,image/webp" data-asset-type="gallery"/></label>';
        galUpEl.querySelector("input").addEventListener("change", function() { uploadAsset("gallery", this); });
        document.getElementById("sect-gallery").style.display = "block";
      }

      // Compliance docs
      if (data.compliance_docs && data.compliance_docs.length) {
        document.getElementById("sect-compliance-docs").style.display = "block";
        var ch = "";
        data.compliance_docs.forEach(function(doc) {
          var icon = doc.mime_type === "application/pdf" ? "&#128196;" : "&#128203;";
          var source = doc.source_type === "compliance_card" ? ' <span class="ds-badge ds-badge--neutral" style="font-size:10px">Compliance Card</span>' : "";
          var statusBadge = "";
          if (doc.compliance_status) {
            var stColor = doc.compliance_status === "verified" ? "ds-badge--success" : "ds-badge--warning";
            statusBadge = ' <span class="ds-badge ' + stColor + '" style="font-size:10px">' + esc(doc.compliance_status) + '</span>';
          }
          var link = doc.file_path ? '<a href="/' + esc(doc.file_path) + '" target="_blank" class="ds-btn ds-btn--sm ds-btn--ghost" style="font-size:11px">Download</a>' : '';
          ch += '<li class="ce-doc-item">';
          ch += '<span class="ce-doc-icon">' + icon + '</span>';
          ch += '<div class="ce-doc-meta"><div class="ce-doc-name">' + esc(doc.original_name || doc.doc_name || 'Dokument') + source + statusBadge + '</div>';
          if (doc.compliance_doc_type) ch += '<div class="ce-doc-sub">' + esc(doc.compliance_doc_type) + '</div>';
          if (doc.file_size) ch += '<div class="ce-doc-sub">' + fmtSize(doc.file_size) + '</div>';
          if (doc.valid_until) ch += '<div class="ce-doc-sub">Gueltig bis: ' + fmtDate(doc.valid_until) + '</div>';
          ch += '</div>';
          ch += link;
          if (isOwner && doc.source_type !== "compliance_card" && doc.id) {
            ch += '<button class="ds-btn ds-btn--sm ds-btn--ghost" style="color:var(--ds-danger);font-size:11px" data-delete-asset="' + esc(doc.id) + '">&#10005;</button>';
          }
          ch += '</li>';
        });
        document.getElementById("d-compliance-docs").innerHTML = ch;
        // Bind delete buttons
        document.querySelectorAll("[data-delete-asset]").forEach(function(btn) {
          btn.addEventListener("click", function() { deleteAsset(btn.getAttribute("data-delete-asset")); });
        });
      }
      if (isOwner) {
        var compUpEl = document.getElementById("d-compliance-upload");
        compUpEl.style.display = "flex";
        compUpEl.innerHTML = '<label class="ds-btn ds-btn--sm ce-upload-btn">Dokument hochladen<input type="file" accept="image/png,image/jpeg,application/pdf" data-asset-type="compliance"/></label>';
        compUpEl.querySelector("input").addEventListener("change", function() { uploadAsset("compliance", this); });
        document.getElementById("sect-compliance-docs").style.display = "block";
      }

      // Lightbox for images
      document.querySelectorAll("[data-lightbox]").forEach(function(img) {
        img.addEventListener("click", function() {
          var lb = document.createElement("div");
          lb.className = "ce-lightbox";
          lb.innerHTML = '<img src="' + img.src + '" alt="Vollbild"/>';
          lb.addEventListener("click", function() { lb.remove(); });
          document.body.appendChild(lb);
        });
      });
    }

    function uploadAsset(assetType, input) {
      if (!input.files || !input.files[0]) return;
      var file = input.files[0];
      var label = input.closest("label");
      if (label) label.textContent = "Wird hochgeladen...";

      getCsrf().then(function(c) {
        var fd = new FormData();
        fd.append("file", file);
        fd.append("asset_type", assetType);
        return fetch(API + "/offer-assets/" + entryId + "/upload", {
          method: "POST",
          headers: { "X-CSRF-Token": c.csrfToken || c.token },
          body: fd,
          credentials: "include"
        });
      }).then(function(r) {
        if (!r.ok) return r.json().then(function(d) { throw new Error((d.error && d.error.message) || "Upload fehlgeschlagen"); });
        return r.json();
      }).then(function() {
        toast("Datei hochgeladen", "success");
        loadAssets(); // Reload to show new asset
      }).catch(function(err) {
        toast(err.message || "Upload fehlgeschlagen", "danger");
      }).finally(function() {
        input.value = "";
        if (label) {
          var labels = { logo: "Logo hochladen", safety: "Sicherheitsbild hochladen", gallery: "Bild hochladen", compliance: "Dokument hochladen" };
          label.textContent = labels[assetType] || "Hochladen";
          label.appendChild(input);
        }
      });
    }

    function deleteAsset(assetId) {
      if (!confirm("Asset wirklich loeschen?")) return;
      getCsrf().then(function(c) {
        return apiFetch("/offer-assets/" + assetId, { method: "DELETE", csrf: c.csrfToken || c.token });
      }).then(function(r) {
        if (!r.ok) return r.json().then(function(d) { throw new Error((d.error && d.error.message) || "Loeschen fehlgeschlagen"); });
        toast("Asset geloescht", "success");
        loadAssets();
      }).catch(function(err) {
        toast(err.message || "Loeschen fehlgeschlagen", "danger");
      });
    }
  }
  // Starte erst nach slaGuardPassed
  function startDetailFlow() {
    if (detailBooted) return;
    detailBooted = true;
    apiFetch("/me").then(function(r) {
      return r && r.ok ? r.json() : null;
    }).then(function(me) {
      viewerRole = me && me.role ? me.role : null;
      bindInteractionModal();
      initDetail();
    }).catch(function() {
      bindInteractionModal();
      initDetail();
    });
  }

  document.addEventListener("slaGuardPassed", function(ev) {
    if (ev.detail && ev.detail.passed) {
      startDetailFlow();
    }
  });

  setTimeout(function() {
    if (!currentEntry) startDetailFlow();
  }, 1200);
  })();
