import * as THREE from "three";
import { createLeaderboardEntry } from "./leaderboard.js";
import { createLeaderboardPanel } from "./leaderboardPanel.js";
import { sfx } from "./sfx.js";

// LEVEL 4 ("Trail Relay") — after the ship reaches orbit, the rebellion needs
// one reviewable route through the work. The level turns the meta-feature that
// produced this branch into game grammar: a trail has intent, a branch, evidence
// from checkpoints, and a PR handoff that keeps all of it together.

const TOTAL_TIME = 120;
const LOW_TIME = 35;
const CRIT_TIME = 12;
const STEP_KEYS = ["1", "2", "3"];

const SKY_CALM = new THREE.Color(0x050817);
const SKY_PANIC = new THREE.Color(0x441018);
const SUN_CALM = new THREE.Color(0xffe1a1);
const SUN_PANIC = new THREE.Color(0xff6a4f);

const BRIEFING_BEATS = [
  "You made orbit, but the rebellion cannot review a pile of loose signals.",
  "Build the trail packet: intent, branch, evidence, handoff. The checkpoints will follow the branch.",
];

const STEPS = [
  {
    lock: "BRANCH",
    title: "Find The Trail",
    command: "entire trail show 1",
    question: "Which branch keeps this work attached to the trail?",
    rows: [
      ["Trail", "Create a level 4"],
      ["Branch", "create-a-level-4"],
      ["Base", "main"],
      ["Status", "open"],
    ],
    options: [
      ["create-a-level-4", true, "branch locked — checkpoints can travel with the work"],
      ["main", false, "main is the base; putting new evidence there strands the trail"],
      ["preview", false, "preview is only a demo branch, not this trail"],
    ],
  },
  {
    lock: "INTENT",
    title: "Name The Mission",
    command: "entire trail update --body",
    question: "What belongs in the trail description?",
    rows: [
      ["Body", "why this exists, what changed, and where the design lives"],
      ["Rule", "the web view shows the body; the CLI can set it"],
      ["Keep", "reviewers should know what they are reviewing before reading diffs"],
    ],
    options: [
      ["why + what, ending with the spec path", true, "intent packet sealed"],
      ["only the latest commit hash", false, "evidence needs context before hashes help"],
      ["a paste of every checkpoint transcript", false, "the trail links evidence automatically"],
    ],
  },
  {
    lock: "EVIDENCE",
    title: "Carry The Checkpoints",
    command: "git push origin create-a-level-4",
    question: "How do the checkpoints appear under the trail?",
    rows: [
      ["Trail rule", "commit is on the trail branch and ahead of the pushed base"],
      ["No paste", "checkpoint links are not copied into the trail"],
      ["Sync", "normal git push sends the branch evidence"],
    ],
    options: [
      ["work on the trail branch and push normally", true, "evidence packet online"],
      ["manually paste checkpoint IDs into the body", false, "the backend already finds them by branch"],
      ["merge into main before review", false, "merged-base commits stop being ahead of the trail base"],
    ],
  },
  {
    lock: "HANDOFF",
    title: "Open The Corridor",
    command: "gh pr create --base main --head create-a-level-4",
    question: "What should the PR do with this trail?",
    rows: [
      ["Branch", "create-a-level-4"],
      ["PR", "reuses the existing trail for this branch"],
      ["Merge", "moves the trail to merged when the work lands"],
    ],
    options: [
      ["open the PR from the same branch", true, "handoff locked — relay is ready"],
      ["create a second trail for the PR", false, "one branch owns one trail"],
      ["change the base branch to preview", false, "review needs the real base"],
    ],
  },
];

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[ch]);
}

function formatTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function makeStars(count = 700) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const r = 120 + Math.random() * 520;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(THREE.MathUtils.randFloatSpread(2));
    positions[i * 3] = Math.sin(phi) * Math.cos(theta) * r;
    positions[i * 3 + 1] = Math.cos(phi) * r;
    positions[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * r;
    color.setHSL(0.12 + Math.random() * 0.08, 0.45, 0.78 + Math.random() * 0.18);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      size: 1.45,
      vertexColors: true,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      fog: false,
    })
  );
}

function makeNode(idx) {
  const group = new THREE.Group();
  const ringMat = new THREE.MeshBasicMaterial({
    color: idx === 0 ? 0xffd27a : 0x6fe3ff,
    transparent: true,
    opacity: 0.46,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.24, 0.055, 8, 72), ringMat);
  const outer = new THREE.Mesh(
    new THREE.TorusGeometry(1.72, 0.025, 6, 72),
    new THREE.MeshBasicMaterial({
      color: 0xe8f4ff,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    })
  );
  const coreMat = new THREE.MeshStandardMaterial({
    color: 0x14263a,
    emissive: 0x163047,
    emissiveIntensity: 0.5,
    metalness: 0.2,
    roughness: 0.35,
  });
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.52, 1), coreMat);
  const cap = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 0.18, 1.0),
    new THREE.MeshBasicMaterial({
      color: 0xffd27a,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    })
  );
  cap.position.y = -1.52;
  group.add(outer, ring, core, cap);
  group.userData = { ring, outer, core, coreMat, ringMat, cap, locked: false, active: false };
  return group;
}

function makeBeam(a, b) {
  const start = new THREE.Vector3(...a);
  const end = new THREE.Vector3(...b);
  const mid = start.clone().add(end).multiplyScalar(0.5);
  const dir = end.clone().sub(start);
  const len = dir.length();
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffd27a,
    transparent: true,
    opacity: 0.08,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, len, 10), mat);
  mesh.position.copy(mid);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return mesh;
}

export function createTrailRelayView(renderer, { onExit, onNewGame } = {}) {
  const scene = new THREE.Scene();
  scene.background = SKY_CALM.clone();
  scene.fog = new THREE.Fog(SKY_CALM.clone(), 60, 620);

  const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 1400);
  camera.position.set(0, 5.8, 18);
  camera.lookAt(0, 1.1, 0);
  const baseRot = camera.rotation.clone();

  scene.add(new THREE.HemisphereLight(0xb9a8ff, 0x12091c, 0.78));
  const sun = new THREE.DirectionalLight(SUN_CALM, 1.45);
  sun.position.set(20, 18, 24);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0x5b578a, 0.28));

  const stars = makeStars();
  scene.add(stars);

  const planet = new THREE.Mesh(
    new THREE.SphereGeometry(18, 48, 24),
    new THREE.MeshStandardMaterial({
      color: 0x5f4aa8,
      emissive: 0x160c2d,
      emissiveIntensity: 0.3,
      metalness: 0.05,
      roughness: 0.74,
    })
  );
  planet.position.set(0, -23, -30);
  planet.scale.set(1.25, 0.36, 1.25);
  scene.add(planet);

  const nodePositions = [
    [-7.2, 0.5, 0],
    [-2.4, 1.7, -1.1],
    [2.4, 1.7, -1.1],
    [7.2, 0.5, 0],
  ];
  const relay = new THREE.Group();
  scene.add(relay);
  const nodes = nodePositions.map((pos, idx) => {
    const node = makeNode(idx);
    node.position.set(...pos);
    relay.add(node);
    return node;
  });
  const beams = [];
  for (let i = 0; i < nodePositions.length - 1; i++) {
    const beam = makeBeam(nodePositions[i], nodePositions[i + 1]);
    relay.add(beam);
    beams.push(beam);
  }

  const capsule = new THREE.Group();
  const spine = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 0.34, 3.4, 24),
    new THREE.MeshStandardMaterial({
      color: 0x0e1a26,
      emissive: 0x102a34,
      emissiveIntensity: 0.8,
      metalness: 0.4,
      roughness: 0.28,
    })
  );
  spine.rotation.z = Math.PI / 2;
  const capsuleRing = new THREE.Mesh(
    new THREE.TorusGeometry(2.22, 0.035, 8, 96),
    new THREE.MeshBasicMaterial({
      color: 0x6fe3ff,
      transparent: true,
      opacity: 0.18,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    })
  );
  capsule.add(spine, capsuleRing);
  capsule.position.set(0, -1.5, 0.3);
  relay.add(capsule);

  const hud = document.getElementById("tr-hud");
  const briefingEl = document.getElementById("tr-briefing");
  const briefingText = document.getElementById("tr-briefing-text");
  const briefingNext = document.getElementById("tr-briefing-next");
  const countdownEl = document.getElementById("tr-countdown");
  const timeEl = document.getElementById("tr-countdown-time");
  const progressEl = document.getElementById("tr-progress");
  const consoleEl = document.getElementById("tr-console");
  const stageKicker = document.getElementById("tr-stage-kicker");
  const stageLock = document.getElementById("tr-stage-lock");
  const questionEl = document.getElementById("tr-question");
  const outputEl = document.getElementById("tr-output");
  const optionsEl = document.getElementById("tr-options");
  const msgEl = document.getElementById("tr-msg");
  const winEl = document.getElementById("tr-win");
  const winSub = document.getElementById("tr-win-sub");
  const failEl = document.getElementById("tr-fail");
  const failSub = document.getElementById("tr-fail-sub");
  const leaderboardPanel = createLeaderboardPanel({ mount: hud, onClose: hideLeaderboard });

  let active = false;
  let started = false;
  let failed = false;
  let won = false;
  let timerRunning = false;
  let timeLeft = TOTAL_TIME;
  let elapsed = 0;
  let stepIndex = 0;
  let mistakes = 0;
  let briefingIndex = 0;
  let msgTimer = null;

  function setMessage(text, ok = true) {
    clearTimeout(msgTimer);
    if (!msgEl) return;
    msgEl.textContent = text;
    msgEl.className = ok ? "show-ok" : "show-err";
    msgTimer = setTimeout(() => { msgEl.className = ""; }, 1800);
  }

  function updateClock() {
    if (timeEl) timeEl.textContent = formatTime(timeLeft);
    countdownEl?.classList.toggle("is-low", timeLeft <= LOW_TIME && timeLeft > CRIT_TIME);
    countdownEl?.classList.toggle("is-critical", timeLeft <= CRIT_TIME);
  }

  function renderProgress() {
    if (!progressEl) return;
    progressEl.innerHTML = STEPS.map((step, idx) => (
      `<div class="tr-node ${idx < stepIndex ? "is-done" : idx === stepIndex && !won ? "is-active" : ""}">` +
        `<span class="tr-node-dot"></span>` +
        `<span class="tr-node-label">${escapeHtml(step.lock)}</span>` +
      `</div>`
    )).join("");
  }

  function renderStep() {
    const step = STEPS[stepIndex];
    if (!step) return;
    if (stageKicker) stageKicker.textContent = `PACKET ${stepIndex + 1} / ${STEPS.length}`;
    if (stageLock) stageLock.textContent = step.lock;
    if (questionEl) questionEl.textContent = step.question;
    if (outputEl) {
      outputEl.innerHTML =
        `<div class="tr-command"><span class="lc-prompt">$</span> <span>${escapeHtml(step.command)}</span></div>` +
        step.rows.map(([key, value]) => (
          `<div class="tr-row"><span class="tr-key">${escapeHtml(key)}</span><span class="tr-value">${escapeHtml(value)}</span></div>`
        )).join("");
    }
    if (optionsEl) {
      optionsEl.innerHTML = step.options.map(([label], idx) => (
        `<button class="tr-option" type="button" data-option="${idx}">` +
          `<kbd>${STEP_KEYS[idx]}</kbd><span>${escapeHtml(label)}</span>` +
        `</button>`
      )).join("");
    }
    setMessage("", true);
    renderProgress();
  }

  function lockStep() {
    const node = nodes[stepIndex];
    node.userData.locked = true;
    node.userData.active = false;
    node.userData.cap.material.opacity = 0.9;
    node.userData.coreMat.color.set(0xffd27a);
    node.userData.coreMat.emissive.set(0xffb86b);
    node.userData.coreMat.emissiveIntensity = 1.4;
    if (beams[stepIndex - 1]) beams[stepIndex - 1].material.opacity = 0.7;
    if (beams[stepIndex]) beams[stepIndex].material.opacity = 0.2;
  }

  function pickOption(idx) {
    if (!started || failed || won) return;
    const step = STEPS[stepIndex];
    const picked = step?.options[idx];
    if (!picked) return;
    const [, ok, note] = picked;
    if (!ok) {
      mistakes += 1;
      timeLeft = Math.max(0, timeLeft - 8);
      updateClock();
      sfx.wrong();
      setMessage(note, false);
      if (timeLeft <= 0) failLevel();
      return;
    }
    sfx.checkpoint();
    lockStep();
    setMessage(note, true);
    stepIndex += 1;
    renderProgress();
    if (stepIndex >= STEPS.length) {
      winLevel();
      return;
    }
    setTimeout(() => {
      if (active && !failed && !won) renderStep();
    }, 650);
  }

  function renderBriefingBeat() {
    if (!briefingText) return;
    briefingText.textContent = BRIEFING_BEATS[briefingIndex] || "";
    if (briefingNext) briefingNext.textContent = briefingIndex >= BRIEFING_BEATS.length - 1 ? "to begin" : "to continue";
  }

  function advanceBriefing() {
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
    failed = false;
    won = false;
    briefingEl?.classList.add("hidden");
    consoleEl?.classList.remove("hidden");
    winEl?.classList.add("hidden");
    failEl?.classList.add("hidden");
    timeLeft = TOTAL_TIME;
    elapsed = 0;
    timerRunning = true;
    renderStep();
    updateClock();
  }

  function buildLeaderboardRun(outcome) {
    return createLeaderboardEntry({
      level: 4,
      outcome,
      totalTime: TOTAL_TIME,
      timeLeft,
      durationSeconds: elapsed,
      progressCompleted: stepIndex,
      progressTotal: STEPS.length,
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

  function winLevel() {
    if (won) return;
    won = true;
    timerRunning = false;
    consoleEl?.classList.add("hidden");
    if (winSub) {
      winSub.textContent = `${STEPS.length} packets locked · ${formatTime(timeLeft)} remaining · ${mistakes} ${mistakes === 1 ? "miss" : "misses"}`;
    }
    winEl?.classList.remove("hidden");
    sfx.recover();
    showLeaderboard("win");
  }

  function failLevel() {
    if (failed || won) return;
    failed = true;
    timerRunning = false;
    consoleEl?.classList.add("hidden");
    countdownEl?.classList.remove("is-low", "is-critical");
    if (failSub) failSub.textContent = `You sealed ${stepIndex} of ${STEPS.length} trail packets.`;
    failEl?.classList.remove("hidden");
    showLeaderboard("loss");
  }

  function resetLevel() {
    clearTimeout(msgTimer);
    failed = false;
    won = false;
    started = true;
    timerRunning = true;
    timeLeft = TOTAL_TIME;
    elapsed = 0;
    stepIndex = 0;
    mistakes = 0;
    hideLeaderboard();
    for (const node of nodes) {
      node.userData.locked = false;
      node.userData.active = false;
      node.userData.cap.material.opacity = 0;
      node.userData.ringMat.opacity = 0.46;
      node.userData.coreMat.color.set(0x14263a);
      node.userData.coreMat.emissive.set(0x163047);
      node.userData.coreMat.emissiveIntensity = 0.5;
    }
    for (const beam of beams) beam.material.opacity = 0.08;
    winEl?.classList.add("hidden");
    failEl?.classList.add("hidden");
    briefingEl?.classList.add("hidden");
    consoleEl?.classList.remove("hidden");
    renderStep();
    updateClock();
  }

  function showWinForShortcut() {
    started = true;
    failed = false;
    won = false;
    timerRunning = false;
    timeLeft = Math.max(timeLeft, 42);
    stepIndex = STEPS.length;
    for (let i = 0; i < nodes.length; i++) {
      stepIndex = i;
      lockStep();
    }
    stepIndex = STEPS.length;
    briefingEl?.classList.add("hidden");
    consoleEl?.classList.add("hidden");
    failEl?.classList.add("hidden");
    winLevel();
    updateClock();
  }

  function skipToEnd(outcome) {
    hideLeaderboard();
    clearTimeout(msgTimer);
    if (outcome === "success") {
      showWinForShortcut();
    } else {
      started = true;
      failed = false;
      won = false;
      timerRunning = false;
      stepIndex = Math.min(2, STEPS.length - 1);
      timeLeft = 0;
      briefingEl?.classList.add("hidden");
      winEl?.classList.add("hidden");
      failLevel();
    }
  }

  function onKeyDown(e) {
    if (!active) return;
    if (leaderboardPanel.containsTarget(e.target)) return;
    if (leaderboardPanel.isVisible()) {
      leaderboardPanel.focusInput();
      e.preventDefault();
      return;
    }
    if (!started) {
      if (e.code === "Enter" || e.code === "Space") {
        advanceBriefing();
        e.preventDefault();
      }
      return;
    }
    if (failed) {
      if (e.code === "KeyR") { resetLevel(); e.preventDefault(); }
      if (e.code === "KeyN") { onNewGame?.(); e.preventDefault(); }
      return;
    }
    if (won) {
      if (e.code === "KeyB") onExit?.();
      return;
    }
    if (e.code === "KeyB") {
      onExit?.();
      e.preventDefault();
      return;
    }
    const idx = STEP_KEYS.indexOf(e.key);
    if (idx >= 0) {
      pickOption(idx);
      e.preventDefault();
    }
  }

  optionsEl?.addEventListener("click", (e) => {
    if (!active) return;
    const btn = e.target.closest?.("[data-option]");
    if (btn) pickOption(Number(btn.dataset.option));
  });
  briefingEl?.addEventListener("click", () => {
    if (active && !started) advanceBriefing();
  });

  function update(dt, t) {
    if (active && timerRunning && started && !failed && !won) {
      timeLeft = Math.max(0, timeLeft - dt);
      elapsed = Math.min(TOTAL_TIME, elapsed + dt);
      updateClock();
      if (timeLeft <= 0) failLevel();
    }

    const panic = THREE.MathUtils.clamp((LOW_TIME - timeLeft) / LOW_TIME, 0, 1);
    scene.background.copy(SKY_CALM).lerp(SKY_PANIC, panic * 0.7);
    scene.fog.color.copy(scene.background);
    sun.color.copy(SUN_CALM).lerp(SUN_PANIC, panic);
    relay.rotation.y = Math.sin(t * 0.18) * 0.08;
    capsule.rotation.z += dt * 0.55;
    capsuleRing.rotation.y += dt * 0.7;
    planet.rotation.y += dt * 0.035;
    stars.rotation.y += dt * 0.01;

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const u = node.userData;
      const isActive = i === stepIndex && started && !failed && !won;
      u.active = isActive;
      u.ring.rotation.z += dt * (u.locked ? 0.65 : isActive ? 1.2 : 0.32);
      u.outer.rotation.z -= dt * 0.18;
      u.core.rotation.y += dt * 0.9;
      const pulse = isActive ? 0.2 + Math.sin(t * 5) * 0.08 : 0;
      const lockedGlow = u.locked ? 0.42 + Math.sin(t * 2 + i) * 0.06 : 0;
      u.ringMat.opacity = Math.min(1, 0.34 + pulse + lockedGlow);
      u.core.scale.setScalar(1 + (isActive ? Math.sin(t * 6) * 0.08 : 0));
      u.cap.rotation.y += dt * 1.4;
    }

    for (let i = 0; i < beams.length; i++) {
      if (i < stepIndex - 1 || won) {
        beams[i].material.opacity = Math.min(0.88, 0.68 + Math.sin(t * 3 + i) * 0.08);
      }
    }

    camera.rotation.x = baseRot.x + Math.sin(t * 0.7) * 0.008;
    camera.rotation.y = baseRot.y + Math.sin(t * 0.45) * 0.01;
  }

  function enter() {
    active = true;
    document.body.classList.add("trail-relay-up");
    window.addEventListener("keydown", onKeyDown);
    hud?.classList.remove("hidden");
    if (!started) {
      showBriefing();
    } else if (won) {
      winEl?.classList.remove("hidden");
      showLeaderboard("win");
    } else if (failed) {
      resetLevel();
    } else {
      consoleEl?.classList.remove("hidden");
      timerRunning = true;
    }
    renderProgress();
    updateClock();
  }

  function exit() {
    active = false;
    timerRunning = false;
    clearTimeout(msgTimer);
    window.removeEventListener("keydown", onKeyDown);
    document.body.classList.remove("trail-relay-up");
    hud?.classList.add("hidden");
    briefingEl?.classList.add("hidden");
    consoleEl?.classList.add("hidden");
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
