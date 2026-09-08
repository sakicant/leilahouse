/* House Leila — all site behaviour. No dependencies, ~5 KB.
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
      cap.textContent = (i + 1) + ' / ' + tiles.length + ' — ' + (t.getAttribute('data-cap') || '');
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

  /* --- availability calendar --------------------------------------------- */
  var calMonths = document.querySelector('[data-cal-months]');
  if (calMonths) {
    var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
      'August', 'September', 'October', 'November', 'December'];
    var DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

    var rangeEl = document.querySelector('[data-cal-range]');
    var prevBtn = document.querySelector('[data-cal-prev]');
    var nextBtn = document.querySelector('[data-cal-next]');
    var updEl = document.querySelector('[data-cal-updated]');

    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var firstMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    var cursor = new Date(firstMonth);
    var lastMonth = new Date(today.getFullYear() + 2, today.getMonth(), 1);
    var booked = Object.create(null);

    function key(y, m, d) {
      return y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    }

    function eachDay(from, to, fn) {
      var a = new Date(from + 'T00:00:00');
      var b = new Date(to + 'T00:00:00');
      for (var d = a; d <= b; d.setDate(d.getDate() + 1)) {
        fn(key(d.getFullYear(), d.getMonth(), d.getDate()));
      }
    }

    function monthHtml(base, offset) {
      var d = new Date(base.getFullYear(), base.getMonth() + offset, 1);
      var y = d.getFullYear();
      var m = d.getMonth();
      var days = new Date(y, m + 1, 0).getDate();
      var lead = (new Date(y, m, 1).getDay() + 6) % 7; // Monday-first

      var cells = '';
      for (var p = 0; p < lead; p++) cells += '<div class="cal-day cal-day--pad"></div>';
      for (var n = 1; n <= days; n++) {
        var k = key(y, m, n);
        var date = new Date(y, m, n);
        var cls = 'cal-day';
        var label;
        if (date < today) { cls += ' cal-day--past'; label = 'past'; }
        else if (booked[k]) { cls += ' cal-day--booked'; label = 'booked'; }
        else { cls += ' cal-day--free'; label = 'available'; }
        if (date.getTime() === today.getTime()) cls += ' cal-day--today';
        cells += '<div class="' + cls + '"><span aria-hidden="true">' + n + '</span>' +
          '<span class="sr-only">' + n + ' ' + MONTHS[m] + ' ' + y + ', ' + label + '</span></div>';
      }

      return '<div class="cal-month"><div class="cal-month__name">' + MONTHS[m] + ' ' + y +
        '</div><div class="cal-grid" role="group" aria-label="' + MONTHS[m] + ' ' + y + '">' +
        DOW.map(function (x, ix) {
          return '<div class="cal-dow" aria-hidden="true">' + x + '</div>';
        }).join('') + cells + '</div></div>';
    }

    function render() {
      calMonths.innerHTML = monthHtml(cursor, 0) + monthHtml(cursor, 1);
      var end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      if (rangeEl) {
        rangeEl.textContent = MONTHS[cursor.getMonth()] + ' – ' + MONTHS[end.getMonth()] + ' ' + end.getFullYear();
      }
      if (prevBtn) prevBtn.disabled = cursor <= firstMonth;
      if (nextBtn) nextBtn.disabled = cursor >= lastMonth;
    }

    function step(n) {
      var next = new Date(cursor.getFullYear(), cursor.getMonth() + n, 1);
      if (next < firstMonth || next > lastMonth) return;
      cursor = next;
      render();
    }
    if (prevBtn) prevBtn.addEventListener('click', function () { step(-2); });
    if (nextBtn) nextBtn.addEventListener('click', function () { step(2); });

    render();

    fetch('/assets/data/availability.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (data) {
        (data.booked || []).forEach(function (b) {
          if (typeof b === 'string') booked[b] = 1;
          else eachDay(b.from, b.to, function (k) { booked[k] = 1; });
        });
        render();
        if (updEl) {
          updEl.textContent = 'Availability last updated ' + (data.updated || '—') +
            '. Dates shown are a guide — we confirm the exact availability when you send an inquiry.';
        }
      })
      .catch(function () {
        if (updEl) {
          updEl.textContent = 'We could not load the live availability just now — please send us a message and we will confirm your dates.';
        }
      });
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
        .then(function (r) { return r.json().catch(function () { return { ok: r.ok }; }); })
        .then(function (res) {
          if (!res.ok) throw new Error(res.error || 'send failed');
          form.reset();
          say('Thank you — your inquiry is on its way. We usually reply within a few hours.', true);
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
