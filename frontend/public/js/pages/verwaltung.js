/* ═══════════════════════════════════════════════════════════════════════
   Verwaltung — organization.html (Owner-Entscheidung W-E9, 2026-10-01)

   Die EINE Seite, auf der eine Kundenfirma sich selbst verwaltet: Unternehmen
   wie Zeitarbeitsfirma. Sie loest das Admin Panel fuer Kunden ab; was es an
   Eigenem bot (Protokoll samt CSV), steht hier.

   Was diese Datei bewusst so macht:
   - Die Wahrheit kommt vom Server. Was eine Firma vergeben darf, steht in
     /org/overview (`rollen`), was eine Rolle darf, in /org/roles-permissions.
     Die Seite blendet nur aus, was der Server ohnehin ablehnen wuerde.
   - Jede Handlung, die einem Menschen etwas nimmt, zeigt VORHER, was passiert
     (Wirkungsvorschau) — das Risiko ist das Versehen, nicht der Vorsatz.
   - Jeder Bereich hat Laden, Leer und Fehler; kein Knopf ohne Wirkung.
   - Alles Fremde geht durch esc(). Keine Emojis, keine Farbwerte.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  /* ── Zustand ───────────────────────────────────────────────────────── */

  var S = {
    me: null,
    meineId: null,
    meineRolle: null,
    firma: null,
    seite: null,
    zahlen: null,
    rollenAngebot: [],
    rollenNamen: {},
    mitglieder: [],
    einladungen: [],
    orte: null,
    abteilungen: null,
    rechte: null,
    scopes: null,
    reiter: "team",
    geladen: {},
    prot: { offset: 0, limit: 50, total: 0 }
  };

  var REITER = ["team", "standorte", "rollen", "sicherheit", "protokoll", "schnittstellen", "tarif"];

  /* Alte Deep-Links (?tab=members …) kommen aus Mails, Lesezeichen und anderen
     Seiten. Sie landen im passenden neuen Reiter statt im ersten. */
  var ALTE_REITER = {
    members: "team", locations: "standorte", departments: "standorte", roles: "rollen",
    security: "sicherheit", audit: "protokoll", "api-keys": "schnittstellen",
    webhooks: "schnittstellen", usage: "tarif"
  };

  var MELDUNGEN = {
    ALREADY_MEMBER: "Diese Person ist schon Mitglied Ihrer Firma.",
    INVITE_PENDING: "Für diese E-Mail-Adresse gibt es schon eine offene Einladung.",
    INVALID_EMAIL: "Die E-Mail-Adresse ist nicht gültig.",
    INVALID_ROLE: "Diese Rolle kann nicht vergeben werden.",
    VALIDATION: "Bitte prüfen Sie Ihre Eingaben.",
    LAST_OWNER: "Das ist der letzte Owner Ihrer Firma. Machen Sie zuerst eine andere Person zum Owner.",
    SELBST_ENTFERNEN: "Sich selbst entfernen geht hier nicht.",
    GRUND_FEHLT: "Bitte nennen Sie einen Grund (mindestens 5 Zeichen).",
    NUR_OWNER: "Owner-Rechte vergibt oder entzieht nur ein Owner.",
    NOT_FOUND: "Den Eintrag gibt es nicht mehr. Die Ansicht wird neu geladen.",
    ORG_BOUNDARY_VIOLATION: "Dieser Standort oder diese Abteilung gehört nicht zu Ihrer Firma.",
    RATE_LIMITED: "Zu viele Anfragen in kurzer Zeit. Bitte warten Sie einen Moment.",
    SERVER_ERROR: "Auf unserer Seite ist etwas schiefgegangen. Bitte versuchen Sie es noch einmal.",
    SERVER_UNREACHABLE: "Der Server ist gerade nicht erreichbar."
  };

  /* Rechte-Matrix: lesbare Namen statt "requisition.create". Bereich + Tun
     ergibt "Bedarfe: anlegen"; Unbekanntes bleibt als Schluessel stehen. */
  var BEREICHE = {
    requisition: "Bedarfe", candidate: "Kandidaten", offer: "Angebote", vendor_pool: "Lieferantenpool",
    compliance: "Compliance-Nachweise", document_center: "Dokumente", report: "Auswertungen",
    org: "Firma", approval: "Freigaben", notification: "Benachrichtigungen", contract: "Verträge",
    assignment: "Einsätze", supplier: "Lieferanten", timesheet: "Stundenzettel", settings: "Einstellungen",
    worker: "Arbeitskräfte", rate_card: "Konditionen", data_governance: "Datenschutz",
    invoice: "Rechnungen", billing: "Abrechnung", deal: "Deals", capacity: "Personalangebote",
    marketplace: "Marktplatz", analytics: "Auswertungen", integration: "Schnittstellen",
    api_key: "API-Schlüssel", audit: "Protokoll", location: "Standorte", department: "Abteilungen"
  };
  var TUN = {
    create: "anlegen", edit: "bearbeiten", update: "ändern", view: "ansehen", read: "ansehen",
    approve: "freigeben", cancel: "stornieren", assign: "zuweisen", review: "prüfen",
    shortlist: "vormerken", reject: "ablehnen", comment: "kommentieren", accept: "annehmen",
    manage: "verwalten", verify: "bestätigen", upload: "hochladen", decide: "entscheiden",
    terminate: "kündigen", complete: "abschließen", submit: "einreichen", delete: "löschen",
    export: "exportieren", executive: "Management-Sicht", operational: "Betriebssicht",
    supplier: "Lieferantensicht", settings: "Einstellungen", members: "Mitglieder",
    locations: "Standorte", departments: "Abteilungen", billing: "Abrechnung", requests: "Anfragen"
  };

  /* ── Werkzeug ──────────────────────────────────────────────────────── */

  function el(id) { return document.getElementById(id); }

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c];
    });
  }

  function rollenName(k) {
    return Object.prototype.hasOwnProperty.call(S.rollenNamen, k) ? S.rollenNamen[k] : String(k || "");
  }

  var _tag = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" });
  var _zeit = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  var _iso = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" });

  function datum(v) { var d = v ? new Date(v) : null; return d && !isNaN(d) ? _tag.format(d) : "–"; }
  function zeitpunkt(v) { var d = v ? new Date(v) : null; return d && !isNaN(d) ? _zeit.format(d) : "–"; }
  /** Berliner Kalenderdatum vor n Tagen, als YYYY-MM-DD (nie der UTC-Ausschnitt). */
  function tagVor(n) { return _iso.format(new Date(Date.now() - n * 86400000)); }

  function initialen(name) {
    var teile = String(name || "?").replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
    return (teile.length > 1 ? teile[0].charAt(0) + teile[1].charAt(0) : String(teile[0] || "?").slice(0, 2)).toUpperCase();
  }

  function fehlerText(e, ersatz) {
    var code = e && e.code;
    if (code && Object.prototype.hasOwnProperty.call(MELDUNGEN, code)) return MELDUNGEN[code];
    if (e && e.status === 403 && e.feature) return "Das ist in Ihrem Tarif nicht enthalten.";
    var msg = e && e.message;
    if (msg && msg !== code && !/^HTTP_\d+$/.test(msg) && !/^[A-Z_]+$/.test(msg)) return msg;
    return ersatz || "Das hat nicht geklappt. Bitte versuchen Sie es noch einmal.";
  }

  function rueckmeldung(ziel, text, ton) {
    if (!ziel) return;
    ziel.textContent = text || "";
    if (ton) ziel.setAttribute("data-ton", ton); else ziel.removeAttribute("data-ton");
  }

  function leer(text) { return "<p class=\"vw-muted\">" + esc(text) + "</p>"; }

  function fehlerBlock(text, wiederholen) {
    return "<div class=\"ds-alert ds-alert--danger\" role=\"alert\">" + esc(text) +
      (wiederholen ? " <button class=\"vw-linkknopf\" type=\"button\" data-wiederholen=\"" + esc(wiederholen) + "\">Erneut laden</button>" : "") +
      "</div>";
  }

  /** Plan-Sperren auf Knoepfen mit data-feature-key (UX, der Server prueft selbst). */
  function applyOrgDomLocks(root) {
    if (window.TC && TC.entitlements && typeof TC.entitlements.applyDomLocks === "function") {
      TC.entitlements.applyDomLocks(root || document).catch(function () {});
    }
  }

  function ichBinOwner() { return S.meineRolle === "owner" || S.meineRolle === "platform_admin"; }

  /* ── Bestaetigung mit Wirkungsvorschau ─────────────────────────────── */

  var _dialog = null;

  /**
   * Zeigt, was passiert, und fuehrt die Handlung erst nach Bestaetigung aus.
   * Scheitert sie, bleibt der Dialog offen und nennt den Grund — man soll
   * nicht raten muessen, ob es geklappt hat.
   * @returns {Promise<boolean>} true, wenn ausgefuehrt
   */
  function bestaetige(opts) {
    var d = el("vwDialog");
    var grundBlock = el("vwDialogGrundBlock");
    var grund = el("vwDialogGrund");
    var ok = el("vwDialogOk");
    var fehler = el("vwDialogFehler");
    el("vwDialogTitel").textContent = opts.titel;
    el("vwDialogVorspann").textContent = opts.vorspann || "Was passiert:";
    el("vwDialogWirkung").innerHTML = (opts.punkte || []).map(function (p) { return "<li>" + esc(p) + "</li>"; }).join("");
    grundBlock.hidden = !opts.mitGrund;
    grund.value = "";
    fehler.textContent = "";
    ok.textContent = opts.knopf || "Bestätigen";
    ok.className = "ds-btn " + (opts.gefahr === false ? "ds-btn--primary" : "ds-btn--danger");
    ok.disabled = !!opts.mitGrund;
    var vorher = document.activeElement;
    d.classList.add("show");
    (opts.mitGrund ? grund : ok).focus();

    return new Promise(function (resolve) {
      function zu(ergebnis) {
        d.classList.remove("show");
        ok.onclick = null; el("vwDialogAbbrechen").onclick = null; grund.oninput = null;
        document.removeEventListener("keydown", taste);
        _dialog = null;
        if (vorher && typeof vorher.focus === "function") vorher.focus();
        resolve(ergebnis);
      }
      function taste(e) { if (e.key === "Escape" && !ok.disabled) zu(false); }
      _dialog = zu;
      document.addEventListener("keydown", taste);
      grund.oninput = function () { ok.disabled = grund.value.trim().length < 5; };
      el("vwDialogAbbrechen").onclick = function () { zu(false); };
      ok.onclick = async function () {
        ok.disabled = true;
        fehler.textContent = "";
        try {
          await opts.aktion(grund.value.trim());
          zu(true);
        } catch (e) {
          fehler.textContent = fehlerText(e);
          ok.disabled = opts.mitGrund ? grund.value.trim().length < 5 : false;
        }
      };
    });
  }

  /* ── Start ─────────────────────────────────────────────────────────── */

  function zustand(titel, text, knopf) {
    var z = el("vwZustand");
    z.hidden = false;
    el("vwInhalt").hidden = true;
    z.innerHTML = "<div class=\"ds-card\"><h2 class=\"vw-state__title\">" + esc(titel) + "</h2>" +
      "<p class=\"vw-state__text\">" + esc(text) + "</p>" + (knopf || "") + "</div>";
  }

  async function start() {
    var q = new URLSearchParams(location.search).get("tab") || "";
    S.reiter = REITER.indexOf(q) >= 0 ? q : (ALTE_REITER[q] || "team");

    try {
      S.me = await TC.api.get("/me");
    } catch (e) {
      if (e && e.status === 401) {
        zustand("Bitte melden Sie sich an", "Die Verwaltung braucht eine Anmeldung.",
          "<a class=\"ds-btn ds-btn--primary\" href=\"/?auth=login&return=%2Fpublic%2Forganization.html\">Zum Login</a>");
        return;
      }
    }
    S.meineId = S.me && S.me.id ? String(S.me.id) : null;
    S.meineRolle = S.me ? ((S.me.active_org && S.me.active_org.role_key) || S.me.org_role || null) : null;

    var ue;
    try {
      ue = await TC.api.get("/org/overview");
    } catch (e) {
      if (e && e.status === 403 && !e.feature) {
        zustand("Die Verwaltung ist Owner und Admins vorbehalten",
          "Ihre Rolle in dieser Firma erlaubt keine Verwaltung. Bitten Sie einen Owner oder Admin Ihrer Firma, wenn Sie etwas ändern möchten.",
          "<a class=\"ds-btn ds-btn--ghost\" href=\"/public/enterprise.html\">Zur Übersicht</a>");
      } else if (e && (e.code === "ORG_REQUIRED" || e.status === 400)) {
        zustand("Keine Firma ausgewählt", "Sie sind noch keiner Firma zugeordnet oder haben keine aktive Firma gewählt.",
          "<a class=\"ds-btn ds-btn--ghost\" href=\"/public/enterprise.html\">Zur Übersicht</a>");
      } else if (e && e.status === 401) {
        zustand("Bitte melden Sie sich an", "Ihre Sitzung ist abgelaufen.",
          "<a class=\"ds-btn ds-btn--primary\" href=\"/?auth=login&return=%2Fpublic%2Forganization.html\">Zum Login</a>");
      } else {
        zustand("Die Verwaltung konnte nicht geladen werden", fehlerText(e),
          "<button class=\"ds-btn ds-btn--primary\" type=\"button\" id=\"vwNeuStart\">Erneut versuchen</button>");
        el("vwNeuStart").addEventListener("click", function () { zustand("Lade Verwaltung …", ""); start(); });
      }
      return;
    }

    uebernimmUebersicht(ue);
    el("vwZustand").hidden = true;
    el("vwInhalt").hidden = false;
    el("vwScope").hidden = false;
    // Alte und unbekannte Reiternamen (?tab=security, ?tab=members …) fuehren in den
    // passenden neuen Reiter, und die Adresszeile zeigt danach den neuen Namen.
    oeffneReiter(S.reiter, { url: q !== "" && q !== S.reiter });
  }

  function uebernimmUebersicht(ue) {
    var d = (ue && ue.data) || {};
    S.firma = d.organization || {};
    S.seite = S.firma.type || null;
    S.zahlen = d.counts || {};
    S.rollenAngebot = Array.isArray(d.rollen) ? d.rollen : [];
    S.rollenNamen = d.rollen_namen || {};
    zeichneKopf();
    zeichneKennzahlen();
  }

  async function aktualisiereUebersicht() {
    try { uebernimmUebersicht(await TC.api.get("/org/overview")); } catch (_e) { /* Kennzahlen bleiben stehen */ }
  }

  function zeichneKopf() {
    var name = S.firma.name || "Ihrer Firma";
    el("vwUntertitel").textContent = "Team, Rechte, Sicherheit und Protokoll von " + name + ".";
    document.title = "Verwaltung – " + name + " – TempConnect";
    var seite = S.seite === "agency" ? ["Zeitarbeitsfirma", "ds-badge--accent"]
      : S.seite === "company" ? ["Unternehmen", "ds-badge--brand"] : null;
    var tarif = (S.me && S.me.plan_display_label) || S.firma.plan || null;
    el("vwBadges").innerHTML =
      (seite ? "<span class=\"ds-badge " + seite[1] + "\">" + esc(seite[0]) + "</span>" : "") +
      (tarif ? "<span class=\"ds-badge ds-badge--plan\">Tarif: " + esc(tarif) + "</span>" : "");
    var link = el("vwIntegrationenLink");
    if (link) link.hidden = S.seite !== "company";   // Integrationsseite gibt es nur fuer Unternehmen
  }

  function zeichneKennzahlen() {
    var c = S.zahlen || {};
    var offen = Number(c.open_invitations || 0);
    var schluessel = Number(c.api_keys || 0);
    var hooks = Number(c.active_integrations || 0);
    var kacheln = [
      ["team", c.active_members || 0, Number(c.active_members) === 1 ? "Mitglied" : "Mitglieder", "aktiv in Ihrer Firma"],
      ["team", offen, offen === 1 ? "Offene Einladung" : "Offene Einladungen", offen ? "warten auf Annahme" : "keine offen"],
      ["standorte", c.locations || 0, Number(c.locations) === 1 ? "Standort" : "Standorte",
        (c.departments || 0) + (Number(c.departments) === 1 ? " Abteilung" : " Abteilungen")],
      ["schnittstellen", schluessel + hooks, "Schnittstellen", schluessel + " API-Schlüssel · " + hooks + " Webhooks aktiv"]
    ];
    el("vwKennzahlen").innerHTML = kacheln.map(function (k) {
      return "<button class=\"ds-kpi vw-kpi-knopf\" type=\"button\" data-zu=\"" + k[0] + "\">" +
        "<span class=\"ds-kpi__value\">" + esc(k[1]) + "</span>" +
        "<span class=\"ds-kpi__label\">" + esc(k[2]) + "</span>" +
        "<span class=\"vw-kpi__sub\">" + esc(k[3]) + "</span></button>";
    }).join("");
    el("vwReiterTeamN").textContent = c.active_members ? String(c.active_members) : "";
  }

  /* ── Reiter ────────────────────────────────────────────────────────── */

  function oeffneReiter(name, opts) {
    opts = opts || {};
    if (REITER.indexOf(name) < 0) name = "team";
    S.reiter = name;
    REITER.forEach(function (r) {
      var t = el("tab-" + r);
      var p = el("panel-" + r);
      var aktiv = r === name;
      t.setAttribute("aria-selected", aktiv ? "true" : "false");
      t.tabIndex = aktiv ? 0 : -1;
      p.hidden = !aktiv;
    });
    if (opts.url !== false) {
      var url = new URL(location.href);
      url.searchParams.set("tab", name);
      history.replaceState({}, "", url.toString());
    }
    if (opts.fokus) el("tab-" + name).focus();
    LADER[name](!!opts.neu);
  }

  var LADER = {
    team: ladeTeam,
    standorte: ladeStandorte,
    rollen: ladeRollen,
    sicherheit: ladeSicherheit,
    protokoll: function (neu) { if (neu || !S.geladen.protokoll) { S.prot.offset = 0; ladeProtokoll(); } },
    schnittstellen: ladeSchnittstellen,
    tarif: ladeTarif
  };

  function verdrahteReiter() {
    el("vwReiter").addEventListener("click", function (e) {
      var t = e.target.closest(".vw-tab");
      if (t) oeffneReiter(t.getAttribute("data-reiter"));
    });
    // Pfeiltasten wandern zwischen den Reitern (WAI-ARIA Tabs).
    el("vwReiter").addEventListener("keydown", function (e) {
      if (["ArrowLeft", "ArrowRight", "Home", "End"].indexOf(e.key) < 0) return;
      e.preventDefault();
      var i = REITER.indexOf(S.reiter);
      var n = e.key === "Home" ? 0 : e.key === "End" ? REITER.length - 1
        : (i + (e.key === "ArrowRight" ? 1 : -1) + REITER.length) % REITER.length;
      oeffneReiter(REITER[n], { fokus: true });
    });
    el("vwKennzahlen").addEventListener("click", function (e) {
      var k = e.target.closest("[data-zu]");
      if (k) oeffneReiter(k.getAttribute("data-zu"), { fokus: true });
    });
    document.addEventListener("click", function (e) {
      var w = e.target.closest("[data-wiederholen]");
      if (w) LADER[w.getAttribute("data-wiederholen")](true);
    });
  }

  /* ── Rechte (fuer Matrix und Wirkungsvorschau) ─────────────────────── */

  async function ladeRechte() {
    if (S.rechte) return S.rechte;
    var r = await TC.api.get("/org/roles-permissions");
    S.rechte = (r && r.data) || { permissions: {}, roles: [], hierarchy: {} };
    if (S.rechte.rollen_namen) S.rollenNamen = Object.assign({}, S.rechte.rollen_namen, S.rollenNamen);
    return S.rechte;
  }

  /** Wirksame Rechte einer Rolle — wie der Server rechnet: direkt ODER geerbt. */
  function rechteVon(rolle) {
    var R = S.rechte || {};
    var geerbt = (R.hierarchy && R.hierarchy[rolle]) || [];
    return Object.keys(R.permissions || {}).filter(function (perm) {
      var erlaubt = R.permissions[perm] || [];
      return erlaubt.indexOf(rolle) >= 0 || geerbt.some(function (g) { return erlaubt.indexOf(g) >= 0; });
    });
  }

  function rechtName(perm) {
    var teile = String(perm).split(".");
    var bereich = BEREICHE[teile[0]];
    var tun = TUN[teile[1]];
    return bereich && tun ? bereich + ": " + tun : perm;
  }

  /* ── Team ──────────────────────────────────────────────────────────── */

  async function ladeOrteUndAbteilungen(neu) {
    if (!neu && S.orte && S.abteilungen) return;
    var ergebnis = await Promise.all([
      TC.api.get("/org/locations").catch(function () { return null; }),
      TC.api.get("/org/departments").catch(function () { return null; })
    ]);
    S.orte = ergebnis[0] && ergebnis[0].data ? ergebnis[0].data.items || [] : (S.orte || []);
    S.abteilungen = ergebnis[1] && ergebnis[1].data ? ergebnis[1].data.items || [] : (S.abteilungen || []);
  }

  async function ladeTeam(neu) {
    var ziel = el("vwTeamListe");
    if (!S.geladen.team || neu) ziel.innerHTML = leer("Lade Mitglieder …");
    fuelleRollenwahl();
    try {
      var ergebnis = await Promise.all([
        TC.api.get("/org/members"),
        TC.api.get("/org/invitations").catch(function () { return { data: { items: [] } }; }),
        ladeRechte().catch(function () { return null; }),
        ladeOrteUndAbteilungen(neu).catch(function () { return null; })
      ]);
      S.mitglieder = (ergebnis[0] && ergebnis[0].data && ergebnis[0].data.items) || [];
      S.einladungen = (ergebnis[1] && ergebnis[1].data && ergebnis[1].data.items) || [];
      S.geladen.team = true;
      zeichneTeam();
    } catch (e) {
      ziel.innerHTML = fehlerBlock("Die Mitglieder konnten nicht geladen werden. " + fehlerText(e, ""), "team");
    }
  }

  function fuelleRollenwahl() {
    var wahl = el("vwEinladenRolle");
    if (!wahl || wahl.options.length) return;
    wahl.innerHTML = S.rollenAngebot.map(function (r) {
      return "<option value=\"" + esc(r.key) + "\"" + (r.key === "member" ? " selected" : "") + ">" + esc(r.label) + "</option>";
    }).join("");
  }

  function zugriffText(m) {
    if (m.location_name) return "Standort: " + m.location_name;
    if (m.department_name) return "Abteilung: " + m.department_name;
    return "Alle Standorte";
  }

  function zeichneTeam() {
    var m = S.mitglieder;
    var offen = S.einladungen;
    el("vwTeamZahl").textContent = m.length + (m.length === 1 ? " Person" : " Personen") +
      (offen.length ? " · " + offen.length + (offen.length === 1 ? " Einladung offen" : " Einladungen offen") : "");
    if (!m.length && !offen.length) {
      el("vwTeamListe").innerHTML = leer("Noch niemand außer Ihnen. Laden Sie Ihr Team oben ein.");
      return;
    }
    var zeilen = m.map(zeileMitglied).concat(offen.map(zeileEinladung));
    el("vwTeamListe").innerHTML =
      "<table class=\"ds-table vw-table\"><thead><tr><th>Person</th><th>Rolle</th><th>Zugriff</th><th>Status</th><th><span class=\"ds-sr-only\">Aktionen</span></th></tr></thead>" +
      "<tbody>" + zeilen.join("") + "</tbody></table>";
  }

  function zeileMitglied(m) {
    var ich = S.meineId && String(m.user_id) === S.meineId;
    var name = m.contact_person || m.email;
    var istOwner = m.role_key === "owner";
    var gesperrt = istOwner && !ichBinOwner();
    var rolle;
    if (ich) {
      rolle = esc(rollenName(m.role_key)) + " <span class=\"vw-du\">(Sie)</span>";
    } else if (gesperrt) {
      rolle = esc(rollenName(m.role_key)) + "<div class=\"vw-muted\">ändert nur ein Owner</div>";
    } else {
      var optionen = S.rollenAngebot.map(function (r) { return r.key; });
      if (ichBinOwner()) optionen = ["owner"].concat(optionen);
      if (optionen.indexOf(m.role_key) < 0) optionen = [m.role_key].concat(optionen);
      rolle = "<select class=\"ds-select\" data-rolle-von=\"" + esc(m.id) + "\" aria-label=\"Rolle von " + esc(name) + "\">" +
        optionen.map(function (k) {
          var label = rollenName(k) + (S.rollenAngebot.some(function (r) { return r.key === k; }) || k === "owner" ? "" : " (nicht mehr vergebbar)");
          return "<option value=\"" + esc(k) + "\"" + (k === m.role_key ? " selected" : "") + ">" + esc(label) + "</option>";
        }).join("") + "</select>";
    }
    var aktionen = "";
    if (!ich && !gesperrt) {
      aktionen = "<button class=\"ds-btn ds-btn--ghost ds-btn--sm\" type=\"button\" data-entfernen=\"" + esc(m.user_id) + "\">Entfernen</button>";
    }
    var zugriff = esc(zugriffText(m)) +
      (ich ? "" : "<div class=\"vw-zugriff\"><button class=\"vw-linkknopf\" type=\"button\" data-zugriff=\"" + esc(m.id) + "\">ändern</button></div>");
    return "<tr data-mitglied=\"" + esc(m.id) + "\">" +
      "<td data-label=\"Person\"><div class=\"vw-person\"><span class=\"vw-avatar\" aria-hidden=\"true\">" + esc(initialen(name)) + "</span>" +
        "<div><div class=\"vw-person__name\">" + esc(name) + "</div>" +
        (m.contact_person ? "<div class=\"vw-person__mail\">" + esc(m.email) + "</div>" : "") + "</div></div></td>" +
      "<td data-label=\"Rolle\">" + rolle + "</td>" +
      "<td data-label=\"Zugriff\">" + zugriff + "</td>" +
      "<td data-label=\"Status\"><span class=\"ds-badge ds-badge--success\">Aktiv</span></td>" +
      "<td><div class=\"vw-aktionen\">" + aktionen + "</div></td></tr>" +
      "<tr class=\"vw-editorzeile\" id=\"vwZugriff-" + esc(m.id) + "\" hidden><td colspan=\"5\"></td></tr>";
  }

  function zeileEinladung(i) {
    return "<tr class=\"vw-zeile--offen\">" +
      "<td data-label=\"Person\"><div class=\"vw-person\"><span class=\"vw-avatar vw-avatar--offen\" aria-hidden=\"true\">" + esc(String(i.email || "?").charAt(0).toUpperCase()) + "</span>" +
        "<div><div class=\"vw-person__name\">" + esc(i.email) + "</div><div class=\"vw-person__mail\">noch nicht angenommen</div></div></div></td>" +
      "<td data-label=\"Rolle\">" + esc(rollenName(i.role_key)) + "</td>" +
      "<td data-label=\"Zugriff\">–</td>" +
      "<td data-label=\"Status\"><span class=\"ds-badge ds-badge--warning\">Eingeladen · gilt bis " + esc(datum(i.expires_at)) + "</span></td>" +
      "<td><div class=\"vw-aktionen\"><button class=\"ds-btn ds-btn--ghost ds-btn--sm\" type=\"button\" data-zurueckziehen=\"" + esc(i.id) + "\" data-mail=\"" + esc(i.email) + "\">Zurückziehen</button></div></td></tr>";
  }

  function mitgliedNach(attr, wert) {
    return S.mitglieder.filter(function (m) { return String(m[attr]) === String(wert); })[0] || null;
  }

  async function einladen(e) {
    e.preventDefault();
    var mail = el("vwEinladenMail").value.trim();
    var rolle = el("vwEinladenRolle").value;
    var r = el("vwEinladenRueckmeldung");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) {
      rueckmeldung(r, "Bitte geben Sie eine gültige E-Mail-Adresse ein.", "schlecht");
      el("vwEinladenMail").focus();
      return;
    }
    rueckmeldung(r, "Einladung wird verschickt …");
    try {
      var antwort = await TC.api.post("/org/members/invite", { email: mail, role_key: rolle });
      var link = antwort && antwort.data && antwort.data.invite_url;
      el("vwEinladenMail").value = "";
      r.setAttribute("data-ton", "gut");
      r.innerHTML = "Einladung an " + esc(mail) + " als " + esc(rollenName(rolle)) + " ist verschickt." +
        (link ? " Kommt die Mail nicht an? <button class=\"vw-linkknopf\" type=\"button\" data-kopiere=\"" + esc(link) + "\">Einladungslink kopieren</button>" : "");
      await ladeTeam(true);
      aktualisiereUebersicht();
    } catch (err) {
      rueckmeldung(r, fehlerText(err), "schlecht");
    }
  }

  function rollenwechsel(sel) {
    var m = mitgliedNach("id", sel.getAttribute("data-rolle-von"));
    if (!m) return;
    var neu = sel.value;
    var alt = m.role_key;
    if (neu === alt) return;
    var name = m.contact_person || m.email;
    var punkte = [name + " wird " + rollenName(neu) + " statt " + rollenName(alt) + "."];
    if (S.rechte) {
      var vorher = rechteVon(alt);
      var nachher = rechteVon(neu);
      var dazu = nachher.filter(function (p) { return vorher.indexOf(p) < 0; });
      var weg = vorher.filter(function (p) { return nachher.indexOf(p) < 0; });
      if (dazu.length) punkte.push("Neu dazu: " + dazu.length + (dazu.length === 1 ? " Recht" : " Rechte") + ", zum Beispiel " + dazu.slice(0, 3).map(rechtName).join(", ") + ".");
      if (weg.length) punkte.push("Fällt weg: " + weg.length + (weg.length === 1 ? " Recht" : " Rechte") + ", zum Beispiel " + weg.slice(0, 3).map(rechtName).join(", ") + ".");
      if (!dazu.length && !weg.length) punkte.push("An den Rechten ändert sich nichts.");
    }
    if (neu === "owner") punkte.push(name + " bekommt alle Rechte eines Owners — auch, andere Owner zu ändern oder zu entfernen.");
    if (alt === "owner") punkte.push("Bleibt danach kein Owner übrig, lehnt TempConnect die Änderung ab.");
    punkte.push("Die Änderung steht danach im Protokoll.");
    bestaetige({
      titel: "Rolle von " + name + " ändern?",
      punkte: punkte,
      knopf: "Rolle ändern",
      gefahr: alt === "owner" || neu === "owner",
      aktion: function () {
        return TC.api.patch("/org/members/" + encodeURIComponent(m.id) + "/role", { role_key: neu });
      }
    }).then(function (erledigt) {
      if (erledigt) { ladeTeam(true); S.geladen.rollen = false; }
      else sel.value = alt;
    });
  }

  function entfernen(userId) {
    var m = mitgliedNach("user_id", userId);
    if (!m) return;
    var name = m.contact_person || m.email;
    var vorname = String(name).split(/[\s@]/)[0];
    var firma = S.firma.name || "Ihrer Firma";
    bestaetige({
      titel: name + " aus " + firma + " entfernen?",
      punkte: [
        vorname + " verliert sofort den Zugang zu " + firma + " (heute als " + rollenName(m.role_key) + ").",
        "Das TempConnect-Konto bleibt bestehen. Arbeitet " + vorname + " auch für eine andere Firma, ändert sich dort nichts.",
        "Der Vorgang steht im Protokoll, mit Ihrem Namen und dem Grund.",
        "Rückgängig machen: " + vorname + " einfach wieder einladen."
      ],
      mitGrund: true,
      knopf: "Zugang entfernen",
      aktion: function (grund) {
        return TC.api.request("/org/members/" + encodeURIComponent(m.user_id), { method: "DELETE", body: { reason: grund } });
      }
    }).then(function (erledigt) {
      if (erledigt) { ladeTeam(true); aktualisiereUebersicht(); }
    });
  }

  function zurueckziehen(id, mail) {
    bestaetige({
      titel: "Einladung an " + mail + " zurückziehen?",
      punkte: ["Der Einladungslink funktioniert danach nicht mehr.", "Sie können jederzeit neu einladen."],
      knopf: "Zurückziehen",
      aktion: function () { return TC.api.delete("/org/invitations/" + encodeURIComponent(id)); }
    }).then(function (erledigt) {
      if (erledigt) { ladeTeam(true); aktualisiereUebersicht(); }
    });
  }

  function zugriffEditor(membershipId) {
    var zeile = el("vwZugriff-" + membershipId);
    var m = mitgliedNach("id", membershipId);
    if (!zeile || !m) return;
    if (!zeile.hidden) { zeile.hidden = true; return; }
    var orte = S.orte || [];
    var abt = S.abteilungen || [];
    zeile.firstElementChild.innerHTML =
      "<div class=\"vw-editor\"><div class=\"vw-editor__grid\">" +
      "<label class=\"ds-label\">Standort<select class=\"ds-select\" data-feld=\"ort\"><option value=\"\">Alle Standorte</option>" +
        orte.map(function (o) { return "<option value=\"" + esc(o.id) + "\"" + (o.id === m.location_id ? " selected" : "") + ">" + esc(o.name) + (o.city ? " (" + esc(o.city) + ")" : "") + "</option>"; }).join("") +
      "</select></label>" +
      "<label class=\"ds-label\">Abteilung<select class=\"ds-select\" data-feld=\"abt\"><option value=\"\">Keine Abteilung</option>" +
        abt.map(function (a) { return "<option value=\"" + esc(a.id) + "\"" + (a.id === m.department_id ? " selected" : "") + ">" + esc(a.name) + "</option>"; }).join("") +
      "</select></label></div>" +
      (orte.length ? "" : "<p class=\"vw-muted ds-mt-2 ds-mb-0\">Noch keine Standorte angelegt — das geht im Reiter Standorte.</p>") +
      "<div class=\"vw-editor__fuss\"><span class=\"vw-feedback ds-mt-0\" data-ton=\"schlecht\" role=\"status\"></span>" +
      "<button class=\"ds-btn ds-btn--ghost ds-btn--sm\" type=\"button\" data-zugriff=\"" + esc(m.id) + "\">Abbrechen</button>" +
      "<button class=\"ds-btn ds-btn--primary ds-btn--sm\" type=\"button\" data-zugriff-speichern=\"" + esc(m.id) + "\">Speichern</button></div></div>";
    zeile.hidden = false;
  }

  async function zugriffSpeichern(membershipId) {
    var zeile = el("vwZugriff-" + membershipId);
    var ort = zeile.querySelector("[data-feld=ort]").value || null;
    var abt = zeile.querySelector("[data-feld=abt]").value || null;
    var hinweis = zeile.querySelector(".vw-feedback");
    rueckmeldung(hinweis, "Speichere …");
    try {
      await TC.api.patch("/org/members/" + encodeURIComponent(membershipId) + "/scope", { location_id: ort, department_id: abt });
      ladeTeam(true);
    } catch (e) {
      rueckmeldung(hinweis, fehlerText(e), "schlecht");
    }
  }

  function verdrahteTeam() {
    el("vwEinladen").addEventListener("submit", einladen);
    var liste = el("vwTeamListe");
    liste.addEventListener("change", function (e) {
      var sel = e.target.closest("[data-rolle-von]");
      if (sel) rollenwechsel(sel);
    });
    liste.addEventListener("click", function (e) {
      var t;
      if ((t = e.target.closest("[data-entfernen]"))) entfernen(t.getAttribute("data-entfernen"));
      else if ((t = e.target.closest("[data-zurueckziehen]"))) zurueckziehen(t.getAttribute("data-zurueckziehen"), t.getAttribute("data-mail"));
      else if ((t = e.target.closest("[data-zugriff-speichern]"))) zugriffSpeichern(t.getAttribute("data-zugriff-speichern"));
      else if ((t = e.target.closest("[data-zugriff]"))) zugriffEditor(t.getAttribute("data-zugriff"));
    });
    document.addEventListener("click", function (e) {
      var k = e.target.closest("[data-kopiere]");
      if (!k) return;
      var text = k.getAttribute("data-kopiere");
      (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject())
        .then(function () { k.textContent = "Kopiert"; })
        .catch(function () { window.prompt("Zum Kopieren markieren:", text); });
    });
  }

  /* ── Standorte und Abteilungen ─────────────────────────────────────── */

  async function ladeStandorte(neu) {
    if (S.geladen.standorte && !neu) return;
    el("vwStandorteListe").innerHTML = leer("Lade Standorte …");
    el("vwAbteilungenListe").innerHTML = leer("Lade Abteilungen …");
    var ergebnis = await Promise.all([
      TC.api.get("/org/locations").catch(function (e) { return { fehler: e }; }),
      TC.api.get("/org/departments").catch(function (e) { return { fehler: e }; })
    ]);
    if (!S.mitglieder.length) {
      try { S.mitglieder = ((await TC.api.get("/org/members")).data || {}).items || []; } catch (_e) { /* nur fuer die Vorschau */ }
    }
    if (ergebnis[0].fehler) el("vwStandorteListe").innerHTML = fehlerBlock("Die Standorte konnten nicht geladen werden.", "standorte");
    else { S.orte = (ergebnis[0].data && ergebnis[0].data.items) || []; zeichneOrte(); }
    if (ergebnis[1].fehler) el("vwAbteilungenListe").innerHTML = fehlerBlock("Die Abteilungen konnten nicht geladen werden.", "standorte");
    else { S.abteilungen = (ergebnis[1].data && ergebnis[1].data.items) || []; zeichneAbteilungen(); }
    S.geladen.standorte = !ergebnis[0].fehler && !ergebnis[1].fehler;
    applyOrgDomLocks(el("panel-standorte"));
  }

  function zeichneOrte() {
    var orte = S.orte || [];
    el("vwStandorteZahl").textContent = orte.length ? String(orte.length) : "";
    el("vwAbtOrt").innerHTML = "<option value=\"\">Kein Standort</option>" +
      orte.map(function (o) { return "<option value=\"" + esc(o.id) + "\">" + esc(o.name) + (o.city ? " (" + esc(o.city) + ")" : "") + "</option>"; }).join("");
    if (!orte.length) { el("vwStandorteListe").innerHTML = leer("Noch keine Standorte angelegt."); return; }
    el("vwStandorteListe").innerHTML = orte.map(function (o) {
      var adresse = [o.street, [o.postal_code, o.city].filter(Boolean).join(" "), o.country && o.country !== "DE" ? o.country : ""].filter(Boolean).join(", ");
      return "<div class=\"vw-eintrag\"><div class=\"vw-eintrag__info\"><div class=\"vw-eintrag__name\">" + esc(o.name) +
        (o.is_hq ? " <span class=\"ds-badge ds-badge--success\">Hauptsitz</span>" : "") + "</div>" +
        "<div class=\"vw-eintrag__meta\">" + esc(adresse || "–") + "</div></div>" +
        "<div class=\"vw-aktionen\">" +
        "<button class=\"ds-btn ds-btn--ghost ds-btn--sm\" type=\"button\" data-feature-key=\"org_settings\" data-ort-bearbeiten=\"" + esc(o.id) + "\">Bearbeiten</button>" +
        (o.is_hq ? "" : "<button class=\"ds-btn ds-btn--ghost ds-btn--sm\" type=\"button\" data-feature-key=\"org_settings\" data-ort-weg=\"" + esc(o.id) + "\">Deaktivieren</button>") +
        "</div></div><div id=\"vwOrtEdit-" + esc(o.id) + "\" hidden></div>";
    }).join("");
  }

  function zeichneAbteilungen() {
    var abt = S.abteilungen || [];
    el("vwAbteilungenZahl").textContent = abt.length ? String(abt.length) : "";
    if (!abt.length) { el("vwAbteilungenListe").innerHTML = leer("Noch keine Abteilungen angelegt."); return; }
    el("vwAbteilungenListe").innerHTML = abt.map(function (a) {
      var meta = [a.location_name ? "Standort: " + a.location_name : "", a.cost_center ? "Kostenstelle " + a.cost_center : ""].filter(Boolean).join(" · ");
      return "<div class=\"vw-eintrag\"><div class=\"vw-eintrag__info\"><div class=\"vw-eintrag__name\">" + esc(a.name) + "</div>" +
        "<div class=\"vw-eintrag__meta\">" + esc(meta || "–") + "</div></div>" +
        "<div class=\"vw-aktionen\">" +
        "<button class=\"ds-btn ds-btn--ghost ds-btn--sm\" type=\"button\" data-feature-key=\"org_settings\" data-abt-bearbeiten=\"" + esc(a.id) + "\">Bearbeiten</button>" +
        "<button class=\"ds-btn ds-btn--ghost ds-btn--sm\" type=\"button\" data-feature-key=\"org_settings\" data-abt-weg=\"" + esc(a.id) + "\">Deaktivieren</button>" +
        "</div></div><div id=\"vwAbtEdit-" + esc(a.id) + "\" hidden></div>";
    }).join("");
  }

  function ortEditor(id) {
    var box = el("vwOrtEdit-" + id);
    var o = (S.orte || []).filter(function (x) { return x.id === id; })[0];
    if (!box || !o) return;
    if (!box.hidden) { box.hidden = true; return; }
    box.innerHTML = "<div class=\"vw-editor\"><div class=\"vw-formgrid\">" +
      "<label class=\"ds-label\">Name *<input class=\"ds-input\" data-feld=\"name\" value=\"" + esc(o.name) + "\"/></label>" +
      "<label class=\"ds-label\">Stadt *<input class=\"ds-input\" data-feld=\"city\" value=\"" + esc(o.city || "") + "\"/></label>" +
      "<label class=\"ds-label\">Straße<input class=\"ds-input\" data-feld=\"street\" value=\"" + esc(o.street || "") + "\"/></label>" +
      "<label class=\"ds-label\">PLZ<input class=\"ds-input\" data-feld=\"postal_code\" value=\"" + esc(o.postal_code || "") + "\"/></label>" +
      "<label class=\"vw-check\"><input type=\"checkbox\" data-feld=\"is_hq\"" + (o.is_hq ? " checked" : "") + "/> Hauptsitz</label></div>" +
      "<div class=\"vw-editor__fuss\"><span class=\"vw-feedback ds-mt-0\" data-ton=\"schlecht\" role=\"status\"></span>" +
      "<button class=\"ds-btn ds-btn--ghost ds-btn--sm\" type=\"button\" data-ort-bearbeiten=\"" + esc(o.id) + "\">Abbrechen</button>" +
      "<button class=\"ds-btn ds-btn--primary ds-btn--sm\" type=\"button\" data-feature-key=\"org_settings\" data-ort-speichern=\"" + esc(o.id) + "\">Speichern</button></div></div>";
    box.hidden = false;
    applyOrgDomLocks(box);
  }

  async function ortSpeichern(id) {
    var box = el("vwOrtEdit-" + id);
    var wert = function (f) { var x = box.querySelector("[data-feld=" + f + "]"); return x.type === "checkbox" ? x.checked : x.value.trim(); };
    var hinweis = box.querySelector(".vw-feedback");
    if (!wert("name") || !wert("city")) { rueckmeldung(hinweis, "Name und Stadt sind Pflicht.", "schlecht"); return; }
    try {
      await TC.api.patch("/org/locations/" + encodeURIComponent(id), {
        name: wert("name"), city: wert("city"), street: wert("street") || null, postal_code: wert("postal_code") || null, is_hq: wert("is_hq")
      });
      ladeStandorte(true); aktualisiereUebersicht();
    } catch (e) { rueckmeldung(hinweis, fehlerText(e), "schlecht"); }
  }

  function ortWeg(id) {
    var o = (S.orte || []).filter(function (x) { return x.id === id; })[0];
    if (!o) return;
    var gebunden = S.mitglieder.filter(function (m) { return m.location_id === id; }).length;
    var abt = (S.abteilungen || []).filter(function (a) { return a.location_id === id; }).length;
    var punkte = ["Der Standort " + o.name + " wird nicht mehr als Standort angeboten — in Filtern, Bedarfen und beim Zugriff."];
    if (gebunden) punkte.push(gebunden + (gebunden === 1 ? " Mitglied ist" : " Mitglieder sind") + " heute auf diesen Standort begrenzt. Prüfen Sie danach deren Zugriff im Reiter Team.");
    if (abt) punkte.push(abt + (abt === 1 ? " Abteilung hängt" : " Abteilungen hängen") + " an diesem Standort.");
    punkte.push("Die Daten bleiben erhalten; der Vorgang steht im Protokoll.");
    bestaetige({
      titel: "Standort " + o.name + " deaktivieren?", punkte: punkte, knopf: "Deaktivieren",
      aktion: function () { return TC.api.delete("/org/locations/" + encodeURIComponent(id)); }
    }).then(function (ok) { if (ok) { ladeStandorte(true); aktualisiereUebersicht(); } });
  }

  async function ortNeu(e) {
    e.preventDefault();
    var hinweis = el("vwOrtFehler");
    var name = el("vwOrtName").value.trim();
    var stadt = el("vwOrtStadt").value.trim();
    if (!name || !stadt) { rueckmeldung(hinweis, "Name und Stadt sind Pflicht.", "schlecht"); return; }
    rueckmeldung(hinweis, "");
    try {
      await TC.api.post("/org/locations", {
        name: name, city: stadt, street: el("vwOrtStrasse").value.trim() || null,
        postal_code: el("vwOrtPlz").value.trim() || null, country: el("vwOrtLand").value || "DE", is_hq: el("vwOrtHq").checked
      });
      el("vwStandortNeu").reset();
      ladeStandorte(true); aktualisiereUebersicht();
    } catch (err) {
      rueckmeldung(hinweis, err && err.status === 403 && /LIMIT/i.test(err.code || "")
        ? "Ihr Tarif erlaubt keine weiteren Standorte." : fehlerText(err), "schlecht");
    }
  }

  function abtEditor(id) {
    var box = el("vwAbtEdit-" + id);
    var a = (S.abteilungen || []).filter(function (x) { return x.id === id; })[0];
    if (!box || !a) return;
    if (!box.hidden) { box.hidden = true; return; }
    box.innerHTML = "<div class=\"vw-editor\"><div class=\"vw-formgrid\">" +
      "<label class=\"ds-label\">Name *<input class=\"ds-input\" data-feld=\"name\" value=\"" + esc(a.name) + "\"/></label>" +
      "<label class=\"ds-label\">Kostenstelle<input class=\"ds-input\" data-feld=\"cost_center\" value=\"" + esc(a.cost_center || "") + "\"/></label>" +
      "<label class=\"ds-label\">Standort<select class=\"ds-select\" data-feld=\"location_id\"><option value=\"\">Kein Standort</option>" +
        (S.orte || []).map(function (o) { return "<option value=\"" + esc(o.id) + "\"" + (o.id === a.location_id ? " selected" : "") + ">" + esc(o.name) + "</option>"; }).join("") +
      "</select></label></div>" +
      "<div class=\"vw-editor__fuss\"><span class=\"vw-feedback ds-mt-0\" data-ton=\"schlecht\" role=\"status\"></span>" +
      "<button class=\"ds-btn ds-btn--ghost ds-btn--sm\" type=\"button\" data-abt-bearbeiten=\"" + esc(a.id) + "\">Abbrechen</button>" +
      "<button class=\"ds-btn ds-btn--primary ds-btn--sm\" type=\"button\" data-feature-key=\"org_settings\" data-abt-speichern=\"" + esc(a.id) + "\">Speichern</button></div></div>";
    box.hidden = false;
    applyOrgDomLocks(box);
  }

  async function abtSpeichern(id) {
    var box = el("vwAbtEdit-" + id);
    var wert = function (f) { return box.querySelector("[data-feld=" + f + "]").value.trim(); };
    var hinweis = box.querySelector(".vw-feedback");
    if (!wert("name")) { rueckmeldung(hinweis, "Der Name ist Pflicht.", "schlecht"); return; }
    try {
      await TC.api.patch("/org/departments/" + encodeURIComponent(id), {
        name: wert("name"), cost_center: wert("cost_center") || null, location_id: wert("location_id") || null
      });
      ladeStandorte(true);
    } catch (e) { rueckmeldung(hinweis, fehlerText(e), "schlecht"); }
  }

  function abtWeg(id) {
    var a = (S.abteilungen || []).filter(function (x) { return x.id === id; })[0];
    if (!a) return;
    var gebunden = S.mitglieder.filter(function (m) { return m.department_id === id; }).length;
    var punkte = ["Die Abteilung " + a.name + " wird nicht mehr angeboten."];
    if (gebunden) punkte.push(gebunden + (gebunden === 1 ? " Mitglied ist" : " Mitglieder sind") + " heute dieser Abteilung zugeordnet.");
    punkte.push("Die Daten bleiben erhalten; der Vorgang steht im Protokoll.");
    bestaetige({
      titel: "Abteilung " + a.name + " deaktivieren?", punkte: punkte, knopf: "Deaktivieren",
      aktion: function () { return TC.api.delete("/org/departments/" + encodeURIComponent(id)); }
    }).then(function (ok) { if (ok) { ladeStandorte(true); aktualisiereUebersicht(); } });
  }

  async function abtNeu(e) {
    e.preventDefault();
    var hinweis = el("vwAbtFehler");
    var name = el("vwAbtName").value.trim();
    if (!name) { rueckmeldung(hinweis, "Der Name ist Pflicht.", "schlecht"); return; }
    rueckmeldung(hinweis, "");
    try {
      await TC.api.post("/org/departments", { name: name, cost_center: el("vwAbtKst").value.trim() || null, location_id: el("vwAbtOrt").value || null });
      el("vwAbteilungNeu").reset();
      ladeStandorte(true); aktualisiereUebersicht();
    } catch (err) { rueckmeldung(hinweis, fehlerText(err), "schlecht"); }
  }

  function verdrahteStandorte() {
    el("vwStandortNeu").addEventListener("submit", ortNeu);
    el("vwAbteilungNeu").addEventListener("submit", abtNeu);
    el("panel-standorte").addEventListener("click", function (e) {
      var t;
      if ((t = e.target.closest("[data-ort-speichern]"))) ortSpeichern(t.getAttribute("data-ort-speichern"));
      else if ((t = e.target.closest("[data-ort-bearbeiten]"))) ortEditor(t.getAttribute("data-ort-bearbeiten"));
      else if ((t = e.target.closest("[data-ort-weg]"))) ortWeg(t.getAttribute("data-ort-weg"));
      else if ((t = e.target.closest("[data-abt-speichern]"))) abtSpeichern(t.getAttribute("data-abt-speichern"));
      else if ((t = e.target.closest("[data-abt-bearbeiten]"))) abtEditor(t.getAttribute("data-abt-bearbeiten"));
      else if ((t = e.target.closest("[data-abt-weg]"))) abtWeg(t.getAttribute("data-abt-weg"));
    });
  }

  /* ── Rollen ────────────────────────────────────────────────────────── */

  async function ladeRollen(neu) {
    if (S.geladen.rollen && !neu) return;
    el("vwMatrix").innerHTML = leer("Lade Rechte …");
    try {
      if (neu) S.rechte = null;
      var R = await ladeRechte();
      var rollen = R.roles || [];
      var gruppen = {};
      Object.keys(R.permissions || {}).forEach(function (perm) {
        var b = perm.split(".")[0];
        (gruppen[b] = gruppen[b] || []).push(perm);
      });
      var wirksam = {};
      rollen.forEach(function (r) { wirksam[r] = rechteVon(r); });
      var html = "<table class=\"ds-table vw-matrix\"><thead><tr><th>Recht</th>" +
        rollen.map(function (r) {
          return "<th scope=\"col\">" + esc(rollenName(r)) + (r === S.meineRolle ? "<div class=\"vw-du\">Ihre Rolle</div>" : "") + "</th>";
        }).join("") + "</tr></thead><tbody>";
      Object.keys(gruppen).forEach(function (b) {
        html += "<tr class=\"vw-matrix__bereich\"><td colspan=\"" + (rollen.length + 1) + "\">" + esc(BEREICHE[b] || b) + "</td></tr>";
        gruppen[b].forEach(function (perm) {
          html += "<tr><td>" + esc(rechtName(perm)) + "</td>" + rollen.map(function (r) {
            return wirksam[r].indexOf(perm) >= 0
              ? "<td><span class=\"vw-ja\" aria-label=\"ja\">ja</span></td>"
              : "<td><span class=\"vw-nein\" aria-label=\"nein\">–</span></td>";
          }).join("") + "</tr>";
        });
      });
      el("vwMatrix").innerHTML = html + "</tbody></table>";
      S.geladen.rollen = true;
    } catch (e) {
      el("vwMatrix").innerHTML = fehlerBlock("Die Rechte konnten nicht geladen werden. " + fehlerText(e, ""), "rollen");
    }
  }

  /* ── Sicherheit ────────────────────────────────────────────────────── */

  async function ladeSicherheit(neu) {
    if (S.geladen.sicherheit && !neu) return;
    var ziel = el("vwSicherheit");
    ziel.innerHTML = leer("Lade Sicherheit …");
    var d;
    try { d = (await TC.api.get("/org/security")).data || {}; }
    catch (e) { ziel.innerHTML = fehlerBlock("Die Sicherheitseinstellungen konnten nicht geladen werden. " + fehlerText(e, ""), "sicherheit"); return; }
    var s = d.security_summary || {};
    var cfg = d.settings || {};
    var punkt = function (an, text) { return "<li><span class=\"vw-punkt" + (an ? " vw-punkt--an" : "") + "\" aria-hidden=\"true\"></span>" + esc(text) + (an ? "" : " (aus)") + "</li>"; };
    var stufe = { relaxed: "locker", standard: "standard", strict: "streng" }[s.compliance_strictness] || s.compliance_strictness || "standard";
    var html =
      "<div class=\"ds-card\"><div class=\"vw-section-title\"><h2>Schutz, der immer aktiv ist</h2></div><ul class=\"vw-liste\">" +
        punkt(s.rbac_enforced, "Rechte nach Rolle") + punkt(s.audit_logging, "Protokoll aller Änderungen") +
        punkt(s.csrf_protection, "Schutz vor untergeschobenen Formularen") + punkt(s.rate_limiting, "Begrenzung von Anfragen") +
        punkt(s.encryption_in_transit, "Verschlüsselung bei der Übertragung") + punkt(s.encryption_at_rest, "Verschlüsselung der gespeicherten Daten") +
      "</ul></div>" +
      "<div class=\"ds-card\"><div class=\"vw-section-title\"><h2>Arbeitsweise Ihrer Firma</h2></div><ul class=\"vw-liste\">" +
        punkt(s.approval_workflow, "Freigabe vor dem Veröffentlichen von Bedarfen") +
        (S.seite === "company" ? punkt(s.preferred_suppliers_only, "Nur bevorzugte Lieferanten") : "") +
        punkt(s.auto_match, "Automatische Vorschläge") +
        "<li><span class=\"vw-punkt vw-punkt--an\" aria-hidden=\"true\"></span>Compliance-Stufe: " + esc(stufe) + "</li>" +
      "</ul></div>";
    if (S.seite === "agency") {
      html += "<div class=\"ds-card\"><div class=\"vw-section-title\"><h2>Zusammenarbeit mit anderen Zeitarbeitsfirmen</h2></div>" +
        "<p class=\"vw-muted ds-mt-0\">Zusatz zum individuellen Tarif: Sie finden Personal anderer Zeitarbeitsfirmen und können Ihr eigenes für sie sichtbar machen.</p>" +
        "<label class=\"vw-check\"><input type=\"checkbox\" id=\"vwIaAn\"" + (cfg.inter_agency_matching_enabled ? " checked" : "") + "/> Mit anderen Zeitarbeitsfirmen zusammenarbeiten</label>" +
        "<label class=\"vw-check ds-mt-2\"><input type=\"checkbox\" id=\"vwIaSichtbar\"" + (cfg.inter_agency_supply_visible ? " checked" : "") + "/> Unser Personal für andere Zeitarbeitsfirmen sichtbar machen</label>" +
        "<div class=\"vw-formfuss\"><span class=\"vw-feedback ds-mt-0\" id=\"vwIaHinweis\" role=\"status\"></span>" +
        "<button class=\"ds-btn ds-btn--primary\" type=\"button\" id=\"vwIaSpeichern\" data-feature-key=\"org_settings\">Speichern</button></div></div>";
    }
    html += "<div class=\"ds-card\"><div class=\"vw-section-title\"><h2>Anmeldung</h2></div>" +
      "<p class=\"vw-muted ds-mt-0\">Mit Single Sign-On melden sich Ihre Mitarbeitenden über das Firmenkonto an (ab Tarif PRO).</p>" +
      "<a class=\"ds-btn ds-btn--ghost\" href=\"/public/sso_config.html\">Single Sign-On einrichten</a></div>";
    ziel.innerHTML = html;
    S.geladen.sicherheit = true;
    var knopf = el("vwIaSpeichern");
    if (knopf) knopf.addEventListener("click", interAgencySpeichern);
    applyOrgDomLocks(ziel);
  }

  function interAgencySpeichern() {
    var an = el("vwIaAn").checked;
    var sichtbar = an && el("vwIaSichtbar").checked;
    var punkte = [an ? "Sie sehen in der Suche auch Personal anderer Zeitarbeitsfirmen." : "Personal anderer Zeitarbeitsfirmen erscheint nicht mehr in Ihrer Suche."];
    punkte.push(sichtbar ? "Andere Zeitarbeitsfirmen können Ihr Personal finden und anfragen." : "Ihr Personal bleibt für andere Zeitarbeitsfirmen unsichtbar.");
    punkte.push("Die Änderung steht im Protokoll.");
    bestaetige({
      titel: "Zusammenarbeit mit anderen Zeitarbeitsfirmen ändern?", punkte: punkte, knopf: "Speichern", gefahr: false,
      aktion: function () { return TC.api.patch("/org/security", { inter_agency_matching_enabled: an, inter_agency_supply_visible: sichtbar }); }
    }).then(function (ok) {
      if (ok) { ladeSicherheit(true).then(function () { rueckmeldung(el("vwIaHinweis"), "Gespeichert.", "gut"); }); }
    });
  }

  /* ── Protokoll ─────────────────────────────────────────────────────── */

  function protokollFilter() {
    var p = new URLSearchParams();
    var tage = el("vwProtZeit").value;
    var art = el("vwProtArt").value;
    if (tage) p.set("from", tagVor(Number(tage) - 1));
    if (art) p.set("action_type", art);
    return p;
  }

  async function ladeProtokoll() {
    var ziel = el("vwProtListe");
    ziel.innerHTML = leer("Lade Protokoll …");
    var p = protokollFilter();
    p.set("limit", String(S.prot.limit));
    p.set("offset", String(S.prot.offset));
    try {
      var d = (await TC.api.get("/org/audit-log?" + p.toString())).data || {};
      var items = d.items || [];
      S.prot.total = Number(d.total || 0);
      S.geladen.protokoll = true;
      if (!items.length) {
        ziel.innerHTML = leer(S.prot.offset ? "Keine älteren Einträge." : "Keine Einträge für diesen Zeitraum.");
      } else {
        ziel.innerHTML = "<table class=\"ds-table vw-table\"><thead><tr><th>Zeitpunkt</th><th>Wer</th><th>Was</th><th>Ergebnis</th></tr></thead><tbody>" +
          items.map(function (a) {
            var ergebnis = a.status === "SUCCESS" ? ["erfolgreich", "ds-badge--success"]
              : a.status === "DENIED" ? ["abgewiesen", "ds-badge--danger"]
              : a.status === "FAILED" ? ["fehlgeschlagen", "ds-badge--danger"] : [a.status || "–", "ds-badge--neutral"];
            return "<tr><td data-label=\"Zeitpunkt\">" + esc(zeitpunkt(a.created_at)) + "</td>" +
              "<td data-label=\"Wer\">" + esc(a.wer || a.actor_email || "System") + "</td>" +
              "<td data-label=\"Was\">" + esc(a.label || a.action) + "</td>" +
              "<td data-label=\"Ergebnis\"><span class=\"ds-badge " + ergebnis[1] + "\">" + esc(ergebnis[0]) + "</span></td></tr>";
          }).join("") + "</tbody></table>";
      }
      var bis = Math.min(S.prot.offset + items.length, S.prot.total);
      el("vwProtBlaettern").hidden = S.prot.total <= S.prot.limit;
      el("vwProtStand").textContent = S.prot.total ? (S.prot.offset + 1) + "–" + bis + " von " + S.prot.total + " Einträgen" : "";
      el("vwProtZurueck").disabled = S.prot.offset === 0;
      el("vwProtWeiter").disabled = S.prot.offset + S.prot.limit >= S.prot.total;
    } catch (e) {
      ziel.innerHTML = fehlerBlock("Das Protokoll konnte nicht geladen werden. " + fehlerText(e, ""), "protokoll");
    }
  }

  async function protokollCsv() {
    var knopf = el("vwProtCsv");
    var r = el("vwProtRueckmeldung");
    knopf.disabled = true;
    rueckmeldung(r, "Export wird erstellt …");
    try {
      var antwort = await TC.api.request("/org/audit-log/export/csv?" + protokollFilter().toString(), { method: "GET", rawResponse: true });
      if (!antwort.ok) {
        var info = await antwort.json().catch(function () { return {}; });
        throw Object.assign(new Error((info.error && info.error.message) || ""), { code: info.error && info.error.code, status: antwort.status });
      }
      var blob = await antwort.blob();
      var m = /filename="?([^";]+)"?/i.exec(antwort.headers.get("content-disposition") || "");
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = m ? m[1] : "protokoll.csv";
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
      rueckmeldung(r, "Export heruntergeladen. Er steht ab jetzt auch im Protokoll.", "gut");
    } catch (e) {
      rueckmeldung(r, fehlerText(e, "Der Export hat nicht geklappt."), "schlecht");
    } finally {
      knopf.disabled = false;
    }
  }

  function verdrahteProtokoll() {
    ["vwProtZeit", "vwProtArt"].forEach(function (id) {
      el(id).addEventListener("change", function () { S.prot.offset = 0; ladeProtokoll(); });
    });
    el("vwProtZurueck").addEventListener("click", function () { S.prot.offset = Math.max(0, S.prot.offset - S.prot.limit); ladeProtokoll(); });
    el("vwProtWeiter").addEventListener("click", function () { S.prot.offset += S.prot.limit; ladeProtokoll(); });
    el("vwProtCsv").addEventListener("click", protokollCsv);
  }

  /* ── Schnittstellen ────────────────────────────────────────────────── */

  async function ladeSchnittstellen(neu) {
    if (S.geladen.schnittstellen && !neu) return;
    el("vwSchluesselListe").innerHTML = leer("Lade Schlüssel …");
    el("vwWebhookListe").innerHTML = leer("Lade Webhooks …");
    var ergebnis = await Promise.all([
      TC.api.get("/org/api-keys").catch(function (e) { return { fehler: e }; }),
      TC.api.get("/org/webhooks").catch(function (e) { return { fehler: e }; })
    ]);
    if (ergebnis[0].fehler) el("vwSchluesselListe").innerHTML = fehlerBlock("Die API-Schlüssel konnten nicht geladen werden.", "schnittstellen");
    else zeichneSchluessel((ergebnis[0].data && ergebnis[0].data.items) || []);
    if (ergebnis[1].fehler) el("vwWebhookListe").innerHTML = fehlerBlock("Die Webhooks konnten nicht geladen werden.", "schnittstellen");
    else zeichneWebhooks((ergebnis[1].data && ergebnis[1].data.items) || []);
    S.geladen.schnittstellen = !ergebnis[0].fehler && !ergebnis[1].fehler;
    applyOrgDomLocks(el("panel-schnittstellen"));
  }

  function zeichneSchluessel(items) {
    if (!items.length) { el("vwSchluesselListe").innerHTML = leer("Noch keine API-Schlüssel. Ein Schlüssel verbindet Ihre eigenen Systeme mit TempConnect."); return; }
    el("vwSchluesselListe").innerHTML = "<table class=\"ds-table vw-table\"><thead><tr><th>Bezeichnung</th><th>Kennung</th><th>Berechtigungen</th><th>Zuletzt genutzt</th><th>Status</th><th><span class=\"ds-sr-only\">Aktionen</span></th></tr></thead><tbody>" +
      items.map(function (k) {
        var scopes = k.scopes && k.scopes.length
          ? k.scopes.map(function (s) { return "<span class=\"ds-badge ds-badge--neutral\">" + esc(s) + "</span>"; }).join(" ")
          : "<span class=\"ds-badge ds-badge--warning\">voller Zugriff</span>";
        var aktionen = k.is_active
          ? "<button class=\"ds-btn ds-btn--ghost ds-btn--sm\" type=\"button\" data-feature-key=\"integrations\" data-rotieren=\"" + esc(k.id) + "\" data-name=\"" + esc(k.label || k.key_prefix) + "\">Erneuern</button>" +
            "<button class=\"ds-btn ds-btn--ghost ds-btn--sm\" type=\"button\" data-feature-key=\"integrations\" data-widerrufen=\"" + esc(k.id) + "\" data-name=\"" + esc(k.label || k.key_prefix) + "\">Widerrufen</button>"
          : "";
        return "<tr><td data-label=\"Bezeichnung\">" + esc(k.label || "–") + "<div class=\"vw-muted\">erstellt " + esc(datum(k.created_at)) + "</div></td>" +
          "<td data-label=\"Kennung\"><code>" + esc(k.key_prefix) + "…</code></td>" +
          "<td data-label=\"Berechtigungen\">" + scopes + "</td>" +
          "<td data-label=\"Zuletzt genutzt\">" + esc(k.last_used_at ? datum(k.last_used_at) : "noch nie") + "</td>" +
          "<td data-label=\"Status\">" + (k.is_active ? "<span class=\"ds-badge ds-badge--success\">Aktiv</span>" : "<span class=\"ds-badge ds-badge--neutral\">Widerrufen</span>") + "</td>" +
          "<td><div class=\"vw-aktionen\">" + aktionen + "</div></td></tr>";
      }).join("") + "</tbody></table>";
  }

  function zeichneWebhooks(items) {
    if (!items.length) {
      el("vwWebhookListe").innerHTML = leer(S.seite === "company"
        ? "Keine Webhooks eingerichtet. Benachrichtigungen an Slack, Teams oder eigene Systeme richten Sie unter Integrationen ein."
        : "Keine Webhooks eingerichtet.");
      return;
    }
    el("vwWebhookListe").innerHTML = "<table class=\"ds-table vw-table\"><thead><tr><th>Dienst</th><th>Bezeichnung</th><th>Ziel</th><th>Status</th><th>Zuletzt erfolgreich</th></tr></thead><tbody>" +
      items.map(function (w) {
        return "<tr><td data-label=\"Dienst\">" + esc(w.provider) + "</td><td data-label=\"Bezeichnung\">" + esc(w.label || "–") + "</td>" +
          "<td data-label=\"Ziel\"><code>" + esc(w.webhook_url_masked) + "</code></td>" +
          "<td data-label=\"Status\">" + (w.is_active ? "<span class=\"ds-badge ds-badge--success\">Aktiv</span>" : "<span class=\"ds-badge ds-badge--neutral\">Aus</span>") + "</td>" +
          "<td data-label=\"Zuletzt erfolgreich\">" + esc(w.last_success_at ? datum(w.last_success_at) : "–") + "</td></tr>";
      }).join("") + "</tbody></table>";
  }

  async function schluesselDialog() {
    var d = el("vwSchluesselDialog");
    el("vwSchluesselFormular").hidden = false;
    el("vwSchluesselErgebnis").hidden = true;
    el("vwSchluesselTitel").textContent = "Neuen API-Schlüssel erstellen";
    el("vwSchluesselName").value = "";
    el("vwSchluesselFehler").textContent = "";
    if (!S.scopes) {
      try { S.scopes = ((await TC.api.get("/org/api-keys/scopes")).data || {}).scopes || []; } catch (_e) { S.scopes = []; }
    }
    el("vwSchluesselScopes").innerHTML = S.scopes.length
      ? S.scopes.map(function (s) {
          var key = typeof s === "string" ? s : s.key;
          var text = typeof s === "string" ? s : (s.description || s.label || s.key);
          return "<label title=\"" + esc(key) + "\"><input type=\"checkbox\" value=\"" + esc(key) + "\"/> " + esc(text) + "</label>";
        }).join("")
      : "<span class=\"vw-muted\">Keine einzelnen Berechtigungen verfügbar.</span>";
    d.classList.add("show");
    el("vwSchluesselName").focus();
    applyOrgDomLocks(d);
  }

  function zeigeSchluessel(titel, wert) {
    el("vwSchluesselTitel").textContent = titel;
    el("vwSchluesselFormular").hidden = true;
    el("vwSchluesselErgebnis").hidden = false;
    el("vwSchluesselWert").textContent = wert;
    el("vwSchluesselKopieren").setAttribute("data-kopiere", wert);
    el("vwSchluesselKopieren").textContent = "Kopieren";
    el("vwSchluesselDialog").classList.add("show");
  }

  async function schluesselErstellen() {
    var knopf = el("vwSchluesselErstellen");
    var scopes = Array.prototype.map.call(document.querySelectorAll("#vwSchluesselScopes input:checked"), function (i) { return i.value; });
    knopf.disabled = true;
    try {
      var d = (await TC.api.post("/org/api-keys", { label: el("vwSchluesselName").value.trim(), scopes: scopes })).data || {};
      zeigeSchluessel("API-Schlüssel erstellt", d.key || "");
    } catch (e) {
      el("vwSchluesselFehler").textContent = fehlerText(e);
    } finally {
      knopf.disabled = false;
    }
  }

  function schluesselRotieren(id, name) {
    var neu = null;
    bestaetige({
      titel: "Schlüssel " + name + " erneuern?",
      punkte: [
        "Der bisherige Schlüssel wird sofort ungültig.",
        "Jedes System, das ihn nutzt, braucht danach den neuen — sonst bricht die Verbindung ab.",
        "Der neue Schlüssel wird einmal angezeigt."
      ],
      knopf: "Erneuern",
      aktion: function () {
        return TC.api.post("/org/api-keys/" + encodeURIComponent(id) + "/rotate").then(function (r) {
          neu = r && r.data && r.data.new_key ? r.data.new_key.key : null;
        });
      }
    }).then(function (ok) {
      if (!ok) return;
      ladeSchnittstellen(true); aktualisiereUebersicht();
      if (neu) zeigeSchluessel("Neuer Schlüssel für " + name, neu);
    });
  }

  function schluesselWiderrufen(id, name) {
    bestaetige({
      titel: "Schlüssel " + name + " widerrufen?",
      punkte: ["Systeme, die diesen Schlüssel nutzen, verlieren sofort den Zugang.", "Das lässt sich nicht rückgängig machen; Sie können aber jederzeit einen neuen erstellen."],
      knopf: "Widerrufen",
      aktion: function () { return TC.api.delete("/org/api-keys/" + encodeURIComponent(id)); }
    }).then(function (ok) { if (ok) { ladeSchnittstellen(true); aktualisiereUebersicht(); } });
  }

  function verdrahteSchnittstellen() {
    el("vwSchluesselNeu").addEventListener("click", schluesselDialog);
    el("vwSchluesselErstellen").addEventListener("click", schluesselErstellen);
    el("vwSchluesselAbbrechen").addEventListener("click", function () { el("vwSchluesselDialog").classList.remove("show"); });
    el("vwSchluesselFertig").addEventListener("click", function () {
      el("vwSchluesselDialog").classList.remove("show");
      ladeSchnittstellen(true); aktualisiereUebersicht();
    });
    el("panel-schnittstellen").addEventListener("click", function (e) {
      var t;
      if ((t = e.target.closest("[data-rotieren]"))) schluesselRotieren(t.getAttribute("data-rotieren"), t.getAttribute("data-name"));
      else if ((t = e.target.closest("[data-widerrufen]"))) schluesselWiderrufen(t.getAttribute("data-widerrufen"), t.getAttribute("data-name"));
    });
  }

  /* ── Tarif ─────────────────────────────────────────────────────────── */

  async function ladeTarif(neu) {
    if (S.geladen.tarif && !neu) return;
    var ziel = el("vwTarif");
    ziel.innerHTML = leer("Lade Nutzung …");
    var u;
    try { u = (await TC.api.get("/org/usage")).data || {}; }
    catch (e) { ziel.innerHTML = fehlerBlock("Die Nutzungsdaten konnten nicht geladen werden. " + fehlerText(e, ""), "tarif"); return; }
    var grenzen = u.plan_limits || {};
    var kachel = function (wert, text) { return "<div class=\"ds-kpi\"><span class=\"ds-kpi__value\">" + esc(wert) + "</span><span class=\"ds-kpi__label\">" + esc(text) + "</span></div>"; };
    var html = "<div class=\"ds-card\"><div class=\"vw-section-title\"><h2>Ihr Tarif und die Nutzung</h2>" +
      "<a class=\"ds-btn ds-btn--ghost ds-btn--sm\" href=\"/public/sla_abo.html\">Tarif ansehen oder wechseln</a></div>" +
      "<div class=\"ds-kpi-grid vw-kpis ds-mt-0\">" +
        kachel(grenzen.plan || (S.me && S.me.plan_display_label) || "–", "Tarif") +
        kachel(u.active_workers != null ? u.active_workers : "–", "Aktive Arbeitskräfte") +
        kachel(u.active_assignments != null ? u.active_assignments : "–", "Aktive Einsätze") +
        kachel(grenzen.hard_blocked ? "erreicht" : "nein", "Grenze erreicht") +
      "</div>";
    if (grenzen.warnings && grenzen.warnings.length) {
      html += "<div class=\"ds-alert ds-alert--warning\" role=\"status\"><strong>Hinweise zu Ihren Grenzen</strong><ul class=\"ds-mb-0\">" +
        grenzen.warnings.map(function (w) { return "<li>" + esc(w) + "</li>"; }).join("") + "</ul></div>";
    }
    html += "</div>";
    var snaps = u.monthly_snapshots || [];
    html += "<div class=\"ds-card\"><div class=\"vw-section-title\"><h2>Verlauf der letzten Monate</h2></div>" +
      (snaps.length
        ? "<table class=\"ds-table vw-table\"><thead><tr><th>Monat</th><th>Arbeitskräfte</th><th>Plätze</th><th>Stundenzettel</th><th>Tarif</th></tr></thead><tbody>" +
          snaps.map(function (s) {
            return "<tr><td data-label=\"Monat\">" + esc(s.snapshot_month) + "</td><td data-label=\"Arbeitskräfte\">" + esc(s.active_workers) +
              "</td><td data-label=\"Plätze\">" + esc(s.active_seats) + "</td><td data-label=\"Stundenzettel\">" + esc(s.submitted_ts || 0) +
              "</td><td data-label=\"Tarif\">" + esc(s.plan || "–") + "</td></tr>";
          }).join("") + "</tbody></table>"
        : leer("Noch keine Monatswerte. Sie entstehen zum Monatsende.")) + "</div>";
    html += "<div class=\"ds-card\"><div class=\"vw-section-title\"><h2>Finanzauszug</h2></div>" +
      "<p class=\"vw-muted ds-mt-0\">Ein prüffähiger Auszug Ihrer Abrechnungsdaten, zum Beispiel für die Buchhaltung.</p>" +
      "<div class=\"vw-aktionen vw-aktionen--links\">" +
      "<button class=\"ds-btn ds-btn--ghost\" type=\"button\" data-feature-key=\"basic_analytics\" data-finanz=\"csv\">Als CSV</button>" +
      "<button class=\"ds-btn ds-btn--ghost\" type=\"button\" data-feature-key=\"basic_analytics\" data-finanz=\"json\">Als JSON</button></div>" +
      "<div class=\"vw-feedback\" id=\"vwFinanzHinweis\" role=\"status\"></div></div>";
    ziel.innerHTML = html;
    S.geladen.tarif = true;
    applyOrgDomLocks(ziel);
  }

  async function finanzauszug(format) {
    var r = el("vwFinanzHinweis");
    rueckmeldung(r, "Auszug wird erstellt …");
    try {
      var antwort = await TC.api.request("/reporting/finance-truth/export?format=" + encodeURIComponent(format), { method: "GET", rawResponse: true });
      if (!antwort.ok) throw Object.assign(new Error(""), { status: antwort.status });
      var blob = format === "json"
        ? new Blob([JSON.stringify(await antwort.json(), null, 2)], { type: "application/json;charset=utf-8" })
        : await antwort.blob();
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "finanzauszug-" + tagVor(0) + "." + format;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
      rueckmeldung(r, "Auszug heruntergeladen.", "gut");
    } catch (e) {
      rueckmeldung(r, fehlerText(e, "Der Auszug hat nicht geklappt."), "schlecht");
    }
  }

  function verdrahteTarif() {
    el("vwTarif").addEventListener("click", function (e) {
      var t = e.target.closest("[data-finanz]");
      if (t && !t.disabled) finanzauszug(t.getAttribute("data-finanz"));
    });
  }

  /* ── Los ───────────────────────────────────────────────────────────── */

  function init() {
    verdrahteReiter();
    verdrahteTeam();
    verdrahteStandorte();
    verdrahteProtokoll();
    verdrahteSchnittstellen();
    verdrahteTarif();
    document.addEventListener("keydown", function (e) {
      // Escape schliesst nur das Formular. Steht der neue Schluessel schon im Dialog,
      // geht es nur ueber "Fertig" weiter — er wird nie wieder angezeigt.
      if (e.key === "Escape" && el("vwSchluesselDialog").classList.contains("show") && el("vwSchluesselErgebnis").hidden) {
        el("vwSchluesselDialog").classList.remove("show");
      }
    });
    applyOrgDomLocks(document);
    start();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
