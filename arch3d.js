/* Interactive 3D architecture diagram for case study pages.
   The graph comes from <script type="application/json" id="arch-data">.
   The HTML legend is built right away (it is also the accessible and print
   version); three.js is only fetched once the diagram scrolls into view. */
(() => {
  const root = document.querySelector('[data-arch]');
  const dataEl = document.getElementById('arch-data');
  if (!root || !dataEl) return;

  const spec = JSON.parse(dataEl.textContent);
  const byId = Object.fromEntries(spec.nodes.map(n => [n.id, n]));
  const stage = root.querySelector('.arch-stage');
  const caption = root.querySelector('.arch-caption');
  const toggleBtn = root.querySelector('[data-arch-act="toggle"]');
  const replayBtn = root.querySelector('[data-arch-act="replay"]');
  const legend = document.querySelector('.arch-legend');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let view = null; /* the 3D scene, once loaded */
  let selected = null;

  function say(text) { caption.textContent = text; }
  say(spec.intro);

  /* ── legend: one button per component ── */
  spec.nodes.forEach(n => {
    const li = document.createElement('li');
    li.innerHTML = `<button type="button" aria-pressed="false" data-node="${n.id}"><strong></strong><span></span></button>`;
    li.querySelector('strong').textContent = n.label;
    li.querySelector('span').textContent = n.desc;
    legend.appendChild(li);
  });
  legend.addEventListener('click', e => {
    const id = e.target.closest('[data-node]')?.dataset.node;
    if (id) select(selected === id ? null : id);
  });

  function select(id) {
    selected = id;
    legend.querySelectorAll('[data-node]').forEach(b =>
      b.setAttribute('aria-pressed', String(b.dataset.node === id)));
    if (id) {
      say(`${byId[id].label}: ${byId[id].desc}`);
      setPlaying(false);
    }
    view?.select(id);
  }

  function setPlaying(on) {
    if (view) view.playing = on;
    toggleBtn.textContent = on ? 'Pause' : 'Play';
    toggleBtn.setAttribute('aria-pressed', String(!on));
  }
  toggleBtn.addEventListener('click', () => {
    if (!view) return;
    if (!view.playing) select(null);
    setPlaying(!view.playing);
  });
  replayBtn.addEventListener('click', () => {
    if (!view) return;
    select(null);
    view.restart();
    setPlaying(true);
  });

  /* ── load three.js when the diagram is close to the viewport ── */
  const near = new IntersectionObserver(entries => {
    if (!entries.some(e => e.isIntersecting)) return;
    near.disconnect();
    start();
  }, { rootMargin: '300px' });
  near.observe(root);

  async function start() {
    try {
      const [THREE, { OrbitControls }, { CSS2DRenderer, CSS2DObject }, { RoundedBoxGeometry }] = await Promise.all([
        import('three'),
        import('three/addons/controls/OrbitControls.js'),
        import('three/addons/renderers/CSS2DRenderer.js'),
        import('three/addons/geometries/RoundedBoxGeometry.js')
      ]);
      view = build({ THREE, OrbitControls, CSS2DRenderer, CSS2DObject, RoundedBoxGeometry });
      root.classList.add('arch-ready');
      if (selected) view.select(selected);
      setPlaying(!reduceMotion && !selected);
    } catch (err) {
      console.error('3D view unavailable', err);
      root.classList.add('arch-fallback');
      stage.textContent = '3D view unavailable here. The components are listed below.';
      toggleBtn.disabled = replayBtn.disabled = true;
    }
  }

  function build({ THREE, OrbitControls, CSS2DRenderer, CSS2DObject, RoundedBoxGeometry }) {
    const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;

    /* ── renderer, scene, camera ── */
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    stage.appendChild(renderer.domElement);

    const labels = new CSS2DRenderer();
    labels.domElement.className = 'arch-labels';
    stage.appendChild(labels.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 200);
    const group = new THREE.Group();
    scene.add(group);

    const hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 1.6);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(6, 12, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 40 });
    sun.shadow.radius = 4;
    scene.add(sun);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.ShadowMaterial({ opacity: 0.16 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    group.add(ground);

    /* ── palette from the page's CSS variables, so both themes match ── */
    const allMats = [];
    function material(cssVar, roughness) {
      const m = new THREE.MeshStandardMaterial({ roughness });
      m.userData.cssVar = cssVar;
      allMats.push(m);
      return m;
    }
    const mats = { edge: material('--t3', 1), packet: material('--ac', 0.3) };
    function applyTheme() {
      const css = getComputedStyle(document.documentElement);
      const col = name => new THREE.Color(css.getPropertyValue(name).trim() || '#999');
      const accent = col('--ac');
      allMats.forEach(m => {
        m.color.copy(col(m.userData.cssVar));
        m.emissive.copy(accent);
      });
      mats.packet.emissiveIntensity = 0.6;
      hemi.groundColor.copy(col('--lo'));
    }

    /* ── components ── */
    const HEIGHT = { agent: 0.5, service: 0.42, store: 0.8, cache: 0.36, io: 0.04, evidence: 0.2 };
    function makeMesh(kind) {
      const g = new THREE.Group();
      const add = (geo, mat, y) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.y = y;
        m.castShadow = true;
        g.add(m);
        return m;
      };
      if (kind === 'agent') add(new RoundedBoxGeometry(1.5, 0.5, 1.1, 4, 0.14), material('--bg', 0.7), 0.25);
      else if (kind === 'service') add(new RoundedBoxGeometry(1.6, 0.42, 1.2, 4, 0.1), material('--lo', 0.7), 0.21);
      else if (kind === 'store') add(new THREE.CylinderGeometry(0.55, 0.55, 0.8, 40), material('--paper', 0.6), 0.4);
      else if (kind === 'cache') add(new THREE.CylinderGeometry(0.48, 0.48, 0.36, 40), material('--paper-lo', 0.6), 0.18);
      else if (kind === 'evidence') {
        const mat = material('--paper', 0.9);
        [0, 1, 2].forEach(i => add(new THREE.BoxGeometry(1.1, 0.04, 1.4), mat, 0.03 + i * 0.07).rotation.y = (i - 1) * 0.12);
      } else add(new THREE.BoxGeometry(1.1, 0.04, 1.4), material('--paper', 0.9), 0.02).rotation.y = 0.08;
      return g;
    }

    const nodes = spec.nodes.map(n => {
      const obj = makeMesh(n.kind);
      obj.userData.id = n.id;
      group.add(obj);
      const el = document.createElement('div');
      el.className = 'arch-label';
      el.innerHTML = '<span></span><small></small>';
      el.firstChild.textContent = n.label;
      el.lastChild.textContent = n.sub || '';
      el.addEventListener('click', () => select(selected === n.id ? null : n.id));
      const label = new CSS2DObject(el);
      label.position.y = HEIGHT[n.kind] + 0.45;
      obj.add(label);
      const nodeMats = [...new Set(obj.children.filter(c => c.isMesh).map(c => c.material))];
      return { ...n, obj, el, mats: nodeMats, flash: 0, active: false };
    });
    const nodeById = Object.fromEntries(nodes.map(n => [n.id, n]));

    /* ── layout: wide screens lay the pipeline left→right, narrow ones top→bottom ── */
    const edges = spec.edges.map(([a, b]) => ({ a, b, mesh: null, curve: null }));
    let portrait = null;
    function layout() {
      const r = stage.getBoundingClientRect();
      const wantPortrait = r.width / Math.max(r.height, 1) < 1;
      if (wantPortrait === portrait) return;
      portrait = wantPortrait;
      const plan = n => portrait ? new THREE.Vector3(-n.z * 0.62, 0, n.x * 1.25) : new THREE.Vector3(n.x, 0, n.z);
      const pts = nodes.map(plan);
      const centre = pts.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(pts.length);
      nodes.forEach((n, i) => n.obj.position.copy(pts[i].sub(centre)));
      edges.forEach(e => {
        const A = nodeById[e.a], B = nodeById[e.b];
        const p0 = A.obj.position.clone().setY(Math.min(HEIGHT[A.kind], 0.3));
        const p2 = B.obj.position.clone().setY(Math.min(HEIGHT[B.kind], 0.3));
        const mid = p0.clone().lerp(p2, 0.5);
        mid.y = 0.6 + p0.distanceTo(p2) * 0.12;
        e.curve = new THREE.QuadraticBezierCurve3(p0, mid, p2);
        if (e.mesh) { e.mesh.geometry.dispose(); group.remove(e.mesh); }
        e.mesh = new THREE.Mesh(new THREE.TubeGeometry(e.curve, 32, 0.028, 8), mats.edge);
        group.add(e.mesh);
      });
      fitCamera();
    }

    /* pull the camera back until every component and its label fits */
    function fitCamera() {
      const elev = portrait ? 1.25 : 0.85;
      const dir = new THREE.Vector3(0, Math.sin(elev), Math.cos(elev));
      const probes = [];
      nodes.forEach(n => {
        const p = n.obj.position;
        for (const [dx, dz] of [[-0.9, -0.8], [0.9, -0.8], [-0.9, 0.8], [0.9, 0.8]])
          probes.push(new THREE.Vector3(p.x + dx, 0, p.z + dz));
        probes.push(new THREE.Vector3(p.x, HEIGHT[n.kind] + 1.1, p.z));
      });
      const place = d => {
        camera.position.copy(dir).multiplyScalar(d);
        camera.lookAt(0, 0, 0);
        camera.updateMatrixWorld();
      };
      let lo = 3, hi = 120;
      for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2;
        place(mid);
        const fits = probes.every(p => {
          const v = p.clone().project(camera);
          return Math.abs(v.x) < 0.9 && Math.abs(v.y) < 0.86;
        });
        if (fits) hi = mid; else lo = mid;
      }
      place(hi);
      /* the labels are HTML with a fixed pixel size: back off until none is clipped */
      for (let i = 0; i < 12 && !labelsFit(); i++) place(hi *= 1.06);
      controls?.target.set(0, 0, 0);
      controls?.update();
    }

    function labelsFit() {
      labels.render(scene, camera);
      const s = stage.getBoundingClientRect();
      return nodes.every(({ el }) => {
        const r = el.getBoundingClientRect();
        return r.left >= s.left + 4 && r.right <= s.right - 4 && r.top >= s.top + 4 && r.bottom <= s.bottom - 4;
      });
    }

    function resize() {
      const { width, height } = stage.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width, height);
      labels.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      portrait === null ? layout() : (layout(), fitCamera());
    }

    /* ── controls: drag to orbit on desktop; touch keeps page scrolling, tap selects ── */
    let controls = null;
    let lastInteraction = -Infinity;
    if (finePointer) {
      controls = new OrbitControls(camera, renderer.domElement);
      Object.assign(controls, {
        enableDamping: true, enablePan: false, enableZoom: false, rotateSpeed: 0.55,
        minPolarAngle: 0.35, maxPolarAngle: 1.3, minAzimuthAngle: -1.1, maxAzimuthAngle: 1.1
      });
      controls.addEventListener('start', () => { lastInteraction = Infinity; });
      controls.addEventListener('end', () => { lastInteraction = clock.elapsedTime; });
    }

    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    function pick(e) {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      let o = ray.intersectObjects(nodes.map(n => n.obj), true)[0]?.object;
      while (o && !o.userData.id) o = o.parent;
      return o?.userData.id || null;
    }
    let down = null;
    renderer.domElement.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
    renderer.domElement.addEventListener('pointerup', e => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
      const id = pick(e);
      if (id) select(selected === id ? null : id);
    });
    let hovered = null;
    if (finePointer) renderer.domElement.addEventListener('pointermove', e => {
      if (e.buttons) return;
      const id = pick(e);
      if (id === hovered) return;
      nodeById[hovered]?.el.classList.remove('is-hover');
      hovered = id;
      nodeById[id]?.el.classList.add('is-hover');
      renderer.domElement.style.cursor = id ? 'pointer' : '';
    });

    /* ── the guided tour: packets travel the edges step by step ── */
    const STEP = 1.1, GAP = 0.25, PAUSE = 1.6;
    const packetGeo = new THREE.SphereGeometry(0.1, 20, 14);
    const packets = [];
    function packet(i) {
      if (!packets[i]) {
        packets[i] = new THREE.Mesh(packetGeo, mats.packet);
        packets[i].castShadow = true;
        group.add(packets[i]);
      }
      return packets[i];
    }
    function hops(step) {
      return step.go.map(s => {
        const [from, to] = s.split('>');
        const fwd = edges.find(e => e.a === from && e.b === to);
        const back = edges.find(e => e.a === to && e.b === from);
        return { edge: fwd || back, reverse: !fwd, to };
      }).filter(h => h.edge);
    }
    const steps = spec.steps.map(s => ({ ...s, hops: hops(s) }));
    let stepIndex = 0, stepTime = 0, landed = false;

    function restart() { stepIndex = 0; stepTime = 0; landed = false; beginStep(); }
    function beginStep() {
      const s = steps[stepIndex];
      if (!selected) say(s.say);
      nodes.forEach(n => { n.active = false; });
      s.hops.forEach(h => { nodeById[h.to].active = true; });
    }
    function advance(dt) {
      stepTime += dt;
      const s = steps[stepIndex];
      const t = Math.min(stepTime / STEP, 1);
      const ease = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      s.hops.forEach((h, i) => {
        const p = packet(i);
        p.visible = t < 1;
        p.position.copy(h.edge.curve.getPoint(h.reverse ? 1 - ease : ease));
      });
      for (let i = s.hops.length; i < packets.length; i++) packets[i].visible = false;
      if (t >= 1 && !landed) {
        landed = true;
        s.hops.forEach(h => { nodeById[h.to].flash = 1; });
      }
      const last = stepIndex === steps.length - 1;
      if (stepTime >= STEP + (last ? PAUSE : GAP)) {
        stepIndex = (stepIndex + 1) % steps.length;
        stepTime = 0;
        landed = false;
        beginStep();
      }
    }

    /* ── highlight: selection, the step's target, and the arrival flash ── */
    function paint(dt) {
      nodes.forEach(n => {
        n.flash = Math.max(0, n.flash - dt * 1.6);
        const lit = n.id === selected ? 0.5 : (view.playing && n.active ? 0.18 : 0);
        const k = Math.max(lit, n.flash * 0.7);
        n.mats.forEach(m => { m.emissiveIntensity = k; });
        n.el.classList.toggle('is-selected', n.id === selected);
        n.el.classList.toggle('is-active', view.playing && n.active && !selected);
      });
    }

    /* ── render loop, only while the diagram is on screen ── */
    const clock = new THREE.Clock();
    let onScreen = true, frame = 0;
    function tick() {
      frame = 0;
      const dt = Math.min(clock.getDelta(), 0.05);
      const time = clock.elapsedTime;
      if (view.playing) advance(dt);
      else packets.forEach(p => { p.visible = false; });
      paint(dt);
      /* a gentle idle sway so the depth reads, paused after the visitor takes over */
      if (!reduceMotion && time - lastInteraction > 6)
        group.rotation.y += (Math.sin(time * 0.3) * 0.1 - group.rotation.y) * Math.min(1, dt * 2);
      controls?.update();
      renderer.render(scene, camera);
      labels.render(scene, camera);
      if (onScreen && !document.hidden) frame = requestAnimationFrame(tick);
    }
    function wake() { if (!frame && onScreen && !document.hidden) { clock.getDelta(); frame = requestAnimationFrame(tick); } }
    new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; wake(); }).observe(stage);
    document.addEventListener('visibilitychange', wake);
    new ResizeObserver(resize).observe(stage);
    new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    const api = {
      playing: false,
      restart,
      select(id) { if (id) lastInteraction = clock.elapsedTime; }
    };
    view = api; /* tick() reads view.playing */
    applyTheme();
    resize();
    restart();
    if (reduceMotion) say(spec.intro);
    wake();
    return api;
  }
})();
