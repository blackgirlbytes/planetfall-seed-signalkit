import * as THREE from "three";
import { createTerrain } from "./terrain.js";
import { createFirstPerson } from "./firstPerson.js";
import { FRAGMENTS, BUILDERS } from "./debris.js";

// The walkable island level. First-person: you wander the terrain and walk up
// to the scattered artifacts to inspect them. One island, several artifacts —
// each seeds a context-recovery puzzle.

const INTERACT_DIST = 7;   // how close (world units, XZ) to inspect an artifact
const BEAM_COLOR = 0xffd27a; // warm gold to match the planet's islands

// Where each fragment sits on the island (world XZ), spread around the centre.
const PLACEMENTS = [
  { x: -34, z: -28 },
  { x: 40, z: -18 },
  { x: 28, z: 38 },
  { x: -30, z: 36 },
];

function makeBeamTexture() {
  const c = document.createElement("canvas");
  c.width = 8; c.height = 128;
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, "rgba(255,210,122,0)");
  g.addColorStop(1, "rgba(255,210,122,0.9)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 8, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createIslandView(renderer, { openPanel, onExit } = {}) {
  const canvas = renderer.domElement;

  // ---------- scene & sky ----------
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2a2350); // lavender dusk sky
  scene.fog = new THREE.Fog(0x2a2350, 90, 320);

  const camera = new THREE.PerspectiveCamera(
    62, window.innerWidth / window.innerHeight, 0.1, 2000
  );

  // ---------- lighting (soft, warm sun in a lavender sky) ----------
  const hemi = new THREE.HemisphereLight(0xcdbcff, 0x3a2f5e, 0.7);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1dc, 1.5);
  sun.position.set(60, 90, 40);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0x6a5a92, 0.3));

  // Big sky dome so the horizon isn't an empty void.
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(900, 32, 16),
    new THREE.MeshBasicMaterial({ color: 0x3a3168, side: THREE.BackSide, fog: false })
  );
  scene.add(dome);

  // ---------- terrain ----------
  const terrain = createTerrain({ size: 200, segments: 220, maxHeight: 26, seed: 1337 });
  scene.add(terrain.mesh, terrain.water);

  // ---------- artifacts ----------
  const beamTex = makeBeamTexture();
  const artifacts = [];
  FRAGMENTS.forEach((frag, idx) => {
    const place = PLACEMENTS[idx % PLACEMENTS.length];
    const groundY = terrain.heightAt(place.x, place.z);
    const anchor = new THREE.Group();
    anchor.position.set(place.x, groundY, place.z);

    const model = BUILDERS[frag.kind]();
    model.scale.setScalar(14); // the props are planet-scale tiny; size up for FP
    model.position.y = 1.4;
    anchor.add(model);

    // A tall light beam so the artifact is findable from across the island.
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.6, 60, 12, 1, true),
      new THREE.MeshBasicMaterial({
        map: beamTex, color: BEAM_COLOR, transparent: true, opacity: 0.5,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        fog: false,
      })
    );
    beam.position.y = 30;
    anchor.add(beam);

    const glow = new THREE.PointLight(BEAM_COLOR, 8, 40, 2);
    glow.position.y = 3;
    anchor.add(glow);

    scene.add(anchor);
    artifacts.push({ anchor, model, beam, fragment: frag, collected: false });
  });

  // ---------- first-person controller ----------
  const fp = createFirstPerson(camera, canvas, {
    heightAt: terrain.heightAt,
    radius: terrain.radius * 0.96,
    eyeHeight: 2.6,
    speed: 24,
  });
  scene.add(fp.controls.object);

  // ---------- HUD elements ----------
  const promptEl = document.getElementById("fp-prompt");
  const controlsEl = document.getElementById("fp-controls");
  const crosshair = document.getElementById("crosshair");
  const islandHud = document.getElementById("island-hud");

  let target = null;     // nearest artifact in range
  let active = false;    // is this view the one being shown?
  let promptText = null;
  let controlsLocked = null;

  function setPrompt(text) {
    if (!promptEl) return;
    if (text === promptText) return;
    promptText = text;
    if (text) { promptEl.textContent = text; promptEl.classList.remove("hidden"); }
    else promptEl.classList.add("hidden");
  }
  function setControls(locked) {
    if (!controlsEl) return;
    if (locked === controlsLocked && !controlsEl.classList.contains("hidden")) return;
    controlsLocked = locked;
    controlsEl.innerHTML = `
      <span class="control-item">
        <span class="control-label">To move</span>
        <span class="arrow-keys" aria-label="Arrow keys">
          <span class="key key-up">↑</span>
          <span class="key key-left">←</span>
          <span class="key key-down">↓</span>
          <span class="key key-right">→</span>
        </span>
      </span>
      ${locked ? `
        <span class="control-item">
          <span class="control-label">To look around</span>
          <span class="mouse-hint">
            <span class="mouse-icon" aria-hidden="true"></span>
            <span>move mouse</span>
          </span>
        </span>
        <span class="control-item">
          <span class="control-label">Free cursor</span>
          <span class="key key-wide">Esc</span>
        </span>
      ` : ""}
      <span class="control-item">
        <span class="control-label">Return to orbit</span>
        <span class="key">B</span>
      </span>
    `;
    controlsEl.classList.remove("hidden");
  }
  function hideControls() {
    controlsLocked = null;
    controlsEl?.classList.add("hidden");
  }

  // ---------- input ----------
  function onCanvasClick() {
    if (active && !fp.isLocked) fp.lock();
  }
  function onKeyDown(e) {
    if (!active) return;
    if (e.code === "Escape" && fp.isLocked) fp.unlock();
    if (e.code === "KeyE" && target) {
      fp.unlock();              // free the mouse for the panel
      openPanel?.(target.fragment);
      target.collected = true;
    }
    if (e.code === "KeyB") onExit?.(); // leave the island, back to orbit
  }
  // Show the crosshair only while the mouse is captured.
  fp.controls.addEventListener("lock", () => crosshair?.classList.remove("hidden"));
  fp.controls.addEventListener("unlock", () => crosshair?.classList.add("hidden"));

  // ---------- per-frame ----------
  const clockOffset = Math.random() * 10;
  function update(dt, t) {
    fp.update(dt);

    // Find the nearest artifact within reach (ignoring height).
    let nearest = null, nearestD = Infinity;
    for (const a of artifacts) {
      const dx = camera.position.x - a.anchor.position.x;
      const dz = camera.position.z - a.anchor.position.z;
      const d = Math.hypot(dx, dz);
      if (d < nearestD) { nearestD = d; nearest = a; }
      // Idle spin + bob on the prop.
      a.model.rotation.y += dt * 0.6;
      a.model.position.y = 1.4 + Math.sin((t + clockOffset) * 1.5 + a.anchor.position.x) * 0.4;
      a.beam.material.opacity = a.collected ? 0.12 : 0.4 + Math.sin(t * 2) * 0.12;
    }
    target = nearestD <= INTERACT_DIST ? nearest : null;

    if (active) {
      setControls(fp.isLocked);
      if (!fp.isLocked) setPrompt("Click to look around");
      else if (target) {
        setPrompt(`Press E to inspect · ${target.fragment.title}` +
          (target.collected ? "  (recovered)" : ""));
      } else setPrompt("Find the glowing artifacts");
    }
  }

  // ---------- lifecycle ----------
  function enter() {
    active = true;
    fp.attach();
    // Drop the player near the south shore, looking toward the centre.
    fp.groundAt(0, terrain.radius * 0.75);
    camera.lookAt(0, terrain.heightAt(0, 0) + 6, 0);
    canvas.addEventListener("click", onCanvasClick);
    window.addEventListener("keydown", onKeyDown);
    islandHud?.classList.remove("hidden");
    setControls(false);
    crosshair?.classList.add("hidden");
  }
  function exit() {
    active = false;
    fp.unlock();
    fp.detach();
    canvas.removeEventListener("click", onCanvasClick);
    window.removeEventListener("keydown", onKeyDown);
    setPrompt(null);
    hideControls();
    islandHud?.classList.add("hidden");
    crosshair?.classList.add("hidden");
  }
  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }

  return { scene, camera, update, enter, exit, resize };
}
