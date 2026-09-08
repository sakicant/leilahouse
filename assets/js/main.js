/* House Leila site behaviour. No dependencies, ~5 KB.
   Every block is guarded so one missing element can never break the rest. */
(function () {
  'use strict';

  /* --- footer year ------------------------------------------------------- */
  var yr = document.getElementById('yr');
  if (yr) yr.textContent = new Date().getFullYear();

  /* --- mobile nav -------------------------------------------------------- */
  var burger = document.querySelector('.burger');
  var mnav = document.getElementById('mobile-nav');
  if (burger && mnav) {
    burger.addEventListener('click', function () {
      var open = mnav.classList.toggle('is-open');
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    });
    mnav.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') {
        mnav.classList.remove('is-open');
        burger.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* --- gallery lightbox -------------------------------------------------- */
  var lb = document.getElementById('lightbox');
  if (lb) {
    var tiles = Array.prototype.slice.call(document.querySelectorAll('.gal__item[data-full]'));
    var img = lb.querySelector('img');
    var cap = lb.querySelector('.lb__cap');
    var i = 0;
    var lastFocus = null;

    function show(n) {
      i = (n + tiles.length) % tiles.length;
      var t = tiles[i];
      img.src = t.getAttribute('data-full');
      img.alt = t.getAttribute('data-cap') || '';
      cap.textContent = (i + 1) + ' / ' + tiles.length + ': ' + (t.getAttribute('data-cap') || '');
    }
    function open(n) {
      lastFocus = document.activeElement;
      show(n);
      lb.classList.add('is-open');
      document.body.style.overflow = 'hidden';
      lb.querySelector('.lb__close').focus();
    }
    function close() {
      lb.classList.remove('is-open');
      document.body.style.overflow = '';
      img.removeAttribute('src');
      if (lastFocus) lastFocus.focus();
    }

    tiles.forEach(function (t, n) {
      t.addEventListener('click', function () { open(n); });
    });
    lb.querySelector('.lb__close').addEventListener('click', close);
    lb.querySelector('.lb__prev').addEventListener('click', function () { show(i - 1); });
    lb.querySelector('.lb__next').addEventListener('click', function () { show(i + 1); });
    lb.addEventListener('click', function (e) { if (e.target === lb) close(); });
    document.addEventListener('keydown', function (e) {
      if (!lb.classList.contains('is-open')) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') show(i - 1);
      else if (e.key === 'ArrowRight') show(i + 1);
    });

    // Swipe on touch devices.
    var x0 = null;
    lb.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener('touchend', function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 55) show(dx < 0 ? i + 1 : i - 1);
      x0 = null;
    }, { passive: true });
  }

  /* --- availability calendar ---------------------------------------------
     Shows the nightly rate on every date, lets a guest pick an arrival and a
     departure, and hands the chosen dates to the inquiry form so nobody has to
     type them twice. Every pricing rule lives in calendar-core.js. */
  var calMonths = document.querySelector('[data-cal-months]');
  if (calMonths && window.LeilaCal) {
    var C = window.LeilaCal;
    var DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

    var rangeEl = document.querySelector('[data-cal-range]');
    var prevBtn = document.querySelector('[data-cal-prev]');
    var nextBtn = document.querySelector('[data-cal-next]');
    var updEl = document.querySelector('[data-cal-updated]');
    var summaryEl = document.querySelector('[data-cal-summary]');
    var ratesEl = document.querySelector('[data-cal-rates]');

    var data = null;
    var today = C.today();
    var firstMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    var cursor = new Date(firstMonth);
    var lastMonth = new Date(today.getFullYear() + 2, today.getMonth(), 1);
    var arrival = null;    // "YYYY-MM-DD"
    var departure = null;

    /** "1 June - 30 June" from the stored MM-DD pair. */
    function seasonDates(s) {
      function label(md) {
        var p = md.split('-');
        return Number(p[1]) + ' ' + C.MONTHS[Number(p[0]) - 1];
      }
      return label(s.from) + ' – ' + label(s.to);
    }

    function monthHtml(base, offset) {
      var d = new Date(base.getFullYear(), base.getMonth() + offset, 1);
      var y = d.getFullYear(), m = d.getMonth();
      var days = new Date(y, m + 1, 0).getDate();
      var lead = (new Date(y, m, 1).getDay() + 6) % 7;   // Monday-first

      var cells = '';
      for (var p = 0; p < lead; p++) cells += '<div class="cal-day cal-day--pad"></div>';

      for (var n = 1; n <= days; n++) {
        var date = new Date(y, m, n);
        var info = C.dayInfo(data, date);
        var cls = 'cal-day';
        var label;

        if (info.past) { cls += ' cal-day--past'; label = 'in the past'; }
        else if (info.booked) { cls += ' cal-day--booked'; label = 'booked'; }
        else { cls += ' cal-day--free'; label = 'available'; }

        // The departure day is not a night anyone pays for, so it reads as an
        // endpoint rather than part of the selected block.
        if (arrival && departure && info.key > arrival && info.key < departure) cls += ' cal-day--in-range';
        if (info.key === arrival) cls += ' cal-day--start';
        if (info.key === departure) cls += ' cal-day--end';
        if (date.getTime() === today.getTime()) cls += ' cal-day--today';

        var showPrice = info.price != null && !info.past && !info.booked;
        var price = showPrice
          ? '<span class="cal-day__price">' + C.money(info.price, data && data.currency) + '</span>'
          : '';
        var selectable = !info.past && (!info.booked || info.key === departure);

        cells += '<' + (selectable ? 'button type="button"' : 'div') +
          ' class="' + cls + '" data-day="' + info.key + '"' +
          (selectable ? '' : ' aria-disabled="true"') + '>' +
          '<span class="cal-day__n" aria-hidden="true">' + n + '</span>' + price +
          '<span class="sr-only">' + n + ' ' + C.MONTHS[m] + ' ' + y + ', ' + label +
          (showPrice ? ', ' + C.money(info.price, data && data.currency) + ' per night' : '') +
          '</span></' + (selectable ? 'button' : 'div') + '>';
      }

      return '<div class="cal-month"><div class="cal-month__name">' + C.MONTHS[m] + ' ' + y +
        '</div><div class="cal-grid" role="group" aria-label="' + C.MONTHS[m] + ' ' + y + '">' +
        DOW.map(function (x) { return '<div class="cal-dow" aria-hidden="true">' + x + '</div>'; }).join('') +
        cells + '</div></div>';
    }

    function renderSummary() {
      if (!summaryEl) return;

      if (!arrival) {
        summaryEl.className = 'cal-summary';
        summaryEl.innerHTML = '<p class="cal-summary__hint">Pick your arrival date, then your departure date, and the total appears here.</p>';
        return;
      }

      if (!departure) {
        summaryEl.className = 'cal-summary is-partial';
        summaryEl.innerHTML = '<p class="cal-summary__hint">Arriving <strong>' + C.prettyDate(arrival) +
          '</strong>. Now pick your departure date.</p>' +
          '<button class="cal-summary__clear" type="button" data-cal-clear>Clear</button>';
        return;
      }

      var q = C.quote(data, arrival, departure);
      if (!q.ok) {
        summaryEl.className = 'cal-summary is-error';
        summaryEl.innerHTML = '<p class="cal-summary__hint">' + q.message + '</p>' +
          '<button class="cal-summary__clear" type="button" data-cal-clear>Start again</button>';
        return;
      }

      var cur = data && data.currency;
      var spread = q.lowest === q.highest
        ? C.money(q.lowest, cur) + ' per night'
        : C.money(q.lowest, cur) + ' – ' + C.money(q.highest, cur) + ' per night';

      summaryEl.className = 'cal-summary is-ok';
      summaryEl.innerHTML =
        '<div class="cal-summary__main">' +
          '<p class="cal-summary__dates">' + C.prettyRange(q.arrival, q.departure) + '</p>' +
          '<p class="cal-summary__meta">' + q.nights + ' night' + (q.nights > 1 ? 's' : '') +
            ' · ' + spread + '</p>' +
        '</div>' +
        '<div class="cal-summary__total">' +
          '<span class="cal-summary__totallabel">Total</span>' +
          '<strong>' + C.money(q.total, cur) + '</strong>' +
        '</div>' +
        '<div class="cal-summary__actions">' +
          '<a class="btn btn--primary" href="/contact/?arrival=' + q.arrival +
            '&amp;departure=' + q.departure + '">Request these dates</a>' +
          '<button class="cal-summary__clear" type="button" data-cal-clear>Clear</button>' +
        '</div>';
    }

    function render() {
      calMonths.innerHTML = monthHtml(cursor, 0) + monthHtml(cursor, 1);
      var end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      if (rangeEl) {
        rangeEl.textContent = C.MONTHS[cursor.getMonth()] + ' – ' +
          C.MONTHS[end.getMonth()] + ' ' + end.getFullYear();
      }
      if (prevBtn) prevBtn.disabled = cursor <= firstMonth;
      if (nextBtn) nextBtn.disabled = cursor >= lastMonth;
      renderSummary();
    }

    function pick(k) {
      if (!arrival || departure) { arrival = k; departure = null; }
      else if (k === arrival) { arrival = null; departure = null; }
      else if (k < arrival) { arrival = k; departure = null; }
      else { departure = k; }
      render();
    }

    calMonths.addEventListener('click', function (e) {
      var cell = e.target.closest('[data-day]');
      if (!cell || cell.tagName !== 'BUTTON') return;
      pick(cell.getAttribute('data-day'));
    });

    document.addEventListener('click', function (e) {
      if (e.target.closest('[data-cal-clear]')) {
        arrival = null; departure = null; render();
      }
    });

    function step(n) {
      var next = new Date(cursor.getFullYear(), cursor.getMonth() + n, 1);
      if (next < firstMonth || next > lastMonth) return;
      cursor = next;
      render();
    }
    if (prevBtn) prevBtn.addEventListener('click', function () { step(-2); });
    if (nextBtn) nextBtn.addEventListener('click', function () { step(2); });

    /** Draw the seasonal rate cards from the same file the calendar reads, so
        the published price list cannot drift from what the admin panel set. */
    function renderRates() {
      if (!ratesEl || !data || !data.seasons || !data.seasons.length) return;
      var cur = data.currency;
      var peak = data.seasons.reduce(function (a, b) { return b.price > a.price ? b : a; }, data.seasons[0]);
      ratesEl.innerHTML = data.seasons.map(function (s) {
        return '<div class="rate' + (s.id === peak.id ? ' rate--peak' : '') + '">' +
          (s.id === peak.id ? '<span class="rate__tag">Busiest</span>' : '') +
          '<h3>' + s.name + '</h3>' +
          '<p class="rate__dates">' + seasonDates(s) + '</p>' +
          '<p class="rate__price">' + C.money(s.price, cur) + '<span> / night</span></p>' +
          '<p class="rate__min">Minimum ' + s.minNights + ' nights</p>' +
        '</div>';
      }).join('');
    }

    render();

    fetch('/assets/data/calendar.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (json) {
        data = json;
        render();
        renderRates();
        if (updEl) {
          updEl.textContent = 'Prices and availability updated ' +
            String(data.updated || '').slice(0, 10) +
            '. We confirm the exact dates when you send your request.';
        }
      })
      .catch(function () {
        if (updEl) {
          updEl.textContent = 'We could not load live availability just now. Please send us a message and we will confirm your dates.';
        }
      });
  }

  /* --- requested dates carried over from the calendar ----------------------
     The booking calendar links here with ?arrival=&departure=. Re-price them
     from the same file rather than trusting the URL, show the guest what they
     picked, and put a plain-text summary in a hidden field so the email says
     exactly what was quoted on screen. */
  var quoteCard = document.querySelector('[data-quote]');
  if (quoteCard && window.LeilaCal) {
    var Q = window.LeilaCal;
    var params = new URLSearchParams(location.search);
    var qArrival = params.get('arrival');
    var qDeparture = params.get('departure');
    var isDate = function (s) { return /^\d{4}-\d{2}-\d{2}$/.test(s || ''); };

    if (isDate(qArrival) && isDate(qDeparture)) {
      fetch('/assets/data/calendar.json', { cache: 'no-cache' })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
        .then(function (cal) {
          var q = Q.quote(cal, qArrival, qDeparture);
          var arriveField = document.getElementById('f-arrive');
          var departField = document.getElementById('f-depart');
          var hidden = document.querySelector('[data-quote-field]');
          var msgField = document.getElementById('f-msg');

          if (arriveField) arriveField.value = qArrival;
          if (departField) departField.value = qDeparture;

          if (!q.ok) {
            quoteCard.hidden = false;
            quoteCard.className = 'quote-card is-warn';
            quoteCard.innerHTML = '<p><strong>' + Q.prettyRange(qArrival, qDeparture) + '</strong></p>' +
              '<p>' + q.message + ' Send us the dates anyway and we will suggest the nearest we can do.</p>';
            if (hidden) hidden.value = 'Requested ' + qArrival + ' to ' + qDeparture + ' (not bookable as selected: ' + q.message + ')';
            return;
          }

          var cur = cal.currency;
          quoteCard.hidden = false;
          quoteCard.className = 'quote-card';
          quoteCard.innerHTML =
            '<p class="quote-card__label">Your dates</p>' +
            '<p class="quote-card__dates">' + Q.prettyRange(q.arrival, q.departure) + '</p>' +
            '<dl class="quote-card__rows">' +
              '<div><dt>Nights</dt><dd>' + q.nights + '</dd></div>' +
              '<div><dt>Rate</dt><dd>' + (q.lowest === q.highest
                ? Q.money(q.lowest, cur) + ' per night'
                : Q.money(q.lowest, cur) + ' – ' + Q.money(q.highest, cur) + ' per night') + '</dd></div>' +
              '<div class="is-total"><dt>Total</dt><dd>' + Q.money(q.total, cur) + '</dd></div>' +
            '</dl>' +
            '<p class="quote-card__note">Whole house, up to 6 guests. Includes utilities, air conditioning, Wi-Fi and the final clean. ' +
              '<a href="/book-now/">Change dates</a></p>';

          if (hidden) {
            hidden.value = Q.prettyRange(q.arrival, q.departure) + ' · ' + q.nights + ' nights · ' +
              Q.money(q.total, cur) + ' total (' + q.arrival + ' to ' + q.departure + ')';
          }
          if (msgField && !msgField.value) {
            msgField.placeholder = 'Anything else we should know? Number of guests, arrival time, questions about the house.';
          }
        })
        .catch(function () { /* the form still works without the quote */ });
    }
  }

  /* --- inquiry form ------------------------------------------------------- */
  var form = document.getElementById('inquiry');
  if (form) {
    var msg = form.querySelector('[data-form-msg]');
    var submit = form.querySelector('button[type="submit"]');

    function say(text, ok) {
      msg.textContent = text;
      msg.className = 'form__msg ' + (ok ? 'is-ok' : 'is-err');
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }

      submit.disabled = true;
      var original = submit.textContent;
      submit.textContent = 'Sending…';

      fetch(form.action, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: new FormData(form)
      })
        // Only an explicit {"ok":true} counts as sent. A 200 that is not our
        // JSON means the handler did not run (a host serving contact.php as a
        // static file, say), and it must never look like success to the guest.
        .then(function (r) {
          return r.text().then(function (text) {
            var data = null;
            try { data = JSON.parse(text); } catch (e) { /* not our handler */ }
            if (!r.ok || !data || data.ok !== true) throw new Error('send failed');
            return data;
          });
        })
        .then(function () {
          form.reset();
          say('Thank you, your inquiry is on its way. We usually reply within a few hours.', true);
        })
        .catch(function () {
          say('Sorry, the form could not be sent. Please email info@leilasibenik.com or message us on WhatsApp and we will get straight back to you.', false);
        })
        .finally(function () {
          submit.disabled = false;
          submit.textContent = original;
        });
    });

    // Departure can never precede arrival.
    var arrive = form.querySelector('#f-arrive');
    var depart = form.querySelector('#f-depart');
    if (arrive && depart) {
      var todayStr = new Date().toISOString().slice(0, 10);
      arrive.min = todayStr;
      depart.min = todayStr;
      arrive.addEventListener('change', function () {
        depart.min = arrive.value || todayStr;
        if (depart.value && depart.value < depart.min) depart.value = '';
      });
    }
  }

  /* --- reviews: load the third-party widget only when it scrolls into view - */
  var mount = document.querySelector('[data-reviews]');
  if (mount) {
    var reviewsLoaded = false;

    function dropPlaceholder() {
      var fb = mount.querySelector('.reviews-fallback');
      if (fb) fb.remove();
    }

    function loadReviews() {
      if (reviewsLoaded) return;
      reviewsLoaded = true;
      var s = document.createElement('script');
      s.src = mount.getAttribute('data-reviews');
      s.defer = true;
      s.onerror = dropPlaceholder;
      mount.appendChild(s);
      // The widget replaces the section itself; clear our placeholder either
      // way so it can never sit there saying "Loading" forever.
      setTimeout(dropPlaceholder, 5000);
    }

    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        if (!entries[0].isIntersecting) return;
        io.disconnect();
        loadReviews();
      }, { rootMargin: '300px' });
      io.observe(mount);
      // Safety net: a few environments never fire the observer (prerender,
      // a zero-height viewport). Load on a timer rather than stall.
      setTimeout(loadReviews, 6000);
    } else {
      loadReviews();
    }
  }
})();
