(function () {
  'use strict';

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function restart(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
  function esc(t) {
    return String(t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* =========================================================
     Projects: filter + activity rings
     ========================================================= */
  var cards = $$('[data-project]');
  var chips = $$('[data-filter]');
  var statusEl = $('#filter-status');

  function cardTags(card) { return (card.getAttribute('data-tags') || '').split('|'); }

  function setProjectFilter(tag, viaPrinter) {
    var n = 0;
    chips.forEach(function (c) {
      var f = c.getAttribute('data-filter');
      c.setAttribute('aria-pressed', String((f === 'All' && !tag) || f === tag));
    });
    cards.forEach(function (card) {
      var ok = !tag || cardTags(card).indexOf(tag) >= 0;
      if (ok) n++;
      card.classList.toggle('is-dim', !ok);
      var badge = $('.match', card);
      if (badge) {
        badge.hidden = !(tag && ok);
        badge.textContent = tag && ok ? 'MATCH · ' + tag : '';
      }
    });
    if (statusEl) {
      statusEl.textContent = tag
        ? (viaPrinter ? 'From the printer · ' : '') + n + ' of ' + cards.length + ' use ' + tag
        : 'Showing all ' + cards.length;
    }
  }

  chips.forEach(function (c) {
    c.addEventListener('click', function () {
      var f = c.getAttribute('data-filter');
      setProjectFilter(f === 'All' ? null : f, false);
    });
  });

  function ringParts(card) {
    return $$('.ring-fill', card).map(function (c) {
      var r = parseFloat(c.getAttribute('r'));
      var C = 2 * Math.PI * r;
      return { el: c, C: C, v: parseFloat(c.getAttribute('data-v')), k: parseInt(c.getAttribute('data-k'), 10) || 0 };
    });
  }
  function setupRings(card) {
    ringParts(card).forEach(function (p) {
      p.el.style.strokeDasharray = p.C.toFixed(2);
      p.el.style.strokeDashoffset = (reduce ? p.C * (1 - p.v) : p.C).toFixed(2);
    });
  }
  function drawRings(card, base, step) {
    if (reduce) return;
    ringParts(card).forEach(function (p) {
      p.el.style.transition = 'stroke-dashoffset 1300ms cubic-bezier(.16,1,.3,1) ' + (base + p.k * step) + 'ms';
      p.el.style.strokeDashoffset = (p.C * (1 - p.v)).toFixed(2);
    });
  }
  function redrawRings(card) {
    if (reduce) return;
    var parts = ringParts(card);
    parts.forEach(function (p) {
      p.el.style.transition = 'none';
      p.el.style.strokeDashoffset = p.C.toFixed(2);
    });
    void card.offsetWidth;
    drawRings(card, 0, 90);
  }
  cards.forEach(function (card) {
    setupRings(card);
    var body = $('.card-body', card);
    if (body) body.addEventListener('mouseenter', function () {
      if (card.classList.contains('is-in')) redrawRings(card);
    });
  });

  /* =========================================================
     Reveal on scroll (once)
     ========================================================= */
  var reveals = $$('[data-reveal]');
  function reveal(el) {
    el.classList.add('is-in');
    if (el.hasAttribute('data-project')) drawRings(el, 500, 140);
  }
  if (reduce || !('IntersectionObserver' in window)) {
    reveals.forEach(reveal);
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { reveal(e.target); io.unobserve(e.target); }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    reveals.forEach(function (el) { io.observe(el); });
  }

  /* =========================================================
     Hero: sticker printer
     ========================================================= */
  var stage = $('[data-stage]');
  if (stage) initHero();

  function initHero() {
    var printer = $('[data-printer]', stage);
    var slotEl = $('.printer-slot', printer);
    var well = $('[data-well]', stage);
    var tray = $('[data-tray]', stage);
    var live = $('#print-status');
    var slots = $$('[data-slot]', stage);
    var K = 260, DAMP = 20, GRAVITY = 2600;
    // Ejecting is slower on purpose: the sticker eases up out of the slot,
    // then a softer spring glides it home with a small settle.
    var EJECT_S = 0.75, K_SOFT = 90, DAMP_SOFT = 13;
    var inP = null, raf = 0, last = 0, zTop = 10, printTimer = 0;

    var st = $$('.sticker', stage).map(function (el, i) {
      return {
        el: el, i: i, tag: el.getAttribute('data-tag'),
        x: 0, y: 0, hx: 0, hy: 0, tx: 0, ty: 0, vx: 0, vy: 0,
        r: 0, sc: reduce ? 1 : 0, vs: 0,
        drag: false, moved: false, phase: null,
        aimX: 0, slotY: 0, readyAt: Infinity,
        sx: 0, sy: 0, ox: 0, oy: 0, lt: 0
      };
    });

    function rel(rect) {
      var s = stage.getBoundingClientRect();
      return { x: rect.left - s.left, y: rect.top - s.top, w: rect.width, h: rect.height };
    }
    function local(e) {
      var s = stage.getBoundingClientRect();
      return { x: e.clientX - s.left, y: e.clientY - s.top };
    }
    function slotGeom(s) {
      var r = rel(slotEl.getBoundingClientRect());
      return { aimX: r.x + r.w / 2 - s.el.offsetWidth / 2, slotY: r.y + r.h / 2 };
    }
    function overPrinter(s) {
      var b = rel(printer.getBoundingClientRect());
      var cx = s.x + s.el.offsetWidth / 2, cy = s.y + s.el.offsetHeight / 2, m = 24;
      return cx > b.x - m && cx < b.x + b.w + m && cy > b.y - m && cy < b.y + b.h + m;
    }

    function layout(initial) {
      st.forEach(function (s, i) {
        var r = rel(slots[i].getBoundingClientRect());
        s.hx = r.x; s.hy = r.y;
        if (s.phase === 'in') {
          var g = slotGeom(s); s.aimX = g.aimX; s.slotY = g.slotY; s.x = s.aimX; s.y = s.slotY;
        } else if (!s.phase && !s.drag) {
          s.tx = s.hx; s.ty = s.hy;
          if (initial) { s.x = s.hx; s.y = s.hy + (reduce ? 0 : 40); }
          else if (s.vx === 0 && s.vy === 0) { s.x = s.hx; s.y = s.hy; }
        }
      });
      draw();
    }

    function draw() {
      st.forEach(function (s) {
        var slotted = s.phase === 'drop' || s.phase === 'in' || s.phase === 'eject';
        var h = s.el.offsetHeight;
        var hidden = slotted ? Math.max(0, Math.min(h + 8, s.y + h - s.slotY)) : 0;
        s.el.style.transform = 'translate3d(' + s.x.toFixed(1) + 'px,' + s.y.toFixed(1) + 'px,0) rotate(' + s.r.toFixed(2) + 'deg) scale(' + Math.max(0, s.sc).toFixed(3) + ')';
        s.el.style.clipPath = slotted ? 'inset(0px 0px ' + hidden.toFixed(1) + 'px 0px)' : '';
        s.el.style.pointerEvents = (s.phase || s.sc < 0.2) ? 'none' : '';
        s.el.classList.toggle('is-slotted', slotted);
      });
    }

    function setHot(on) { printer.classList.toggle('is-hot', on); }

    function paperHTML(tag) {
      if (!tag) {
        return '<div class="pl pl-row" style="--i:0"><span>SHEET 01 — HELLO</span><span>QUAL: STD</span></div>' +
          '<div class="pl pl-name" style="--i:1">Yixuan Xiong</div>' +
          '<div class="pl" style="--i:2">Software Engineer / AI Systems</div>' +
          '<div class="pl pl-rule" style="--i:3"></div>' +
          '<div class="pl pl-kv" style="--i:4"><span>LOC</span><span>Seattle, WA</span></div>' +
          '<div class="pl pl-kv" style="--i:5"><span>DEG</span><span>M.S. CS · Northeastern</span></div>' +
          '<div class="pl pl-kv" style="--i:6"><span>STACK</span><span>Python · FastAPI · React · AWS</span></div>' +
          '<div class="pl pl-foot" style="--i:7"><span>END OF SHEET 01</span><span aria-hidden="true">↓</span></div>';
      }
      var matches = cards.filter(function (c) { return cardTags(c).indexOf(tag) >= 0; });
      var rows = matches.map(function (c, i) {
        return '<a class="pl pl-link" style="--i:' + (4 + i) + '" href="' + esc(c.getAttribute('data-href')) + '"><span>0' + (cards.indexOf(c) + 1) + '  ' + esc(c.getAttribute('data-name')) + '</span><span aria-hidden="true">↗</span></a>';
      }).join('');
      return '<div class="pl pl-row" style="--i:0"><span>YIXUAN XIONG · SHEET 02</span><span>' + matches.length + (matches.length === 1 ? ' MATCH' : ' MATCHES') + '</span></div>' +
        '<div class="pl pl-name" style="--i:1">' + esc(tag) + '</div>' +
        '<div class="pl" style="--i:2">Filtered projects · SWE / AI Systems</div>' +
        '<div class="pl pl-rule" style="--i:3"></div>' + rows +
        '<div class="pl pl-foot" style="--i:7"><span>END OF SHEET 02</span><button type="button" class="eject" data-eject>Eject ↑</button></div>';
    }

    function print(tag) {
      var paper = document.createElement('div');
      paper.className = 'paper is-printing is-reprint';
      paper.innerHTML = paperHTML(tag);
      well.innerHTML = '';
      well.appendChild(paper);
      printer.classList.remove('is-printing');
      restart(printer, 'is-reprinting');
      if (tag) {
        var n = cards.filter(function (c) { return cardTags(c).indexOf(tag) >= 0; }).length;
        live.textContent = 'Printed ' + n + ' project' + (n === 1 ? '' : 's') + ' using ' + tag + '. Projects below are filtered.';
        setProjectFilter(tag, true);
      } else {
        live.textContent = 'Filter cleared. Showing all projects.';
        setProjectFilter(null, false);
      }
    }

    function swallow(s) {
      restart(printer, 'bump');
      clearTimeout(printTimer);
      printTimer = setTimeout(function () { print(s.tag); }, reduce ? 0 : 160);
    }

    function ejectSticker(o) {
      if (o.phase === 'in' || o.phase === 'drop') {
        o.phase = 'eject'; o.vx = 0; o.vy = 0; o.x = o.aimX;
        o.ejectT = 0; o.ejectFrom = o.y; o.ejectTo = o.slotY - o.el.offsetHeight - 12;
        if (reduce) { o.phase = null; o.x = o.hx; o.y = o.hy; o.vy = 0; }
      } else {
        o.phase = null; o.tx = o.hx; o.ty = o.hy;
      }
      o.el.removeAttribute('aria-disabled');
      o.el.tabIndex = 0;
      o.el.style.zIndex = ++zTop;
    }

    function drop(s) {
      if (inP && inP !== s) ejectSticker(inP);
      inP = s;
      s.soft = false;
      var g = slotGeom(s);
      s.aimX = g.aimX; s.slotY = g.slotY;
      s.tx = s.aimX; s.ty = s.slotY - s.el.offsetHeight - 8;
      s.el.setAttribute('aria-disabled', 'true');
      s.el.tabIndex = -1;
      s.el.style.zIndex = ++zTop;
      if (reduce) {
        s.phase = 'in'; s.x = s.aimX; s.y = s.slotY; s.vx = s.vy = 0;
        swallow(s); draw();
      } else {
        s.phase = 'aim';
        kick();
      }
    }

    function eject() {
      if (!inP) return;
      var o = inP;
      ejectSticker(o);
      inP = null;
      clearTimeout(printTimer);
      restart(printer, 'bump');
      print(null);
      kick();
      o.el.focus({ preventScroll: true });
    }

    well.addEventListener('click', function (e) {
      if (e.target.closest('[data-eject]')) eject();
    });

    st.forEach(function (s) {
      var el = s.el;
      el.addEventListener('pointerdown', function (e) {
        if (s.phase || (e.button && e.button !== 0)) return;
        var p = local(e);
        s.drag = true; s.moved = false;
        s.sx = p.x; s.sy = p.y; s.ox = p.x - s.x; s.oy = p.y - s.y;
        s.lt = performance.now();
        try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        el.style.zIndex = ++zTop;
        el.classList.add('is-drag');
        kick();
      });
      el.addEventListener('pointermove', function (e) {
        if (!s.drag) return;
        var p = local(e);
        if (!s.moved && Math.abs(p.x - s.sx) + Math.abs(p.y - s.sy) > 5) s.moved = true;
        if (!s.moved) return;
        var now = performance.now();
        var dt = Math.max(8, now - s.lt) / 1000;
        var nx = p.x - s.ox, ny = p.y - s.oy;
        s.vx = Math.max(-3000, Math.min(3000, (nx - s.x) / dt));
        s.vy = Math.max(-3000, Math.min(3000, (ny - s.y) / dt));
        s.x = nx; s.y = ny; s.lt = now;
        setHot(overPrinter(s));
        if (reduce) draw();
      });
      function end() {
        if (!s.drag) return;
        s.drag = false;
        el.classList.remove('is-drag');
        setHot(false);
        if (!s.moved) return; // a tap: handled by the click event
        if (overPrinter(s)) drop(s);
        else {
          s.tx = s.hx; s.ty = s.hy;
          if (reduce) { s.x = s.hx; s.y = s.hy; s.vx = s.vy = 0; draw(); }
          kick();
        }
      }
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
      el.addEventListener('lostpointercapture', end);
      // Tap, click or keyboard (Enter / Space) drops the sticker straight in.
      el.addEventListener('click', function () {
        if (s.moved) { s.moved = false; return; }
        if (!s.phase && el.getAttribute('aria-disabled') !== 'true') drop(s);
      });
    });

    function step(now) {
      var dt = Math.min(0.032, Math.max(0.001, (now - last) / 1000));
      last = now;
      var active = false;
      st.forEach(function (s) {
        if (now < s.readyAt) { active = true; return; }
        if (s.drag) {
          s.vx *= 0.8; s.vy *= 0.8; active = true;
        } else if (s.phase === 'drop') {
          s.x = s.aimX; s.vx = 0;
          s.vy += GRAVITY * dt; s.y += s.vy * dt;
          if (s.y >= s.slotY) { s.y = s.slotY; s.vy = 0; s.phase = 'in'; swallow(s); }
          active = true;
        } else if (s.phase === 'in') {
          s.x = s.aimX; s.y = s.slotY;
        } else if (s.phase === 'eject') {
          s.ejectT += dt;
          var t = Math.min(1, s.ejectT / EJECT_S);
          var ease = 1 - Math.pow(1 - t, 3); // ease-out: quick start, slow finish
          s.x = s.aimX; s.y = s.ejectFrom + (s.ejectTo - s.ejectFrom) * ease; active = true;
          if (t >= 1) { s.phase = null; s.vx = 0; s.vy = 0; s.vs = 1.2; s.soft = true; s.tx = s.hx; s.ty = s.hy; }
        } else {
          var k = s.soft ? K_SOFT : K, damp = s.soft ? DAMP_SOFT : DAMP;
          var ax = -k * (s.x - s.tx) - damp * s.vx;
          var ay = -k * (s.y - s.ty) - damp * s.vy;
          s.vx += ax * dt; s.vy += ay * dt;
          s.x += s.vx * dt; s.y += s.vy * dt;
          var close = Math.abs(s.x - s.tx) < 1.5 && Math.abs(s.y - s.ty) < 1.5;
          if (s.phase === 'aim' && close && Math.abs(s.vx) < 60 && Math.abs(s.vy) < 60) {
            s.phase = 'drop'; s.vy = 80; s.x = s.aimX; active = true;
          } else if (Math.abs(s.x - s.tx) < 0.3 && Math.abs(s.y - s.ty) < 0.3 && Math.abs(s.vx) < 4 && Math.abs(s.vy) < 4) {
            s.x = s.tx; s.y = s.ty; s.vx = 0; s.vy = 0; s.soft = false;
          } else { active = true; }
        }
        var ts = s.drag ? 1.08 : 1;
        var as = -K * (s.sc - ts) - DAMP * s.vs;
        s.vs += as * dt; s.sc += s.vs * dt;
        if (Math.abs(s.sc - ts) < 0.002 && Math.abs(s.vs) < 0.02) { s.sc = ts; s.vs = 0; } else { active = true; }
        var slotted = s.phase === 'drop' || s.phase === 'in' || s.phase === 'eject';
        var tilt = slotted ? 0 : Math.max(-16, Math.min(16, s.vx * 0.015));
        s.r += (tilt - s.r) * 0.3;
        if (Math.abs(s.r) > 0.05) active = true; else s.r = 0;
      });
      draw();
      raf = active ? requestAnimationFrame(step) : 0;
    }
    function kick() {
      if (reduce || raf) return;
      last = performance.now();
      raf = requestAnimationFrame(step);
    }

    // Start: place stickers, pop them in after the opening sequence.
    layout(true);
    var popAt = performance.now() + (reduce ? 0 : 2130);
    st.forEach(function (s, i) { s.readyAt = popAt + i * 70; });
    setTimeout(function () { tray.classList.add('is-shown'); }, reduce ? 0 : 2100);
    kick();
    if (reduce) draw();

    var relayout = function () { layout(false); };
    window.addEventListener('resize', relayout);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);
    if ('ResizeObserver' in window) new ResizeObserver(relayout).observe(stage);
  }

  /* =========================================================
     Contact: print-job form + receipt
     ========================================================= */
  var form = $('#job-form');
  if (form) initContact();

  function initContact() {
    var cprinter = $('[data-cprinter]');
    var receipt = $('#receipt');
    var formErr = $('#form-error');
    var sendBtn = $('.btn-send', form);
    var RETRACT = 520;
    var fields = {
      name: { input: $('#cj-name'), err: $('#cj-name-err') },
      email: { input: $('#cj-email'), err: $('#cj-email-err') },
      message: { input: $('#cj-msg'), err: $('#cj-msg-err') }
    };

    function setErr(key, msg) {
      var f = fields[key];
      f.err.textContent = msg || '';
      if (msg) f.input.setAttribute('aria-invalid', 'true');
      else f.input.removeAttribute('aria-invalid');
    }

    function validate() {
      var v = {
        name: fields.name.input.value.trim(),
        email: fields.email.input.value.trim(),
        message: fields.message.input.value.trim()
      };
      var errs = {};
      if (!v.name) errs.name = 'Please add your name.';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) errs.email = 'Please enter a valid email so I can reply.';
      if (v.message.length < 10) errs.message = 'A few more words, please (10+ characters).';
      ['name', 'email', 'message'].forEach(function (k) { setErr(k, errs[k]); });
      var first = ['name', 'email', 'message'].filter(function (k) { return errs[k]; })[0];
      if (first) fields[first].input.focus();
      return first ? null : v;
    }

    function showReceipt(v) {
      var job = String(Date.now() % 1000);
      while (job.length < 3) job = '0' + job;
      $('[data-r="job"]', receipt).textContent = job;
      $('[data-r="name"]', receipt).textContent = v.name;
      $('[data-r="email"]', receipt).textContent = v.email;
      $('[data-r="preview"]', receipt).textContent = v.message.length > 90 ? v.message.slice(0, 90) + '…' : v.message;

      restart(form, 'is-retract');
      restart(cprinter, 'bump');
      setTimeout(function () {
        form.hidden = true;
        receipt.hidden = false;
        restart(receipt, 'is-printing');
        restart(cprinter, 'is-printing');
        var h = $('[data-r-focus]', receipt);
        if (h) h.focus({ preventScroll: true });
      }, reduce ? 0 : RETRACT + 140);
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      formErr.textContent = '';
      var v = validate();
      if (!v) return;
      var endpoint = (form.getAttribute('data-endpoint') || '').trim();
      if (!endpoint) { showReceipt(v); return; } // demo mode

      sendBtn.disabled = true;
      sendBtn.textContent = 'Sending…';
      fetch(endpoint, { method: 'POST', headers: { Accept: 'application/json' }, body: new FormData(form) })
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          showReceipt(v);
        })
        .catch(function () {
          formErr.textContent = 'Couldn’t send your message. Please email me at edwardxiongyx@gmail.com instead.';
        })
        .then(function () {
          sendBtn.disabled = false;
          sendBtn.textContent = 'Print & send ↑';
        });
    });

    $('[data-new-job]', receipt).addEventListener('click', function () {
      form.reset();
      ['name', 'email', 'message'].forEach(function (k) { setErr(k, ''); });
      receipt.hidden = true;
      receipt.classList.remove('is-printing');
      cprinter.classList.remove('is-printing');
      form.classList.remove('is-retract');
      form.hidden = false;
      restart(form, 'is-feed');
      fields.name.input.focus({ preventScroll: true });
    });
  }
})();
