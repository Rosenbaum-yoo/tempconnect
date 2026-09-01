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

    'mp.achse.einsaetze': 'Einsätze',
    'mp.achse.mitarbeiter': 'Mitarbeiter',
    'mp.leer.mitarbeiter': 'Für diesen Monat sind keine Mitarbeiter hinterlegt.',
    'mp.kpi.mitarbeiter': 'Mitarbeiter',
    'mp.kpi.ganz_frei': 'ganzen Monat frei',
    'mp.kpi.teils_frei': 'teilweise frei',
    'mp.kpi.ganz_belegt': 'durchgehend belegt',
    'mp.ohne_konto': 'ohne Konto',
    'mp.frei_tage': '{n} Tage frei',
    'mp.frei_tag': '1 Tag frei',
    'mp.frei_keine': 'durchgehend belegt',
    'mp.auslastung': '{n} % belegt',
    'mp.abwesend': 'abwesend',
    'mp.pruef.knopf': 'Besetzung prüfen',
    'mp.pruef.titel': 'Wer kann auf diesen Einsatz?',
    'mp.pruef.sub': 'Die Prüfung zeigt, was bei einer Besetzung kollidieren würde. Sie legt nichts an — besetzt wird weiterhin über den gewohnten Weg.',
    'mp.pruef.schliessen': 'Schließen',
    'mp.pruef.laedt': 'Prüfe …',
    'mp.pruef.sauber': 'Kein Konflikt: {name} kann für diesen Zeitraum eingeplant werden.',
    'mp.pruef.fehler': 'Die Prüfung konnte nicht durchgeführt werden.',
    'mp.pruef.keine_kraefte': 'Für diesen Monat sind keine Mitarbeiter hinterlegt, die geprüft werden könnten.',
    'mp.pruef.nur_agentur': 'Diese Prüfung gibt es nur für Zeitarbeitsfirmen — sie betrifft die Besetzung mit eigenen Einsatzkräften.',
    'mp.aueg.durch': 'Diese Besetzung verursacht die Überschreitung.',
    'mp.aueg.vorher': 'Die Frist war schon vorher überschritten — nicht durch diese Besetzung.',
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

    'mp.achse.einsaetze': 'Assignments',
    'mp.achse.mitarbeiter': 'People',
    'mp.leer.mitarbeiter': 'No staff on record for this month.',
    'mp.kpi.mitarbeiter': 'people',
    'mp.kpi.ganz_frei': 'free all month',
    'mp.kpi.teils_frei': 'partly free',
    'mp.kpi.ganz_belegt': 'booked throughout',
    'mp.ohne_konto': 'no account',
    'mp.frei_tage': '{n} days free',
    'mp.frei_tag': '1 day free',
    'mp.frei_keine': 'booked throughout',
    'mp.auslastung': '{n} % booked',
    'mp.abwesend': 'absent',
    'mp.pruef.knopf': 'Check staffing',
    'mp.pruef.titel': 'Who can take this assignment?',
    'mp.pruef.sub': 'The check shows what a placement would collide with. It creates nothing — staffing still goes the usual way.',
    'mp.pruef.schliessen': 'Close',
    'mp.pruef.laedt': 'Checking …',
    'mp.pruef.sauber': 'No conflict: {name} can be scheduled for this period.',
    'mp.pruef.fehler': 'The check could not be carried out.',
    'mp.pruef.keine_kraefte': 'No staff on record for this month to check.',
    'mp.pruef.nur_agentur': 'This check exists for staffing agencies only — it concerns placing your own workers.',
    'mp.aueg.durch': 'This placement causes the limit to be exceeded.',
    'mp.aueg.vorher': 'The limit was already exceeded before — not by this placement.',
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
  var ansicht = 'einsaetze';   // 'einsaetze' | 'mitarbeiter'
  var letzterPlan = null;      // die zuletzt gezeichnete Antwort
  var belegschaft = null;      // Antwort des Mitarbeiter-Endpunkts, je Monat
  var pruefEinsatz = null;     // der Einsatz, fuer den gerade geprueft wird

  /** Platzhalter fuellen, ohne eine zweite Textquelle aufzumachen. */
  function tf(schluessel, werte) {
    var text = t(schluessel);
    Object.keys(werte || {}).forEach(function (k) {
      text = text.split('{' + k + '}').join(String(werte[k]));
    });
    return text;
  }

  /* ── Laden ───────────────────────────────────────────────────────────── */

  function laden() {
    zeig(el('mpLaedt'), true);
    zeig(el('mpFehler'), false);

    var pfad = ansicht === 'mitarbeiter'
      ? '/api/v1/workforce/monatsplan/mitarbeiter'
      : '/api/v1/workforce/monatsplan';
    var url = pfad + (monat ? '?monat=' + encodeURIComponent(monat) : '');
    fetch(url, { credentials: 'include' })
      .then(function (r) {
        if (r.status === 401) { throw new Error('AUTH'); }
        if (!r.ok) { throw new Error('HTTP_' + r.status); }
        return r.json();
      })
      .then(function (antwort) {
        if (ansicht === 'mitarbeiter') { belegschaft = antwort; zeichneBelegschaft(antwort); }
        else { zeichnen(antwort); }
      })
      .catch(function (e) {
        zeig(el('mpLaedt'), false);
        zeig(el('mpRaster'), false);
        zeig(el('mpKpis'), false);
        zeig(el('mpKonflikte'), false);
        zeig(el('mpLeer'), false);
        zeig(el('mpGrenze'), false);
        zeig(el('mpPruefung'), false);
        var box = el('mpFehler');
        box.textContent = e && e.message === 'AUTH' ? t('mp.anmelden') : t('mp.fehler');
        zeig(box, true);
      });
  }

  /* ── Zeichnen ────────────────────────────────────────────────────────── */

  function zeichnen(plan) {
    monat = plan.fenster.monat;
    letzterPlan = plan;
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
        + '<div class="mp-zeile__kopf"><b>' + esc(titel) + '</b><span>' + esc(unter) + '</span>'
        /* Nur die Agenturspur besetzt mit eigenen Kraeften — und nur ein echter
         * Einsatz, kein Bedarf. Ein Knopf, der nichts beantworten kann, waere
         * schlimmer als keiner. */
        + (plan.seite === 'agentur' && !z._bedarf
            ? '<button class="mp-pruef" type="button" data-einsatz="' + esc(z.id)
              + '" data-titel="' + esc(titel) + '">' + esc(t('mp.pruef.knopf')) + '</button>'
            : '')
        + '</div>'
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


  /* ── Der Monat je Mitarbeiter (K3.7) ──────────────────────────────────
     Das Einsatz-Raster zeigt die Minderheit: gemessen am 2026-08-31 erscheinen
     von 31 Mitarbeitern der Zeitarbeitsfirmen im April-Raster VIER. Der Rest hat
     in diesem Monat keinen Einsatz — und das sind genau die verplanbaren.
     Hier sind die Zeilen Menschen, und die FREIE Spanne ist der Inhalt. */

  function zeichneBelegschaft(plan) {
    monat = plan.fenster.monat;
    letzterPlan = null;
    zeig(el('mpLaedt'), false);
    zeig(el('mpKonflikte'), false);
    zeig(el('mpGrenze'), false);
    zeig(el('mpPruefung'), false);

    el('mpMonat').textContent = monatsname(plan.fenster.monat);

    var spur = el('mpSpur');
    spur.textContent = t('mp.spur.' + plan.seite);
    spur.className = 'mp-spur mp-spur--' + (plan.seite === 'agentur' ? 'agentur' : 'kunde');
    zeig(spur, true);

    var z = plan.zusammenfassung || {};
    el('mpKpis').innerHTML = [
      { wert: z.mitarbeiter, label: t('mp.kpi.mitarbeiter') },
      { wert: z.ganz_frei, label: t('mp.kpi.ganz_frei') },
      { wert: z.teilweise_frei, label: t('mp.kpi.teils_frei') },
      { wert: z.ganz_belegt, label: t('mp.kpi.ganz_belegt') }
    ].map(function (k) {
      return '<div class="mp-kpi"><div class="mp-kpi__val">' + esc(k.wert == null ? 0 : k.wert)
        + '</div><div class="mp-kpi__label">' + esc(k.label) + '</div></div>';
    }).join('');
    zeig(el('mpKpis'), true);

    var leute = plan.mitarbeiter || [];
    if (!leute.length) {
      zeig(el('mpRaster'), false);
      var leer = el('mpLeer');
      leer.textContent = t('mp.leer.mitarbeiter');
      zeig(leer, true);
      return;
    }
    zeig(el('mpLeer'), false);

    var f = plan.fenster;
    var spalten = '220px repeat(' + f.tage + ', 1fr)';
    var teile = [];

    var kopf = ['<div class="mp-tage" style="grid-template-columns:' + spalten + '">',
      '<div class="mp-tag"></div>'];
    for (var d = 1; d <= f.tage; d++) {
      var iso = f.von.slice(0, 8) + String(d).padStart(2, '0');
      var wt = new Date(iso + 'T00:00:00Z').getUTCDay();
      kopf.push('<div class="mp-tag' + (wt === 0 || wt === 6 ? ' mp-tag--we' : '') + '">' + d + '</div>');
    }
    kopf.push('</div>');
    teile.push(kopf.join(''));

    leute.forEach(function (m) {
      var balken = [];

      // Freie Spannen zuerst zeichnen, damit Belegungen darueber liegen.
      (m.frei || []).forEach(function (fr) {
        var lage = spanne(fr.von, fr.bis, f);
        balken.push('<div class="mp-frei" style="left:' + lage.links + '%;width:' + lage.weite + '%"'
          + ' title="' + esc(datumKurz(fr.von) + ' – ' + datumKurz(fr.bis)) + '">'
          + (lage.weiteZahl > 8 ? esc(fr.tage) : '') + '</div>');
      });

      (m.belegungen || []).forEach(function (b) {
        var lage = spanne(b.von, b.bis || f.bis, f);
        var randText = b.randvermerk ? t('mp.rand.' + b.randvermerk) : '';
        balken.push('<div class="mp-balken mp-balken--besetzung'
          + (b.beginnt_vorher ? ' mp-balken--vorher' : '')
          + (b.bis == null || b.randvermerk ? ' mp-balken--spaeter' : '')
          + '" style="left:' + lage.links + '%;width:' + lage.weite + '%"'
          + ' title="' + esc((b.entleiher_name || '') + ' · ' + datumKurz(b.von) + ' – '
              + (b.bis ? datumKurz(b.bis) : t('mp.rand.laeuft_noch'))) + '">'
          + (b.beginnt_vorher ? '<span class="mp-rand">←</span>' : '')
          + '<span>' + esc(b.entleiher_name || '') + '</span>'
          + (randText ? '<span class="mp-rand">· ' + esc(randText) + ' →</span>' : '')
          + '</div>');
      });

      (m.abwesenheiten || []).forEach(function (a) {
        var lage = spanne(a.von, a.bis || f.bis, f);
        // Die ART kommt nur der Agentur zu — der Server entscheidet das, nicht
        // diese Datei. Fehlt sie, steht hier das neutrale Wort.
        var text = a.art || t('mp.abwesend');
        balken.push('<div class="mp-balken mp-balken--abwesend"'
          + ' style="left:' + lage.links + '%;width:' + lage.weite + '%"'
          + ' title="' + esc(text + ' · ' + datumKurz(a.von)
              + (a.bis ? ' – ' + datumKurz(a.bis) : '')) + '">'
          + '<span>' + esc(text) + '</span></div>');
      });

      var freiText = m.freie_tage === 0 ? t('mp.frei_keine')
        : (m.freie_tage === 1 ? t('mp.frei_tag') : tf('mp.frei_tage', { n: m.freie_tage }));

      teile.push(
        '<div class="mp-zeile" style="grid-template-columns:' + spalten + '">'
        + '<div class="mp-zeile__kopf">'
        + '<b class="mp-kopf-name">' + esc(m.name || '—')
        + (m.ohne_konto ? '<span class="mp-nokonto">' + esc(t('mp.ohne_konto')) + '</span>' : '')
        + '</b>'
        /* "durchgehend belegt · 100 % belegt" sagt zweimal dasselbe — die
         * Prozentzahl traegt nur, solange sie etwas hinzufuegt. */
        + '<span>' + esc(freiText)
        + (m.freie_tage > 0
            ? ' · <span class="mp-last">' + esc(tf('mp.auslastung', { n: m.auslastung_prozent })) + '</span>'
            : '')
        + '</span></div>'
        + '<div class="mp-spurbahn" style="grid-column:2 / span ' + f.tage + '">'
        + balken.join('') + '</div></div>'
      );
    });

    el('mpGitter').innerHTML = teile.join('');
    zeig(el('mpRaster'), true);
  }

  /** Lage eines Zeitraums im Fenster, in Prozent der Monatsbreite. */
  function spanne(von, bis, f) {
    var a = tagImMonat(von, f) || 1;
    var b = tagImMonat(bis, f) || f.tage;
    if (b < a) b = a;
    var weite = ((b - a + 1) / f.tage) * 100;
    return {
      links: (((a - 1) / f.tage) * 100).toFixed(3),
      weite: weite.toFixed(3),
      weiteZahl: weite
    };
  }

  /* ── Besetzung pruefen — die Antwort VORHER (K3.5) ────────────────────
     Der Endpunkt liest nur. Besetzt wird weiterhin ueber den gewohnten Weg;
     eine zweite Schreibtuer daneben waere eine zweite Wahrheit. */

  function pruefungOeffnen(einsatzId, titel) {
    pruefEinsatz = { id: einsatzId, titel: titel };
    var panel = el('mpPruefung');
    el('mpPruefTitel').textContent = t('mp.pruef.titel');
    el('mpPruefSub').textContent = titel + ' — ' + t('mp.pruef.sub');
    el('mpPruefErgebnis').innerHTML = '';
    el('mpKandidaten').innerHTML = '';
    zeig(panel, true);
    panel.scrollIntoView({ block: 'nearest' });

    // Die Belegschaft desselben Monats — einmal geladen, dann wiederverwendet.
    if (belegschaft && belegschaft.fenster && belegschaft.fenster.monat === monat) {
      zeichneKandidaten(belegschaft);
      return;
    }
    el('mpKandidaten').innerHTML = '<div class="mp-leer">' + esc(t('mp.pruef.laedt')) + '</div>';
    fetch('/api/v1/workforce/monatsplan/mitarbeiter?monat=' + encodeURIComponent(monat),
      { credentials: 'include' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP_' + r.status); return r.json(); })
      .then(function (antwort) { belegschaft = antwort; zeichneKandidaten(antwort); })
      .catch(function () {
        el('mpKandidaten').innerHTML =
          '<div class="mp-fehler">' + esc(t('mp.pruef.fehler')) + '</div>';
      });
  }

  function zeichneKandidaten(plan) {
    var leute = (plan.mitarbeiter || []).filter(function (m) { return m.worker_user_id; });
    if (!leute.length) {
      el('mpKandidaten').innerHTML =
        '<div class="mp-leer">' + esc(t('mp.pruef.keine_kraefte')) + '</div>';
      return;
    }
    // Wer am meisten frei hat, steht oben — danach sucht eine Disposition.
    var sortiert = leute.slice().sort(function (a, b) { return b.freie_tage - a.freie_tage; });

    el('mpKandidaten').innerHTML = sortiert.map(function (m) {
      var freiText = m.freie_tage === 0 ? t('mp.frei_keine')
        : (m.freie_tage === 1 ? t('mp.frei_tag') : tf('mp.frei_tage', { n: m.freie_tage }));
      return '<button class="mp-kandidat" type="button" aria-pressed="false"'
        + ' data-kraft="' + esc(m.worker_user_id) + '" data-name="' + esc(m.name || '') + '">'
        + '<span>' + esc(m.name || '—') + '</span>'
        + '<span class="mp-kandidat__frei' + (m.freie_tage === 0 ? ' mp-kandidat__frei--keine' : '')
        + '">' + esc(freiText) + '</span></button>';
    }).join('');
  }

  function pruefen(workerUserId, name, knopf) {
    if (!pruefEinsatz) return;
    Array.prototype.forEach.call(
      el('mpKandidaten').querySelectorAll('.mp-kandidat'),
      function (b) { b.setAttribute('aria-pressed', b === knopf ? 'true' : 'false'); });

    var ziel = el('mpPruefErgebnis');
    ziel.innerHTML = '<div class="mp-leer">' + esc(t('mp.pruef.laedt')) + '</div>';

    var url = '/api/v1/workforce/monatsplan/vorschau'
      + '?assignment_id=' + encodeURIComponent(pruefEinsatz.id)
      + '&worker_user_id=' + encodeURIComponent(workerUserId);

    fetch(url, { credentials: 'include' })
      .then(function (r) {
        if (r.status === 400) return r.json().then(function (b) { throw new Error(b.error || 'HTTP_400'); });
        if (!r.ok) throw new Error('HTTP_' + r.status);
        return r.json();
      })
      .then(function (e) { zeichneVorschau(e, name, ziel); })
      .catch(function (err) {
        var text = err && err.message === 'NUR_AGENTURSPUR'
          ? t('mp.pruef.nur_agentur') : t('mp.pruef.fehler');
        ziel.innerHTML = '<div class="mp-fehler">' + esc(text) + '</div>';
      });
  }

  function zeichneVorschau(e, name, ziel) {
    var liste = e.konflikte || [];
    if (!liste.length) {
      // Kein Konflikt ist ein ERGEBNIS, keine leere Flaeche: leer waere von
      // "nicht geprueft" nicht zu unterscheiden.
      ziel.innerHTML = '<div class="mp-sauber">'
        + esc(tf('mp.pruef.sauber', { name: name || e.kraft_name || '' })) + '</div>';
      return;
    }
    var sortiert = liste.slice().sort(function (a, b) {
      if (a.grad === b.grad) return 0;
      return a.grad === 'hart' ? -1 : 1;
    });

    ziel.innerHTML = sortiert.map(function (k) {
      var zeitraum = k.von ? datumKurz(k.von)
        + (k.bis && k.bis !== k.von ? ' – ' + datumKurz(k.bis) : '') : '';
      var zusatz = '';
      if (k.art === 'doppelbelegung' && k.gegenseite_org_name) {
        zusatz = ' · ' + esc(k.gegenseite_org_name);
      }
      var hebel = t('mp.hebel.' + k.art + (k.art === 'doppelbelegung' ? '.agentur' : ''));
      // Verursacht DIESE Besetzung die Ueberschreitung — oder lag sie schon vor?
      if (k.art === 'aueg_hoechstdauer') {
        hebel = (k.durch_diese_besetzung ? t('mp.aueg.durch') : t('mp.aueg.vorher'))
          + ' ' + t('mp.hebel.aueg_frist');
      }
      var art = t('mp.k.' + (k.art === 'aueg_hoechstdauer' ? 'aueg_frist' : k.art)) || k.art;

      return '<div class="mp-konflikt mp-konflikt--' + esc(k.grad) + '">'
        + '<div class="mp-konflikt__art">' + esc(art) + '</div>'
        + '<div>' + esc(name || '') + (zeitraum ? ' · ' + esc(zeitraum) : '') + zusatz + '</div>'
        + '<div class="mp-konflikt__hebel">' + esc(hebel) + '</div></div>';
    }).join('');
  }

  function achseWechseln(neu) {
    if (ansicht === neu) return;
    ansicht = neu;
    el('mpAchseEinsaetze').setAttribute('aria-pressed', String(neu === 'einsaetze'));
    el('mpAchseMitarbeiter').setAttribute('aria-pressed', String(neu === 'mitarbeiter'));
    zeig(el('mpPruefung'), false);
    laden();
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

    el('mpAchseEinsaetze').addEventListener('click', function () { achseWechseln('einsaetze'); });
    el('mpAchseMitarbeiter').addEventListener('click', function () { achseWechseln('mitarbeiter'); });
    el('mpPruefZu').addEventListener('click', function () {
      pruefEinsatz = null;
      zeig(el('mpPruefung'), false);
    });

    /* Ein Zuhoerer am Behaelter statt einer je Zeile: das Raster wird bei jedem
     * Monatswechsel neu gebaut, und einzeln gebundene Zuhoerer waeren danach
     * entweder verloren oder doppelt. */
    el('mpGitter').addEventListener('click', function (ev) {
      var knopf = ev.target.closest && ev.target.closest('.mp-pruef');
      if (!knopf) return;
      pruefungOeffnen(knopf.getAttribute('data-einsatz'), knopf.getAttribute('data-titel'));
    });
    el('mpKandidaten').addEventListener('click', function (ev) {
      var knopf = ev.target.closest && ev.target.closest('.mp-kandidat');
      if (!knopf) return;
      pruefen(knopf.getAttribute('data-kraft'), knopf.getAttribute('data-name'), knopf);
    });

    laden();
  });
})();
