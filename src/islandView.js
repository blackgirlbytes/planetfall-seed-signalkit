import * as THREE from "three";
import { createTerrain } from "./terrain.js";
import { FRAGMENTS } from "./debris.js";
import { genCheckpointId, makeIceBlock } from "./memoryProps.js";
import { makeRecord, makeWreck } from "./fallingProps.js";
import { sfx } from "./sfx.js";

// LEVEL 1 — "First Memories", rebuilt as a falling-records shooter.
//
// The crash flung the ship's records skyward; they're raining back down over
// the wreck, tangled up with dead wreckage. You stand at the crash site behind
// a salvage cannon that tracks your cursor. Shoot a glowing gold RECORD to
// recover it; skip the dark WRECKAGE (shooting it costs you time).
//
// Each record you recover opens the ship's terminal and you BANK it with the
// real workflow:  `git add` (stage) → `git commit` (freeze) → press Y to link a
// CHECKPOINT (what actually restores it to the ship's memory). The tutorial
// banks one freebie; recover four more, then run `entire checkpoint list`.
//
// Teaching: a commit just freezes the change; linking a checkpoint is what the
// ship remembers by. One clock for the whole run.

// Score-attack: recover as many records as you can before 0:00. Clear the
// MINIMUM to power the ship; anything above is bonus. Hard but not impossible:
// each record costs the full git add/commit/link loop, so it's a race against
// your own typing as much as the clock.
const TOTAL_TIME = 48;       // seconds in the run
const MIN_TO_PASS = 5;       // tutorial freebie + four timed records
const WRECK_PENALTY = 4;     // seconds lost for shooting wreckage
const LOW_TIME = 15;         // clock turns urgent (red, pulsing) under this
const CRIT_TIME = 6;         // clock goes CRITICAL (fast pulse) under this
const PANIC_TIME = 15;       // the SKY starts shifting toward panic-red under this

// Falling field — a vertical plane in front of the cannon.
const PLANE_Z = 0;
const SPAWN_Y = 56;
const DESPAWN_Y = 1.0;
const SPAWN_X = 32;          // half-width records can fall within
const RECORD_SCALE = 3.0;
const WRECK_SCALE = 2.6;
const MAX_FALLING = 8;

// Escalation — the run gets harder as the clock drains (0 at start, 1 at 0:00):
// drops come faster, records get scarcer, everything falls quicker.
const SPAWN_MAX = 0.85;      // seconds between drops, early
const SPAWN_MIN = 0.42;      // seconds between drops, late
const RECORD_CHANCE_START = 0.55;
const RECORD_CHANCE_END = 0.34;
const FALL_BASE = 8;
const FALL_VAR = 4;
const FALL_RAMP = 1.4;       // top speed = base * (1 + FALL_RAMP) near the end
function lerp(a, b, t) { return a + (b - a) * t; }

// Sky panic palette — the whole world reddens as the clock runs out.
const SKY_CALM  = new THREE.Color(0x2a2350);
const SKY_PANIC = new THREE.Color(0x6e0f16);
const FOG_PANIC = new THREE.Color(0x4a0a0e);
const DOME_CALM = new THREE.Color(0x3a3168);
const DOME_PANIC = new THREE.Color(0x7a141c);
const SUN_CALM  = new THREE.Color(0xfff1dc);
const SUN_PANIC = new THREE.Color(0xff5a3c);

const BRIEFING_BEATS = [
  "Shoot the gold records and avoid the wreckage.",
];

const MODE_PROMPTS = {
  tutorial: {
    action: "START TUTORIAL",
    note: "First record is practice. The clock stays off.",
  },
  level: {
    action: "PLAY LEVEL 1",
    note: "Clock starts now. Recover at least 4 more records.",
  },
  // The level-complete handoff — shown after `entire checkpoint list`. Keeps the
  // recovered-records list visible behind it instead of closing the terminal.
  next: {
    head: "LEVEL 1 COMPLETE",
    action: "START LEVEL 2",
    note: "Ship memory restored — the drone bay just woke up.",
    keepTerminal: true,
  },
};

const BANK_LESSONS = {
  dormant: {
    parts: ["When the terminal opens, type ", { command: "git add" }, " to stage this record."],
  },
  recovered: {
    parts: ["When the terminal opens, type ", { command: "git commit" }, " to save it as a snapshot."],
  },
  frozen: {
    parts: ["When the terminal prompts, press ", { command: "Y" }, " to link the snapshot to a checkpoint."],
  },
};

// What the terminal asks for at each stage of banking a record.
const STEPS = {
  dormant:   { type: "command", cmd: "git add",    accept: ["git add"] },
  recovered: { type: "command", cmd: "git commit", accept: ["git commit"] },
  frozen:    { type: "confirm", question: "Link this record to a checkpoint?" },
};
const REVIEW_STEP = {
  type: "command", cmd: "entire checkpoint list", accept: ["entire checkpoint list"],
};

function normalizeCmd(s) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}
function cmdMatches(input, accepts) {
  const n = normalizeCmd(input);
  return accepts.some((a) => n === a || n.startsWith(a + " "));
}

export function createIslandView(renderer, { onExit, onComplete, onNext, onNewGame } = {}) {
  const canvas = renderer.domElement;

  // ---------- scene & sky ----------
  const scene = new THREE.Scene();
  scene.background = SKY_CALM.clone();
  scene.fog = new THREE.Fog(SKY_CALM.clone(), 90, 380);

  const camera = new THREE.PerspectiveCamera(
    55, window.innerWidth / window.innerHeight, 0.1, 2000
  );
  camera.position.set(0, 24, 50);
  camera.lookAt(0, 22, 0);

  // ---------- lighting ----------
  scene.add(new THREE.HemisphereLight(0xcdbcff, 0x3a2f5e, 0.7));
  const sun = new THREE.DirectionalLight(0xfff1dc, 1.6);
  sun.position.set(40, 70, 60);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0x6a5a92, 0.35));
  const fill = new THREE.DirectionalLight(0x88c0ff, 0.5);
  fill.position.set(-30, 20, 40);
  scene.add(fill);

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(900, 32, 16),
    new THREE.MeshBasicMaterial({ color: DOME_CALM.clone(), side: THREE.BackSide, fog: false })
  );
  scene.add(dome);

  // ---------- terrain (backdrop only) ----------
  const terrain = createTerrain({ size: 200, segments: 220, maxHeight: 22, seed: 1337 });
  scene.add(terrain.mesh, terrain.water);

  // ---------- the salvage cannon ----------
  // Mounted to the camera like a foreground weapon so it always reads at the
  // bottom-centre of the screen; we pivot the whole rig to aim at the cursor.
  scene.add(camera);                 // so the camera's children get rendered
  const cannon = buildCannon();
  cannon.position.set(0, -7, -16);
  cannon.scale.setScalar(0.9);
  camera.add(cannon);
  const MUZZLE_LOCAL = new THREE.Vector3(0, 1.2, 5.1);

  // ---------- falling field ----------
  const fallGroup = new THREE.Group();
  scene.add(fallGroup);
  const falling = [];          // { group, kind, vy }
  const effects = [];          // transient bolts / sparks
  let spawnTimer = 0;

  const raycaster = new THREE.Raycaster();
  const aimPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -PLANE_Z);
  const aimPoint = new THREE.Vector3(0, 24, PLANE_Z);
  const ndc = new THREE.Vector2(0, 0);
  let mouseClient = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

  // ---------- HUD elements ----------
  const promptEl = document.getElementById("fp-prompt");
  const crosshair = document.getElementById("crosshair");
  const reticle = document.getElementById("shooter-reticle");
  const islandHud = document.getElementById("island-hud");
  const tutorialEl = document.getElementById("tutorial");
  const actionBar = document.getElementById("action-bar");
  const termEl = document.getElementById("terminal");
  const termLine = document.getElementById("term-line");
  const termHint = document.getElementById("term-hint");
  const termInput = document.getElementById("term-input");
  const termList = document.getElementById("term-list");
  const termMsg = document.getElementById("term-msg");
  const termCta = document.getElementById("term-cta");
  const countdownEl = document.getElementById("countdown");
  const countdownTime = document.getElementById("countdown-time");
  const tallyEl = document.getElementById("shooter-tally");
  const stCount = document.getElementById("st-count");
  const stMin = document.getElementById("st-min");
  const stFill = document.getElementById("st-fill");
  const levelFail = document.getElementById("level-fail");
  const lfTitle = document.getElementById("lf-title");
  const lfSub = document.getElementById("lf-sub");
  const briefingEl = document.getElementById("briefing");
  const briefingText = document.getElementById("briefing-text");
  const briefingNext = document.getElementById("briefing-next");
  const modePrompt = document.getElementById("level-mode-prompt");
  const modeHead = document.getElementById("level-mode-head");
  const modeAction = document.getElementById("level-mode-action");
  const modeNote = document.getElementById("level-mode-note");
  const missionLesson = document.getElementById("mission-lesson");
  const missionLessonKicker = document.getElementById("mission-lesson-kicker");
  const missionLessonTitle = document.getElementById("mission-lesson-title");
  const missionLessonText = document.getElementById("mission-lesson-text");
  const missionLessonCue = document.getElementById("mission-lesson-cue");
  const fpShared = document.getElementById("fp-shared");

  let active = false;
  let tutorialTimer = null, msgTimer = null, shakeT = 0;

  // Banking state — the terminal flow after recovering a record.
  let terminalOpen = false;
  let banking = false;          // a record is captured and ready to bank
  let bankTarget = null;        // the record mesh being banked
  let bankIce = null;           // the ice block freezing it while you bank
  let bankState = "dormant";    // dormant → recovered → frozen → done
  let bankLessonComplete = false;
  let lessonPaused = false;
  let lessonNarrating = false;
  let buffer = "";
  let reviewMode = false;       // all linked → type `entire checkpoint list`
  let listShown = false;
  let banked = 0;
  let tutorialBankRecord = null;
  const bankedRecords = [];

  // Level countdown — the single source of pressure.
  let timeLeft = TOTAL_TIME;
  let timerRunning = false;
  let timedRunStarted = false;
  let failed = false;
  let started = false;
  let briefingIndex = 0;
  let modePromptState = null;

  // ---------- HUD helpers ----------
  function setPrompt(text) {
    if (!promptEl) return;
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
  // Score readout: recovered / minimum (e.g. 0/5 → 5/5 → 7/5). Goes green +
  // "overcharged" once you're past the minimum.
  function updateTally() {
    if (stCount) stCount.textContent = String(banked);
    if (stMin) stMin.textContent = String(MIN_TO_PASS);
    if (stFill) stFill.style.width = Math.min(100, (banked / MIN_TO_PASS) * 100) + "%";
    tallyEl?.classList.toggle("is-met", banked >= MIN_TO_PASS);
    tallyEl?.classList.toggle("is-over", banked > MIN_TO_PASS);
  }
  function restartTextAnimation(el) {
    if (!el) return;
    el.classList.remove("beat-in");
    void el.offsetWidth;
    el.classList.add("beat-in");
  }
  function renderBriefingBeat() {
    if (!briefingText) return;
    briefingText.textContent = BRIEFING_BEATS[briefingIndex] || "";
    restartTextAnimation(briefingText);
    if (briefingNext) briefingNext.textContent = "to continue";
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
  function showModePrompt(kind) {
    const prompt = MODE_PROMPTS[kind];
    if (!prompt || !modePrompt) return;
    modePromptState = kind;
    timerRunning = false;
    tutorialEl?.classList.add("hidden");
    hideBankLesson();
    if (!prompt.keepTerminal) closeTerminal();   // "next" keeps the haul list up
    briefingEl?.classList.add("hidden");
    if (modeHead) {
      modeHead.textContent = prompt.head || "";
      modeHead.classList.toggle("hidden", !prompt.head);
    }
    if (modeAction) modeAction.textContent = prompt.action;
    if (modeNote) modeNote.textContent = prompt.note;
    modePrompt.dataset.mode = kind;
    // Handoff keeps the haul list up, so top-anchor the card to clear it.
    modePrompt.classList.toggle("is-handoff", !!prompt.keepTerminal);
    modePrompt.classList.remove("hidden");
  }
  function visibleModePromptKind() {
    if (!modePrompt || modePrompt.classList.contains("hidden")) return null;
    if (modePrompt.dataset.mode) return modePrompt.dataset.mode;
    const action = modeAction?.textContent?.trim();
    if (action === MODE_PROMPTS.level.action) return "level";
    if (action === MODE_PROMPTS.tutorial.action) return "tutorial";
    return null;
  }
  function hideModePrompt() {
    if (modePrompt) {
      modePrompt.classList.add("hidden");
      modePrompt.classList.remove("is-handoff");
      delete modePrompt.dataset.mode;
    }
    modePromptState = null;
    modeAction?.blur();
  }
  function acceptModePrompt() {
    const acceptedMode = visibleModePromptKind() || modePromptState;
    if (!acceptedMode) return;
    hideModePrompt();
    if (acceptedMode === "tutorial") {
      startLevel();
    } else if (acceptedMode === "level") {
      startTimedRun();
    } else if (acceptedMode === "next") {
      onNext?.();
    }
  }
  function renderBankLesson() {
    const lesson = BANK_LESSONS[bankState];
    if (!lesson || !missionLesson) return;
    if (missionLessonKicker) {
      missionLessonKicker.textContent = lesson.kicker || "";
      missionLessonKicker.classList.toggle("hidden", !lesson.kicker);
    }
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
      restartTextAnimation(missionLessonText);
    }
    if (missionLessonCue) {
      missionLessonCue.innerHTML = `<span class="bf-key">Space</span><span class="mission-lesson-next">to continue</span>`;
    }
    missionLesson.classList.remove("hidden");
  }
  function hideBankLesson() {
    missionLesson?.classList.add("hidden");
  }
  function pauseForBankLesson() {
    lessonPaused = true;
    lessonNarrating = true;
    timerRunning = false;
    tutorialEl?.classList.add("hidden");
    closeTerminal();
    renderBankLesson();
  }
  function openBankLessonTerminal() {
    if (!lessonPaused || !lessonNarrating) return;
    lessonNarrating = false;
    hideBankLesson();
    buffer = "";
    openTerminal();
  }
  function finishBankLesson() {
    if (!lessonPaused) return;
    lessonPaused = false;
    lessonNarrating = false;
    bankLessonComplete = true;
    hideBankLesson();
  }
  function startTimedRun() {
    if (failed || reviewMode || listShown) return;
    if (modePrompt) {
      modePrompt.classList.add("hidden");
      delete modePrompt.dataset.mode;
    }
    modePromptState = null;
    modeAction?.blur();
    lessonPaused = false;
    lessonNarrating = false;
    closeTerminal();
    timedRunStarted = true;
    timerRunning = true;
    updateClock();
    refreshHud();
  }

  // ---------- level countdown / panic sky ----------
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
    const p = panicFactor();
    scene.background.copy(SKY_CALM).lerp(SKY_PANIC, p);
    scene.fog.color.copy(SKY_CALM).lerp(FOG_PANIC, p);
    dome.material.color.copy(DOME_CALM).lerp(DOME_PANIC, p);
    sun.color.copy(SUN_CALM).lerp(SUN_PANIC, p * 0.85);
  }

  // ---------- spawning / falling ----------
  function clearFalling() {
    for (const f of falling) fallGroup.remove(f.group);
    falling.length = 0;
  }
  // How far into the run we are: 0 at the start, 1 at 0:00.
  function difficulty() {
    return Math.min(1, Math.max(0, 1 - timeLeft / TOTAL_TIME));
  }
  function spawnDrop() {
    if (falling.length >= MAX_FALLING) return;
    const d = difficulty();
    const isRecord = Math.random() < lerp(RECORD_CHANCE_START, RECORD_CHANCE_END, d);
    const group = isRecord ? makeRecord() : makeWreck();
    group.scale.setScalar(isRecord ? RECORD_SCALE : WRECK_SCALE);
    group.position.set(
      (Math.random() * 2 - 1) * SPAWN_X,
      SPAWN_Y + Math.random() * 10,
      PLANE_Z + (Math.random() - 0.5) * 1.5
    );
    group.userData.kind = isRecord ? "record" : "wreck";
    fallGroup.add(group);
    const vy = (FALL_BASE + Math.random() * FALL_VAR) * (1 + FALL_RAMP * d);
    falling.push({ group, kind: isRecord ? "record" : "wreck", vy });
  }

  // ---------- shooting ----------
  function fire() {
    if (!started || failed || banking || reviewMode || listShown || visibleModePromptKind()) return;
    // Aim ray from the camera through the cursor.
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(fallGroup.children, true);
    let hitObj = null, hitPoint = null;
    if (hits.length) {
      hitPoint = hits[0].point.clone();
      let o = hits[0].object;
      while (o.parent && o.parent !== fallGroup) o = o.parent;
      hitObj = o;
    } else {
      hitPoint = aimPoint.clone();
    }
    spawnBolt(hitPoint);
    sfx.shoot();
    if (!hitObj) return;
    const entry = falling.find((f) => f.group === hitObj);
    if (!entry) return;
    if (entry.kind === "record") {
      // Pull it out of the falling list but keep it in the scene — it becomes
      // the captured record we bank, hovering in view until it's checkpointed.
      const i = falling.indexOf(entry);
      if (i >= 0) falling.splice(i, 1);
      startBank(entry.group);
    } else {
      // wrong target — costs time
      removeFalling(entry);
      spawnSpark(hitObj.position.clone(), 0xff5a3c);
      sfx.wrong();
      if (timedRunStarted) {
        timeLeft = Math.max(0, timeLeft - WRECK_PENALTY);
        updateClock();
      }
      flashScreen();
      shakeT = 0.25;
    }
  }
  function removeFalling(entry) {
    fallGroup.remove(entry.group);
    const i = falling.indexOf(entry);
    if (i >= 0) falling.splice(i, 1);
  }

  function spawnBolt(target) {
    const muzzle = cannon.localToWorld(MUZZLE_LOCAL.clone());
    const dir = target.clone().sub(muzzle);
    const len = dir.length();
    const geo = new THREE.CylinderGeometry(0.18, 0.18, len, 8);
    geo.translate(0, len / 2, 0);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x9bf0ff, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    });
    const bolt = new THREE.Mesh(geo, mat);
    bolt.position.copy(muzzle);
    bolt.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    scene.add(bolt);
    effects.push({ obj: bolt, life: 0.14, max: 0.14, kind: "bolt" });
  }
  function spawnSpark(pos, color) {
    const s = new THREE.Mesh(
      new THREE.SphereGeometry(1.4, 12, 12),
      new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.95,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      })
    );
    s.position.copy(pos);
    scene.add(s);
    effects.push({ obj: s, life: 0.3, max: 0.3, kind: "spark" });
  }
  function updateEffects(dt) {
    for (let i = effects.length - 1; i >= 0; i--) {
      const e = effects[i];
      e.life -= dt;
      const k = Math.max(0, e.life / e.max);
      if (e.kind === "bolt") e.obj.material.opacity = 0.9 * k;
      else { e.obj.material.opacity = 0.95 * k; e.obj.scale.setScalar(1 + (1 - k) * 1.8); }
      if (e.life <= 0) { scene.remove(e.obj); e.obj.geometry.dispose(); effects.splice(i, 1); }
    }
  }
  function flashScreen() {
    document.body.classList.add("hit-flash");
    setTimeout(() => document.body.classList.remove("hit-flash"), 160);
  }

  // ---------- banking flow ----------
  function startBank(recordGroup) {
    banking = true;
    bankTarget = recordGroup;
    bankState = "dormant";
    buffer = "";
    // The shot record stops mid-air where you hit it and hangs there, glowing,
    // while you bank it — NO ice yet. The rain keeps falling around you (records
    // you can't grab while your hands are on the keyboard slip past). It only
    // freezes into ice once you `git commit` it (see advanceBank).
    spawnSpark(recordGroup.position.clone(), 0xffd27a);
    sfx.recover();
    if (!bankLessonComplete) pauseForBankLesson();
    else openTerminal();
  }
  // git commit = freeze the change → encase the held record in ice.
  function freezeBankTarget() {
    if (!bankTarget || bankIce) return;
    const ice = makeIceBlock();
    ice.position.copy(bankTarget.position);
    ice.scale.setScalar(1.5);
    fallGroup.add(ice);
    bankIce = ice;
    spawnSpark(bankTarget.position.clone(), 0xbfe9ff);
  }
  function clearBankPiece() {
    if (bankTarget) { fallGroup.remove(bankTarget); bankTarget = null; }
    if (bankIce) { fallGroup.remove(bankIce); bankIce = null; }
  }
  function currentStep() {
    if (reviewMode) return REVIEW_STEP;
    return STEPS[bankState] || null;
  }
  function openTerminal() {
    terminalOpen = true;
    termMsg?.classList.remove("show-ok", "show-err");
    termList?.classList.add("hidden");
    termEl?.classList.remove("hidden");
    renderTerminal();
  }
  function closeTerminal() {
    terminalOpen = false;
    termEl?.classList.add("hidden");
  }
  function renderTerminal() {
    const step = currentStep();
    if (!step) return;
    if (reviewMode && listShown) {
      if (termHint) termHint.textContent = "";
      termLine?.classList.remove("is-confirm");
      termInput.textContent = "entire checkpoint list";
      termInput.classList.remove("is-dim");
      if (termCta) termCta.innerHTML = "";
      termList?.classList.remove("hidden");
      return;
    }
    termList?.classList.add("hidden");
    if (termHint) termHint.textContent = "";
    termLine?.classList.toggle("is-confirm", step.type === "confirm");
    if (step.type === "confirm") {
      // Not a typed command — show the question as its own wrapping line
      // (no $ prompt / cursor), and let the Y/N keys be the action.
      termInput.textContent = step.question;
      termInput.classList.add("is-dim");
      if (termCta) termCta.innerHTML =
        `<span class="cta-label">PRESS</span>` +
        `<kbd class="cta-key cta-key-yes">Y</kbd><span class="cta-note">link checkpoint</span>` +
        `<kbd class="cta-key cta-key-no">N</kbd><span class="cta-note">no point</span>`;
    } else {
      termInput.textContent = buffer;
      termInput.classList.remove("is-dim");
      if (termCta) termCta.innerHTML =
        step.cmd ? `<span class="cta-helper">type <code class="cta-helper-cmd">${step.cmd}</code></span>` : "";
    }
  }
  function flashTerminal(text, ok) {
    if (!termMsg) return;
    clearTimeout(msgTimer);
    termMsg.textContent = text;
    termMsg.classList.remove("show-ok", "show-err");
    termMsg.classList.add(ok ? "show-ok" : "show-err");
    msgTimer = setTimeout(() => termMsg.classList.remove("show-ok", "show-err"), 2400);
  }
  function submitCommand() {
    const step = currentStep();
    if (!step || step.type !== "command" || listShown) return;
    if (cmdMatches(buffer, step.accept)) {
      const teaching = lessonPaused;
      buffer = "";
      if (reviewMode) { showCheckpointList(); return; }
      advanceBank();
      if (!teaching) {
        renderTerminal();
      }
    } else {
      flashTerminal(`command not recognized. try: ${step.cmd}`, false);
      buffer = "";
      renderTerminal();
    }
  }
  function advanceBank() {
    if (bankState === "dormant") {
      bankState = "recovered";
      if (lessonPaused) {
        closeTerminal();
        lessonNarrating = true;
        renderBankLesson();
      }
    } else if (bankState === "recovered") {
      bankState = "frozen";
      freezeBankTarget();   // the commit freezes it into ice
      if (lessonPaused) {
        closeTerminal();
        lessonNarrating = true;
        renderBankLesson();
      }
    }
  }
  function confirmCheckpoint(yes) {
    if (bankState !== "frozen") return;
    const teaching = lessonPaused;
    if (!yes) {
      if (teaching) {
        flashTerminal("Checkpoint declined, no points received. Try again.", false);
        sfx.wrong();
        return;
      }
      if (bankTarget) spawnSpark(bankTarget.position.clone(), 0xff5a3c);
      clearBankPiece();
      banking = false;
      bankState = "done";
      closeTerminal();
      showTutorial("Checkpoint declined, no points received.", 2600);
      sfx.wrong();
      return;
    }
    const frag = FRAGMENTS[banked % FRAGMENTS.length];
    const id = genCheckpointId();
    const record = { frag, id };
    bankedRecords.push(record);
    banked += 1;
    updateTally();

    // shatter the ice + dismiss the banked record with a little sparkle
    if (bankTarget) spawnSpark(bankTarget.position.clone(), 0x8fe3ff);
    sfx.checkpoint();
    clearBankPiece();
    banking = false;
    bankState = "done";
    closeTerminal();
    if (teaching) {
      tutorialBankRecord = record;
      finishBankLesson();
      showModePrompt("level");
    }
  }
  function showCheckpointList() {
    listShown = true;
    timerRunning = false;
    countdownEl?.classList.remove("is-low", "is-critical");
    if (termList) {
      termList.innerHTML = bankedRecords.map(({ frag, id }) =>
        `<div class="term-list-row"><span class="tl-id">` +
        `<span class="tl-key">Entire-Checkpoint:</span> ${id}</span>` +
        `<span class="tl-title">recovered: ${frag.title}</span></div>`
      ).join("");
    }
    flashTerminal(`${banked} checkpoints linked · ship memory restored`, true);
    renderTerminal();
    onComplete?.();
    // The haul is on screen — hand off with a title-screen-style card.
    showModePrompt("next");
  }

  // ---------- end of run ----------
  // The clock hit 0:00 — branch on whether the minimum was cleared.
  function endRun() {
    timerRunning = false;
    countdownEl?.classList.remove("is-low", "is-critical");
    // a record mid-bank when time expired doesn't count
    banking = false;
    clearBankPiece();
    if (banked >= MIN_TO_PASS) passRun();
    else failRun();
  }
  function passRun() {
    clearFalling();
    reviewMode = true;
    openTerminal();             // → review step: type `entire checkpoint list`
    showTutorial(`Time. ${banked} records recovered. Run \`entire checkpoint list\` to review your haul.`, 0);
  }
  function failRun() {
    failed = true;
    closeTerminal();
    tutorialEl?.classList.add("hidden");
    if (lfTitle) lfTitle.textContent = "TIME'S UP";
    if (lfSub) lfSub.textContent =
      `You only captured ${banked} of ${MIN_TO_PASS} records.`;
    levelFail?.classList.remove("hidden");
  }
  function resetLevel() {
    failed = false;
    levelFail?.classList.add("hidden");
    clearFalling();
    clearBankPiece();
    banking = false;
    reviewMode = false;
    listShown = false;
    bankState = "dormant";
    buffer = "";
    bankedRecords.length = 0;
    if (bankLessonComplete && tutorialBankRecord) {
      bankedRecords.push(tutorialBankRecord);
      banked = 1;
    } else {
      banked = 0;
    }
    updateTally();
    spawnTimer = 0;
    timeLeft = TOTAL_TIME;
    timedRunStarted = false;
    timerRunning = false;
    updateClock();
    hideBankLesson();
    hideModePrompt();
    lessonPaused = false;
    lessonNarrating = false;
    showModePrompt(bankLessonComplete ? "level" : "tutorial");
  }

  // ---------- briefing ----------
  function showBriefing() {
    timerRunning = false;
    tutorialEl?.classList.add("hidden");
    briefingIndex = 0;
    renderBriefingBeat();
    briefingEl?.classList.remove("hidden");
  }
  function startLevel() {
    if (started) return;
    started = true;
    if (modePrompt) {
      modePrompt.classList.add("hidden");
      delete modePrompt.dataset.mode;
    }
    modePromptState = null;
    modeAction?.blur();
    briefingEl?.classList.add("hidden");
    timeLeft = TOTAL_TIME;
    timedRunStarted = false;
    timerRunning = false;
    updateTally();
    updateClock();
    refreshHud();
  }
  briefingEl?.addEventListener("click", advanceBriefing);
  modeAction?.addEventListener("click", acceptModePrompt);

  // ---------- input ----------
  function onMouseMove(e) {
    mouseClient = { x: e.clientX, y: e.clientY };
    ndc.x = (e.clientX / window.innerWidth) * 2 - 1;
    ndc.y = -(e.clientY / window.innerHeight) * 2 + 1;
    if (reticle) {
      reticle.style.left = e.clientX + "px";
      reticle.style.top = e.clientY + "px";
    }
  }
  function onMouseDown(e) {
    if (!active || e.button !== 0) return;
    if (visibleModePromptKind()) {
      acceptModePrompt();
      e.preventDefault();
      return;
    }
    if (lessonPaused && lessonNarrating) {
      openBankLessonTerminal();
      return;
    }
    fire();
  }
  function onKeyDown(e) {
    if (!active) return;

    if (visibleModePromptKind()) {
      acceptModePrompt();
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
    if (lessonPaused && lessonNarrating) {
      if (e.code === "Enter" || e.code === "Space") {
        openBankLessonTerminal();
        e.preventDefault();
        return;
      }
      if (e.code !== "KeyB") {
        e.preventDefault();
        return;
      }
    }

    // Terminal is open — banking a record or running the final list.
    if (terminalOpen) {
      const step = currentStep();
      if (reviewMode && listShown) {
        // run complete — only Enter (forward) / B (orbit) matter
        if (e.code === "Enter") { onNext?.(); e.preventDefault(); }
        if (e.code === "KeyB") { onExit?.(); }
        return;
      }
      if (step?.type === "confirm") {
        if (e.key === "y" || e.key === "Y") { confirmCheckpoint(true); e.preventDefault(); return; }
        if (e.key === "n" || e.key === "N") { confirmCheckpoint(false); e.preventDefault(); return; }
        e.preventDefault();
        return;
      }
      // command mode
      if (e.code === "Enter") { submitCommand(); e.preventDefault(); return; }
      if (e.code === "Backspace") { buffer = buffer.slice(0, -1); renderTerminal(); e.preventDefault(); return; }
      if (e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        buffer += e.key;
        renderTerminal();
        e.preventDefault();
      }
      return;
    }

    if (e.code === "KeyB") { onExit?.(); }
  }

  // ---------- per-frame ----------
  function refreshHud() {
    const promptMode = visibleModePromptKind();
    const aiming = started && !terminalOpen && !failed && !lessonPaused && !promptMode;
    reticle?.classList.toggle("hidden", !aiming);
    crosshair?.classList.add("hidden");
    canvas.style.cursor = aiming ? "none" : "default";
    tallyEl?.classList.toggle("hidden", !started);
    if (!started || terminalOpen || failed || lessonPaused || promptMode) { setPrompt(null); return; }
    setPrompt("Aim with the mouse · Click to fire");
  }

  function update(dt, t) {
    // Aim the cannon at the cursor's point on the falling plane.
    raycaster.setFromCamera(ndc, camera);
    if (raycaster.ray.intersectPlane(aimPlane, aimPoint)) {
      cannon.lookAt(aimPoint);
    }

    // Level countdown.
    if (active && timerRunning && !failed && !lessonPaused) {
      timeLeft = Math.max(0, timeLeft - dt);
      updateClock();
      if (timeLeft <= 0) endRun();
    }
    applyPanicSky();

    // Spawn + fall (paused while banking or after the run ends).
    // The rain keeps falling even while you bank — that's the cost of stopping
    // to type. (Only pause it once the run is over.)
    const raining = started && !reviewMode && !failed && !listShown && !visibleModePromptKind();
    if (raining) {
      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        spawnDrop();
        spawnTimer = lerp(SPAWN_MAX, SPAWN_MIN, difficulty());
      }
    }
    for (let i = falling.length - 1; i >= 0; i--) {
      const f = falling[i];
      if (raining) f.group.position.y -= f.vy * dt;
      const spin = f.group.userData.spin;
      const spinTarget = f.group.userData.spinTarget || f.group;
      if (spin) {
        spinTarget.rotation.x += spin.x * dt;
        spinTarget.rotation.y += spin.y * dt;
        spinTarget.rotation.z += spin.z * dt;
      }
      if (f.kind === "record") {
        const pulse = 0.5 + 0.5 * Math.sin(t * 5 + f.group.position.x * 0.13);
        if (f.group.userData.badge) f.group.userData.badge.material.opacity = 0.78 + pulse * 0.18;
        if (f.group.userData.trail) f.group.userData.trail.material.opacity = 0.28 + pulse * 0.18;
        if (f.group.userData.beacon) f.group.userData.beacon.intensity = 2.2 + pulse * 1.3;
      }
      if (f.group.position.y <= DESPAWN_Y) removeFalling(f);
    }

    // The shot record hangs frozen in ice while you bank it — a slow turn
    // inside the crystal so it reads as captured, not falling.
    if (bankTarget) {
      const spinTarget = bankTarget.userData.spinTarget || bankTarget;
      spinTarget.rotation.y += dt * 0.35;
    }

    updateEffects(dt);

    // Camera shake on a bad hit.
    if (shakeT > 0) {
      shakeT = Math.max(0, shakeT - dt);
      const s = shakeT * 4;
      camera.position.x = Math.sin(t * 90) * s;
      camera.position.y = 24 + Math.cos(t * 80) * s;
    } else if (camera.position.x !== 0 || camera.position.y !== 24) {
      camera.position.x = 0;
      camera.position.y = 24;
    }

    if (active) refreshHud();
  }

  // ---------- lifecycle ----------
  function enter() {
    active = true;
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    islandHud?.classList.remove("hidden");
    fpShared?.classList.remove("hidden");
    crosshair?.classList.add("hidden");
    updateTally();
    if (modePromptState) showModePrompt(modePromptState);
    else if (!started) showBriefing();
    else if (banking) {
      if (lessonPaused) {
        timerRunning = false;
        if (lessonNarrating) {
          closeTerminal();
          renderBankLesson();
        } else {
          hideBankLesson();
          openTerminal();
        }
      } else {
        timerRunning = timedRunStarted;
        openTerminal();
      }
    }
    else if (listShown) {
      timerRunning = false;
      showTutorial("Memory restored. Press Enter to answer the new signal, or B for orbit.", 0);
    } else if (failed) {
      resetLevel();
    } else {
      timerRunning = timedRunStarted;
    }
    updateClock();
    applyPanicSky();
  }
  function exit() {
    active = false;
    timerRunning = false;
    closeTerminal();
    canvas.style.cursor = "default";
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mousedown", onMouseDown);
    window.removeEventListener("keydown", onKeyDown);
    setPrompt(null);
    reticle?.classList.add("hidden");
    tallyEl?.classList.add("hidden");
    tutorialEl?.classList.add("hidden");
    hideBankLesson();
    modePrompt?.classList.add("hidden");
    termEl?.classList.add("hidden");
    levelFail?.classList.add("hidden");
    briefingEl?.classList.add("hidden");
    islandHud?.classList.add("hidden");
    fpShared?.classList.add("hidden");
  }
  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }

  return { scene, get camera() { return camera; }, update, enter, exit, resize };
}

// ---------- backdrop meshes ----------

// The salvage cannon: a swivel base + a barrel that points down its local +Z.
function buildCannon() {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0x3a4049, metalness: 0.8, roughness: 0.4, flatShading: true });
  const accent = new THREE.MeshStandardMaterial({ color: 0xffb86b, emissive: 0x6a4310, emissiveIntensity: 0.6, metalness: 0.9, roughness: 0.3 });

  const base = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.2, 2, 18), body);
  g.add(base);
  const yoke = new THREE.Mesh(new THREE.SphereGeometry(1.9, 16, 12), body);
  yoke.position.y = 1.2;
  g.add(yoke);

  // barrel along +Z
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 5.2, 16), body);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 1.2, 2.4);
  g.add(barrel);
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.7, 0.8, 16), accent);
  tip.rotation.x = Math.PI / 2;
  tip.position.set(0, 1.2, 5.1);
  g.add(tip);

  return g;
}
