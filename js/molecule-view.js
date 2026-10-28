// molecule-view.js
// Vue « Molécule » : chaque repère d'atome (ids 1 à 36) porte une sphère colorée, son symbole
// imprimé dessus devant et derrière (sur l'équateur, parallèle au repère).
// Tant qu'aucune molécule n'est possible, on voit les atomes. Dès que des repères proches réunissent
// une molécule du catalogue, on ne voit plus que les molécules (la plus grosse d'abord, toutes celles
// qui sont complètes), avec leur formule et leur nom au-dessus ; les atomes en trop sont cachés.
// Tous les atomes à l'écran comptent, quelle que soit la distance entre leurs repères.
// Plus aucun repère vu : mode libre (scène figée, gyroscope + doigt) jusqu'au retour d'un repère.
import * as THREE from 'three';
import { ATOMS, CARD_ELEMENT, CATALOGUE, layout } from './molecules.js';
import { popScale, satin, SHRINK_TIME } from './util.js';
import { FreeLook, requestMotion } from './free-look.js';

const SEEN = 400;          // ms : un repère vu depuis moins longtemps compte comme « à l'écran »
const MOVE_SPEED = 7;      // vitesse à laquelle les atomes rejoignent leur place
const LIFT = 0.05;         // jeu entre les sphères et le repère
const DARK_TEXT = { H: 1, Na: 1, Mg: 1, Cl: 1 };   // atomes clairs : symbole noir, sinon blanc

// Peau de la sphère : sa couleur, avec le symbole devant et derrière.
// Sphère de three.js : u = 0,25 et u = 0,75 sont les deux faces, une fois les pôles tournés vers le haut du repère.
function skinTexture(symbol) {
  const cv = document.createElement('canvas');
  cv.width = 1024;
  cv.height = 512;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#' + ATOMS[symbol].color.toString(16).padStart(6, '0');
  ctx.fillRect(0, 0, 1024, 512);
  ctx.font = `800 ${symbol.length > 1 ? 150 : 170}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const dark = DARK_TEXT[symbol];
  ctx.fillStyle = dark ? '#111111' : '#ffffff';
  for (const x of [256, 768]) {
    ctx.save();
    ctx.translate(x, 262);
    ctx.scale(0.75, 1);       // la sphère étire le texte en largeur près de l'équateur
    ctx.fillText(symbol, 0, 0);
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export class MoleculeView {
  static searchText = 'Montre les repères des atomes à la caméra';
  static searchImage = false;
  static beforeOpen = requestMotion;   // pendant le toucher sur « Molécule » (autorisation du gyroscope sur iPhone)

  constructor(stage, ui) {
    this.stage = stage;
    this.ui = ui;
    this.time = 0;
    this.atoms = new Map();       // id du repère -> atome affiché
    this.cache = new Map();       // composition d'un groupe de repères -> molécules formées
    stage.setMulti(true);

    this.root = new THREE.Group();
    stage.scene.add(this.root);
    this.geo = { sphere: new THREE.SphereGeometry(1, 48, 32) };
    this.geo.sphere.rotateX(Math.PI / 2);   // pôles vers le haut du repère : le symbole est sur l'équateur
    this.mat = {};
    this.tex = {};
    for (const el of Object.keys(ATOMS)) {
      this.tex[el] = skinTexture(el);
      this.mat[el] = satin(0xffffff);
      this.mat[el].map = this.tex[el];
    }

    this.labels = document.createElement('div');
    ui.layer.appendChild(this.labels);
    this.hint = document.createElement('div');
    this.hint.className = 'ar-hint';
    this.hint.textContent = 'Mode libre : tourne le téléphone ou fais glisser ton doigt. Montre un repère pour reprendre.';
    this.hint.hidden = true;
    ui.layer.appendChild(this.hint);
    this.free = new FreeLook(stage.els.root);
    this.frozen = false;
    stage.onFrame = dt => this.frame(dt);
  }

  dispose() {
    this.stage.onFrame = null;
    this.stage.hold = false;
    this.stage.setMulti(false);
    this.free.dispose();
    this.hint.remove();
    this.stage.scene.remove(this.root);
    Object.values(this.geo).forEach(g => g.dispose());
    Object.values(this.mat).forEach(m => m.dispose());
    Object.values(this.tex).forEach(t => t.dispose());
    this.labels.remove();
  }

  // ---------- Atomes ----------

  createAtom(id, el) {
    const r = ATOMS[el].r;
    const obj = new THREE.Group();
    const sphere = new THREE.Mesh(this.geo.sphere, this.mat[el]);
    sphere.scale.setScalar(r);
    obj.add(sphere);
    obj.scale.setScalar(0.001);
    this.root.add(obj);
    // show : 1 affiché, 0 caché (atome en trop quand une molécule existe).
    const a = { id, el, r, obj, born: this.time, dying: false, mol: null, placed: false, show: 1 };
    this.atoms.set(id, a);
    return a;
  }

  // ---------- Molécules ----------

  // Composition d'un groupe de repères proches -> liste de molécules (la plus grosse d'abord).
  buildMolecules(group) {
    const remaining = group.slice(), mols = [];
    for (;;) {
      const counts = {};
      remaining.forEach(a => { counts[a.el] = (counts[a.el] || 0) + 1; });
      const entry = CATALOGUE.find(m => Object.keys(m.counts).every(e => (counts[e] || 0) >= m.counts[e]));
      if (!entry) break;

      // Atome de départ : le plus proche du centre du groupe ; puis les plus proches de lui.
      const center = new THREE.Vector3();
      remaining.forEach(a => center.add(a.mPos));
      center.divideScalar(remaining.length);
      const byDist = p => (a, b) => a.mPos.distanceToSquared(p) - b.mPos.distanceToSquared(p);
      const seed = remaining.filter(a => a.el === entry.els[0]).sort(byDist(center))[0];
      const members = [seed];
      for (const el of Object.keys(entry.counts)) {
        const need = entry.counts[el] - (el === seed.el ? 1 : 0);
        members.push(...remaining.filter(a => a.el === el && a !== seed).sort(byDist(seed.mPos)).slice(0, need));
      }

      // Chaque place de la molécule reçoit l'atome du bon élément le plus proche.
      const mol = { entry, seed, lift: 0, radius: 0 };
      const L = layout(entry);
      mol.lift = Math.max(...L.map((p, k) => ATOMS[entry.els[k]].r - p.z)) + LIFT;
      mol.radius = Math.max(...L.map((p, k) => p.length() + ATOMS[entry.els[k]].r));
      this.placeMolecule(mol, members);
      const free = members.slice();
      mol.slots = L.map((p, k) => {
        const target = mol.targets[k];
        const cands = free.filter(a => a.el === entry.els[k]).sort(byDist(target));
        free.splice(free.indexOf(cands[0]), 1);
        return cands[0];
      });

      mol.label = document.createElement('div');
      mol.label.className = 'mol-label';
      mol.label.innerHTML = `<div class="mol-label__formula">${entry.formula}</div><div class="mol-label__name">${entry.name}</div>`;
      this.labels.appendChild(mol.label);
      mols.push(mol);
      members.forEach(a => remaining.splice(remaining.indexOf(a), 1));
    }
    return mols;
  }

  // Pose de la molécule : au milieu de ses repères, orientée comme le repère de départ.
  placeMolecule(mol, members) {
    members = members || mol.slots;
    mol.position = new THREE.Vector3();
    members.forEach(a => mol.position.add(a.mPos));
    mol.position.divideScalar(members.length);
    mol.quaternion = mol.seed.mQuat;
    mol.center = new THREE.Vector3(0, 0, mol.lift).applyQuaternion(mol.quaternion).add(mol.position);
    mol.targets = layout(mol.entry).map(p =>
      new THREE.Vector3(p.x, p.y, p.z + mol.lift).applyQuaternion(mol.quaternion).add(mol.position));
  }

  // ---------- Mode libre ----------

  // Plus aucun repère vu : on fige la scène telle quelle, le gyroscope et le doigt prennent le relais.
  freeze() {
    const shown = [...this.atoms.values()].filter(a => !a.dying && a.show > 0.5);
    const center = new THREE.Vector3();
    shown.forEach(a => center.add(a.obj.position));
    if (shown.length) center.divideScalar(shown.length);
    const anyMol = [...this.atoms.values()].some(a => a.mol);
    for (const a of this.atoms.values()) {
      a.fPos = a.obj.position.clone();
      a.fQuat = a.obj.quaternion.clone();
      a.fShow = !a.dying && (a.mol || !anyMol) ? 1 : 0;   // un atome en train de se dégonfler finit de disparaître
    }
    for (const list of this.cache.values()) list.forEach(m => { m.fCenter = m.center.clone(); });
    this.free.start(center);
    this.frozen = true;
    this.stage.hold = true;
    this.hint.hidden = false;
  }

  unfreeze() {
    this.frozen = false;
    this.free.stop();
    this.stage.hold = false;
    this.hint.hidden = true;
    // Les repères non revus ont une position d'avant la rotation du téléphone : on les oublie.
    const now = performance.now();
    for (const [id, m] of this.stage.markers) if (now - m.lastSeen > SEEN) this.stage.markers.delete(id);
  }

  frameFrozen(k) {
    this.free.update();
    for (const a of this.atoms.values()) {
      this.free.position(a.fPos, a.obj.position);
      this.free.quaternion(a.fQuat, a.obj.quaternion);
      a.show += (a.fShow - a.show) * k * 1.5;
      a.obj.scale.setScalar(Math.max(0.001, a.show));
      a.obj.visible = a.show > 0.01;
    }
    for (const list of this.cache.values()) {
      for (const m of list) this.placeLabel(m, this.free.position(m.fCenter));
    }
  }

  placeLabel(m, center) {
    const s = this.stage.toScreen(center.clone().add(new THREE.Vector3(0, m.radius + 0.15, 0)));
    m.label.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) translate(-50%, -100%)`;
  }

  // ---------- Animation ----------

  frame(dt) {
    this.time += dt;
    const t = this.time, k = 1 - Math.exp(-dt * MOVE_SPEED), markers = this.stage.markers;

    // Mode libre : on y entre quand plus aucun repère d'atome n'est vu, on en sort dès qu'un repère revient.
    const now = performance.now();
    const seen = [...markers.values()].some(m => CARD_ELEMENT[m.id] && now - m.lastSeen < SEEN);
    if (!seen && !this.frozen && this.atoms.size) this.freeze();
    if (seen && this.frozen) this.unfreeze();
    if (this.frozen) return this.frameFrozen(k);

    // Repères qui apparaissent / disparaissent.
    for (const [id, m] of markers) {
      const el = CARD_ELEMENT[id];
      if (!el) continue;
      let a = this.atoms.get(id);
      if (a && a.dying) { this.root.remove(a.obj); a = null; }
      if (!a) a = this.createAtom(id, el);
      a.mPos = m.position;
      a.mQuat = m.quaternion;
    }
    for (const a of this.atoms.values()) {
      if (!a.dying && !markers.has(a.id)) { a.dying = true; a.deathStart = t; a.mol = null; }
    }
    const live = [...this.atoms.values()].filter(a => !a.dying);

    // Molécules : tous les atomes à l'écran comptent ensemble. Même composition : on garde les mêmes.
    const cache = new Map(), mols = [];
    if (live.length) {
      const key = live.map(a => a.id).sort((x, y) => x - y).join(',');
      const found = this.cache.get(key) || this.buildMolecules(live);
      cache.set(key, found);
      mols.push(...found);
    }
    for (const [key, list] of this.cache) if (!cache.has(key)) list.forEach(m => m.label.remove());
    this.cache = cache;
    live.forEach(a => { a.mol = null; });
    mols.forEach(m => m.slots.forEach(a => { a.mol = m; }));

    // Places des atomes : dans leur molécule, ou posés sur leur repère.
    const target = new THREE.Vector3();
    for (const m of mols) {
      this.placeMolecule(m);
      m.slots.forEach((a, i) => { a.target = m.targets[i]; a.targetQuat = m.quaternion; });
    }
    for (const a of this.atoms.values()) {
      if (a.dying) {
        const x = (t - a.deathStart) / SHRINK_TIME;
        if (x >= 1) { this.root.remove(a.obj); this.atoms.delete(a.id); continue; }
        a.obj.scale.setScalar(Math.max(0.001, (1 - x * x) * a.show));
        continue;
      }
      if (!a.mol) {
        a.target = target.set(0, 0, a.r + LIFT).applyQuaternion(a.mQuat).add(a.mPos).clone();
        a.targetQuat = a.mQuat;
      }
      if (!a.placed) {
        a.obj.position.copy(a.target);
        a.obj.quaternion.copy(a.targetQuat);
        a.placed = true;
      } else {
        a.obj.position.lerp(a.target, k);
        a.obj.quaternion.slerp(a.targetQuat, k);
      }
      // Dès qu'une molécule existe à l'écran, les atomes qui n'en font pas partie se dégonflent.
      a.show += ((a.mol || !mols.length ? 1 : 0) - a.show) * k * 1.5;
      a.obj.scale.setScalar(Math.max(0.001, popScale(t - a.born) * a.show));
      a.obj.visible = a.show > 0.01;
    }

    // Formule et nom au-dessus de chaque molécule.
    for (const m of mols) this.placeLabel(m, m.center);
  }
}
