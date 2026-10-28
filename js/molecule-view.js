// molecule-view.js
// Vue « Molécule » : chaque repère d'atome (ids 1 à 36) porte une sphère colorée, avec son symbole
// posé à plat devant et derrière. Quand des repères proches réunissent de quoi faire une molécule
// du catalogue, les atomes se rejoignent et la formule + le nom flottent au-dessus.
// Atomes en trop : ils restent sur leur repère. Plusieurs molécules possibles : la plus grosse d'abord.
import * as THREE from 'three';
import { ATOMS, CARD_ELEMENT, CATALOGUE, layout } from './molecules.js';
import { popScale, satin, SHRINK_TIME } from './util.js';

const LINK = 2.8;          // repères à moins de 2,8 côtés l'un de l'autre : ils peuvent s'assembler
const UNLINK = 3.4;        // une molécule formée ne se casse qu'au-delà (évite le clignotement)
const MOVE_SPEED = 7;      // vitesse à laquelle les atomes rejoignent leur place
const LIFT = 0.05;         // jeu entre les sphères et le repère
const LABEL_GAP = 0.32;    // distance entre la sphère et son symbole posé à plat
const LABEL_W = 1.05, LABEL_H = 0.66;

function symbolTexture(symbol) {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 160;
  const ctx = cv.getContext('2d');
  ctx.font = '800 120px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 18;
  ctx.strokeStyle = symbol === 'C' ? '#ffffff' : '#111111';
  ctx.strokeText(symbol, 128, 84);
  ctx.fillStyle = '#' + ATOMS[symbol].color.toString(16).padStart(6, '0');
  ctx.fillText(symbol, 128, 84);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export class MoleculeView {
  static searchText = 'Montre les repères des atomes à la caméra';
  static searchImage = false;

  constructor(stage, ui) {
    this.stage = stage;
    this.ui = ui;
    this.time = 0;
    this.atoms = new Map();       // id du repère -> atome affiché
    this.cache = new Map();       // composition d'un groupe de repères -> molécules formées
    stage.setMulti(true);

    this.root = new THREE.Group();
    stage.scene.add(this.root);
    this.geo = { sphere: new THREE.SphereGeometry(1, 32, 24), label: new THREE.PlaneGeometry(LABEL_W, LABEL_H) };
    this.mat = {};
    this.tex = {};
    for (const el of Object.keys(ATOMS)) {
      this.mat[el] = satin(ATOMS[el].color);
      this.tex[el] = symbolTexture(el);
    }

    this.labels = document.createElement('div');
    ui.layer.appendChild(this.labels);
    stage.onFrame = dt => this.frame(dt);
  }

  dispose() {
    this.stage.onFrame = null;
    this.stage.setMulti(false);
    this.stage.scene.remove(this.root);
    for (const a of this.atoms.values()) a.labelMat.dispose();
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
    // Symbole couché sur le plan du repère, devant (lisible de face) et derrière (lisible de l'autre côté).
    // Il est au niveau de la table : une grosse sphère ne le cache pas.
    const labelMat = new THREE.MeshBasicMaterial({ map: this.tex[el], transparent: true, depthWrite: false });
    const front = new THREE.Mesh(this.geo.label, labelMat);
    front.position.set(0, -(r + LABEL_GAP), -r);
    const back = new THREE.Mesh(this.geo.label, labelMat);
    back.position.set(0, r + LABEL_GAP, -r);
    back.rotation.z = Math.PI;
    obj.add(front, back);
    obj.scale.setScalar(0.001);
    this.root.add(obj);
    const a = { id, el, r, obj, labelMat, born: this.time, dying: false, mol: null, placed: false };
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

  // Groupes de repères proches (un repère déjà dans une molécule reste attaché un peu plus loin).
  groups(live) {
    const parent = new Map(live.map(a => [a, a]));
    const find = a => parent.get(a) === a ? a : find(parent.get(a));
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i], b = live[j];
        const max = a.mol && a.mol === b.mol ? UNLINK : LINK;
        if (a.mPos.distanceTo(b.mPos) < max) parent.set(find(a), find(b));
      }
    }
    const out = new Map();
    for (const a of live) {
      const root = find(a);
      if (!out.has(root)) out.set(root, []);
      out.get(root).push(a);
    }
    return [...out.values()];
  }

  // ---------- Animation ----------

  frame(dt) {
    this.time += dt;
    const t = this.time, k = 1 - Math.exp(-dt * MOVE_SPEED), markers = this.stage.markers;

    // Repères qui apparaissent / disparaissent.
    for (const [id, m] of markers) {
      const el = CARD_ELEMENT[id];
      if (!el) continue;
      let a = this.atoms.get(id);
      if (a && a.dying) { this.root.remove(a.obj); a.labelMat.dispose(); a = null; }
      if (!a) a = this.createAtom(id, el);
      a.mPos = m.position;
      a.mQuat = m.quaternion;
    }
    for (const a of this.atoms.values()) {
      if (!a.dying && !markers.has(a.id)) { a.dying = true; a.deathStart = t; a.mol = null; }
    }
    const live = [...this.atoms.values()].filter(a => !a.dying);

    // Molécules : on garde celles d'un groupe inchangé, on recalcule les autres.
    const cache = new Map(), mols = [];
    for (const g of this.groups(live)) {
      const key = g.map(a => a.id).sort((x, y) => x - y).join(',');
      const found = this.cache.get(key) || this.buildMolecules(g);
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
        if (x >= 1) { this.root.remove(a.obj); a.labelMat.dispose(); this.atoms.delete(a.id); continue; }
        a.obj.scale.setScalar(Math.max(0.001, 1 - x * x));
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
      a.obj.scale.setScalar(Math.max(0.001, popScale(t - a.born)));
      // Dans une molécule, les symboles s'effacent : la formule flotte au-dessus.
      a.labelMat.opacity += ((a.mol ? 0 : 1) - a.labelMat.opacity) * k;
    }

    // Formule et nom au-dessus de chaque molécule.
    for (const m of mols) {
      const top = m.center.clone().add(new THREE.Vector3(0, m.radius + 0.15, 0));
      const s = this.stage.toScreen(top);
      m.label.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) translate(-50%, -100%)`;
    }
  }
}
