import * as THREE from "three";
import { disposeObject3D } from "./three-utils.js";
import { makeBeamTexture, makeIceBlock } from "./memoryProps.js";
import { createLeaderboardEntry } from "./leaderboard.js";
import { createLeaderboardPanel } from "./leaderboardPanel.js";
import { marvinLine, randomResponse } from "./marvin.js";

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
// LOST and its pip returns to the dispatch board, costing a whole re-dispatch.

// Two pressures: (1) aged dispatch pips on the board heat from pale -> hot and speed the
// clock if you leave jobs un-dispatched; (2) each block on the belt burns patience
// and SPOILS if you don't explain + install it before its ice melts.
const TOTAL_TIME = 195;      // launch window, seconds (tunable)
const VISIBLE_SLOTS = 5;     // slate positions on the pass; extra finishes back up
const DOT_DRAIN = 0.045;     // max extra clock drain from each aged pip at full heat
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
// and install it before the ice melts; if it melts the work is LOST and its pip
// returns to the dispatch board, costing you a whole re-dispatch against the clock.
const PATIENCE = 18;         // seconds a block survives on the belt before it spoils (tunable)
const ICE_WARM_AT = 0.5;     // urgency (0 fresh→1 dead) where the ice starts going amber
const ICE_MELT_AT = 0.78;    // urgency where the ice goes hot, pulses, and visibly melts
const LOW_TIME = 22;         // clock turns urgent under this
const CRIT_TIME = 10;        // clock goes CRITICAL under this
const PANIC_TIME = 30;       // the SKY starts shifting toward panic-red

const SLOT_X0 = -16;         // leftmost (front-most) pass slot, x
const SLOT_DX = 8;           // spacing between pass slots
const BELT_Y = 3.0;          // slate resting height on the belt
const ENTRANCE_X = 26;       // where a finished slate slides in from
const SLATE_ICE_SCALE = 0.52;
const SLATE_ICE_Y = 2.0;
const MATCHED_SLATE_SCALE = 0.42;
const MATCHED_SLATE_POS = new THREE.Vector3(0, -SLATE_ICE_Y * MATCHED_SLATE_SCALE, 0.34);

// Onboarding — short story beats, advanced with Space.
const BRIEFING_BEATS = [
  "Pilot, you collected the records, but they need repair.",
  "Dispatch subagents for help, explain their work, and account for every repair before launch.",
];
const MODE_PROMPTS = {
  tutorial: {
    action: "START TUTORIAL",
    note: "First repair is practice. The clock stays off.",
  },
  level: {
    head: "TUTORIAL COMPLETE",
    action: "START LEVEL 2",
    note: "Clock starts now. Finish the remaining repairs.",
  },
};
const PRACTICE_PART_IDX = 0;
const PRACTICE_FIX_TIME = 1.8;
const REPAIR_LESSONS = {
  dispatch: {
    title: "",
    parts: ["Click the lit dispatch pip to send one subagent."],
    cue: "click dispatch",
  },
  working: {
    title: "",
    parts: ["The subagent is making the repair. Watch the conveyor for the sealed block."],
    cue: "wait for block",
  },
  explain: {
    title: "",
    parts: ["Click the sealed ice block to run ", { command: "entire checkpoint explain" }, ", then read the report."],
    cue: "click block",
  },
  match: {
    title: "",
    parts: ["Use what you deduced from the report to drag the block to the matching ship square."],
    cue: "drag to match",
  },
};

// Sky panic palette — same dread as Level 1's clock.
const SKY_CALM  = new THREE.Color(0x2a2350);
const SKY_PANIC = new THREE.Color(0x6e0f16);
const FOG_PANIC = new THREE.Color(0x4a0a0e);
const DOME_CALM = new THREE.Color(0x3a3168);
const DOME_PANIC = new THREE.Color(0x7a141c);
const SUN_CALM  = new THREE.Color(0xfff1dc);
const SUN_PANIC = new THREE.Color(0xff5a3c);
const GOLD = 0xffde8c;
const GOLD_TEXT = "#fff3cf";

// A block's ice as its patience runs out: fresh lavender glass → amber → rose.
const ICE_FRESH = new THREE.Color(0xd8ccff);
const ICE_WARM_C = new THREE.Color(0xffc24a);
const ICE_HOT_C = new THREE.Color(0xe45572);
const ICE_MATCHED = 0x65f29a;
const ICE_MATCHED_C = new THREE.Color(ICE_MATCHED);
const DOT_COOL_C = new THREE.Color(0xf3efff);
const DOT_WARM_C = new THREE.Color(0xffc24a);
const DOT_HOT_C = new THREE.Color(0xe45572);

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

function slotCellsTouch(a, b) {
  const ac = a % SLOTS_PER_ROW;
  const ar = Math.floor(a / SLOTS_PER_ROW);
  const bc = b % SLOTS_PER_ROW;
  const br = Math.floor(b / SLOTS_PER_ROW);
  return Math.abs(ac - bc) <= 1 && Math.abs(ar - br) <= 1;
}

function hasTouchingDuplicateSlots(bays, cells) {
  for (let i = 0; i < bays.length; i++) {
    for (let j = i + 1; j < bays.length; j++) {
      if (bays[i] === bays[j] && slotCellsTouch(cells[i], cells[j])) return true;
    }
  }
  return false;
}

function fallbackSeparatedSlotCells(bays) {
  const groups = new Map();
  bays.forEach((bay, slotIdx) => groups.set(bay, [...(groups.get(bay) || []), slotIdx]));
  const entries = [...groups.values()];
  if (bays.length !== 12 || SLOTS_PER_ROW !== 6 || entries.some((slots) => slots.length !== 2)) return null;
  const result = Array(bays.length).fill(null);
  entries.forEach((slots, i) => {
    result[slots[0]] = i;
    result[slots[1]] = 6 + ((i + 3) % SLOTS_PER_ROW);
  });
  return hasTouchingDuplicateSlots(bays, result) ? null : result;
}

function separatedSlotCells(bays) {
  const cells = bays.map((_, i) => i);
  const order = shuffled(bays.length);
  const result = Array(bays.length).fill(null);
  const used = new Set();
  const bayCells = new Map();

  function search(pos) {
    if (pos >= order.length) return true;
    const slotIdx = order[pos];
    const bay = bays[slotIdx];
    const assigned = bayCells.get(bay) || [];
    for (const cell of shuffled(cells.length)) {
      if (used.has(cell)) continue;
      if (assigned.some((other) => slotCellsTouch(other, cell))) continue;
      result[slotIdx] = cell;
      used.add(cell);
      bayCells.set(bay, [...assigned, cell]);
      if (search(pos + 1)) return true;
      result[slotIdx] = null;
      used.delete(cell);
      if (assigned.length) bayCells.set(bay, assigned);
      else bayCells.delete(bay);
    }
    return false;
  }

  if (search(0)) return result;
  return fallbackSeparatedSlotCells(bays) || shuffled(bays.length);
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
    color: 0xd8ccff, size: 0.16, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  const orbit = new THREE.Mesh(
    new THREE.TorusGeometry(2.0, 0.05, 8, 40),
    new THREE.MeshBasicMaterial({ color: 0xb9a7ff, transparent: true, opacity: 0.7 })
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
    new THREE.MeshStandardMaterial({ color: 0x3a3150, metalness: 0.7, roughness: 0.3, emissive: 0x2e1f5e, emissiveIntensity: 0.8 })
  );
  spire.position.y = 3.75;
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.4, 0.4, 70, 10, 1, true),
    new THREE.MeshBasicMaterial({
      map: beamTex, color: 0xc8b6ff, transparent: true, opacity: 0.55,
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
    new THREE.MeshStandardMaterial({ color: 0x2c2840, metalness: 0.6, roughness: 0.35, emissive: 0x2e1f5e, emissiveIntensity: 0.7 })
  );
  pad.position.y = 1.6;
  const glow = new THREE.Mesh(
    new THREE.TorusGeometry(1.5, 0.12, 8, 32),
    new THREE.MeshBasicMaterial({ color: 0xb9a7ff, transparent: true, opacity: 0.65 })
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
  ctx.strokeStyle = "rgba(185,167,255,0.5)";
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
    new THREE.MeshStandardMaterial({ color: 0x211b32, metalness: 0.6, roughness: 0.4, emissive: 0x25154f, emissiveIntensity: 0.5 })
  );
  slab.position.y = 0.25;
  const rim = new THREE.Mesh(
    new THREE.BoxGeometry(3.6, 0.14, 3.6),
    new THREE.MeshBasicMaterial({ color: 0xb9a7ff, transparent: true, opacity: 0.55 })
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

function freezeMatchedSlate(slate) {
  const { ice, upgradeModel, rim } = slate.userData;
  if (!ice) return;
  ice.visible = true;
  ice.scale.setScalar(SLATE_ICE_SCALE);
  ice.position.y = SLATE_ICE_Y;
  ice.rotation.set(0, 0, 0);
  ice.material.color.copy(ICE_MATCHED_C);
  ice.material.emissive.copy(ICE_MATCHED_C);
  ice.material.emissiveIntensity = 1.15;
  ice.material.opacity = 0.74;
  if (upgradeModel) upgradeModel.visible = false;
  if (rim) {
    rim.material.color.setHex(ICE_MATCHED);
    rim.material.opacity = 0.64;
  }
}

// ---------- a subagent: the original Drone Bay drone (octahedron + halo ring) ----------
// Restored from commit 0553cd7 ("Add Level 2 'The Drone Bay'"): a dark metallic
// octahedron body wrapped in a spinning gold torus — a hovering repair probe.
function buildDrone() {
  const group = new THREE.Group();
  const craft = new THREE.Group();        // the flying body (bobs locally)
  craft.position.y = 2.6;                  // resting hover height above the pad

  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x2d2842, metalness: 0.6, roughness: 0.3, emissive: 0x735ce0, emissiveIntensity: 1.0,
  });
  const body = new THREE.Mesh(new THREE.OctahedronGeometry(0.9, 0), bodyMat);
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(1.25, 0.11, 8, 24),
    new THREE.MeshBasicMaterial({
      color: GOLD, transparent: true, opacity: 0.96,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
  );
  halo.rotation.x = Math.PI / 2;
  craft.add(body, halo);

  // hover underglow
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 2.6),
    new THREE.MeshBasicMaterial({ color: 0xb9a7ff, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false })
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
    new THREE.MeshBasicMaterial({
      color: GOLD, transparent: true, opacity: 0.92,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
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
    color: 0x151126, metalness: 0.55, roughness: 0.68,
    emissive: 0x25154f, emissiveIntensity: 0.45,
  });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(width, 0.32, depth), deckMat);
  deck.position.set(centerX, 0.08, centerZ);
  group.add(deck);

  const rearWall = new THREE.Mesh(
    new THREE.BoxGeometry(width + 1.2, 1.3, 0.28),
    new THREE.MeshStandardMaterial({
      color: 0x18132c, metalness: 0.45, roughness: 0.62,
      emissive: 0x2a1856, emissiveIntensity: 0.55,
    })
  );
  rearWall.position.set(centerX, 0.82, minZ - 2.65);
  group.add(rearWall);

  const rail = new THREE.Mesh(
    new THREE.BoxGeometry(width + 1.8, 0.16, 0.18),
    new THREE.MeshBasicMaterial({ color: 0xb9a7ff, transparent: true, opacity: 0.62 })
  );
  rail.position.set(centerX, 1.62, minZ - 2.46);
  group.add(rail);

  const label = makeLabelSprite("DRONE BAY", { px: 30, color: "#d8ccff" });
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
      new THREE.MeshBasicMaterial({
        color: GOLD, transparent: true, opacity: 0.7,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    dockRim.rotation.x = -Math.PI / 2;
    dockRim.position.set(h.x, 0.36, h.z);
    group.add(dockRim);

    if (!laneXs.has(h.x)) {
      laneXs.add(h.x);
      const lane = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.08, Math.max(2.8, depth - 2.6)),
        new THREE.MeshBasicMaterial({ color: 0xb9a7ff, transparent: true, opacity: 0.12 })
      );
      lane.position.set(h.x, 0.38, centerZ);
      group.add(lane);
    }

    const lampMat = new THREE.MeshStandardMaterial({
      color: 0xd8ccff, emissive: 0xd8ccff, emissiveIntensity: 1.2,
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
// Forgiving drop: if the raw raycast under the pointer misses (label/edge/gap) or
// lands on a FULL duplicate of the right bay, snap to the nearest EMPTY square of the
// SAME system within this many on-screen pixels.
// IMPORTANT: this radius does NOT prevent cross-system snaps and must never be relied
// on for that. Cross-system safety is structural: resolveDropSlot classifies a dead-on
// hit on a wrong system's square as "wrong" BEFORE snapping, and the snap loop only ever
// considers squares of the held block's own system (the `sl.bayIdx !== p.targetSlot`
// filter). So the radius is purely a feel/forgiveness knob — at small canvas sizes the
// on-screen cell spacing can drop below this value (e.g. ~60px at 640x480), and that is
// fine precisely because the bayIdx filter, not the radius, is the guard.
const SNAP_RADIUS_PX = 60;

// ship-slot layout (two rows of six squares above the belt)
const SHIP_Y = 11.6, SHIP_Z = -13, SHIP_DX = 6.2;
const SLOTS_PER_ROW = 6;     // 12 squares laid out in two rows of six
const SHIP_ROW_DY = 5.4;     // vertical gap between the two square rows
const SHIP_PANEL_H = SHIP_ROW_DY + 7.0;
// Right-side dispatch bay: pip-only job queue, embedded in the shared control board.
const DISPATCH_BOARD_COLS = 4;
const DISPATCH_BOARD_ROWS = 3;
const DISPATCH_BOARD_X = 27.0;
const DISPATCH_BOARD_Y = SHIP_Y + SHIP_ROW_DY / 2;
const DISPATCH_BOARD_Z = SHIP_Z;
const DISPATCH_DOT_DX = 3.35;
const DISPATCH_DOT_DY = 2.25;
const DISPATCH_DOT_SCALE = 0.72;
const DISPATCH_LABEL_TOP_PAD = 1.32;
const DISPATCH_CONTENT_DROP = 0.72;
const SHIP_SLOT_PANEL_W = (SLOTS_PER_ROW - 1) * SHIP_DX + 8.0;
const DISPATCH_BOARD_W = (DISPATCH_BOARD_COLS - 1) * DISPATCH_DOT_DX + 4.4;
const CONTROL_BOARD_RIGHT_PAD = 1.1;
const CONTROL_BOARD_OFFSET_X = -((-SHIP_SLOT_PANEL_W / 2 + DISPATCH_BOARD_X + DISPATCH_BOARD_W / 2 + CONTROL_BOARD_RIGHT_PAD) / 2);
const boardX = (x) => x + CONTROL_BOARD_OFFSET_X;

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
    prompt: "Engine would not start.", subagent: "Engine test is stable after replacing seized ignition coils." },
  { name: "Air",      icon: "🫁", slotIdx: 1, ckpt: "62e0a9d4c8f3", fix: 3.5, broken: "buildBrokenVent",  upgrade: "buildGardenPod",  became: "Garden Pod",
    prompt: "Air scrubbers stopped cycling.", subagent: "Air mix is stable after growing a living filter." },
  { name: "Battery",  icon: "🔋", slotIdx: 2, ckpt: "c6053a8e2f19", fix: 5.5, broken: "buildBrokenCoils", upgrade: "buildPlasmaRing", became: "Cell Bloom",
    prompt: "Battery charge kept collapsing.", subagent: "Battery output is stable after rebuilding damaged cells." },
  { name: "Radio",    icon: "📡", slotIdx: 3, ckpt: "f25c8b30d971", fix: 6.5, broken: "buildBrokenDish",  upgrade: "buildSignalSpire", became: "Signal Spire",
    prompt: "Radio stopped responding.", subagent: "Radio signal is stable after rebuilding snapped antenna." },
  { name: "Steering", icon: "🧭", slotIdx: 4, ckpt: "3d7b0f9c61ae", fix: 4.5, broken: "buildBrokenNav",   upgrade: "buildStarDome",   became: "Star Dome",
    prompt: "Steering drifted off course.", subagent: "Steering is stable after rebuilding the nav core." },
  { name: "Lights",   icon: "💡", slotIdx: 5, ckpt: "8b47f1e62da0", fix: 2.5, broken: "buildBrokenVent",  upgrade: "buildStarDome",   became: "Aurora Array",
    prompt: "Cabin lights went dark.", subagent: "Lights are stable after wiring an aurora array." },
  { name: "Engine",   icon: "🔧", slotIdx: 0, ckpt: "7c1d4a9e3f20", fix: 4.6, broken: "buildBrokenCoils", upgrade: "buildGravSkid", became: "Torque Cradle",
    prompt: "Engine thrust kept bucking.", subagent: "Engine thrust is stable after bracing the torque cradle." },
  { name: "Air",      icon: "🫁", slotIdx: 1, ckpt: "b93f0e7a15cc", fix: 5.0, broken: "buildBrokenVent", upgrade: "buildGardenPod", became: "Mist Lung",
    prompt: "Cabin pressure kept slipping.", subagent: "Air pressure is stable after seeding a mist lung." },
  { name: "Battery",  icon: "🔋", slotIdx: 2, ckpt: "2e6c8b04d7a1", fix: 3.8, broken: "buildBrokenCoils", upgrade: "buildPlasmaRing", became: "Charge Loop",
    prompt: "Battery cells were overheating.", subagent: "Battery heat is stable after splitting the load through a charge loop." },
  { name: "Radio",    icon: "📡", slotIdx: 3, ckpt: "5a0f3d2c9b88", fix: 4.2, broken: "buildBrokenDish", upgrade: "buildSignalSpire", became: "Relay Needle",
    prompt: "Radio relay kept desyncing.", subagent: "Radio handshake is stable after tuning a relay needle." },
  { name: "Steering", icon: "🧭", slotIdx: 4, ckpt: "e4717c5a0d63", fix: 6.0, broken: "buildBrokenNav", upgrade: "buildStarDome", became: "Helm Lens",
    prompt: "Steering inputs were lagging.", subagent: "Steering response is stable after rebuilding the helm lens." },
  { name: "Lights",   icon: "💡", slotIdx: 5, ckpt: "9d28b6f1e470", fix: 3.2, broken: "buildBrokenVent", upgrade: "buildStarDome", became: "Beacon Strip",
    prompt: "Landing markers went dark.", subagent: "Lights are stable after wiring a beacon strip." },
];

const RING = { broken: GOLD, working: GOLD, target: GOLD, online: GOLD };

// ---------- a little waiting pip on the dispatch board (a failure a subagent flies to) ----------
function buildDispatchDot() {
  const g = new THREE.Group();
  const alarmRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.78, 0.045, 6, 28),
    new THREE.MeshBasicMaterial({ color: 0xf3efff, transparent: true, opacity: 0.24, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  alarmRing.position.z = 0.02;
  g.add(alarmRing);
  const coreMat = new THREE.MeshStandardMaterial({ color: 0xf3efff, emissive: 0xf3efff, emissiveIntensity: 0.9, roughness: 0.35 });
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 14), coreMat);
  g.add(core);
  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(0.62, 20),
    new THREE.MeshBasicMaterial({ color: 0xf3efff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  halo.position.z = -0.25;
  g.add(halo);
  const ticks = [];
  for (let i = 0; i < 3; i++) {
    const tick = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.32 + i * 0.06, 0.04),
      new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })
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
  const edgeMat = new THREE.MeshBasicMaterial({
    color: GOLD,
  });
  const edge = new THREE.Group();
  const edgeZ = 0.28;
  const edgeW = 4.42;
  const edgeH = 3.58;
  const edgeT = 0.13;
  const top = new THREE.Mesh(new THREE.BoxGeometry(edgeW, edgeT, 0.14), edgeMat);
  const bottom = top.clone();
  const left = new THREE.Mesh(new THREE.BoxGeometry(edgeT, edgeH, 0.14), edgeMat);
  const right = left.clone();
  top.position.set(0, edgeH / 2, edgeZ);
  bottom.position.set(0, -edgeH / 2, edgeZ);
  left.position.set(-edgeW / 2, 0, edgeZ);
  right.position.set(edgeW / 2, 0, edgeZ);
  edge.add(top, bottom, left, right);
  group.add(edge);
  const label = makeLabelSprite(`${data.icon} ${data.name}`, { px: 38 });
  label.position.y = 2.55;
  group.add(label);
  const hint = makeLabelSprite("", { px: 34, color: "#f09aa8" });
  hint.position.y = -2.35; hint.visible = false;
  group.add(hint);
  const hit = new THREE.Mesh(new THREE.BoxGeometry(4.9, 4.0, 1.4), new THREE.MeshBasicMaterial({ visible: false }));
  group.add(hit);
  const holder = new THREE.Group();    // installed slate sits here
  group.add(holder);
  group.userData = { frameMat, edgeMat, label, hint, holder };
  return group;
}

function makeTutorialGlowTexture() {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 256;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 126);
  g.addColorStop(0, "rgba(255, 243, 207, 0.95)");
  g.addColorStop(0.22, "rgba(255, 222, 140, 0.72)");
  g.addColorStop(0.52, "rgba(255, 194, 74, 0.32)");
  g.addColorStop(1, "rgba(255, 194, 74, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function buildTutorialFocusGlow(texture) {
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    color: GOLD,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
  }));
  glow.renderOrder = 40;
  glow.visible = false;
  return glow;
}

function buildShipGridPanel() {
  const group = new THREE.Group();
  const slotPanelW = SHIP_SLOT_PANEL_W;
  const dispatchW = DISPATCH_BOARD_W;
  const slotLeft = -slotPanelW / 2;
  const slotRight = slotPanelW / 2;
  const panelLeft = slotLeft;
  const panelRight = DISPATCH_BOARD_X + dispatchW / 2 + CONTROL_BOARD_RIGHT_PAD;
  const panelW = panelRight - panelLeft;
  const panelH = SHIP_PANEL_H;
  const panelCenterX = (panelLeft + panelRight) / 2;
  const centerY = SHIP_Y + SHIP_ROW_DY / 2;
  const panelZ = SHIP_Z - 0.52;
  const toLocalX = (x) => x - panelCenterX;

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(panelW, panelH, 0.36),
    new THREE.MeshStandardMaterial({
      color: 0x090712,
      emissive: 0x130f28,
      emissiveIntensity: 0.18,
      metalness: 0.52,
      roughness: 0.72,
      transparent: true,
      opacity: 0.92,
    })
  );
  group.add(base);

  const borderMat = new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.42 });
  const gridMat = new THREE.MeshBasicMaterial({ color: 0xd8ccff, transparent: true, opacity: 0.11 });
  const z = 0.22;

  const addBar = (x, y, w, h, mat = borderMat) => {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), mat);
    bar.position.set(x, y, z);
    group.add(bar);
    return bar;
  };
  const addWorldBar = (x, y, w, h, mat = borderMat) => addBar(toLocalX(x), y, w, h, mat);
  const addWorldSpan = (x0, x1, y, h, mat = borderMat) => addBar(toLocalX((x0 + x1) / 2), y, x1 - x0, h, mat);

  addBar(0, panelH / 2 - 0.12, panelW, 0.16);
  addBar(0, -panelH / 2 + 0.12, panelW, 0.16);
  addBar(-panelW / 2 + 0.12, 0, 0.16, panelH);
  addBar(panelW / 2 - 0.12, 0, 0.16, panelH);

  for (let col = 1; col < SLOTS_PER_ROW; col++) {
    const x = (col - SLOTS_PER_ROW / 2) * SHIP_DX;
    addWorldBar(x, 0, 0.08, panelH - 1.25, gridMat);
  }
  addWorldSpan(slotLeft + 0.55, slotRight + 0.55, 0, 0.08, gridMat);

  const dispatchDividerX = slotRight + 0.55;
  addWorldBar(dispatchDividerX, 0, 0.12, panelH - 0.7, borderMat);

  const boltMat = new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.5 });
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const bolt = new THREE.Mesh(new THREE.CircleGeometry(0.16, 14), boltMat);
      bolt.position.set(sx * (panelW / 2 - 0.72), sy * (panelH / 2 - 0.72), z + 0.02);
      group.add(bolt);
    }
  }

  group.position.set(boardX(panelCenterX), centerY, panelZ);
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
  // Resources SHARED across many live objects — never dispose these when retiring
  // a single transient slate. beamTex is one module-level CanvasTexture mapped
  // onto EVERY signal-spire beam material, so disposing a spire slate must keep it.
  const SHARED_KEEP = new Set([beamTex]);
  const BUILD = {
    buildBrokenCoils, buildBrokenNav, buildBrokenDish, buildBrokenVent, buildBrokenStrut,
    buildPlasmaRing, buildStarDome, buildGardenPod, buildGravSkid,
    buildSignalSpire: () => buildSignalSpire(beamTex),
  };

  // ---------- conveyor belt ----------
  const beltTex = makeBeltTexture();
  const belt = new THREE.Mesh(new THREE.BoxGeometry(54, 0.9, 6.4), new THREE.MeshStandardMaterial({ map: beltTex, color: 0x9180c8, metalness: 0.3, roughness: 0.6, emissive: 0x2a1f55, emissiveIntensity: 0.5 }));
  belt.position.set(0, BELT_Y - 1.0, 2); scene.add(belt);
  const lip = new THREE.Mesh(new THREE.BoxGeometry(54, 0.2, 0.4), new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.72 }));
  lip.position.set(0, BELT_Y - 0.5, 5.2); scene.add(lip);

  // ---------- twelve labeled ship squares (two per bay), in two rows of six ----------
  // One job per square — nothing is shared, so a square just reads empty or full.
  // Re-rolled each run: which grid cell each square sits in.
  const cellPos = (cell) => {
    const col = cell % SLOTS_PER_ROW;
    const row = Math.floor(cell / SLOTS_PER_ROW);
    return new THREE.Vector3(boardX((col - (SLOTS_PER_ROW - 1) / 2) * SHIP_DX), SHIP_Y + row * SHIP_ROW_DY, SHIP_Z);
  };
  // two squares per bay, in bay order: [0,0,1,1,2,2,3,3,4,4,5,5]
  const slotBays = [];
  SLOT_DATA.forEach((_, b) => { for (let k = 0; k < PART_DATA.filter((p) => p.slotIdx === b).length; k++) slotBays.push(b); });
  let slotCells = separatedSlotCells(slotBays); // square i occupies grid cell slotCells[i]

  const shipGridPanel = buildShipGridPanel();
  scene.add(shipGridPanel);

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
  const boardH = SHIP_PANEL_H;
  const dispatchLabel = makeLabelSprite("DISPATCH", { px: 28, color: GOLD_TEXT });
  dispatchLabel.position.set(boardX(DISPATCH_BOARD_X), DISPATCH_BOARD_Y + boardH / 2 - DISPATCH_LABEL_TOP_PAD, DISPATCH_BOARD_Z + 0.3); scene.add(dispatchLabel);
  const dotXForCol = (col) => boardX(DISPATCH_BOARD_X + (col - (DISPATCH_BOARD_COLS - 1) / 2) * DISPATCH_DOT_DX);
  const dotPosFor = (i) => {
    const col = i % DISPATCH_BOARD_COLS;
    const row = Math.floor(i / DISPATCH_BOARD_COLS);
    return new THREE.Vector3(
      dotXForCol(col),
      DISPATCH_BOARD_Y + ((DISPATCH_BOARD_ROWS - 1) / 2 - row) * DISPATCH_DOT_DY - 0.35 - DISPATCH_CONTENT_DROP,
      DISPATCH_BOARD_Z + 0.32
    );
  };

  // the little pips — future sockets stay dark; active jobs arrive white
  const jobDots = [];
  for (let i = 0; i < TOTAL_JOBS; i++) {
    const socket = new THREE.Mesh(new THREE.CircleGeometry(0.5, 18), new THREE.MeshBasicMaterial({ color: 0x07050a }));
    socket.position.copy(dotPosFor(i).clone().setZ(DISPATCH_BOARD_Z + 0.28)); scene.add(socket);
    const pos = dotPosFor(i);
    const group = buildDispatchDot();
    group.position.copy(pos); group.userData.dotIdx = i;
    group.visible = false;
    scene.add(group);
    jobDots.push({ idx: i, group, pos, taken: false, spawned: false, partIdx: null, heat: DOT_START_HEAT, wait: 0 });
  }
  const tutorialGlowTexture = makeTutorialGlowTexture();
  const tutorialFocusGlows = Array.from({ length: 1 }, () => {
    const glow = buildTutorialFocusGlow(tutorialGlowTexture);
    scene.add(glow);
    return glow;
  });
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
  // Drones still work on the dispatch board, but slightly below each pip and at
  // a smaller scale so neighboring job lights stay readable.
  const weldPose = (at) => at.clone().add(new THREE.Vector3(0, -0.95, 1.15));

  // jobs riding the belt (arrival order), by part index
  const belted = [];

  // ---------- sparks ----------
  const sparks = [];
  function spawnSpark(pos, color = 0xc8b6ff, n = 14) {
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
  function activateDot(dot, partIdx) {
    if (!dot) return false;
    const p = parts[partIdx];
    if (!p || p.state !== "queued") return false;
    dot.spawned = true; dot.taken = false; dot.partIdx = partIdx;
    dot.heat = DOT_START_HEAT; dot.wait = 0; dot.group.visible = true;
    p.state = "broken"; p.dotIdx = dot.idx;
    jobsSpawned += 1;
    spawnSpark(dot.pos.clone(), 0xf3efff, 10);
    return true;
  }
  function spawnNextDot() {
    const dot = jobDots.find((j) => !j.spawned);
    if (!dot) return false;
    while (pendingQueue.length) {
      const partIdx = pendingQueue.shift();
      if (activateDot(dot, partIdx)) return true;
    }
    return false;
  }
  function spawnInitialDots() {
    for (let i = 0; i < INITIAL_DOTS; i++) spawnNextDot();
    spawnTimer = nextSpawnDelay();
  }
  function spawnPracticeDot() {
    pendingQueue = pendingQueue.filter((idx) => idx !== PRACTICE_PART_IDX);
    return activateDot(jobDots.find((j) => !j.spawned), PRACTICE_PART_IDX);
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
  const modePrompt = document.getElementById("db-mode-prompt");
  const modeHead = document.getElementById("db-mode-head");
  const modeAction = document.getElementById("db-mode-action");
  const modeNote = document.getElementById("db-mode-note");
  const missionLesson = document.getElementById("db-mission-lesson");
  const missionLessonKicker = document.getElementById("db-mission-lesson-kicker");
  const missionLessonTitle = document.getElementById("db-mission-lesson-title");
  const missionLessonText = document.getElementById("db-mission-lesson-text");
  const missionLessonCue = document.getElementById("db-mission-lesson-cue");
  const countdownEl = document.getElementById("db-countdown");
  const countdownTime = document.getElementById("db-countdown-time");
  const systemsEl = document.getElementById("db-systems-rows");
  const winEl = document.getElementById("db-win");
  const winJobs = document.getElementById("db-win-jobs");
  const winFixes = document.getElementById("db-win-fixes");
  const winNext = document.getElementById("db-win-next");
  const failEl = document.getElementById("db-fail");
  const failTitle = document.getElementById("db-lf-title");
  const failSub = document.getElementById("db-lf-sub");
  const leaderboardPanel = createLeaderboardPanel({ mount: dbHud, onClose: hideLeaderboard });

  let active = false, started = false, failed = false, reportSent = false;
  let practiceMode = false, practiceComplete = false;
  let promptText = null;
  let msgTimer = null, winTimer = null, briefingIndex = 0, modePromptState = null, lessonKey = null;
  let timeLeft = TOTAL_TIME, timerRunning = false, elapsed = 0;
  let mistakes = 0;
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
  // which square the current drag would drop into, and why — drives hover highlight
  let hoverSlot = null, hoverKind = null, hoverDirect = false;
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
  // project a world position to canvas-relative pixel coords (same NDC basis as setNdc)
  const _proj = new THREE.Vector3();
  function slotScreenXY(sl) {
    const r = canvas.getBoundingClientRect();
    _proj.copy(sl.slotPos).project(camera);
    return { x: (_proj.x * 0.5 + 0.5) * r.width, y: (-_proj.y * 0.5 + 0.5) * r.height, behind: _proj.z > 1 };
  }
  // Forgiving, FAIR drop resolution for a held block `p`. Returns { sl, kind }:
  //   kind "correct"   → an EMPTY square of the right system (place succeeds)
  //   kind "full"      → the right system, but every nearby square is taken
  //   kind "wrong"     → the raw raycast landed on a different system's square
  //   kind "miss"      → nothing under or near the pointer
  // The nearest-square fallback NEVER crosses systems: it can only ever pull the drop
  // onto an empty twin of the SAME bay the block belongs to, so deduction still matters.
  function resolveDropSlot(p, e) {
    const raw = slotAtPointer(e);
    if (raw && raw.bayIdx === p.targetSlot && slotHasRoom(raw.idx)) return { sl: raw, kind: "correct" };
    // A deliberate, dead-on hit on ANOTHER system's square is a wrong-system drop — classify
    // it BEFORE the forgiving snap so the snap can never auto-solve the deduction by quietly
    // pulling the block onto a nearby correct square. Only fall through to the snap when the
    // pointer is over empty space (label/gap → raw is null) or over the right bay's own square.
    if (raw && raw.bayIdx !== p.targetSlot) return { sl: raw, kind: "wrong" };
    // Look for the nearest EMPTY square of the correct system within the snap radius,
    // measured in screen space so a near-miss on the right bay still registers.
    const r = canvas.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    let best = null, bestD = SNAP_RADIUS_PX;
    for (const sl of slots) {
      if (sl.bayIdx !== p.targetSlot || !slotHasRoom(sl.idx)) continue;
      const s = slotScreenXY(sl);
      if (s.behind) continue;
      const d = Math.hypot(s.x - px, s.y - py);
      if (d < bestD) { bestD = d; best = sl; }
    }
    if (best) return { sl: best, kind: "correct" };           // snap to an empty twin of the right bay
    if (raw) return { sl: raw, kind: "full" };                // raw can only be the right (full) bay here
    return { sl: null, kind: "miss" };
  }
  function cursorDragPoint(e) {
    setNdc(e); raycaster.setFromCamera(ndc, camera);
    return raycaster.ray.origin.clone().add(raycaster.ray.direction.clone().multiplyScalar(DRAG_DEPTH));
  }
  function hideTutorialFocus() {
    tutorialFocusGlows.forEach((glow) => { glow.visible = false; });
  }
  function tutorialFocusTargets() {
    if (!practiceMode || !lessonKey || panelMode === "review") return [];
    const p = parts[PRACTICE_PART_IDX];
    if (!p) return [];
    if (lessonKey === "dispatch") {
      const dot = jobDots.find((j) => j.partIdx === p.idx && j.spawned && !j.taken);
      if (!dot) return [];
      const pos = dot.group.getWorldPosition(new THREE.Vector3());
      pos.z += 0.18;
      return [{ pos, sx: 2.2, sy: 2.2 }];
    }
    if (lessonKey === "explain" && p.slateMesh) {
      const pos = (p.slateMesh.userData.ice || p.slateMesh).getWorldPosition(new THREE.Vector3());
      pos.z += 0.1;
      return [{ pos, sx: 4.4, sy: 3.6 }];
    }
    if (lessonKey === "match") {
      const sl = slots.find((slot) => slot.bayIdx === p.targetSlot && slotHasRoom(slot.idx));
      if (!sl) return [];
      const pos = sl.slot.getWorldPosition(new THREE.Vector3());
      pos.z += 0.16;
      return [{ pos, sx: 6.2, sy: 5.2 }];
    }
    return [];
  }
  function updateTutorialFocus(t) {
    const targets = tutorialFocusTargets();
    for (let i = 0; i < tutorialFocusGlows.length; i++) {
      const glow = tutorialFocusGlows[i];
      const target = targets[i];
      if (!target) { glow.visible = false; continue; }
      const wave = 0.5 + 0.5 * Math.sin(t * 4.6 + i * 0.8);
      const pulse = 1 + wave * 0.12;
      glow.visible = true;
      glow.position.copy(target.pos);
      glow.scale.set(target.sx * pulse, target.sy * pulse, 1);
      glow.material.opacity = 0.42 + wave * 0.28;
    }
  }

  // ---------- HUD helpers ----------
  function setPrompt(t) { if (!promptEl || t === promptText) return; promptText = t; if (t) { promptEl.textContent = t; promptEl.classList.remove("hidden"); } else promptEl.classList.add("hidden"); }
  function setControls() {
    if (!controlsEl) return;
    controlsEl.innerHTML = "";
    controlsEl.classList.add("hidden");
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
  function renderRepairLesson(key) {
    const lesson = REPAIR_LESSONS[key];
    if (!lesson || !missionLesson) return;
    lessonKey = key;
    if (missionLessonKicker) missionLessonKicker.textContent = "DRONE BAY";
    if (missionLessonTitle) {
      missionLessonTitle.textContent = lesson.title || "";
      missionLessonTitle.classList.toggle("hidden", !lesson.title);
    }
    if (missionLessonText) {
      missionLessonText.replaceChildren(...lesson.parts.map((part) => {
        if (typeof part === "string") return document.createTextNode(part);
        const command = document.createElement("span");
        command.className = "mission-lesson-command";
        command.textContent = part.command;
        return command;
      }));
      missionLessonText.classList.remove("beat-in");
      void missionLessonText.offsetWidth;
      missionLessonText.classList.add("beat-in");
    }
    if (missionLessonCue) {
      missionLessonCue.innerHTML = `<span class="mission-lesson-next">${lesson.cue || ""}</span>`;
    }
    missionLesson.classList.remove("hidden");
  }
  function hideRepairLesson() {
    lessonKey = null;
    missionLesson?.classList.add("hidden");
    hideTutorialFocus();
  }
  function showModePrompt(kind) {
    const prompt = MODE_PROMPTS[kind];
    if (!prompt || !modePrompt) return;
    modePromptState = kind;
    timerRunning = false;
    hideRepairLesson();
    closePanel();
    briefingEl?.classList.add("hidden");
    if (modeHead) {
      modeHead.textContent = prompt.head || "";
      modeHead.classList.toggle("hidden", !prompt.head);
    }
    if (modeAction) modeAction.textContent = prompt.action;
    if (modeNote) modeNote.textContent = prompt.note;
    modePrompt.dataset.mode = kind;
    modePrompt.classList.remove("hidden");
  }
  function visibleModePromptKind() {
    if (!modePrompt || modePrompt.classList.contains("hidden")) return null;
    return modePrompt.dataset.mode || modePromptState;
  }
  function hideModePrompt() {
    if (modePrompt) {
      modePrompt.classList.add("hidden");
      delete modePrompt.dataset.mode;
    }
    modePromptState = null;
    modeAction?.blur();
  }
  function escapeHtml(v) {
    return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function escapeRegExp(v) {
    return String(v ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  function renderReportText(text, systemName, allowHighlight = true) {
    const source = String(text ?? "");
    const key = String(systemName ?? "").trim();
    if (!allowHighlight || !key) return { html: escapeHtml(source), matched: false };
    const match = new RegExp(`\\b${escapeRegExp(key)}\\b`, "i").exec(source);
    if (!match) return { html: escapeHtml(source), matched: false };
    const before = source.slice(0, match.index);
    const word = source.slice(match.index, match.index + match[0].length);
    const after = source.slice(match.index + match[0].length);
    return {
      html: `${escapeHtml(before)}<span class="term-report-keyword">${escapeHtml(word)}</span>${escapeHtml(after)}`,
      matched: true,
    };
  }
  function resetWorkState() {
    closePanel();
    belted.length = 0;
    picked = null; dragging = false; hoverSlot = null; hoverKind = null; hoverDirect = false;
    slotCells = separatedSlotCells(slotBays);
    pendingQueue = shuffled(TOTAL_JOBS);
    jobsSpawned = 0; spawnTimer = 0;
    slots.forEach((sl, i) => {
      sl.slotPos.copy(cellPos(slotCells[i]));
      sl.slot.position.copy(sl.slotPos);
    });
    parts.forEach((p) => {
      if (p.slateMesh) {
        // Reset: detach the slate from wherever it lives (belt = scene, or a
        // slot holder group) and recursively free its GPU resources — the child
        // upgrade model, the ice mesh, the slab/rim/hit meshes and all their
        // materials + generated canvas textures. The shared beam texture (mapped
        // onto every signal-spire beam) is preserved via SHARED_KEEP.
        p.slateMesh.parent?.remove(p.slateMesh);
        scene.remove(p.slateMesh);
        disposeObject3D(p.slateMesh, { keep: SHARED_KEEP });
        p.slateMesh = null;
      }
      p.state = "queued"; p.placedIn = null; p.explained = false; p.fixT = 0; p.installT = 0;
      p.beltX = ENTRANCE_X; p.patience = 0; p.dotIdx = null;
    });
    for (const j of jobDots) {
      j.spawned = false; j.taken = false; j.partIdx = null; j.heat = DOT_START_HEAT; j.wait = 0;
      j.group.visible = false;
    }
    for (const d of drones) {
      d.busy = false; d.part = null; d.phase = "home"; d.flyProg = 0; d.weldAt = null;
      d.mesh.position.copy(d.home);
    }
    mistakes = 0;
  }
  function restorePracticePart() {
    const p = parts[PRACTICE_PART_IDX];
    if (!p || p.state !== "queued") return;
    const sl = slots.find((slot) => slot.bayIdx === p.targetSlot && slotHasRoom(slot.idx));
    if (!sl) return;
    pendingQueue = pendingQueue.filter((idx) => idx !== p.idx);
    p.state = "placed"; p.placedIn = sl.idx; p.explained = true; p.patience = PATIENCE;
    const slate = buildSlate(BUILD[p.data.upgrade]());
    slate.userData.partIdx = p.idx;
    p.slateMesh = slate;
    freezeMatchedSlate(slate);
    sl.slot.userData.holder.add(slate);
    slate.position.copy(MATCHED_SLATE_POS);
    slate.scale.setScalar(MATCHED_SLATE_SCALE);
    jobsSpawned = Math.max(jobsSpawned, 1);
  }
  function startPractice() {
    hideModePrompt();
    hideLeaderboard();
    resetWorkState();
    failed = false; reportSent = false; started = true; practiceMode = true; practiceComplete = false;
    timeLeft = TOTAL_TIME; timerRunning = false; elapsed = 0; boardRenderT = 0;
    failEl?.classList.add("hidden"); winEl?.classList.add("hidden");
    spawnPracticeDot();
    renderRepairLesson("dispatch");
    updateClock(); updateSystems();
  }
  function startTimedRun() {
    hideModePrompt();
    hideRepairLesson();
    closePanel();
    hideTutorialFocus();
    failed = false; reportSent = false; started = true; practiceMode = false;
    timeLeft = TOTAL_TIME; timerRunning = true; elapsed = 0; boardRenderT = 0; mistakes = 0;
    failEl?.classList.add("hidden"); winEl?.classList.add("hidden");
    hideLeaderboard();
    spawnInitialDots();
    updateClock(); updateSystems();
  }
  function finishPractice() {
    if (!practiceMode) return;
    practiceMode = false;
    practiceComplete = true;
    hideRepairLesson();
    showModePrompt("level");
    updateSystems(); updateClock();
  }
  function acceptModePrompt() {
    const acceptedMode = visibleModePromptKind();
    if (acceptedMode === "tutorial") startPractice();
    else if (acceptedMode === "level") startTimedRun();
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
  function advanceBriefing() {
    if (started) return;
    if (briefingIndex < BRIEFING_BEATS.length - 1) {
      briefingIndex += 1;
      renderBriefingBeat();
      return;
    }
    showModePrompt("tutorial");
  }
  function showBriefing() {
    timerRunning = false;
    hideLeaderboard();
    boardEl?.classList.add("hidden");
    tutorialEl?.classList.add("hidden");
    hideModePrompt();
    hideRepairLesson();
    briefingIndex = 0;
    renderBriefingBeat();
    briefingEl?.classList.remove("hidden");
  }
  briefingEl?.addEventListener("click", () => { if (active && !started) advanceBriefing(); });
  modeAction?.addEventListener("click", acceptModePrompt);
  termCta?.addEventListener("click", () => { if (active && panelMode === "review") continueReview(); });
  winNext?.addEventListener("click", () => { if (active && reportSent) onNext?.(); });

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
    spawnSpark(jd.pos.clone(), 0xc8b6ff, 12);
    if (practiceMode && p.idx === PRACTICE_PART_IDX) renderRepairLesson("working");
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
    if (practiceMode && p.idx === PRACTICE_PART_IDX) renderRepairLesson("explain");
    updateSystems();
  }
  // patience ran out — the work SPOILS and is lost: the block leaves the belt and its
  // pip returns to the dispatch board, so the whole job has to be re-dispatched.
  function spoilPart(p) {
    const i = belted.indexOf(p.idx); if (i >= 0) belted.splice(i, 1);
    spawnSpark(new THREE.Vector3(p.beltX, BELT_Y, 2), 0xe45572, 20);
    if (p.slateMesh) {
      // Block spoiled — recursively free the slate, its child upgrade model, the
      // ice mesh and all their materials/geometries. Keep the shared beam texture.
      scene.remove(p.slateMesh);
      disposeObject3D(p.slateMesh, { keep: SHARED_KEEP });
      p.slateMesh = null;
    }
    if (reviewPart === p) closePanel();
    p.state = "broken"; p.explained = false; p.placedIn = null; p.patience = 0; p.beltX = ENTRANCE_X;
    if (!practiceMode) mistakes += 1;
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
  function renderReviewContinueCta() {
    if (!termCta) return;
    termCta.innerHTML =
      `<button type="button" class="term-continue-btn">` +
        `<span class="term-continue-key">Space</span>` +
        `<span class="term-continue-text">to continue</span>` +
      `</button>`;
  }
  function dispatchReportLines() {
    const count = parts.length;
    return [
      "Beep, boop. Marvin here.",
      "Against several reasonable projections, the pilot understood the paperwork.",
      `${count} repair jobs dispatched.`,
      `${count} subagent fixes explained, matched, and accounted for.`,
    ];
  }
  function renderDispatchReportList() {
    if (!termList) return;
    termList.innerHTML = dispatchReportLines()
      .map((line, i) => {
  const marvinIcon = i === 0
    ? `<img class="marvin-icon marvin-icon--terminal"
            src="/images/slack-entire-marvin-darkmode-success.gif"
            alt="" aria-hidden="true" />`
    : '';
  return `<div class="term-list-row term-dispatch-report-line${i === 0 ? " is-marvin" : ""}">` +
    marvinIcon +
    `<span class="tl-title">${line}</span></div>`;
})
      .join("");
    termList.classList.remove("hidden");
  }
  function renderWinReport() {
    const lines = dispatchReportLines();
    if (winJobs) winJobs.textContent = lines[2];
    if (winFixes) winFixes.textContent = lines[3];
  }
  function continueReview() {
    if (panelMode !== "review") return;
    const returnToPracticeMatch = practiceMode && reviewPart?.idx === PRACTICE_PART_IDX;
    closePanel();
    if (returnToPracticeMatch) renderRepairLesson("match");
  }
  function renderPanel() {
    if (panelMode === "review" && reviewPart) {
      const d = reviewPart.data;
      termHint.textContent = "";
      termInput.textContent = `entire checkpoint explain ${d.ckpt}`; termInput.classList.add("is-dim");
      if (termList) {
        const practiceReview = practiceMode && reviewPart.idx === PRACTICE_PART_IDX;
        const prompt = renderReportText(d.prompt, d.name, practiceReview);
        const subagent = renderReportText(d.subagent, d.name, practiceReview && !prompt.matched);
        termList.innerHTML = marvinLine(randomResponse("explainReport")) +
          `<div class="term-list-row term-report-row"><span class="tl-key tl-exp-key">Prompt:</span><span class="tl-title">${prompt.html}</span></div>` +
          `<div class="term-list-row term-report-row"><span class="tl-key tl-exp-key">Subagent:</span><span class="tl-title">${subagent.html}</span></div>`;
        termList.classList.remove("hidden");
      }
      if (termMsg) {
        termMsg.textContent = "";
        termMsg.classList.remove("show-ok", "show-err");
      }
      if (practiceMode && reviewPart.idx === PRACTICE_PART_IDX) renderReviewContinueCta();
      else if (termCta) termCta.innerHTML = "";
      termEl?.classList.remove("hidden");
    } else if (panelMode === "report") {
      if (reportSent) {
        termHint.textContent = "";
        termInput.textContent = "entire dispatch";
        termInput.classList.add("is-dim");
        renderDispatchReportList();
        if (termCta) termCta.innerHTML = "";
      } else {
        termHint.textContent = "# all blocks placed — dispatch to lock in the matches";
        termInput.textContent = buffer;
        termInput.classList.remove("is-dim");
        termList?.classList.add("hidden");
        if (termCta) termCta.innerHTML = `<span class="cta-label">TYPE</span><span class="cta-cmd">entire dispatch</span>`;
      }
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
      spawnSpark(p.slateMesh.position.clone().setY(BELT_Y + 2), 0xc8b6ff, 12);
      updateSystems();
    }
    renderPanel();
    if (practiceMode && p.idx === PRACTICE_PART_IDX) hideRepairLesson();
  }
  function closePanel() { panelMode = null; reviewPart = null; buffer = ""; termEl?.classList.add("hidden"); termList?.classList.add("hidden"); if (termCta) termCta.innerHTML = ""; if (termMsg) termMsg.textContent = ""; termMsg?.classList.remove("show-ok", "show-err"); }

  // drop a block into a square — graded RIGHT HERE. A wrong bay bounces the block
  // straight back to the belt and says so, so the match is a real read-the-label
  // decision with instant feedback (not a deferred reveal at dispatch).
  function placePart(p, sl) {
    if (!p.explained) { flashTerminal("run explain before placing the block", false); p.slateMesh.position.set(p.beltX, BELT_Y, 2); return; }
    if (sl.bayIdx !== p.targetSlot) {             // wrong bay → bounce it back (don't reveal what it was)
      if (!practiceMode) mistakes += 1;
      p.slateMesh.position.set(p.beltX, BELT_Y, 2);
      spawnSpark(sl.slotPos.clone(), 0xe45572, 12);
      flashTerminal(`✗ that's not the ${sl.data.name.toLowerCase()} fix — re-read the report and try the bay it really belongs to`, false);
      return;
    }
    if (!slotHasRoom(sl.idx)) {
      p.slateMesh.position.set(p.beltX, BELT_Y, 2);
      flashTerminal(`that ${sl.data.name.toLowerCase()} square's taken — drop it in the other one`, false);
      return;
    }
    // correct! The square confirms the match; the work stays sealed as green ice.
    p.state = "placed"; p.placedIn = sl.idx; p.installT = PART_MELT;
    const i = belted.indexOf(p.idx); if (i >= 0) belted.splice(i, 1);
    const slate = p.slateMesh;
    freezeMatchedSlate(slate);
    sl.slot.userData.holder.add(slate);
    slate.position.copy(MATCHED_SLATE_POS); slate.scale.setScalar(MATCHED_SLATE_SCALE);
    if (reviewPart === p) closePanel();
    updateSystems();
    // Marvin reacts to a correct placement
    if (termList && !practiceMode) {
      const marvinDiv = document.createElement("div");
      marvinDiv.innerHTML = marvinLine(randomResponse("blockPlaced"));
      termList.appendChild(marvinDiv.firstElementChild);
    }
    if (practiceMode && p.idx === PRACTICE_PART_IDX) {
      finishPractice();
      return;
    }
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
    if (termMsg) {
      clearTimeout(msgTimer);
      termMsg.textContent = "";
      termMsg.classList.remove("show-ok", "show-err");
    }
    renderWinReport();
    renderPanel();
    winTimer = setTimeout(() => { closePanel(); tutorialEl?.classList.add("hidden"); winEl?.classList.remove("hidden"); }, 3600);
    onComplete?.();
  }
  // Placement is graded at drop time (a wrong bay never sticks), so every placed
  // block is already correct here — dispatch just keeps the green ice and files.
  function gradeAndDispatch() {
    for (const p of parts) {
      if (p.state === "placed") {
        p.state = "online";
        p.installT = PART_MELT;
        freezeMatchedSlate(p.slateMesh);
        spawnSpark(slots[p.placedIn]?.slot.position.clone() || new THREE.Vector3(), ICE_MATCHED, 14);
      }
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
  function failLevel() {
    if (failed || reportSent) return;
    failed = true; timerRunning = false; practiceMode = false;
    closePanel(); hideModePrompt(); hideRepairLesson(); renderBoard();
    countdownEl?.classList.remove("is-low", "is-critical");
    tutorialEl?.classList.add("hidden");
    const accounted = parts.filter((p) => p.state === "placed" || p.state === "online").length;
    if (failTitle) failTitle.textContent = "TIME'S UP";
    if (failSub) failSub.textContent = `You've only accounted for ${accounted} of ${parts.length} repairs.`;
    failEl?.classList.remove("hidden");
    showLeaderboard();
  }
  function showLeaderboard() {
    dbHud?.classList.add("has-leaderboard");
    leaderboardPanel.show(createLeaderboardEntry({
      level: 2,
      outcome: "loss",
      totalTime: TOTAL_TIME,
      timeLeft,
      durationSeconds: elapsed,
      progressCompleted: placedCount(),
      progressTotal: parts.length,
      mistakes,
    }), {
      title: "Game over",
    });
  }
  function hideLeaderboard() {
    dbHud?.classList.remove("has-leaderboard");
    leaderboardPanel.hide();
  }
  function resetLevel() {
    failed = false; reportSent = false; practiceMode = false; clearTimeout(winTimer);
    hideLeaderboard();
    resetWorkState();
    elapsed = 0; timeLeft = TOTAL_TIME; timerRunning = false; boardRenderT = 0;
    failEl?.classList.add("hidden"); winEl?.classList.add("hidden");
    if (practiceComplete) {
      started = true;
      restorePracticePart();
      showModePrompt("level");
    } else {
      started = false;
      showModePrompt("tutorial");
    }
    updateSystems(); updateClock();
  }

  function placeAllPartsOnlineForShortcut() {
    resetWorkState();
    jobsSpawned = TOTAL_JOBS;
    for (const p of parts) {
      const sl = slots.find((slot) => slot.bayIdx === p.targetSlot && slotHasRoom(slot.idx));
      if (!sl) continue;
      p.state = "online";
      p.placedIn = sl.idx;
      p.explained = true;
      p.patience = PATIENCE;
      p.installT = 0;
      p.dotIdx = p.idx;
      const slate = buildSlate(BUILD[p.data.upgrade]());
      slate.userData.partIdx = p.idx;
      p.slateMesh = slate;
      freezeMatchedSlate(slate);
      sl.slot.userData.holder.add(slate);
      slate.position.copy(MATCHED_SLATE_POS);
      slate.scale.setScalar(MATCHED_SLATE_SCALE);
    }
  }

  function skipToEnd(outcome) {
    clearTimeout(winTimer);
    hideModePrompt();
    hideRepairLesson();
    closePanel();
    briefingEl?.classList.add("hidden");
    tutorialEl?.classList.add("hidden");
    started = true;
    practiceMode = false;
    practiceComplete = true;
    elapsed = 0;
    timeLeft = 0;
    timerRunning = false;
    boardRenderT = 0;
    failed = false;
    reportSent = false;
    failEl?.classList.add("hidden");
    winEl?.classList.add("hidden");

    if (outcome === "success") {
      placeAllPartsOnlineForShortcut();
      reportSent = true;
      renderWinReport();
      updateSystems();
      winEl?.classList.remove("hidden");
      onComplete?.();
    } else {
      resetWorkState();
      failLevel();
    }

    updateClock();
    applyPanicSky();
  }

  // ---------- input ----------
  function onPointerDown(e) {
    if (!active || !started || failed || reportSent || panelMode === "report" || visibleModePromptKind()) return;
    downX = e.clientX; downY = e.clientY; dragging = false;
    picked = slateAtPointer(e);   // a belt slate we might drag
  }
  function onPointerMove(e) {
    if (!active || !started || failed || visibleModePromptKind()) { canvas.style.cursor = "default"; return; }
    if (picked && !dragging && Math.hypot(e.clientX - downX, e.clientY - downY) > 6) {
      if (!picked.explained) {
        canvas.style.cursor = "pointer";
        return;
      }
      dragging = true;
    }
    if (dragging && picked) {
      picked.slateMesh.position.copy(cursorDragPoint(e)); canvas.style.cursor = "grabbing";
      // preview where this drop will land so the player sees the target before releasing
      const res = resolveDropSlot(picked, e);
      hoverSlot = res.sl; hoverKind = res.kind;
      // Only a DIRECT raycast hit on the right bay's own empty square may glow green.
      // A merely-snapped correct target is NOT surfaced, so the player can't sweep the
      // grid hunting for the green halo instead of reading the report (no answer reveal).
      const raw = slotAtPointer(e);
      hoverDirect = !!(raw && res.sl === raw && res.kind === "correct");
      // A merely-snapped correct target (within snap radius but not a direct hit) is
      // about to succeed on release — leave it UN-highlighted rather than painting it
      // rose, so the hover never contradicts the resolved drop (no false 'bad' halo).
      if (res.kind === "correct" && !hoverDirect) hoverSlot = null;
      return;
    }
    if (panelMode === "report") { canvas.style.cursor = "default"; return; }
    const s = slateAtPointer(e) || dotAtPointer(e);
    canvas.style.cursor = s ? "pointer" : "default";   // slates + dispatch dots are clickable
  }
  function onPointerUp(e) {
    if (!active || !started || failed || visibleModePromptKind()) return;
    if (dragging && picked) {
      // forgiving resolve: a near-miss on the right bay (or a hit on its FULL twin)
      // still snaps to an empty square of the correct system — never another system.
      const { sl, kind } = resolveDropSlot(picked, e);
      if (kind === "correct" && picked.state === "review") {
        placePart(picked, sl);                                  // (a) success
      } else if (kind === "full") {                             // (b) right system, every square taken
        picked.slateMesh.position.set(picked.beltX, BELT_Y, 2);
        spawnSpark(sl.slotPos.clone(), 0xffc24a, 10);
        flashTerminal(`both ${sl.data.name.toLowerCase()} squares are full — wait for one to free up`, false);
      } else if (kind === "wrong") {                            // (c) a square of the wrong system
        placePart(picked, sl);                                  // placePart bounces + grades the wrong bay
      } else {                                                  // (d) missed every square
        picked.slateMesh.position.set(picked.beltX, BELT_Y, 2);
        flashTerminal("missed the hull — drop the block onto a ship square", false);
      }
      picked = null; dragging = false; hoverSlot = null; hoverKind = null; hoverDirect = false; canvas.style.cursor = "default"; return;
    }
    if (picked) { explainPart(picked); picked = null; return; }   // a click on a sealed slate = explain
    const jd = dotAtPointer(e);                                    // a click on a waiting pip = dispatch
    if (jd) dispatchFromDot(jd);
  }
  function onKeyDown(e) {
    if (!active) return;
    if (leaderboardPanel.containsTarget(e.target)) return;
    if (leaderboardPanel.isVisible()) {
      leaderboardPanel.focusInput();
      e.preventDefault();
      return;
    }
    if (visibleModePromptKind()) {
      if (e.code === "Enter" || e.code === "Space") {
        acceptModePrompt();
        e.preventDefault();
      }
      return;
    }
    if (!started) { if (e.code === "Enter" || e.code === "Space") { advanceBriefing(); e.preventDefault(); } return; }
    if (failed) { if (e.code === "KeyR") { resetLevel(); e.preventDefault(); } if (e.code === "KeyN") { onNewGame?.(); e.preventDefault(); } return; }
    if (reportSent) {
      onNext?.();
      e.preventDefault();
      return;
    }
    if (panelMode === "review" && practiceMode && reviewPart?.idx === PRACTICE_PART_IDX && e.code === "Space") {
      continueReview();
      e.preventDefault();
      return;
    }
    if (panelMode === "report") {
      if (e.code === "Enter") { submitCommand(); e.preventDefault(); return; }
      if (e.code === "Backspace") { buffer = buffer.slice(0, -1); renderPanel(); e.preventDefault(); return; }
      if (e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { buffer += e.key; renderPanel(); e.preventDefault(); }
      return;
    }
    if (e.code === "Escape" && panelMode === "review") {
      continueReview();
      e.preventDefault();
      return;
    }
    if (e.code === "KeyB") { onExit?.(); e.preventDefault(); }
  }

  // ---------- prompts ----------
  function refreshHud() {
    setPrompt(null);
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

    // dispatch dots: newly arrived jobs start pale, then heat toward rose as they wait
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
      let col = RING.broken, op = 0.68;
      if (filed) { col = RING.online; op = 0.88; }
      else if (occ.length) { col = RING.online; op = 0.8; }
      // hover preview while dragging: green halo ONLY on a direct correct hit (not on a
      // merely-snapped correct target, so the snap can't reveal the answer), rose on a
      // full/wrong square so a bad target still reads as a bad target.
      let emis = 0x000000;
      if (dragging && picked && hoverSlot === sl) {
        const good = hoverKind === "correct" && hoverDirect;
        col = good ? ICE_MATCHED : 0xe45572;
        op = 1.0;
        emis = good ? 0x1d4a2c : 0x401512;
      }
      ud.edgeMat.color.setHex(col); ud.edgeMat.opacity = op; ud.frameMat.emissive.setHex(emis);
      ud.hint.visible = false;
    }

    for (const p of parts) {
      if (p.state === "online") {
        if (p.installT > 0) p.installT = Math.max(0, p.installT - dt);
        const ice = p.slateMesh?.userData.ice;
        if (ice) ice.rotation.y += dt * 0.45;
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
      // the ICE is the patience meter — it stays sealed, but ages lavender → amber →
      // rose and then visibly melts (shrinks + flickers) as the block runs out of time.
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
      rim.material.color.setHex(0xb9a7ff);
      rim.material.opacity = 0.45 + 0.3 * u;
      slot++;
    }

    // rack lamps: lavender means the subagent is docked/free, amber means out working
    for (let i = 0; i < droneRack.dockLights.length; i++) {
      const lamp = droneRack.dockLights[i];
      const busy = !!drones[i]?.busy;
      const pulse = 0.5 + 0.5 * Math.sin(t * (busy ? 7.0 : 2.4) + i);
      const color = busy ? GOLD : 0xd8ccff;
      lamp.material.color.setHex(color);
      lamp.material.emissive.setHex(color);
      lamp.material.emissiveIntensity = busy ? 0.9 + pulse * 0.85 : 1.0 + pulse * 0.28;
      lamp.scale.setScalar(busy ? 0.85 + pulse * 0.18 : 1.0 + pulse * 0.08);
    }

    // drones: fly to the slot, weld, then home; frozen work hits the belt when done
    for (const d of drones) {
      const ud = d.mesh.userData;
      const targetDroneScale = d.phase === "home" ? 1 : 0.62;
      const droneScale = d.mesh.scale.x + (targetDroneScale - d.mesh.scale.x) * Math.min(1, dt * 7);
      d.mesh.scale.setScalar(droneScale);
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
          if (d.phase === "out") {
            d.phase = "work";
            const fixTime = (d.part.data.fix ?? PART_FIX_FALLBACK) + Math.random() * PART_FIX_JITTER;
            d.part.fixT = practiceMode && d.part.idx === PRACTICE_PART_IDX ? Math.min(fixTime, PRACTICE_FIX_TIME) : fixTime;
          }
          else { const wasPart = d.part; d.phase = "home"; d.busy = false; d.part = null; d.mesh.position.copy(d.home); void wasPart; }
        }
      } else if (d.phase === "work") {
        d.part.fixT = Math.max(0, d.part.fixT - dt);
        ud.bodyMat.emissiveIntensity = 1.2 + 0.6 * Math.sin(t * 10);
        if (Math.random() < dt * 14) { const tip = ud.craft.getWorldPosition(new THREE.Vector3()); tip.y -= 0.8; spawnSpark(tip, GOLD, 4); }
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

    updateTutorialFocus(t);
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
    termEl?.classList.add("is-drone-bay-terminal");
    setControls(); updateSystems(); renderWinReport();
    if (modePromptState) showModePrompt(modePromptState);
    else if (!started) showBriefing();
    else if (practiceMode) {
      timerRunning = false;
      if (lessonKey) renderRepairLesson(lessonKey);
    }
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
    hideLeaderboard();
    modePrompt?.classList.add("hidden"); missionLesson?.classList.add("hidden");
    dbHud?.classList.add("hidden"); fpShared?.classList.add("hidden"); boardEl?.classList.add("hidden");
    termEl?.classList.remove("is-drone-bay-terminal");
  }
  function resize() { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); }

  return { scene, get camera() { return camera; }, update, enter, exit, resize, skipToEnd };
}
