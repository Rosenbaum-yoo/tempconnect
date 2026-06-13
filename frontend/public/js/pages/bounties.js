/* ═══════════════════════════════════════════════════════
   Bounties & Rewards — Page Logic
   ═══════════════════════════════════════════════════════ */
  (function() {
    var PRICES = { DEMO: 0, BASIS: 150, PLUS: 499, PRO: 799, ENTERPRISE: 2499 };
    var STATUS_LABELS = { earned: 'Verdient', in_progress: 'In Arbeit', locked: 'Gesperrt' };
    var activeCategory = 'all';
    var bountyData = null;
    var userPlan = 'DEMO';

    function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    function fmtPrice(n) { return n.toLocaleString('de-DE') + ' EUR'; }
    function fmtDate(d) { if (!d) return ''; return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' }); }

    /* ── Fetch data ────────────────────────────────── */
    function init() {
      Promise.all([
        fetch('/api/bounties/me', { credentials: 'include' }).then(r => r.ok ? r.json() : null),
        fetch('/api/milestones/me', { credentials: 'include' }).then(r => r.ok ? r.json() : null),
        fetch('/api/me', { credentials: 'include' }).then(r => r.ok ? r.json() : null)
      ]).then(function(results) {
        bountyData = results[0];
        var milestones = results[1]?.milestones || [];
        var me = results[2];
        userPlan = me?.plan || 'DEMO';

        if (bountyData) {
          renderDiscount(bountyData.total_discount_pct, bountyData.max_discount_pct);
          renderBounties(bountyData.items);
          renderCalculator(bountyData.total_discount_pct);
        }
        renderMilestones(milestones);
      }).catch(function() {
        document.getElementById('bountyGrid').innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:var(--ds-space-6);color:var(--ds-text-tertiary)">Bounties konnten nicht geladen werden.</div>';
      });
    }

    /* ── Render Discount Hero ──────────────────────── */
    function renderDiscount(pct, max) {
      document.getElementById('discountValue').innerHTML = pct + '<span>%</span>';
      document.getElementById('discountBar').style.width = (pct / max * 100) + '%';
      document.getElementById('maxDiscount').textContent = max;
    }

    /* ── Render Bounties ───────────────────────────── */
    function renderBounties(items) {
      var grid = document.getElementById('bountyGrid');
      grid.innerHTML = '';
      var filtered = activeCategory === 'all' ? items : items.filter(function(b) { return b.category === activeCategory; });

      if (filtered.length === 0) {
        grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:var(--ds-space-6);color:var(--ds-text-tertiary)">Keine Bounties in dieser Kategorie.</div>';
        return;
      }

      filtered.forEach(function(b) {
        var card = document.createElement('div');
        card.className = 'bounty-card ' + b.status;

        var pct = Math.round(b.progress);
        var statusLabel = STATUS_LABELS[b.status] || b.status;
        if (b.status === 'earned' && b.earned_at) statusLabel += ' am ' + fmtDate(b.earned_at);

        card.innerHTML =
          '<div class="bounty-icon">' + b.icon + '</div>' +
          '<div class="bounty-body">' +
            '<div class="bounty-header">' +
              '<div class="bounty-name">' + esc(b.name_de) + '</div>' +
              '<div class="bounty-discount">-' + b.discount_pct + '%</div>' +
            '</div>' +
            '<div class="bounty-desc">' + esc(b.description_de) + '</div>' +
            '<div class="bounty-progress-bg"><div class="bounty-progress" style="width:' + pct + '%"></div></div>' +
            '<div class="bounty-status-row">' +
              '<span class="bounty-status">' + statusLabel + '</span>' +
              '<span class="bounty-pct">' + pct + '%</span>' +
            '</div>' +
            (b.is_recurring ? '<div class="bounty-recurring">&#128260; Wiederkehrend &mdash; verfaellt bei Nicht-Erfuellung</div>' : '') +
          '</div>';

        grid.appendChild(card);
      });
    }

    /* ── Render Milestones ─────────────────────────── */
    function renderMilestones(milestones) {
      var row = document.getElementById('milestoneRow');
      if (!milestones.length) {
        row.innerHTML = '<div class="no-milestones">Noch keine Meilensteine erreicht. Starten Sie mit Ihrem ersten Match!</div>';
        return;
      }
      row.innerHTML = '';
      milestones.forEach(function(m) {
        var badge = document.createElement('div');
        badge.className = 'milestone-badge';
        badge.innerHTML = '<span class="ms-icon">' + (m.icon || '🎯') + '</span>' +
          esc(m.milestone_label) +
          '<span class="ms-date">' + fmtDate(m.reached_at) + '</span>';
        row.appendChild(badge);
      });
    }

    /* ── Annual Plan Calculator ────────────────────── */
    function renderCalculator(discountPct) {
      var price = PRICES[userPlan];
      if (!price || price === 0) return;

      var card = document.getElementById('calcCard');
      card.style.display = 'block';

      var yearly12 = price * 12;
      var yearly10 = price * 10;
      var bountyDiscount = Math.round(yearly10 * (discountPct / 100));
      var total = yearly10 - bountyDiscount;
      var savings = yearly12 - total;

      document.getElementById('calcMonthly').textContent = fmtPrice(price);
      document.getElementById('calcYearly12').textContent = fmtPrice(yearly12);
      document.getElementById('calcYearly10').textContent = fmtPrice(yearly10);

      if (discountPct > 0) {
        document.getElementById('calcBountyRow').style.display = 'flex';
        document.getElementById('calcBountyPct').textContent = discountPct;
        document.getElementById('calcBountyAmount').textContent = '-' + fmtPrice(bountyDiscount);
      }

      document.getElementById('calcTotal').textContent = fmtPrice(total);
      document.getElementById('calcSavings').textContent = '-' + fmtPrice(savings) + ' (' + Math.round((savings / yearly12) * 100) + '%)';
    }

    /* ── Category Tabs ─────────────────────────────── */
    document.getElementById('catTabs').addEventListener('click', function(e) {
      var tab = e.target.closest('.cat-tab');
      if (!tab) return;
      document.querySelectorAll('.cat-tab').forEach(function(t) { t.classList.remove('active'); });
      tab.classList.add('active');
      activeCategory = tab.dataset.cat;
      if (bountyData) renderBounties(bountyData.items);
    });

    /* ── Render Tier Cards (from /api/bounties/tier) ──────── */
    function renderTiers(tierData) {
      if (!tierData || !tierData.tiers) return;
      var tierMap = { bronze: 'tierBronze', silver: 'tierSilver', gold: 'tierGold', platinum: 'tierPlatinum', diamond: 'tierDiamond' };
      tierData.tiers.forEach(function(t) {
        var el = document.getElementById(tierMap[t.key]);
        if (!el) return;
        if (t.is_current) {
          el.classList.remove('locked');
          el.classList.add('current');
          el.insertAdjacentHTML('afterbegin', '<div class="tier-badge-current">Aktuell</div>');
        } else if (t.qualified) {
          el.classList.remove('locked');
        }
        // Update checks
        if (t.checks) {
          var checksHtml = '';
          t.checks.forEach(function(c) {
            var icon = c.done ? '&#9745;' : '&#9723;';
            var cls = c.done ? 'done' : 'pending';
            var progress = c.done ? '' : ' (' + c.current + '/' + c.needed + ')';
            checksHtml += '<div class="' + cls + '">' + icon + ' ' + esc(c.label) + progress + '</div>';
          });
          var checksEl = el.querySelector('.tier-checks');
          if (checksEl) checksEl.innerHTML = checksHtml;
        }
      });
    }

    /* ── Fetch data ────────────────────────────────── */
    function _initBounties() {
      Promise.all([
        fetch('/api/bounties/me', { credentials: 'include' }).then(r => r.ok ? r.json() : null),
        fetch('/api/milestones/me', { credentials: 'include' }).then(r => r.ok ? r.json() : null),
        fetch('/api/me', { credentials: 'include' }).then(r => r.ok ? r.json() : null),
        fetch('/api/bounties/tier', { credentials: 'include' }).then(r => r.ok ? r.json() : null)
      ]).then(function(results) {
        bountyData = results[0];
        var milestones = results[1]?.milestones || [];
        var me = results[2];
        var tierData = results[3];
        userPlan = me?.plan || 'DEMO';

        if (bountyData) {
          renderDiscount(bountyData.total_discount_pct, bountyData.max_discount_pct);
          renderBounties(bountyData.items);
          renderCalculator(bountyData.total_discount_pct);
        }
        renderMilestones(milestones);
        renderTiers(tierData);
      }).catch(function() {
        document.getElementById('bountyGrid').innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:var(--ds-space-6);color:var(--ds-text-tertiary)">Bounties konnten nicht geladen werden.</div>';
      });
    }

    _initBounties();
  })();

  /* ── Referral-Programm Logic ───────────────────── */
  var refRating = 4;
  function loadReferralStatus() {
    function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    fetch('/api/referral/status', { credentials: 'include' }).then(function(r) { return r.ok ? r.json() : null; }).then(function(d) {
      if (!d) return;
      document.getElementById('refCode').textContent = d.referral_code || '---';
      document.getElementById('refRemaining').textContent = Math.max(0, d.referrals_remaining);

      if (d.is_pilot) {
        document.getElementById('refPilotBadge').style.display = 'inline';
        document.getElementById('refPilotInfo').style.display = 'block';
        document.getElementById('refFreeMonths').textContent = d.free_months_total;
        document.getElementById('refFreeRemaining').textContent = d.free_months_remaining;
      } else {
        document.getElementById('refCashbackInfo').style.display = 'block';
        document.getElementById('refCashbackEarned').textContent = d.cashback_months_earned;
        if (!d.is_pilot) document.getElementById('refBecomePilot').style.display = 'block';
      }

      // Referral-Liste
      if (d.referrals && d.referrals.length > 0) {
        document.getElementById('refList').style.display = 'block';
        var body = document.getElementById('refListBody');
        body.innerHTML = '';
        d.referrals.forEach(function(r) {
          var statusColor = r.status === 'active' ? 'var(--ds-success)' : r.status === 'registered' ? 'var(--ds-brand)' : 'var(--ds-text-tertiary)';
          var statusText = r.status === 'active' ? 'Aktiv (Umfrage erledigt)' : r.status === 'registered' ? 'Registriert (Umfrage ausstehend)' : r.status === 'pending' ? 'Eingeladen' : r.status;
          var el = document.createElement('div');
          el.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border:1px solid var(--ds-border);border-radius:8px;font-size:13px';
          el.innerHTML = '<span>' + esc(r.referred_email) + '</span><span style="font-weight:600;color:' + statusColor + ';font-size:12px">' + esc(statusText) + '</span>';
          body.appendChild(el);
        });
      }

      // Umfrage fuer geworbene Kunden
      if (d.referred_by && d.survey_status === 'pending') {
        document.getElementById('refSurveySection').style.display = 'block';
      }
    }).catch(function() {});
  }

  function copyRefLink() {
    var code = document.getElementById('refCode').textContent;
    var url = window.location.origin + '/?ref=' + code;
    navigator.clipboard.writeText(url).then(function() {
      var msg = document.getElementById('refCopyMsg');
      msg.style.display = 'block';
      setTimeout(function() { msg.style.display = 'none'; }, 3000);
    });
  }

  function sendRefInvite() {
    var email = document.getElementById('refInviteEmail').value.trim();
    if (!email) return;
    var msg = document.getElementById('refInviteMsg');
    fetch('/api/csrf', { credentials: 'include' }).then(function(r) { return r.ok ? r.json() : {}; }).then(function(csrf) {
    return fetch('/api/referral/invite', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf.token || '' }, body: JSON.stringify({ email: email }) }); })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (d.ok) {
          msg.style.display = 'block'; msg.style.color = 'var(--ds-success)'; msg.textContent = 'Einladung an ' + email + ' gesendet!';
          document.getElementById('refInviteEmail').value = '';
          loadReferralStatus();
        } else {
          msg.style.display = 'block'; msg.style.color = 'var(--ds-error,#ff6b6b)';
          msg.textContent = d.error === 'MAX_REFERRALS_REACHED' ? 'Maximum von 6 Einladungen erreicht.' : d.error === 'ALREADY_INVITED' ? 'Bereits eingeladen.' : 'Fehler: ' + (d.error || 'Unbekannt');
        }
        setTimeout(function() { msg.style.display = 'none'; }, 5000);
      });
  }

  function registerPilot() {
    fetch('/api/csrf', { credentials: 'include' }).then(function(r) { return r.ok ? r.json() : {}; }).then(function(csrf) {
    return fetch('/api/referral/register-pilot', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf.token || '' } }); })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (d.ok) { loadReferralStatus(); document.getElementById('refBecomePilot').style.display = 'none'; }
      });
  }

  // Star-Rating
  document.getElementById('refSurveyStars').addEventListener('click', function(e) {
    var star = e.target.closest('[data-star]');
    if (!star) return;
    refRating = parseInt(star.dataset.star);
    var spans = document.querySelectorAll('#refSurveyStars span');
    spans.forEach(function(s) { s.innerHTML = parseInt(s.dataset.star) <= refRating ? '&#9733;' : '&#9734;'; });
  });

  function submitRefSurvey() {
    var feedback = document.getElementById('refSurveyFeedback').value.trim();
    var howFound = document.getElementById('refSurveyHow').value.trim();
    var msg = document.getElementById('refSurveyMsg');
    fetch('/api/csrf', { credentials: 'include' }).then(function(r) { return r.ok ? r.json() : {}; }).then(function(csrf) {
    return fetch('/api/referral/survey', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf.token || '' }, body: JSON.stringify({ rating: refRating, feedback: feedback || null, how_found: howFound || null, would_recommend: true }) }); })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (d.ok) {
          msg.style.display = 'block'; msg.style.color = 'var(--ds-success)'; msg.textContent = 'Vielen Dank! Umfrage gespeichert. Ihr Empfehler erhaelt seinen Bonus.';
          document.getElementById('refSurveySection').style.display = 'none';
        } else {
          msg.style.display = 'block'; msg.style.color = 'var(--ds-error,#ff6b6b)'; msg.textContent = d.error === 'SURVEY_ALREADY_SUBMITTED' ? 'Umfrage wurde bereits eingereicht.' : 'Fehler.';
        }
      });
  }

  loadReferralStatus();