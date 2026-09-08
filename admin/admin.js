/**
 * House Leila calendar admin.
 *
 * Select a date or drag across a range, then set availability, nightly price
 * and minimum stay for the whole selection. Season rates underneath give the
 * defaults; a date only appears in `days` when it differs from its season.
 *
 * Reads the pricing rules from calendar-core.js so the owner and the guest are
 * always looking at the same numbers.
 */
(function () {
  'use strict';

  var C = window.LeilaCal;
  var API = '/api/admin.php';

  var el = {
    signin: document.querySelector('[data-signin]'),
    signinForm: document.querySelector('[data-signin-form]'),
    signinError: document.querySelector('[data-signin-error]'),
    app: document.querySelector('[data-app]'),
    status: document.querySelector('[data-status]'),
    save: document.querySelector('[data-save]'),
    logout: document.querySelector('[data-logout]'),
    months: document.querySelector('[data-months]'),
    monthLabel: document.querySelector('[data-month-label]'),
    prev: document.querySelector('[data-prev]'),
    next: document.querySelector('[data-next]'),
    seasons: document.querySelector('[data-seasons]'),
    seasonsGrid: document.querySelector('[data-seasons-grid]'),
    seasonsToggle: document.querySelector('[data-seasons-toggle]'),
    panel: document.querySelector('[data-panel]'),
    panelRange: document.querySelector('[data-panel-range]'),
    panelDerived: document.querySelector('[data-panel-derived]'),
    price: document.querySelector('[data-price]'),
    min: document.querySelector('[data-min]'),
    apply: document.querySelector('[data-apply]'),
    reset: document.querySelector('[data-reset]')
  };

  var data = null;      // the calendar being edited
  var csrf = null;
  var dirty = false;
  var cursor = new Date();
  cursor = new Date(cursor.getFullYear(), cursor.getMonth(), 1);

  var selStart = null;  // "YYYY-MM-DD"
  var selEnd = null;
  var dragging = false;
  var pendingStatus = null;   // set by the availability toggle before Apply

  /* --- api ---------------------------------------------------------------- */

  function call(action, body) {
    return fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ action: action }, body || {}))
    }).then(function (r) {
      return r.text().then(function (t) {
        var json = null;
        try { json = JSON.parse(t); } catch (e) { /* not our handler */ }
        if (!json) throw new Error('The server did not answer as expected. Is PHP running?');
        if (!r.ok || json.ok === false) throw new Error(json.error || 'Request failed');
        return json;
      });
    });
  }

  /* --- selection ---------------------------------------------------------- */

  function selectedKeys() {
    if (!selStart) return [];
    var a = C.parse(selStart), b = C.parse(selEnd || selStart);
    if (b < a) { var t = a; a = b; b = t; }
    var out = [];
    for (var d = a; d <= b; d = C.addDays(d, 1)) out.push(C.key(d));
    return out;
  }

  function setSelection(from, to) {
    selStart = from;
    selEnd = to;
    pendingStatus = null;
    render();
    openPanel();
  }

  /* --- rendering ---------------------------------------------------------- */

  function monthHtml(offset) {
    var d = new Date(cursor.getFullYear(), cursor.getMonth() + offset, 1);
    var y = d.getFullYear(), m = d.getMonth();
    var days = new Date(y, m + 1, 0).getDate();
    var lead = (new Date(y, m, 1).getDay() + 6) % 7;
    var sel = selectedKeys();

    var cells = '';
    for (var p = 0; p < lead; p++) cells += '<div class="d d--pad"></div>';

    for (var n = 1; n <= days; n++) {
      var date = new Date(y, m, n);
      var info = C.dayInfo(data, date);
      var cls = 'd' + (info.booked ? ' d--booked' : ' d--free');
      if (info.past) cls += ' d--past';
      if (info.hasOverride && !info.booked) cls += ' d--custom';
      if (sel.indexOf(info.key) !== -1) cls += ' is-sel';

      cells += '<button type="button" class="' + cls + '" data-day="' + info.key + '">' +
        '<span class="d__n">' + n + '</span>' +
        '<span class="d__p">' + (info.price != null ? C.money(info.price, data.currency) : '&middot;') + '</span>' +
        (info.minNights > 1 ? '<span class="d__m">' + info.minNights + 'n</span>' : '') +
        '</button>';
    }

    return '<div class="mo"><div class="mo__name">' + C.MONTHS[m] + ' ' + y + '</div>' +
      '<div class="mo__dow">' + ['M', 'T', 'W', 'T', 'F', 'S', 'S']
        .map(function (x) { return '<span>' + x + '</span>'; }).join('') + '</div>' +
      '<div class="mo__grid">' + cells + '</div></div>';
  }

  function render() {
    if (!data) return;
    el.months.innerHTML = monthHtml(0) + monthHtml(1);
    var end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    el.monthLabel.textContent = C.MONTHS[cursor.getMonth()] + ' to ' +
      C.MONTHS[end.getMonth()] + ' ' + end.getFullYear();
    el.save.disabled = !dirty;
    el.status.textContent = dirty
      ? 'Unsaved changes'
      : 'Saved ' + String(data.updated || '').slice(0, 10);
    el.status.className = 'bar__status' + (dirty ? ' is-dirty' : '');
  }

  function renderSeasons() {
    el.seasonsGrid.innerHTML = (data.seasons || []).map(function (s, i) {
      return '<div class="season" data-season="' + i + '">' +
        '<input class="season__name" value="' + s.name.replace(/"/g, '&quot;') + '" data-f="name" aria-label="Season name">' +
        '<div class="season__dates">' +
          '<input value="' + s.from + '" data-f="from" aria-label="From, MM-DD" placeholder="MM-DD">' +
          '<span>to</span>' +
          '<input value="' + s.to + '" data-f="to" aria-label="To, MM-DD" placeholder="MM-DD">' +
        '</div>' +
        '<label class="season__num"><i>€</i><input type="number" min="0" step="5" value="' + s.price + '" data-f="price" aria-label="Price per night"></label>' +
        '<label class="season__num"><input type="number" min="1" max="60" value="' + s.minNights + '" data-f="minNights" aria-label="Minimum nights"><i>min nights</i></label>' +
      '</div>';
    }).join('');
  }

  /* --- the edit panel ------------------------------------------------------ */

  function openPanel() {
    var keys = selectedKeys();
    if (!keys.length) { el.panel.hidden = true; return; }
    el.panel.hidden = false;

    el.panelRange.textContent = keys.length === 1
      ? C.prettyDate(keys[0])
      : C.prettyDate(keys[0]) + ' to ' + C.prettyDate(keys[keys.length - 1]) + '  (' + keys.length + ' nights)';

    var prices = [], mins = [], blocked = 0;
    keys.forEach(function (k) {
      var info = C.dayInfo(data, C.parse(k));
      prices.push(info.price);
      mins.push(info.minNights);
      if (info.booked) blocked++;
    });
    var samePrice = prices.every(function (p) { return p === prices[0]; });
    var sameMin = mins.every(function (p) { return p === mins[0]; });

    el.price.value = samePrice && prices[0] != null ? prices[0] : '';
    el.price.placeholder = samePrice ? 'season default' : 'mixed';
    el.min.value = sameMin ? mins[0] : '';
    el.min.placeholder = sameMin ? 'season default' : 'mixed';

    var status = blocked === 0 ? 'available' : (blocked === keys.length ? 'booked' : null);
    paintToggle(pendingStatus || status);

    el.panelDerived.textContent = blocked && blocked < keys.length
      ? blocked + ' of these ' + keys.length + ' dates are blocked.'
      : (samePrice && prices[0] != null
          ? 'Currently ' + C.money(prices[0], data.currency) + ' a night.'
          : 'These dates have different prices.');
  }

  function paintToggle(status) {
    document.querySelectorAll('[data-set-status]').forEach(function (b) {
      b.classList.toggle('is-on', b.getAttribute('data-set-status') === status);
    });
  }

  function applyToSelection() {
    var keys = selectedKeys();
    if (!keys.length) return;

    var priceRaw = el.price.value.trim();
    var minRaw = el.min.value.trim();

    keys.forEach(function (k) {
      var row = Object.assign({}, data.days[k] || {});

      if (pendingStatus === 'booked') row.status = 'booked';
      else if (pendingStatus === 'available') delete row.status;

      if (priceRaw !== '') row.price = Math.max(0, Math.round(Number(priceRaw)));
      if (minRaw !== '') row.minNights = Math.max(1, Math.min(60, Math.round(Number(minRaw))));

      // Drop anything matching the season default so the file stays small and
      // a later season change still flows through to these dates.
      var season = C.seasonFor(data, C.parse(k));
      if (season) {
        if (row.price === Number(season.price)) delete row.price;
        if (row.minNights === Number(season.minNights)) delete row.minNights;
      }

      if (Object.keys(row).length) data.days[k] = row;
      else delete data.days[k];
    });

    dirty = true;
    pendingStatus = null;
    render();
    openPanel();
  }

  function resetSelection() {
    selectedKeys().forEach(function (k) { delete data.days[k]; });
    dirty = true;
    pendingStatus = null;
    render();
    openPanel();
  }

  /* --- events -------------------------------------------------------------- */

  el.months.addEventListener('mousedown', function (e) {
    var cell = e.target.closest('[data-day]');
    if (!cell) return;
    e.preventDefault();
    dragging = true;
    setSelection(cell.getAttribute('data-day'), null);
  });

  el.months.addEventListener('mouseover', function (e) {
    if (!dragging) return;
    var cell = e.target.closest('[data-day]');
    if (!cell) return;
    selEnd = cell.getAttribute('data-day');
    render();
    openPanel();
  });

  document.addEventListener('mouseup', function () { dragging = false; });

  // Touch has no hover, so tapping a second date extends the range instead.
  el.months.addEventListener('click', function (e) {
    var cell = e.target.closest('[data-day]');
    if (!cell || !('ontouchstart' in window)) return;
    var k = cell.getAttribute('data-day');
    if (selStart && !selEnd && k !== selStart) { selEnd = k; render(); openPanel(); }
    else setSelection(k, null);
  });

  el.prev.addEventListener('click', function () {
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1);
    render();
  });
  el.next.addEventListener('click', function () {
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    render();
  });

  document.querySelectorAll('[data-set-status]').forEach(function (b) {
    b.addEventListener('click', function () {
      pendingStatus = b.getAttribute('data-set-status');
      paintToggle(pendingStatus);
    });
  });

  el.apply.addEventListener('click', applyToSelection);
  el.reset.addEventListener('click', resetSelection);
  document.querySelector('[data-panel-close]').addEventListener('click', function () {
    selStart = selEnd = null;
    el.panel.hidden = true;
    render();
  });

  el.seasonsToggle.addEventListener('click', function () {
    el.seasons.hidden = !el.seasons.hidden;
  });

  el.seasonsGrid.addEventListener('input', function (e) {
    var field = e.target.getAttribute('data-f');
    if (!field) return;
    var idx = Number(e.target.closest('[data-season]').getAttribute('data-season'));
    var value = e.target.value;
    data.seasons[idx][field] = (field === 'price' || field === 'minNights') ? Number(value) : value;
    dirty = true;
    render();
  });

  el.save.addEventListener('click', function () {
    el.save.disabled = true;
    el.status.textContent = 'Saving…';
    call('save', { calendar: data, csrf: csrf })
      .then(function (res) {
        data.updated = res.updated;
        dirty = false;
        render();
      })
      .catch(function (err) {
        el.status.textContent = err.message;
        el.status.className = 'bar__status is-error';
        el.save.disabled = false;
      });
  });

  el.logout.addEventListener('click', function () {
    if (dirty && !confirm('You have unsaved changes. Sign out anyway?')) return;
    call('logout').then(showSignIn);
  });

  window.addEventListener('beforeunload', function (e) {
    if (dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  el.signinForm.addEventListener('submit', function (e) {
    e.preventDefault();
    el.signinError.hidden = true;
    var pw = document.getElementById('pw');
    call('login', { password: pw.value })
      .then(function (res) { csrf = res.csrf; pw.value = ''; start(); })
      .catch(function (err) {
        el.signinError.textContent = err.message;
        el.signinError.hidden = false;
      });
  });

  /* --- boot ---------------------------------------------------------------- */

  function showSignIn() {
    el.app.hidden = true;
    el.signin.hidden = false;
    document.getElementById('pw').focus();
  }

  function start() {
    el.signin.hidden = true;
    el.app.hidden = false;
    fetch('/assets/data/calendar.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (json) {
        data = json;
        if (!data.days) data.days = {};
        renderSeasons();
        render();
      })
      .catch(function () {
        el.status.textContent = 'Could not load the calendar file.';
        el.status.className = 'bar__status is-error';
      });
  }

  call('session')
    .then(function (res) {
      if (res.signedIn) { csrf = res.csrf; start(); }
      else showSignIn();
    })
    .catch(function (err) {
      el.signin.hidden = false;
      el.signinError.textContent = err.message;
      el.signinError.hidden = false;
    });
})();
