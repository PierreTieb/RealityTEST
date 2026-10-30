// free-look.js
// Mode libre : quand plus aucun repère n'est vu, la scène reste figée dans l'espace.
// - gyroscope : si on tourne le téléphone, l'objet reste à sa place (le gyroscope donne l'orientation,
//   pas le déplacement : marcher autour de l'objet ne change pas le point de vue) ;
// - doigt : glisser fait tourner l'objet sur lui-même pour le voir sous toutes ses faces.
import * as THREE from 'three';

const DEG = Math.PI / 180;
const Z = new THREE.Vector3(0, 0, 1);
const Q_SCREEN = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));   // -90° autour de x
const DRAG_SPEED = 0.008;     // rad par pixel

let reading = null;
window.addEventListener('deviceorientation', e => { if (e.alpha != null) reading = e; });

// iPhone : l'accès au gyroscope se demande pendant un toucher (ex. clic sur le bouton de la vue).
export function requestMotion() {
  const D = window.DeviceOrientationEvent;
  if (D && typeof D.requestPermission === 'function') D.requestPermission().catch(() => {});
}

// Orientation de la caméra du téléphone dans le monde (même calcul que DeviceOrientationControls de three.js).
function deviceQuaternion(out) {
  if (!reading) return null;
  const screenAngle = (screen.orientation ? screen.orientation.angle : window.orientation || 0) * DEG;
  out.setFromEuler(new THREE.Euler(reading.beta * DEG, reading.alpha * DEG, -reading.gamma * DEG, 'YXZ'));
  out.multiply(Q_SCREEN);
  out.multiply(new THREE.Quaternion().setFromAxisAngle(Z, -screenAngle));
  return out;
}

export class FreeLook {
  constructor(el) {
    this.el = el;
    this.active = false;
    this.gyro = new THREE.Quaternion();
    this.spin = new THREE.Quaternion();
    this.abort = new AbortController();
    let last = null;
    const opts = { signal: this.abort.signal };
    el.addEventListener('pointerdown', e => {
      if (!this.active || e.target.closest('button, a, .rx-catalog, .marker-viewer')) return;
      last = { x: e.clientX, y: e.clientY, id: e.pointerId };
    }, opts);
    el.addEventListener('pointermove', e => {
      if (!last || e.pointerId !== last.id) return;
      this.drag(e.clientX - last.x, e.clientY - last.y);
      last.x = e.clientX;
      last.y = e.clientY;
    }, opts);
    const end = () => { last = null; };
    el.addEventListener('pointerup', end, opts);
    el.addEventListener('pointercancel', end, opts);
  }

  dispose() { this.abort.abort(); }

  // center : point (repère caméra) autour duquel l'objet tourne au doigt.
  start(center) {
    this.active = true;
    this.center = center.clone();
    this.spin.identity();
    this.gyro.identity();
    this.q0 = deviceQuaternion(new THREE.Quaternion());
  }

  stop() { this.active = false; }

  update() {
    if (!this.active || !this.q0) return;
    const q = deviceQuaternion(new THREE.Quaternion());
    if (q) this.gyro.copy(q.invert().multiply(this.q0));   // Q(t)⁻¹ · Q(départ)
  }

  // Glisser : rotation autour des axes de l'écran tel qu'on le voit maintenant.
  drag(dx, dy) {
    const inv = this.gyro.clone().invert();
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(inv);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(inv);
    const r = new THREE.Quaternion().setFromAxisAngle(up, dx * DRAG_SPEED)
      .multiply(new THREE.Quaternion().setFromAxisAngle(right, dy * DRAG_SPEED));
    this.spin.premultiply(r);
  }

  // Position / orientation d'un élément figé au départ en p0 / q0 (repère caméra).
  position(p0, out = new THREE.Vector3()) {
    return out.copy(p0).sub(this.center).applyQuaternion(this.spin).add(this.center).applyQuaternion(this.gyro);
  }

  quaternion(q0, out = new THREE.Quaternion()) {
    return out.copy(this.gyro).multiply(this.spin).multiply(q0);
  }
}
