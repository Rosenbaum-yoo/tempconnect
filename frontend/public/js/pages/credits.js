/* ═══════════════════════════════════════════════════════
   Guthaben — Seitenlogik

   Drei Aufgaben in einer Seite:
     1. Stand und Verlauf des eigenen Guthabens zeigen
     2. Pakete kaufen — ueber Stripe, nie direkt (Befund P1-22)
     3. Die Rueckkehr von Stripe deuten (?payment=success / =cancelled)

   ZUR HERKUNFT: Bis zum 2026-08-21 schrieb `POST /credits/purchase` das Paket
   ohne jeden Bezahlschritt gut. Diese Seite ist die Aussenseite der Reparatur:
   sie schickt zu Stripe und wartet, statt selbst etwas zu behaupten. Nach der
   Rueckkehr wird der Stand NEU GELADEN statt hochgezaehlt — gutgeschrieben hat
   der Webhook, und nur die Datenbank weiss, ob er schon durch ist.
   ═══════════════════════════════════════════════════════ */

/* ── Woerterbuch (DE/EN) ────────────────────────────────────────────────────
   Bewusst NICHT uebersetzt:
   - Paketnamen (Starter/Business/Enterprise) — redaktionelle Daten aus
     /api/credits/packages
   - Buchungstexte (`description`) — sie kommen aus der Datenbank
   - Topbar/Navigation/Nutzerbereich (pageShell.js)                           */
TCi18n.register('de', {
  'gut.docTitle': 'Guthaben – TempConnect',
  'gut.hero.label': 'Guthaben',
  'gut.hero.title': 'Ihr Guthaben',
  'gut.hero.text': 'Guthaben sammeln Sie durch Praemien und Empfehlungen — oder Sie kaufen es dazu.',

  'gut.stand.label': 'Aktueller Stand',
  'gut.stand.einheit': 'Guthaben',
  'gut.stand.verdient': 'Insgesamt erhalten',
  'gut.stand.ausgegeben': 'Insgesamt ausgegeben',

  'gut.pakete.title': 'Guthaben kaufen',
  'gut.pakete.subtitle': 'Die Zahlung laeuft ueber Stripe. Gutgeschrieben wird erst, wenn die Zahlung dort bestaetigt ist.',
  'gut.pakete.bonus': 'Bonus',
  'gut.pakete.kaufen': 'Kaufen',
  'gut.pakete.laedt': 'Sie werden zu Stripe weitergeleitet …',
  'gut.pakete.leer': 'Zurzeit werden keine Guthabenpakete angeboten.',
  'gut.pakete.fehler': 'Die Pakete konnten nicht geladen werden.',
  'gut.pakete.jeGuthaben': 'je Guthaben',

  'gut.verlauf.title': 'Verlauf',
  'gut.verlauf.leer': 'Noch keine Buchungen. Sobald Sie Guthaben erhalten oder ausgeben, steht es hier.',
  'gut.verlauf.fehler': 'Der Verlauf konnte nicht geladen werden.',
  'gut.verlauf.datum': 'Datum',
  'gut.verlauf.vorgang': 'Vorgang',
  'gut.verlauf.menge': 'Menge',

  'gut.quelle.purchase': 'Kauf',
  'gut.quelle.bounty': 'Praemie',
  'gut.quelle.referral': 'Empfehlung',
  'gut.quelle.admin': 'Manuell',
  'gut.quelle.system': 'System',

  'gut.rueck.erfolg.title': 'Zahlung eingegangen',
  'gut.rueck.erfolg.text': 'Ihr Guthaben wird gutgeschrieben, sobald Stripe die Zahlung bestaetigt hat. Das dauert meist nur Sekunden — diese Seite aktualisiert sich selbst.',
  'gut.rueck.erfolg.warte': 'Warte auf die Bestaetigung …',
  'gut.rueck.erfolg.da': 'Gutgeschrieben.',
  'gut.rueck.erfolg.dauert': 'Die Bestaetigung steht noch aus. Sie muessen nichts tun — das Guthaben erscheint automatisch.',
  'gut.rueck.abbruch.title': 'Kauf abgebrochen',
  'gut.rueck.abbruch.text': 'Es wurde nichts abgebucht. Sie koennen den Kauf jederzeit erneut starten.',

  'gut.anmeldung.title': 'Nicht angemeldet',
  'gut.anmeldung.text': 'Melden Sie sich an, um Ihren Guthabenstand und den Verlauf zu sehen. Die Pakete koennen Sie auch so ansehen.',
  'gut.anmeldung.verlauf': 'Der Verlauf ist nach der Anmeldung sichtbar.',
  'gut.fehler.nichtEingerichtet': 'Der Guthabenkauf ist derzeit nicht verfuegbar, weil kein Zahlungsanbieter eingerichtet ist.',
  'gut.fehler.paketWeg': 'Dieses Paket wird nicht mehr angeboten.',
  'gut.fehler.allgemein': 'Der Kauf konnte nicht gestartet werden. Bitte versuchen Sie es erneut.',
  'gut.laden': 'Wird geladen …'
});

TCi18n.register('en', {
  'gut.docTitle': 'Credits – TempConnect',
  'gut.hero.label': 'Credits',
  'gut.hero.title': 'Your credits',
  'gut.hero.text': 'You earn credits through bounties and referrals — or you buy them.',

  'gut.stand.label': 'Current balance',
  'gut.stand.einheit': 'credits',
  'gut.stand.verdient': 'Received in total',
  'gut.stand.ausgegeben': 'Spent in total',

  'gut.pakete.title': 'Buy credits',
  'gut.pakete.subtitle': 'Payment runs through Stripe. Credits are added once the payment is confirmed there.',
  'gut.pakete.bonus': 'bonus',
  'gut.pakete.kaufen': 'Buy',
  'gut.pakete.laedt': 'Redirecting to Stripe …',
  'gut.pakete.leer': 'No credit packages are being offered right now.',
  'gut.pakete.fehler': 'The packages could not be loaded.',
  'gut.pakete.jeGuthaben': 'per credit',

  'gut.verlauf.title': 'History',
  'gut.verlauf.leer': 'No entries yet. Once you receive or spend credits, they appear here.',
  'gut.verlauf.fehler': 'The history could not be loaded.',
  'gut.verlauf.datum': 'Date',
  'gut.verlauf.vorgang': 'Entry',
  'gut.verlauf.menge': 'Amount',

  'gut.quelle.purchase': 'Purchase',
  'gut.quelle.bounty': 'Bounty',
  'gut.quelle.referral': 'Referral',
  'gut.quelle.admin': 'Manual',
  'gut.quelle.system': 'System',

  'gut.rueck.erfolg.title': 'Payment received',
  'gut.rueck.erfolg.text': 'Your credits are added as soon as Stripe confirms the payment. This usually takes seconds — this page refreshes itself.',
  'gut.rueck.erfolg.warte': 'Waiting for confirmation …',
  'gut.rueck.erfolg.da': 'Credited.',
  'gut.rueck.erfolg.dauert': 'The confirmation is still pending. Nothing to do — the credits appear automatically.',
  'gut.rueck.abbruch.title': 'Purchase cancelled',
  'gut.rueck.abbruch.text': 'Nothing was charged. You can start the purchase again at any time.',

  'gut.anmeldung.title': 'Not signed in',
  'gut.anmeldung.text': 'Sign in to see your balance and history. You can browse the packages either way.',
  'gut.anmeldung.verlauf': 'The history becomes visible after signing in.',
  'gut.fehler.nichtEingerichtet': 'Buying credits is unavailable because no payment provider is configured.',
  'gut.fehler.paketWeg': 'This package is no longer offered.',
  'gut.fehler.allgemein': 'The purchase could not be started. Please try again.',
  'gut.laden': 'Loading …'
});

(function () {
  'use strict';

  var t = function (k) { return TCi18n.t(k); };
  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }
  function $(id) { return document.getElementById(id); }

  /** Zahl mit deutschem Tausenderpunkt, sprachabhaengig. */
  function zahl(n) {
    var wert = Number(n);
    if (!isFinite(wert)) return '0';
    return wert.toLocaleString(TCi18n.dateLocale());
  }
  /* `TCDate` fuehrt bewusst nur Rechen-Helfer (isoDateDE, todayDE, …), keine
     Anzeigeformate. Die Anzeige gehoert deshalb hierher — und sie folgt der
     Sprachwahl, nicht der Zeitzone des Browsers. */
  function datum(wert) {
    if (!wert) return '';
    var d = new Date(wert);
    if (isNaN(d.getTime())) return String(wert).slice(0, 10);
    return d.toLocaleDateString(TCi18n.dateLocale(), {
      day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin'
    });
  }

  function euro(cent) {
    var wert = Number(cent) / 100;
    if (!isFinite(wert)) return '';
    return wert.toLocaleString(TCi18n.dateLocale(), { style: 'currency', currency: 'EUR' });
  }

  function holen(pfad) {
    return fetch('/api' + pfad, { credentials: 'include' })
      .then(function (r) {
        if (r.ok) return r.json();
        // 401 ist kein Ladefehler, sondern eine Aussage: hier fehlt die
        // Anmeldung. Wer beides gleich behandelt, schickt den Nutzer auf die
        // Suche nach einem Fehler, den es nicht gibt.
        var fehler = new Error(r.status === 401 ? 'ANMELDUNG' : 'LADEFEHLER');
        fehler.status = r.status;
        return Promise.reject(fehler);
      });
  }

  /* ── Stand ──────────────────────────────────────────────────────────────
     Es gibt keinen Ladezustand mit Platzhalterzahl: eine „0", die spaeter auf
     550 springt, ist eine Falschaussage fuer die Dauer des Ladens. Bis die
     Antwort da ist, steht ein Strich.                                       */
  var letzterStand = null;

  function standZeigen(konto) {
    letzterStand = Number(konto && konto.balance) || 0;
    $('standWert').textContent = zahl(letzterStand);
    $('standVerdient').textContent = zahl((konto && konto.lifetime_earned) || 0);
    $('standAusgegeben').textContent = zahl((konto && konto.lifetime_spent) || 0);
  }

  function standLaden() {
    return holen('/credits/balance').then(standZeigen).catch(function (err) {
      $('standWert').textContent = '–';
      if (err && err.message === 'ANMELDUNG') anmeldungNoetig();
    });
  }

  /* Ein Zustand, kein Fehler: die Seite ist da, die Anmeldung fehlt.
     KEINE "schon gemeldet"-Sperre: `meldung()` ersetzt den Inhalt, staffelt ihn
     also nicht. Eine Sperre haette die Meldung ausgerechnet dann verschluckt,
     wenn sie am noetigsten ist — `kaufStarten` blendet sie zu Beginn aus, und
     die Sperre haette danach jede Neuanzeige verhindert. Genau so passiert. */
  function anmeldungNoetig() {
    var box = $('standHinweis');
    box.textContent = t('gut.anmeldung.text');
    box.hidden = false;
  }

  /* ── Pakete ───────────────────────────────────────────────────────────── */

  function paketeZeichnen(pakete) {
    var ziel = $('paketGrid');
    if (!pakete || !pakete.length) {
      ziel.innerHTML = '<p class="leer">' + esc(t('gut.pakete.leer')) + '</p>';
      return;
    }
    ziel.innerHTML = pakete.map(function (p) {
      var bonus = Number(p.bonus_pct) || 0;
      var gesamt = Number(p.credits) + Math.floor(Number(p.credits) * bonus / 100);
      var preisCent = Math.round(Number(p.price_eur) * 100);
      var jeGuthaben = gesamt > 0 ? euro(preisCent / gesamt) : '';
      return '' +
        '<article class="paket' + (bonus ? ' paket-bonus' : '') + '">' +
          (bonus ? '<div class="paket-fahne">+' + esc(bonus) + '% ' + esc(t('gut.pakete.bonus')) + '</div>' : '') +
          '<h3 class="paket-name">' + esc(p.name) + '</h3>' +
          '<div class="paket-menge">' + esc(zahl(gesamt)) + '</div>' +
          '<div class="paket-einheit">' + esc(t('gut.stand.einheit')) + '</div>' +
          '<div class="paket-preis">' + esc(euro(preisCent)) + '</div>' +
          (jeGuthaben ? '<div class="paket-je">' + esc(jeGuthaben) + ' ' + esc(t('gut.pakete.jeGuthaben')) + '</div>' : '') +
          '<button class="ds-btn ds-btn-primary paket-kauf" data-paket="' + esc(p.id) + '">' +
            esc(t('gut.pakete.kaufen')) +
          '</button>' +
        '</article>';
    }).join('');

    // Handler NACH dem Zeichnen binden — sonst haengen sie an alten Knoten.
    Array.prototype.forEach.call(ziel.querySelectorAll('.paket-kauf'), function (btn) {
      btn.addEventListener('click', function () { kaufStarten(btn); });
    });
  }

  function paketeLaden() {
    var ziel = $('paketGrid');
    ziel.innerHTML = '<p class="leer">' + esc(t('gut.laden')) + '</p>';
    return holen('/credits/packages')
      .then(function (d) { paketeZeichnen(d && d.packages); })
      .catch(function () {
        ziel.innerHTML = '<p class="leer leer-fehler">' + esc(t('gut.pakete.fehler')) + '</p>';
      });
  }

  /* ── Kauf ─────────────────────────────────────────────────────────────────
     Diese Seite schreibt NICHTS gut. Sie holt eine Stripe-Sitzung und schickt
     den Browser dorthin. Alles Weitere entscheidet der Webhook.               */
  function kaufStarten(btn) {
    var paketId = btn.getAttribute('data-paket');
    var vorher = btn.textContent;
    btn.disabled = true;
    btn.textContent = t('gut.pakete.laedt');
    meldungAus();

    /* `window.TC` ist ein NAMENSRAUM (theme, api, shell, analytics,
       hubVisibility) — der Klient sitzt darin unter `api`. Zur Laufzeit
       geprueft; ein direkter `TC.post`-Aufruf laeuft in "is not a function". */
    TC.api.post('/credits/purchase', { package_id: paketId })
      .then(function (d) {
        if (d && d.redirect_url) {
          window.location.href = d.redirect_url;
          return;
        }
        throw new Error('NO_REDIRECT');
      })
      .catch(function (err) {
        btn.disabled = false;
        btn.textContent = vorher;
        var code = (err && err.code) || '';   // api.js:391 stempelt ihn dorthin
        if (err && err.status === 401) { anmeldungNoetig(); meldung('warn', t('gut.anmeldung.title'), t('gut.anmeldung.text')); }
        else if (code === 'PAYMENT_NOT_CONFIGURED') meldung('warn', t('gut.fehler.nichtEingerichtet'));
        else if (code === 'PACKAGE_NOT_FOUND') meldung('warn', t('gut.fehler.paketWeg'));
        else meldung('fehler', t('gut.fehler.allgemein'));
      });
  }

  /* ── Verlauf ──────────────────────────────────────────────────────────── */

  function quelleName(quelle) {
    var k = 'gut.quelle.' + String(quelle || 'system');
    var name = t(k);
    return name === k ? String(quelle || '') : name;   // unbekannte Quelle: Rohwert
  }

  /** Leer-/Fehlerzustand NEBEN der Tabelle zeigen, nicht an ihrer Stelle. */
  function verlaufZustand(text, fehler) {
    var box = $('verlaufLeer');
    box.className = 'leer' + (fehler ? ' leer-fehler' : '');
    box.textContent = text || '';
    box.hidden = !text;
    $('verlaufTabelle').hidden = !!text;
  }

  function verlaufZeichnen(zeilen) {
    var ziel = $('verlaufKoerper');
    if (!zeilen || !zeilen.length) {
      ziel.innerHTML = '';
      verlaufZustand(t('gut.verlauf.leer'), false);
      return;
    }
    verlaufZustand('', false);
    ziel.innerHTML = zeilen.map(function (z) {
      var menge = Number(z.amount) || 0;
      var raus = String(z.type) === 'spent' || String(z.type) === 'expired' || menge < 0;
      var betrag = (raus ? '−' : '+') + zahl(Math.abs(menge));
      return '' +
        '<tr>' +
          '<td class="verlauf-datum">' + esc(datum(z.created_at)) + '</td>' +
          '<td>' +
            '<span class="verlauf-quelle">' + esc(quelleName(z.source)) + '</span>' +
            (z.description ? '<span class="verlauf-text">' + esc(z.description) + '</span>' : '') +
          '</td>' +
          '<td class="verlauf-menge ' + (raus ? 'raus' : 'rein') + '">' + esc(betrag) + '</td>' +
        '</tr>';
    }).join('');
  }

  function verlaufLaden() {
    verlaufZustand(t('gut.laden'), false);
    return holen('/credits/transactions?limit=50')
      .then(function (d) { verlaufZeichnen(d && d.transactions); })
      .catch(function (err) {
        if (err && err.message === 'ANMELDUNG') {
          verlaufZustand(t('gut.anmeldung.verlauf'), false);
          anmeldungNoetig();
        } else {
          verlaufZustand(t('gut.verlauf.fehler'), true);
        }
      });
  }

  /* ── Meldungen ────────────────────────────────────────────────────────── */

  function meldung(art, text, zusatz) {
    var box = $('meldung');
    box.className = 'meldung meldung-' + art;
    box.innerHTML = '<strong>' + esc(text) + '</strong>' +
      (zusatz ? '<span class="meldung-zusatz">' + esc(zusatz) + '</span>' : '');
    box.hidden = false;
  }
  function meldungAus() { $('meldung').hidden = true; }

  /* ── Rueckkehr von Stripe ─────────────────────────────────────────────────
     Der Webhook braucht einen Moment. Statt eine Gutschrift zu BEHAUPTEN, wird
     der Stand mehrfach nachgeladen und die Meldung erst geaendert, wenn er
     wirklich gestiegen ist. Nach zehn Versuchen (rund 20 Sekunden) sagt die
     Seite ehrlich, dass es noch dauert — statt weiter zu drehen.              */
  function aufGutschriftWarten(standVorher) {
    var versuche = 0;
    var takt = setInterval(function () {
      versuche++;
      standLaden().then(function () {
        if (letzterStand > standVorher) {
          clearInterval(takt);
          meldung('erfolg', t('gut.rueck.erfolg.title'), t('gut.rueck.erfolg.da'));
          verlaufLaden();
        } else if (versuche >= 10) {
          clearInterval(takt);
          meldung('erfolg', t('gut.rueck.erfolg.title'), t('gut.rueck.erfolg.dauert'));
        }
      });
    }, 2000);
  }

  function rueckkehrDeuten() {
    var p = new URLSearchParams(window.location.search);
    var zustand = p.get('payment');
    if (zustand === 'cancelled') {
      meldung('warn', t('gut.rueck.abbruch.title'), t('gut.rueck.abbruch.text'));
    } else if (zustand === 'success') {
      meldung('erfolg', t('gut.rueck.erfolg.title'), t('gut.rueck.erfolg.warte'));
      // Der Stand VOR dem Warten ist die Vergleichsgroesse — deshalb erst
      // laden, dann beobachten.
      standLaden().then(function () { aufGutschriftWarten(letzterStand); });
    }
    if (zustand) {
      // Die Kennung nicht in der Adresszeile stehen lassen: ein Neuladen wuerde
      // sonst dieselbe Meldung erneut zeigen, obwohl nichts passiert ist.
      window.history.replaceState({}, '', window.location.pathname);
    }
  }

  function start() {
    document.title = t('gut.docTitle');
    standLaden();
    paketeLaden();
    verlaufLaden();
    rueckkehrDeuten();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  // Sprachwechsel: die gezeichneten Teile tragen ihre Texte im JS, nicht in
  // data-i18n — sie muessen deshalb neu gezeichnet werden.
  document.addEventListener('tc:langchange', function () {
    document.title = t('gut.docTitle');
    paketeLaden();
    verlaufLaden();
  });
})();
