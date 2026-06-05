import * as THREE from "three";
import { createPlanetView } from "./planetView.js";
import { createIslandView } from "./islandView.js";

const canvas = document.getElementById("scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.92;
renderer.outputColorSpace = THREE.SRGBColorSpace;

// ---------- shared inspection panel ----------
const panel = document.getElementById("panel");
const panelTitle = document.getElementById("panel-title");
const panelBody = document.getElementById("panel-body");
const panelFoot = document.getElementById("panel-foot");

function openPanel(frag) {
  panelTitle.textContent = frag.title;
  panelBody.textContent = frag.body;
  panelFoot.textContent = `recover with · ${frag.hint}`;
  panel.classList.remove("hidden");
}
function closePanel() { panel.classList.add("hidden"); }
document.getElementById("panel-close").addEventListener("click", closePanel);
window.addEventListener("keydown", (e) => { if (e.key === "Escape") closePanel(); });

// ---------- views ----------
const planetView = createPlanetView(renderer, {
  onIslandClick: () => switchTo(islandView),
});
const islandView = createIslandView(renderer, {
  openPanel,
  onExit: () => { closePanel(); switchTo(planetView); },
});

// Default to the orbit view; ?view=island jumps straight onto the island
// (handy for development — pointer-lock still needs a real click).
let current = new URLSearchParams(location.search).get("view") === "island"
  ? islandView : planetView;
current.enter();

// ---------- fade transition ----------
const fade = document.getElementById("fade");
const hint = document.getElementById("hint");
let transitioning = false;
hint.classList.toggle("hidden", current !== planetView);

function switchTo(view) {
  if (transitioning || view === current) return;
  transitioning = true;
  fade.classList.add("show");
  setTimeout(() => {
    current.exit();
    current = view;
    current.enter();
    hint.classList.toggle("hidden", current !== planetView);
    fade.classList.remove("show");
    transitioning = false;
  }, 650); // match #fade CSS transition
}

// ---------- resize ----------
window.addEventListener("resize", () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  planetView.resize();
  islandView.resize();
});

// ---------- loop ----------
const clock = new THREE.Clock();
let firstFrame = true;

function animate() {
  const dt = Math.min(clock.getDelta(), 0.05); // clamp big tab-switch jumps
  const t = clock.elapsedTime;
  current.update(dt, t);
  renderer.render(current.scene, current.camera);

  if (firstFrame) {
    firstFrame = false;
    document.getElementById("loader").classList.add("done");
  }
  requestAnimationFrame(animate);
}
animate();
