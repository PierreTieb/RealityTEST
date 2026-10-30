// chrono-view.js
// Module « Chronophotographie » (repère universel). Un objet se déplace en laissant derrière lui ses
// positions successives à intervalles de temps réguliers (clichés translucides + point au centre).
// - Sujet : voiture (repère posé sur la table) ou balle (repère collé au mur : elle tombe vers le bas
//   du repère).
// - Trajectoire : voiture : rectiligne uniforme, accélérée ou ralentie, circulaire, virage ;
//   balle : chute libre ou lancer.
// - Curseur : intervalle de temps entre deux clichés.
// Une fois le mouvement fini, la chronophotographie reste affichée, s'efface en fondu et recommence.
import * as THREE from 'three';
import { UNIVERSAL_MARKERS } from './util.js';

const HOLD = 2.5, FADE = 0.8, PAUSE = 0.4;   // s : affichage final, fondu, pause avant de recommencer
const GHOST_OPACITY = 0.38;

// Trajectoires : durée (s) et position / direction au temps t, dans le repère (côtés de repère, z vers le haut).
// Voiture : sur la table (z = 0). Balle : repère au mur, la gravité est vers -y.
const G = 1.7;   // « pesanteur » de l'animation (chute ralentie pour être visible)
function virage() {
  // ligne droite, quart de cercle, ligne droite : parcourus à vitesse constante
  const r = 1, pts = [];
  for (let i = 0; i <= 20; i++) pts.push(new THREE.Vector3(-1.9 + 1.9 * i / 20, -1, 0));
  for (let i = 1; i <= 30; i++) { const a = -Math.PI / 2 + Math.PI / 2 * i / 30; pts.push(new THREE.Vector3(Math.cos(a) * r, -1 + r + Math.sin(a) * r, 0)); }
  for (let i = 1; i <= 20; i++) pts.push(new THREE.Vector3(1, 0 + 1.5 * i / 20, 0));
  return new THREE.CatmullRomCurve3(pts);
}
const VIRAGE = virage();
const MOTIONS = {
  car: {
    uniforme: { name: 'Rectiligne uniforme', T: 3, at: t => new THREE.Vector3(-1.8 + 1.2 * t, 0, 0) },
    accelere: { name: 'Rectiligne accéléré', T: 3, at: t => new THREE.Vector3(-1.8 + 0.4 * t * t, 0, 0) },
    ralenti: { name: 'Rectiligne ralenti', T: 3, at: t => new THREE.Vector3(-1.8 + 2.4 * t - 0.4 * t * t, 0, 0) },
    circulaire: { name: 'Circulaire uniforme', T: 4, at: t => { const a = -Math.PI / 2 + t / 4 * 2 * Math.PI; return new THREE.Vector3(Math.cos(a) * 1.3, Math.sin(a) * 1.3, 0); } },
    virage: { name: 'Avec un virage', T: 4, at: t => VIRAGE.getPointAt(Math.min(1, t / 4)) }
  },
  ball: {
    chute: { name: 'Chute libre', T: 2, at: t => new THREE.Vector3(0, 1.7 - 0.5 * G * t * t, 0.25) },
    lancer: { name: 'Lancer', T: 2.3, at: t => new THREE.Vector3(-1.6 + 1.4 * t, 1.2 + 0.9 * t - 0.5 * G * t * t, 0.25) }
  }
};

function carModel(mats) {
  const g = new THREE.Group();
  const box = (w, l, h, m, x, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(l, w, h), m); b.position.set(x, 0, z); g.add(b); return b; };
  box(0.26, 0.56, 0.1, mats.body, 0, 0.1);
  box(0.22, 0.28, 0.09, mats.body, -0.03, 0.19);
  box(0.23, 0.2, 0.06, mats.glass, -0.03, 0.2);
  const wheel = new THREE.CylinderGeometry(0.06, 0.06, 0.05, 16);
  for (const [x, y] of [[0.17, 0.13], [0.17, -0.13], [-0.17, 0.13], [-0.17, -0.13]]) {
    const w = new THREE.Mesh(wheel, mats.wheel);
    w.position.set(x, y, 0.06);
    g.add(w);
  }
  return g;
}

function ballModel(mats) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 16), mats.body));
  return g;
}

export class ChronoView {
  static markers = UNIVERSAL_MARKERS;

  constructor(stage, ui) {
    this.stage = stage;
    this.ui = ui;
    this.subject = 'car';
    this.motion = 'uniforme';
    this.dt = 0.2;
    this.abort = new AbortController();
    this.root = new THREE.Group();
    stage.anchor.add(this.root);

    const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.1, transparent: true, ...extra });
    this.mats = {
      main: { body: std(0xe63946), glass: std(0x2b3a55), wheel: std(0x1b1b1b) },
      ghost: { body: std(0xe63946, { opacity: GHOST_OPACITY, depthWrite: false }), glass: std(0x2b3a55, { opacity: GHOST_OPACITY, depthWrite: false }), wheel: std(0x1b1b1b, { opacity: GHOST_OPACITY, depthWrite: false }) },
      dot: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }),
      ballMain: std(0xff8a3d), ballGhost: std(0xff8a3d, { opacity: GHOST_OPACITY, depthWrite: false })
    };
    this.dotGeo = new THREE.SphereGeometry(0.035, 12, 8);
    this.buildUi();
    this.restart();
    stage.onFrame = dt => this.frame(dt);
  }

  dispose() {
    this.abort.abort();
    this.stage.onFrame = null;
    this.stage.anchor.remove(this.root);
    this.root.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    this.dotGeo.dispose();
    const m = this.mats;
    [...Object.values(m.main), ...Object.values(m.ghost), m.dot, m.ballMain, m.ballGhost].forEach(x => x.dispose());
    this.ui.controls.innerHTML = '';
  }

  // ---------- Interface ----------

  buildUi() {
    const box = this.ui.controls;
    box.innerHTML = `<div class="ctl-panel">
        <div class="ctl-row" data-row="subject">
          <button class="opt" data-subject="car">🚗 Voiture</button>
          <button class="opt" data-subject="ball">⚽ Balle</button>
        </div>
        <div class="ctl-row" data-row="motion"></div>
        <label class="ctl-slider"><span data-label="dt"></span><input type="range" min="0.1" max="0.5" step="0.05" value="0.2" data-act="dt"></label>
        <div class="ctl-note" data-note></div>
      </div>`;
    const sig = { signal: this.abort.signal };
    box.addEventListener('click', e => {
      const s = e.target.closest('[data-subject]'), m = e.target.closest('[data-motion]');
      if (s && s.dataset.subject !== this.subject) { this.subject = s.dataset.subject; this.motion = Object.keys(MOTIONS[this.subject])[0]; }
      else if (m) this.motion = m.dataset.motion;
      else return;
      this.restart();
    }, sig);
    box.querySelector('[data-act=dt]').addEventListener('input', e => { this.dt = +e.target.value; this.restart(); }, sig);
  }

  refreshUi() {
    const box = this.ui.controls;
    box.querySelectorAll('[data-subject]').forEach(b => b.classList.toggle('opt--on', b.dataset.subject === this.subject));
    box.querySelector('[data-row=motion]').innerHTML = Object.entries(MOTIONS[this.subject])
      .map(([k, m]) => `<button class="opt opt--small${k === this.motion ? ' opt--on' : ''}" data-motion="${k}">${m.name}</button>`).join('');
    box.querySelector('[data-label=dt]').textContent = `Intervalle entre deux clichés : ${this.dt.toFixed(2).replace('.', ',')} s`;
    box.querySelector('[data-note]').textContent = this.subject === 'ball'
      ? 'Colle le repère sur un mur : la balle tombe vers le bas du repère.'
      : 'Pose le repère à plat sur la table.';
  }

  // ---------- Animation ----------

  makeSubject(ghost) {
    if (this.subject === 'car') return carModel(ghost ? this.mats.ghost : this.mats.main);
    return ballModel({ body: ghost ? this.mats.ballGhost : this.mats.ballMain });
  }

  restart() {
    this.root.traverse(o => { if (o.geometry && o.geometry !== this.dotGeo) o.geometry.dispose(); });
    this.root.clear();
    this.refreshUi();
    this.t = 0;
    this.shots = 0;
    this.main = this.makeSubject(false);
    this.root.add(this.main);
    this.setOpacity(1);
  }

  // Pose de l'objet au temps t : position et orientation selon la direction du mouvement (voiture).
  place(obj, t) {
    const m = MOTIONS[this.subject][this.motion], p = m.at(Math.min(t, m.T));
    obj.position.copy(p);
    if (this.subject === 'car') {
      const a = m.at(Math.max(0, Math.min(t, m.T) - 0.02)), b = m.at(Math.min(m.T, Math.min(t, m.T) + 0.02));
      if (b.distanceToSquared(a) > 1e-8) obj.rotation.z = Math.atan2(b.y - a.y, b.x - a.x);
    }
  }

  setOpacity(f) {
    const m = this.mats;
    Object.values(m.main).forEach(x => { x.opacity = f; });
    Object.values(m.ghost).forEach(x => { x.opacity = GHOST_OPACITY * f; });
    m.ballMain.opacity = f;
    m.ballGhost.opacity = GHOST_OPACITY * f;
    m.dot.opacity = f;
  }

  frame(dt) {
    const m = MOTIONS[this.subject][this.motion];
    this.t += dt;
    // Clichés : un à chaque intervalle, tant que le mouvement dure.
    while (this.shots * this.dt <= Math.min(this.t, m.T) + 1e-6) {
      const ts = this.shots * this.dt, ghost = this.makeSubject(true);
      this.place(ghost, ts);
      const dot = new THREE.Mesh(this.dotGeo, this.mats.dot);
      dot.position.copy(ghost.position);
      dot.position.z += this.subject === 'car' ? 0.3 : 0;   // au-dessus de la voiture, au centre de la balle
      this.root.add(ghost, dot);
      this.shots++;
    }
    this.place(this.main, this.t);
    const after = this.t - m.T;
    if (after > HOLD) this.setOpacity(Math.max(0, 1 - (after - HOLD) / FADE));
    if (after > HOLD + FADE + PAUSE) this.restart();
  }
}
