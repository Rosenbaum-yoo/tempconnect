/* ═══════════════════════════════════════════════════════
   Capacity Exchange Form — Page Logic
   ═══════════════════════════════════════════════════════ */
  (function() {
    var API = "/api";
    var editId = new URLSearchParams(window.location.search).get("id");
    var isEdit = !!editId;
    var MAX_IMAGE_BYTES = 5 * 1024 * 1024;
    var ALLOWED_IMAGE_MIMES = { "image/png": true, "image/jpeg": true, "image/webp": true };
    var selectedListingImageFile = null;
    var existingLogoAssetId = null;
    var shouldDeleteExistingLogo = false;

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

    function apiFetch(path, opts) {
      opts = opts || {};
      var headers = { "Content-Type": "application/json" };
      if (opts.csrf) headers["X-CSRF-Token"] = opts.csrf;
      if (opts.method && opts.method !== "GET") {
        headers["Idempotency-Key"] = (crypto.randomUUID ? crypto.randomUUID() : "x-" + Math.random().toString(36).slice(2) + "-" + Date.now());
      }
      return fetch(API + path, { method: opts.method || "GET", headers: headers, body: opts.body ? JSON.stringify(opts.body) : undefined, credentials: "include" });
    }

    function toAssetUrl(rawPath) {
      var p = String(rawPath || "");
      if (!p) return "";
      if (p.startsWith("http://") || p.startsWith("https://") || p.startsWith("/")) return p;
      return "/" + p;
    }
    function todayDateString() {
      var now = new Date();
      var year = now.getFullYear();
      var month = String(now.getMonth() + 1).padStart(2, "0");
      var day = String(now.getDate()).padStart(2, "0");
      return year + "-" + month + "-" + day;
    }

    function setImagePreview(fileOrUrl) {
      var img = document.getElementById("f-listing-image-preview");
      if (!img) return;
      if (!fileOrUrl) {
        img.removeAttribute("src");
        img.style.display = "none";
        return;
      }
      if (typeof fileOrUrl === "string") {
        img.src = fileOrUrl;
      } else {
        img.src = URL.createObjectURL(fileOrUrl);
      }
      img.style.display = "block";
    }

    function validateListingImage(file) {
      if (!file) return null;
      if (!ALLOWED_IMAGE_MIMES[file.type]) {
        return "Nur PNG, JPG oder WEBP sind erlaubt.";
      }
      if (file.size > MAX_IMAGE_BYTES) {
        return "Bild ist zu gross (max. 5 MB).";
      }
      return null;
    }

    function uploadListingImage(entryId) {
      if (!selectedListingImageFile) return Promise.resolve();
      return getCsrf().then(function(c) {
        var fd = new FormData();
        fd.append("file", selectedListingImageFile);
        fd.append("asset_type", "logo");
        return fetch(API + "/offer-assets/" + entryId + "/upload", {
          method: "POST",
          headers: { "X-CSRF-Token": c.csrfToken || c.token },
          body: fd,
          credentials: "include"
        });
      }).then(function(r) {
        if (!r.ok) return r.json().then(function(d) { throw new Error((d.error && d.error.message) || "Bild-Upload fehlgeschlagen"); });
        return r.json();
      });
    }

    function deleteExistingLogoIfNeeded() {
      if (!isEdit || !shouldDeleteExistingLogo || !existingLogoAssetId) return Promise.resolve();
      return getCsrf().then(function(c) {
        return apiFetch("/offer-assets/" + existingLogoAssetId, { method: "DELETE", csrf: c.csrfToken || c.token });
      }).then(function(r) {
        if (!r.ok) return r.json().then(function(d) { throw new Error((d.error && d.error.message) || "Bild konnte nicht entfernt werden"); });
      });
    }

    function loadExistingMediaForEdit() {
      if (!isEdit) return;
      apiFetch("/offer-assets/" + editId).then(function(r) {
        if (!r.ok) return null;
        return r.json();
      }).then(function(resp) {
        if (!resp || !resp.data || !resp.data.logo || !resp.data.logo.file_path) return;
        existingLogoAssetId = resp.data.logo.id || null;
        setImagePreview(toAssetUrl(resp.data.logo.file_path));
      }).catch(function() {});
    }

    // Geocode helper
    function geocode(city, postal) {
      var q = postal
        ? "/geo/coordinates?postal_code=" + encodeURIComponent(postal) + "&city=" + encodeURIComponent(city)
        : "/geo/coordinates?q=" + encodeURIComponent(city);
      return fetch(API + q, { credentials: "include" }).then(function(r) { return r.ok ? r.json() : null; }).catch(function() { return null; });
    }

    // Populate form for edit mode
    if (isEdit) {
      document.getElementById("page-title").textContent = "Personalangebot bearbeiten";
      document.getElementById("page-subtitle").textContent = "Aendern Sie die Angaben und speichern Sie.";
      apiFetch("/capacity-exchange/entries/" + editId).then(function(r) {
        if (r.status === 401) { window.location.href = "/"; return null; }
        if (!r.ok) { toast("Eintrag nicht gefunden", "danger"); return null; }
        return r.json();
      }).then(function(e) {
        if (!e) return;
        var val = function(id, v) { var el = document.getElementById(id); if (el && v != null) el.value = v; };
        val("f-title", e.title);
        val("f-role", e.role);
        val("f-worker-category", e.worker_category || "");
        val("f-headcount", e.headcount || 1);
        val("f-skills", Array.isArray(e.skill_tags) ? e.skill_tags.join(", ") : "");
        val("f-availability-type", e.availability_type || "immediate");
        val("f-from", e.availability_from ? String(e.availability_from).substring(0,10) : "");
        val("f-to", e.availability_to ? String(e.availability_to).substring(0,10) : "");
        val("f-shift", e.shift_model || "");
        val("f-employment", e.employment_type || "temporary");
        val("f-city", e.location_city);
        val("f-postal", e.location_postal || "");
        val("f-radius", e.radius_km || 25);
        val("f-country", e.country || "DE");
        val("f-mobility", e.mobility_notes || "");
        val("f-qualifications", e.qualification_summary || "");
        val("f-certifications", e.certifications_summary || "");
        val("f-compliance", e.compliance_status || "unknown");
        val("f-price-type", e.price_type || "");
        val("f-price-min", e.price_min != null ? e.price_min : "");
        val("f-price-max", e.price_max != null ? e.price_max : "");
        val("f-price-hint", e.price_hint || "");
        val("f-notes", e.notes || "");
        val("f-visibility", e.visibility_status || "public");
        val("f-priority", e.priority_level || "normal");
        val("f-valid-until", e.valid_until ? String(e.valid_until).substring(0,10) : "");
        if (e.is_search_agent) document.getElementById("f-search-agent").checked = true;

        // In edit mode, adjust button labels
        document.getElementById("btn-draft").textContent = "Aenderungen speichern";
        document.getElementById("btn-activate").textContent = "Speichern & aktivieren";
      });
    }
    loadExistingMediaForEdit();

    // Collect form data
    function collectData() {
      var tags = document.getElementById("f-skills").value.split(",").map(function(t) { return t.trim(); }).filter(Boolean);
      return {
        title: document.getElementById("f-title").value.trim(),
        role: document.getElementById("f-role").value.trim(),
        worker_category: document.getElementById("f-worker-category").value || null,
        headcount: parseInt(document.getElementById("f-headcount").value, 10) || 1,
        skill_tags: tags,
        availability_type: document.getElementById("f-availability-type").value,
        availability_from: document.getElementById("f-from").value,
        availability_to: document.getElementById("f-to").value || null,
        shift_model: document.getElementById("f-shift").value || null,
        employment_type: document.getElementById("f-employment").value || "temporary",
        location_city: document.getElementById("f-city").value.trim(),
        location_postal: document.getElementById("f-postal").value.trim() || null,
        radius_km: parseInt(document.getElementById("f-radius").value, 10) || 25,
        country: document.getElementById("f-country").value || "DE",
        mobility_notes: document.getElementById("f-mobility").value.trim() || null,
        qualification_summary: document.getElementById("f-qualifications").value.trim() || null,
        certifications_summary: document.getElementById("f-certifications").value.trim() || null,
        compliance_status: document.getElementById("f-compliance").value || "unknown",
        price_type: document.getElementById("f-price-type").value || null,
        price_min: parseFloat(document.getElementById("f-price-min").value) || null,
        price_max: parseFloat(document.getElementById("f-price-max").value) || null,
        price_hint: document.getElementById("f-price-hint").value.trim() || null,
        notes: document.getElementById("f-notes").value.trim() || null,
        visibility_status: document.getElementById("f-visibility").value || "public",
        priority_level: document.getElementById("f-priority").value || "normal",
        valid_until: document.getElementById("f-valid-until").value || null,
        is_search_agent: document.getElementById("f-search-agent").checked
      };
    }

    /* ── Deckungsvorschau (Welle 6) ─────────────────────────────────────────
       Beantwortet waehrend des Tippens, ob die eigene Belegschaft die angebotene
       Kopfzahl im gewaehlten Zeitraum wirklich traegt. Wer sechs Kraefte einstellt
       und vier liefert, verliert den Kunden beim ersten Mal. */

    var coverageTimer = null;
    var coverageSeq = 0;

    function esc(s) {
      return String(s == null ? "" : s).replace(/[&<>"']/g, function(c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
      });
    }

    function datumDE(iso) {
      if (!iso) return "";
      var t = String(iso).slice(0, 10).split("-");
      return t.length === 3 ? t[2] + "." + t[1] + "." + t[0] : String(iso);
    }

    var ZUSTAND_TEXT = {
      frei: "frei",
      verplant: "verplant",
      spaeter_frei: "erst spaeter",
      abwesend: "abwesend"
    };

    function renderCoverage(data) {
      var panel = document.getElementById("coverage-panel");
      var summary = document.getElementById("coverage-summary");
      var note = document.getElementById("coverage-note");
      var list = document.getElementById("coverage-list");
      if (!panel) return;

      panel.classList.remove("ce-coverage--gedeckt", "ce-coverage--luecke");

      if (!data || !data.auswertbar) {
        panel.hidden = true;
        return;
      }
      panel.hidden = false;

      var gedeckt = data.luecke === 0;
      panel.classList.add(gedeckt ? "ce-coverage--gedeckt" : "ce-coverage--luecke");
      // Nicht "N von M": sind mehr Kraefte frei als angeboten, laese sich "2 von 1" unsinnig.
      summary.textContent = gedeckt
        ? "Gedeckt — " + data.frei + (data.frei === 1 ? " Kraft frei" : " Kraefte frei")
        : "Es fehlen " + data.luecke + " von " + data.gefordert;

      var hinweise = [];
      if (data.zeitraum && data.zeitraum.von) {
        hinweise.push("Zeitraum ab " + datumDE(data.zeitraum.von) +
          (data.zeitraum.bis ? " bis " + datumDE(data.zeitraum.bis) : " (offen)"));
      }
      if (!data.kandidaten.length) {
        hinweise.push("Keine Kraft in Ihrer Belegschaft fuehrt diese Faehigkeit im Katalog.");
      }
      if (data.unbekannte_faehigkeiten && data.unbekannte_faehigkeiten.length) {
        hinweise.push("Kein Katalog-Eintrag fuer: " + data.unbekannte_faehigkeiten.join(", "));
      }
      note.textContent = hinweise.join(" · ");

      list.innerHTML = data.kandidaten.map(function(k) {
        var zusatz = [];
        if (k.grund) zusatz.push(k.grund);
        if (k.frei_ab) zusatz.push("wieder ab " + datumDE(k.frei_ab));
        else if (k.zustand === "verplant") zusatz.push("Ende offen");
        if (k.city) zusatz.push(k.city);
        return '<li class="ce-coverage__row">' +
          '<span class="ce-coverage__name">' + esc(k.name) +
            (k.treffer_namen && k.treffer_namen.length
              ? ' <span class="ce-coverage__meta">' + esc(k.treffer_namen.join(", ")) + '</span>'
              : '') +
          '</span>' +
          '<span class="ce-coverage__state ce-coverage__state--' + esc(k.zustand) + '">' +
            esc(ZUSTAND_TEXT[k.zustand] || k.zustand) +
            (zusatz.length ? ' <span class="ce-coverage__meta">' + esc(zusatz.join(" · ")) + '</span>' : '') +
          '</span>' +
        '</li>';
      }).join("");
    }

    function refreshCoverage() {
      var skills = document.getElementById("f-skills").value.trim();
      var rolle = document.getElementById("f-role").value.trim();
      // Die Rolle mitschicken: viele Disponenten tippen "Staplerfahrer" dorthin und
      // lassen das Skill-Feld leer. Ohne sie bliebe die Vorschau bei ihnen stumm.
      var begriffe = (skills + (skills && rolle ? "," : "") + rolle).trim();
      if (!begriffe) { renderCoverage(null); return; }

      var params = new URLSearchParams();
      params.set("skills", begriffe);
      params.set("headcount", String(parseInt(document.getElementById("f-headcount").value, 10) || 1));
      var von = document.getElementById("f-from").value;
      var bis = document.getElementById("f-to").value;
      if (von) params.set("from", von);
      if (bis) params.set("to", bis);

      var meine = ++coverageSeq;
      apiFetch("/capacity-exchange/offer-coverage?" + params.toString())
        .then(function(r) { return r.ok ? r.json() : null; })
        .then(function(data) {
          // Eine ueberholte Antwort darf eine neuere nicht ueberschreiben.
          if (meine !== coverageSeq) return;
          renderCoverage(data);
        })
        .catch(function() { if (meine === coverageSeq) renderCoverage(null); });
    }

    function scheduleCoverage() {
      clearTimeout(coverageTimer);
      coverageTimer = setTimeout(refreshCoverage, 400);
    }

    ["f-skills", "f-role", "f-headcount", "f-from", "f-to"].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) {
        el.addEventListener("input", scheduleCoverage);
        el.addEventListener("change", scheduleCoverage);
      }
    });

    var targetStatus = "draft";
    var formDirty = false;

    // Track dirty state
    document.getElementById("ce-form").addEventListener("input", function() { formDirty = true; });
    document.getElementById("ce-form").addEventListener("change", function() { formDirty = true; });
    window.addEventListener("beforeunload", function(ev) {
      if (formDirty) { ev.preventDefault(); ev.returnValue = ""; }
    });

    // Character counters on textareas
    document.querySelectorAll("#ce-form .ds-textarea[maxlength]").forEach(function(ta) {
      var max = parseInt(ta.getAttribute("maxlength"), 10);
      var counter = document.createElement("div");
      counter.className = "ce-char-count";
      counter.textContent = "0 / " + max;
      ta.parentNode.appendChild(counter);
      ta.addEventListener("input", function() {
        var len = ta.value.length;
        counter.textContent = len + " / " + max;
        counter.className = "ce-char-count" + (len >= max ? " ce-char-count--limit" : len >= max * 0.9 ? " ce-char-count--warn" : "");
      });
    });

    // Prefill today for availability_from in create mode
    if (!isEdit) {
      var today = todayDateString();
      var fromEl = document.getElementById("f-from");
      if (!fromEl.value) fromEl.value = today;
    }
    var availabilityTypeEl = document.getElementById("f-availability-type");
    if (availabilityTypeEl) {
      availabilityTypeEl.addEventListener("change", function() {
        if (availabilityTypeEl.value === "immediate") {
          var fromEl = document.getElementById("f-from");
          if (fromEl) fromEl.value = todayDateString();
        }
      });
    }

    // Inline validation
    function validateForm() {
      var ok = true;
      document.querySelectorAll(".ds-input--error, .ds-textarea--error").forEach(function(el) {
        el.classList.remove("ds-input--error", "ds-textarea--error");
      });
      document.querySelectorAll(".ds-field-error").forEach(function(el) { el.remove(); });

      function markErr(id, msg) {
        var el = document.getElementById(id);
        if (!el) return;
        el.classList.add(el.tagName === "TEXTAREA" ? "ds-textarea--error" : "ds-input--error");
        var span = document.createElement("div");
        span.className = "ds-field-error";
        span.textContent = msg;
        el.parentNode.appendChild(span);
        ok = false;
      }

      if (!document.getElementById("f-title").value.trim()) markErr("f-title", "Titel ist erforderlich");
      if (!document.getElementById("f-role").value.trim()) markErr("f-role", "Rolle ist erforderlich");
      if (!document.getElementById("f-from").value) markErr("f-from", "Datum ist erforderlich");
      if (!document.getElementById("f-city").value.trim()) markErr("f-city", "Stadt ist erforderlich");

      var pMin = parseFloat(document.getElementById("f-price-min").value);
      var pMax = parseFloat(document.getElementById("f-price-max").value);
      if (!isNaN(pMin) && !isNaN(pMax) && pMin > pMax) markErr("f-price-max", "Max darf nicht kleiner als Min sein");

      if (!ok) {
        var first = document.querySelector(".ds-input--error, .ds-textarea--error");
        if (first) first.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return ok;
    }

    document.getElementById("btn-draft").addEventListener("click", function() { targetStatus = "draft"; });
    document.getElementById("btn-activate").addEventListener("click", function() { targetStatus = "active"; });
    document.getElementById("f-listing-image").addEventListener("change", function(ev) {
      var file = ev.target.files && ev.target.files[0] ? ev.target.files[0] : null;
      if (!file) return;
      var validationError = validateListingImage(file);
      if (validationError) {
        selectedListingImageFile = null;
        ev.target.value = "";
        setImagePreview(null);
        toast(validationError, "danger");
        return;
      }
      shouldDeleteExistingLogo = false;
      selectedListingImageFile = file;
      setImagePreview(file);
    });
    document.getElementById("btn-remove-listing-image").addEventListener("click", function() {
      selectedListingImageFile = null;
      document.getElementById("f-listing-image").value = "";
      setImagePreview(null);
      if (isEdit && existingLogoAssetId) shouldDeleteExistingLogo = true;
    });

    document.getElementById("ce-form").addEventListener("submit", function(ev) {
      ev.preventDefault();
      if (!validateForm()) return;
      var data = collectData();
      var geoEl = document.getElementById("geo-status");

      var btns = document.querySelectorAll(".ce-form-actions button");
      btns.forEach(function(b) { b.disabled = true; });

      // Geocode first
      geocode(data.location_city, data.location_postal).then(function(coords) {
        if (coords && coords.lat != null && coords.lng != null) {
          data.location_lat = coords.lat;
          data.location_lng = coords.lng;
          geoEl.textContent = "Standort georeferenziert (" + coords.lat.toFixed(4) + ", " + coords.lng.toFixed(4) + ")";
          geoEl.className = "ds-alert ds-alert--success";
          geoEl.style.display = "flex";
        } else {
          geoEl.textContent = "Standort konnte nicht georeferenziert werden – Umkreissuche ggf. eingeschraenkt.";
          geoEl.className = "ds-alert ds-alert--warning";
          geoEl.style.display = "flex";
        }

        return getCsrf();
      }).then(function(csrf) {
        var token = csrf.csrfToken || csrf.token;

        if (isEdit) {
          // PATCH update
          return apiFetch("/capacity-exchange/entries/" + editId, {
            method: "PATCH", csrf: token, body: data
          }).then(function(r) {
            if (!r.ok) return r.json().then(function(d) { throw new Error(d.error || "Fehler"); });
            return r.json();
          }).then(function(entry) {
            // If target is active and current status is draft, also activate
            if (targetStatus === "active" && entry.status === "draft") {
              return apiFetch("/capacity-exchange/entries/" + editId + "/activate", { method: "POST", csrf: token }).then(function(r2) {
                return r2.ok ? r2.json() : entry;
              });
            }
            return entry;
          });
        } else {
          // POST create
          data.status = targetStatus;
          return apiFetch("/capacity-exchange/entries", {
            method: "POST", csrf: token, body: data
          }).then(function(r) {
            if (!r.ok) return r.json().then(function(d) { throw new Error(d.error || d.message || "Fehler"); });
            return r.json();
          });
        }
      }).then(function(entry) {
        var entryId = (entry && entry.id) ? entry.id : editId;
        return deleteExistingLogoIfNeeded().then(function() {
          return uploadListingImage(entryId);
        }).then(function() {
          return entry;
        }).catch(function(assetErr) {
          toast(assetErr.message || "Eintrag gespeichert, Bild konnte nicht vollstaendig verarbeitet werden", "warning");
          return entry;
        });
      }).then(function() {
        formDirty = false;
        toast(isEdit ? "Aenderungen gespeichert" : "Personal eingestellt", "success");
        setTimeout(function() {
          window.location.href = "/public/capacity_exchange_manage.html";
        }, 1200);
      }).catch(function(e) {
        toast(e.message || "Fehler beim Speichern", "danger");
        btns.forEach(function(b) { b.disabled = false; });
      });
    });
  })();