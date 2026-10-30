// ar.js
// Moteur de réalité augmentée commun à toutes les vues :
// - caméra (getUserMedia), affichée plein écran derrière la scène 3D ;
// - détection du repère (ArUco, dictionnaire ARUCO_MIP_36h12, id 0) et calcul de sa position (POSIT) ;
// - scène three.js dont le groupe `anchor` suit le repère (1 unité = côté du carré noir).
// Une vue ajoute ses objets dans stage.anchor et reçoit onFrame(dt, temps) à chaque image.
// Mode plusieurs repères (setMulti) : stage.markers donne la position de chaque repère vu (id -> pose),
// et la vue place elle-même ses objets dans stage.scene (coordonnées caméra).
import * as THREE from 'three';
import { RoomEnvironment } from '../lib/RoomEnvironment.js';

export const MARKER_ID = 0;
const FOCAL_RATIO = 0.85;   // focale supposée / grand côté de l'image (≈ 60° de champ)
const DETECT_SIZE = 640;    // grand côté de l'image analysée (px)
const DETECT_SIZE_MULTI = 960;
const HOLD_TIME = 3000;     // repère caché : l'objet reste affiché pendant 3 s
const SMOOTH = 0.5;         // lissage des mouvements (0 = figé, 1 = brut)

// ---------- Caméra ----------

let stream = null;

export function cameraAvailable() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

// Démarre la caméra (arrière par défaut) ; renvoie l'id de la caméra utilisée.
export async function startCamera(video, deviceId) {
  stopCamera();
  const constraints = deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } };
  constraints.width = { ideal: 1280 };
  constraints.height = { ideal: 720 };
  stream = await navigator.mediaDevices.getUserMedia({ video: constraints, audio: false });
  video.srcObject = stream;
  await video.play();
  if (!video.videoWidth) await new Promise(r => video.addEventListener('loadedmetadata', r, { once: true }));
  const track = stream.getVideoTracks()[0];
  return track && track.getSettings ? track.getSettings().deviceId : null;
}

export function stopCamera() {
  if (stream) stream.getTracks().forEach(t => t.stop());
  stream = null;
}

export async function listCameras() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter(d => d.kind === 'videoinput');
}

// ---------- Détection du repère ----------

class MarkerTracker {
  constructor() {
    this.detector = new window.AR.Detector({ dictionaryName: 'ARUCO_MIP_36h12' });
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.posit = null;
    this.detectSize = DETECT_SIZE;
  }

  // Tous les repères vus : [{ id, matrix (repère -> caméra, repère three.js), center (0-1 dans l'image) }].
  detectAll(source, sw, sh) {
    const k = this.detectSize / Math.max(sw, sh);
    const w = Math.round(sw * k), h = Math.round(sh * k);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.posit = new window.POS.Posit(1, FOCAL_RATIO * Math.max(w, h));
    }
    this.ctx.drawImage(source, 0, 0, w, h);
    const found = [];
    for (const m of this.detector.detect(this.ctx.getImageData(0, 0, w, h))) {
      // POSIT : origine au centre de l'image, y vers le haut, z vers l'avant.
      const pose = this.posit.pose(m.corners.map(c => ({ x: c.x - w / 2, y: h / 2 - c.y })));
      const r = pose.bestRotation, t = pose.bestTranslation;
      if (!(t[2] > 0)) continue;
      // Passage au repère three.js (z vers l'arrière) : on inverse l'axe z des deux côtés.
      const matrix = new THREE.Matrix4().set(
         r[0][0],  r[0][1], -r[0][2],  t[0],
         r[1][0],  r[1][1], -r[1][2],  t[1],
        -r[2][0], -r[2][1],  r[2][2], -t[2],
         0, 0, 0, 1);
      const center = m.corners.reduce((c, p) => ({ x: c.x + p.x / 4 / w, y: c.y + p.y / 4 / h }), { x: 0, y: 0 });
      found.push({ id: m.id, matrix, center });
    }
    return found;
  }

  // Un seul repère d'id donné. S'il y en a plusieurs, on garde le plus proche du précédent
  // (l'objet ne saute pas de l'un à l'autre). Renvoie la matrice, ou null.
  detect(id, source, sw, sh) {
    const markers = this.detectAll(source, sw, sh).filter(mk => mk.id === id);
    if (!markers.length) return null;
    let m = markers[0];
    if (this.last && markers.length > 1) {
      const dist = mk => (mk.center.x - this.last.x) ** 2 + (mk.center.y - this.last.y) ** 2;
      m = markers.reduce((a, b) => dist(b) < dist(a) ? b : a);
    }
    this.last = m.center;
    return m.matrix;
  }
}

// ---------- Scène ----------

export class ArStage {
  // els : { root, video, layer, canvas }   onTracking(trouvé : bool)
  constructor(els, onTracking) {
    this.els = els;
    this.onTracking = onTracking || (() => {});
    this.onFrame = null;
    this.tracker = new MarkerTracker();
    this.multi = false;
    this.markers = new Map();
    this.hold = false;          // une vue peut garder sa scène affichée sans repère (mode libre)

    const renderer = this.renderer = new THREE.WebGLRenderer({ canvas: els.canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;          // ombres portées (éclipses) : seules les lumières qui le demandent en font
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
    pmrem.dispose();

    // La caméra reste à l'origine : c'est le repère qui bouge.
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.01, 100);
    const key = this.keyLight = new THREE.DirectionalLight(0xffffff, 1.4);   // lumière « de face », attachée à la caméra
    key.position.set(-0.6, 1, 0.8);
    this.camera.add(key);
    this.scene.add(this.camera);

    this.anchor = new THREE.Group();
    this.anchor.visible = false;
    this.scene.add(this.anchor);

    this.found = false;
    this.lastSeen = -Infinity;
    this.size = { w: 0, h: 0, vw: 0, vh: 0 };
    this._pos = new THREE.Vector3();
    this._quat = new THREE.Quaternion();
    this._scl = new THREE.Vector3();
    this._v = new THREE.Vector3();
    this._loop = this._loop.bind(this);
    this._raf = 0;
  }

  start(source) {
    this.source = source || this.els.video;   // une image peut remplacer la vidéo (tests)
    this.found = false;
    this.lastSeen = -Infinity;
    this.anchor.visible = false;
    this.markers.clear();
    this._setFound(false, true);
    this._last = performance.now();
    this._lastVideoTime = -1;
    cancelAnimationFrame(this._raf);
    this._raf = requestAnimationFrame(this._loop);
  }

  stop() {
    cancelAnimationFrame(this._raf);
    this._raf = 0;
    this.onFrame = null;
  }

  // Facteur pour convertir une taille 3D en pixels de point (shaders de particules).
  get pointScale() {
    return this.renderer.getDrawingBufferSize(this._v).y * this.camera.projectionMatrix.elements[5] / 2;
  }

  // Position à l'écran (px CSS) d'un point de la scène.
  toScreen(p) {
    const v = this._v.copy(p).project(this.camera);
    return { x: (v.x + 1) / 2 * this.size.w, y: (1 - v.y) / 2 * this.size.h, front: v.z < 1 };
  }

  _sourceSize() {
    const s = this.source;
    return s.videoWidth !== undefined ? [s.videoWidth, s.videoHeight] : [s.naturalWidth || s.width, s.naturalHeight || s.height];
  }

  // La vidéo est affichée en « cover » : on règle le champ de la caméra 3D pour coller à l'image.
  _resize() {
    const w = this.els.root.clientWidth, h = this.els.root.clientHeight;
    const [vw, vh] = this._sourceSize();
    const s = this.size;
    if (!w || !h || !vw || (w === s.w && h === s.h && vw === s.vw && vh === s.vh)) return;
    Object.assign(s, { w, h, vw, vh });
    this.renderer.setSize(w, h, false);
    const scale = Math.max(w / vw, h / vh);
    const f = FOCAL_RATIO * Math.max(vw, vh) * scale;
    this.camera.fov = 2 * Math.atan(h / 2 / f) * 180 / Math.PI;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _setFound(found, force) {
    if (found === this.found && !force) return;
    this.found = found;
    this.els.layer.classList.toggle('is-hidden', !found);
    this.onTracking(found);
  }

  _track(now) {
    const src = this.source;
    if (src.readyState !== undefined) {
      if (src.readyState < 2 || src.currentTime === this._lastVideoTime) return;
      this._lastVideoTime = src.currentTime;
    }
    const [sw, sh] = this._sourceSize();
    if (!sw) return;
    if (this.multi) return this._trackAll(now, src, sw, sh);
    const m = this.tracker.detect(MARKER_ID, src, sw, sh);
    if (m) {
      m.decompose(this._pos, this._quat, this._scl);
      const a = this.anchor;
      if (this.found) {
        a.position.lerp(this._pos, SMOOTH);
        a.quaternion.slerp(this._quat, SMOOTH);
      } else {
        a.position.copy(this._pos);
        a.quaternion.copy(this._quat);
      }
      a.visible = true;
      this.lastSeen = now;
      this._setFound(true);
    } else if (this.found && now - this.lastSeen > HOLD_TIME) {
      this._setFound(false);
    }
  }

  // Mode plusieurs repères : this.markers garde chaque repère vu depuis moins de 3 s.
  _trackAll(now, src, sw, sh) {
    for (const f of this.tracker.detectAll(src, sw, sh)) {
      const pos = new THREE.Vector3(), quat = new THREE.Quaternion();
      f.matrix.decompose(pos, quat, this._scl);
      const m = this.markers.get(f.id);
      if (m) {
        m.position.lerp(pos, SMOOTH);
        m.quaternion.slerp(quat, SMOOTH);
        m.lastSeen = now;
      } else {
        this.markers.set(f.id, { id: f.id, position: pos, quaternion: quat, lastSeen: now });
      }
    }
    for (const [id, m] of this.markers) if (now - m.lastSeen > HOLD_TIME) this.markers.delete(id);
    this._setFound(this.markers.size > 0 || this.hold);
  }

  // Une vue à plusieurs repères (molécules) analyse une image plus fine : repères plus petits.
  setMulti(on) {
    this.multi = on;
    this.markers.clear();
    this.tracker.detectSize = on ? DETECT_SIZE_MULTI : DETECT_SIZE;
  }

  _loop(now) {
    this._raf = requestAnimationFrame(this._loop);
    // La première image peut porter une date antérieure au démarrage : jamais de durée négative.
    const dt = Math.max(0, Math.min(0.05, (now - this._last) / 1000));
    this._last = now;
    this._resize();
    this._track(now);
    if (this.onFrame) this.onFrame(dt, now / 1000);
    this.renderer.render(this.scene, this.camera);
  }
}
