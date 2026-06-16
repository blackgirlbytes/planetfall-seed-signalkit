import * as THREE from "three";
import { createTerrain } from "./terrain.js";
import { createFirstPerson } from "./firstPerson.js";
import { createOverhead } from "./overhead.js";
import { makeBeamTexture, makeIceBlock, makeIdSprite } from "./memoryProps.js";

// LEVEL 2 ("The Drone Bay") — the same island, revisited.
//
// The day-to-day agentic loop, played: delegate → review → accept.
// Five ship systems are dark; five drones can fix them in parallel while you
// can only be in one place. One new command on top of what L1 taught:
//
//   walk to a dark system, press E      → a drone takes the job, you're free
//   the drone finishes while you're away → its work seals under a checkpoint
//   walk up → `entire checkpoint explain <id>` is PRE-FILLED — press Enter
//   read what it actually did            → ADD TO SHIP (Y) → system online
//   the FIFTH accept keeps the terminal open: type `entire dispatch` right
//   there — the day's report writes itself from the checkpoints. Finish line.
//
// Drones don't repair — they IMPROVISE (a bent dish comes back as a signal
// spire). The transformation is what makes you NEED the explanation.
//
// PRESSURE: one countdown. Watching one drone at a time can't beat the clock;
// running the whole fleet in parallel can. Nothing forces it — the math does.

const INTERACT_DIST = 8;     // how close (XZ) to assign / review a site
const CONSOLE_DIST = 9;      // how close (XZ) to open the ship terminal
const TOTAL_TIME = 150;      // seconds for the whole run (tunable)
const WORK_TIME = 18;        // seconds a drone spends fixing a system
const LOW_TIME = 45;         // clock turns urgent under this
const CRIT_TIME = 15;        // clock goes CRITICAL under this
const PANIC_TIME = 45;       // the SKY starts shifting toward panic-red
const DRONE_SPEED = 26;      // world units / second in flight
const MELT_DUR = 1.2;        // seconds the ice takes to melt on ADD TO SHIP

// Sky panic palette — same dread as Level 1's clock.
const SKY_CALM  = new THREE.Color(0x2a2350);
const SKY_PANIC = new THREE.Color(0x6e0f16);
const FOG_PANIC = new THREE.Color(0x4a0a0e);
const DOME_CALM = new THREE.Color(0x3a3168);
const DOME_PANIC = new THREE.Color(0x7a141c);
const SUN_CALM  = new THREE.Color(0xfff1dc);
const SUN_PANIC = new THREE.Color(0xff5a3c);

const CONSOLE_POS = { x: -6, z: 56 };
const BAY_ROW = { x0: -16, dx: 4, z: 50 };   // five parked drones by the console

// The five dark systems, what the drones improvise them into, and the story
// each checkpoint carries. Ids are fixed so the fiction is stable across runs.
// Exported: Level 3 quizzes the player on this exact record, and rebuilds the
// upgrades on its island as the things the questions are about.
export const SYSTEMS = [
  {
    ckpt: "a1c9e4f72b05", name: "IGNITION COILS",
    pos: { x: -34, z: -28 },
    broken: "buildBrokenCoils", upgrade: "buildPlasmaRing",
    became: "Plasma Ring",
    card: [
      ["subagent", "subagent-1"],
      ["system", "ignition coils"],
      ["did", "coils beyond saving — rebuilt as a plasma ring from salvaged hull plate"],
      ["session", "2 attempts · parts scavenged: hull plate ×3"],
    ],
  },
  {
    ckpt: "3d7b0f9c61ae", name: "NAV CORE",
    pos: { x: 40, z: -18 },
    broken: "buildBrokenNav", upgrade: "buildStarDome",
    became: "Star Dome",
    card: [
      ["subagent", "subagent-2"],
      ["system", "nav core"],
      ["did", "core unrecoverable — remapped from scratch; starfield calibrated to the lavender belt"],
      ["session", "1 attempt · 412 stars plotted"],
    ],
  },
  {
    ckpt: "f25c8b30d971", name: "LONG-RANGE ANTENNA",
    pos: { x: 28, z: 38 },
    broken: "buildBrokenDish", upgrade: "buildSignalSpire",
    became: "Signal Spire",
    card: [
      ["subagent", "subagent-3"],
      ["system", "long-range antenna"],
      ["did", "dish unsalvageable — respun the mast into a signal spire; relay handshake at full strength"],
      ["session", "3 attempts · the first two fell over"],
    ],
  },
  {
    ckpt: "62e0a9d4c8f3", name: "LIFE SUPPORT",
    pos: { x: -30, z: 36 },
    broken: "buildBrokenVent", upgrade: "buildGardenPod",
    became: "Garden Pod",
    card: [
      ["subagent", "subagent-4"],
      ["system", "life support scrubbers"],
      ["did", "filters dead — replaced with a living filter; two vines scavenged from the crash"],
      ["session", "1 attempt · the vines approved"],
    ],
  },
  {
    ckpt: "8b47f1e62da0", name: "LANDING STRUTS",
    pos: { x: 8, z: -44 },
    broken: "buildBrokenStrut", upgrade: "buildGravSkid",
    became: "Grav Skid",
    card: [
      ["subagent", "subagent-5"],
      ["system", "landing struts"],
      ["did", "strut seized solid — swapped for grav skids; technically the ship floats now"],
      ["session", "2 attempts · torque spec: vibes"],
    ],
  },
];

function normalizeCmd(s) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

// ---------- prop builders: the broken systems ----------
const CHARRED = () => new THREE.MeshStandardMaterial({ color: 0x2a2e38, roughness: 0.9, metalness: 0.3 });
const SCORCH = () => new THREE.MeshStandardMaterial({ color: 0x3a3f4a, roughness: 0.85, metalness: 0.25 });

function withWarnLight(g) {
  // A small red blinking bulb so broken things read as "broken" up close.
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 10, 10),
    new THREE.MeshStandardMaterial({ color: 0x401512, emissive: 0xff3b2e, emissiveIntensity: 1.6 })
  );
  bulb.position.y = g.userData.warnY ?? 3.2;
  g.add(bulb);
  g.userData.warn = bulb;
  return g;
}
function buildBrokenCoils() {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(1.1 - i * 0.18, 1.2 - i * 0.18, 1.0, 10), i ? CHARRED() : SCORCH());
    c.position.y = 0.5 + i * 1.05;
    c.rotation.z = (i % 2 ? -1 : 1) * 0.12 * (i + 1);   // the stack leans, sadly
    g.add(c);
  }
  g.userData.warnY = 3.6;
  return withWarnLight(g);
}
function buildBrokenNav() {
  const g = new THREE.Group();
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.2, 1.4, 8), SCORCH());
  ped.position.y = 0.7;
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5, 0), CHARRED());
  core.position.y = 2.6;
  core.rotation.set(0.4, 0.2, 0.5);
  g.add(ped, core);
  g.userData.warnY = 4.4;
  return withWarnLight(g);
}
function buildBrokenDish() {
  const g = new THREE.Group();
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 3.2, 8), SCORCH());
  mast.position.y = 1.4;
  mast.rotation.z = 0.5;                                // bent over
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.5, 0.4, 12), CHARRED());
  dish.position.set(1.6, 0.5, 0);
  dish.rotation.z = 1.2;                                // face-down in the dirt
  g.add(mast, dish);
  g.userData.warnY = 3.0;
  return withWarnLight(g);
}
function buildBrokenVent() {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.0, 2.0), SCORCH());
  box.position.y = 1.0;
  for (let i = 0; i < 3; i++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.16, 0.1), CHARRED());
    slat.position.set(0, 0.6 + i * 0.5, 1.06);
    slat.rotation.x = 0.5;
    g.add(slat);
  }
  g.add(box);
  g.userData.warnY = 2.8;
  return withWarnLight(g);
}
function buildBrokenStrut() {
  const g = new THREE.Group();
  const leg = new THREE.Mesh(new THREE.BoxGeometry(0.8, 4.2, 0.8), SCORCH());
  leg.position.set(0, 1.6, 0);
  leg.rotation.z = 0.55;                                // collapsed sideways
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.6, 0.5, 10), CHARRED());
  foot.position.set(1.6, 0.25, 0);
  g.add(leg, foot);
  g.userData.warnY = 3.4;
  return withWarnLight(g);
}

// ---------- prop builders: what the drones improvise them into ----------
function buildPlasmaRing() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.5, 0.7, 10), SCORCH());
  base.position.y = 0.35;
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.8, 0.3, 12, 36),
    new THREE.MeshStandardMaterial({ color: 0x6b4a16, emissive: 0xffb86b, emissiveIntensity: 1.4, roughness: 0.4 })
  );
  ring.position.y = 3.4;
  g.add(base, ring);
  g.userData.anim = { type: "ring", ring };
  return g;
}
function buildStarDome() {
  const g = new THREE.Group();
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.2, 1.2, 8), SCORCH());
  ped.position.y = 0.6;
  const stars = new THREE.BufferGeometry();
  const pts = new Float32Array(120 * 3);
  for (let i = 0; i < 120; i++) {
    // random points in a dome above the pedestal
    const r = 1.2 + Math.random() * 1.4;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.random() * Math.PI * 0.5;
    pts[i * 3] = Math.cos(th) * Math.sin(ph) * r;
    pts[i * 3 + 1] = 3.2 + Math.cos(ph) * r * 0.9;
    pts[i * 3 + 2] = Math.sin(th) * Math.sin(ph) * r;
  }
  stars.setAttribute("position", new THREE.BufferAttribute(pts, 3));
  const field = new THREE.Points(stars, new THREE.PointsMaterial({
    color: 0xbfe9ff, size: 0.16, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  const orbit = new THREE.Mesh(
    new THREE.TorusGeometry(2.0, 0.05, 8, 40),
    new THREE.MeshBasicMaterial({ color: 0x6fe3ff, transparent: true, opacity: 0.7 })
  );
  orbit.position.y = 3.6;
  orbit.rotation.x = Math.PI / 2.4;
  g.add(ped, field, orbit);
  g.userData.anim = { type: "dome", field, orbit };
  return g;
}
function buildSignalSpire(beamTex) {
  const g = new THREE.Group();
  const spire = new THREE.Mesh(
    new THREE.ConeGeometry(0.5, 7.5, 8),
    new THREE.MeshStandardMaterial({ color: 0x3a4150, metalness: 0.7, roughness: 0.3, emissive: 0x123a4a, emissiveIntensity: 0.8 })
  );
  spire.position.y = 3.75;
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.4, 0.4, 70, 10, 1, true),
    new THREE.MeshBasicMaterial({
      map: beamTex, color: 0x9af0ff, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
    })
  );
  beam.position.y = 42;
  beam.visible = false;          // fires when the upgrade is ADDED
  g.add(spire, beam);
  g.userData.anim = { type: "spire", beam };
  return g;
}
function buildGardenPod() {
  const g = new THREE.Group();
  const tray = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.1, 0.6, 12), SCORCH());
  tray.position.y = 0.3;
  for (let i = 0; i < 5; i++) {
    const plant = new THREE.Mesh(
      new THREE.ConeGeometry(0.28, 0.9 + (i % 3) * 0.35, 6),
      new THREE.MeshStandardMaterial({ color: 0x1d4a2c, emissive: 0x35d97a, emissiveIntensity: 0.7, roughness: 0.7 })
    );
    const a = (i / 5) * Math.PI * 2;
    plant.position.set(Math.cos(a) * 1.0, 1.0, Math.sin(a) * 1.0);
    g.add(plant);
  }
  const domeGlass = new THREE.Mesh(
    new THREE.SphereGeometry(2.1, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshPhysicalMaterial({
      color: 0xd8ffe9, metalness: 0, roughness: 0.05, transmission: 0.7,
      thickness: 1.2, transparent: true, opacity: 0.4,
    })
  );
  domeGlass.position.y = 0.6;
  g.add(tray, domeGlass);
  g.userData.anim = { type: "pod" };
  return g;
}
function buildGravSkid() {
  const g = new THREE.Group();
  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(1.7, 1.9, 0.5, 12),
    new THREE.MeshStandardMaterial({ color: 0x2c3140, metalness: 0.6, roughness: 0.35, emissive: 0x123a4a, emissiveIntensity: 0.7 })
  );
  pad.position.y = 1.6;
  const glow = new THREE.Mesh(
    new THREE.TorusGeometry(1.5, 0.12, 8, 32),
    new THREE.MeshBasicMaterial({ color: 0x6fe3ff, transparent: true, opacity: 0.65 })
  );
  glow.rotation.x = Math.PI / 2;
  glow.position.y = 0.5;
  g.add(pad, glow);
  g.userData.anim = { type: "skid", pad, glow };
  return g;
}

// Level 3 places the finished upgrades on its own island (already online —
// the questions are about how they got that way). buildSignalSpire takes the
// shared beam texture; the rest take no args.
export const UPGRADE_BUILDERS = {
  buildPlasmaRing, buildStarDome, buildSignalSpire, buildGardenPod, buildGravSkid,
};

// ---------- the little worker drone ----------
function buildDrone() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.7, 0),
    new THREE.MeshStandardMaterial({ color: 0x2c3140, metalness: 0.6, roughness: 0.3, emissive: 0x2a8aa6, emissiveIntensity: 1.0 })
  );
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.0, 0.09, 8, 24),
    new THREE.MeshBasicMaterial({ color: 0x6fe3ff, transparent: true, opacity: 0.8 })
  );
  ring.rotation.x = Math.PI / 2;
  g.add(body, ring);
  g.userData = { body, ring };
  return g;
}

// The ship console the terminal lives in.
function makeConsole() {
  const g = new THREE.Group();
  const pedestal = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 4.6, 1.6),
    new THREE.MeshStandardMaterial({ color: 0x1c2230, metalness: 0.6, roughness: 0.35 })
  );
  pedestal.position.y = 2.3;
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(2.1, 1.3),
    new THREE.MeshStandardMaterial({
      color: 0x0c2030, emissive: 0x2a8aa6, emissiveIntensity: 1.4, roughness: 0.3,
    })
  );
  screen.position.set(0, 4.0, 0.82);
  screen.rotation.x = -0.28;
  g.add(pedestal, screen);
  return g;
}

export function createDroneBayView(renderer, { onExit, onComplete, onNext, onNewGame } = {}) {
  const canvas = renderer.domElement;

  // ---------- scene & sky ----------
  const scene = new THREE.Scene();
  scene.background = SKY_CALM.clone();
  scene.fog = new THREE.Fog(SKY_CALM.clone(), 90, 320);

  const camera = new THREE.PerspectiveCamera(
    62, window.innerWidth / window.innerHeight, 0.1, 2000
  );

  // ---------- lighting ----------
  scene.add(new THREE.HemisphereLight(0xcdbcff, 0x3a2f5e, 0.7));
  const sun = new THREE.DirectionalLight(SUN_CALM, 1.5);
  sun.position.set(60, 90, 40);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0x6a5a92, 0.3));

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(900, 32, 16),
    new THREE.MeshBasicMaterial({ color: DOME_CALM.clone(), side: THREE.BackSide, fog: false })
  );
  scene.add(dome);

  // ---------- terrain (the same island) ----------
  const terrain = createTerrain({ size: 200, segments: 220, maxHeight: 26, seed: 1337 });
  scene.add(terrain.mesh, terrain.water);

  const beamTex = makeBeamTexture();

  // ---------- the five work sites ----------
  const sites = SYSTEMS.map((sys, idx) => {
    const anchor = new THREE.Group();
    anchor.position.set(sys.pos.x, terrain.heightAt(sys.pos.x, sys.pos.z), sys.pos.z);

    const BUILD = {
      buildBrokenCoils, buildBrokenNav, buildBrokenDish, buildBrokenVent, buildBrokenStrut,
      buildPlasmaRing, buildStarDome, buildGardenPod, buildGravSkid,
      buildSignalSpire: () => buildSignalSpire(beamTex),
    };
    const brokenModel = BUILD[sys.broken]();
    const upgradeModel = BUILD[sys.upgrade]();
    upgradeModel.visible = false;
    anchor.add(brokenModel, upgradeModel);

    // Status beam — readable from across the island:
    // amber = broken, cyan pulse = drone at work, ice-blue = sealed (review me).
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.6, 60, 12, 1, true),
      new THREE.MeshBasicMaterial({
        map: beamTex, color: 0xff8a5c, transparent: true, opacity: 0.3,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        fog: false,
      })
    );
    beam.position.y = 30;
    anchor.add(beam);

    // The checkpoint seal: ice + floating trailer id, like Level 1's bank.
    const ice = makeIceBlock();
    ice.scale.setScalar(1.25);
    ice.position.y = 2.6;
    ice.visible = false;
    anchor.add(ice);
    const sprite = makeIdSprite(sys.ckpt);
    sprite.position.y = 8.4;
    sprite.visible = false;
    anchor.add(sprite);

    scene.add(anchor);
    return {
      sys, idx, anchor, brokenModel, upgradeModel, beam, ice, sprite,
      state: "broken",      // broken → working → sealed → added
      workT: 0,
      meltT: 0,             // ice melt animation after ADD TO SHIP
    };
  });

  // ---------- the drone bay: five parked drones by the console ----------
  const drones = SYSTEMS.map((_, i) => {
    const d = buildDrone();
    const x = BAY_ROW.x0 + i * BAY_ROW.dx;
    const home = new THREE.Vector3(x, terrain.heightAt(x, BAY_ROW.z) + 1.2, BAY_ROW.z);
    d.position.copy(home);
    scene.add(d);
    return {
      model: d, home,
      state: "bay",         // bay → flying → working → returning
      site: null,
      from: new THREE.Vector3(), to: new THREE.Vector3(),
      t: 0, dur: 1,
      bobOff: Math.random() * 10,
    };
  });

  // Work beam shown under a working drone (one per drone, toggled).
  const workBeams = drones.map(() => {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 1.2, 6, 10, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0x6fe3ff, transparent: true, opacity: 0.5,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      })
    );
    m.visible = false;
    scene.add(m);
    return m;
  });

  // ---------- the ship console ----------
  const consoleAnchor = new THREE.Group();
  consoleAnchor.position.set(
    CONSOLE_POS.x, terrain.heightAt(CONSOLE_POS.x, CONSOLE_POS.z), CONSOLE_POS.z
  );
  consoleAnchor.add(makeConsole());
  const consoleGlow = new THREE.PointLight(0xffd27a, 5, 28, 2);
  consoleGlow.position.y = 5;
  consoleAnchor.add(consoleGlow);
  scene.add(consoleAnchor);

  // ---------- first-person controller ----------
  const fp = createFirstPerson(camera, canvas, {
    heightAt: terrain.heightAt,
    radius: terrain.radius * 0.96,
    eyeHeight: 2.6,
    speed: 24,
  });
  scene.add(fp.controls.object);

  // Bird's-eye map (M) — see all five beams at once, keep walking meanwhile.
  const overhead = createOverhead(scene, terrain, camera);
  function setMap(on) {
    if (overhead.on === on) return;
    overhead.set(on);
    fp.setAlwaysMove(on);                       // arrows work without pointer lock
    scene.fog.near = on ? 500 : 90;             // don't fog the map out
    scene.fog.far = on ? 1400 : 320;
    crosshair?.classList.toggle("hidden", on || !fp.isLocked);
  }

  // ---------- HUD elements (shared FP set + this level's own) ----------
  const promptEl = document.getElementById("fp-prompt");
  const controlsEl = document.getElementById("fp-controls");
  const crosshair = document.getElementById("crosshair");
  const tutorialEl = document.getElementById("tutorial");
  const fpShared = document.getElementById("fp-shared");
  const termEl = document.getElementById("terminal");
  const termHint = document.getElementById("term-hint");
  const termInput = document.getElementById("term-input");
  const termList = document.getElementById("term-list");
  const termMsg = document.getElementById("term-msg");
  const termCta = document.getElementById("term-cta");
  const dbHud = document.getElementById("db-hud");
  const briefingEl = document.getElementById("db-briefing");
  const briefingStartBtn = document.getElementById("db-briefing-start");
  const countdownEl = document.getElementById("db-countdown");
  const countdownTime = document.getElementById("db-countdown-time");
  const systemsEl = document.getElementById("db-systems-rows");
  const winEl = document.getElementById("db-win");
  const winSub = document.getElementById("db-win-sub");
  const failEl = document.getElementById("db-fail");

  let active = false;
  let started = false;
  let failed = false;
  let reportSent = false;       // `entire dispatch` has been run — the win
  let promptText = null;
  let controlsLocked = null;
  const taught = new Set();
  let tutorialTimer = null;
  let msgTimer = null;
  let winTimer = null;

  // Level countdown — the single source of pressure for the whole run.
  let timeLeft = TOTAL_TIME;
  let timerRunning = false;

  // Terminal state. Two modes share the one terminal:
  //  "review" — pre-filled `entire checkpoint explain <id>` at a sealed site
  //  "report" — type `entire dispatch` (the finish line). Opens in place when
  //             the FIFTH system is accepted; reopens at any online system or
  //             the bay console if the player wandered off first.
  let terminalOpen = false;
  let termMode = null;
  let reviewSite = null;        // the sealed site being reviewed
  let explained = false;        // Enter pressed — the card is showing
  let buffer = "";
  let dismissedSite = null;     // site the player Esc'd out of (until they leave)
  let reportDismissed = false;

  const addedCount = () => sites.filter((s) => s.state === "added").length;
  const allAdded = () => addedCount() >= sites.length;

  // ---------- HUD helpers ----------
  function setPrompt(text) {
    if (!promptEl || text === promptText) return;
    promptText = text;
    if (text) { promptEl.textContent = text; promptEl.classList.remove("hidden"); }
    else promptEl.classList.add("hidden");
  }
  function showTutorial(text, ms = 5500) {
    if (!tutorialEl) return;
    clearTimeout(tutorialTimer);
    tutorialEl.textContent = text;
    tutorialEl.classList.remove("hidden");
    if (ms > 0) tutorialTimer = setTimeout(() => tutorialEl.classList.add("hidden"), ms);
  }
  function teachOnce(key, text, ms) {
    if (taught.has(key)) return;
    taught.add(key);
    showTutorial(text, ms);
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
      ` : ""}
      <span class="control-item">
        <span class="control-label">Send a subagent</span>
        <span class="key">E</span>
      </span>
      <span class="control-item">
        <span class="control-label">Bird's-eye view</span>
        <span class="key">M</span>
      </span>
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

  // ---------- systems status panel ----------
  const STATE_LABEL = {
    broken: "BROKEN", working: "SUBAGENT AT WORK", sealed: "READY TO REVIEW", added: "ONLINE",
  };
  function updateSystems() {
    if (!systemsEl) return;
    systemsEl.innerHTML = sites.map((s) =>
      `<div class="db-sys is-${s.state}">` +
      `<span class="db-sys-name">${s.sys.name}</span>` +
      `<span class="db-sys-state">${STATE_LABEL[s.state]}</span></div>`
    ).join("");
  }

  // ---------- level countdown ----------
  function fmtTime(s) {
    s = Math.max(0, Math.ceil(s));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }
  function updateClock() {
    if (countdownTime) countdownTime.textContent = fmtTime(timeLeft);
    countdownEl?.classList.toggle("is-low", timerRunning && timeLeft <= LOW_TIME);
    countdownEl?.classList.toggle("is-critical", timerRunning && timeLeft <= CRIT_TIME);
  }
  function panicFactor() {
    if (failed) return 1;
    if (!timerRunning || timeLeft > PANIC_TIME) return 0;
    let p = (PANIC_TIME - timeLeft) / PANIC_TIME;
    p *= p;
    if (timeLeft <= CRIT_TIME) {
      const throb = 0.5 + 0.5 * Math.sin(performance.now() / 85);
      p += 0.14 * throb;
    }
    return Math.min(1, p);
  }
  function applyPanicSky() {
    const p = reportSent ? 0 : panicFactor();
    scene.background.copy(SKY_CALM).lerp(SKY_PANIC, p);
    scene.fog.color.copy(SKY_CALM).lerp(FOG_PANIC, p);
    dome.material.color.copy(DOME_CALM).lerp(DOME_PANIC, p);
    sun.color.copy(SUN_CALM).lerp(SUN_PANIC, p * 0.85);
  }

  // ---------- briefing / win / fail / reset ----------
  function showBriefing() {
    timerRunning = false;
    fp.detach();
    tutorialEl?.classList.add("hidden");
    briefingEl?.classList.remove("hidden");
  }
  function startLevel() {
    if (started) return;
    started = true;
    briefingEl?.classList.add("hidden");
    fp.attach();
    timeLeft = TOTAL_TIME;
    timerRunning = true;
    updateClock();
    showTutorial("Five systems are dark — the amber beams. Walk to one and press E: a subagent takes the job while you move on.", 8500);
  }
  briefingStartBtn?.addEventListener("click", startLevel);

  function failLevel() {
    if (failed || reportSent) return;
    failed = true;
    timerRunning = false;
    setMap(false);
    closeTerminal(false);
    fp.detach();
    countdownEl?.classList.remove("is-low", "is-critical");
    tutorialEl?.classList.add("hidden");
    failEl?.classList.remove("hidden");
  }
  function resetLevel() {
    failed = false;
    reportSent = false;
    dismissedSite = null;
    reportDismissed = false;
    clearTimeout(winTimer);
    for (const s of sites) {
      s.state = "broken";
      s.workT = 0; s.meltT = 0;
      s.brokenModel.visible = true;
      s.upgradeModel.visible = false;
      const anim = s.upgradeModel.userData.anim;
      if (anim?.type === "spire") anim.beam.visible = false;
      s.ice.visible = false;
      s.ice.material.opacity = 0.62;
      s.sprite.visible = false;
    }
    for (let i = 0; i < drones.length; i++) {
      drones[i].state = "bay";
      drones[i].site = null;
      drones[i].model.position.copy(drones[i].home);
      workBeams[i].visible = false;
    }
    failEl?.classList.add("hidden");
    winEl?.classList.add("hidden");
    updateSystems();
    timeLeft = TOTAL_TIME;
    timerRunning = true;
    updateClock();
    if (active) fp.attach();
    showTutorial("New attempt — the fleet works in parallel. Use all five subagents.", 6000);
  }

  // ---------- drone dispatching ----------
  function assignDrone(site) {
    const drone = drones.find((d) => d.state === "bay");
    if (!drone) return;                 // shouldn't happen: one drone per system
    site.state = "working";
    site.workT = 0;
    drone.state = "flying";
    drone.site = site;
    drone.from.copy(drone.model.position);
    drone.to.set(site.anchor.position.x, site.anchor.position.y + 6.5, site.anchor.position.z);
    drone.t = 0;
    drone.dur = Math.max(1, drone.from.distanceTo(drone.to) / DRONE_SPEED);
    updateSystems();
    teachOnce("assigned",
      "The subagent's got it — you're free. Send the others while it works; the clock won't wait.", 7000);
  }
  function sealSite(site) {
    site.state = "sealed";
    site.brokenModel.visible = false;
    site.upgradeModel.visible = true;   // built — but dormant until ADD TO SHIP
    site.ice.visible = true;
    site.ice.material.opacity = 0.62;
    site.sprite.visible = true;
    updateSystems();
    teachOnce("sealed",
      "A subagent finished while you were away — its work is sealed under a checkpoint. Walk up and see what it actually did.", 8000);
  }

  // ---------- terminal ----------
  function flashTerminal(text, ok) {
    if (!termMsg) return;
    clearTimeout(msgTimer);
    termMsg.textContent = text;
    termMsg.classList.remove("show-ok", "show-err");
    termMsg.classList.add(ok ? "show-ok" : "show-err");
    msgTimer = setTimeout(() => termMsg.classList.remove("show-ok", "show-err"), 3600);
  }
  function renderTerminal() {
    if (!terminalOpen) return;
    if (termMode === "review") {
      if (!explained) {
        // The command comes pre-filled — you never type a checkpoint id.
        termHint.textContent = "# what did the subagent actually do? ask the checkpoint";
        termInput.textContent = `entire checkpoint explain ${reviewSite.sys.ckpt}`;
        termInput.classList.remove("is-dim");
        if (termCta) termCta.innerHTML =
          `<span class="cta-label">PRESS</span>` +
          `<kbd class="cta-key cta-key-yes">Enter</kbd><span class="cta-note">run it</span>`;
      } else {
        termHint.textContent = "# reviewed — your call";
        termInput.textContent = `entire checkpoint explain ${reviewSite.sys.ckpt}`;
        termInput.classList.add("is-dim");
        if (termCta) termCta.innerHTML =
          `<button id="db-add-btn" type="button">ADD TO SHIP</button>` +
          `<span class="cta-note">or press <kbd class="cta-key cta-key-yes">Y</kbd></span>`;
      }
    } else if (termMode === "report") {
      termHint.textContent = reportSent
        ? "# dispatch sent — the day is on the record"
        : "# five jobs accepted — send the day's report";
      termInput.textContent = buffer;
      termInput.classList.remove("is-dim");
      if (termCta) termCta.innerHTML = reportSent ? "" :
        `<span class="cta-label">TYPE</span><span class="cta-cmd">entire dispatch</span>`;
    }
  }
  function openTerminal(mode, site) {
    if (terminalOpen) return;
    terminalOpen = true;
    termMode = mode;
    reviewSite = site || null;
    explained = false;
    buffer = "";
    fp.detach();
    termMsg?.classList.remove("show-ok", "show-err");
    termList?.classList.add("hidden");
    termEl?.classList.remove("hidden");
    renderTerminal();
  }
  function closeTerminal(dismiss) {
    if (!terminalOpen) return;
    if (dismiss) {
      if (termMode === "review" && reviewSite) dismissedSite = reviewSite;
      if (termMode === "report") reportDismissed = true;
    }
    terminalOpen = false;
    termMode = null;
    reviewSite = null;
    explained = false;
    buffer = "";
    termEl?.classList.add("hidden");
    termList?.classList.add("hidden");
    if (active && !failed) fp.attach();
  }

  // ---------- entire checkpoint explain (pre-filled, Enter to run) ----------
  function runExplain() {
    if (!reviewSite || explained) return;
    explained = true;
    const s = reviewSite;
    if (termList) {
      termList.innerHTML =
        `<div class="term-list-row"><span class="tl-key tl-exp-key">checkpoint</span>` +
        `<span class="tl-title">${s.sys.ckpt}</span></div>` +
        s.sys.card.map(([k, v]) =>
          `<div class="term-list-row"><span class="tl-key tl-exp-key">${k}</span>` +
          `<span class="tl-title">${v}</span></div>`
        ).join("");
      termList.classList.remove("hidden");
    }
    flashTerminal(`explained ${s.sys.ckpt} — ${s.sys.name.toLowerCase()} is now a ${s.sys.became}`, true);
    teachOnce("explained",
      "That's the story behind the checkpoint — work you didn't watch is never a mystery. If it's good, add it to the ship.", 8000);
    renderTerminal();
  }

  // ---------- ADD TO SHIP ----------
  function addToShip() {
    if (!reviewSite || !explained) return;
    const s = reviewSite;
    s.state = "added";
    s.meltT = MELT_DUR;                 // the seal melts; the upgrade wakes up
    const anim = s.upgradeModel.userData.anim;
    if (anim?.type === "spire") anim.beam.visible = true;
    updateSystems();
    if (allAdded()) {
      // The fifth accept doesn't close the terminal — the finish line is the
      // next command at the prompt you're already at, like the real CLI.
      termMode = "report";
      reviewSite = null;
      explained = false;
      buffer = "";
      termList?.classList.add("hidden");
      flashTerminal("all five systems online", true);
      showTutorial("Every system accounted for — send the day's report: type `entire dispatch`.", 0);
      renderTerminal();
    } else {
      closeTerminal(false);
      showTutorial(`${s.sys.name} online (${addedCount()} / ${sites.length}).`, 5000);
    }
  }
  // The ADD TO SHIP button (terminal CTA is re-rendered, so delegate the click).
  termCta?.addEventListener("click", (e) => {
    if (!active) return;
    if (e.target?.id === "db-add-btn") addToShip();
  });

  // ---------- the finish line: entire dispatch ----------
  // "Generate a dispatch summarizing recent agent work" — five drones just
  // worked; the report writes itself from their checkpoints.
  function sendDispatch() {
    reportSent = true;
    timerRunning = false;
    countdownEl?.classList.remove("is-low", "is-critical");
    if (termList) {
      termList.innerHTML =
        `<div class="term-list-row"><span class="tl-key tl-exp-key">DISPATCH</span>` +
        `<span class="tl-title">drone bay — day report</span></div>` +
        sites.map((s) =>
          `<div class="term-list-row"><span class="tl-key tl-exp-key">·</span>` +
          `<span class="tl-title">${s.sys.name.toLowerCase()} → ${s.sys.became} (${s.sys.ckpt.slice(0, 6)}…)</span></div>`
        ).join("") +
        `<div class="term-list-row"><span class="tl-key tl-exp-key">filed</span>` +
        `<span class="tl-title">from 5 checkpoints · crew: 1 human, 5 subagents</span></div>`;
      termList.classList.remove("hidden");
    }
    flashTerminal("dispatch sent — look how much got done without you", true);
    renderTerminal();
    if (winSub) {
      winSub.textContent = "five jobs in parallel — the report wrote itself";
    }
    winTimer = setTimeout(() => {
      closeTerminal(false);
      tutorialEl?.classList.add("hidden");
      winEl?.classList.remove("hidden");
    }, 4000);
    onComplete?.();               // Level 2 cleared — opens the launch window
  }
  function submitCommand() {
    const n = normalizeCmd(buffer);
    buffer = "";
    if (!n) { renderTerminal(); return; }
    if (/^entire dispatch$/.test(n)) { sendDispatch(); return; }
    if (/^entire (checkpoint|cp) list$/.test(n)) {
      // L1's command still works — the raw log, then the nudge to report.
      if (termList) {
        termList.innerHTML = sites.map((s) =>
          `<div class="term-list-row"><span class="tl-id tl-id-short">${s.sys.ckpt}</span>` +
          `<span class="tl-title">subagent fix: ${s.sys.name.toLowerCase()} → ${s.sys.became}</span></div>`
        ).join("");
        termList.classList.remove("hidden");
      }
      flashTerminal("the raw log — now turn it into the day's report:  entire dispatch", true);
      renderTerminal();
      return;
    }
    flashTerminal("command not recognized — try:  entire dispatch", false);
    renderTerminal();
  }

  // ---------- input ----------
  function onCanvasClick() {
    if (!started || failed) return;
    if (active && !fp.isLocked && !terminalOpen) fp.lock();
  }
  function onKeyDown(e) {
    if (!active) return;

    // Briefing is up — Enter/Space begins the run, nothing else.
    if (!started) {
      if (e.code === "Enter" || e.code === "Space") { startLevel(); e.preventDefault(); }
      return;
    }

    // The clock ran out — R retries this level; N returns to the true beginning.
    if (failed) {
      if (e.code === "KeyR") { resetLevel(); e.preventDefault(); }
      if (e.code === "KeyN") { onNewGame?.(); e.preventDefault(); }
      return;
    }

    // While the terminal is open, all keys feed it.
    if (terminalOpen) {
      if (e.code === "Escape") { closeTerminal(true); e.preventDefault(); return; }
      if (termMode === "review") {
        if (!explained && e.code === "Enter") { runExplain(); e.preventDefault(); return; }
        if (explained && (e.key === "y" || e.key === "Y")) { addToShip(); e.preventDefault(); return; }
        e.preventDefault();
        return;
      }
      // report mode — type the dispatch command (the finish line)
      if (reportSent) { e.preventDefault(); return; }  // only Esc closes the report
      if (e.code === "Enter") { submitCommand(); e.preventDefault(); return; }
      if (e.code === "Backspace") { buffer = buffer.slice(0, -1); renderTerminal(); e.preventDefault(); return; }
      if (e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        buffer += e.key;
        renderTerminal();
        e.preventDefault();
      }
      return;
    }

    // Walking around.
    // Level cleared → Enter boards the ship; failure never advances (R only).
    if (reportSent && e.code === "Enter") { onNext?.(); e.preventDefault(); return; }
    if (e.code === "KeyE" && nearSite?.state === "broken") { assignDrone(nearSite); e.preventDefault(); return; }
    if (e.code === "KeyM") { setMap(!overhead.on); e.preventDefault(); return; }
    if (e.code === "Escape" && fp.isLocked) fp.unlock();
    if (e.code === "KeyB") onExit?.();
  }
  fp.controls.addEventListener("lock", () => crosshair?.classList.remove("hidden"));
  fp.controls.addEventListener("unlock", () => crosshair?.classList.add("hidden"));

  // ---------- HUD per-frame ----------
  let nearSite = null;
  let nearConsole = false;

  function refreshHud() {
    if (!started || terminalOpen) {
      setPrompt(null);
      hideControls();
      return;
    }
    setControls(fp.isLocked);
    if (overhead.on) { setPrompt("Bird's-eye view — ↑↓←→ to move · M to return"); return; }
    if (!fp.isLocked) { setPrompt("Click to look around"); return; }
    if (reportSent) { setPrompt("The day is dispatched — press Enter to board the ship"); return; }
    if (nearSite) {
      if (nearSite.state === "broken") setPrompt(`${nearSite.sys.name} is down — press E to send a subagent`);
      else if (nearSite.state === "working") setPrompt("Subagent at work — you're free, go assign another");
      else if (nearSite.state === "added" && !allAdded()) setPrompt(`${nearSite.sys.became} online — accepted into the ship`);
      return;
    }
    if (allAdded()) { setPrompt("Walk to any online system — send the day's report: `entire dispatch`"); return; }
    if (sites.some((s) => s.state === "sealed")) {
      setPrompt("An ice-blue beam means finished work — go review it");
      return;
    }
    if (sites.some((s) => s.state === "broken")) {
      setPrompt("Amber beams are broken systems — send the subagents (E)");
      return;
    }
    setPrompt("The fleet is working — wait for an ice-blue beam, then go review");
  }

  // ---------- per-frame ----------
  function update(dt, t) {
    fp.update(dt);

    // Level countdown — one clock for the whole run.
    if (active && timerRunning && !failed && !reportSent) {
      timeLeft = Math.max(0, timeLeft - dt);
      updateClock();
      if (timeLeft <= 0) failLevel();
    }
    applyPanicSky();

    // Drones fly, work, and head home.
    for (let i = 0; i < drones.length; i++) {
      const d = drones[i];
      const beam = workBeams[i];
      if (d.state === "bay") {
        d.model.position.y = d.home.y + Math.sin((t + d.bobOff) * 2) * 0.15;
        d.model.userData.ring.rotation.z += dt * 1.2;
      } else if (d.state === "flying" || d.state === "returning") {
        d.t += dt;
        const k = Math.min(1, d.t / d.dur);
        const ease = k * k * (3 - 2 * k);
        d.model.position.lerpVectors(d.from, d.to, ease);
        d.model.position.y += Math.sin(k * Math.PI) * 3;   // arc over the island
        d.model.userData.ring.rotation.z += dt * 6;
        if (k >= 1) {
          if (d.state === "flying") d.state = "working";
          else { d.state = "bay"; d.model.position.copy(d.home); }
        }
      } else if (d.state === "working") {
        const s = d.site;
        d.model.position.set(
          s.anchor.position.x + Math.cos(t * 1.4) * 1.2,
          s.anchor.position.y + 6.5 + Math.sin(t * 2.2) * 0.4,
          s.anchor.position.z + Math.sin(t * 1.4) * 1.2
        );
        d.model.userData.ring.rotation.z += dt * 9;
        beam.visible = true;
        beam.position.set(d.model.position.x, d.model.position.y - 3.2, d.model.position.z);
        beam.material.opacity = 0.35 + Math.sin(t * 11) * 0.2;

        // The actual work happens whether you watch or not.
        if (active && started && !failed) {
          s.workT += dt;
          if (s.workT >= WORK_TIME) {
            sealSite(s);
            beam.visible = false;
            d.state = "returning";
            d.site = null;
            d.from.copy(d.model.position);
            d.to.copy(d.home);
            d.t = 0;
            d.dur = Math.max(1, d.from.distanceTo(d.to) / DRONE_SPEED);
          }
        }
      }
    }

    // Sites: status beams, warning blinks, seals, and live upgrades.
    for (const s of sites) {
      if (s.state === "broken") {
        s.beam.material.color.setHex(0xff8a5c);
        s.beam.material.opacity = 0.24 + Math.sin(t * 1.6 + s.idx) * 0.08;
        s.beam.visible = true;
        const warn = s.brokenModel.userData.warn;
        if (warn) warn.material.emissiveIntensity = Math.sin(t * 5 + s.idx) > 0 ? 1.8 : 0.2;
      } else if (s.state === "working") {
        s.beam.material.color.setHex(0x6fe3ff);
        s.beam.material.opacity = 0.4 + Math.sin(t * 6) * 0.18;
        s.beam.visible = true;
      } else if (s.state === "sealed") {
        s.beam.material.color.setHex(0x8fe3ff);
        s.beam.material.opacity = 0.42;
        s.beam.visible = true;
      } else {
        s.beam.visible = false;       // added — the upgrade itself is the landmark
        if (s.meltT > 0) {            // the checkpoint seal melts away
          s.meltT = Math.max(0, s.meltT - dt);
          s.ice.material.opacity = 0.62 * (s.meltT / MELT_DUR);
          if (s.meltT <= 0) s.ice.visible = false;
        }
        // The improvised upgrades live a little.
        const anim = s.upgradeModel.userData.anim;
        if (anim?.type === "ring") {
          anim.ring.rotation.y += dt * 0.8;
          anim.ring.position.y = 3.4 + Math.sin(t * 1.6) * 0.2;
        } else if (anim?.type === "dome") {
          anim.field.rotation.y += dt * 0.25;
          anim.orbit.rotation.z += dt * 0.6;
        } else if (anim?.type === "skid") {
          anim.pad.position.y = 1.6 + Math.sin(t * 1.8) * 0.25;
        }
      }
    }

    // Proximity: nearest site, and the ship console.
    nearSite = null;
    let nd = Infinity;
    for (const s of sites) {
      const d = Math.hypot(
        camera.position.x - s.anchor.position.x,
        camera.position.z - s.anchor.position.z
      );
      if (d < nd) { nd = d; if (d <= INTERACT_DIST) nearSite = s; }
    }
    nearConsole = Math.hypot(
      camera.position.x - CONSOLE_POS.x, camera.position.z - CONSOLE_POS.z
    ) <= CONSOLE_DIST;
    consoleGlow.intensity = allAdded() && !reportSent ? 8 + Math.sin(t * 4) * 3 : 5;

    // Terminals open themselves at the right places, like Level 1. After the
    // fifth accept the report prompt is already open in place; if the player
    // wanders off, any ONLINE system (or the bay console) reopens it.
    const atReportSpot = nearConsole || nearSite?.state === "added";
    if (active && started && !failed) {
      if (dismissedSite && nearSite !== dismissedSite) dismissedSite = null;
      if (reportDismissed && !atReportSpot) reportDismissed = false;
      if (!terminalOpen) {
        if (nearSite?.state === "sealed" && nearSite !== dismissedSite) {
          openTerminal("review", nearSite);
        } else if (atReportSpot && allAdded() && !reportSent && !reportDismissed) {
          openTerminal("report", null);
        }
      } else if (termMode === "review" &&
                 (nearSite !== reviewSite || reviewSite.state !== "sealed")) {
        // walked away mid-review (ADD closes it itself)
        if (nearSite !== reviewSite) closeTerminal(false);
      } else if (termMode === "report" && !atReportSpot && !reportSent) {
        closeTerminal(false);
      }
    }

    overhead.update(t);
    if (active) refreshHud();
  }

  // ---------- lifecycle ----------
  function enter() {
    active = true;
    fp.groundAt(0, terrain.radius * 0.75);
    camera.lookAt(CONSOLE_POS.x, terrain.heightAt(CONSOLE_POS.x, CONSOLE_POS.z) + 5, CONSOLE_POS.z);
    canvas.addEventListener("click", onCanvasClick);
    window.addEventListener("keydown", onKeyDown);
    dbHud?.classList.remove("hidden");
    fpShared?.classList.remove("hidden");
    setControls(false);
    crosshair?.classList.add("hidden");
    updateSystems();
    if (!started) {
      showBriefing();
    } else if (reportSent) {
      fp.attach();
      winEl?.classList.remove("hidden");
    } else if (failed) {
      resetLevel();                 // came back after a wipe → fresh run
    } else {
      fp.attach();
      timerRunning = true;          // resume the level clock
      showTutorial("The subagents kept working while you were in orbit.", 5000);
    }
    updateClock();
    applyPanicSky();
  }
  function exit() {
    active = false;
    timerRunning = false;           // pause the clock while in orbit
    setMap(false);
    closeTerminal(false);
    clearTimeout(winTimer);
    fp.unlock();
    fp.detach();
    canvas.removeEventListener("click", onCanvasClick);
    window.removeEventListener("keydown", onKeyDown);
    setPrompt(null);
    hideControls();
    tutorialEl?.classList.add("hidden");
    termEl?.classList.add("hidden");
    failEl?.classList.add("hidden");
    winEl?.classList.add("hidden");
    briefingEl?.classList.add("hidden");
    dbHud?.classList.add("hidden");
    fpShared?.classList.add("hidden");
    crosshair?.classList.add("hidden");
  }
  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    overhead.resize();
  }

  return {
    scene,
    get camera() { return overhead.on ? overhead.camera : camera; },
    update, enter, exit, resize,
  };
}
