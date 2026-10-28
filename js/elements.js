// elements.js
// Les 20 premiers éléments (mêmes données que « Les Bases de la chimie ») et les ions réels.
// mass = nombre de nucléons (A) de l'isotope le plus courant.

export const ELEMENTS = [
  { z: 1,  symbol: 'H',  name: 'Hydrogène', mass: 1 },
  { z: 2,  symbol: 'He', name: 'Hélium',    mass: 4 },
  { z: 3,  symbol: 'Li', name: 'Lithium',   mass: 7 },
  { z: 4,  symbol: 'Be', name: 'Béryllium', mass: 9 },
  { z: 5,  symbol: 'B',  name: 'Bore',      mass: 11 },
  { z: 6,  symbol: 'C',  name: 'Carbone',   mass: 12 },
  { z: 7,  symbol: 'N',  name: 'Azote',     mass: 14 },
  { z: 8,  symbol: 'O',  name: 'Oxygène',   mass: 16 },
  { z: 9,  symbol: 'F',  name: 'Fluor',     mass: 19 },
  { z: 10, symbol: 'Ne', name: 'Néon',      mass: 20 },
  { z: 11, symbol: 'Na', name: 'Sodium',    mass: 23 },
  { z: 12, symbol: 'Mg', name: 'Magnésium', mass: 24 },
  { z: 13, symbol: 'Al', name: 'Aluminium', mass: 27 },
  { z: 14, symbol: 'Si', name: 'Silicium',  mass: 28 },
  { z: 15, symbol: 'P',  name: 'Phosphore', mass: 31 },
  { z: 16, symbol: 'S',  name: 'Soufre',    mass: 32 },
  { z: 17, symbol: 'Cl', name: 'Chlore',    mass: 35 },
  { z: 18, symbol: 'Ar', name: 'Argon',     mass: 40 },
  { z: 19, symbol: 'K',  name: 'Potassium', mass: 39 },
  { z: 20, symbol: 'Ca', name: 'Calcium',   mass: 40 }
];

// Ions affichés (les autres compositions chargées sont des « ions qui n'existent pas »).
// Même liste que l'appli générale, B³⁺ et H⁻ compris.
const IONS = {
  'H+1': 'Ion hydrogène', 'H-1': 'Ion hydrure',
  'Li+1': 'Ion lithium', 'Be+2': 'Ion béryllium', 'B+3': 'Ion bore',
  'N-3': 'Ion nitrure', 'O-2': 'Ion oxyde', 'F-1': 'Ion fluorure',
  'Na+1': 'Ion sodium', 'Mg+2': 'Ion magnésium', 'Al+3': 'Ion aluminium',
  'P-3': 'Ion phosphure', 'S-2': 'Ion sulfure', 'Cl-1': 'Ion chlorure',
  'K+1': 'Ion potassium', 'Ca+2': 'Ion calcium'
};

export function getByZ(z) { return ELEMENTS[z - 1] || null; }

// Nom de l'ion réel (symbole, charge), ou null.
export function ionName(symbol, charge) {
  return IONS[symbol + (charge > 0 ? '+' : '-') + Math.abs(charge)] || null;
}

// Charge en exposant : "+", "2−"...
export function chargeText(charge) {
  if (!charge) return '';
  const n = Math.abs(charge);
  return (n > 1 ? n : '') + (charge > 0 ? '+' : '−');
}
