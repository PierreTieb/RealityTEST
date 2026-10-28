// molecules.js
// Données de la vue « Molécule » : atomes disponibles, repères imprimés, catalogue des molécules
// (repris de « Les Bases de la chimie », limité à H, C, O, N, Cl, Na, Mg, I, plus les iodures)
// et calcul de la forme 3D de chaque molécule.
import * as THREE from 'three';

// Rayon en côtés de repère : croît avec le numéro atomique (ordre du tableau périodique).
export const ATOMS = {
  H:  { name: 'Hydrogène', color: 0xf2f2f2, r: 0.45, electrons: 1 },
  C:  { name: 'Carbone',   color: 0x262626, r: 0.62, electrons: 4 },
  N:  { name: 'Azote',     color: 0x2d62ff, r: 0.64, electrons: 5 },
  O:  { name: 'Oxygène',   color: 0xff2a2a, r: 0.66, electrons: 6 },
  Na: { name: 'Sodium',    color: 0xffd21f, r: 0.80, electrons: 1 },
  Mg: { name: 'Magnésium', color: 0x9aa0a8, r: 0.82, electrons: 2 },
  Cl: { name: 'Chlore',    color: 0x2fcf4a, r: 0.92, electrons: 7 },
  I:  { name: 'Iode',      color: 0x8a3cff, r: 1.15, electrons: 7 }
};

// Repères imprimés : ids 1 à 36 dans cet ordre (l'id 0 est le repère universel).
// Même ordre que le générateur du PDF (outils/repere_atomes.py).
export const CARDS = [['H', 8], ['C', 6], ['O', 6], ['N', 4], ['Cl', 3], ['Na', 3], ['Mg', 3], ['I', 3]];
export const CARD_ELEMENT = {};
{
  let id = 1;
  for (const [el, n] of CARDS) for (let i = 0; i < n; i++) CARD_ELEMENT[id++] = el;
}

// atoms : symboles ; bonds : "i-j" simple, "i=j" double, "i#j" triple (indices dans atoms).
// formula : écriture d'usage quand l'ordre automatique ne convient pas.
const RAW = [
  ['Dihydrogène', 'H H', '0-1'],
  ['Dioxygène', 'O O', '0=1'],
  ['Ozone', 'O O O', '0=1 0-2'],
  ['Diazote', 'N N', '0#1'],
  ['Dichlore', 'Cl Cl', '0-1'],
  ['Diiode', 'I I', '0-1'],
  ['Eau', 'O H H', '0-1 0-2'],
  ["Peroxyde d'hydrogène", 'O O H H', '0-1 0-2 1-3'],
  ['Dioxyde de carbone', 'C O O', '0=1 0=2'],
  ['Monoxyde de carbone', 'C O', '0#1'],
  ['Ammoniac', 'N H H H', '0-1 0-2 0-3'],
  ['Méthane', 'C H H H H', '0-1 0-2 0-3 0-4'],
  ['Éthane', 'C C H H H H H H', '0-1 0-2 0-3 0-4 1-5 1-6 1-7'],
  ['Éthène (éthylène)', 'C C H H H H', '0=1 0-2 0-3 1-4 1-5'],
  ['Éthyne (acétylène)', 'C C H H', '0#1 0-2 1-3'],
  ['Méthanol', 'C O H H H H', '0-1 0-2 0-3 0-4 1-5'],
  ["Chlorure d'hydrogène", 'H Cl', '0-1'],
  ["Iodure d'hydrogène", 'H I', '0-1'],
  ['Chlorure de sodium', 'Na Cl', '0-1'],
  ['Iodure de sodium', 'Na I', '0-1'],
  ['Oxyde de magnésium', 'Mg O', '0=1'],
  ['Chlorure de magnésium', 'Mg Cl Cl', '0-1 0-2'],
  ['Iodure de magnésium', 'Mg I I', '0-1 0-2'],
  ["Protoxyde d'azote", 'N N O', '0=1 1=2'],
  ["Monoxyde d'azote", 'N O', '0=1'],
  ["Dioxyde d'azote", 'N O O', '0=1 0-2'],
  ['Hydroxyde de sodium', 'Na O H', '0-1 1-2', 'NaOH'],
  ['Hydroxyde de magnésium', 'Mg O O H H', '0-1 0-2 1-3 2-4', 'Mg(OH)₂'],
  ['Carbonate de sodium', 'C O O O Na Na', '0=1 0-2 0-3 2-4 3-5'],
  ['Carbonate de magnésium', 'C O O O Mg', '0=1 0-2 0-3 2-4 3-4'],
  ['Hydrogénocarbonate de sodium', 'C O O O Na H', '0=1 0-2 0-3 2-4 3-5', 'NaHCO₃'],
  ['Acide nitrique', 'N O O O H', '0=1 0-2 0-3 3-4', 'HNO₃'],
  ['Acide nitreux', 'N O O H', '0=1 0-2 2-3', 'HNO₂'],
  ['Acide carbonique', 'C O O O H H', '0=1 0-2 0-3 2-4 3-5', 'H₂CO₃'],
  ['Nitrate de sodium', 'N O O O Na', '0=1 0-2 0-3 3-4'],
  ['Oxyde de sodium', 'O Na Na', '0-1 0-2'],
  ['Monoxyde de dichlore', 'O Cl Cl', '0-1 0-2'],
  ['Hydrazine', 'N N H H H H', '0-1 0-2 0-3 1-4 1-5'],
  ["Chlorure d'ammonium", 'N H H H H Cl', '0-1 0-2 0-3 0-4 4-5'],
  ['Nitrure de magnésium', 'Mg N Mg N Mg', '0-1 1-2 2-3 3-4'],
  ['Hydrure de sodium', 'Na H', '0-1'],
  ['Propane', 'C C C H H H H H H H H', '0-1 1-2 0-3 0-4 0-5 1-6 1-7 2-8 2-9 2-10'],
  ['Butane', 'C C C C H H H H H H H H H H', '0-1 1-2 2-3 0-4 0-5 0-6 1-7 1-8 2-9 2-10 3-11 3-12 3-13'],
  ['Propène', 'C C C H H H H H H', '0=1 1-2 0-3 0-4 1-5 2-6 2-7 2-8'],
  ['Benzène', 'C C C C C C H H H H H H', '0=1 1-2 2=3 3-4 4=5 5-0 0-6 1-7 2-8 3-9 4-10 5-11'],
  ['Éthanol', 'C C O H H H H H H', '0-1 1-2 0-3 0-4 0-5 1-6 1-7 2-8'],
  ['Méthanal (formaldéhyde)', 'C O H H', '0=1 0-2 0-3'],
  ['Acide éthanoïque (acide acétique)', 'C C O O H H H H', '0-1 1=2 1-3 3-7 0-4 0-5 0-6'],
  ['Chlorométhane', 'C Cl H H H', '0-1 0-2 0-3 0-4'],
  ['Dichlorométhane', 'C Cl Cl H H', '0-1 0-2 0-3 0-4'],
  ['Trichlorométhane (chloroforme)', 'C Cl Cl Cl H', '0-1 0-2 0-3 0-4'],
  ['Tétrachlorométhane', 'C Cl Cl Cl Cl', '0-1 0-2 0-3 0-4'],
  ["Cyanure d'hydrogène", 'C H N', '0-1 0#2', 'HCN'],
  ['Acide hypochloreux', 'O H Cl', '0-1 0-2'],
  ['Acide perchlorique', 'Cl O O O O H', '0=1 0=2 0=3 0-4 4-5'],
  ['Hypochlorite de sodium', 'Cl O Na', '0-1 1-2']
];

// Ordre d'écriture des symboles dans la formule (comme l'appli générale, iode après chlore).
const PRIORITY = ['Na', 'Mg', 'C', 'N', 'H', 'Cl', 'I', 'O'];
const SUB = '₀₁₂₃₄₅₆₇₈₉';

function buildFormula(counts) {
  return Object.keys(counts)
    .sort((a, b) => PRIORITY.indexOf(a) - PRIORITY.indexOf(b))
    .map(s => s + (counts[s] > 1 ? String(counts[s]).replace(/\d/g, d => SUB[d]) : ''))
    .join('');
}

export const CATALOGUE = RAW.map(([name, atoms, bonds, formula], index) => {
  const els = atoms.split(' ');
  const counts = {};
  els.forEach(e => { counts[e] = (counts[e] || 0) + 1; });
  const bondList = bonds.split(' ').map(b => {
    const [, i, sym, j] = b.match(/(\d+)([-=#])(\d+)/);
    return [+i, +j, { '-': 1, '=': 2, '#': 3 }[sym]];
  });
  return { name, els, counts, bondList, formula: formula || buildFormula(counts), size: els.length, index };
})
  // Priorité aux molécules qui ont le plus d'atomes.
  .sort((a, b) => b.size - a.size || a.index - b.index);

// ---------- Forme 3D (modèle compact) ----------
// Relaxation simple : liaisons de longueur fixe (sphères qui s'interpénètrent) et répulsion
// des « domaines » autour de chaque atome central (atomes voisins + doublets non liants),
// comme en VSEPR : l'eau est coudée, le méthane tétraédrique, le CO₂ linéaire…

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function computeLayout(entry) {
  const { els, bondList } = entry, n = els.length;
  const R = els.map(e => ATOMS[e].r);
  const rnd = mulberry32(entry.index + 1);
  const rv = () => new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5);
  const nb = els.map(() => []), bondSum = els.map(() => 0), bonded = new Set();
  for (const [i, j, o] of bondList) {
    nb[i].push(j); nb[j].push(i);
    bondSum[i] += o; bondSum[j] += o;
    bonded.add(i + ',' + j); bonded.add(j + ',' + i);
  }
  // Départ presque plat : atomes lourds sur un cercle dans l'ordre (un cycle comme le benzène
  // ne s'emmêle pas), hydrogènes juste à l'extérieur de leur voisin.
  const heavy = els.map((e, i) => i).filter(i => els[i] !== 'H');
  const P = els.map(() => null);
  heavy.forEach((i, k) => {
    const a = 2 * Math.PI * k / heavy.length, rad = heavy.length > 1 ? 0.6 * heavy.length : 0;
    P[i] = new THREE.Vector3(Math.cos(a) * rad, Math.sin(a) * rad, 0).add(rv().multiplyScalar(0.2));
  });
  els.forEach((e, i) => {
    if (P[i]) return;
    const host = nb[i].length && P[nb[i][0]] ? P[nb[i][0]] : new THREE.Vector3();
    const out = host.lengthSq() > 1e-6 ? host.clone().normalize() : rv().setZ(0).normalize();
    P[i] = host.clone().addScaledVector(out, 0.9).add(rv().multiplyScalar(0.6));
  });
  P.forEach(p => { p.z *= 0.2; });
  // Doublets non liants (points invisibles) des atomes qui ont au moins deux voisins.
  const lps = [];
  els.forEach((e, i) => {
    if (nb[i].length < 2) return;
    const k = Math.max(0, Math.floor((ATOMS[e].electrons - bondSum[i]) / 2));
    for (let m = 0; m < k; m++) lps.push({ c: i, p: P[i].clone().add(rv()) });
  });
  // Domaines autour de chaque atome central : { p : point, len : distance au centre }.
  const domains = els.map((_, i) => nb[i].map(j => ({ p: P[j], len: (R[i] + R[j]) * 0.85 }))
    .concat(lps.filter(l => l.c === i).map(l => ({ p: l.p, len: R[i] * 0.9 }))));
  // Angle idéal entre deux domaines (VSEPR) : 2 -> 180°, 3 -> 120°, 4 et plus -> 109,5°.
  const ideal = k => k === 2 ? Math.PI : k === 3 ? 2 * Math.PI / 3 : Math.acos(-1 / 3);

  const d = new THREE.Vector3();
  const spring = (a, b, len, k, onlyB) => {
    d.subVectors(b, a);
    const l = d.length() || 1e-6;
    d.multiplyScalar((l - len) / l * k);
    if (onlyB) { b.sub(d); return; }
    a.addScaledVector(d, 0.5);
    b.addScaledVector(d, -0.5);
  };

  // Rapproche les points `movers` du plan (a, b, c).
  const nrm = new THREE.Vector3(), e = new THREE.Vector3();
  const toPlane = (a, b, c, movers) => {
    nrm.subVectors(b, a).cross(e.subVectors(c, a));
    if (nrm.lengthSq() < 1e-8) return;
    nrm.normalize();
    for (const p of movers) p.addScaledVector(nrm, -e.subVectors(p, a).dot(nrm) * 0.3);
  };

  for (let it = 0, iters = 1500 + 300 * n; it < iters; it++) {
    for (const [i, j] of bondList) spring(P[i], P[j], (R[i] + R[j]) * 0.85, 0.5);
    for (const l of lps) spring(P[l.c], l.p, R[l.c] * 0.9, 0.5, true);
    // Ressorts d'angle : la distance entre deux domaines voisins impose l'angle au centre.
    domains.forEach(D => {
      if (D.length < 2) return;
      const cos = Math.cos(ideal(D.length));
      for (let a = 0; a < D.length; a++) {
        for (let b = a + 1; b < D.length; b++) {
          const la = D[a].len, lb = D[b].len;
          spring(D[a].p, D[b].p, Math.sqrt(la * la + lb * lb - 2 * la * lb * cos), 0.3);
        }
      }
    });
    // Atome à 3 domaines : plan (comme le carbone de l'éthène ou du benzène),
    // et une double liaison garde ses deux atomes et leurs voisins dans le même plan.
    domains.forEach((D, c) => {
      if (D.length !== 3) return;
      toPlane(D[0].p, D[1].p, D[2].p, [P[c]]);
    });
    for (const [i, j, o] of bondList) {
      if (o !== 2 || domains[i].length !== 3 || domains[j].length !== 3) continue;
      toPlane(domains[i][0].p, domains[i][1].p, domains[i][2].p, domains[j].map(x => x.p).filter(p => p !== P[i]));
    }
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (bonded.has(i + ',' + j)) continue;
        d.subVectors(P[j], P[i]);
        const l = d.length() || 1e-6, min = R[i] + R[j];
        if (l < min) { d.multiplyScalar((min - l) / l * 0.25); P[i].sub(d); P[j].add(d); }
      }
    }
  }

  // Centre et axes principaux : le plus grand à l'horizontale (x), le plus petit vers le spectateur (y) :
  // une molécule plane se présente de face.
  const c = new THREE.Vector3();
  P.forEach(p => c.add(p));
  c.divideScalar(n);
  P.forEach(p => p.sub(c));
  const e1 = principal(P, []), e3 = principal(P, [e1], true);
  const x = e1, y = e3, z = new THREE.Vector3().crossVectors(x, y);
  return P.map(p => new THREE.Vector3(p.dot(x), p.dot(y), p.dot(z)));
}

// Axe de plus grande (ou plus petite) dispersion, orthogonal aux axes déjà trouvés.
function principal(P, exclude, smallest) {
  const cov = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const p of P) {
    const a = [p.x, p.y, p.z];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) cov[i * 3 + j] += a[i] * a[j];
  }
  // Plus petite dispersion : on cherche la plus grande valeur de (trace + 1)·I − cov.
  const shift = smallest ? cov[0] + cov[4] + cov[8] + 1 : 0;
  const M = cov.map((x, k) => smallest ? (k % 4 === 0 ? shift : 0) - x : x);
  let v = new THREE.Vector3(0.6, 0.5, 0.62);
  for (let k = 0; k < 60; k++) {
    for (const e of exclude) v.addScaledVector(e, -v.dot(e));
    const a = [v.x, v.y, v.z], r = [0, 0, 0];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i] += M[i * 3 + j] * a[j];
    v.set(r[0], r[1], r[2]);
    if (v.lengthSq() < 1e-12) v.set(0, 0, 1);
    v.normalize();
  }
  for (const e of exclude) v.addScaledVector(e, -v.dot(e));
  if (v.lengthSq() < 1e-6) v = new THREE.Vector3(0, 1, 0).cross(exclude[0]);
  if (v.lengthSq() < 1e-6) v = new THREE.Vector3(0, 0, 1).cross(exclude[0]);
  return v.normalize();
}

const layouts = new Map();
export function layout(entry) {
  if (!layouts.has(entry)) layouts.set(entry, computeLayout(entry));
  return layouts.get(entry);
}
