import * as THREE from "three";
import { createTerrain } from "./terrain.js";
import { makeBeamTexture } from "./memoryProps.js";
import { SYSTEMS, UPGRADE_BUILDERS } from "./droneBayView.js";

// LEVEL 3 ("Launch Clearance") — the finale. The ship is rebuilt; now it has
// to fly. The player sits in the pilot's chair for the first time, and the
// whole level happens at one console — no walking.
//
// The launch computer won't arm on work nobody can account for, and most of
// today's work the player never watched (the subagents did it). So the ship's
// AI — the amnesiac from Level 1, now running on the memory the player banked
// for it — asks five questions only the record can answer:
//
//   the ship asks in plain words            → you provably don't know
//   pick a way to look it up (1/2/3)        → command or skill, your call
//   it runs visibly, answers in its voice   → raw card vs. one plain sentence
//   pick the answer — it's on screen        → a launch-code segment locks
//   five segments → ignition → LIFTOFF      → the game's ending
//
// Menu rule: mostly ALL VALID (different lenses on the same truth), with the
// occasional polite dead end that costs only clock seconds and teaches the
// tool's boundary. Failure lives in the launch window, nowhere else.

const TOTAL_TIME = 150;      // seconds of launch window (tunable)
const LOW_TIME = 45;         // clock turns urgent under this
const CRIT_TIME = 15;        // clock goes CRITICAL under this
const PANIC_TIME = 45;       // the SKY starts shifting toward panic-red
const NEXT_DELAY = 1.6;      // seconds between a confirm and the next question
const LIFT_DUR = 9;          // seconds of liftoff before the win screen

// Sky palette — calm/panic as in L1/L2, plus the space we lift into.
const SKY_CALM  = new THREE.Color(0x2a2350);
const SKY_PANIC = new THREE.Color(0x6e0f16);
const FOG_PANIC = new THREE.Color(0x4a0a0e);
const DOME_CALM = new THREE.Color(0x3a3168);
const DOME_PANIC = new THREE.Color(0x7a141c);
const SUN_CALM  = new THREE.Color(0xfff1dc);
const SUN_PANIC = new THREE.Color(0xff5a3c);
const SKY_SPACE = new THREE.Color(0x040310);
const DOME_SPACE = new THREE.Color(0x070518);

// Where the ship sits — the cockpit looks out over the island from here.
// Eye height node-verified: at 19 all five upgrades clear the dunes.
const RIG_POS = { x: -4, z: 66 };
const RIG_EYE = 19;

// The full record Level 3 quizzes: Level 1's three banked memories (ids match
// the Archive's continuity touch) plus Level 2's five subagent repairs.
const L1_RECORD = [
  ["31f0cafe4d12", "recovered: abandoned EVA helmet"],
  ["7e11a2b09c44", "recovered: torn logbook page"],
  ["b0a7ded51a6e", "recovered: cracked nav panel"],
];
const RECORD_TOTAL = L1_RECORD.length + SYSTEMS.length; // 8

// ---------- the five pre-flight questions ----------
// Each tool: label (what the menu shows), echo (what "runs" at the prompt),
// rows ([key, value] output lines), ok (false = dead end), note (the flash).
// `site` = which upgrade flares on confirm (index into SYSTEMS, or null).
function cardRows(sys) {
  return [["checkpoint", sys.ckpt], ...sys.card];
}
const ANTENNA = SYSTEMS[2], COILS = SYSTEMS[0], STRUTS = SYSTEMS[4];

const QUESTIONS = [
  {
    q: "First check — the long-range antenna. The log says the rebuild wasn't simple. How many attempts did it take?",
    site: 2,
    tools: [
      {
        label: `entire checkpoint explain ${ANTENNA.ckpt}`,
        echo: `entire checkpoint explain ${ANTENNA.ckpt}`,
        ok: true, rows: cardRows(ANTENNA),
        note: "the raw record — the answer is in there",
      },
      {
        label: "Skill: what-happened — ask in plain language",
        echo: "what happened to the antenna?",
        ok: true, rows: [
          ["ran", `entire checkpoint explain ${ANTENNA.ckpt}`],
          ["answer", "subagent-3 respun the mast into a signal spire — it took 3 attempts; the first two fell over."],
        ],
        note: "the skill ran the command for you",
      },
      {
        label: "entire dispatch",
        echo: "entire dispatch",
        ok: false, rows: [
          ["DISPATCH", "day report — 5 systems repaired, 5 checkpoints filed"],
        ],
        note: "the day's report counts systems, not attempts — try another way",
      },
    ],
    answers: ["2", "3", "5"], correct: 1,
  },
  {
    q: "Something on this ship is built from salvaged hull plate. Which system?",
    site: 0,
    tools: [
      {
        label: `entire checkpoint search "hull plate"`,
        echo: `entire checkpoint search "hull plate"`,
        ok: true, rows: [
          ["search", `1 match for "hull plate"`],
          [COILS.ckpt, "ignition coils → Plasma Ring — rebuilt from salvaged hull plate ×3"],
        ],
        note: "one typed phrase, one match — that's search",
      },
      {
        label: "Skill: recall — ask in plain language",
        echo: "what did we build from hull plate?",
        ok: true, rows: [
          ["ran", `entire checkpoint search "hull plate"`],
          ["answer", "the ignition coils — subagent-1 rebuilt them as a plasma ring from salvaged hull plate."],
        ],
        note: "the skill searched the record for you",
      },
      {
        label: "entire checkpoint explain",
        echo: "entire checkpoint explain",
        ok: false, rows: [
          ["error", "explain needs a checkpoint id — and which one is exactly the question"],
        ],
        note: "when you don't know WHERE, search is the tool",
      },
    ],
    answers: ["NAV CORE", "IGNITION COILS", "LANDING STRUTS"], correct: 1,
  },
  {
    q: "Cross-check the manifest: how many checkpoints does the ship's record hold, all told?",
    site: null,
    tools: [
      {
        label: "entire checkpoint list",
        echo: "entire checkpoint list",
        ok: true, rows: [
          ...L1_RECORD,
          ...SYSTEMS.map((s) => [s.ckpt, `subagent fix: ${s.name.toLowerCase()} → ${s.became}`]),
          ["total", `${RECORD_TOTAL} checkpoints`],
        ],
        note: "the whole record, oldest first",
      },
      {
        label: "Skill: recall — ask in plain language",
        echo: "how big is the ship's record?",
        ok: true, rows: [
          ["ran", "entire checkpoint list"],
          ["answer", "eight checkpoints — three memories you banked after the crash, five subagent repairs."],
        ],
        note: "the skill counted for you",
      },
      {
        label: `entire checkpoint search "everything"`,
        echo: `entire checkpoint search "everything"`,
        ok: false, rows: [
          ["search", `0 matches for "everything"`],
        ],
        note: "search finds topics — for the whole record, list it",
      },
    ],
    answers: ["5", "8", "13"], correct: 1,
  },
  {
    q: "Pre-flight flags the landing gear: this ship doesn't have legs anymore. Why does the ship float?",
    site: 4,
    tools: [
      {
        label: `entire checkpoint explain ${STRUTS.ckpt}`,
        echo: `entire checkpoint explain ${STRUTS.ckpt}`,
        ok: true, rows: cardRows(STRUTS),
        note: "the raw record — read it and believe it",
      },
      {
        label: "Skill: what-happened — ask in plain language",
        echo: "why does the ship float?",
        ok: true, rows: [
          ["ran", `entire checkpoint explain ${STRUTS.ckpt}`],
          ["answer", "the strut had seized solid — subagent-5 swapped it for grav skids. torque spec: vibes."],
        ],
        note: "the skill went and asked the checkpoint",
      },
      {
        label: "entire checkpoint list",
        echo: "entire checkpoint list",
        ok: false, rows: [
          [STRUTS.ckpt, "subagent fix: landing struts → Grav Skid"],
        ],
        note: "list says WHAT changed — for WHY, go one level deeper",
      },
    ],
    answers: [
      "the struts became grav skids",
      "a fuel leak lightened the hull",
      "the nav core recalibrated gravity",
    ], correct: 0,
  },
  {
    // The ceremonial closer, like L1's list and L2's dispatch: nothing to
    // learn, one Enter — filing the flight log IS the final confirmation.
    q: "Last item. File the flight log — everything the crew did to make this ship fly.",
    site: null,
    single: {
      label: "entire dispatch",
      rows: [
        ["DISPATCH", "flight log — planetfall recovery"],
        ...SYSTEMS.map((s) => ["·", `${s.name.toLowerCase()} → ${s.became} (${s.ckpt.slice(0, 6)}…)`]),
        ["filed", `from ${RECORD_TOTAL} checkpoints · crew: 1 human, 5 subagents, 1 ship`],
        ["cleared", "launch code complete — ignition"],
      ],
    },
  },
];

export function createLaunchView(renderer, { onExit } = {}) {
  // ---------- scene & sky ----------
  const scene = new THREE.Scene();
  scene.background = SKY_CALM.clone();
  scene.fog = new THREE.Fog(SKY_CALM.clone(), 90, 420);

  const camera = new THREE.PerspectiveCamera(
    62, window.innerWidth / window.innerHeight, 0.1, 2400
  );

  // ---------- lighting ----------
  scene.add(new THREE.HemisphereLight(0xcdbcff, 0x3a2f5e, 0.7));
  const sun = new THREE.DirectionalLight(SUN_CALM, 1.5);
  sun.position.set(60, 90, 40);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0x6a5a92, 0.3));

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1100, 32, 16),
    new THREE.MeshBasicMaterial({ color: DOME_CALM.clone(), side: THREE.BackSide, fog: false })
  );
  scene.add(dome);

  // ---------- the same island, seen from the chair ----------
  const terrain = createTerrain({ size: 200, segments: 220, maxHeight: 26, seed: 1337 });
  scene.add(terrain.mesh, terrain.water);

  const beamTex = makeBeamTexture();

  // The five upgrades stand where Level 2 left them — already online, alive.
  // Each carries a gold confirm beam that fires when its question clears.
  const sites = SYSTEMS.map((sys, idx) => {
    const anchor = new THREE.Group();
    anchor.position.set(sys.pos.x, terrain.heightAt(sys.pos.x, sys.pos.z), sys.pos.z);
    const model = sys.upgrade === "buildSignalSpire"
      ? UPGRADE_BUILDERS.buildSignalSpire(beamTex)
      : UPGRADE_BUILDERS[sys.upgrade]();
    const anim = model.userData.anim;
    if (anim?.type === "spire") anim.beam.visible = true;   // online since L2
    anchor.add(model);

    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.7, 70, 12, 1, true),
      new THREE.MeshBasicMaterial({
        map: beamTex, color: 0xffd27a, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        fog: false,
      })
    );
    beam.position.y = 35;
    beam.visible = false;
    anchor.add(beam);
    scene.add(anchor);
    return { sys, idx, anchor, model, beam, flareT: 0, confirmed: false };
  });

  // ---------- the cockpit ----------
  // A fixed rig: the camera (plus the window frame glued to it) sits above the
  // bay looking out over the island. The frame is simple slabs — enough to say
  // "you're inside the ship" without modeling a ship.
  const rig = new THREE.Group();
  const rigGroundY = terrain.heightAt(RIG_POS.x, RIG_POS.z);
  rig.position.set(RIG_POS.x, rigGroundY + RIG_EYE, RIG_POS.z);
  rig.add(camera);
  scene.add(rig);
  camera.lookAt(0, terrain.heightAt(0, 0) + 4, -8);
  const baseRotX = camera.rotation.x;
  const baseRotY = camera.rotation.y;

  const HULL = new THREE.MeshStandardMaterial({ color: 0x141826, metalness: 0.55, roughness: 0.5 });
  const cockpit = new THREE.Group();
  const dash = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.5, 0.8), HULL);
  dash.position.set(0, -1.06, -1.55);
  dash.rotation.x = 0.22;
  const dashGlow = new THREE.Mesh(
    new THREE.BoxGeometry(3.0, 0.05, 0.05),
    new THREE.MeshBasicMaterial({ color: 0x6fe3ff, transparent: true, opacity: 0.85 })
  );
  dashGlow.position.set(0, -0.82, -1.42);
  const header = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.42, 0.12), HULL);
  header.position.set(0, 1.28, -1.7);
  const pillarL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.6, 0.12), HULL);
  pillarL.position.set(-1.72, 0.1, -1.7);
  pillarL.rotation.z = 0.1;
  const pillarR = pillarL.clone();
  pillarR.position.x = 1.72;
  pillarR.rotation.z = -0.1;
  cockpit.add(dash, dashGlow, header, pillarL, pillarR);
  camera.add(cockpit);
  const cabinLight = new THREE.PointLight(0x6fe3ff, 1.4, 7, 2);
  cabinLight.position.set(0, 0.2, -0.6);
  camera.add(cabinLight);

  // Stars for the climb out — invisible until the sky turns to space.
  const starGeo = new THREE.BufferGeometry();
  const starPts = new Float32Array(700 * 3);
  for (let i = 0; i < 700; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(950);
    starPts[i * 3] = v.x; starPts[i * 3 + 1] = Math.abs(v.y); starPts[i * 3 + 2] = v.z;
  }
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPts, 3));
  const starMat = new THREE.PointsMaterial({
    color: 0xdfe9ff, size: 2.2, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    sizeAttenuation: true,
  });
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);

  // ---------- HUD elements ----------
  const hud = document.getElementById("lc-hud");
  const briefingEl = document.getElementById("lc-briefing");
  const briefingStartBtn = document.getElementById("lc-briefing-start");
  const countdownEl = document.getElementById("lc-countdown");
  const countdownTime = document.getElementById("lc-countdown-time");
  const codeSegsEl = document.getElementById("lc-code-segs");
  const consoleEl = document.getElementById("lc-console");
  const speakerEl = document.getElementById("lc-speaker");
  const questionEl = document.getElementById("lc-question");
  const menuEl = document.getElementById("lc-menu");
  const outputEl = document.getElementById("lc-output");
  const answersEl = document.getElementById("lc-answers");
  const msgEl = document.getElementById("lc-msg");
  const winEl = document.getElementById("lc-win");
  const winSub = document.getElementById("lc-win-sub");
  const failEl = document.getElementById("lc-fail");

  let active = false;
  let started = false;
  let failed = false;
  let launched = false;        // ignition — the climb-out is running
  let won = false;
  let liftT = 0;
  let qIndex = 0;
  let phase = "menu";          // menu → chips → done (or "single" on the finale)
  let usedTool = null;         // which menu row ran (for dimming)
  let deadTools = new Set();
  let wrongChips = new Set();
  let nextTimer = null;
  let msgTimer = null;
  let timeLeft = TOTAL_TIME;
  let timerRunning = false;

  // Launch-code segments: one per question, showing the first hex of the
  // checkpoint that answered it (the finale's segment reads IGN).
  const segLabels = () => QUESTIONS.map((Q) => {
    if (!Q.done) return null;
    if (Q.single) return "IGN";
    return Q.site != null ? SYSTEMS[Q.site].ckpt.slice(0, 4) : "8/8 ";
  });
  function renderCode() {
    if (!codeSegsEl) return;
    const labels = segLabels();
    codeSegsEl.innerHTML = QUESTIONS.map((_, i) =>
      `<span class="lc-seg${labels[i] ? " is-locked" : ""}">${labels[i] ?? "····"}</span>`
    ).join("");
  }

  // ---------- console rendering ----------
  function flashMsg(text, ok) {
    if (!msgEl) return;
    clearTimeout(msgTimer);
    msgEl.textContent = text;
    msgEl.classList.remove("show-ok", "show-err");
    msgEl.classList.add(ok ? "show-ok" : "show-err");
    msgTimer = setTimeout(() => msgEl.classList.remove("show-ok", "show-err"), 3600);
  }
  function renderOutput(echo, rows, isSkill) {
    if (!outputEl) return;
    outputEl.innerHTML =
      `<div class="lc-row lc-echo"><span class="lc-prompt">${isSkill ? "you:" : "crashlog:~$"}</span>` +
      `<span class="lc-cmd">${echo}</span></div>` +
      rows.map(([k, v]) =>
        `<div class="lc-row"><span class="lc-k">${k}</span><span class="lc-v">${v}</span></div>`
      ).join("");
    outputEl.classList.remove("hidden");
  }
  function renderQuestion() {
    const Q = QUESTIONS[qIndex];
    if (speakerEl) speakerEl.textContent = `SHIP · PRE-FLIGHT ${qIndex + 1} / ${QUESTIONS.length}`;
    if (questionEl) questionEl.textContent = Q.q;
    outputEl?.classList.add("hidden");
    if (outputEl) outputEl.innerHTML = "";
    answersEl?.classList.add("hidden");
    if (answersEl) answersEl.innerHTML = "";
    if (Q.single) {
      phase = "single";
      if (menuEl) {
        menuEl.innerHTML =
          `<div class="lc-single"><span class="lc-prompt">crashlog:~$</span>` +
          `<span class="lc-cmd">${Q.single.label}</span><span class="lc-cursor"></span></div>` +
          `<div class="lc-single-cta"><span class="cta-label">PRESS</span>` +
          `<kbd class="cta-key cta-key-yes">Enter</kbd><span class="cta-note">file it</span></div>`;
        menuEl.classList.remove("hidden");
      }
    } else {
      phase = "menu";
      renderMenu();
    }
  }
  function renderMenu() {
    const Q = QUESTIONS[qIndex];
    if (!menuEl) return;
    menuEl.innerHTML = Q.tools.map((tool, i) => {
      const dead = deadTools.has(i);
      const used = usedTool === i;
      const skill = tool.label.startsWith("Skill:");
      return `<button type="button" class="lc-opt${dead ? " is-dead" : ""}${used ? " is-used" : ""}` +
        `${skill ? " is-skill" : ""}" data-tool="${i}" ${phase !== "menu" ? "disabled" : ""}>` +
        `<kbd>${i + 1}</kbd><span>${tool.label}</span></button>`;
    }).join("");
    menuEl.classList.remove("hidden");
  }
  function renderAnswers() {
    const Q = QUESTIONS[qIndex];
    if (!answersEl) return;
    answersEl.innerHTML =
      `<div class="lc-answers-head">CONFIRM FOR THE LAUNCH COMPUTER</div>` +
      Q.answers.map((a, i) =>
        `<button type="button" class="lc-chip${wrongChips.has(i) ? " is-wrong" : ""}" data-chip="${i}">` +
        `<kbd>${i + 1}</kbd><span>${a}</span></button>`
      ).join("");
    answersEl.classList.remove("hidden");
  }

  // ---------- the beats ----------
  function pickTool(i) {
    if (phase !== "menu") return;
    const Q = QUESTIONS[qIndex];
    const tool = Q.tools[i];
    if (!tool || deadTools.has(i)) return;
    const isSkill = tool.label.startsWith("Skill:");
    renderOutput(tool.echo, tool.rows, isSkill);
    if (tool.ok) {
      usedTool = i;
      phase = "chips";
      flashMsg(tool.note, true);
      renderMenu();        // re-render disabled/dimmed
      renderAnswers();
    } else {
      deadTools.add(i);
      flashMsg(tool.note, false);
      renderMenu();
    }
  }
  function pickChip(i) {
    if (phase !== "chips") return;
    const Q = QUESTIONS[qIndex];
    if (i < 0 || i >= Q.answers.length || wrongChips.has(i)) return;
    if (i !== Q.correct) {
      wrongChips.add(i);
      flashMsg("not what the record says — read it again", false);
      renderAnswers();
      return;
    }
    confirmQuestion();
  }
  function confirmQuestion() {
    const Q = QUESTIONS[qIndex];
    Q.done = true;
    phase = "done";
    if (Q.site != null) {
      const s = sites[Q.site];
      s.confirmed = true;
      s.flareT = 0;
      s.beam.visible = true;
      flashMsg(`confirmed — ${SYSTEMS[Q.site].became} accounted for, segment locked`, true);
    } else {
      flashMsg("confirmed — segment locked", true);
    }
    renderCode();
    answersEl?.classList.add("hidden");
    menuEl?.classList.add("hidden");
    if (qIndex + 1 < QUESTIONS.length) {
      nextTimer = setTimeout(() => {
        qIndex += 1;
        usedTool = null;
        deadTools = new Set();
        wrongChips = new Set();
        renderQuestion();
      }, NEXT_DELAY * 1000);
    }
  }
  function fileFlightLog() {
    if (phase !== "single" || launched) return;
    const Q = QUESTIONS[qIndex];
    Q.done = true;
    phase = "done";
    renderOutput(Q.single.label, Q.single.rows, false);
    menuEl?.classList.add("hidden");
    renderCode();
    flashMsg("flight log filed — ignition", true);
    timerRunning = false;
    countdownEl?.classList.remove("is-low", "is-critical");
    for (const s of sites) { s.confirmed = true; s.beam.visible = true; s.flareT = 0; }
    nextTimer = setTimeout(() => {
      launched = true;
      liftT = 0;
      consoleEl?.classList.add("hidden");
    }, 2200);
  }

  // ---------- clock / sky ----------
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
  function applySky() {
    if (launched || won) {
      const k = Math.min(1, rig.position.y / 380);
      scene.background.copy(SKY_CALM).lerp(SKY_SPACE, k);
      scene.fog.color.copy(SKY_CALM).lerp(SKY_SPACE, k);
      dome.material.color.copy(DOME_CALM).lerp(DOME_SPACE, k);
      starMat.opacity = k;
      return;
    }
    const p = panicFactor();
    scene.background.copy(SKY_CALM).lerp(SKY_PANIC, p);
    scene.fog.color.copy(SKY_CALM).lerp(FOG_PANIC, p);
    dome.material.color.copy(DOME_CALM).lerp(DOME_PANIC, p);
    sun.color.copy(SUN_CALM).lerp(SUN_PANIC, p * 0.85);
  }

  // ---------- briefing / win / fail / reset ----------
  function showBriefing() {
    timerRunning = false;
    briefingEl?.classList.remove("hidden");
    consoleEl?.classList.add("hidden");
  }
  function startLevel() {
    if (started) return;
    started = true;
    briefingEl?.classList.add("hidden");
    consoleEl?.classList.remove("hidden");
    timeLeft = TOTAL_TIME;
    timerRunning = true;
    updateClock();
    renderCode();
    renderQuestion();
  }
  briefingStartBtn?.addEventListener("click", startLevel);

  function failLevel() {
    if (failed || launched) return;
    failed = true;
    timerRunning = false;
    clearTimeout(nextTimer);
    countdownEl?.classList.remove("is-low", "is-critical");
    consoleEl?.classList.add("hidden");
    failEl?.classList.remove("hidden");
  }
  function resetLevel() {
    failed = false;
    launched = false;
    won = false;
    liftT = 0;
    qIndex = 0;
    phase = "menu";
    usedTool = null;
    deadTools = new Set();
    wrongChips = new Set();
    clearTimeout(nextTimer);
    for (const Q of QUESTIONS) Q.done = false;
    for (const s of sites) {
      s.confirmed = false;
      s.flareT = 0;
      s.beam.visible = false;
      s.beam.material.opacity = 0;
    }
    rig.position.y = rigGroundY + RIG_EYE;
    camera.rotation.x = baseRotX;
    camera.rotation.y = baseRotY;
    starMat.opacity = 0;
    sun.intensity = 1.5;
    scene.fog.far = 420;
    failEl?.classList.add("hidden");
    winEl?.classList.add("hidden");
    consoleEl?.classList.remove("hidden");
    timeLeft = TOTAL_TIME;
    timerRunning = true;
    updateClock();
    renderCode();
    renderQuestion();
  }

  // ---------- input ----------
  function onKeyDown(e) {
    if (!active) return;
    if (!started) {
      if (e.code === "Enter" || e.code === "Space") { startLevel(); e.preventDefault(); }
      return;
    }
    if (failed) {
      if (e.code === "KeyR") { resetLevel(); e.preventDefault(); }
      return;
    }
    if (won || launched) {
      if (won && e.code === "KeyB") onExit?.();
      return;
    }
    if (phase === "single" && e.code === "Enter") { fileFlightLog(); e.preventDefault(); return; }
    if (e.key >= "1" && e.key <= "3") {
      const i = Number(e.key) - 1;
      if (phase === "menu") pickTool(i);
      else if (phase === "chips") pickChip(i);
      e.preventDefault();
      return;
    }
    if (e.code === "KeyB") onExit?.();
  }
  menuEl?.addEventListener("click", (e) => {
    if (!active || failed || launched) return;
    const btn = e.target.closest?.("[data-tool]");
    if (btn) pickTool(Number(btn.dataset.tool));
    else if (phase === "single" && e.target.closest?.(".lc-single, .lc-single-cta")) fileFlightLog();
  });
  answersEl?.addEventListener("click", (e) => {
    if (!active || failed || launched) return;
    const btn = e.target.closest?.("[data-chip]");
    if (btn) pickChip(Number(btn.dataset.chip));
  });

  // ---------- per-frame ----------
  function update(dt, t) {
    if (active && timerRunning && started && !failed && !launched) {
      timeLeft = Math.max(0, timeLeft - dt);
      updateClock();
      if (timeLeft <= 0) failLevel();
    }
    applySky();

    // The upgrades stay alive, exactly as Level 2 left them.
    for (const s of sites) {
      const anim = s.model.userData.anim;
      if (anim?.type === "ring") {
        anim.ring.rotation.y += dt * 0.8;
        anim.ring.position.y = 3.4 + Math.sin(t * 1.6) * 0.2;
      } else if (anim?.type === "dome") {
        anim.field.rotation.y += dt * 0.25;
        anim.orbit.rotation.z += dt * 0.6;
      } else if (anim?.type === "skid") {
        anim.pad.position.y = 1.6 + Math.sin(t * 1.8) * 0.25;
      }
      // Gold confirm flare: quick bloom, then settles to a steady glow.
      if (s.confirmed) {
        s.flareT += dt;
        const settle = 0.28 + Math.sin(t * 2.2 + s.idx) * 0.04;
        const bloom = Math.max(0, 1 - s.flareT / 2.5) * 0.5;
        s.beam.material.opacity = settle + bloom;
      }
    }

    if (launched && !won) {
      // Ignition: the island falls away, the sky becomes space.
      liftT += dt;
      const v = Math.min(46, 6 + liftT * 9);
      rig.position.y += v * dt;
      camera.rotation.x = baseRotX - Math.min(0.5, liftT * 0.07);
      camera.rotation.z = Math.sin(t * 1.3) * 0.004;
      scene.fog.far = Math.min(2200, 420 + liftT * 320);
      sun.intensity = Math.max(0.6, 1.5 - liftT * 0.1);
      if (liftT >= LIFT_DUR) {
        won = true;
        if (winSub) winSub.textContent =
          `${RECORD_TOTAL} checkpoints · ${QUESTIONS.length} questions · 0 guesses`;
        winEl?.classList.remove("hidden");
      }
    } else if (!failed && !won) {
      // Idle cockpit sway — alive, not nauseating.
      camera.rotation.x = baseRotX + Math.sin(t * 0.7) * 0.006;
      camera.rotation.y = baseRotY + Math.sin(t * 0.45) * 0.008;
    }
  }

  // ---------- lifecycle ----------
  function enter() {
    active = true;
    window.addEventListener("keydown", onKeyDown);
    hud?.classList.remove("hidden");
    if (!started) {
      showBriefing();
    } else if (won) {
      winEl?.classList.remove("hidden");
    } else if (failed) {
      resetLevel();                 // came back after a miss → fresh window
    } else if (!launched) {
      consoleEl?.classList.remove("hidden");
      timerRunning = true;          // resume the window clock
    }
    updateClock();
    renderCode();
    applySky();
  }
  function exit() {
    active = false;
    timerRunning = false;           // the window politely waits in orbit
    clearTimeout(nextTimer);
    window.removeEventListener("keydown", onKeyDown);
    hud?.classList.add("hidden");
    briefingEl?.classList.add("hidden");
    consoleEl?.classList.add("hidden");
    winEl?.classList.add("hidden");
    failEl?.classList.add("hidden");
  }
  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }

  return { scene, camera, update, enter, exit, resize };
}
