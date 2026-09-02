/**
 * Das oeffentliche Schaufenster (M1.6) — Zahlen ohne Anmeldung.
 *
 * Ruft `/api/public/schaufenster`. KEIN `credentials: "include"` und kein
 * CSRF-Token: die Route ist bewusst ohne Konto lesbar, und ein Aufruf, der
 * eine Sitzung mitschickt, waere ein anderer Fall als der, den eine
 * Suchmaschine sieht. Wer hier eine Anmeldung braucht, hat das Schaufenster
 * missverstanden.
 *
 * Drei Zustaende, alle sichtbar: LAEDT, FEHLER, INHALT. Ein leeres Feld waere
 * von "der Markt ist leer" nicht zu unterscheiden — und das waere eine
 * falsche Aussage ueber den Markt, nicht ueber die Technik.
 */
"use strict";

(function () {
  var EL = function (id) { return document.getElementById(id); };

  /* Zeilen werden mit textContent gebaut, nie mit innerHTML: die Namen
     kommen aus der Datenbank. */

  function liste(zielId, gruppen, einheit) {
    var ziel = EL(zielId);
    if (!ziel) return;
    ziel.textContent = "";
    if (!gruppen || !gruppen.length) {
      var leer = document.createElement("div");
      leer.className = "sf-leer";
      leer.textContent = "Zurzeit nichts eingetragen.";
      ziel.appendChild(leer);
      return;
    }
    gruppen.forEach(function (g) {
      var w = document.createElement("span");
      w.className = "sf-zeile__wert";
      w.textContent = g.anzahl + " " + (g.anzahl === 1 ? einheit.eins : einheit.viele)
        + (g.koepfe ? " · " + g.koepfe + (g.koepfe === 1 ? " Kopf" : " Köpfe") : "");
      var d = document.createElement("div");
      d.className = "sf-zeile";
      var n = document.createElement("span");
      n.className = "sf-zeile__name";
      n.textContent = g.name;
      d.appendChild(n);
      d.appendChild(w);
      ziel.appendChild(d);
    });
  }

  function kachel(wert, text) {
    var k = document.createElement("div");
    k.className = "sf-kachel";
    var v = document.createElement("div");
    v.className = "sf-kachel__wert";
    v.textContent = String(wert);
    var t = document.createElement("div");
    t.className = "sf-kachel__text";
    t.textContent = text;
    k.appendChild(v);
    k.appendChild(t);
    return k;
  }

  function zahlen(zielId, menge, mengeText, koepfe) {
    var ziel = EL(zielId);
    if (!ziel) return;
    ziel.textContent = "";
    ziel.appendChild(kachel(menge, mengeText));
    ziel.appendChild(kachel(koepfe, "Köpfe insgesamt"));
  }

  function fehler() {
    if (EL("sfLaden")) EL("sfLaden").style.display = "none";
    if (EL("sfFehler")) EL("sfFehler").style.display = "block";
  }

  function zeigen(d) {
    if (!d || d.verfuegbar === false) return fehler();

    zahlen("sfKapZahlen", d.kapazitaet.anzeigen, "aktive Angebote", d.kapazitaet.koepfe);
    liste("sfKapRolle", d.kapazitaet.nach_rolle, { eins: "Anzeige", viele: "Anzeigen" });
    liste("sfKapOrt", d.kapazitaet.nach_ort, { eins: "Anzeige", viele: "Anzeigen" });

    zahlen("sfBedZahlen", d.bedarf.anfragen, "offene Anfragen", d.bedarf.koepfe);
    liste("sfBedRolle", d.bedarf.nach_rolle, { eins: "Anfrage", viele: "Anfragen" });
    liste("sfBedOrt", d.bedarf.nach_ort, { eins: "Anfrage", viele: "Anfragen" });

    var stand = EL("sfStand");
    if (stand) {
      var zeit = "";
      try { zeit = new Date(d.stand).toLocaleString("de-DE"); } catch (e) { zeit = ""; }
      /* Die Mindestgruppe wird GENANNT, nicht verschwiegen: eine Zahl, deren
         Zustandekommen der Leser nicht kennt, ist keine offene Zahl. */
      stand.textContent = "Stand: " + zeit
        + " · Gruppen mit weniger als " + (d.mindestgruppe || 3)
        + " Einträgen sind unter „Sonstige" + "“ zusammengefasst, damit sich keine"
        + " einzelne Anzeige zuordnen lässt.";
    }

    if (EL("sfLaden")) EL("sfLaden").style.display = "none";
    if (EL("sfInhalt")) EL("sfInhalt").style.display = "block";
  }

  function laden() {
    fetch("/api/public/schaufenster", { headers: { Accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status)); })
      .then(zeigen)
      .catch(fehler);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", laden);
  } else {
    laden();
  }
})();
