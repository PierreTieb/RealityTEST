// home.js
// Accueil : fond sombre façon tableau noir, couvert de figures géométriques dessinées à la craie
// (schémas en perspective : cube, sphère, cylindre, cône, pyramide, prisme, axes, vecteurs),
// tirées et placées au hasard à chaque ouverture ; et les animations des deux cartes.
// Tout est en pause quand l'accueil n'est pas affiché, et figé si l'utilisateur préfère réduire les animations.
(() => {
  const $ = id => document.getElementById(id);
  const home = $('screen-home');
  const visible = () => home.classList.contains('screen--active');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Fond : figures à la craie ----------
  // Chaque figure tient dans un carré de 100 × 100 ; arêtes cachées en pointillés, vecteurs fléchés.
  const H = 'stroke-dasharray="4 5"';
  const FIGURES = [
    // cube
    `<path d="M18 38h44v44H18zM18 38l20-20h44l-20 20M62 82l20-20V18M62 38l20-20"/><path ${H} d="M18 82l20-20h44M38 62V18"/>`,
    // sphère : équateur (moitié arrière en pointillés), centre, rayon fléché
    `<circle cx="50" cy="50" r="36"/><path d="M14 50a36 11 0 0 0 72 0"/><path ${H} d="M14 50a36 11 0 0 1 72 0"/><circle cx="50" cy="50" r="1.6" fill="#fff"/><path class="v" d="M50 50L76 30"/>`,
    // cylindre
    `<ellipse cx="50" cy="22" rx="28" ry="9"/><path d="M22 22v56M78 22v56M22 78a28 9 0 0 0 56 0"/><path ${H} d="M22 78a28 9 0 0 1 56 0"/>`,
    // cône
    `<path d="M50 12L20 78M50 12L80 78M20 78a30 9 0 0 0 60 0"/><path ${H} d="M20 78a30 9 0 0 1 60 0M50 12v66"/>`,
    // pyramide à base carrée
    `<path d="M50 12L16 72l34 14 36-24zM50 12l36 50M50 12L50 86"/><path ${H} d="M16 72l36-22 34 12M52 50L50 12"/>`,
    // prisme droit à base triangulaire
    `<path d="M16 34l22 -16 22 16zM16 34v46l22-14M60 34v46L38 66M16 80h44"/><path ${H} d="M38 18v48"/><path d="M60 34l24 0v46H60M84 34L62 18"/>`,
    // axes x, y, z en perspective
    `<path class="v" d="M30 70H88"/><path class="v" d="M30 70V12"/><path class="v" d="M30 70L8 92"/><text x="86" y="84">x</text><text x="36" y="16">y</text><text x="4" y="82">z</text>`,
    // vecteurs : somme de deux forces (règle du parallélogramme)
    `<path class="v" d="M14 80L52 72"/><path class="v" d="M14 80L30 34"/><path ${H} d="M52 72L68 26M30 34L68 26"/><path class="v" d="M14 80L68 26"/><text x="50" y="88">F₁</text><text x="12" y="34">F₂</text>`,
    // pavé droit avec cotes
    `<path d="M10 44h54v34H10zM10 44l16-16h54L64 44M64 78l16-16V28"/><path ${H} d="M10 78l16-16h54M26 62V28"/><path d="M10 88h54M10 85v6M64 85v6"/>`,
    // tétraèdre
    `<path d="M50 10L14 78l60 8zM50 10l36 52-12 24"/><path ${H} d="M14 78l72-16"/>`,
    // repère et angle
    `<path class="v" d="M16 80H86"/><path class="v" d="M16 80L66 30"/><path d="M40 80a24 24 0 0 0-7-17"/><text x="44" y="72">α</text>`,
    // demi-sphère sur un plan
    `<path d="M8 78l20-20h64L72 78z"/><path d="M24 66a26 26 0 0 1 52 0"/><path d="M24 66a26 7 0 0 0 52 0"/><path ${H} d="M24 66a26 7 0 0 1 52 0"/>`
  ];
  function drawBackground() {
    const w = Math.max(window.innerWidth, 320), h = Math.max(window.innerHeight, 480), cell = 118;
    const cols = Math.ceil(w / cell) + 1, rows = Math.ceil(h / cell) + 1;
    let uses = '';
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const x = (i + (Math.random() - .5) * .5) * cell, y = (j + (Math.random() - .5) * .5) * cell;
      const s = .55 + Math.random() * .45, r = (Math.random() - .5) * 40, op = .28 + Math.random() * .4;
      uses += `<use href="#fig${Math.random() * FIGURES.length | 0}" transform="translate(${x.toFixed(0)} ${y.toFixed(0)}) rotate(${r.toFixed(0)}) scale(${s.toFixed(2)}) translate(-50 -50)" opacity="${op.toFixed(2)}"/>`;
    }
    $('home-bg').innerHTML =
      `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
        <defs>
          <filter id="chalk" x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="3" result="n"/>
            <feDisplacementMap in="SourceGraphic" in2="n" scale="2.2" result="d"/>
            <feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 -2.2 1.9" result="grain"/>
            <feComposite in="d" in2="grain" operator="in"/>
          </filter>
          <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M1 1L9 5L1 9" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
          </marker>
          ${FIGURES.map((f, i) => `<g id="fig${i}">${f}</g>`).join('')}
        </defs>
        <g fill="none" stroke="#f4f4ee" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" filter="url(#chalk)">${uses}</g>
      </svg>`;
  }
  let drawn = { w: 0, h: 0 }, resizeTimer = 0;
  const redraw = () => {
    // seulement si l'écran devient plus grand que le dessin (rotation…) : pas de nouveau tirage pour rien
    if (window.innerWidth <= drawn.w && window.innerHeight <= drawn.h) return;
    drawBackground();
    drawn = { w: window.innerWidth, h: window.innerHeight };
  };
  redraw();
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(redraw, 400); });

  // ---------- Carte « atomes » : lithium (3 électrons sur orbites inclinées, traînées d'étoile filante) ----------
  // Repris de la carte « tailles » de Diverses Questions Scientifiques.
  const drawAtom = (() => {
    const NS = 'http://www.w3.org/2000/svg', mk = (t, a) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); return e; };
    const AX = 84, AY = 60, RX = 46, RY = 10, N = 26, SPAN = 220 * Math.PI / 180;
    const G = { ob: $('orb-back'), of: $('orb-front'), eb: $('el-back'), ef: $('el-front') };
    let s = '';
    for (let i = 0; i < 40; i++) s += `<circle cx="${(Math.random() * 320).toFixed(1)}" cy="${(Math.random() * 120).toFixed(1)}" r="${(.5 + Math.random() * .6).toFixed(1)}" fill-opacity="${(.25 + Math.random() * .5).toFixed(2)}"/>`;
    $('atom-stars').innerHTML = s;
    // inclinaison de l'orbite (°), position de départ de l'électron (°), durée d'un tour (s)
    const O = [[0, 150, 3.2], [60, 330, 4.1], [-60, 120, 3.6]].map(([r, t, p]) => ({
      c: Math.cos(r * Math.PI / 180), s: Math.sin(r * Math.PI / 180), t0: t * Math.PI / 180, w: 2 * Math.PI / p,
      seg: Array.from({ length: N }, (_, k) => { const u = (k + 1) / N; return mk('path', { 'stroke-opacity': (u ** 1.6 * .95).toFixed(2), 'stroke-width': (.5 + u * 2).toFixed(1) }); }),
      el: (() => { const g = mk('g', {}); g.append(mk('circle', { r: 8, fill: 'url(#g-eh)' }), mk('circle', { r: 3.4, fill: 'url(#g-e)' })); return g; })()
    }));
    const pt = (o, t) => { const x = RX * Math.cos(t), y = RY * Math.sin(t); return [AX + x * o.c - y * o.s, AY + x * o.s + y * o.c]; };
    const put = (e, g) => { if (e.parentNode !== g) g.append(e); };
    return ms => {
      for (const o of O) {
        const te = o.t0 + o.w * ms / 1000;
        o.seg.forEach((e, k) => {
          const a0 = te - SPAN + SPAN * k / N, a1 = te - SPAN + SPAN * (k + 1) / N, p = pt(o, a0), q = pt(o, a1);
          e.setAttribute('d', `M${p[0].toFixed(1)} ${p[1].toFixed(1)}L${q[0].toFixed(1)} ${q[1].toFixed(1)}`);
          put(e, Math.sin((a0 + a1) / 2) > 0 ? G.of : G.ob);
        });
        const p = pt(o, te);
        o.el.setAttribute('transform', `translate(${p[0].toFixed(1)} ${p[1].toFixed(1)})`);
        put(o.el, Math.sin(te) > 0 ? G.ef : G.eb);
      }
    };
  })();

  // ---------- Carte « transformation » : CO₂ -> C + O₂ en 3 s, puis retour en 3 s ----------
  const drawReaction = (() => {
    const C = $('rx-c'), O1 = $('rx-o1'), O2 = $('rx-o2'), plus = $('rx-plus'), glow = $('rx-glow'), L = $('rx-left'), R = $('rx-right');
    const ease = e => e < .5 ? 2 * e * e : 1 - (-2 * e + 2) ** 2 / 2;
    // positions [x, y] : molécule de CO₂ / atome de carbone + molécule de dioxygène
    const A = { c: [160, 58], o1: [129, 58], o2: [191, 58] }, B = { c: [104, 58], o1: [193, 58], o2: [224, 58] };
    const at = (g, p) => g.setAttribute('transform', `translate(${p[0].toFixed(1)} ${p[1].toFixed(1)})`);
    return ms => {
      const t = ms / 1000 % 6;
      // déplacement entre 0,4 s et 1,8 s de chaque demi-cycle, puis pause
      const raw = t < 3 ? (t - .4) / 1.4 : 1 - (t - 3.4) / 1.4;
      const e = ease(Math.max(0, Math.min(1, raw)));
      const lerp = (a, b) => [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e];
      const arc = Math.sin(Math.PI * e);
      at(C, lerp(A.c, B.c).map((v, i) => i ? v + arc * 8 : v));
      at(O1, lerp(A.o1, B.o1).map((v, i) => i ? v - arc * 34 : v));   // passe par-dessus le carbone
      at(O2, lerp(A.o2, B.o2).map((v, i) => i ? v - arc * 10 : v));
      plus.setAttribute('opacity', Math.max(0, e * 2 - 1).toFixed(2));
      L.setAttribute('opacity', Math.max(0, 1 - e * 2).toFixed(2));   // l'un s'efface avant que l'autre apparaisse
      R.setAttribute('opacity', Math.max(0, e * 2 - 1).toFixed(2));
      glow.setAttribute('opacity', (arc * .9).toFixed(2));
    };
  })();

  // ---------- Carte « Soleil/Terre/Lune » : la Terre tourne (continents qui défilent), le Soleil scintille ----------
  const drawSky = (() => {
    const NS = 'http://www.w3.org/2000/svg';
    let s = '';
    for (let i = 0; i < 50; i++) s += `<circle cx="${(Math.random() * 320).toFixed(1)}" cy="${(Math.random() * 120).toFixed(1)}" r="${(.4 + Math.random() * .7).toFixed(1)}" fill-opacity="${(.2 + Math.random() * .6).toFixed(2)}"/>`;
    $('sky-stars').innerHTML = s;
    let r = '';
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2, l = i % 2 ? 26 : 38;
      r += `<line x1="${(Math.cos(a) * 14).toFixed(1)}" y1="${(Math.sin(a) * 14).toFixed(1)}" x2="${(Math.cos(a) * l).toFixed(1)}" y2="${(Math.sin(a) * l).toFixed(1)}" stroke-width="${i % 2 ? 1.2 : 2}"/>`;
    }
    $('sun-rays').innerHTML = r;
    // continents : taches dessinées deux fois de suite (largeur 200) pour un défilement sans couture
    const land = $('earth-land');
    const blobs = [[20, 50, 18, 12], [55, 85, 22, 16], [95, 60, 14, 20], [130, 95, 20, 10], [165, 55, 16, 14], [185, 88, 12, 9]];
    for (const off of [0, 200]) for (const [x, y, rx, ry] of blobs) {
      const e = document.createElementNS(NS, 'ellipse');
      Object.entries({ cx: x + off, cy: y, rx, ry }).forEach(([k, v]) => e.setAttribute(k, v));
      land.appendChild(e);
    }
    const rays = $('sun-rays'), glow = $('sun-glow');
    return ms => {
      land.setAttribute('transform', `translate(${(-(ms / 1000 * 8) % 200 + 28).toFixed(1)} 0)`);
      rays.setAttribute('transform', `translate(272 38) rotate(${(ms / 1000 * 6 % 360).toFixed(1)})`);
      glow.setAttribute('r', (34 + Math.sin(ms / 1000 * 2.4) * 2.5).toFixed(1));
    };
  })();

  // ---------- Carte « Chronophotographie » : voiture vue de dessus qui laisse ses clichés, puis fondu ----------
  const drawChrono = (() => {
    const NS = 'http://www.w3.org/2000/svg';
    const car = () => {
      const g = document.createElementNS(NS, 'g');
      g.innerHTML = '<rect x="-20" y="-11" width="40" height="22" rx="7" fill="#e63946"/>' +
        '<rect x="2" y="-8.5" width="9" height="17" rx="3" fill="#2b3a55"/><rect x="-15" y="-8" width="6" height="16" rx="2.5" fill="#2b3a55"/>' +
        '<rect x="-14" y="-13" width="8" height="3" rx="1" fill="#111"/><rect x="8" y="-13" width="8" height="3" rx="1" fill="#111"/>' +
        '<rect x="-14" y="10" width="8" height="3" rx="1" fill="#111"/><rect x="8" y="10" width="8" height="3" rx="1" fill="#111"/>';
      return g;
    };
    const main = car(), ghosts = $('chrono-ghosts');
    $('chrono-car').appendChild(main);
    const MOVE = 2.8, HOLD = .7, FADE = .6, STEP = .35, X0 = 22, X1 = 296;
    let shots = 0, lastCycle = -1;
    return ms => {
      const T = MOVE + HOLD + FADE, cycle = Math.floor(ms / 1000 / T), t = ms / 1000 % T;
      if (cycle !== lastCycle) { lastCycle = cycle; shots = 0; ghosts.innerHTML = ''; }
      const u = Math.min(1, t / MOVE), x = X0 + (X1 - X0) * u * u;   // la voiture accélère : clichés de plus en plus espacés
      while (shots * STEP <= Math.min(t, MOVE)) {
        const s = shots * STEP / MOVE, g = car();
        g.setAttribute('transform', `translate(${(X0 + (X1 - X0) * s * s).toFixed(1)} 62)`);
        g.setAttribute('opacity', '.35');
        ghosts.appendChild(g);
        shots++;
      }
      main.setAttribute('transform', `translate(${x.toFixed(1)} 62)`);
      const fade = t > MOVE + HOLD ? 1 - (t - MOVE - HOLD) / FADE : 1;
      ghosts.setAttribute('opacity', fade.toFixed(2));
      main.setAttribute('opacity', fade.toFixed(2));
    };
  })();

  drawAtom(0);
  drawReaction(0);
  drawSky(0);
  drawChrono(2600);
  if (still) return;
  const loop = ms => {
    if (visible()) { drawAtom(ms); drawReaction(ms); drawSky(ms); drawChrono(ms); }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
})();
