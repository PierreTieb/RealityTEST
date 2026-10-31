// atom-view.js
// Vue « Atome » : un atome (lithium au départ) flotte au-dessus du repère.
// Protons rouges et neutrons verts (taille 1) forment le noyau ; électrons bleus (taille 0,3)
// sur des orbites circulaires de plans différents, avec une courte traînée de comète.
// Si le nombre de neutrons n'est pas celui de l'isotope le plus courant, chaque nucléon s'agite
// (un tremblement d'ensemble serait masqué par celui de la caméra).
import * as THREE from 'three';
import { getByZ, ionName, chargeText } from './elements.js';
import { popScale, randomUnit, satin, SHRINK_TIME, UNIVERSAL_MARKERS } from './util.js';

const NUCLEON_R = 0.5;
const ELECTRON_R = NUCLEON_R * 0.3;
const ORBIT_PERIOD = 2;             // s pour un tour du noyau
const ATOM_SCALE = 0.18;            // unités de l'atome -> côtés du repère
const ATOM_LIFT = 0.95;             // hauteur du centre de l'atome au-dessus du repère
const CARD_RADIUS = 4.6;            // rayon (unités atome) au-dessus duquel flotte la fiche
const START = { p: 3, n: 4, e: 3 }; // lithium
const LIMITS = { p: [1, 20], n: [0, 30], e: [0, 20] };
const PACK_SPEED = 10;              // vitesse de réarrangement du noyau
const SHAKE = 0.14;                 // amplitude de l'agitation de chaque nucléon (noyau instable)
const TRAIL = 16;                   // points de la traînée
const TRAIL_STEP = 0.05;            // écart angulaire entre deux points de traînée (rad)
const COLORS = { p: 0xff2a2a, n: 0x1fcf4a, e: 0x1e6dff, halo: 0x8fd4ff };
const NAMES = { p: 'Protons', n: 'Neutrons', e: 'Électrons' };

// Orbite tirée au hasard pour chaque électron : plan, rayon, point de départ et sens de rotation.
function randomOrbit() {
  const normal = randomUnit();
  const u = new THREE.Vector3(0, 1, 0).cross(normal);
  if (u.lengthSq() < 1e-4) u.set(1, 0, 0);
  u.normalize();
  const v = new THREE.Vector3().crossVectors(normal, u);
  return {
    u, v,
    radius: 2.6 + Math.random() * 1.6,
    phase: Math.random() * Math.PI * 2,
    dir: Math.random() < 0.5 ? 1 : -1
  };
}

// Empilement compact : attraction vers le centre + séparation des sphères qui se chevauchent.
function relax(pts) {
  const d0 = NUCLEON_R * 2 * 0.97, d = new THREE.Vector3();
  for (let it = 0; it < 60; it++) {
    for (const p of pts) p.multiplyScalar(0.92);
    for (let pass = 0; pass < 4; pass++) {
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          d.subVectors(pts[i], pts[j]);
          let len = d.length();
          if (len >= d0) continue;
          if (len < 1e-6) { d.copy(randomUnit()); len = 1; }
          d.multiplyScalar((d0 - len) / 2 / len);
          pts[i].add(d);
          pts[j].sub(d);
        }
      }
    }
  }
  const c = new THREE.Vector3();
  pts.forEach(p => c.add(p));
  if (pts.length) c.divideScalar(pts.length);
  pts.forEach(p => p.sub(c));
}

// Halos et traînées des électrons : un seul nuage de points (un seul dessin).
function makeTrails(maxPoints) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(maxPoints * 3), 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(maxPoints), 1));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(maxPoints), 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 1 }, uColor: { value: new THREE.Color(COLORS.halo) } },
    vertexShader: `
      attribute float aSize; attribute float aAlpha; uniform float uScale; varying float vAlpha;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aSize * uScale / -mv.z;
        vAlpha = aAlpha;
      }`,
    fragmentShader: `
      uniform vec3 uColor; varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = smoothstep(1.0, 0.0, d);
        gl_FragColor = vec4(uColor, a * a * vAlpha);
      }`,
    transparent: true,
    depthWrite: false
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return points;
}

export class AtomView {
  static markers = UNIVERSAL_MARKERS;   // lien sous « Montre le repère » vers le menu du repère (voir app.js)

  // ui : { card, controls }
  constructor(stage, ui) {
    this.stage = stage;
    this.ui = ui;
    this.time = 0;
    this.nucleons = [];
    this.electrons = [];
    this.abort = new AbortController();

    this.root = new THREE.Group();
    this.root.position.set(0, 0, ATOM_LIFT);
    this.root.scale.setScalar(ATOM_SCALE);
    this.nucleus = new THREE.Group();
    this.root.add(this.nucleus);
    stage.anchor.add(this.root);

    this.geo = {
      nucleon: new THREE.SphereGeometry(NUCLEON_R, 32, 24),
      electron: new THREE.SphereGeometry(ELECTRON_R, 20, 14)
    };
    this.mat = { p: satin(COLORS.p), n: satin(COLORS.n), e: satin(COLORS.e) };
    this.mat.e.emissive.set(COLORS.e).multiplyScalar(0.25);

    this.trails = makeTrails(20 * (TRAIL + 1));
    this.root.add(this.trails);

    for (let i = 0; i < START.p; i++) this.addNucleon('p', true);
    for (let i = 0; i < START.n; i++) this.addNucleon('n', true);
    for (let i = 0; i < START.e; i++) this.addElectron(true);

    this.buildControls();
    this.refresh();
    stage.onFrame = dt => this.frame(dt);
  }

  dispose() {
    this.abort.abort();
    this.stage.onFrame = null;
    this.stage.anchor.remove(this.root);
    Object.values(this.geo).forEach(g => g.dispose());
    Object.values(this.mat).forEach(m => m.dispose());
    this.trails.geometry.dispose();
    this.trails.material.dispose();
    this.ui.controls.innerHTML = '';
    this.ui.card.innerHTML = '';
  }

  // ---------- Composition ----------

  count(type) {
    if (type === 'e') return this.electrons.filter(e => !e.dying).length;
    return this.nucleons.filter(n => n.type === type && !n.dying).length;
  }

  change(type, dir) {
    const c = this.count(type), [min, max] = LIMITS[type];
    if (dir > 0 && c < max) type === 'e' ? this.addElectron() : this.addNucleon(type);
    else if (dir < 0 && c > min) type === 'e' ? this.removeElectron() : this.removeNucleon(type);
    else return;
    this.refresh();
  }

  livingNucleons() { return this.nucleons.filter(n => !n.dying); }

  pack() {
    const living = this.livingNucleons();
    const pts = living.map(n => n.target.clone());
    relax(pts);
    living.forEach((n, i) => n.target.copy(pts[i]));
  }

  // La nouvelle particule apparaît dans le noyau (en gonflant), les autres lui font de la place.
  addNucleon(type, instant) {
    const r = 0.6 * NUCLEON_R * Math.cbrt(this.livingNucleons().length);
    const mesh = new THREE.Mesh(this.geo.nucleon, this.mat[type]);
    // target : place dans l'empilement ; base : position actuelle (rejoint target), sans l'agitation.
    const n = { type, mesh, target: randomUnit().multiplyScalar(r), base: new THREE.Vector3(), born: instant ? -1 : this.time, dying: false };
    this.nucleons.push(n);
    this.nucleus.add(mesh);
    this.pack();
    n.base.copy(n.target);
    mesh.position.copy(n.target);
    if (instant) this.livingNucleons().forEach(o => o.base.copy(o.target));
    mesh.scale.setScalar(instant ? 1 : 0.001);
  }

  // On retire la particule de ce type la plus à l'extérieur ; le noyau se resserre.
  removeNucleon(type) {
    const list = this.livingNucleons().filter(n => n.type === type);
    if (!list.length) return;
    list.sort((a, b) => b.target.lengthSq() - a.target.lengthSq());
    list[0].dying = true;
    list[0].deathStart = this.time;
    this.pack();
  }

  addElectron(instant) {
    const mesh = new THREE.Mesh(this.geo.electron, this.mat.e);
    mesh.scale.setScalar(instant ? 1 : 0.001);
    this.root.add(mesh);
    this.electrons.push({ orbit: randomOrbit(), mesh, born: instant ? -1 : this.time, dying: false });
  }

  // On retire le dernier électron ajouté.
  removeElectron() {
    const e = this.electrons.filter(el => !el.dying).pop();
    if (!e) return;
    e.dying = true;
    e.deathStart = this.time;
  }

  unstable() {
    const p = this.count('p'), el = getByZ(p);
    return !el || this.count('n') !== el.mass - p;
  }

  // ---------- Interface ----------

  buildControls() {
    const box = this.ui.controls;
    box.innerHTML = ['p', 'n', 'e'].map(t =>
      `<div class="ctrl ctrl--${t}">
        <button class="ctrl__btn ctrl__btn--up" data-type="${t}" data-dir="1" aria-label="Ajouter"><span>+</span></button>
        <div class="ctrl__label" data-label="${t}"></div>
        <button class="ctrl__btn ctrl__btn--down" data-type="${t}" data-dir="-1" aria-label="Retirer"><span>−</span></button>
      </div>`).join('');
    box.addEventListener('click', e => {
      const b = e.target.closest('button[data-type]');
      if (b) this.change(b.dataset.type, +b.dataset.dir);
    }, { signal: this.abort.signal });
  }

  refresh() {
    const c = { p: this.count('p'), n: this.count('n'), e: this.count('e') };
    const box = this.ui.controls;
    for (const t of ['p', 'n', 'e']) {
      box.querySelector(`[data-label="${t}"]`).textContent = `${NAMES[t]} (${c[t]})`;
      box.querySelector(`[data-type="${t}"][data-dir="1"]`).disabled = c[t] >= LIMITS[t][1];
      box.querySelector(`[data-type="${t}"][data-dir="-1"]`).disabled = c[t] <= LIMITS[t][0];
    }

    const el = getByZ(c.p), charge = c.p - c.e;
    const ion = charge ? ionName(el.symbol, charge) : null;
    let html = `<div class="card__name">${charge && ion ? ion : el.name}</div>`;
    if (charge && !ion) {
      html += `<div class="card__noion">Ion qui n'existe pas</div>`;
    } else {
      html += `<div class="card__formula">
          <span class="card__nota"><span>${c.p + c.n}</span><span>${c.p}</span></span>
          <span class="card__sym">${el.symbol}</span>
          <span class="card__charge card__charge--${charge > 0 ? 'pos' : 'neg'}">${chargeText(charge)}</span>
        </div>
        <div class="card__status card__status--${charge > 0 ? 'pos' : charge < 0 ? 'neg' : 'ok'}">${
          charge > 0 ? 'Ion positif' : charge < 0 ? 'Ion négatif' : 'Atome neutre'}</div>`;
    }
    this.ui.card.innerHTML = html;
    this.isUnstable = this.unstable();
  }

  // ---------- Animation ----------

  frame(dt) {
    this.time += dt;
    const t = this.time, k = 1 - Math.exp(-dt * PACK_SPEED);

    this.nucleons = this.nucleons.filter(n => {
      if (n.dying) {
        const x = (t - n.deathStart) / SHRINK_TIME;
        if (x >= 1) { this.nucleus.remove(n.mesh); return false; }
        n.mesh.scale.setScalar(1 - x * x);
      } else {
        n.base.lerp(n.target, k);
        n.mesh.scale.setScalar(Math.max(0.001, popScale(t - n.born)));
      }
      n.mesh.position.copy(n.base);
      if (this.isUnstable) n.mesh.position.add(randomUnit().multiplyScalar(SHAKE * Math.random()));
      return true;
    });

    const pos = this.trails.geometry.attributes.position.array;
    const size = this.trails.geometry.attributes.aSize.array;
    const alpha = this.trails.geometry.attributes.aAlpha.array;
    const omega = 2 * Math.PI / ORBIT_PERIOD;
    let np = 0;
    const put = (o, angle, s, a) => {
      const c = Math.cos(angle) * o.radius, sn = Math.sin(angle) * o.radius;
      pos[np * 3] = o.u.x * c + o.v.x * sn;
      pos[np * 3 + 1] = o.u.y * c + o.v.y * sn;
      pos[np * 3 + 2] = o.u.z * c + o.v.z * sn;
      size[np] = s;
      alpha[np] = a;
      np++;
    };

    this.electrons = this.electrons.filter(e => {
      let s;
      if (e.dying) {
        const x = (t - e.deathStart) / SHRINK_TIME;
        if (x >= 1) { this.root.remove(e.mesh); return false; }
        s = 1 - x * x;
      } else {
        s = Math.max(0.001, popScale(t - e.born));
      }
      const o = e.orbit, angle = o.phase + o.dir * omega * t;
      e.mesh.scale.setScalar(s);
      e.mesh.position.set(
        o.u.x * Math.cos(angle) * o.radius + o.v.x * Math.sin(angle) * o.radius,
        o.u.y * Math.cos(angle) * o.radius + o.v.y * Math.sin(angle) * o.radius,
        o.u.z * Math.cos(angle) * o.radius + o.v.z * Math.sin(angle) * o.radius);
      const vis = Math.min(1, s);
      put(o, angle, 1.1 * s, 0.85 * vis);                       // halo
      for (let i = 1; i <= TRAIL; i++) {                        // traînée de comète (derrière, selon le sens)
        const f = 1 - i / (TRAIL + 1);
        put(o, angle - o.dir * i * TRAIL_STEP, 0.55 * f * s, 0.8 * f * f * vis);
      }
      return true;
    });

    const g = this.trails.geometry;
    g.setDrawRange(0, np);
    g.attributes.position.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
    g.attributes.aAlpha.needsUpdate = true;
    this.trails.material.uniforms.uScale.value = this.stage.pointScale * ATOM_SCALE;

    this.placeCard();
  }

  // La fiche flotte au-dessus de l'atome, toujours face à l'écran.
  placeCard() {
    const center = this.root.getWorldPosition(new THREE.Vector3());
    const top = center.clone().add(new THREE.Vector3(0, CARD_RADIUS * ATOM_SCALE, 0));
    const a = this.stage.toScreen(top);
    const card = this.ui.card;
    card.style.transform = `translate(${a.x.toFixed(1)}px, ${Math.max(card.offsetHeight + 8, a.y).toFixed(1)}px) translate(-50%, -100%)`;
  }
}
