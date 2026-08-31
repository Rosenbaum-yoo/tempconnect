/* ═══════════════════════════════════════════════════════
   Monatsplanung — der Monat als Fenster (Welle K3.3 / K3.4)

   DAS LEITBILD: der Monat ist die ANSICHT, der Einsatz die SACHE.
   Gemessen am 2026-08-31: 91 % der Einsaetze mit Enddatum ueberschreiten eine
   Monatsgrenze, 34 von 45 spannen drei Monate. Ein Raster, das den Monat als
   abgeschlossene Einheit behandelt, waere fuer neun von zehn Zeilen falsch —
   es muesste Einsaetze weglassen oder so darstellen, als begaennen sie am
   Ersten. Beides ist eine Unwahrheit ueber einen laufenden Einsatz.

   Deshalb wird hier ANGESCHNITTEN statt gekuerzt: ein Balken, der vor dem
   Monat begann, laeuft ohne linke Rundung aus dem Bild; einer ohne Enddatum
   traegt am rechten Rand den Vermerk "laeuft noch" (Owner-Entscheid E-K3-3).

   ZWEI SPUREN, KEIN PINGPONG (Plan-Abschnitt 3b): das Einsatzunternehmen legt
   BEDARF an, die Zeitarbeitsfirma BESETZUNG. Welche Spur diese Seite zeigt,
   entscheidet der Server anhand des Organisationstyps — nicht der Browser.

   KONFLIKTE SIND INFORMATION PLUS HEBEL, NIE EINE BITTE. Sie nennen, was
   kollidiert, und die Handlung, die auf der EIGENEN Seite loest. Es geht keine
   Aufforderung an die Gegenseite raus.
   ═══════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── Woerterbuch (DE/EN) ─────────────────────────────────────────────────
     Bewusst NICHT uebersetzt: Namen, Firmennamen, Rollen — alles, was aus der
     Datenbank kommt. */
  TCi18n.register('de', {
    'mp.docTitle': 'Monatsplanung – TempConnect',
    'mp.titel': 'Monatsplanung',
    'mp.leitsatz': 'Der Monat ist die Ansicht, der Einsatz ist die Sache. Was vorher begann, wird am Rand angeschnitten; was kein Ende hat, läuft weiter.',
    'mp.zurueck': '← Vormonat',
    'mp.vor': 'Folgemonat →',
    'mp.heute': 'Heute',
    'mp.laedt': 'Lade den Monat …',
    'mp.leer': 'In diesem Monat ist nichts geplant.',
    'mp.spur.kunde': 'Ihre Bedarfe und Einsätze',
    'mp.spur.agentur': 'Ihr Bestand',
    'mp.kpi.eintraege': 'Einsätze',
    'mp.kpi.vorher': 'begannen vorher',
    'mp.kpi.spaeter': 'laufen weiter',
    'mp.kpi.bedarfe': 'Bedarfe',
    'mp.kpi.hart': 'harte Konflikte',
    'mp.kpi.weich': 'offene Punkte',
    'mp.rand.laeuft_noch': 'läuft noch',
    'mp.rand.endet_spaeter': 'endet später',
    'mp.bedarf': 'Bedarf',
    'mp.unbesetzt': 'unbesetzt',
    'mp.fehler': 'Der Monat konnte nicht geladen werden.',
    'mp.anmelden': 'Bitte melden Sie sich an, um Ihre Monatsplanung zu sehen.',
    'mp.grenze': 'Die AÜG-Höchstdauer wird nur aus Überlassungen berechnet, die auf dieser Plattform stehen. Lief dieselbe Einsatzkraft zuvor über einen anderen Verleiher bei demselben Unternehmen, fehlt diese Zeit in der Rechnung — obwohl das Gesetz sie anrechnen würde.',

    'mp.k.doppelbelegung': 'Doppelbelegung',
    'mp.k.abwesenheit': 'Abwesenheit',
    'mp.k.aueg_frist': 'AÜG-Höchstdauer',
    'mp.k.bedarf_offen': 'Bedarf unbesetzt',
    'mp.k.nachweis_laeuft_ab': 'Nachweis läuft ab',

    'mp.hebel.doppelbelegung.agentur': 'Besetzen Sie einen der beiden Einsätze anders — ohne Rückfrage.',
    'mp.hebel.doppelbelegung.kunde': 'Fordern Sie für den Zeitraum eine andere Einsatzkraft an.',
    'mp.hebel.abwesenheit': 'Planen Sie für den Zeitraum eine Vertretung ein.',
    'mp.hebel.aueg_frist': 'Beenden Sie die Überlassung vor der Frist oder unterbrechen Sie sie um mehr als drei Monate.',
    'mp.hebel.bedarf_offen': 'Der Bedarf ist noch nicht besetzt — er wartet auf ein bestätigtes Angebot.',
    'mp.hebel.nachweis_laeuft_ab': 'Erneuern Sie den Nachweis vor dem Einsatztag.'
  });

  TCi18n.register('en', {
    'mp.docTitle': 'Monthly plan – TempConnect',
    'mp.titel': 'Monthly plan',
    'mp.leitsatz': 'The month is the view, the assignment is the thing. What started earlier is cut off at the edge; what has no end keeps running.',
    'mp.zurueck': '← Previous month',
    'mp.vor': 'Next month →',
    'mp.heute': 'Today',
    'mp.laedt': 'Loading the month …',
    'mp.leer': 'Nothing planned this month.',
    'mp.spur.kunde': 'Your demands and assignments',
    'mp.spur.agentur': 'Your roster',
    'mp.kpi.eintraege': 'Assignments',
    'mp.kpi.vorher': 'started earlier',
    'mp.kpi.spaeter': 'keep running',
    'mp.kpi.bedarfe': 'Demands',
    'mp.kpi.hart': 'hard conflicts',
    'mp.kpi.weich': 'open points',
    'mp.rand.laeuft_noch': 'still running',
    'mp.rand.endet_spaeter': 'ends later',
    'mp.bedarf': 'Demand',
    'mp.unbesetzt': 'unfilled',
    'mp.fehler': 'The month could not be loaded.',
    'mp.anmelden': 'Please sign in to see your monthly plan.',
    'mp.grenze': 'The AÜG maximum assignment period is calculated only from assignments recorded on this platform. If the same worker previously worked for the same company through another agency, that time is missing — although the law would count it.',

    'mp.k.doppelbelegung': 'Double booking',
    'mp.k.abwesenheit': 'Absence',
    'mp.k.aueg_frist': 'AÜG maximum period',
    'mp.k.bedarf_offen': 'Demand unfilled',
    'mp.k.nachweis_laeuft_ab': 'Certificate expiring',

    'mp.hebel.doppelbelegung.agentur': 'Staff one of the two assignments differently — no need to ask.',
    'mp.hebel.doppelbelegung.kunde': 'Request a different worker for that period.',
    'mp.hebel.abwesenheit': 'Plan a stand-in for that period.',
    'mp.hebel.aueg_frist': 'End the assignment before the deadline, or interrupt it for more than three months.',
    'mp.hebel.bedarf_offen': 'The demand is not filled yet — it is waiting for a confirmed offer.',
    'mp.hebel.nachweis_laeuft_ab': 'Renew the certificate before the assignment day.'
  });

  var t = function (k) { return TCi18n.t(k); };

  /* ── Werkzeug ────────────────────────────────────────────────────────── */

  function el(id) { return document.getElementById(id); }
  function zeig(node, an) { if (node) node.classList.toggle('mp-tot', !an); }

  /** Jeder Wert aus der Datenbank geht escaped ins Markup — ohne Ausnahme. */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /**
   * Kalendertag aus einem beliebigen Wert — ohne Zeitzonen-Rutsch.
   *
   * DAS SCHNEIDEN IST HIER SICHER, WEIL DER SERVER SCHON EINEN TAG LIEFERT.
   * `api/db/typeParsers.js` reicht DATE-Spalten unveraendert als "2026-03-11"
   * durch, geladen ueber `api/db/pool.js`; `pg` haelt Typparser prozessweit.
   * Kaeme stattdessen ein Zeitstempel ("2026-03-10T23:00:00.000Z" — lokale
   * Mitternacht Berlin ist 22:00/23:00 UTC des VORTAGS), zeigte dieser Schnitt
   * ganzjaehrig den falschen Tag.
   *
   * Hier NICHTS nachbauen. Eine Umrechnung an dieser Stelle waere eine zweite
   * Mechanik fuer dieselbe Zusage, und beim naechsten Umbau zieht jemand nur
   * eine von beiden nach. Die Zusage bewacht `api/test/kalendertagDE.test.js`.
   */
  function tag(wert) {
    if (!wert) return null;
    return String(wert).slice(0, 10);
  }

  function tagImMonat(datum, fenster) {
    var d = tag(datum);
    if (!d) return null;
    if (d < fenster.von) return 1;
    if (d > fenster.bis) return fenster.tage;
    return Number(d.slice(8, 10));
  }

  function monatsname(monat) {
    var teile = String(monat).split('-');
    var d = new Date(Date.UTC(Number(teile[0]), Number(teile[1]) - 1, 1));
    return d.toLocaleDateString(TCi18n.lang === 'en' ? 'en-GB' : 'de-DE',
      { month: 'long', year: 'numeric', timeZone: 'UTC' });
  }

  function datumKurz(wert) {
    var d = tag(wert);
    if (!d) return '';
    return d.slice(8, 10) + '.' + d.slice(5, 7) + '.';
  }

  /* ── Zustand ─────────────────────────────────────────────────────────── */

  var monat = null;   // "YYYY-MM"; null = der laufende

  /* ── Laden ───────────────────────────────────────────────────────────── */

  function laden() {
    zeig(el('mpLaedt'), true);
    zeig(el('mpFehler'), false);

    var url = '/api/v1/workforce/monatsplan' + (monat ? '?monat=' + encodeURIComponent(monat) : '');
    fetch(url, { credentials: 'include' })
      .then(function (r) {
        if (r.status === 401) { throw new Error('AUTH'); }
        if (!r.ok) { throw new Error('HTTP_' + r.status); }
        return r.json();
      })
      .then(zeichnen)
      .catch(function (e) {
        zeig(el('mpLaedt'), false);
        zeig(el('mpRaster'), false);
        zeig(el('mpKpis'), false);
        zeig(el('mpKonflikte'), false);
        var box = el('mpFehler');
        box.textContent = e && e.message === 'AUTH' ? t('mp.anmelden') : t('mp.fehler');
        zeig(box, true);
      });
  }

  /* ── Zeichnen ────────────────────────────────────────────────────────── */

  function zeichnen(plan) {
    monat = plan.fenster.monat;
    zeig(el('mpLaedt'), false);

    el('mpMonat').textContent = monatsname(plan.fenster.monat);

    var spur = el('mpSpur');
    spur.textContent = t('mp.spur.' + plan.seite);
    spur.className = 'mp-spur mp-spur--' + (plan.seite === 'agentur' ? 'agentur' : 'kunde');
    zeig(spur, true);

    zeichneKpis(plan);
    zeichneRaster(plan);
    zeichneKonflikte(plan);

    // Die Grenze der AUEG-Rechnung steht dauerhaft dabei, nicht nur im Fehlerfall.
    var grenze = el('mpGrenze');
    grenze.textContent = t('mp.grenze');
    zeig(grenze, plan.aueg_nur_plattformdaten === true);
  }

  function zeichneKpis(plan) {
    var z = plan.zusammenfassung || {};
    var kacheln = [
      { wert: z.eintraege, label: t('mp.kpi.eintraege') },
      { wert: z.beginnt_vorher, label: t('mp.kpi.vorher') },
      { wert: z.endet_spaeter, label: t('mp.kpi.spaeter') }
    ];
    if (plan.seite === 'kunde') kacheln.push({ wert: z.bedarfe, label: t('mp.kpi.bedarfe') });
    kacheln.push({ wert: z.konflikte_hart, label: t('mp.kpi.hart'), art: 'hart' });
    kacheln.push({ wert: z.konflikte_weich, label: t('mp.kpi.weich'), art: 'weich' });

    el('mpKpis').innerHTML = kacheln.map(function (k) {
      return '<div class="mp-kpi' + (k.art ? ' mp-kpi--' + k.art : '') + '">'
        + '<div class="mp-kpi__val">' + esc(k.wert == null ? 0 : k.wert) + '</div>'
        + '<div class="mp-kpi__label">' + esc(k.label) + '</div></div>';
    }).join('');
    zeig(el('mpKpis'), true);
  }

  function zeichneRaster(plan) {
    var f = plan.fenster;
    var zeilen = (plan.eintraege || []).concat(
      (plan.bedarfe || []).map(function (b) { return Object.assign({}, b, { _bedarf: true }); })
    );

    if (!zeilen.length) {
      zeig(el('mpRaster'), false);
      zeig(el('mpLeer'), true);
      return;
    }
    zeig(el('mpLeer'), false);

    // Eine Spalte fuer den Zeilenkopf, dann ein Tag je Spalte.
    var spalten = '220px repeat(' + f.tage + ', 1fr)';
    var teile = [];

    // Tagesleiste
    var kopf = ['<div class="mp-tage" style="grid-template-columns:' + spalten + '">',
      '<div class="mp-tag"></div>'];
    for (var d = 1; d <= f.tage; d++) {
      var iso = f.von.slice(0, 8) + String(d).padStart(2, '0');
      var wt = new Date(iso + 'T00:00:00Z').getUTCDay();
      kopf.push('<div class="mp-tag' + (wt === 0 || wt === 6 ? ' mp-tag--we' : '') + '">' + d + '</div>');
    }
    kopf.push('</div>');
    teile.push(kopf.join(''));

    zeilen.forEach(function (z) {
      var von = tagImMonat(z.start_date, f) || 1;
      var bis = z.offen || z.endet_spaeter
        ? f.tage
        : (tagImMonat(z.planned_end_date || z.actual_end_date || z.end_date, f) || f.tage);
      if (bis < von) bis = von;

      var breite = (bis - von + 1);
      var links = ((von - 1) / f.tage) * 100;
      var weite = (breite / f.tage) * 100;

      var titel, unter, klasse;
      if (z._bedarf) {
        klasse = 'mp-balken--bedarf';
        titel = z.title || z.role || t('mp.bedarf');
        unter = (z.headcount ? z.headcount + '× ' : '') + (z.besetzt ? '' : t('mp.unbesetzt'));
      } else {
        klasse = 'mp-balken--besetzung';
        var kraefte = (z.kraefte || []).map(function (k) { return k.name; }).filter(Boolean);
        titel = kraefte.length ? kraefte.join(', ') : (plan.seite === 'agentur' ? z.kunde_name : z.lieferant_name) || '—';
        unter = (plan.seite === 'agentur' ? z.kunde_name : z.lieferant_name) || '';
      }

      // E-K3-3: bis zum Monatsrand, mit Vermerk. Der Vermerk kommt vom Server —
      // eine Flaeche, die ihn selbst erfindet, nennt ihn beim naechsten Mal anders.
      var randText = z.randvermerk ? t('mp.rand.' + z.randvermerk) : '';

      teile.push(
        '<div class="mp-zeile" style="grid-template-columns:' + spalten + '">'
        + '<div class="mp-zeile__kopf"><b>' + esc(titel) + '</b><span>' + esc(unter) + '</span></div>'
        + '<div class="mp-spurbahn" style="grid-column:2 / span ' + f.tage + '">'
        + '<div class="mp-balken ' + klasse
        + (z.beginnt_vorher ? ' mp-balken--vorher' : '')
        + ((z.offen || z.endet_spaeter) ? ' mp-balken--spaeter' : '')
        + '" style="left:' + links.toFixed(3) + '%;width:' + weite.toFixed(3) + '%"'
        + ' title="' + esc(datumKurz(z.start_date) + ' – '
            + (z.offen ? t('mp.rand.laeuft_noch') : datumKurz(z.planned_end_date || z.end_date))) + '">'
        + (z.beginnt_vorher ? '<span class="mp-rand">←</span>' : '')
        + '<span>' + esc(titel) + '</span>'
        + (randText ? '<span class="mp-rand">· ' + esc(randText) + ' →</span>' : '')
        + '</div></div></div>'
      );
    });

    el('mpGitter').innerHTML = teile.join('');
    zeig(el('mpRaster'), true);
  }

  function zeichneKonflikte(plan) {
    var box = el('mpKonflikte');
    var liste = plan.konflikte || [];
    if (!liste.length) { box.innerHTML = ''; zeig(box, false); return; }

    // Hart zuerst: was unmoeglich ist, steht ueber dem, was offen ist.
    var sortiert = liste.slice().sort(function (a, b) {
      if (a.grad === b.grad) return 0;
      return a.grad === 'hart' ? -1 : 1;
    });

    box.innerHTML = sortiert.map(function (k) {
      var hebelSchluessel = 'mp.hebel.' + k.art
        + (k.art === 'doppelbelegung' ? '.' + plan.seite : '');

      var zeitraum = k.von ? datumKurz(k.von) + (k.bis && k.bis !== k.von ? ' – ' + datumKurz(k.bis) : '') : '';
      var wer = k.kraft_name || k.titel || '';

      var zusatz = '';
      if (k.art === 'doppelbelegung' && k.gegenseite_org_name) {
        // Nur die Zeitarbeitsfirma sieht die Gegenseite — der Server nimmt sie
        // der Kundenansicht weg, nicht diese Datei.
        zusatz = ' · ' + esc(k.gegenseite_org_name);
      } else if (k.hinweis) {
        zusatz = ' · ' + esc(k.hinweis);
      }
      if (k.art === 'aueg_frist' && k.ueberschreitung_am) {
        zusatz += ' · ' + esc(datumKurz(k.ueberschreitung_am))
          + (k.hoechstdauer_monate ? ' (' + esc(k.hoechstdauer_monate) + ' Monate)' : '');
      }

      return '<div class="mp-konflikt mp-konflikt--' + esc(k.grad) + '">'
        + '<div class="mp-konflikt__art">' + esc(t('mp.k.' + k.art) || k.art) + '</div>'
        + '<div>' + esc(wer) + (zeitraum ? ' · ' + esc(zeitraum) : '') + zusatz + '</div>'
        + '<div class="mp-konflikt__hebel">' + esc(t(hebelSchluessel)) + '</div>'
        + '</div>';
    }).join('');
    zeig(box, true);
  }

  /* ── Verdrahtung ─────────────────────────────────────────────────────── */

  function blaettern(richtung) {
    // Ohne geladenen Monat kein Sprung — sonst raet die Flaeche.
    var jetzt = monat;
    if (!jetzt) return;
    var jahr = Number(jetzt.slice(0, 4));
    var nr = Number(jetzt.slice(5, 7));
    var d = new Date(Date.UTC(jahr, nr - 1 + richtung, 1));
    monat = d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
    laden();
  }

  document.addEventListener('DOMContentLoaded', function () {
    el('mpZurueck').addEventListener('click', function () { blaettern(-1); });
    el('mpVor').addEventListener('click', function () { blaettern(1); });
    el('mpHeute').addEventListener('click', function () { monat = null; laden(); });
    laden();
  });
})();
