import * as THREE from "three";
import { makeBeamTexture, makeIceBlock } from "./memoryProps.js";

// LEVEL 2 ("The Drone Bay") — a COMMAND PASS / order-ticket rush.
// (Full design notes live above createDroneBayView, further down this file.)
//
// You stand at the ship's command pass. Six subagents rebuild the ship in
// parallel; each finished job rides up the pass as silent frozen work:
//
//   tap silent frozen work → `entire checkpoint explain <id>` runs, the card opens
//   read what it did       → DEDUCE its bay and drag the still-sealed block there
//   all work installed    → type `entire dispatch` — the day's report writes itself
//
// The LAUNCH WINDOW (clock) runs the whole time. The real pressure, though, is
// Diner Dash / Overcooked PATIENCE: every block on the belt is a waiting customer
// whose ICE is its patience meter. Take too long and the ice melts — that work is
// LOST and its red dot returns to the dispatch board, costing a whole re-dispatch.

// Two pressures: (1) aged dispatch pips on the board heat white -> red and speed the
// clock if you leave jobs un-dispatched; (2) each block on the belt burns patience
// and SPOILS if you don't explain + install it before its ice melts.
const TOTAL_TIME = 195;      // launch window, seconds (tunable)
const VISIBLE_SLOTS = 5;     // slate positions on the pass; extra finishes back up
const DOT_DRAIN = 0.045;     // max extra clock drain from each aged red pip at full heat
const DOT_START_HEAT = 0.0;  // every dispatch pip starts white and low-pressure
const DOT_GRACE = 8.0;       // seconds before an undispatched pip begins heating up
const DOT_HEAT_RATE = 0.035; // undispatched pips heat up after the grace window
const DOT_HOT = 0.55;        // "clear this first" visual threshold
const DOT_CRITICAL = 0.82;   // fastest pulse / three alarm ticks
const INITIAL_DOTS = 2;      // diner-style stagger: only a couple of jobs waiting at start
const DOT_SPAWN_BASE = 7.0;  // seconds between new dispatch arrivals
const DOT_SPAWN_JITTER = 4.0;
// PATIENCE — Diner Dash / Overcooked style: every block on the belt is a waiting
// "customer". Its ice IS the patience meter. You must explain it (to learn its bay)
// and install it before the ice melts; if it melts the work is LOST and its red dot
// returns to the dispatch board, costing you a whole re-dispatch against the clock.
const PATIENCE = 18;         // seconds a block survives on the belt before it spoils (tunable)
const ICE_WARM_AT = 0.5;     // urgency (0 fresh→1 dead) where the ice starts going amber
const ICE_MELT_AT = 0.78;    // urgency where the ice goes red, pulses, and visibly melts
const LOW_TIME = 22;         // clock turns urgent under this
const CRIT_TIME = 10;        // clock goes CRITICAL under this
const PANIC_TIME = 30;       // the SKY starts shifting toward panic-red

const SLOT_X0 = -16;         // leftmost (front-most) pass slot, x
const SLOT_DX = 8;           // spacing between pass slots
const BELT_Y = 3.0;          // slate resting height on the belt
const ENTRANCE_X = 26;       // where a finished slate slides in from
const SLATE_ICE_SCALE = 0.52;
const SLATE_ICE_Y = 2.0;

// Onboarding — short story beats, advanced with Space.
const BRIEFING_BEATS = [
  "Pilot, you collected the records, but they need repair.",
  "We don't have a lot of time. Dispatch the drone bay as subagents to get the work done faster.",
  ["Use ", { command: "entire checkpoint explain" }, " to see what the subagents did."],
  "The ship needs you to account for every repair before launch.",
];

// Sky panic palette — same dread as Level 1's clock.
const SKY_CALM  = new THREE.Color(0x2a2350);
const SKY_PANIC = new THREE.Color(0x6e0f16);
const FOG_PANIC = new THREE.Color(0x4a0a0e);
const DOME_CALM = new THREE.Color(0x3a3168);
const DOME_PANIC = new THREE.Color(0x7a141c);
const SUN_CALM  = new THREE.Color(0xfff1dc);
const SUN_PANIC = new THREE.Color(0xff5a3c);

// A block's ice as its patience runs out: fresh icy-blue → amber → red.
const ICE_FRESH = new THREE.Color(0xbfe9ff);
const ICE_WARM_C = new THREE.Color(0xffc24a);
const ICE_HOT_C = new THREE.Color(0xff3b2e);
const DOT_COOL_C = new THREE.Color(0xf4f8ff);
const DOT_WARM_C = new THREE.Color(0xffc24a);
const DOT_HOT_C = new THREE.Color(0xff3b2e);

// The five HERO systems — rich cards, fixed ids. Exported and FROZEN: Level 3
// quizzes the player on this exact record (and uses sys.pos on its own island).
// Level 2 lays out its own grid and never touches sys.pos.
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

// Fisher-Yates — used to re-roll slot layout + break order each run so the
// match is never positional (the slate you grab never lines up under its slot).
function shuffled(n) {
  const a = [...Array(n).keys()];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function normalizeCmd(s) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

// ---------- prop builders: the broken systems ----------
const CHARRED = () => new THREE.MeshStandardMaterial({ color: 0x2a2e38, roughness: 0.9, metalness: 0.3 });
const SCORCH = () => new THREE.MeshStandardMaterial({ color: 0x3a3f4a, roughness: 0.85, metalness: 0.25 });

function withWarnLight(g) {
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
    c.rotation.z = (i % 2 ? -1 : 1) * 0.12 * (i + 1);
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
  mast.rotation.z = 0.5;
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.5, 0.4, 12), CHARRED());
  dish.position.set(1.6, 0.5, 0);
  dish.rotation.z = 1.2;
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
  leg.rotation.z = 0.55;
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.6, 0.5, 10), CHARRED());
  foot.position.set(1.6, 0.25, 0);
  g.add(leg, foot);
  g.userData.warnY = 3.4;
  return withWarnLight(g);
}

// ---------- prop builders: what the cars improvise them into ----------
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
  beam.visible = false;
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

// Level 3 places the finished upgrades on its own island.
export const UPGRADE_BUILDERS = {
  buildPlasmaRing, buildStarDome, buildSignalSpire, buildGardenPod, buildGravSkid,
};

// ====================================================================
// LEVEL 2 — "The Drone Bay", rebuilt as a COMMAND PASS (order-ticket rush).
//
// You don't run the island any more. You stand at the ship's command pass.
// Six subagents rebuild the ship in parallel behind you; every job they finish
// rides UP THE PASS toward you as silent frozen work, carrying the thing they
// improvised (a star dome, a plasma ring) so you wonder "what did it DO?".
//
//   tap frozen work     → `entire checkpoint explain <id>` runs, the card opens
//   read what it did    → drag the work to the matching ship slot
//   all work installed  → type `entire dispatch` right there — the day's report
//                          writes itself. Finish line.
//
// THE CLOCK IS THE LAUNCH WINDOW and it runs the WHOLE time — clearing the pass
// with `explain` IS the timed game (the old build made review calm; this one
// makes it the rush). Records never expire — a checkpoint is permanent. The
// pressure is the flood: subagents finish faster than you can glance, the pass
// floods, and the bigger your unreviewed pile the FASTER the launch window
// drains (the ship can't stabilise on work nobody has accounted for).
// ====================================================================

// ---------- canvas-texture text label ----------
function makeLabelSprite(text, { color = "#dff1ff", weight = 700, px = 52 } = {}) {
  const pad = 24;
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d");
  ctx.font = `${weight} ${px}px "Segoe UI", system-ui, sans-serif`;
  const w = Math.ceil(ctx.measureText(text).width) + pad * 2;
  const h = px + pad * 2;
  c.width = w; c.height = h;
  ctx.font = `${weight} ${px}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,0.85)";
  ctx.shadowBlur = 10;
  ctx.fillStyle = color;
  ctx.fillText(text, w / 2, h / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  spr.scale.set(w / h * 1.4, 1.4, 1);
  return spr;
}

// ---------- the scrolling pass belt texture (chevrons) ----------
function makeBeltTexture() {
  const c = document.createElement("canvas");
  c.width = 128; c.height = 64;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#10151f";
  ctx.fillRect(0, 0, 128, 64);
  ctx.strokeStyle = "rgba(111,227,255,0.5)";
  ctx.lineWidth = 9;
  for (let x = -64; x < 128; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 8); ctx.lineTo(x + 24, 32); ctx.lineTo(x, 56);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 1);
  return tex;
}

// ---------- a silent finished-work block that rides the belt ----------
function buildSlate(upgradeModel) {
  const g = new THREE.Group();
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(3.3, 0.42, 3.3),
    new THREE.MeshStandardMaterial({ color: 0x1b2230, metalness: 0.6, roughness: 0.4, emissive: 0x0c2030, emissiveIntensity: 0.5 })
  );
  slab.position.y = 0.25;
  const rim = new THREE.Mesh(
    new THREE.BoxGeometry(3.6, 0.14, 3.6),
    new THREE.MeshBasicMaterial({ color: 0x6fe3ff, transparent: true, opacity: 0.55 })
  );
  rim.position.y = 0.02;
  g.add(slab, rim);

  upgradeModel.scale.setScalar(0.42);
  upgradeModel.position.y = 0.5;
  upgradeModel.visible = false;
  g.add(upgradeModel);

  const ice = makeIceBlock();
  ice.scale.setScalar(SLATE_ICE_SCALE);
  ice.position.y = SLATE_ICE_Y;
  g.add(ice);

  const hit = new THREE.Mesh(
    new THREE.BoxGeometry(4.9, 4.0, 4.9),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hit.position.y = 1.6;
  g.add(hit);

  g.userData = { slab, rim, ice, upgradeModel };
  return g;
}

// ---------- a subagent: the original Drone Bay drone (octahedron + halo ring) ----------
// Restored from commit 0553cd7 ("Add Level 2 'The Drone Bay'"): a dark metallic
// octahedron body wrapped in a spinning cyan torus — a hovering repair probe.
function buildDrone() {
  const group = new THREE.Group();
  const craft = new THREE.Group();        // the flying body (bobs locally)
  craft.position.y = 2.6;                  // resting hover height above the pad

  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x2c3140, metalness: 0.6, roughness: 0.3, emissive: 0x2a8aa6, emissiveIntensity: 1.0,
  });
  const body = new THREE.Mesh(new THREE.OctahedronGeometry(0.9, 0), bodyMat);
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(1.25, 0.11, 8, 24),
    new THREE.MeshBasicMaterial({ color: 0x6fe3ff, transparent: true, opacity: 0.85 })
  );
  halo.rotation.x = Math.PI / 2;
  craft.add(body, halo);

  // hover underglow
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 2.6),
    new THREE.MeshBasicMaterial({ color: 0x6fe3ff, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.05;
  group.add(glow, craft);

  // landing pad
  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(1.2, 1.4, 0.3, 12),
    new THREE.MeshStandardMaterial({ color: 0x191320, metalness: 0.5, roughness: 0.7 })
  );
  pad.position.y = 0.15;
  group.add(pad);

  // "available" ground ring — bright when the drone is free to take a job
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.7, 0.12, 8, 28),
    new THREE.MeshBasicMaterial({ color: 0x7cffb0, transparent: true, opacity: 0.7 })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.32;
  group.add(ring);

  group.userData = { craft, bodyMat, halo, glow, ring };
  return group;
}

// ---------- subagent bay: a dedicated charging rack, separate from the work belt ----------
function buildDroneRack(homes) {
  const group = new THREE.Group();
  const xs = homes.map((h) => h.x);
  const zs = homes.map((h) => h.z);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const width = Math.max(9.0, maxX - minX + 7.5);
  const depth = Math.max(7.0, maxZ - minZ + 6.0);

  const deckMat = new THREE.MeshStandardMaterial({
    color: 0x10141d, metalness: 0.55, roughness: 0.68,
    emissive: 0x08202a, emissiveIntensity: 0.45,
  });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(width, 0.32, depth), deckMat);
  deck.position.set(centerX, 0.08, centerZ);
  group.add(deck);

  const rearWall = new THREE.Mesh(
    new THREE.BoxGeometry(width + 1.2, 1.3, 0.28),
    new THREE.MeshStandardMaterial({
      color: 0x121826, metalness: 0.45, roughness: 0.62,
      emissive: 0x0b1f2a, emissiveIntensity: 0.55,
    })
  );
  rearWall.position.set(centerX, 0.82, minZ - 2.65);
  group.add(rearWall);

  const rail = new THREE.Mesh(
    new THREE.BoxGeometry(width + 1.8, 0.16, 0.18),
    new THREE.MeshBasicMaterial({ color: 0x6fe3ff, transparent: true, opacity: 0.62 })
  );
  rail.position.set(centerX, 1.62, minZ - 2.46);
  group.add(rail);

  const label = makeLabelSprite("SUBAGENT BAY", { px: 30, color: "#7cffb0" });
  label.position.set(centerX, 4.05, minZ - 2.55);
  group.add(label);

  const dockLights = [];
  const laneXs = new Set();
  for (let i = 0; i < homes.length; i++) {
    const h = homes[i];
    const dockBase = new THREE.Mesh(
      new THREE.CylinderGeometry(1.55, 1.75, 0.18, 18),
      new THREE.MeshStandardMaterial({ color: 0x0b1018, metalness: 0.5, roughness: 0.7 })
    );
    dockBase.position.set(h.x, 0.22, h.z);
    group.add(dockBase);

    const dockRim = new THREE.Mesh(
      new THREE.TorusGeometry(1.85, 0.055, 8, 30),
      new THREE.MeshBasicMaterial({ color: 0x6fe3ff, transparent: true, opacity: 0.35 })
    );
    dockRim.rotation.x = -Math.PI / 2;
    dockRim.position.set(h.x, 0.36, h.z);
    group.add(dockRim);

    if (!laneXs.has(h.x)) {
      laneXs.add(h.x);
      const lane = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.08, Math.max(2.8, depth - 2.6)),
        new THREE.MeshBasicMaterial({ color: 0x6fe3ff, transparent: true, opacity: 0.12 })
      );
      lane.position.set(h.x, 0.38, centerZ);
      group.add(lane);
    }

    const lampMat = new THREE.MeshStandardMaterial({
      color: 0x7cffb0, emissive: 0x7cffb0, emissiveIntensity: 1.2,
      roughness: 0.35, transparent: true, opacity: 0.95,
    });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 10), lampMat);
    lamp.position.set(h.x, 0.72, h.z + 2.25);
    group.add(lamp);
    dockLights.push(lamp);
  }

  return { group, dockLights };
}

// ====================================================================
// LEVEL 2 — "The Drone Bay": dispatch → conveyor → explain → drag-to-match.
//
// The ship hangs above a conveyor. Each part has a labeled slot on the ship.
//   a white board pip appears             → CLICK it → you dispatch a subagent
//   the subagent's finished checkpoint     → rides up the CONVEYOR as silent frozen work
//   CLICK the frozen work                  → `entire checkpoint explain` reveals the target
//   DRAG the reviewed work to a matching slot
//   all online                             → type `entire dispatch` → done
//
// STAKE: a launch clock. The clarity comes after review: explain gives you the
// evidence, then final dispatch grades the matches.
// The Overcooked rush is the belt filling while you dispatch + deliver against the clock.
// ====================================================================

const TOTAL_JOBS = 12;
const N_DRONES = 6;
// Each job carries its OWN fix time (PART_DATA[].fix) — a big rebuild keeps a
// subagent out far longer than a quick one, so the belt fills unevenly and WHICH
// you dispatch first actually matters. Small jitter keeps it organic; identity dominates.
const PART_FIX_FALLBACK = 4.0;   // seconds, if a part somehow has no .fix
const PART_FIX_JITTER = 0.7;
const PART_FLY = 1.0;            // drone fly time to the slot / home
const PART_MELT = 1.0;
const DRAG_DEPTH = 22;           // how far in front of the camera held work floats

// ship-slot layout (two rows of six squares above the belt)
const SHIP_Y = 9.5, SHIP_Z = -13, SHIP_DX = 6.2;
const SLOTS_PER_ROW = 6;     // 12 squares laid out in two rows of six
const SHIP_ROW_DY = 5.4;     // vertical gap between the two square rows
// Top-right dispatch panel: pip-only job queue, kept above the belt and out of
// the ship-slot rows.
const DISPATCH_BOARD_COLS = 4;
const DISPATCH_BOARD_ROWS = 3;
const DISPATCH_BOARD_X = 27.0;
const DISPATCH_BOARD_Y = 14.2;
const DISPATCH_BOARD_Z = -11.6;
const DISPATCH_DOT_DX = 2.6;
const DISPATCH_DOT_DY = 1.75;
const DISPATCH_DOT_SCALE = 0.76;

// Dedicated subagent garage on the opposite side, separate from the conveyor.
const DRONE_HOME_X0 = 19.0;
const DRONE_HOME_DX = 6.0;
const DRONE_HOME_Z0 = 5.7;
const DRONE_HOME_DZ = 4.3;

// Six familiar ship bays; the 12 dispatch jobs below route into these.
const SLOT_DATA = [
  { name: "Engine", icon: "🔧" },
  { name: "Air", icon: "🫁" },
  { name: "Battery", icon: "🔋" },
  { name: "Radio", icon: "📡" },
  { name: "Steering", icon: "🧭" },
  { name: "Lights", icon: "💡" },
];

// L2-only work jobs (SYSTEMS stays exported/frozen for Level 3). Twelve total
// dispatch dots arrive over the run; each returns sealed work for one familiar bay.
const PART_DATA = [
  { name: "Engine",   icon: "🔧", slotIdx: 0, ckpt: "a1c9e4f72b05", fix: 7.5, broken: "buildBrokenCoils", upgrade: "buildPlasmaRing", became: "Plasma Ring",
    symptom: "engine seized", sub: "subagent-1", did: "engine was seized solid — rebuilt it as a plasma ring; runs cooler now", session: "2 attempts · salvaged hull plate" },
  { name: "Air",      icon: "🫁", slotIdx: 1, ckpt: "62e0a9d4c8f3", fix: 3.5, broken: "buildBrokenVent",  upgrade: "buildGardenPod",  became: "Garden Pod",
    symptom: "scrubbers failing", sub: "subagent-2", did: "air scrubbers were dead — grew a living garden that breathes for the ship", session: "1 attempt · the vines approved" },
  { name: "Battery",  icon: "🔋", slotIdx: 2, ckpt: "c6053a8e2f19", fix: 5.5, broken: "buildBrokenCoils", upgrade: "buildPlasmaRing", became: "Cell Bloom",
    symptom: "charge collapsing", sub: "subagent-3", did: "battery was fried — regrew it as a bloom of smaller cells; output up 12%", session: "2 attempts" },
  { name: "Radio",    icon: "📡", slotIdx: 3, ckpt: "f25c8b30d971", fix: 6.5, broken: "buildBrokenDish",  upgrade: "buildSignalSpire", became: "Signal Spire",
    symptom: "signal gone", sub: "subagent-4", did: "antenna had snapped — respun the mast into a signal spire; full strength", session: "3 attempts · the first two fell over" },
  { name: "Steering", icon: "🧭", slotIdx: 4, ckpt: "3d7b0f9c61ae", fix: 4.5, broken: "buildBrokenNav",   upgrade: "buildStarDome",   became: "Star Dome",
    symptom: "nav drifting", sub: "subagent-5", did: "the star map was corrupted — replotted 412 stars from scratch", session: "1 attempt" },
  { name: "Lights",   icon: "💡", slotIdx: 5, ckpt: "8b47f1e62da0", fix: 2.5, broken: "buildBrokenVent",  upgrade: "buildStarDome",   became: "Aurora Array",
    symptom: "cabin dark", sub: "subagent-6", did: "the lights were blown — strung an aurora array; brighter than before", session: "1 attempt" },
  { name: "Engine",   icon: "🔧", slotIdx: 0, ckpt: "7c1d4a9e3f20", fix: 4.6, broken: "buildBrokenCoils", upgrade: "buildGravSkid", became: "Torque Cradle",
    symptom: "thrust bucking", sub: "subagent-7", did: "engine mounts were bucking — braced the thrust line with a torque cradle", session: "1 attempt · vibration down" },
  { name: "Air",      icon: "🫁", slotIdx: 1, ckpt: "b93f0e7a15cc", fix: 5.0, broken: "buildBrokenVent", upgrade: "buildGardenPod", became: "Mist Lung",
    symptom: "pressure slipping", sub: "subagent-8", did: "cabin pressure was slipping — seeded a mist lung to keep the air mix stable", session: "2 attempts · seal held" },
  { name: "Battery",  icon: "🔋", slotIdx: 2, ckpt: "2e6c8b04d7a1", fix: 3.8, broken: "buildBrokenCoils", upgrade: "buildPlasmaRing", became: "Charge Loop",
    symptom: "cells overheating", sub: "subagent-9", did: "battery cells were overheating — split the load through a charge loop", session: "1 attempt · heat down 18%" },
  { name: "Radio",    icon: "📡", slotIdx: 3, ckpt: "5a0f3d2c9b88", fix: 4.2, broken: "buildBrokenDish", upgrade: "buildSignalSpire", became: "Relay Needle",
    symptom: "relay desynced", sub: "subagent-10", did: "radio relay kept desyncing — tuned a relay needle to hold the handshake", session: "2 attempts · no dropouts" },
  { name: "Steering", icon: "🧭", slotIdx: 4, ckpt: "e4717c5a0d63", fix: 6.0, broken: "buildBrokenNav", upgrade: "buildStarDome", became: "Helm Lens",
    symptom: "helm lagging", sub: "subagent-11", did: "steering input lagged — rebuilt the helm lens so turns land when you make them", session: "3 attempts · drift removed" },
  { name: "Lights",   icon: "💡", slotIdx: 5, ckpt: "9d28b6f1e470", fix: 3.2, broken: "buildBrokenVent", upgrade: "buildStarDome", became: "Beacon Strip",
    symptom: "markers blind", sub: "subagent-12", did: "landing markers were blind — wired a beacon strip along the cabin ribs", session: "1 attempt · runway visible" },
];

const RING = { broken: 0xff3b2e, working: 0xffd27a, target: 0x7cffb0, online: 0x35d97a };

// ---------- a little red dot on the dispatch board (a failure a subagent flies to) ----------
function buildDispatchDot() {
  const g = new THREE.Group();
  const alarmRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.78, 0.045, 6, 28),
    new THREE.MeshBasicMaterial({ color: 0xf4f8ff, transparent: true, opacity: 0.24, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  alarmRing.position.z = 0.02;
  g.add(alarmRing);
  const coreMat = new THREE.MeshStandardMaterial({ color: 0xf4f8ff, emissive: 0xf4f8ff, emissiveIntensity: 0.9, roughness: 0.35 });
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 14), coreMat);
  g.add(core);
  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(0.62, 20),
    new THREE.MeshBasicMaterial({ color: 0xf4f8ff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  halo.position.z = -0.25;
  g.add(halo);
  const ticks = [];
  for (let i = 0; i < 3; i++) {
    const tick = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.32 + i * 0.06, 0.04),
      new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    tick.position.set((i - 1) * 0.28, 0.92, 0.08);
    tick.visible = false;
    g.add(tick);
    ticks.push(tick);
  }
  const hit = new THREE.Mesh(new THREE.SphereGeometry(1.0, 8, 8), new THREE.MeshBasicMaterial({ visible: false }));
  g.add(hit);
  g.userData = { coreMat, halo, alarmRing, ticks };
  return g;
}

// ---------- a labeled slot on the ship hull (drag destination) ----------
function buildShipSlot(data) {
  const group = new THREE.Group();
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x141a26, emissive: 0x000000, metalness: 0.5, roughness: 0.55, transparent: true, opacity: 0.92 });
  const frame = new THREE.Mesh(new THREE.BoxGeometry(4.15, 3.3, 0.5), frameMat);
  group.add(frame);
  // a recessed back so an empty slot reads as a hole
  const back = new THREE.Mesh(new THREE.BoxGeometry(3.35, 2.55, 0.26), new THREE.MeshStandardMaterial({ color: 0x0a0e16, roughness: 0.9 }));
  back.position.z = -0.18;
  group.add(back);
  // glowing edge (status)
  const edgeMat = new THREE.MeshBasicMaterial({ color: RING.broken, transparent: true, opacity: 0.5 });
  const edge = new THREE.Mesh(new THREE.BoxGeometry(4.42, 3.58, 0.14), edgeMat);
  edge.position.z = 0.28;
  group.add(edge);
  const label = makeLabelSprite(`${data.icon} ${data.name}`, { px: 38 });
  label.position.y = 2.55;
  group.add(label);
  const hint = makeLabelSprite("", { px: 34, color: "#ff8a5c" });
  hint.position.y = -2.35; hint.visible = false;
  group.add(hint);
  const hit = new THREE.Mesh(new THREE.BoxGeometry(4.9, 4.0, 1.4), new THREE.MeshBasicMaterial({ visible: false }));
  group.add(hit);
  const holder = new THREE.Group();    // installed slate sits here
  group.add(holder);
  group.userData = { frameMat, edgeMat, label, hint, holder };
  return group;
}

export function createDroneBayView(renderer, { onExit, onComplete, onNext, onNewGame } = {}) {
  const canvas = renderer.domElement;

  const scene = new THREE.Scene();
  scene.background = SKY_CALM.clone();
  scene.fog = new THREE.Fog(SKY_CALM.clone(), 90, 260);

  const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.set(0, 10.5, 28);
  camera.lookAt(0, 5.5, -6);

  scene.add(new THREE.HemisphereLight(0xcdbcff, 0x3a2f5e, 0.85));
  const sun = new THREE.DirectionalLight(SUN_CALM, 1.4);
  sun.position.set(40, 80, 50); scene.add(sun);
  scene.add(new THREE.AmbientLight(0x6a5a92, 0.35));
  const dome = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.MeshBasicMaterial({ color: DOME_CALM.clone(), side: THREE.BackSide, fog: false }));
  scene.add(dome);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshStandardMaterial({ color: 0x171420, metalness: 0.4, roughness: 0.85 }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);

  const beamTex = makeBeamTexture();
  const BUILD = {
    buildBrokenCoils, buildBrokenNav, buildBrokenDish, buildBrokenVent, buildBrokenStrut,
    buildPlasmaRing, buildStarDome, buildGardenPod, buildGravSkid,
    buildSignalSpire: () => buildSignalSpire(beamTex),
  };

  // ---------- conveyor belt ----------
  const beltTex = makeBeltTexture();
  const belt = new THREE.Mesh(new THREE.BoxGeometry(54, 0.9, 6.4), new THREE.MeshStandardMaterial({ map: beltTex, color: 0x8fb6d6, metalness: 0.3, roughness: 0.6, emissive: 0x16384a, emissiveIntensity: 0.5 }));
  belt.position.set(0, BELT_Y - 1.0, 2); scene.add(belt);
  const lip = new THREE.Mesh(new THREE.BoxGeometry(54, 0.2, 0.4), new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.5 }));
  lip.position.set(0, BELT_Y - 0.5, 5.2); scene.add(lip);

  // ---------- twelve labeled ship squares (two per bay), in two rows of six ----------
  // One job per square — nothing is shared, so a square just reads empty or full.
  // Re-rolled each run: which grid cell each square sits in.
  const cellPos = (cell) => {
    const col = cell % SLOTS_PER_ROW;
    const row = Math.floor(cell / SLOTS_PER_ROW);
    return new THREE.Vector3((col - (SLOTS_PER_ROW - 1) / 2) * SHIP_DX, SHIP_Y + row * SHIP_ROW_DY, SHIP_Z);
  };
  // two squares per bay, in bay order: [0,0,1,1,2,2,3,3,4,4,5,5]
  const slotBays = [];
  SLOT_DATA.forEach((_, b) => { for (let k = 0; k < PART_DATA.filter((p) => p.slotIdx === b).length; k++) slotBays.push(b); });
  let slotCells = shuffled(slotBays.length);   // square i occupies grid cell slotCells[i]

  const slots = slotBays.map((bayIdx, i) => {
    const data = SLOT_DATA[bayIdx];
    const slot = buildShipSlot(data);
    const slotPos = cellPos(slotCells[i]);
    slot.position.copy(slotPos);
    slot.userData.slotIdx = i;
    scene.add(slot);
    return { data, idx: i, bayIdx, slot, slotPos, capacity: 1 };
  });

  // ---- the dispatch BOARD: twelve job sockets, arriving over time ----
  // Dots are GENERIC job markers: a white dot means "new work waiting"; if it
  // sits, it warms toward red. The dot never tells you which bay the work belongs to.
  const boardW = (DISPATCH_BOARD_COLS - 1) * DISPATCH_DOT_DX + 4.4;
  const boardH = (DISPATCH_BOARD_ROWS - 1) * DISPATCH_DOT_DY + 4.2;
  const dispatchBoard = new THREE.Mesh(
    new THREE.BoxGeometry(boardW, boardH, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x10141d, emissive: 0x16080a, emissiveIntensity: 0.35, metalness: 0.5, roughness: 0.6 })
  );
  dispatchBoard.position.set(DISPATCH_BOARD_X, DISPATCH_BOARD_Y, DISPATCH_BOARD_Z); scene.add(dispatchBoard);
  const boardEdge = new THREE.Mesh(
    new THREE.BoxGeometry(boardW + 0.4, boardH + 0.4, 0.3),
    new THREE.MeshBasicMaterial({ color: 0xff5a3c, transparent: true, opacity: 0.32 })
  );
  boardEdge.position.set(DISPATCH_BOARD_X, DISPATCH_BOARD_Y, DISPATCH_BOARD_Z - 0.16); scene.add(boardEdge);
  const dispatchLabel = makeLabelSprite("DISPATCH", { px: 28, color: "#ff8a5c" });
  dispatchLabel.position.set(DISPATCH_BOARD_X, DISPATCH_BOARD_Y + boardH / 2 - 0.55, DISPATCH_BOARD_Z + 0.3); scene.add(dispatchLabel);
  const dotXForCol = (col) => DISPATCH_BOARD_X + (col - (DISPATCH_BOARD_COLS - 1) / 2) * DISPATCH_DOT_DX;
  const dotPosFor = (i) => {
    const col = i % DISPATCH_BOARD_COLS;
    const row = Math.floor(i / DISPATCH_BOARD_COLS);
    return new THREE.Vector3(
      dotXForCol(col),
      DISPATCH_BOARD_Y + ((DISPATCH_BOARD_ROWS - 1) / 2 - row) * DISPATCH_DOT_DY - 0.35,
      DISPATCH_BOARD_Z + 0.32
    );
  };

  // the little pips — future sockets stay dark; active jobs arrive white
  const jobDots = [];
  for (let i = 0; i < TOTAL_JOBS; i++) {
    const socket = new THREE.Mesh(new THREE.CircleGeometry(0.5, 18), new THREE.MeshBasicMaterial({ color: 0x2a1014 }));
    socket.position.copy(dotPosFor(i).clone().setZ(DISPATCH_BOARD_Z + 0.28)); scene.add(socket);
    const pos = dotPosFor(i);
    const group = buildDispatchDot();
    group.position.copy(pos); group.userData.dotIdx = i;
    group.visible = false;
    scene.add(group);
    jobDots.push({ idx: i, group, pos, taken: false, spawned: false, partIdx: null, heat: DOT_START_HEAT, wait: 0 });
  }
  let pendingQueue = shuffled(TOTAL_JOBS);   // order hidden jobs arrive on the dispatch board
  let jobsSpawned = 0, spawnTimer = 0;

  const drones = [];
  const parts = PART_DATA.map((data, i) => {
    return {
      data, idx: i, targetSlot: data.slotIdx,
      state: "queued",             // queued → broken → working → onbelt → review → placed → online
      placedIn: null,              // which square this block was dropped into (only the right one sticks)
      slateMesh: null, beltX: ENTRANCE_X, explained: false, fixT: 0, installT: 0,
      patience: 0,                 // seconds left before the block spoils on the belt
      dotIdx: null,
    };
  });

  const droneHomes = Array.from({ length: N_DRONES }, (_, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    return new THREE.Vector3(
      DRONE_HOME_X0 + col * DRONE_HOME_DX,
      0.5,
      DRONE_HOME_Z0 + row * DRONE_HOME_DZ
    );
  });
  const droneRack = buildDroneRack(droneHomes);
  scene.add(droneRack.group);

  // ---------- subagent drones (pool) ----------
  // The bay sits in its own foreground rack; the conveyor stays reserved for
  // finished sealed work.
  for (let i = 0; i < N_DRONES; i++) {
    const mesh = buildDrone();
    const home = droneHomes[i].clone();
    mesh.position.copy(home);
    mesh.userData.ring.visible = false;
    scene.add(mesh);
    drones.push({ mesh, home, busy: false, part: null, phase: "home", flyProg: 0, weldAt: null });
  }
  const freeDrone = () => drones.find((d) => !d.busy);
  // where a drone hovers to weld a dot: just in front of (and level with) it
  const weldPose = (at) => at.clone().add(new THREE.Vector3(0, -2.0, 2.6));

  // jobs riding the belt (arrival order), by part index
  const belted = [];

  // ---------- sparks ----------
  const sparks = [];
  function spawnSpark(pos, color = 0x9af0ff, n = 14) {
    const arr = new Float32Array(n * 3); const vel = [];
    for (let i = 0; i < n; i++) { arr[i * 3] = pos.x; arr[i * 3 + 1] = pos.y; arr[i * 3 + 2] = pos.z; vel.push(new THREE.Vector3((Math.random() - 0.5) * 9, Math.random() * 7, (Math.random() - 0.5) * 9)); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    const mat = new THREE.PointsMaterial({ color, size: 0.45, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
    const pts = new THREE.Points(geo, mat); scene.add(pts);
    sparks.push({ pts, geo, mat, vel, life: 0, ttl: 0.7 });
  }

  function nextSpawnDelay() {
    return DOT_SPAWN_BASE + Math.random() * DOT_SPAWN_JITTER;
  }
  function spawnNextDot() {
    if (!pendingQueue.length) return false;
    const dot = jobDots.find((j) => !j.spawned);
    if (!dot) return false;
    const partIdx = pendingQueue.shift();
    const p = parts[partIdx];
    dot.spawned = true; dot.taken = false; dot.partIdx = partIdx;
    dot.heat = DOT_START_HEAT; dot.wait = 0; dot.group.visible = true;
    p.state = "broken"; p.dotIdx = dot.idx;
    jobsSpawned += 1;
    spawnSpark(dot.pos.clone(), 0xf4f8ff, 10);
    return true;
  }
  function spawnInitialDots() {
    for (let i = 0; i < INITIAL_DOTS; i++) spawnNextDot();
    spawnTimer = nextSpawnDelay();
  }

  // ---------- HUD ----------
  const promptEl = document.getElementById("fp-prompt");
  const controlsEl = document.getElementById("fp-controls");
  const tutorialEl = document.getElementById("tutorial");
  const fpShared = document.getElementById("fp-shared");
  const termEl = document.getElementById("terminal");
  const termHint = document.getElementById("term-hint");
  const termInput = document.getElementById("term-input");
  const termList = document.getElementById("term-list");
  const termMsg = document.getElementById("term-msg");
  const termCta = document.getElementById("term-cta");
  const dbHud = document.getElementById("db-hud");
  const boardEl = document.getElementById("db-board");
  const boardFreeEl = document.getElementById("db-board-free");
  const boardRowsEl = document.getElementById("db-board-rows");
  const briefingEl = document.getElementById("db-briefing");
  const briefingTextEl = document.getElementById("db-briefing-text");
  const briefingNextEl = document.getElementById("db-briefing-next");
  const countdownEl = document.getElementById("db-countdown");
  const countdownTime = document.getElementById("db-countdown-time");
  const systemsEl = document.getElementById("db-systems-rows");
  const winEl = document.getElementById("db-win");
  const winSub = document.getElementById("db-win-sub");
  const failEl = document.getElementById("db-fail");

  let active = false, started = false, failed = false, reportSent = false;
  let promptText = null;
  let msgTimer = null, winTimer = null, briefingIndex = 0;
  let timeLeft = TOTAL_TIME, timerRunning = false, elapsed = 0;
  let panelMode = null, reviewPart = null, buffer = "";
  let boardRenderT = 0;

  const onlineCount = () => parts.filter((p) => p.state === "online").length;
  const allOnline = () => onlineCount() >= parts.length;
  const placedCount = () => parts.filter((p) => p.state === "placed" || p.state === "online").length;
  const allPlaced = () => placedCount() >= parts.length;
  const slotOccupants = (slIdx) => parts.filter((q) => (q.state === "placed" || q.state === "online") && q.placedIn === slIdx);
  const slotHasRoom = (slIdx) => slotOccupants(slIdx).length < slots[slIdx].capacity;
  const brokenCount = () => parts.filter((p) => p.state === "broken").length;
  const beltCount = () => belted.length;
  const freeDroneCount = () => drones.filter((d) => !d.busy).length;
  const unreviewedCount = () => belted.filter((idx) => !parts[idx].explained).length;
  const activeDotHeat = () => jobDots.reduce((sum, j) => sum + (j.spawned && !j.taken ? Math.max(0, j.heat - DOT_START_HEAT) : 0), 0);
  const urgentDotCount = () => jobDots.filter((j) => j.spawned && !j.taken && j.heat >= DOT_HOT).length;
  const criticalDotCount = () => jobDots.filter((j) => j.spawned && !j.taken && j.heat >= DOT_CRITICAL).length;
  // 0 (fresh) .. 1 (about to spoil) — how far a block's patience has run down
  const urgencyOf = (p) => Math.max(0, Math.min(1, 1 - p.patience / PATIENCE));
  const meltingCount = () => belted.filter((idx) => urgencyOf(parts[idx]) >= ICE_MELT_AT).length;

  // ---------- raycast / pointer ----------
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let downX = 0, downY = 0, picked = null, dragging = false;
  function setNdc(e) { const r = canvas.getBoundingClientRect(); ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1; ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1; }
  function slateAtPointer(e) {
    setNdc(e); raycaster.setFromCamera(ndc, camera);
    const ms = belted.map((i) => parts[i].slateMesh).filter(Boolean);
    const hits = raycaster.intersectObjects(ms, true);
    if (!hits.length) return null;
    let o = hits[0].object; while (o && o.userData.partIdx === undefined) o = o.parent;
    return o ? parts[o.userData.partIdx] : null;
  }
  function slotAtPointer(e) {
    setNdc(e); raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(slots.map((s) => s.slot), true);
    if (!hits.length) return null;
    let o = hits[0].object; while (o && o.userData.slotIdx === undefined) o = o.parent;
    return o ? slots[o.userData.slotIdx] : null;
  }
  function dotAtPointer(e) {
    setNdc(e); raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(jobDots.filter((j) => j.spawned && !j.taken).map((j) => j.group), true);
    if (!hits.length) return null;
    let o = hits[0].object; while (o && o.userData.dotIdx === undefined) o = o.parent;
    return o ? jobDots[o.userData.dotIdx] : null;
  }
  function cursorDragPoint(e) {
    setNdc(e); raycaster.setFromCamera(ndc, camera);
    return raycaster.ray.origin.clone().add(raycaster.ray.direction.clone().multiplyScalar(DRAG_DEPTH));
  }

  // ---------- HUD helpers ----------
  function setPrompt(t) { if (!promptEl || t === promptText) return; promptText = t; if (t) { promptEl.textContent = t; promptEl.classList.remove("hidden"); } else promptEl.classList.add("hidden"); }
  function setControls() {
    if (!controlsEl) return;
    controlsEl.innerHTML = `
      <span class="control-item"><span class="control-label">Dispatch / review</span><span class="key key-wide">click</span></span>
      <span class="control-item"><span class="control-label">Install</span><span class="key key-wide">drag to slot</span></span>
      <span class="control-item"><span class="control-label">Back to orbit</span><span class="key">B</span></span>`;
    controlsEl.classList.remove("hidden");
  }
  function hideControls() { controlsEl?.classList.add("hidden"); }
  // The dispatch board is now physical (3D pips on the hull rail). The old
  // HTML panel stays hidden; this just keeps it that way.
  function renderBoard() { boardEl?.classList.add("hidden"); }
  function updateSystems() {
    if (!systemsEl) return;
    const urgent = urgentDotCount();
    const critical = criticalDotCount();
    systemsEl.innerHTML =
      `<div class="db-jobs"><span class="db-jobs-num">${placedCount()} / ${parts.length}</span><span class="db-jobs-lbl">work installed</span></div>` +
      `<div class="db-tally">` +
        `<span class="db-tally-it is-free">subagents ${freeDroneCount()}/${drones.length}</span>` +
        `<span class="db-tally-it is-running">jobs ${jobsSpawned}/${TOTAL_JOBS}</span>` +
        (brokenCount() ? `<span class="db-tally-it is-failing">waiting ${brokenCount()}</span>` : ``) +
        (urgent ? `<span class="db-tally-it is-urgent">${critical ? "critical" : "hot"} ${critical || urgent}</span>` : ``) +
        (unreviewedCount() ? `<span class="db-tally-it is-sealed">sealed ${unreviewedCount()}</span>` : ``) +
        (beltCount() - unreviewedCount() ? `<span class="db-tally-it is-cars">ready ${beltCount() - unreviewedCount()}</span>` : ``) +
      `</div>`;
    renderBoard();
  }

  // ---------- clock + panic ----------
  function fmtTime(s) { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }
  function updateClock() { if (countdownTime) countdownTime.textContent = fmtTime(timeLeft); countdownEl?.classList.toggle("is-low", timerRunning && timeLeft <= LOW_TIME); countdownEl?.classList.toggle("is-critical", timerRunning && timeLeft <= CRIT_TIME); }
  function panicFactor() {
    if (failed) return 1; if (reportSent || !timerRunning) return 0;
    let p = 0; if (timeLeft <= PANIC_TIME) { p = (PANIC_TIME - timeLeft) / PANIC_TIME; p *= p; }
    p = Math.max(p, Math.min(1, meltingCount() / 2) * 0.7);   // blocks about to spoil redden the sky
    p = Math.max(p, Math.min(1, activeDotHeat() / 3.2) * 0.38);
    if (timeLeft <= CRIT_TIME) p += 0.14 * (0.5 + 0.5 * Math.sin(performance.now() / 85));
    return Math.min(1, p);
  }
  function applyPanicSky() { const p = panicFactor(); scene.background.copy(SKY_CALM).lerp(SKY_PANIC, p); scene.fog.color.copy(SKY_CALM).lerp(FOG_PANIC, p); dome.material.color.copy(DOME_CALM).lerp(DOME_PANIC, p); sun.color.copy(SUN_CALM).lerp(SUN_PANIC, p * 0.85); }

  // ---------- briefing ----------
  function renderBriefingBeat() {
    if (!briefingTextEl) return;
    const beat = BRIEFING_BEATS[briefingIndex] || "";
    const parts = Array.isArray(beat) ? beat : [beat];
    briefingTextEl.replaceChildren(...parts.map((part) => {
      if (typeof part === "string") return document.createTextNode(part);
      const command = document.createElement("span");
      command.className = "mission-briefing-command";
      command.textContent = part.command;
      return command;
    }));
    briefingTextEl.classList.remove("beat-in");
    void briefingTextEl.offsetWidth;
    briefingTextEl.classList.add("beat-in");
    if (briefingNextEl) briefingNextEl.textContent = briefingIndex < BRIEFING_BEATS.length - 1 ? "to continue" : "to begin";
  }
  function advanceBriefing() { if (started) return; if (briefingIndex < BRIEFING_BEATS.length - 1) { briefingIndex += 1; renderBriefingBeat(); return; } startLevel(); }
  function showBriefing() { timerRunning = false; boardEl?.classList.add("hidden"); tutorialEl?.classList.add("hidden"); briefingIndex = 0; renderBriefingBeat(); briefingEl?.classList.remove("hidden"); }
  function startLevel() {
    if (started) return; started = true; briefingEl?.classList.add("hidden");
    timeLeft = TOTAL_TIME; timerRunning = true; elapsed = 0; boardRenderT = 0;
    spawnInitialDots();
    updateClock(); updateSystems();
  }
  briefingEl?.addEventListener("click", () => { if (active && !started) advanceBriefing(); });

  // ---------- lifecycle: dispatch → fix → belt → explain → install ----------
  // Click a generic active pip → a subagent flies to that waiting job. The pip
  // has a hidden assignment, but you only learn what it fixed by running explain.
  function dispatchFromDot(jd) {
    if (!jd || !jd.spawned || jd.taken || jd.partIdx == null) return;
    const d = freeDrone(); if (!d) { flashTerminal("every subagent is busy — wait for one to return", false); return; }
    const p = parts[jd.partIdx];
    jd.taken = true; jd.group.visible = false;
    p.state = "working";
    d.busy = true; d.part = p; d.phase = "out"; d.flyProg = 0; d.weldAt = jd.pos.clone();
    spawnSpark(jd.pos.clone(), 0x6fe3ff, 12);
    updateSystems();
  }
  function partToBelt(p) {                 // subagent finished → slate rides the belt
    p.state = "onbelt"; p.explained = false; p.beltX = ENTRANCE_X; p.patience = PATIENCE;
    const upgrade = BUILD[p.data.upgrade]();
    const slate = buildSlate(upgrade);
    slate.userData.partIdx = p.idx;
    slate.position.set(ENTRANCE_X, BELT_Y, 2);
    scene.add(slate);
    p.slateMesh = slate;
    belted.push(p.idx);
    updateSystems();
  }
  // patience ran out — the work SPOILS and is lost: the block leaves the belt and its
  // red dot returns to the dispatch board, so the whole job has to be re-dispatched.
  function spoilPart(p) {
    const i = belted.indexOf(p.idx); if (i >= 0) belted.splice(i, 1);
    spawnSpark(new THREE.Vector3(p.beltX, BELT_Y, 2), 0xff3b2e, 20);
    if (p.slateMesh) { scene.remove(p.slateMesh); p.slateMesh = null; }
    if (reviewPart === p) closePanel();
    p.state = "broken"; p.explained = false; p.placedIn = null; p.patience = 0; p.beltX = ENTRANCE_X;
    const dot = jobDots[p.dotIdx] || jobDots.find((j) => j.partIdx === p.idx);
    if (dot) {
      dot.spawned = true; dot.taken = false; dot.partIdx = p.idx;
      dot.group.visible = true; dot.heat = DOT_START_HEAT; dot.wait = 0;
    }
    updateSystems();
    flashTerminal("✗ a block melted — that work is lost; its pip is back on the board, re-dispatch it", false);
  }

  // ---------- review (explain) ----------
  function flashTerminal(t, ok) { if (!termMsg) return; clearTimeout(msgTimer); termMsg.textContent = t; termMsg.classList.remove("show-ok", "show-err"); termMsg.classList.add(ok ? "show-ok" : "show-err"); msgTimer = setTimeout(() => termMsg.classList.remove("show-ok", "show-err"), 3600); }
  function renderPanel() {
    if (panelMode === "review" && reviewPart) {
      const d = reviewPart.data;
      termHint.textContent = "# what did the subagent do? now match it to the ship";
      termInput.textContent = `entire checkpoint explain ${d.ckpt}`; termInput.classList.add("is-dim");
      if (termList) {
        termList.innerHTML =
          `<div class="term-list-row"><span class="tl-key tl-exp-key">checkpoint</span><span class="tl-title">${d.ckpt}</span></div>` +
          [["subagent", d.sub], ["did", d.did], ["became", d.became], ["session", d.session]].map(([k, v]) =>
            `<div class="term-list-row"><span class="tl-key tl-exp-key">${k}</span><span class="tl-title">${v}</span></div>`).join("");
        termList.classList.remove("hidden");
      }
      if (termCta) termCta.innerHTML = `<span class="cta-label">DRAG</span><span class="cta-note">it to its matching ship square</span>`;
      termEl?.classList.remove("hidden");
    } else if (panelMode === "report") {
      termHint.textContent = reportSent ? "# dispatch sent — the day is on the record" : "# all blocks placed — dispatch to lock in the matches";
      termInput.textContent = buffer; termInput.classList.remove("is-dim"); termList?.classList.add("hidden");
      if (termCta) termCta.innerHTML = reportSent ? "" : `<span class="cta-label">TYPE</span><span class="cta-cmd">entire dispatch</span>`;
      termEl?.classList.remove("hidden");
    }
  }
  function explainPart(p) {
    if (!p) return;
    panelMode = "review"; reviewPart = p;
    if (!p.explained) {
      // The block STAYS sealed — explain only opens the report. You read what the
      // subagent did and DEDUCE which bay it belongs to; the block never says.
      p.explained = true; p.state = "review";
      spawnSpark(p.slateMesh.position.clone().setY(BELT_Y + 2), 0x8fe3ff, 12);
      flashTerminal(`explained ${p.data.ckpt} — read what it did, then drag it to the bay you reckon it fixes`, true);
      updateSystems();
    }
    renderPanel();
  }
  function closePanel() { panelMode = null; reviewPart = null; buffer = ""; termEl?.classList.add("hidden"); termList?.classList.add("hidden"); termMsg?.classList.remove("show-ok", "show-err"); }

  // drop a block into a square — graded RIGHT HERE. A wrong bay bounces the block
  // straight back to the belt and says so, so the match is a real read-the-label
  // decision with instant feedback (not a deferred reveal at dispatch).
  function placePart(p, sl) {
    if (!p.explained) { flashTerminal("run explain before placing the block", false); p.slateMesh.position.set(p.beltX, BELT_Y, 2); return; }
    if (sl.bayIdx !== p.targetSlot) {             // wrong bay → bounce it back (don't reveal what it was)
      p.slateMesh.position.set(p.beltX, BELT_Y, 2);
      spawnSpark(sl.slotPos.clone(), 0xff3b2e, 12);
      flashTerminal(`✗ that's not the ${sl.data.name.toLowerCase()} fix — re-read the report and try the bay it really belongs to`, false);
      return;
    }
    if (!slotHasRoom(sl.idx)) {
      p.slateMesh.position.set(p.beltX, BELT_Y, 2);
      flashTerminal(`that ${sl.data.name.toLowerCase()} square's taken — drop it in the other one`, false);
      return;
    }
    // correct! installing UNSEALS it — the ice comes off and the improvised part appears
    p.state = "placed"; p.placedIn = sl.idx; p.installT = PART_MELT;
    const i = belted.indexOf(p.idx); if (i >= 0) belted.splice(i, 1);
    const slate = p.slateMesh;
    slate.userData.ice.visible = false;
    slate.userData.upgradeModel.visible = true;
    sl.slot.userData.holder.add(slate);
    slate.position.set(0, -0.1, 0.34); slate.scale.setScalar(0.34);
    const anim = slate.userData.upgradeModel.userData.anim;
    if (anim?.type === "spire") anim.beam.visible = false;
    if (reviewPart === p) closePanel();
    updateSystems();
    if (allPlaced()) {
      panelMode = "report"; buffer = "";
      flashTerminal("all blocks matched — run dispatch to file the day", true);
      tutorialEl?.classList.add("hidden");
      renderPanel();
    }
  }

  // ---------- finish ----------
  function sendDispatch() {
    reportSent = true; timerRunning = false; countdownEl?.classList.remove("is-low", "is-critical");
    renderBoard();
    if (termList) {
      termList.innerHTML =
        `<div class="term-list-row"><span class="tl-key tl-exp-key">DISPATCH</span><span class="tl-title">drone bay — day report</span></div>` +
        parts.map((p) => `<div class="term-list-row"><span class="tl-key tl-exp-key">·</span><span class="tl-title">${p.data.name.toLowerCase()} → ${p.data.became} (${p.data.ckpt.slice(0, 6)}…)</span></div>`).join("") +
        `<div class="term-list-row"><span class="tl-key tl-exp-key">filed</span><span class="tl-title">from ${parts.length} checkpoints · crew: 1 human, ${N_DRONES} subagents</span></div>`;
      termList.classList.remove("hidden");
    }
    flashTerminal("dispatch sent — look how much got done without you", true);
    renderPanel();
    if (winSub) winSub.textContent = `${parts.length} jobs, ${N_DRONES} subagents — the report wrote itself`;
    winTimer = setTimeout(() => { closePanel(); tutorialEl?.classList.add("hidden"); winEl?.classList.remove("hidden"); }, 3600);
    onComplete?.();
  }
  // Placement is graded at drop time (a wrong bay never sticks), so every placed
  // block is already correct here — dispatch just locks them in green and files.
  function gradeAndDispatch() {
    for (const p of parts) {
      if (p.state === "placed") { p.state = "online"; p.installT = PART_MELT; spawnSpark(slots[p.placedIn]?.slot.position.clone() || new THREE.Vector3(), 0x7cffb0, 14); }
    }
    updateSystems();
    sendDispatch();
  }
  function submitCommand() {
    const n = normalizeCmd(buffer); buffer = "";
    if (!n) { renderPanel(); return; }
    if (/^entire dispatch$/.test(n)) { gradeAndDispatch(); return; }
    if (/^entire (checkpoint|cp) list$/.test(n)) {
      if (termList) { termList.innerHTML = parts.map((p) => `<div class="term-list-row"><span class="tl-id tl-id-short">${p.data.ckpt}</span><span class="tl-title">subagent fix: ${p.data.name.toLowerCase()} → ${p.data.became}</span></div>`).join(""); termList.classList.remove("hidden"); }
      flashTerminal("the raw log — now:  entire dispatch", true); renderPanel(); return;
    }
    flashTerminal("command not recognized — try:  entire dispatch", false); renderPanel();
  }

  // ---------- fail / reset ----------
  function failLevel() { if (failed || reportSent) return; failed = true; timerRunning = false; closePanel(); renderBoard(); countdownEl?.classList.remove("is-low", "is-critical"); tutorialEl?.classList.add("hidden"); failEl?.classList.remove("hidden"); }
  function resetLevel() {
    failed = false; reportSent = false; clearTimeout(winTimer); closePanel();
    elapsed = 0; timeLeft = TOTAL_TIME; timerRunning = true; boardRenderT = 0; belted.length = 0;
    picked = null; dragging = false;
    slotCells = shuffled(slots.length); pendingQueue = shuffled(TOTAL_JOBS); jobsSpawned = 0; spawnTimer = 0;
    slots.forEach((sl, i) => {
      sl.slotPos.copy(cellPos(slotCells[i])); sl.slot.position.copy(sl.slotPos);
    });
    parts.forEach((p, i) => {
      if (p.slateMesh) { p.slateMesh.parent?.remove(p.slateMesh); scene.remove(p.slateMesh); p.slateMesh = null; }
      p.state = "queued"; p.placedIn = null; p.explained = false; p.fixT = 0; p.installT = 0; p.beltX = ENTRANCE_X; p.patience = 0; p.dotIdx = null;
    });
    for (let i = 0; i < jobDots.length; i++) {
      const j = jobDots[i];
      j.spawned = false; j.taken = false; j.partIdx = null; j.heat = DOT_START_HEAT; j.wait = 0;
      j.group.visible = false;
    }
    for (const d of drones) { d.busy = false; d.part = null; d.phase = "home"; d.flyProg = 0; d.weldAt = null; d.mesh.position.copy(d.home); }
    spawnInitialDots();
    failEl?.classList.add("hidden"); winEl?.classList.add("hidden");
    updateSystems(); updateClock();
  }

  // ---------- input ----------
  function onPointerDown(e) {
    if (!active || !started || failed || reportSent || panelMode === "report") return;
    downX = e.clientX; downY = e.clientY; dragging = false;
    picked = slateAtPointer(e);   // a belt slate we might drag
  }
  function onPointerMove(e) {
    if (!active || !started || failed) { canvas.style.cursor = "default"; return; }
    if (picked && !dragging && Math.hypot(e.clientX - downX, e.clientY - downY) > 6) {
      if (!picked.explained) {
        canvas.style.cursor = "pointer";
        return;
      }
      dragging = true;
    }
    if (dragging && picked) { picked.slateMesh.position.copy(cursorDragPoint(e)); canvas.style.cursor = "grabbing"; return; }
    if (panelMode === "report") { canvas.style.cursor = "default"; return; }
    const s = slateAtPointer(e) || dotAtPointer(e);
    canvas.style.cursor = s ? "pointer" : "default";   // slates + dispatch dots are clickable
  }
  function onPointerUp(e) {
    if (!active || !started || failed) return;
    if (dragging && picked) {
      const sl = slotAtPointer(e);
      if (sl && picked.state === "review" && slotHasRoom(sl.idx)) placePart(picked, sl);   // drop into any bay with room
      else { picked.slateMesh.position.set(picked.beltX, BELT_Y, 2); flashTerminal(sl ? "that bay's already full — pick an empty one" : "drop it onto a ship square", false); }
      picked = null; dragging = false; canvas.style.cursor = "default"; return;
    }
    if (picked) { explainPart(picked); picked = null; return; }   // a click on a sealed slate = explain
    const jd = dotAtPointer(e);                                    // a click on a red dot = dispatch
    if (jd) dispatchFromDot(jd);
  }
  function onKeyDown(e) {
    if (!active) return;
    if (!started) { if (e.code === "Enter" || e.code === "Space") { advanceBriefing(); e.preventDefault(); } return; }
    if (failed) { if (e.code === "KeyR") { resetLevel(); e.preventDefault(); } if (e.code === "KeyN") { onNewGame?.(); e.preventDefault(); } return; }
    if (reportSent) { if (e.code === "Enter") { onNext?.(); e.preventDefault(); } return; }
    if (panelMode === "report") {
      if (e.code === "Enter") { submitCommand(); e.preventDefault(); return; }
      if (e.code === "Backspace") { buffer = buffer.slice(0, -1); renderPanel(); e.preventDefault(); return; }
      if (e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { buffer += e.key; renderPanel(); e.preventDefault(); }
      return;
    }
    if (e.code === "Escape" && panelMode === "review") { closePanel(); e.preventDefault(); return; }
    if (e.code === "KeyB") { onExit?.(); e.preventDefault(); }
  }

  // ---------- prompts ----------
  function refreshHud() {
    if (!started) { setPrompt(null); return; }
    if (reportSent) { setPrompt("The day is dispatched — press Enter to board the ship"); return; }
    if (panelMode === "report" || allPlaced()) { setPrompt("All blocks placed — type `entire dispatch` to lock in the matches"); return; }
    if (dragging) { setPrompt("Drop it into the bay you think it belongs in"); return; }
    if (meltingCount() > 0) { setPrompt(`${meltingCount()} block${meltingCount() === 1 ? " is" : "s are"} melting — install before the ice is gone or the work is lost`); return; }
    if (belted.some((i) => parts[i].explained)) { setPrompt("Drag the explained block to the bay you deduced from its report"); return; }
    if (urgentDotCount() > 0 && beltCount() < VISIBLE_SLOTS) { setPrompt(`${urgentDotCount()} dispatch pip${urgentDotCount() === 1 ? "" : "s"} turning red — send a subagent before it gets worse`); return; }
    if (beltCount() > 0) { setPrompt("Click a sealed block to run `entire checkpoint explain` and read what it did"); return; }
    if (brokenCount() > 0) { setPrompt("White dispatch pips on the board — click one to send a subagent"); return; }
    if (jobsSpawned < TOTAL_JOBS) { setPrompt("New dispatch pips incoming — watch the board and belt"); return; }
    setPrompt("Subagents are working — watch the belt");
  }

  // ---------- per-frame ----------
  function update(dt, t) {
    if (active && timerRunning && !failed && !reportSent) {
      elapsed += dt;
      if (jobsSpawned < TOTAL_JOBS) {
        spawnTimer -= dt;
        if (spawnTimer <= 0) {
          spawnNextDot();
          spawnTimer = nextSpawnDelay();
        }
      }
      for (const j of jobDots) {
        if (!j.spawned || j.taken) continue;
        j.wait += dt;
        j.heat = Math.min(1, DOT_START_HEAT + Math.max(0, j.wait - DOT_GRACE) * DOT_HEAT_RATE);
      }
      // every block on the belt burns patience; the one being dragged is "in hand" and paused
      for (const idx of [...belted]) {
        const p = parts[idx];
        if (dragging && picked === p) continue;
        p.patience -= dt;
        if (p.patience <= 0) spoilPart(p);
      }
      const drain = dt * (1 + DOT_DRAIN * activeDotHeat());
      timeLeft = Math.max(0, timeLeft - drain); updateClock();
      if (timeLeft <= 0) failLevel();
      boardRenderT += dt;
      if (boardRenderT >= 0.18) { boardRenderT = 0; updateSystems(); }
    }
    applyPanicSky();
    beltTex.offset.x = (beltTex.offset.x - dt * 0.6) % 1;

    // dispatch dots: newly arrived jobs start white, then heat toward red as they wait
    for (let i = 0; i < jobDots.length; i++) {
      const j = jobDots[i]; if (!j.spawned || j.taken) continue;
      const heat = Math.max(0, Math.min(1, j.heat));
      const pulse = 0.5 + 0.5 * Math.sin(t * (3.4 + heat * 6.8));
      const dotColor = heat < 0.5
        ? DOT_COOL_C.clone().lerp(DOT_WARM_C, heat / 0.5)
        : DOT_WARM_C.clone().lerp(DOT_HOT_C, (heat - 0.5) / 0.5);
      const ud = j.group.userData;
      ud.coreMat.color.copy(dotColor);
      ud.coreMat.emissive.copy(dotColor);
      ud.coreMat.emissiveIntensity = 0.85 + heat * 1.95 + pulse * (0.25 + heat * 0.55);
      ud.halo.material.color.copy(dotColor);
      ud.halo.material.opacity = 0.16 + heat * 0.3 + pulse * 0.16;
      ud.alarmRing.material.color.copy(dotColor);
      ud.alarmRing.material.opacity = 0.16 + heat * 0.42 + pulse * 0.16;
      ud.alarmRing.scale.setScalar(0.92 + heat * 0.34 + pulse * 0.16);
      const tickCount = heat >= DOT_CRITICAL ? 3 : heat >= DOT_HOT ? 2 : heat >= 0.32 ? 1 : 0;
      for (let k = 0; k < ud.ticks.length; k++) {
        ud.ticks[k].visible = k < tickCount;
        ud.ticks[k].material.opacity = 0.45 + heat * 0.35 + pulse * 0.18;
      }
    j.group.scale.setScalar(DISPATCH_DOT_SCALE * (0.9 + heat * 0.18 + pulse * 0.12));
    }

    // ship squares: a colored status edge only — each square holds exactly one
    // block, so it just reads empty / filled / filed. No fraction to parse.
    for (const sl of slots) {
      const ud = sl.slot.userData;
      const occ = slotOccupants(sl.idx);
      const filed = occ.length && occ.every((p) => p.state === "online");
      let col = 0x35506a, op = 0.4;
      if (filed) { col = RING.online; op = 0.74; }
      else if (occ.length) { col = RING.online; op = 0.68; }
      ud.edgeMat.color.setHex(col); ud.edgeMat.opacity = op; ud.frameMat.emissive.setHex(0x000000);
      ud.hint.visible = false;
    }

    for (const p of parts) {
      if (p.state === "online") {
        if (p.installT > 0) p.installT = Math.max(0, p.installT - dt);
        const anim = p.slateMesh?.userData.upgradeModel.userData.anim;
        if (anim?.type === "ring") anim.ring.rotation.y += dt * 0.8;
        else if (anim?.type === "dome") { anim.field.rotation.y += dt * 0.25; anim.orbit.rotation.z += dt * 0.6; }
      }
    }

    // belt slates ride toward the player (skip the one being dragged)
    let slot = 0;
    for (const idx of belted) {
      const p = parts[idx]; if (!p.slateMesh) continue;
      if (dragging && picked === p) { slot++; continue; }
      const onScreen = slot < VISIBLE_SLOTS;
      const targetX = onScreen ? (SLOT_X0 + slot * SLOT_DX) : ENTRANCE_X;
      p.beltX += (targetX - p.beltX) * Math.min(1, dt * 4);
      const bob = Math.sin((t + slot) * 2) * 0.08;
      p.slateMesh.position.set(p.beltX, BELT_Y + bob, 2);
      p.slateMesh.visible = onScreen || p.beltX < ENTRANCE_X + 0.5;
      // the ICE is the patience meter — it stays sealed, but ages icy-blue → amber →
      // red and then visibly melts (shrinks + flickers) as the block runs out of time.
      const ice = p.slateMesh.userData.ice;
      const u = urgencyOf(p);
      const c = u < ICE_WARM_AT
        ? ICE_FRESH.clone().lerp(ICE_WARM_C, u / ICE_WARM_AT)
        : ICE_WARM_C.clone().lerp(ICE_HOT_C, (u - ICE_WARM_AT) / (1 - ICE_WARM_AT));
      ice.material.color.copy(c);
      ice.material.emissive.copy(c);
      ice.material.emissiveIntensity = 0.35 + u * 1.4;
      const melt = u < ICE_MELT_AT ? 1 : Math.max(0.05, 1 - (u - ICE_MELT_AT) / (1 - ICE_MELT_AT));
      ice.scale.setScalar(SLATE_ICE_SCALE * (0.25 + 0.75 * melt));
      ice.position.y = SLATE_ICE_Y - (1 - melt) * 0.55;
      ice.material.opacity = u > ICE_MELT_AT ? 0.5 + 0.25 * Math.sin(t * 9) : 0.62;
      const rim = p.slateMesh.userData.rim;
      rim.material.color.setHex(0x6fe3ff);
      rim.material.opacity = 0.45 + 0.3 * u;
      slot++;
    }

    // rack lamps: green means the subagent is docked/free, amber means out working
    for (let i = 0; i < droneRack.dockLights.length; i++) {
      const lamp = droneRack.dockLights[i];
      const busy = !!drones[i]?.busy;
      const pulse = 0.5 + 0.5 * Math.sin(t * (busy ? 7.0 : 2.4) + i);
      const color = busy ? 0xffd27a : 0x7cffb0;
      lamp.material.color.setHex(color);
      lamp.material.emissive.setHex(color);
      lamp.material.emissiveIntensity = busy ? 0.9 + pulse * 0.85 : 1.0 + pulse * 0.28;
      lamp.scale.setScalar(busy ? 0.85 + pulse * 0.18 : 1.0 + pulse * 0.08);
    }

    // drones: fly to the slot, weld, then home; frozen work hits the belt when done
    for (const d of drones) {
      const ud = d.mesh.userData;
      const spin = d.phase === "work" ? 9 : (d.phase === "out" || d.phase === "back") ? 6 : 1.2;
      ud.halo.rotation.z += spin * dt;
      ud.craft.position.y = 2.6 + Math.sin((t + d.home.x) * 2.2) * 0.14;
      if (d.phase === "out" || d.phase === "back") {
        d.flyProg = Math.min(1, d.flyProg + dt / PART_FLY);
        const k = d.flyProg * d.flyProg * (3 - 2 * d.flyProg);
        const a = d.phase === "out" ? d.home : weldPose(d.weldAt);
        const b = d.phase === "out" ? weldPose(d.weldAt) : d.home;
        d.mesh.position.lerpVectors(a, b, k);
        ud.glow.material.opacity = 0.3;
        if (d.flyProg >= 1) {
          if (d.phase === "out") { d.phase = "work"; d.part.fixT = (d.part.data.fix ?? PART_FIX_FALLBACK) + Math.random() * PART_FIX_JITTER; }
          else { const wasPart = d.part; d.phase = "home"; d.busy = false; d.part = null; d.mesh.position.copy(d.home); void wasPart; }
        }
      } else if (d.phase === "work") {
        d.part.fixT = Math.max(0, d.part.fixT - dt);
        ud.bodyMat.emissiveIntensity = 1.2 + 0.6 * Math.sin(t * 10);
        if (Math.random() < dt * 14) { const tip = ud.craft.getWorldPosition(new THREE.Vector3()); tip.y -= 0.8; spawnSpark(tip, 0xffb86b, 4); }
        if (d.part.fixT <= 0) { partToBelt(d.part); d.phase = "back"; d.flyProg = 0; }
      } else { ud.bodyMat.emissiveIntensity = 0.7 + 0.2 * Math.sin(t * 2 + d.home.x); ud.glow.material.opacity = 0.12; }
    }

    // sparks
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i]; s.life += dt; const pa = s.geo.attributes.position.array;
      for (let j = 0; j < s.vel.length; j++) { s.vel[j].y -= 14 * dt; pa[j * 3] += s.vel[j].x * dt; pa[j * 3 + 1] += s.vel[j].y * dt; pa[j * 3 + 2] += s.vel[j].z * dt; }
      s.geo.attributes.position.needsUpdate = true; s.mat.opacity = Math.max(0, 1 - s.life / s.ttl);
      if (s.life >= s.ttl) { scene.remove(s.pts); s.geo.dispose(); s.mat.dispose(); sparks.splice(i, 1); }
    }

    if (active) refreshHud();
  }

  // ---------- lifecycle ----------
  function enter() {
    active = true;
    canvas.addEventListener("mousedown", onPointerDown);
    canvas.addEventListener("mousemove", onPointerMove);
    window.addEventListener("mouseup", onPointerUp);
    window.addEventListener("keydown", onKeyDown);
    dbHud?.classList.remove("hidden"); fpShared?.classList.remove("hidden"); boardEl?.classList.add("hidden");
    setControls(); updateSystems();
    if (!started) showBriefing();
    else if (reportSent) winEl?.classList.remove("hidden");
    else if (failed) resetLevel();
    else { timerRunning = !allOnline(); tutorialEl?.classList.add("hidden"); }
    updateClock(); applyPanicSky();
  }
  function exit() {
    active = false; timerRunning = false; closePanel(); clearTimeout(winTimer);
    canvas.removeEventListener("mousedown", onPointerDown);
    canvas.removeEventListener("mousemove", onPointerMove);
    window.removeEventListener("mouseup", onPointerUp);
    window.removeEventListener("keydown", onKeyDown);
    canvas.style.cursor = "default"; setPrompt(null); hideControls();
    tutorialEl?.classList.add("hidden"); termEl?.classList.add("hidden");
    failEl?.classList.add("hidden"); winEl?.classList.add("hidden"); briefingEl?.classList.add("hidden");
    dbHud?.classList.add("hidden"); fpShared?.classList.add("hidden"); boardEl?.classList.add("hidden");
  }
  function resize() { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); }

  return { scene, get camera() { return camera; }, update, enter, exit, resize };
}
