import * as THREE from "three";
import { createTerrain } from "./terrain.js";
import { createFirstPerson } from "./firstPerson.js";
import { createOverhead } from "./overhead.js";
import { makeBeamTexture, makeIceBlock, makeIdSprite } from "./memoryProps.js";

// LEVEL 2 ("The Archive") — the same island, revisited.
//
// Restoring the ship's memory in Level 1 surfaced its full pre-crash archive:
// ~20 identical dark ice blocks, every checkpoint the old crew ever banked.
// Far too many to read one by one — which is exactly the point. One new
// command on top of the loop the player already knows:
//
//   ship asks for a memory (the keyword is in its request sentence)
//   `entire checkpoint search "<word>"`  → the matching block's beam lights up
//   sprint over, press E                 → the memory transmits to the ship
//
// Repeated ×3 under one countdown. Wrong or 0-result searches cost nothing
// but clock time — that's the whole pressure model.

const INTERACT_DIST = 8;     // how close (XZ) to transmit a lit block (E)
const CONSOLE_DIST = 9;      // how close (XZ) to open the ship terminal
const TOTAL_TIME = 90;       // seconds to search & transmit all three memories
const LOW_TIME = 35;         // clock turns urgent (red, pulsing) under this
const CRIT_TIME = 12;        // clock goes CRITICAL (fast pulse) under this
const PANIC_TIME = 35;       // the SKY starts shifting toward panic-red under this
const SPRITE_DIST = 18;      // walk this close to a dark block to read its id

// Sky panic palette — same island, same dread as Level 1's clock.
const SKY_CALM  = new THREE.Color(0x2a2350);
const SKY_PANIC = new THREE.Color(0x6e0f16);
const FOG_PANIC = new THREE.Color(0x4a0a0e);
const DOME_CALM = new THREE.Color(0x3a3168);
const DOME_PANIC = new THREE.Color(0x7a141c);
const SUN_CALM  = new THREE.Color(0xfff1dc);
const SUN_PANIC = new THREE.Color(0xff5a3c);

const CONSOLE_POS = { x: -6, z: 56 };

// What the ship asks for, in order. Each request is a plain sentence that
// CONTAINS the keyword — no clue hunting, just read and search.
const REQUESTS = [
  {
    targetId: "9d4e1f7a02bc",
    line: "Power is back, but the engines won't fire. Somewhere in the " +
      "archive the old crew tuned the ignition timing — send me that moment.",
  },
  {
    targetId: "5b82c3d9e016",
    line: "My nav core is blank. The old crew once charted a starmap home — " +
      "find it and send it up.",
  },
  {
    targetId: "c7f0a45d138e",
    line: "One more. I still can't reach the relay — find the session where " +
      "they aligned the long-range antenna.",
  },
];

// The ship's full pre-crash archive. Three entries answer the requests above;
// the rest is everything else the old crew ever checkpointed (including the
// three memories banked in Level 1). A corpus bigger than your head — search.
const ARCHIVE = [
  { id: "9d4e1f7a02bc", summary: "ignition timing tuned — engines certified for cold start" },
  { id: "5b82c3d9e016", summary: "starmap charted — a route home through the lavender belt" },
  { id: "c7f0a45d138e", summary: "long-range antenna aligned — relay handshake held steady" },
  { id: "31f0cafe4d12", summary: "recovered: abandoned EVA helmet" },
  { id: "7e11a2b09c44", summary: "recovered: torn logbook page" },
  { id: "b0a7ded51a6e", summary: "recovered: cracked nav panel" },
  { id: "2b90cc41d7ae", summary: "ballast trim balanced for the sea crossing" },
  { id: "f7d3a2e85c10", summary: "hull seams resealed after the first squall" },
  { id: "4c61e0b9d827", summary: "water recycler filters swapped and flushed" },
  { id: "a93f57c12e08", summary: "cargo manifest reconciled against the hold" },
  { id: "0e7b249fa6d3", summary: "greenhouse lamps recalibrated for the dark season" },
  { id: "61d8f3a07b5c", summary: "airlock seals pressure-tested to spec" },
  { id: "8a05b6e49c21", summary: "fuel cells rebalanced across bank three" },
  { id: "d24c91f7e60a", summary: "landing struts torqued and pinned" },
  { id: "3f6a08d5c4b9", summary: "thermal shielding patched on the leeward side" },
  { id: "b15e7c20a9f4", summary: "crew rotation schedule rewritten again" },
  { id: "79c4d1b8e305", summary: "distress beacon battery conditioned" },
  { id: "e80b3a96f1d7", summary: "galley inventory counted twice, still short one fork" },
  { id: "5d27f9c0a48e", summary: "dorsal sensor dust covers replaced" },
  { id: "c6e1408b72fa", summary: "coolant loop bled and refilled" },
  { id: "16a9d5e3b07c", summary: "archive index rebuilt overnight" },
];

function normalizeCmd(s) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

// Deterministic RNG so the archive blocks land in the same spots every run.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The ship console the terminal lives in (same prop as the crash site).
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

export function createArchiveView(renderer, { onExit, onNewGame } = {}) {
  const canvas = renderer.domElement;

  // ---------- scene & sky (Level 1's calm lavender, healed) ----------
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

  // ---------- the archive: ~20 dark ice blocks scattered on dry land ----------
  const beamTex = makeBeamTexture();
  const rand = mulberry32(20260609);
  const placements = [];
  let spacing = 13;
  let tries = 0;
  while (placements.length < ARCHIVE.length) {
    if (++tries > 3000) { spacing = Math.max(6, spacing - 2); tries = 0; }  // never hang on a tight island
    const ang = rand() * Math.PI * 2;
    const r = 16 + rand() * 56;
    const x = Math.cos(ang) * r;
    const z = Math.sin(ang) * r;
    if (terrain.heightAt(x, z) < 1.8) continue;                       // stay out of the sea
    if (Math.hypot(x - CONSOLE_POS.x, z - CONSOLE_POS.z) < 14) continue;
    if (placements.some((p) => Math.hypot(x - p.x, z - p.z) < spacing)) continue;
    placements.push({ x, z });
  }

  const blocks = ARCHIVE.map((entry, idx) => {
    const place = placements[idx];
    const anchor = new THREE.Group();
    anchor.position.set(place.x, terrain.heightAt(place.x, place.z), place.z);

    const ice = makeIceBlock();
    ice.position.y = 2.0;
    anchor.add(ice);

    const spr = makeIdSprite(entry.id);
    spr.position.y = ice.position.y + 5;
    spr.visible = false;                 // anonymous until lit, grabbed, or close
    anchor.add(spr);

    // The search result beam — dark until a search matches this block.
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.6, 60, 12, 1, true),
      new THREE.MeshBasicMaterial({
        map: beamTex, color: 0x6fe3ff, transparent: true, opacity: 0.5,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        fog: false,
      })
    );
    beam.position.y = 30;
    beam.visible = false;
    anchor.add(beam);

    scene.add(anchor);
    return { entry, anchor, ice, sprite: spr, beam, lit: false, grabbed: false };
  });

  function applyBlockVisuals(b) {
    if (b.grabbed) {
      b.ice.material.emissive.setHex(0x8a5a16);   // transmitted — warm gold
      b.ice.material.emissiveIntensity = 1.2;
      b.beam.visible = false;
      b.sprite.visible = true;
    } else if (b.lit) {
      b.ice.material.emissive.setHex(0x2a6c8a);   // found — checkpoint cyan
      b.ice.material.emissiveIntensity = 1.5;
      b.beam.visible = true;
      b.sprite.visible = true;
    } else {
      b.ice.material.emissive.setHex(0x0a2230);   // dark archive block
      b.ice.material.emissiveIntensity = 0.35;
      b.beam.visible = false;
    }
  }
  blocks.forEach(applyBlockVisuals);

  // ---------- the ship terminal (gold beam — go here first) ----------
  const consoleAnchor = new THREE.Group();
  consoleAnchor.position.set(
    CONSOLE_POS.x, terrain.heightAt(CONSOLE_POS.x, CONSOLE_POS.z), CONSOLE_POS.z
  );
  consoleAnchor.add(makeConsole());
  const consoleBeam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.6, 0.6, 60, 12, 1, true),
    new THREE.MeshBasicMaterial({
      map: beamTex, color: 0xffd27a, transparent: true, opacity: 0.4,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      fog: false,
    })
  );
  consoleBeam.position.y = 30;
  consoleAnchor.add(consoleBeam);
  const consoleGlow = new THREE.PointLight(0xffd27a, 6, 30, 2);
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

  // Bird's-eye map (M) — find the lit beam from above, keep walking.
  const overhead = createOverhead(scene, terrain, camera);
  function setMap(on) {
    if (overhead.on === on) return;
    overhead.set(on);
    fp.setAlwaysMove(on);                       // arrows work without pointer lock
    scene.fog.near = on ? 500 : 90;             // don't fog the map out
    scene.fog.far = on ? 1400 : 320;
    crosshair?.classList.toggle("hidden", on || !fp.isLocked);
  }

  // ---------- HUD elements (shared FP set + Level 2's own) ----------
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
  const l2Hud = document.getElementById("l2-hud");
  const briefingEl = document.getElementById("l2-briefing");
  const briefingStartBtn = document.getElementById("l2-briefing-start");
  const countdownEl = document.getElementById("l2-countdown");
  const countdownTime = document.getElementById("l2-countdown-time");
  const reqPanel = document.getElementById("l2-request");
  const reqCount = document.getElementById("l2-req-count");
  const reqText = document.getElementById("l2-req-text");
  const winEl = document.getElementById("l2-win");
  const winSub = document.getElementById("l2-win-sub");
  const failEl = document.getElementById("l2-fail");

  let active = false;
  let started = false;          // briefing dismissed → clock + movement go live
  let failed = false;
  let won = false;
  let promptText = null;
  let controlsLocked = null;
  const taught = new Set();
  let tutorialTimer = null;
  let msgTimer = null;

  // Level countdown — the single source of pressure for the whole run.
  let timeLeft = TOTAL_TIME;
  let timerRunning = false;

  // Terminal state.
  let terminalOpen = false;
  let buffer = "";
  let consoleDismissed = false; // player Esc'd the terminal (until they walk away)

  // Request progress.
  let reqIndex = 0;
  const currentRequest = () => REQUESTS[reqIndex] || null;
  const currentTargetLit = () => {
    const req = currentRequest();
    return !!req && blocks.some((b) => b.lit && b.entry.id === req.targetId);
  };

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
        <span class="control-label">Transmit memory</span>
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
    const p = won ? 0 : panicFactor();
    scene.background.copy(SKY_CALM).lerp(SKY_PANIC, p);
    scene.fog.color.copy(SKY_CALM).lerp(FOG_PANIC, p);
    dome.material.color.copy(DOME_CALM).lerp(DOME_PANIC, p);
    sun.color.copy(SUN_CALM).lerp(SUN_PANIC, p * 0.85);
  }

  // ---------- request panel ----------
  function updateRequest() {
    const req = currentRequest();
    if (reqCount) reqCount.textContent = `${Math.min(reqIndex + 1, REQUESTS.length)} / ${REQUESTS.length}`;
    if (reqText) {
      reqText.textContent = req ? req.line : "All three memories are home. Thank you.";
    }
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
    showTutorial("The archive is dark and the ship wants three memories. Read its request, then head for the gold beam — the terminal.", 8000);
  }
  briefingStartBtn?.addEventListener("click", startLevel);

  function failLevel() {
    if (failed || won) return;
    failed = true;
    timerRunning = false;
    setMap(false);
    closeTerminal(false);
    fp.detach();
    countdownEl?.classList.remove("is-low", "is-critical");
    tutorialEl?.classList.add("hidden");
    failEl?.classList.remove("hidden");
  }
  function winLevel() {
    won = true;
    timerRunning = false;
    closeTerminal(false);
    countdownEl?.classList.remove("is-low", "is-critical");
    tutorialEl?.classList.add("hidden");
    for (const b of blocks) { b.lit = false; applyBlockVisuals(b); }
    if (winSub) {
      winSub.textContent = "transmitted: " + REQUESTS.map((r) => r.targetId).join(" · ");
    }
    updateRequest();
    winEl?.classList.remove("hidden");
    if (active) fp.attach();
  }
  function resetLevel() {
    failed = false;
    won = false;
    reqIndex = 0;
    consoleDismissed = false;
    for (const b of blocks) { b.lit = false; b.grabbed = false; applyBlockVisuals(b); b.sprite.visible = false; }
    failEl?.classList.add("hidden");
    winEl?.classList.add("hidden");
    updateRequest();
    timeLeft = TOTAL_TIME;
    timerRunning = true;
    updateClock();
    if (active) fp.attach();
    showTutorial("New attempt — three searches, three beams, three transmissions before 0:00.", 6000);
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
    termInput.classList.remove("is-dim");
    termInput.textContent = buffer;
    if (currentTargetLit()) {
      termHint.textContent = "# the beam is lit — go get it";
      if (termCta) termCta.innerHTML =
        `<span class="cta-label">THEN</span>` +
        `<span class="cta-note">Esc to close · run to the lit beam · E to transmit</span>`;
    } else {
      termHint.textContent = "# the word you need is in the ship's request (top left)";
      if (termCta) termCta.innerHTML =
        `<span class="cta-label">TYPE</span>` +
        `<span class="cta-cmd">entire checkpoint search "&lt;word&gt;"</span>`;
    }
  }
  function openTerminal() {
    if (terminalOpen) return;
    terminalOpen = true;
    buffer = "";
    fp.detach();
    termMsg?.classList.remove("show-ok", "show-err");
    termList?.classList.add("hidden");
    termEl?.classList.remove("hidden");
    teachOnce("terminal",
      "The whole archive is searchable from here — every checkpoint ever banked. The ship's request contains the word you need.", 8000);
    renderTerminal();
  }
  function closeTerminal(dismiss) {
    if (!terminalOpen) return;
    if (dismiss) consoleDismissed = true;
    terminalOpen = false;
    buffer = "";
    termEl?.classList.add("hidden");
    termList?.classList.add("hidden");
    if (active && !failed) fp.attach();
  }

  // ---------- entire checkpoint search ----------
  function doSearch(raw) {
    const q = raw.replace(/^.*?search/i, "").replace(/["']/g, "").trim().toLowerCase();
    const words = q.split(/\s+/).filter((w) => w.length >= 3);
    if (!words.length) {
      flashTerminal('search needs a word — try:  entire checkpoint search "<word>"', false);
      return;
    }
    const scored = blocks
      .map((b) => ({
        b,
        score: words.filter((w) => b.entry.summary.toLowerCase().includes(w)).length,
      }))
      .filter((r) => r.score > 0)
      .sort((a, c) => c.score - a.score);
    if (!scored.length) {
      flashTerminal(`0 results for “${q}” — try a word from the ship's request`, false);
      return;
    }
    // Light only this search's matches; the previous search goes dark.
    for (const b of blocks) {
      b.lit = !b.grabbed && scored.some((r) => r.b === b);
      applyBlockVisuals(b);
    }
    if (termList) {
      termList.innerHTML = scored.map(({ b }) =>
        `<div class="term-list-row"><span class="tl-id tl-id-short">${b.entry.id}</span>` +
        `<span class="tl-title">${b.entry.summary}</span></div>`
      ).join("");
      termList.classList.remove("hidden");
    }
    flashTerminal(
      `${scored.length} checkpoint${scored.length === 1 ? "" : "s"} matched “${q}” — ` +
      `${scored.length === 1 ? "a beam just lit" : "beams just lit"} on the island`, true);
    teachOnce("searched",
      "Found it — its beam is lit. Esc closes the terminal; run to the beam and press E to transmit.", 8000);
    renderTerminal();
  }

  // `entire checkpoint list` still works — and shows why search exists.
  function doList() {
    if (termList) {
      termList.innerHTML = blocks.map((b) =>
        `<div class="term-list-row"><span class="tl-id tl-id-short">${b.entry.id}</span>` +
        `<span class="tl-title">${b.entry.summary}</span></div>`
      ).join("");
      termList.classList.remove("hidden");
    }
    flashTerminal(`${blocks.length} checkpoints in the archive — too many to read. search for the one the ship wants`, true);
  }

  function submitCommand() {
    const n = normalizeCmd(buffer);
    buffer = "";
    if (!n) { renderTerminal(); return; }
    if (/^entire (checkpoint|cp) search\b/.test(n)) { doSearch(n); return; }
    if (/^entire (checkpoint|cp) list$/.test(n)) { doList(); renderTerminal(); return; }
    flashTerminal('command not recognized — try:  entire checkpoint search "<word>"', false);
    renderTerminal();
  }

  // ---------- transmitting (the E-grab) ----------
  function tryTransmit(b) {
    if (b.grabbed) return;
    if (!b.lit) {
      teachOnce("dark-block",
        "It's dark — the archive only lights what you search for. Use the terminal.", 5000);
      return;
    }
    const req = currentRequest();
    if (!req || b.entry.id !== req.targetId) {
      showTutorial("Not the one the ship asked for — re-read the request (top left).", 4500);
      return;
    }
    b.grabbed = true;
    for (const blk of blocks) { blk.lit = false; applyBlockVisuals(blk); }
    reqIndex += 1;
    updateRequest();
    if (reqIndex >= REQUESTS.length) {
      winLevel();
    } else {
      consoleDismissed = false;
      showTutorial(`Transmitted ✓ (${reqIndex} / ${REQUESTS.length}) — back to the terminal for the next request.`, 6500);
    }
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
    if (e.code === "KeyE" && nearBlock && !won) { tryTransmit(nearBlock); e.preventDefault(); return; }
    if (e.code === "KeyM") { setMap(!overhead.on); e.preventDefault(); return; }
    if (e.code === "Escape" && fp.isLocked) fp.unlock();
    if (e.code === "KeyB") onExit?.();
  }
  fp.controls.addEventListener("lock", () => crosshair?.classList.remove("hidden"));
  fp.controls.addEventListener("unlock", () => crosshair?.classList.add("hidden"));

  // ---------- HUD per-frame ----------
  let nearBlock = null;
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
    if (won) { setPrompt("Archive linked — press B to return to orbit"); return; }
    if (nearBlock) {
      if (nearBlock.grabbed) setPrompt("Already transmitted — the ship has this one");
      else if (nearBlock.lit) setPrompt("Press E — transmit to the ship");
      else setPrompt("A dark archive block — the terminal can find it by name");
      return;
    }
    if (blocks.some((b) => b.lit)) {
      setPrompt("Follow the lit beam — press E at the block to transmit");
      return;
    }
    setPrompt("Read the ship's request, then search at the gold-beam terminal");
  }

  // ---------- per-frame ----------
  function update(dt, t) {
    fp.update(dt);

    // Level countdown — one clock for the whole run.
    if (active && timerRunning && !failed && !won) {
      timeLeft = Math.max(0, timeLeft - dt);
      updateClock();
      if (timeLeft <= 0) failLevel();
    }
    applyPanicSky();

    // Lit beams pulse so they read as "go here" from across the island.
    for (const b of blocks) {
      if (b.lit) b.beam.material.opacity = 0.45 + Math.sin(t * 2.5) * 0.15;
      // Ids stay anonymous from afar; reveal when lit, grabbed, or walked up to.
      if (!b.grabbed && !b.lit) {
        const d = Math.hypot(
          camera.position.x - b.anchor.position.x,
          camera.position.z - b.anchor.position.z
        );
        b.sprite.visible = d <= SPRITE_DIST;
      }
    }

    // Proximity: nearest archive block, and the ship terminal.
    nearBlock = null;
    let nd = Infinity;
    for (const b of blocks) {
      const d = Math.hypot(
        camera.position.x - b.anchor.position.x,
        camera.position.z - b.anchor.position.z
      );
      if (d < nd) { nd = d; if (d <= INTERACT_DIST) nearBlock = b; }
    }
    nearConsole = Math.hypot(
      camera.position.x - CONSOLE_POS.x, camera.position.z - CONSOLE_POS.z
    ) <= CONSOLE_DIST;

    // The terminal opens itself when you reach the console, like Level 1.
    if (active && started && !failed && !won) {
      if (consoleDismissed && !nearConsole) consoleDismissed = false;
      if (nearConsole && !terminalOpen && !consoleDismissed) openTerminal();
      else if (!nearConsole && terminalOpen) closeTerminal(false);
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
    l2Hud?.classList.remove("hidden");
    fpShared?.classList.remove("hidden");
    setControls(false);
    crosshair?.classList.add("hidden");
    updateRequest();
    if (!started) {
      showBriefing();
    } else if (won) {
      fp.attach();
      winEl?.classList.remove("hidden");
    } else if (failed) {
      resetLevel();                 // came back after a wipe → fresh run
    } else {
      fp.attach();
      timerRunning = true;          // resume the level clock
      showTutorial("The ship is still waiting — read its request and search the archive.", 6000);
    }
    updateClock();
    applyPanicSky();
  }
  function exit() {
    active = false;
    timerRunning = false;           // pause the clock while in orbit
    setMap(false);
    closeTerminal(false);
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
    l2Hud?.classList.add("hidden");
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
