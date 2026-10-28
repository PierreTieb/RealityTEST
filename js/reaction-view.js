// reaction-view.js
// Module « Transformation chimique ». Chaque repère porte un réactif (molécule ou atome) posé dessus.
// Quand la composition de la table ne bouge plus pendant 1 s et correspond aux réactifs d'une réaction
// du catalogue :
// - bons nombres de repères (ou un multiple) : les molécules se cassent, les atomes s'envolent et se
//   réarrangent en produits, avec la formule et le nom de chaque produit au-dessus ;
// - mauvais nombres : même début, mais seuls les produits possibles se forment ; les atomes en trop
//   restent en rouge et les atomes qui manqueraient apparaissent en fantôme ; puis tout revient en
//   arrière (« les atomes ne peuvent ni disparaître ni apparaître ») et la tentative recommence.
// Plus aucun repère vu : mode libre (scène figée, gyroscope + doigt), l'animation continue.
import * as THREE from 'three';
import { ATOMS, SPECIES, CARD_SPECIES, findReaction, layout } from './chemistry.js';
import { popScale, satin, SHRINK_TIME } from './util.js';
import { FreeLook, requestMotion } from './free-look.js';

const SCALE = 0.6;          // taille des atomes dans ce module (× rayon de ATOMS)
const VISIBLE = 1000;       // ms : un repère vu depuis moins longtemps est « sur la table »
const SEEN = 400;           // ms : aucun repère vu depuis plus longtemps : mode libre
const STABLE = 1;           // s sans changement de composition avant de tenter la transformation
const MOVE_SPEED = 7;       // retour des atomes à leur place
const LIFT = 0.05;          // jeu entre les sphères et la table
const GAP = 0.35;           // écart entre deux molécules de produit
// Chronologie d'une tentative (s) : cassure, vol vers les produits, (échec) attente, retour, nouvel essai.
const T_BREAK = 0.6, T_JOIN = 2.0, T_FAIL_END = 5.0, T_BACK = 6.2, T_REPLAY = 8.5;

const ease = e => e < 0.5 ? 2 * e * e : 1 - (-2 * e + 2) ** 2 / 2;
const clamp01 = x => Math.max(0, Math.min(1, x));
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// Peau de la sphère : couleur de l'atome, symbole devant et derrière sur l'équateur.
function skinTexture(symbol) {
  const hex = ATOMS[symbol].color;
  const cv = document.createElement('canvas');
  cv.width = 1024;
  cv.height = 512;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#' + hex.toString(16).padStart(6, '0');
  ctx.fillRect(0, 0, 1024, 512);
  const lum = 0.299 * (hex >> 16 & 255) + 0.587 * (hex >> 8 & 255) + 0.114 * (hex & 255);
  ctx.fillStyle = lum > 150 ? '#111111' : '#ffffff';
  ctx.font = `800 ${symbol.length > 1 ? 150 : 170}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
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

// Encombrement d'une espèce posée à plat : rayon horizontal et hauteur pour que rien ne passe sous la table.
function footprint(sp) {
  const L = layout(sp);
  return {
    L,
    radius: Math.max(...L.map((p, k) => Math.hypot(p.x, p.y) * SCALE + ATOMS[sp.els[k]].r * SCALE)),
    lift: Math.max(...L.map((p, k) => (ATOMS[sp.els[k]].r - p.z) * SCALE)) + LIFT
  };
}

export class ReactionView {
  static searchText = 'Montre les repères des réactifs à la caméra';
  static searchImage = false;
  static beforeOpen = requestMotion;   // pendant le toucher (autorisation du gyroscope sur iPhone)

  constructor(stage, ui) {
    this.stage = stage;
    this.ui = ui;
    this.time = 0;
    this.cards = new Map();       // id du repère -> réactif affiché
    this.plan = null;             // tentative de transformation en cours
    this.compKey = '';
    this.compSince = 0;
    this.frozen = false;
    stage.setMulti(true);

    this.root = new THREE.Group();
    stage.scene.add(this.root);
    this.geo = new THREE.SphereGeometry(1, 48, 32);
    this.geo.rotateX(Math.PI / 2);   // pôles vers le haut de la table : le symbole est sur l'équateur
    this.tex = {};
    this.mat = {};
    this.ghostMat = {};
    for (const el of Object.keys(ATOMS)) {
      this.tex[el] = skinTexture(el);
      this.mat[el] = satin(0xffffff);
      this.mat[el].map = this.tex[el];
      this.ghostMat[el] = satin(0xffffff);
      Object.assign(this.ghostMat[el], { map: this.tex[el], transparent: true, opacity: 0, depthWrite: false });
    }
    this.shellMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0, depthWrite: false });

    this.labels = document.createElement('div');
    this.banner = document.createElement('div');
    this.banner.className = 'rx-banner';
    this.banner.hidden = true;
    this.hint = document.createElement('div');
    this.hint.className = 'ar-hint';
    this.hint.textContent = 'Mode libre : tourne le téléphone ou fais glisser ton doigt. Montre un repère pour reprendre.';
    this.hint.hidden = true;
    ui.layer.append(this.labels, this.banner, this.hint);
    this.free = new FreeLook(stage.els.root);
    stage.onFrame = dt => this.frame(dt);
  }

  dispose() {
    this.stage.onFrame = null;
    this.stage.hold = false;
    this.stage.setMulti(false);
    this.stage.scene.remove(this.root);
    this.endPlan();
    this.free.dispose();
    this.geo.dispose();
    [this.tex, this.mat, this.ghostMat].forEach(o => Object.values(o).forEach(x => x.dispose()));
    this.shellMat.dispose();
    this.labels.remove();
    this.banner.remove();
    this.hint.remove();
  }

  // ---------- Réactifs posés sur les repères ----------

  createAtom(el) {
    const obj = new THREE.Group();
    const sphere = new THREE.Mesh(this.geo, this.mat[el]);
    sphere.scale.setScalar(ATOMS[el].r * SCALE);
    obj.add(sphere);
    obj.scale.setScalar(0.001);
    this.root.add(obj);
    return { el, obj, shell: null, placed: false };
  }

  createCard(id, key) {
    const sp = SPECIES[key];
    const card = { id, key, sp, ...footprint(sp), born: this.time, dying: false };
    card.atoms = sp.els.map(el => Object.assign(this.createAtom(el), { card }));
    card.atoms.forEach((a, i) => { a.index = i; });
    card.label = document.createElement('div');
    card.label.className = 'mol-label mol-label--small';
    card.label.textContent = sp.formula;
    this.labels.appendChild(card.label);
    this.cards.set(id, card);
    return card;
  }

  removeCard(c) {
    c.atoms.forEach(a => this.root.remove(a.obj));
    c.label.remove();
    this.cards.delete(c.id);
  }

  // ---------- Tentative de transformation ----------

  makePlan(live, counts) {
    const rx = findReaction(Object.keys(counts));
    if (!rx) return { rx: null, t0: this.time };
    const ratios = rx.reactants.map(r => counts[r.key] / r.n);
    const ok = ratios.every(x => x === ratios[0]) && Number.isInteger(ratios[0]);   // multiples acceptés

    const pool = {};
    live.forEach(c => c.atoms.forEach(a => (pool[a.el] = pool[a.el] || []).push(a)));
    const instances = [];
    const add = (key, n, row) => { for (let i = 0; i < n; i++) instances.push(this.fill(SPECIES[key], pool, row)); };
    if (ok) {
      rx.products.forEach(p => add(p.key, p.n * ratios[0], 0));
    } else {
      // Le plus d'atomes possible dans des produits complets…
      this.bestProducts(rx, pool).forEach(([key, n]) => add(key, n, 0));
      // …puis les atomes restants dans des produits incomplets (atomes manquants en fantôme)…
      for (;;) {
        const left = sp => Object.entries(sp.counts).reduce((s, [e, c]) => s + Math.min(c, (pool[e] || []).length), 0);
        const cand = rx.products.map(p => SPECIES[p.key]).sort((a, b) => left(b) - left(a))[0];
        if (!cand || !left(cand)) break;
        instances.push(this.fill(cand, pool, 1, true));
      }
      // …et ceux qui n'entrent dans aucun produit, seuls.
      Object.values(pool).flat().forEach(a => instances.push({
        sp: { els: [a.el] }, L: [V()], radius: ATOMS[a.el].r * SCALE, lift: ATOMS[a.el].r * SCALE + LIFT,
        slots: [a], ghosts: [null], row: 1, partial: true
      }));
    }
    for (const inst of instances) {
      inst.slots.forEach(a => {
        if (!a) return;
        a.inPlan = true;
        a.orphan = !!inst.partial;
        if (a.orphan && !a.shell) {
          a.shell = new THREE.Mesh(this.geo, this.shellMat);
          a.shell.scale.setScalar(ATOMS[a.el].r * SCALE * 1.18);
          a.obj.add(a.shell);
        }
      });
      if (ok) {
        inst.label = document.createElement('div');
        inst.label.className = 'mol-label';
        inst.label.innerHTML = `<div class="mol-label__formula">${inst.sp.formula}</div><div class="mol-label__name">${inst.sp.name}</div>`;
        inst.label.hidden = true;
        this.labels.appendChild(inst.label);
      }
    }
    // Rangées : produits complets derrière, atomes en trop devant (plus visibles).
    const rows = [0, 1].map(r => instances.filter(i => i.row === r));
    const depth = rows.map(list => Math.max(0, ...list.map(i => i.radius)));
    rows.forEach((list, r) => {
      const width = list.reduce((s, i) => s + 2 * i.radius, 0) + GAP * Math.max(0, list.length - 1);
      let x = -width / 2;
      const y = r === 0 ? 0 : -(depth[0] + depth[1] + GAP * 1.5);
      for (const inst of list) {
        inst.offset = V(x + inst.radius, y, inst.lift);
        x += 2 * inst.radius + GAP;
      }
    });
    return { rx, ok, t0: this.time, instances };
  }

  // Une molécule de produit remplie avec les atomes disponibles ; places vides = fantômes.
  fill(sp, pool, row, partial) {
    const fp = footprint(sp);
    const slots = sp.els.map(el => (pool[el] && pool[el].length ? pool[el].shift() : null));
    const ghosts = slots.map((a, k) => {
      if (a) return null;
      const g = new THREE.Mesh(this.geo, this.ghostMat[sp.els[k]]);
      g.scale.setScalar(ATOMS[sp.els[k]].r * SCALE);
      this.root.add(g);
      return g;
    });
    return { sp, ...fp, slots, ghosts, row, partial };
  }

  // Combinaison de produits complets qui utilise le plus d'atomes.
  bestProducts(rx, pool) {
    const P = rx.products.map(p => SPECIES[p.key]);
    let best = { used: -1, chosen: [] };
    const rec = (i, avail, chosen, used) => {
      if (i === P.length) {
        if (used > best.used) best = { used, chosen: chosen.slice() };
        return;
      }
      const sp = P[i];
      const max = Math.min(...Object.entries(sp.counts).map(([e, c]) => Math.floor((avail[e] || 0) / c)));
      for (let n = max; n >= 0; n--) {
        const next = { ...avail };
        Object.entries(sp.counts).forEach(([e, c]) => { next[e] -= c * n; });
        chosen.push(n);
        rec(i + 1, next, chosen, used + n * sp.els.length);
        chosen.pop();
      }
    };
    const avail = {};
    Object.entries(pool).forEach(([e, list]) => { avail[e] = list.length; });
    rec(0, avail, [], 0);
    return best.chosen.map((n, i) => [P[i].key, n]);
  }

  endPlan() {
    const p = this.plan;
    this.plan = null;
    this.banner.hidden = true;
    if (!p || !p.instances) return;
    for (const inst of p.instances) {
      inst.ghosts.forEach(g => g && this.root.remove(g));
      if (inst.label) inst.label.remove();
      inst.slots.forEach(a => {
        if (!a) return;
        a.inPlan = false;
        a.orphan = false;
        if (a.shell) a.shell.visible = false;
      });
    }
  }

  setBanner(text, kind) {
    this.banner.hidden = !text;
    if (!text) return;
    this.banner.textContent = text;
    this.banner.className = 'rx-banner rx-banner--' + kind;
  }

  // ---------- Mode libre ----------

  freeze() {
    // On garde les réactifs affichés à cet instant (ceux dont le repère vient d'être perdu compris).
    this.snapshot = new Map();
    for (const [id, m] of this.stage.markers) {
      const c = this.cards.get(id);
      if (c && !c.dying) this.snapshot.set(id, { id, position: m.position.clone(), quaternion: m.quaternion.clone(), lastSeen: m.lastSeen });
    }
    const center = V();
    let n = 0;
    for (const c of this.cards.values()) c.atoms.forEach(a => { center.add(a.obj.position); n++; });
    if (n) center.divideScalar(n);
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
    const now = performance.now();
    for (const [id, m] of this.stage.markers) if (now - m.lastSeen > SEEN) this.stage.markers.delete(id);
  }

  // Point de la scène (repère caméra) tel qu'affiché : en mode libre, transformé par le gyroscope et le doigt.
  shown(p) { return this.frozen ? this.free.position(p, V()) : p; }

  placeLabel(el, center, radius) {
    const s = this.stage.toScreen(this.shown(center).clone().add(V(0, radius + 0.12, 0)));
    el.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) translate(-50%, -100%)`;
  }

  // ---------- Animation ----------

  frame(dt) {
    this.time += dt;
    const t = this.time, k = 1 - Math.exp(-dt * MOVE_SPEED), now = performance.now(), markers = this.stage.markers;

    // Mode libre : plus aucun repère de réactif vu.
    const seen = [...markers.values()].some(m => CARD_SPECIES[m.id] && now - m.lastSeen < SEEN);
    if (!seen && !this.frozen && this.cards.size) this.freeze();
    else if (seen && this.frozen) this.unfreeze();
    if (this.frozen) this.free.update();

    // Repères sur la table.
    const poses = this.frozen ? this.snapshot : markers;
    const onTable = new Map();
    for (const [id, m] of poses) if (CARD_SPECIES[id] && (this.frozen || now - m.lastSeen < VISIBLE)) onTable.set(id, m);
    for (const [id, m] of onTable) {
      let c = this.cards.get(id);
      if (c && c.dying) { this.removeCard(c); c = null; }
      if (!c) c = this.createCard(id, CARD_SPECIES[id]);
      c.pos = m.position;
      c.quat = m.quaternion;
    }
    for (const c of this.cards.values()) if (!c.dying && !onTable.has(c.id)) { c.dying = true; c.deathStart = t; }
    const live = [...this.cards.values()].filter(c => !c.dying);

    // Composition : tout changement annule la tentative ; 1 s sans changement : nouvelle tentative.
    const counts = {};
    live.forEach(c => { counts[c.key] = (counts[c.key] || 0) + 1; });
    const key = Object.keys(counts).sort().map(s => s + ':' + counts[s]).join(',');
    if (key !== this.compKey) {
      this.compKey = key;
      this.compSince = t;
      this.tried = false;
      this.endPlan();
    }
    if (!this.tried && live.length && t - this.compSince >= STABLE) {
      this.tried = true;
      this.plan = this.makePlan(live, counts);
    }

    // Place de chaque atome sur son repère.
    for (const c of this.cards.values()) {
      c.center = V(0, 0, c.lift).applyQuaternion(c.quat).add(c.pos);
      c.homes = c.L.map(p => V(p.x * SCALE, p.y * SCALE, p.z * SCALE + c.lift).applyQuaternion(c.quat).add(c.pos));
      c.atoms.forEach((a, i) => { a.target = c.homes[i]; a.targetQuat = c.quat; a.direct = false; });
    }

    const plan = this.plan;
    let showCardLabels = true;
    if (plan && plan.rx) showCardLabels = this.animatePlan(t, live);
    else this.setBanner(plan && Object.keys(counts).length > 1 ? 'Aucune transformation connue avec ces réactifs' : '', 'info');

    // Affichage des atomes.
    for (const c of [...this.cards.values()]) {
      let s = popScale(t - c.born);
      if (c.dying) {
        const x = (t - c.deathStart) / SHRINK_TIME;
        if (x >= 1) { this.removeCard(c); continue; }
        s = 1 - x * x;
      }
      for (const a of c.atoms) {
        const p = this.shown(a.target);
        const q = this.frozen ? this.free.quaternion(a.targetQuat) : a.targetQuat;
        if (a.direct || !a.placed) {
          a.obj.position.copy(p);
          a.obj.quaternion.copy(q);
          a.placed = true;
        } else {
          a.obj.position.lerp(p, k);
          a.obj.quaternion.slerp(q, k);
        }
        a.obj.scale.setScalar(Math.max(0.001, s));
      }
      c.label.hidden = !showCardLabels || c.dying;
      if (!c.label.hidden) this.placeLabel(c.label, c.center, c.radius);
    }
  }

  // Anime la tentative ; renvoie true si les étiquettes des réactifs doivent rester visibles.
  animatePlan(t, live) {
    const plan = this.plan;
    let tau = t - plan.t0;
    if (!plan.ok && tau >= T_REPLAY) { plan.t0 = t; tau = 0; }

    // Repère de la table : au milieu des repères, orientation moyenne.
    const pos = V(), quat = live[0].quat.clone();
    live.forEach((c, i) => { pos.add(c.pos); if (i) quat.slerp(c.quat, 1 / (i + 1)); });
    pos.divideScalar(live.length);
    const up = V(0, 0, 1).applyQuaternion(quat);

    const back = !plan.ok && tau >= T_FAIL_END;
    for (const inst of plan.instances) {
      inst.center = inst.offset.clone().applyQuaternion(quat).add(pos);
      inst.L.forEach((p, k) => {
        const P = V(p.x * SCALE, p.y * SCALE, p.z * SCALE).add(inst.offset).applyQuaternion(quat).add(pos);
        const a = inst.slots[k];
        if (a) {
          const c = a.card, home = c.homes[a.index];
          const out = home.clone().sub(c.center);
          const sep = home.clone().addScaledVector(out.lengthSq() > 1e-6 ? out.normalize() : up, 0.35).addScaledVector(up, 0.35);
          if (tau < T_BREAK) {
            a.target = home.clone().lerp(sep, ease(tau / T_BREAK));
            a.targetQuat = c.quat;
          } else if (tau < T_JOIN) {
            const e = ease((tau - T_BREAK) / (T_JOIN - T_BREAK));
            a.target = sep.clone().lerp(P, e).addScaledVector(up, Math.sin(Math.PI * e) * 0.8);
            a.targetQuat = c.quat.clone().slerp(quat, e);
          } else if (!back) {
            a.target = P;
            a.targetQuat = quat;
          } else if (tau < T_BACK) {
            const e = ease((tau - T_FAIL_END) / (T_BACK - T_FAIL_END));
            a.target = P.clone().lerp(home, e).addScaledVector(up, Math.sin(Math.PI * e) * 0.5);
            a.targetQuat = quat.clone().slerp(c.quat, e);
          } else {
            a.target = home;
            a.targetQuat = c.quat;
          }
          a.direct = true;
          // Atomes en trop : halo rouge qui palpite pendant l'échec.
          if (a.shell) a.shell.visible = a.orphan && tau >= T_JOIN && tau < T_FAIL_END;
        }
        const g = inst.ghosts[k];
        if (g) {
          g.position.copy(this.shown(P));
          g.quaternion.copy(this.frozen ? this.free.quaternion(quat) : quat);
        }
      });
    }

    // Fantômes et halos : apparaissent quand les produits sont formés, disparaissent avant le retour.
    const vis = plan.ok ? 0 : clamp01((tau - T_JOIN) / 0.5) * clamp01((T_FAIL_END - tau) / 0.4);
    Object.values(this.ghostMat).forEach(m => { m.opacity = 0.35 * vis; });
    this.shellMat.opacity = vis * (0.28 + 0.18 * Math.sin(tau * 8));

    if (plan.ok) {
      const done = tau >= T_JOIN;
      plan.instances.forEach(inst => {
        inst.label.hidden = !done;
        if (done) this.placeLabel(inst.label, inst.center, inst.radius);
      });
      this.setBanner(done ? 'Transformation équilibrée !' : '', 'ok');
      return false;
    }
    this.setBanner(tau >= T_JOIN && tau < T_FAIL_END ? 'Impossible : les atomes ne peuvent ni disparaître ni apparaître' : '', 'ko');
    return tau >= T_BACK;
  }
}
