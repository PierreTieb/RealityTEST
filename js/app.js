// app.js
// Navigation : accueil (choix du module) -> vue en réalité augmentée.
// La vue ne s'ouvre que si la caméra est accessible.
import { ArStage, cameraAvailable, startCamera, stopCamera, listCameras } from './ar.js';
import { AtomView } from './atom-view.js';
import { ReactionView } from './reaction-view.js';

const VIEWS = { atom: AtomView, reaction: ReactionView };
const SEARCH_TEXT = 'Montre le repère à la caméra';
const $ = id => document.getElementById(id);

let stage = null, view = null, pendingView = null, cameraId = null;

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('screen--active', s.id === 'screen-' + name));
}

function cameraErrorText(err) {
  if (!cameraAvailable()) return "La caméra n'est accessible que si l'appli est ouverte depuis une adresse sécurisée (https://…).";
  switch (err && err.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return "L'appli n'a pas le droit d'utiliser la caméra. Autorise l'appareil photo pour ce site " +
        "(icône à gauche de l'adresse, ou « aA » sur iPhone), puis touche « Réessayer ».";
    case 'NotFoundError':
    case 'OverconstrainedError':
      return "Aucune caméra n'a été trouvée sur cet appareil.";
    case 'NotReadableError':
      return 'La caméra est déjà utilisée par une autre application. Ferme-la, puis touche « Réessayer ».';
    default:
      return "La caméra n'a pas pu démarrer. Touche « Réessayer ».";
  }
}

async function openView(name) {
  pendingView = name;
  if (VIEWS[name].beforeOpen) VIEWS[name].beforeOpen();   // encore pendant le toucher : avant tout await
  if (!cameraAvailable()) return showCameraError(null);
  const video = $('ar-video');
  try {
    try {
      cameraId = await startCamera(video, cameraId);
    } catch (err) {
      if (!cameraId || err.name !== 'OverconstrainedError') throw err;
      cameraId = await startCamera(video, null);   // caméra choisie débranchée : on reprend celle par défaut
    }
  } catch (err) {
    return showCameraError(err);
  }

  showScreen('ar');
  if (!stage) {
    stage = new ArStage(
      { root: $('screen-ar'), video, layer: $('ar-layer'), canvas: $('ar-canvas') },
      found => $('ar-search').classList.toggle('is-hidden', found));
  }
  const View = VIEWS[name];
  $('ar-search-text').textContent = View.searchText || SEARCH_TEXT;
  $('ar-search-img').hidden = View.searchImage === false;
  $('ar-search-link').hidden = !View.searchLink;
  stage.start();
  view = new View(stage, { card: $('ar-card'), controls: $('ar-controls'), layer: $('ar-layer') });
  updateCameraSwitch();
}

function closeView() {
  if (view) view.dispose();
  view = null;
  if (stage) stage.stop();
  stopCamera();
}

function showCameraError(err) {
  closeView();
  $('camera-error-text').textContent = cameraErrorText(err);
  showScreen('camera-error');
}

async function updateCameraSwitch() {
  const cams = await listCameras().catch(() => []);
  $('camera-switch').hidden = cams.length < 2;
}

async function switchCamera() {
  const cams = await listCameras().catch(() => []);
  if (cams.length < 2) return;
  const i = cams.findIndex(c => c.deviceId === cameraId);
  const next = cams[(i + 1) % cams.length].deviceId;
  try {
    cameraId = await startCamera($('ar-video'), next);
  } catch (err) {
    showCameraError(err);
  }
}

// ---------- Liaisons ----------

document.addEventListener('click', e => {
  const go = e.target.closest('[data-go]');
  if (go) {
    closeView();
    showScreen(go.dataset.go);
    return;
  }
  const v = e.target.closest('[data-view]');
  if (v) openView(v.dataset.view);
});

$('camera-retry').addEventListener('click', () => openView(pendingView));
$('camera-switch').addEventListener('click', switchCamera);

// Pas de zoom au double appui (iPhone) : on peut taper vite sur les boutons.
document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
document.addEventListener('gesturestart', e => e.preventDefault(), { passive: false });

// Après une rotation, le navigateur peut garder la page décalée : les boutons s'affichent au bon endroit
// mais le toucher tombe à côté. On remet la page en place et on force le recalcul de l'écran affiché.
let rotateTimer = 0;
function resetViewport() {
  clearTimeout(rotateTimer);
  rotateTimer = setTimeout(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = document.body.scrollTop = 0;
    const active = document.querySelector('.screen--active');
    if (active) {
      active.style.display = 'none';
      void active.offsetHeight;
      active.style.display = '';
    }
  }, 300);
}
window.addEventListener('orientationchange', resetViewport);
window.addEventListener('resize', resetViewport);
if (window.visualViewport) window.visualViewport.addEventListener('resize', resetViewport);

// Appli en arrière-plan : on coupe la caméra ; au retour, on la relance.
document.addEventListener('visibilitychange', () => {
  if (!view) return;
  if (document.hidden) stopCamera();
  else startCamera($('ar-video'), cameraId).catch(showCameraError);
});
