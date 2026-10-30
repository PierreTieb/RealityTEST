// util.js
// Petites fonctions d'animation communes aux vues.
import * as THREE from 'three';

export const POP_TIME = 0.28;       // gonflement d'un objet qui apparaît (s)
export const SHRINK_TIME = 0.2;     // dégonflement d'un objet qui disparaît (s)

// Gonflement façon ballon (léger dépassement puis retour à 1).
export function popScale(age) {
  if (age >= POP_TIME) return 1;
  const x = Math.max(0, age / POP_TIME) - 1, c = 2.4;
  return 1 + (c + 1) * x * x * x + c * x * x;
}

export function randomUnit() {
  const z = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - z * z);
  return new THREE.Vector3(r * Math.cos(a), r * Math.sin(a), z);
}

// Matière des sphères : couleurs vives, léger satiné.
export function satin(color) {
  return new THREE.MeshPhysicalMaterial({
    color, roughness: 0.55, metalness: 0, clearcoat: 0.25, clearcoatRoughness: 0.5, envMapIntensity: 0.75
  });
}

// Repère universel (id 0), proposé sous « Montre le repère » dans les modules qui l'utilisent.
export const UNIVERSAL_MARKERS = {
  link: 'Pas de repère ? Affiche-le ici',
  title: 'Le repère',
  tip: "Imprime-le, ou affiche cette page sur un autre écran (téléphone d'un camarade, ordinateur) et vise-la avec la caméra.",
  images: ['repere/repere.png'],
  pdf: 'repere/repere-a-imprimer.pdf'
};
