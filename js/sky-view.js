// sky-view.js
// Module « Système Soleil/Terre/Lune » (repère universel). La Terre flotte au-dessus du repère, la Lune
// tourne autour, le Soleil brille au loin et n'éclaire que la face tournée vers lui (ombres portées).
// - Curseur « Position de la Lune » ou animation : phases de la Lune, montrées aussi dans un médaillon
//   « vue depuis la Terre » avec leur nom.
// - L'orbite de la Lune est inclinée (exagéré : 15° au lieu de 5°) : pas d'éclipse à chaque pleine ou
//   nouvelle lune. Pendant l'animation, la ligne des nœuds tourne lentement : une « saison des éclipses »
//   tous les 6 tours. Boutons « Éclipse de Lune » / « Éclipse de Soleil » : on se place directement dessus.
// - Bouton « Ombres » : zones d'ombre derrière la Terre et la Lune (rayons du Soleil parallèles).
// Distances et tailles ne sont pas à l'échelle.
import * as THREE from 'three';
import { UNIVERSAL_MARKERS } from './util.js';

const LIFT = 0.9;               // hauteur de la Terre au-dessus du repère (côtés de repère)
const R_EARTH = 0.26, R_MOON = 0.075, ORBIT = 1.5;
const SUN_POS = new THREE.Vector3(3.3, 1.3, LIFT);   // à droite, un peu en arrière : souvent dans le champ
const TILT = 15 * Math.PI / 180;
const MONTH = 12;               // s pour un tour de la Lune en animation
const NODE_TURN = 12 * MONTH;   // s pour un tour de la ligne des nœuds (alignée avec le Soleil tous les 6 tours)
const DAY = 6;                  // s pour un tour de la Terre sur elle-même (pas à l'échelle)
const DEG = Math.PI / 180;

const PHASES = [
  [10, 'Nouvelle lune'], [80, 'Premier croissant'], [100, 'Premier quartier'], [170, 'Lune gibbeuse croissante'],
  [190, 'Pleine lune'], [260, 'Lune gibbeuse décroissante'], [280, 'Dernier quartier'], [350, 'Dernier croissant'], [360, 'Nouvelle lune']
];

function mulberry(seed) {
  return () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// Terre stylisée : océans, continents en taches, calottes et nuages.
function earthTexture() {
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 512;
  const c = cv.getContext('2d'), rnd = mulberry(7);
  const g = c.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#1d4fa8'); g.addColorStop(.5, '#2f7be0'); g.addColorStop(1, '#1d4fa8');
  c.fillStyle = g; c.fillRect(0, 0, 1024, 512);
  const blob = (x, y, r, col) => {
    c.fillStyle = col; c.beginPath();
    for (let k = 0; k <= 24; k++) {
      const a = k / 24 * Math.PI * 2, rr = r * (0.65 + rnd() * 0.5);
      c.lineTo(x + Math.cos(a) * rr * 1.3, y + Math.sin(a) * rr);
    }
    c.fill();
  };
  for (let i = 0; i < 9; i++) {
    const x = rnd() * 1024, y = 130 + rnd() * 250, r = 40 + rnd() * 70;
    for (let j = 0; j < 5; j++) blob(x + (rnd() - .5) * r * 1.6, y + (rnd() - .5) * r, r * (.4 + rnd() * .5), j % 3 ? '#4fa64a' : '#9c8a52');
  }
  c.fillStyle = '#f4f8ff'; c.fillRect(0, 0, 1024, 34); c.fillRect(0, 478, 1024, 34);
  c.globalAlpha = .45; c.fillStyle = '#fff';
  for (let i = 0; i < 40; i++) { c.beginPath(); c.ellipse(rnd() * 1024, 60 + rnd() * 390, 30 + rnd() * 60, 6 + rnd() * 8, 0, 0, 7); c.fill(); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function moonTexture() {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256;
  const c = cv.getContext('2d'), rnd = mulberry(3);
  c.fillStyle = '#bdbdbd'; c.fillRect(0, 0, 512, 256);
  c.fillStyle = '#8f8f8f';
  for (let i = 0; i < 7; i++) { c.beginPath(); c.ellipse(rnd() * 512, 60 + rnd() * 140, 25 + rnd() * 40, 15 + rnd() * 25, 0, 0, 7); c.fill(); }
  for (let i = 0; i < 70; i++) {
    const x = rnd() * 512, y = rnd() * 256, r = 2 + rnd() * 9;
    c.strokeStyle = 'rgba(80,80,80,.6)'; c.lineWidth = 1.5; c.beginPath(); c.arc(x, y, r, 0, 7); c.stroke();
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function glowTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const c = cv.getContext('2d'), g = c.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,250,220,1)'); g.addColorStop(.2, 'rgba(255,230,140,.85)');
  g.addColorStop(.5, 'rgba(255,190,60,.25)'); g.addColorStop(1, 'rgba(255,170,40,0)');
  c.fillStyle = g; c.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(cv);
}

export class SkyView {
  static markers = UNIVERSAL_MARKERS;

  constructor(stage, ui) {
    this.stage = stage;
    this.ui = ui;
    this.time = 0;
    this.theta = 60 * DEG;      // angle Lune / direction du Soleil (0 = nouvelle lune, 180° = pleine lune)
    this.node = 90 * DEG;       // direction de la ligne des nœuds (90° : loin de toute éclipse)
    this.playing = true;
    this.abort = new AbortController();
    stage.keyLight.visible = false;   // seul le Soleil éclaire : la nuit reste noire

    const g = this.root = new THREE.Group();
    stage.anchor.add(g);
    this.tex = [earthTexture(), moonTexture(), glowTexture()];
    const mat = map => new THREE.MeshStandardMaterial({ map, roughness: 0.95, metalness: 0, envMapIntensity: 0 });

    this.earth = new THREE.Mesh(new THREE.SphereGeometry(R_EARTH, 48, 32), mat(this.tex[0]));
    this.earth.geometry.rotateX(Math.PI / 2);   // pôles vers le haut du repère
    this.earth.position.set(0, 0, LIFT);
    this.moonMat = mat(this.tex[1]);
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(R_MOON, 32, 20), this.moonMat);
    this.moon.geometry.rotateX(Math.PI / 2);
    for (const m of [this.earth, this.moon]) { m.castShadow = true; m.receiveShadow = true; g.add(m); }

    // Soleil : boule très lumineuse + halo.
    const sun = new THREE.Mesh(new THREE.SphereGeometry(0.42, 32, 20), new THREE.MeshBasicMaterial({ color: 0xfff6cf }));
    sun.position.copy(SUN_POS);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex[2], blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    halo.scale.setScalar(2.6);
    halo.position.copy(SUN_POS);
    this.halo = halo;
    g.add(sun, halo);

    // Lumière du Soleil (rayons parallèles) avec ombres portées.
    const light = this.light = new THREE.DirectionalLight(0xffffff, 3.2);
    light.position.copy(SUN_POS);
    light.target = this.earth;
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    Object.assign(light.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: 0.5, far: 10 });
    light.shadow.bias = -0.001;
    light.shadow.normalBias = 0.01;
    g.add(light, new THREE.AmbientLight(0x6070a0, 0.06));

    // Orbite (cercle incliné) et zones d'ombre.
    this.sunDir = SUN_POS.clone().sub(this.earth.position).setZ(0).normalize();
    this.side = new THREE.Vector3(0, 0, 1).cross(this.sunDir);
    this.orbit = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 128 }, () => new THREE.Vector3())),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 }));
    g.add(this.orbit);
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide });
    const cyl = (r, len) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 32, 1, true), shadowMat);
      m.geometry.translate(0, len / 2, 0);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), this.sunDir.clone().negate());
      return m;
    };
    this.earthShadow = cyl(R_EARTH, 2.4);
    this.earthShadow.position.copy(this.earth.position);
    this.moonShadow = cyl(R_MOON, 1.8);
    g.add(this.earthShadow, this.moonShadow);
    this.shadowsOn = true;

    this.buildUi();
    this.update();
    stage.onFrame = dt => this.frame(dt);
  }

  dispose() {
    this.abort.abort();
    this.stage.onFrame = null;
    this.stage.keyLight.visible = true;
    this.stage.anchor.remove(this.root);
    this.root.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    this.tex.forEach(t => t.dispose());
    this.ui.controls.innerHTML = '';
    this.inset.remove();
  }

  // ---------- Interface ----------

  buildUi() {
    const box = this.ui.controls;
    box.innerHTML = `<div class="ctl-panel">
        <div class="ctl-row">
          <button class="opt opt--play" data-act="play"></button>
          <label class="ctl-slider"><span>Position de la Lune</span><input type="range" min="0" max="360" step="1" data-act="theta"></label>
        </div>
        <div class="ctl-row">
          <button class="opt" data-act="lunar">Éclipse de Lune</button>
          <button class="opt" data-act="solar">Éclipse de Soleil</button>
          <button class="opt opt--on" data-act="shadows">Ombres</button>
        </div>
      </div>`;
    this.inset = document.createElement('div');
    this.inset.className = 'moon-inset';
    this.inset.innerHTML = '<canvas width="220" height="220"></canvas><div class="moon-inset__title">Vue depuis la Terre</div><div class="moon-inset__name"></div>';
    this.ui.layer.parentElement.appendChild(this.inset);
    this.insetCtx = this.inset.querySelector('canvas').getContext('2d');
    const sig = { signal: this.abort.signal };
    const slider = this.slider = box.querySelector('[data-act=theta]');
    slider.addEventListener('input', () => { this.playing = false; this.theta = slider.value * DEG; this.update(); }, sig);
    box.addEventListener('click', e => {
      const b = e.target.closest('[data-act]');
      if (!b || b === slider) return;
      const act = b.dataset.act;
      if (act === 'play') this.playing = !this.playing;
      if (act === 'lunar' || act === 'solar') { this.playing = false; this.node = 0; this.theta = act === 'lunar' ? Math.PI : 0; }
      if (act === 'shadows') this.shadowsOn = !this.shadowsOn;
      this.update();
    }, sig);
  }

  // ---------- Positions ----------

  // Direction Terre -> Lune pour l'angle theta (orbite inclinée autour de la ligne des nœuds).
  moonDir(theta) {
    const d = this.sunDir.clone().multiplyScalar(Math.cos(theta)).addScaledVector(this.side, Math.sin(theta));
    const axis = this.sunDir.clone().multiplyScalar(Math.cos(this.node)).addScaledVector(this.side, Math.sin(this.node));
    return d.applyAxisAngle(axis, TILT);
  }

  update() {
    const th = ((this.theta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    this.theta = th;
    const rel = this.moonDir(th).multiplyScalar(ORBIT);
    this.moon.position.copy(this.earth.position).add(rel);
    this.moon.rotation.z = th;   // rotation synchrone : toujours la même face vers la Terre
    const pts = this.orbit.geometry.attributes.position;
    for (let k = 0; k < pts.count; k++) {
      const p = this.moonDir(k / pts.count * 2 * Math.PI).multiplyScalar(ORBIT).add(this.earth.position);
      pts.setXYZ(k, p.x, p.y, p.z);
    }
    pts.needsUpdate = true;
    this.moonShadow.position.copy(this.moon.position);
    this.earthShadow.visible = this.moonShadow.visible = this.shadowsOn;

    // Éclipses : distance de la Lune à l'axe Soleil-Terre.
    const along = rel.dot(this.sunDir), perp = rel.clone().addScaledVector(this.sunDir, -along).length();
    this.lunar = along < 0 ? Math.max(0, Math.min(1, (R_EARTH + R_MOON - perp) / (2 * R_MOON))) : 0;
    this.solar = along > 0 && perp < R_EARTH + R_MOON;
    this.solarOffset = along > 0 ? perp : Infinity;
    this.moonMat.emissive.setRGB(0.45, 0.12, 0.05).multiplyScalar(this.lunar * 0.6);   // Lune rougie dans l'ombre

    const box = this.ui.controls;
    this.slider.value = Math.round(th / DEG);
    const play = box.querySelector('[data-act=play]');
    play.textContent = this.playing ? '⏸ Pause' : '▶ Animer';
    box.querySelector('[data-act=shadows]').classList.toggle('opt--on', this.shadowsOn);
    this.drawInset(th);
  }

  // Médaillon : la Lune vue depuis la Terre (partie éclairée), ou le Soleil caché lors d'une éclipse.
  drawInset(th) {
    const c = this.insetCtx, R = 80, cx = 110, cy = 110, deg = th / DEG;
    c.clearRect(0, 0, 220, 220);
    let name = PHASES.find(([lim]) => deg < lim)[1];
    if (this.solarOffset < 0.5) {
      // Soleil, avec la Lune (même taille apparente) qui passe devant.
      const off = Math.min(2.2, this.solarOffset / (R_EARTH + R_MOON) * 1.1) * R * Math.sign(Math.sin(th - Math.PI) || 1);
      const g = c.createRadialGradient(cx, cy, R * .2, cx, cy, R * 1.3);
      g.addColorStop(0, '#fffbe6'); g.addColorStop(.75, '#ffd75a'); g.addColorStop(1, 'rgba(255,190,60,0)');
      c.fillStyle = g; c.beginPath(); c.arc(cx, cy, R * 1.3, 0, 7); c.fill();
      c.fillStyle = '#111'; c.beginPath(); c.arc(cx + off, cy, R * .98, 0, 7); c.fill();
      if (this.solar) name = 'Éclipse de Soleil !';
    } else {
      // Phase : demi-disque éclairé côté Soleil + terminateur elliptique.
      const lit = '#e9e6dc', dark = '#26282d', waxing = deg < 180, k = Math.cos(th);
      c.fillStyle = dark; c.beginPath(); c.arc(cx, cy, R, 0, 7); c.fill();
      c.fillStyle = lit; c.beginPath(); c.arc(cx, cy, R, -Math.PI / 2, Math.PI / 2, !waxing); c.fill();
      c.fillStyle = k > 0 ? dark : lit;   // croissant : on assombrit ; gibbeuse : on éclaire
      c.beginPath(); c.ellipse(cx, cy, Math.abs(k) * R, R, 0, 0, 7); c.fill();
      if (this.lunar > 0) {
        c.fillStyle = `rgba(150,40,15,${(0.8 * this.lunar).toFixed(2)})`;
        c.beginPath(); c.arc(cx, cy, R, 0, 7); c.fill();
        name = this.lunar >= 1 ? 'Éclipse totale de Lune !' : 'Éclipse partielle de Lune';
      }
    }
    this.inset.querySelector('.moon-inset__name').textContent = name;
  }

  frame(dt) {
    this.time += dt;
    if (this.playing) {
      this.theta += dt / MONTH * 2 * Math.PI;
      this.node += dt / NODE_TURN * 2 * Math.PI;
      this.update();
    }
    this.earth.rotation.z = this.time / DAY * 2 * Math.PI;
    this.halo.material.rotation = this.time * 0.05;
    this.halo.scale.setScalar(2.6 + Math.sin(this.time * 2.1) * 0.08);
  }
}
