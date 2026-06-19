import * as THREE from "three";
import { createTerrain } from "./terrain.js";
import { makeBeamTexture } from "./memoryProps.js";
import { SYSTEMS, UPGRADE_BUILDERS } from "./droneBayView.js";
import { LEVEL_ONE_ARCHIVE_ROWS } from "./levelOneRecords.js";
import { createLeaderboardEntry } from "./leaderboard.js";
import { createLeaderboardPanel } from "./leaderboardPanel.js";

// LEVEL 3 ("Launch Clearance") — the finale. The ship is rebuilt; now it has
// to fly. The player sits in the pilot's chair for the first time, and the
// whole level happens at one console — no walking.
//
// The launch computer won't arm on work nobody can account for, and most of
// today's work the player never watched (the subagents did it). So the ship's
// AI — the amnesiac from Level 1, now running on the memory the player banked
// for it — asks three questions only the record can answer:
//
//   the ship asks in plain words            → you provably don't know
//   pick a way to look it up (1/2/3)        → command or skill, your call
//   it runs visibly, answers in its voice   → raw card vs. one plain sentence
//   pick the answer — it's on screen        → a launch-code segment locks
//   three segments → ignition → LIFTOFF     → the game's ending
//
// Menu rule: mostly ALL VALID (different lenses on the same truth), with the
// occasional polite dead end that costs only clock seconds and teaches the
// tool's boundary. Failure lives in the launch window, nowhere else.

const TOTAL_TIME = 90;       // seconds of launch window (tunable)
const LOW_TIME = 30;         // clock turns urgent under this
const CRIT_TIME = 10;        // clock goes CRITICAL under this
const PANIC_TIME = 30;       // the SKY starts shifting toward panic-red
const NEXT_DELAY = 1.6;      // seconds between a confirm and the next question
const IGN_DUR = 3;           // seconds of 3-2-1 before ignition
const LIFT_DUR = 9;          // seconds of liftoff before the win screen
const ANSWER_KEYS = ["A", "B", "C"];

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
  ...LEVEL_ONE_ARCHIVE_ROWS,
];
const RECORD_TOTAL = L1_RECORD.length + SYSTEMS.length; // 8

// Onboarding — short story beats, advanced with Space.
const BRIEFING_BEATS = [
  "The ship is rebuilt. To launch, you need clearance.",
  "Run the right commands to read the records, and use what you find to answer the pre-flight questions.",
];

// ---------- the three pre-flight questions ----------
// Each tool: label (what the menu shows), echo (what "runs" at the prompt),
// rows ([key, value] output lines), ok (false = dead end), note (the flash).
// `site` = which upgrade flares on confirm (index into SYSTEMS, or null).
const ANTENNA = SYSTEMS[2];

const QUESTIONS = [
  {
    q: "How many attempts did it take to repair the antenna?",
    site: 2,
    tools: [
      {
        label: `entire checkpoint explain ${ANTENNA.ckpt}`,
        echo: `entire checkpoint explain ${ANTENNA.ckpt}`,
        ok: true, rows: [
          ["Intent:", "Repair the long-range antenna."],
          ["Outcome:", "Rebuilt the antenna after 3 attempts. The first 2 fell over."],
        ],
        note: "the raw record — the answer is in there",
      },
      {
        label: "Skill: what-happened",
        echo: "what happened to the antenna?",
        ok: true, rows: [
          ["", "The antenna repair took 3 attempts. The first 2 fell over."],
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
    answers: ["3", "2", "5"], correct: 0,
  },
  {
    q: "How many stars did the steering repair map?",
    site: 1,
    tools: [
      {
        label: `entire checkpoint search "stars"`,
        echo: `entire checkpoint search "stars"`,
        ok: true, rows: [
          ["", "1 match found"],
          ["", "Subagent-2 rebuilt the steering controls and mapped 412 stars."],
        ],
        note: "search found the matching record",
      },
      {
        label: "Skill: recall",
        echo: "how many stars did the steering repair map?",
        ok: true, rows: [
          ["", "Subagent-2 mapped 412 stars."],
        ],
        note: "the skill summarized the record for you",
      },
      {
        label: "entire checkpoint explain",
        echo: "entire checkpoint explain",
        ok: false, rows: [
          ["error", "explain needs a checkpoint id — search first to find the right record"],
        ],
        note: "search first, then explain when you have the record",
      },
    ],
    answers: ["112", "520", "412"], correct: 2,
  },
  {
    q: "How many records did the ship recover?",
    site: null,
    tools: [
      {
        label: "entire checkpoint list",
        echo: "entire checkpoint list",
        ok: true, dense: true, columns: true, rows: [
          ...L1_RECORD,
          [SYSTEMS[0].ckpt, "repair: engine"],
          [SYSTEMS[1].ckpt, "repair: steering"],
          [SYSTEMS[2].ckpt, "repair: antenna"],
          [SYSTEMS[3].ckpt, "repair: air"],
          [SYSTEMS[4].ckpt, "repair: landing"],
          ["total", `${RECORD_TOTAL} records`],
        ],
        note: "the list counted the records",
      },
      {
        label: "Skill: recall",
        echo: "how many records did the ship recover?",
        ok: true, rows: [
          ["", `The ship recovered ${RECORD_TOTAL} records: 3 memories and 5 repairs.`],
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
];

export function createLaunchView(renderer, { onExit, onComplete, onNext, onNewGame } = {}) {
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

  // Fireworks for the climb out — gold and lavender bursts the island sends
  // up past the window. A small recycled pool of Points clouds.
  const bursts = Array.from({ length: 6 }, () => {
    const n = 70;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffd27a, size: 1.7, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    });
    const pts = new THREE.Points(geo, mat);
    pts.visible = false;
    scene.add(pts);
    return { pts, vel: new Float32Array(n * 3), t: 0, dur: 1.7, active: false };
  });
  function fireBurst(b) {
    b.active = true;
    b.t = 0;
    b.pts.material.color.setHex(Math.random() < 0.55 ? 0xffd27a : 0xcdbcff);
    // Scatter around / below the window so they whoosh past as the ship climbs.
    const cx = rig.position.x + (Math.random() - 0.5) * 140;
    const cy = rig.position.y - 8 + (Math.random() - 0.5) * 60;
    const cz = rig.position.z - 50 - Math.random() * 90;
    const pos = b.pts.geometry.attributes.position.array;
    for (let i = 0; i < pos.length; i += 3) {
      pos[i] = cx; pos[i + 1] = cy; pos[i + 2] = cz;
      const v = new THREE.Vector3().randomDirection().multiplyScalar(9 + Math.random() * 15);
      b.vel[i] = v.x; b.vel[i + 1] = v.y; b.vel[i + 2] = v.z;
    }
    b.pts.geometry.attributes.position.needsUpdate = true;
    b.pts.visible = true;
  }
  function updateBursts(dt) {
    for (const b of bursts) {
      if (!b.active) continue;
      b.t += dt;
      if (b.t >= b.dur) { b.active = false; b.pts.visible = false; continue; }
      const pos = b.pts.geometry.attributes.position.array;
      for (let i = 0; i < pos.length; i += 3) {
        pos[i] += b.vel[i] * dt;
        pos[i + 1] += (b.vel[i + 1] -= 5 * dt) * dt;
        pos[i + 2] += b.vel[i + 2] * dt;
      }
      b.pts.geometry.attributes.position.needsUpdate = true;
      b.pts.material.opacity = 0.95 * (1 - b.t / b.dur);
    }
  }
  function resetBursts() {
    for (const b of bursts) { b.active = false; b.pts.visible = false; b.pts.material.opacity = 0; }
  }

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
  const briefingTextEl = document.getElementById("lc-briefing-text");
  const briefingNextEl = document.getElementById("lc-briefing-next");
  const countdownEl = document.getElementById("lc-countdown");
  const countdownTime = document.getElementById("lc-countdown-time");
  const codeSegsEl = document.getElementById("lc-code-segs");
  const consoleEl = document.getElementById("lc-console");
  const questionEl = document.getElementById("lc-question");
  const menuEl = document.getElementById("lc-menu");
  const outputEl = document.getElementById("lc-output");
  const answersEl = document.getElementById("lc-answers");
  const msgEl = document.getElementById("lc-msg");
  const ignitionEl = document.getElementById("lc-ignition");
  const flashEl = document.getElementById("lc-flash");
  const winEl = document.getElementById("lc-win");
  const winSub = document.getElementById("lc-win-sub");
  const winNext = document.getElementById("lc-win-next");
  const failEl = document.getElementById("lc-fail");
  const leaderboardPanel = createLeaderboardPanel({ mount: hud, onClose: hideLeaderboard });

  let active = false;
  let started = false;
  let failed = false;
  let igniting = false;        // the 3-2-1 — rumble building
  let ignT = 0;
  let ignTick = -1;            // which number is on screen (re-pops the CSS)
  let launched = false;        // ignition — the climb-out is running
  let won = false;
  let liftT = 0;
  let burstTimer = 0;
  let qIndex = 0;
  let briefingIndex = 0;
  let phase = "menu";          // menu → chips → done
  let usedTool = null;         // which menu row ran (for dimming)
  let deadTools = new Set();
  let wrongChips = new Set();
  let mistakes = 0;
  let nextTimer = null;
  let msgTimer = null;
  let timeLeft = TOTAL_TIME;
  let timerRunning = false;
  let completionNotified = false;

  // Launch-code segments: one per question, showing the first hex of the
  // checkpoint that answered it.
  const segLabels = () => QUESTIONS.map((Q) => {
    if (!Q.done) return null;
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
  function renderRows(rows, columns = false) {
    if (!columns) {
      return rows.map(([k, v]) =>
        k
          ? `<div class="lc-row"><span class="lc-k">${k}</span><span class="lc-v">${v}</span></div>`
          : `<div class="lc-row lc-row-full"><span class="lc-v">${v}</span></div>`
      ).join("");
    }
    const totalRow = rows.find(([k]) => k === "total");
    const listRows = rows.filter(([k]) => k !== "total");
    return `<div class="lc-list-grid">` +
      listRows.map(([k, v]) =>
        `<div class="lc-row"><span class="lc-k">${k}</span><span class="lc-v">${v}</span></div>`
      ).join("") +
      `</div>` +
      (totalRow ? `<div class="lc-row lc-row-total"><span class="lc-k">${totalRow[0]}</span><span class="lc-v">${totalRow[1]}</span></div>` : "");
  }
  function renderOutput(echo, rows, isSkill, dense = false, columns = false) {
    if (!outputEl) return;
    outputEl.classList.toggle("is-dense", dense);
    outputEl.innerHTML =
      `<div class="lc-row lc-echo"><span class="lc-prompt">$</span>` +
      `<span class="lc-cmd">${echo}</span></div>` +
      renderRows(rows, columns);
    outputEl.classList.remove("hidden");
  }
  function renderQuestion() {
    const Q = QUESTIONS[qIndex];
    if (questionEl) questionEl.textContent = Q.q;
    outputEl?.classList.add("hidden");
    outputEl?.classList.remove("is-dense");
    if (outputEl) outputEl.innerHTML = "";
    answersEl?.classList.add("hidden");
    if (answersEl) answersEl.innerHTML = "";
    phase = "menu";
    renderMenu();
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
        `<kbd>${ANSWER_KEYS[i] ?? i + 1}</kbd><span>${a}</span></button>`
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
    renderOutput(tool.echo, tool.rows, isSkill, !!tool.dense, !!tool.columns);
    if (tool.ok) {
      usedTool = i;
      phase = "chips";
      flashMsg(tool.note, true);
      renderMenu();        // re-render disabled/dimmed
      renderAnswers();
    } else {
      deadTools.add(i);
      mistakes += 1;
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
      mistakes += 1;
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
    } else {
      beginIgnition();
    }
  }
  function beginIgnition() {
    if (launched || igniting) return;
    flashMsg("launch clearance granted — ignition", true);
    timerRunning = false;
    countdownEl?.classList.remove("is-low", "is-critical");
    // The island salutes: every system's beam fires at full power.
    for (const s of sites) { s.confirmed = true; s.beam.visible = true; s.flareT = 0; }
    nextTimer = setTimeout(() => {
      consoleEl?.classList.add("hidden");
      igniting = true;
      ignT = 0;
      ignTick = -1;
    }, 1400);
  }
  function setIgnitionText(text, big) {
    if (!ignitionEl) return;
    ignitionEl.textContent = text;
    ignitionEl.classList.remove("hidden", "pop", "is-go");
    void ignitionEl.offsetWidth;          // restart the pop animation
    ignitionEl.classList.add("pop");
    if (big) ignitionEl.classList.add("is-go");
  }
  function igniteNow() {
    igniting = false;
    launched = true;
    liftT = 0;
    burstTimer = 0.2;
    setIgnitionText("IGNITION", true);
    flashEl?.classList.remove("show");
    void flashEl?.offsetWidth;
    flashEl?.classList.add("show");
    setTimeout(() => ignitionEl?.classList.add("hidden"), 1300);
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
  function restartTextAnimation(el) {
    if (!el) return;
    el.classList.remove("beat-in");
    void el.offsetWidth;
    el.classList.add("beat-in");
  }
  function renderBriefingBeat() {
    if (!briefingTextEl) return;
    briefingTextEl.textContent = BRIEFING_BEATS[briefingIndex] || "";
    restartTextAnimation(briefingTextEl);
    if (briefingNextEl) {
      briefingNextEl.textContent = briefingIndex < BRIEFING_BEATS.length - 1 ? "to continue" : "to begin";
    }
  }
  function advanceBriefing() {
    if (started) return;
    if (briefingIndex < BRIEFING_BEATS.length - 1) {
      briefingIndex += 1;
      renderBriefingBeat();
      return;
    }
    startLevel();
  }
  function showBriefing() {
    timerRunning = false;
    hideLeaderboard();
    briefingIndex = 0;
    renderBriefingBeat();
    briefingEl?.classList.remove("hidden");
    consoleEl?.classList.add("hidden");
  }
  function startLevel() {
    if (started) return;
    started = true;
    hideLeaderboard();
    briefingEl?.classList.add("hidden");
    consoleEl?.classList.remove("hidden");
    timeLeft = TOTAL_TIME;
    timerRunning = true;
    updateClock();
    renderCode();
    renderQuestion();
  }
  briefingEl?.addEventListener("click", () => { if (active && !started) advanceBriefing(); });

  function failLevel() {
    if (failed || launched) return;
    failed = true;
    timerRunning = false;
    clearTimeout(nextTimer);
    countdownEl?.classList.remove("is-low", "is-critical");
    consoleEl?.classList.add("hidden");
    failEl?.classList.remove("hidden");
    showLeaderboard("loss");
  }
  function revealWin() {
    if (!completionNotified) {
      completionNotified = true;
      onComplete?.();
    }
    if (winSub) winSub.textContent =
      `homeward — ${RECORD_TOTAL} checkpoints · ${QUESTIONS.length} questions · ${mistakes} ${mistakes === 1 ? "miss" : "misses"}`;
    winEl?.classList.remove("hidden");
    if (onNext) hideLeaderboard();
    else showLeaderboard("win");
  }
  function resetLevel() {
    failed = false;
    igniting = false;
    ignT = 0;
    ignTick = -1;
    launched = false;
    won = false;
    liftT = 0;
    burstTimer = 0;
    completionNotified = false;
    resetBursts();
    ignitionEl?.classList.add("hidden");
    flashEl?.classList.remove("show");
    qIndex = 0;
    phase = "menu";
    usedTool = null;
    deadTools = new Set();
    wrongChips = new Set();
    mistakes = 0;
    hideLeaderboard();
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

  function showWinForShortcut() {
    for (const Q of QUESTIONS) Q.done = true;
    for (const s of sites) {
      s.confirmed = true;
      s.flareT = 0;
      s.beam.visible = true;
      s.beam.material.opacity = 1;
    }
    started = true;
    failed = false;
    igniting = false;
    launched = true;
    won = true;
    liftT = LIFT_DUR;
    timerRunning = false;
    phase = "done";
    rig.position.y = Math.max(rig.position.y, 420);
    camera.rotation.x = baseRotX - 0.5;
    camera.rotation.y = baseRotY;
    camera.rotation.z = 0;
    starMat.opacity = 1;
    sun.intensity = 0.6;
    scene.fog.far = 2200;
    briefingEl?.classList.add("hidden");
    consoleEl?.classList.add("hidden");
    failEl?.classList.add("hidden");
    ignitionEl?.classList.add("hidden");
    if (winSub) winSub.textContent =
      `homeward — ${RECORD_TOTAL} checkpoints · ${QUESTIONS.length} questions · ${mistakes} ${mistakes === 1 ? "miss" : "misses"}`;
    revealWin();
    renderCode();
  }

  function buildLeaderboardRun(outcome) {
    return createLeaderboardEntry({
      level: 3,
      outcome,
      totalTime: TOTAL_TIME,
      timeLeft,
      progressCompleted: QUESTIONS.filter((Q) => Q.done).length,
      progressTotal: QUESTIONS.length,
      mistakes,
    });
  }
  function showLeaderboard(outcome) {
    const run = buildLeaderboardRun(outcome);
    hud?.classList.add("has-leaderboard");
    leaderboardPanel.show(run, {
      title: outcome === "win" ? "Game complete" : "Game over",
    });
  }
  function hideLeaderboard() {
    hud?.classList.remove("has-leaderboard");
    leaderboardPanel.hide();
  }

  function skipToEnd(outcome) {
    clearTimeout(nextTimer);
    clearTimeout(msgTimer);
    flashEl?.classList.remove("show");
    if (outcome === "success") {
      showWinForShortcut();
    } else {
      started = true;
      failed = false;
      igniting = false;
      launched = false;
      won = false;
      timerRunning = false;
      briefingEl?.classList.add("hidden");
      consoleEl?.classList.add("hidden");
      winEl?.classList.add("hidden");
      ignitionEl?.classList.add("hidden");
      failLevel();
    }
    updateClock();
    applySky();
  }

  // ---------- input ----------
  function onKeyDown(e) {
    if (!active) return;
    if (leaderboardPanel.containsTarget(e.target)) return;
    if (leaderboardPanel.isVisible()) {
      leaderboardPanel.focusInput();
      e.preventDefault();
      return;
    }
    if (!started) {
      if (e.code === "Enter" || e.code === "Space") { advanceBriefing(); e.preventDefault(); }
      return;
    }
    if (failed) {
      if (e.code === "KeyR") { resetLevel(); e.preventDefault(); }
      if (e.code === "KeyN") { onNewGame?.(); e.preventDefault(); }
      return;
    }
    if (won || launched || igniting) {
      if (won && (e.code === "Enter" || e.code === "Space")) {
        onNext?.();
        e.preventDefault();
      }
      if (won && e.code === "KeyB") onExit?.();
      return;
    }
    if (e.key >= "1" && e.key <= "3") {
      const i = Number(e.key) - 1;
      if (phase === "menu") pickTool(i);
      e.preventDefault();
      return;
    }
    if (phase === "chips") {
      const i = ANSWER_KEYS.indexOf(e.key.toUpperCase());
      if (i >= 0) {
        pickChip(i);
        e.preventDefault();
        return;
      }
    }
    if (e.code === "KeyB") onExit?.();
  }
  menuEl?.addEventListener("click", (e) => {
    if (!active || failed || launched) return;
    const btn = e.target.closest?.("[data-tool]");
    if (btn) pickTool(Number(btn.dataset.tool));
  });
  answersEl?.addEventListener("click", (e) => {
    if (!active || failed || launched) return;
    const btn = e.target.closest?.("[data-chip]");
    if (btn) pickChip(Number(btn.dataset.chip));
  });
  winNext?.addEventListener("click", () => {
    if (active && won) onNext?.();
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
      // Gold confirm flare: quick bloom, then settles to a steady glow —
      // and a full-power salute from every beam once the engines are lit.
      if (s.confirmed) {
        s.flareT += dt;
        const settle = 0.28 + Math.sin(t * 2.2 + s.idx) * 0.04;
        const bloom = Math.max(0, 1 - s.flareT / 2.5) * 0.5;
        const salute = (igniting || launched) ? 0.45 + Math.sin(t * 7 + s.idx) * 0.15 : 0;
        s.beam.material.opacity = Math.min(1, settle + bloom + salute);
      }
    }

    if (igniting) {
      // 3… 2… 1… — the rumble builds with the count.
      ignT += dt;
      const tick = Math.floor(ignT);
      if (tick !== ignTick && tick < IGN_DUR) {
        ignTick = tick;
        setIgnitionText(String(IGN_DUR - tick), false);
      }
      const amp = 0.0015 + (ignT / IGN_DUR) * 0.006;
      camera.rotation.x = baseRotX + (Math.random() - 0.5) * amp;
      camera.rotation.y = baseRotY + (Math.random() - 0.5) * amp;
      if (ignT >= IGN_DUR) igniteNow();
    } else if (launched && !won) {
      // Liftoff: the island falls away, the sky becomes space, the island
      // cheers — fireworks streaming past the window.
      liftT += dt;
      const v = Math.min(46, 6 + liftT * 9);
      rig.position.y += v * dt;
      const rumble = Math.max(0, 1 - liftT / 3) * 0.006;
      camera.rotation.x = baseRotX - Math.min(0.5, liftT * 0.07) + (Math.random() - 0.5) * rumble;
      camera.rotation.y = baseRotY + (Math.random() - 0.5) * rumble;
      camera.rotation.z = Math.sin(t * 1.3) * 0.004;
      scene.fog.far = Math.min(2200, 420 + liftT * 320);
      sun.intensity = Math.max(0.6, 1.5 - liftT * 0.1);
      burstTimer -= dt;
      if (burstTimer <= 0 && liftT < LIFT_DUR - 1.5) {
        const idle = bursts.find((b) => !b.active);
        if (idle) fireBurst(idle);
        burstTimer = 0.45 + Math.random() * 0.5;
      }
      if (liftT >= LIFT_DUR) {
        won = true;
        revealWin();
      }
    } else if (!failed && !won) {
      // Idle cockpit sway — alive, not nauseating.
      camera.rotation.x = baseRotX + Math.sin(t * 0.7) * 0.006;
      camera.rotation.y = baseRotY + Math.sin(t * 0.45) * 0.008;
    }
    updateBursts(dt);
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
      if (onNext) hideLeaderboard();
      else showLeaderboard("win");
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
    ignitionEl?.classList.add("hidden");
    flashEl?.classList.remove("show");
    winEl?.classList.add("hidden");
    failEl?.classList.add("hidden");
    hideLeaderboard();
  }
  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }

  return { scene, camera, update, enter, exit, resize, skipToEnd };
}
