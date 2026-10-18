/* Printer controls: print quality, sticker filters, live LCD status, print button. */
(() => {
  const root = document.documentElement;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} }
  };

  /* ── LCD status ── */
  const lcdStatus = document.getElementById('scrStatus');
  const lcdQuality = document.getElementById('scrQuality');
  const printLed = document.querySelector('.led-d.s2');
  function setStatus(text) {
    if (lcdStatus) lcdStatus.innerHTML = `<div class="scr-dot"></div>${text}`;
  }
  /* the load-time print animation only runs with motion on; otherwise we're ready now */
  if (!document.querySelector('#hero .paper.print-on-load')) setStatus('Open to work');

  let busyTimer;
  function flashPrinting(label) {
    setStatus(label);
    printLed?.classList.add('busy');
    clearTimeout(busyTimer);
    busyTimer = setTimeout(() => {
      setStatus('Open to work');
      printLed?.classList.remove('busy');
    }, 900);
  }

  /* ── print quality ── */
  const QUALITY = {
    draft:    { lcd: 'DRAFT', hint: '30-second read' },
    standard: { lcd: 'STD',   hint: 'Full profile' },
    high:     { lcd: 'HIGH',  hint: 'Technical deep-dive' }
  };
  const qBtns = document.querySelectorAll('.pq-btn');
  const qHint = document.getElementById('pqHint');

  function setQuality(q, { animate = false, remember = false } = {}) {
    if (!QUALITY[q]) q = 'standard';
    if (q === 'standard') root.removeAttribute('data-quality');
    else root.setAttribute('data-quality', q);
    qBtns.forEach(b => b.setAttribute('aria-checked', String(b.dataset.quality === q)));
    if (qHint) qHint.textContent = QUALITY[q].hint;
    if (lcdQuality) lcdQuality.textContent = `Qual: ${QUALITY[q].lcd}`;
    if (!remember) return;
    store.set('xp-quality', q);
    /* keep the address shareable, e.g. send recruiters ?quality=draft */
    const url = new URL(location.href);
    if (q === 'standard') url.searchParams.delete('quality');
    else url.searchParams.set('quality', q);
    history.replaceState(null, '', url);
    if (animate && !reduceMotion) {
      flashPrinting('Printing');
      document.querySelectorAll('.psec').forEach(sec => {
        sec.classList.remove('reprint');
        void sec.offsetWidth; /* restart the animation */
        sec.classList.add('reprint');
      });
    }
  }

  qBtns.forEach(b => b.addEventListener('click', () =>
    setQuality(b.dataset.quality, { animate: true, remember: true })));
  /* radio-group arrow keys */
  document.querySelector('.p-quality')?.addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const list = [...qBtns];
    const cur = list.findIndex(b => b.getAttribute('aria-checked') === 'true');
    const next = list[(cur + (e.key === 'ArrowRight' ? 1 : list.length - 1)) % list.length];
    next.focus();
    next.click();
    e.preventDefault();
  });
  setQuality(new URLSearchParams(location.search).get('quality') || store.get('xp-quality') || 'standard');

  /* ── sticker filters ── */
  const FILTERS = {
    python: { label: 'Python',    tags: ['python'] },
    ml:     { label: 'ML / AI',   tags: ['ml'] },
    react:  { label: 'React',     tags: ['react'] },
    sql:    { label: 'SQL',       tags: ['sql'] },
    llm:    { label: 'LLM / RAG', tags: ['llm'] },
    neu:    { label: 'Northeastern', jump: 'about' },
    avatar: { label: 'Full profile', clear: true }
  };
  const items = [...document.querySelectorAll('[data-tags]')];
  const slotWrap = document.querySelector('.slot-wrap');
  let ticket;

  function plural(n, word) { return `${n} ${word}${n === 1 ? '' : 's'}`; }

  function showTicket(f, roles, projects) {
    if (!ticket) {
      ticket = document.createElement('div');
      ticket.className = 'filter-ticket';
      ticket.setAttribute('role', 'status');
      ticket.innerHTML = `<span class="ft-k">Filter</span><strong class="ft-name"></strong>
        <div class="ft-count"></div>
        <div class="ft-actions"><button type="button" data-act="view">View ↓</button><button type="button" data-act="clear">Clear ✕</button></div>`;
      ticket.addEventListener('click', e => {
        const act = e.target.closest('button')?.dataset.act;
        if (act === 'clear') clearFilter();
        if (act === 'view') document.querySelector('.is-match')?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
      });
      document.body.appendChild(ticket);
    }
    ticket.querySelector('.ft-name').textContent = f.label;
    ticket.querySelector('.ft-count').textContent = `${plural(roles, 'role')} · ${plural(projects, 'project')} matched`;
    requestAnimationFrame(() => ticket.classList.add('show'));
  }

  function clearFilter() {
    items.forEach(el => el.classList.remove('is-match', 'is-dimmed'));
    ticket?.classList.remove('show');
  }

  function applyFilter(key) {
    const f = FILTERS[key];
    if (!f) return;
    if (f.clear) { clearFilter(); flashPrinting('Printing'); return; }
    if (f.jump) {
      document.getElementById(f.jump)?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
      return;
    }
    let roles = 0, projects = 0;
    items.forEach(el => {
      const match = f.tags.some(t => el.dataset.tags.split(' ').includes(t));
      el.classList.toggle('is-match', match);
      el.classList.toggle('is-dimmed', !match);
      if (match && el.classList.contains('ti')) roles++;
      if (match && el.classList.contains('pc')) projects++;
    });
    flashPrinting('Printing');
    showTicket(f, roles, projects);
  }

  /* is the pointer over the paper slot (with some slack)? */
  function overSlot(x, y) {
    if (!slotWrap) return false;
    const s = slotWrap.getBoundingClientRect();
    return x > s.left && x < s.right && y > s.top - 40 && y < s.bottom + 40;
  }

  function feed(el) {
    const rot = getComputedStyle(el).getPropertyValue('--rot') || '0deg';
    const back = () => {
      /* return the sticker to where it started */
      el.classList.remove('fed');
      el.classList.add('returning');
      el.dataset.dx = 0;
      el.dataset.dy = 0;
      el.style.transform = `rotate(${rot})`;
      setTimeout(() => el.classList.remove('returning'), 300);
    };
    applyFilter(el.dataset.sticker);
    if (reduceMotion) return back();
    el.classList.add('fed');
    el.style.transform += ' scale(.2)'; /* shrink into the slot */
    setTimeout(back, 420);
  }

  /* the drag itself lives in index.html; here we only watch where a dragged sticker lands */
  let dragged = null, px = 0, py = 0;
  const onMove = e => {
    const pt = e.touches ? e.touches[0] : e;
    px = pt.clientX;
    py = pt.clientY;
    dragged = document.querySelector('.sticker.dragging') || dragged;
    slotWrap?.classList.toggle('feed-ready', !!dragged && overSlot(px, py));
  };
  const onDrop = () => {
    slotWrap?.classList.remove('feed-ready');
    if (dragged && overSlot(px, py)) feed(dragged);
    dragged = null;
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('touchmove', onMove, { passive: true });
  window.addEventListener('mouseup', onDrop);
  window.addEventListener('touchend', onDrop);

  /* keyboard: stickers are buttons too */
  document.querySelectorAll('[data-sticker]').forEach(el => {
    const f = FILTERS[el.dataset.sticker];
    if (!f) return;
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label',
      f.clear ? 'Clear filter' : f.jump ? 'Jump to education' : `Filter by ${f.label}`);
    el.addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      applyFilter(el.dataset.sticker);
    });
  });

  /* ── live GitHub data on the LCD ── */
  const GH_USER = 'Edwardx258';
  const SITE_REPO = 'Edwardx258/Edwardx258.github.io';
  async function loadGitHub() {
    let data = null;
    try { data = JSON.parse(sessionStorage.getItem('xp-gh')); } catch {}
    if (!data || Date.now() - data.t > 36e5) {
      const [u, c] = await Promise.all([
        fetch(`https://api.github.com/users/${GH_USER}`),
        fetch(`https://api.github.com/repos/${SITE_REPO}/commits?per_page=1`)
      ]);
      if (!u.ok || !c.ok) return;
      const user = await u.json();
      const commits = await c.json();
      data = { t: Date.now(), repos: user.public_repos, updated: commits[0]?.commit?.committer?.date };
      try { sessionStorage.setItem('xp-gh', JSON.stringify(data)); } catch {}
    }
    if (Number.isFinite(data.repos)) document.getElementById('scrRepos').textContent = `Repos: ${data.repos}`;
    if (data.updated) {
      const d = new Date(data.updated).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      document.getElementById('scrUpdated').textContent = `Updated: ${d}`;
    }
  }
  /* static fallbacks stay on screen if GitHub is unreachable or rate-limited */
  loadGitHub().catch(() => {});

  /* ── print button ── */
  document.getElementById('printPage')?.addEventListener('click', () => window.print());
})();
