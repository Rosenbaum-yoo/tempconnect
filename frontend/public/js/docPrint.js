/**
 * docPrint.js — generische "Als PDF speichern"-Affordanz für serverseitig
 * gerenderte Dokumente (Konditionsblatt, Einsatzvereinbarung, …).
 *
 * CSP-konform: externes Script ('self'), KEIN Inline-Handler (helmet scriptSrc
 * erlaubt nur 'self'). Verdrahtet jeden [data-tc-print]-Button mit window.print().
 * Die Dokumente sind bereits @media-print-optimiert (A4, Wasserzeichen); der
 * Button selbst wird beim Druck via .tc-print-bar { display:none } ausgeblendet.
 *
 * Wiederverwendbar: jedes künftige Doc, das den Button + dieses Script einbindet,
 * ist damit als PDF (Browser „Als PDF speichern") downloadbar.
 */
(function () {
  "use strict";
  function wire() {
    var btns = document.querySelectorAll("[data-tc-print]");
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener("click", function () { window.print(); });
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wire);
  } else {
    wire();
  }
})();
