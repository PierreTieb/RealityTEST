// chemistry.js
// Données du module « Transformation chimique » : atomes, espèces chimiques (structure 3D),
// réactions (catalogue de « Les Bases de la chimie », aucun réactif à plus de 4 exemplaires)
// et repères imprimés (un par réactif, autant d'exemplaires que son plus grand coefficient).
// outils/repere_reactifs.py lit ce fichier pour fabriquer le PDF des repères : garder le format
// des lignes de SPECIES et de REACTIONS.
import * as THREE from 'three';

// Couleur et rayon (côtés de repère, croît avec le numéro atomique) ; electrons = électrons de valence.
export const ATOMS = {
  H:  { color: 0xf2f2f2, r: 0.45, electrons: 1 },
  Li: { color: 0xe07bd0, r: 0.52, electrons: 1 },
  C:  { color: 0x262626, r: 0.62, electrons: 4 },
  N:  { color: 0x2d62ff, r: 0.64, electrons: 5 },
  O:  { color: 0xff2a2a, r: 0.66, electrons: 6 },
  Na: { color: 0xffd21f, r: 0.80, electrons: 1 },
  Mg: { color: 0x9aa0a8, r: 0.82, electrons: 2 },
  Al: { color: 0xd8a7c4, r: 0.85, electrons: 3 },
  Si: { color: 0xc9a66b, r: 0.87, electrons: 4 },
  S:  { color: 0xff9f1c, r: 0.90, electrons: 6 },
  Cl: { color: 0x2fcf4a, r: 0.92, electrons: 7 },
  Ca: { color: 0x6fb08c, r: 1.02, electrons: 2 }
};

// Espèces : [nom, formule affichée, atomes, liaisons ("i-j" simple, "i=j" double, "i#j" triple)].
// Les métaux et le carbone, le soufre, le silicium sont représentés par un seul atome.
const RAW_SPECIES = {
  'H2': ["Dihydrogène", "H₂", "H H", "0-1"],
  'O2': ["Dioxygène", "O₂", "O O", "0=1"],
  'N2': ["Diazote", "N₂", "N N", "0#1"],
  'Cl2': ["Dichlore", "Cl₂", "Cl Cl", "0-1"],
  'H2O': ["Eau", "H₂O", "O H H", "0-1 0-2"],
  'CO2': ["Dioxyde de carbone", "CO₂", "C O O", "0=1 0=2"],
  'CO': ["Monoxyde de carbone", "CO", "C O", "0#1"],
  'CH4': ["Méthane", "CH₄", "C H H H H", "0-1 0-2 0-3 0-4"],
  'C2H6O': ["Éthanol", "C₂H₆O", "C C O H H H H H H", "0-1 1-2 0-3 0-4 0-5 1-6 1-7 2-8"],
  'C': ["Carbone", "C", "C", ""],
  'S': ["Soufre", "S", "S", ""],
  'Si': ["Silicium", "Si", "Si", ""],
  'Na': ["Sodium", "Na", "Na", ""],
  'Mg': ["Magnésium", "Mg", "Mg", ""],
  'Al': ["Aluminium", "Al", "Al", ""],
  'Li': ["Lithium", "Li", "Li", ""],
  'Ca': ["Calcium", "Ca", "Ca", ""],
  'MgO': ["Oxyde de magnésium", "MgO", "Mg O", "0=1"],
  'CaO': ["Oxyde de calcium", "CaO", "Ca O", "0=1"],
  'Li2O': ["Oxyde de lithium", "Li₂O", "O Li Li", "0-1 0-2"],
  'Al2O3': ["Oxyde d'aluminium", "Al₂O₃", "O Al O Al O", "0=1 1-2 2-3 3=4"],
  'SiO2': ["Dioxyde de silicium", "SiO₂", "Si O O", "0=1 0=2"],
  'SO2': ["Dioxyde de soufre", "SO₂", "S O O", "0=1 0=2"],
  'SO3': ["Trioxyde de soufre", "SO₃", "S O O O", "0=1 0=2 0=3"],
  'NO': ["Monoxyde d'azote", "NO", "N O", "0=1"],
  'NH3': ["Ammoniac", "NH₃", "N H H H", "0-1 0-2 0-3"],
  'NH4Cl': ["Chlorure d'ammonium", "NH₄Cl", "N H H H H Cl", "0-1 0-2 0-3 0-4 4-5"],
  'HCl': ["Acide chlorhydrique", "HCl", "H Cl", "0-1"],
  'NaCl': ["Chlorure de sodium", "NaCl", "Na Cl", "0-1"],
  'MgCl2': ["Chlorure de magnésium", "MgCl₂", "Mg Cl Cl", "0-1 0-2"],
  'CaCl2': ["Chlorure de calcium", "CaCl₂", "Ca Cl Cl", "0-1 0-2"],
  'NaOH': ["Hydroxyde de sodium", "NaOH", "Na O H", "0-1 1-2"],
  'Mg(OH)2': ["Hydroxyde de magnésium", "Mg(OH)₂", "Mg O O H H", "0-1 0-2 1-3 2-4"],
  'Ca(OH)2': ["Hydroxyde de calcium", "Ca(OH)₂", "Ca O O H H", "0-1 0-2 1-3 2-4"],
  'H2SO4': ["Acide sulfurique", "H₂SO₄", "S O O O O H H", "0=1 0=2 0-3 0-4 3-5 4-6"],
  'Na2SO4': ["Sulfate de sodium", "Na₂SO₄", "S O O O O Na Na", "0=1 0=2 0-3 0-4 3-5 4-6"],
  'H2CO3': ["Acide carbonique", "H₂CO₃", "C O O O H H", "0=1 0-2 0-3 2-4 3-5"],
  'CaCO3': ["Carbonate de calcium", "CaCO₃", "C O O O Ca", "0=1 0-2 0-3 2-4 3-4"],
  'Na2CO3': ["Carbonate de sodium", "Na₂CO₃", "C O O O Na Na", "0=1 0-2 0-3 2-4 3-5"],
  'NaHCO3': ["Hydrogénocarbonate de sodium", "NaHCO₃", "C O O O Na H", "0=1 0-2 0-3 2-4 3-5"]
};

export const SPECIES = {};
Object.entries(RAW_SPECIES).forEach(([key, [name, formula, atoms, bonds]], index) => {
  const els = atoms.split(' ');
  const bondList = bonds ? bonds.split(' ').map(b => {
    const [, i, sym, j] = b.match(/(\d+)([-=#])(\d+)/);
    return [+i, +j, { '-': 1, '=': 2, '#': 3 }[sym]];
  }) : [];
  const counts = {};
  els.forEach(e => { counts[e] = (counts[e] || 0) + 1; });
  SPECIES[key] = { key, name, formula, els, bondList, counts, index };
});

// Réactions équilibrées (plus petits coefficients). Catalogue de « Les Bases de la chimie »,
// sans celles qui demandent plus de 4 fois le même réactif (propane, butane, éthane, phosphore,
// aluminium + acide, ammoniac + dioxygène, photosynthèse, respiration) ni celles à un seul réactif
// (décompositions : pas utilisées au collège).
const RAW_REACTIONS = [
  '2 H2 + O2 -> 2 H2O',
  'C + O2 -> CO2',
  'CH4 + 2 O2 -> CO2 + 2 H2O',
  '2 Mg + O2 -> 2 MgO',
  '2 Na + Cl2 -> 2 NaCl',
  'CaCO3 + 2 HCl -> CaCl2 + H2O + CO2',
  'N2 + 3 H2 -> 2 NH3',
  'S + O2 -> SO2',
  '4 Al + 3 O2 -> 2 Al2O3',
  'C2H6O + 3 O2 -> 2 CO2 + 3 H2O',
  'Ca(OH)2 + 2 HCl -> CaCl2 + 2 H2O',
  '2 NaOH + H2SO4 -> Na2SO4 + 2 H2O',
  '2 CO + O2 -> 2 CO2',
  'H2 + Cl2 -> 2 HCl',
  '4 Li + O2 -> 2 Li2O',
  '2 Na + 2 H2O -> 2 NaOH + H2',
  'Mg + 2 HCl -> MgCl2 + H2',
  'N2 + O2 -> 2 NO',
  '2 SO2 + O2 -> 2 SO3',
  '2 Ca + O2 -> 2 CaO',
  'HCl + NaOH -> NaCl + H2O',
  'CaO + H2O -> Ca(OH)2',
  'Mg(OH)2 + 2 HCl -> MgCl2 + 2 H2O',
  'CO2 + H2O -> H2CO3',
  'SO3 + H2O -> H2SO4',
  'Na2CO3 + 2 HCl -> 2 NaCl + H2O + CO2',
  'NaHCO3 + HCl -> NaCl + H2O + CO2',
  'NH3 + HCl -> NH4Cl',
  'Si + O2 -> SiO2'
];

const side = s => s.split(' + ').map(t => {
  const m = t.trim().match(/^(\d+)?\s*(\S+)$/);
  return { key: m[2], n: m[1] ? +m[1] : 1 };
});

export const REACTIONS = RAW_REACTIONS.map(text => {
  const [l, r] = text.split(' -> ');
  const rx = { text, reactants: side(l), products: side(r) };
  rx.signature = rx.reactants.map(x => x.key).sort().join('+');
  // Vérification : mêmes atomes des deux côtés.
  const tally = (list, sign, acc) => list.forEach(x => Object.entries(SPECIES[x.key].counts)
    .forEach(([e, c]) => { acc[e] = (acc[e] || 0) + sign * c * x.n; }));
  const acc = {};
  tally(rx.reactants, 1, acc);
  tally(rx.products, -1, acc);
  if (Object.values(acc).some(v => v)) console.warn('Réaction non équilibrée :', text);
  return rx;
});

// Repères imprimés : [réactif, nombre d'exemplaires], ids à partir de 1 dans cet ordre
// (l'id 0 est le repère universel de la vue Atome). Liste figée : des repères sont déjà imprimés,
// ne jamais changer l'ordre ni retirer une ligne ; ajouter les nouveaux réactifs à la fin.
// null : repère d'une espèce retirée (réactions à un seul réactif) ; ignoré, son id reste réservé.
export const CARDS = [
  ['H2', 3], ['O2', 3], ['C', 1], ['CH4', 1], ['Mg', 2], ['Na', 2], ['Cl2', 1], ['CaCO3', 1],
  ['HCl', 2], ['N2', 1], ['S', 1], ['Al', 4], ['C2H6O', 1],
  [null, 2],    // ex-H2O2 (eau oxygénée)
  ['Ca(OH)2', 1], ['NaOH', 2], ['H2SO4', 1],
  [null, 2],    // ex-KClO3 (chlorate de potassium)
  ['CO', 2], ['Li', 4], ['H2O', 2], ['SO2', 2], ['Ca', 2],
  [null, 1],    // ex-C6H12O6 (glucose)
  ['CaO', 1], ['Mg(OH)2', 1], ['CO2', 1], ['SO3', 1], ['Na2CO3', 1], ['NaHCO3', 1], ['NH3', 1], ['Si', 1]
];
export const CARD_SPECIES = {};
{
  let id = 1;
  for (const [key, n] of CARDS) for (let i = 0; i < n; i++, id++) if (key) CARD_SPECIES[id] = key;
}
// Vérification : chaque réaction a assez de repères pour chacun de ses réactifs.
for (const rx of REACTIONS) {
  for (const { key, n } of rx.reactants) {
    const have = CARDS.filter(c => c[0] === key).reduce((s, c) => s + c[1], 0);
    if (have < n) console.warn(`Pas assez de repères ${key} pour : ${rx.text}`);
  }
}

// Réaction dont les réactifs sont exactement ces espèces (signature : clés triées jointes par « + »).
export function findReaction(keys) {
  const sig = [...keys].sort().join('+');
  return REACTIONS.find(rx => rx.signature === sig) || null;
}

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
// Positions des atomes (unités : côtés de repère), centrées, molécule plane présentée de face.
export function layout(entry) {
  if (!layouts.has(entry)) layouts.set(entry, computeLayout(entry));
  return layouts.get(entry);
}
