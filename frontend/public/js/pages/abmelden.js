/**
 * Produkt-Mails abbestellen (Owner-Entscheid 2026-10-01, § 7 Abs. 3 UWG).
 *
 * Geoeffnet aus dem Link in jeder Produkt-Mail: ?u=<Nutzerkennung>&t=<Signatur>.
 * Abbestellt wird erst nach dem Klick — Link-Vorschauen von Mailprogrammen und
 * Sicherheitsfiltern rufen die Seite auf, druecken aber keinen Knopf.
 * Ohne Anmeldung: wer widersprechen will, soll kein Passwort suchen muessen.
 */
(function () {
  "use strict";

  var params = new URLSearchParams(location.search);
  var u = params.get("u") || "";
  var t = params.get("t") || "";
  var knopf = document.getElementById("abKnopf");
  var meldung = document.getElementById("abMeldung");

  function melde(text, art) {
    meldung.textContent = text;
    meldung.className = "ab-msg" + (art ? " ab-msg--" + art : "");
  }

  if (!u || !t) {
    knopf.disabled = true;
    melde("Dieser Link ist unvollständig. Bitte öffnen Sie ihn direkt aus der E-Mail.", "schlecht");
    return;
  }

  async function csrfToken() {
    var r = await fetch("/api/csrf", { credentials: "include" });
    var d = await r.json();
    return (d && d.token) || "";
  }

  knopf.addEventListener("click", async function () {
    knopf.disabled = true;
    melde("Wird abbestellt …");
    try {
      var token = await csrfToken();
      var r = await fetch("/api/product-releases/abmelden", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": token },
        body: JSON.stringify({ u: u, t: t })
      });
      var d = await r.json().catch(function () { return {}; });
      if (r.ok && d && d.success) {
        knopf.hidden = true;
        melde("Erledigt. Sie bekommen keine Produktneuheiten mehr per E-Mail.", "gut");
        return;
      }
      var text = (d && d.error && d.error.message) || "Das hat nicht geklappt. Bitte versuchen Sie es später noch einmal.";
      melde(text, "schlecht");
      knopf.disabled = r.status >= 500 ? false : true;
    } catch (e) {
      melde("Keine Verbindung. Bitte versuchen Sie es später noch einmal.", "schlecht");
      knopf.disabled = false;
    }
  });
})();
