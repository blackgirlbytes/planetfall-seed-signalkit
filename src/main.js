import * as THREE from "three";
import { createPlanetView } from "./planetView.js";
import { createIslandView } from "./islandView.js";
import { createDroneBayView } from "./droneBayView.js";
import { createArchiveView } from "./archiveView.js";
import { createLaunchView } from "./launchView.js";
import { createTitleScreen } from "./titleScreen.js";
import { loadLeaderboard } from "./leaderboard.js";
import { createLeaderboardPanel } from "./leaderboardPanel.js";
import { sfx } from "./sfx.js";

const canvas = document.getElementById("scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.92;
renderer.outputColorSpace = THREE.SRGBColorSpace;

// ---------- background music ----------
const bgm = document.getElementById("bgm");
const audioPanel = document.getElementById("audio-panel");
const audioToggle = document.getElementById("audio-toggle");
const audioMute = document.getElementById("audio-mute");
const audioVolume = document.getElementById("audio-volume");
let userPausedMusic = false;

if (bgm && audioPanel && audioToggle && audioMute && audioVolume) {
  bgm.volume = Number(audioVolume.value);
  bgm.autoplay = true;
  bgm.loop = true;

  const updateAudioUi = () => {
    const playing = !bgm.paused;
    const awaitingStart = !playing && !userPausedMusic;
    audioPanel.classList.toggle("is-awaiting-start", awaitingStart);
    audioToggle.classList.toggle("is-playing", playing);
    audioToggle.setAttribute("aria-label", playing ? "Pause music" : "Start music");
    audioToggle.title = playing ? "Pause music" : "Start music";
    audioMute.classList.toggle("is-muted", bgm.muted || bgm.volume === 0);
    audioMute.setAttribute("aria-label", bgm.muted ? "Unmute music" : "Mute music");
    audioMute.title = bgm.muted ? "Unmute music" : "Mute music";
  };

  const tryPlayMusic = () => {
    if (userPausedMusic) return;
    bgm.play().then(updateAudioUi).catch(updateAudioUi);
  };

  // Sidechain ducking: dip the music instantly on a hit, then ramp it back to
  // the player's set volume so the SFX punch through a momentary hole.
  let duckRAF = null;
  const duckMusic = (depth = 0.5, ms = 350) => {
    if (bgm.muted) return;
    const base = Number(audioVolume.value);
    const floor = Math.max(0, base * depth);
    bgm.volume = floor;
    const start = performance.now();
    cancelAnimationFrame(duckRAF);
    const step = (now) => {
      const t = Math.min(1, (now - start) / ms);
      bgm.volume = floor + (base - floor) * t;
      if (t < 1) duckRAF = requestAnimationFrame(step);
    };
    duckRAF = requestAnimationFrame(step);
  };
  sfx.setDucker(duckMusic);
  const removeGestureMusicStart = () => {
    for (const eventName of ["pointerdown", "click", "keydown", "touchstart"]) {
      window.removeEventListener(eventName, startMusicOnGesture, true);
    }
  };
  const startMusicOnGesture = (event) => {
    if (event.target?.closest?.("#audio-panel")) return;
    tryPlayMusic();
  };

  audioToggle.addEventListener("click", () => {
    if (bgm.paused) {
      userPausedMusic = false;
      tryPlayMusic();
    } else {
      userPausedMusic = true;
      bgm.pause();
      updateAudioUi();
    }
  });

  audioMute.addEventListener("click", () => {
    bgm.muted = !bgm.muted;
    updateAudioUi();
  });

  audioVolume.addEventListener("input", () => {
    bgm.volume = Number(audioVolume.value);
    if (bgm.volume > 0 && bgm.muted) bgm.muted = false;
    updateAudioUi();
  });

  bgm.addEventListener("play", () => {
    removeGestureMusicStart();
    updateAudioUi();
  });
  bgm.addEventListener("pause", updateAudioUi);
  bgm.addEventListener("volumechange", updateAudioUi);

  for (const eventName of ["pointerdown", "click", "keydown", "touchstart"]) {
    window.addEventListener(eventName, startMusicOnGesture, true);
  }

  tryPlayMusic();
  updateAudioUi();
}

const params = new URLSearchParams(location.search);
const requestedView = params.get("view");
const normalizedPath = location.pathname.replace(/\/+$/, "") || "/";
const isLeaderboardRoute = normalizedPath === "/leaderboard";

function normalizeEndOutcome(value) {
  const v = String(value || "").trim().toLowerCase();
  if (["success", "succeed", "succeeded", "win", "won", "pass", "passed"].includes(v)) return "success";
  if (["fail", "failed", "failure", "miss", "missed", "loss", "lose", "lost"].includes(v)) return "failure";
  return null;
}

function parseEndShortcut() {
  const directOutcome =
    normalizeEndOutcome(params.get("end")) ||
    normalizeEndOutcome(params.get("result")) ||
    normalizeEndOutcome(params.get("outcome"));
  const explicitLevel = Number(params.get("level"));
  const viewLevel = requestedView === "island" ? 1
    : requestedView === "level2" ? 2
    : requestedView === "level3" ? 3 : null;
  let level = [1, 2, 3].includes(explicitLevel) ? explicitLevel : viewLevel;
  let outcome = directOutcome;

  const skip = params.get("skip") || params.get("shortcut");
  if (skip) {
    const compact = skip.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const levelMatch = compact.match(/(?:level|lvl|l)?([123])/);
    const outcomeMatch = compact.match(/success|succeed|succeeded|win|won|pass|passed|fail|failed|failure|miss|missed|loss|lose|lost/);
    if (!level && levelMatch) level = Number(levelMatch[1]);
    if (!outcome && outcomeMatch) outcome = normalizeEndOutcome(outcomeMatch[0]);
  }

  if (!outcome && params.has("success")) outcome = "success";
  if (!outcome && params.has("fail")) outcome = "failure";
  return level && outcome ? { level, outcome } : null;
}

const endShortcut = parseEndShortcut();
const jumpToLevel2 = endShortcut?.level === 2 || requestedView === "level2" || params.get("level") === "2";
const jumpToLevel3 = endShortcut?.level === 3 || requestedView === "level3" || params.get("level") === "3";

// ---------- views ----------
// After Level 1's `entire checkpoint list`, the ship wakes its drone bay:
// the orbit pin glitches and landing again enters Level 2 ("The Drone Bay").
// After Level 2's `entire dispatch`, the launch window opens: landing again
// enters Level 3 ("Launch Clearance") — the finale.
// The shelved search level ("The Archive") stays reachable at ?view=archive.
let level1Done = jumpToLevel2 || jumpToLevel3;
let level2Done = jumpToLevel3;

function startNewGame() {
  const cleanUrl = new URL(window.location.href);
  cleanUrl.pathname = "/";
  cleanUrl.search = "";
  cleanUrl.hash = "";
  window.location.assign(cleanUrl.href);
}

// The planet/orbit view is the initial paint and the attract backdrop behind
// the title, so it is built eagerly. Every other view allocates a heavy
// Three.js scene in its constructor, so we defer that work behind memoized
// getters: a view is only constructed the first time it is entered (or a dev
// shortcut requests it directly). The Archive in particular never gets built
// during normal Level 1 -> 2 -> 3 progression — only via ?view=archive.
const planetView = createPlanetView(renderer, {
  onIslandClick: () => switchTo(
    level2Done ? getLaunchView() : level1Done ? getDroneBayView() : getIslandView()
  ),
});
// Success carries you forward (onNext); failure only ever offers R to retry.
let islandView, droneBayView, archiveView, launchView;
function getIslandView() {
  return islandView ??= createIslandView(renderer, {
    onExit: () => switchTo(planetView),
    onComplete: () => { level1Done = true; },
    onNext: () => switchTo(getDroneBayView()),
    onNewGame: startNewGame,
  });
}
function getDroneBayView() {
  return droneBayView ??= createDroneBayView(renderer, {
    onExit: () => switchTo(planetView),
    onComplete: () => { level2Done = true; },
    onNext: () => switchTo(getLaunchView()),
    onNewGame: startNewGame,
  });
}
function getArchiveView() {
  return archiveView ??= createArchiveView(renderer, {
    onExit: () => switchTo(planetView),
    onNewGame: startNewGame,
  });
}
function getLaunchView() {
  return launchView ??= createLaunchView(renderer, {
    onExit: () => switchTo(planetView),
    onNewGame: startNewGame,
  });
}

// Default to the orbit view; ?view=island jumps straight to Level 1,
// ?view=level2 (or ?level=2) to Level 2, ?view=level3 (or ?level=3) to the
// finale, ?view=archive to the shelved search level — handy for development.
let current = requestedView === "island" ? getIslandView()
  : endShortcut?.level === 1 ? getIslandView()
  : requestedView === "archive" ? getArchiveView()
  : jumpToLevel3 ? getLaunchView()
  : jumpToLevel2 ? getDroneBayView() : planetView;
current.enter();
endShortcut && current.skipToEnd?.(endShortcut.outcome);

let resumeTitleAfterLeaderboard = null;
let titleLeaderboardRequest = 0;
const titleLeaderboardPanel = createLeaderboardPanel({
  mount: document.getElementById("ui"),
  onClose: closeTitleLeaderboard,
});

function closeTitleLeaderboard() {
  titleLeaderboardRequest += 1;
  titleLeaderboardPanel.hide();
  if (isLeaderboardRoute) {
    startNewGame();
    return;
  }
  const resume = resumeTitleAfterLeaderboard;
  resumeTitleAfterLeaderboard = null;
  resume?.();
}

async function showTitleLeaderboard(resumeTitle) {
  const requestId = ++titleLeaderboardRequest;
  resumeTitleAfterLeaderboard = resumeTitle;
  titleLeaderboardPanel.showBoard([], {
    title: "Leaderboard",
    label: "Loading scores",
    emptyText: "Loading...",
  });

  const result = await loadLeaderboard();
  if (requestId !== titleLeaderboardRequest) return;

  titleLeaderboardPanel.showBoard(result.entries, {
    title: "Leaderboard",
    label: "Top 10 overall",
    emptyText: result.error ? "Leaderboard unavailable" : "No scores yet",
  });
}

// Title screen on a clean boot only — the dev shortcuts skip straight in.
// While it's up the orbit view runs behind it as the attract backdrop.
// When the story starts, bring the landing marker into the transmission shot
// and hold it there. The final beat can then tell the player to click what is
// already on screen.
const titleScreen = createTitleScreen({
  onLeaderboard: showTitleLeaderboard,
  onStoryStart: () => {
    planetView.reframe();
    planetView.setLandingMarkerHold(true);
  },
  onStart: () => planetView.setLandingMarkerHold(false),
});
if (isLeaderboardRoute) {
  document.body.classList.add("leaderboard-route");
  showTitleLeaderboard();
} else if (!requestedView && !params.get("level") && !endShortcut) {
  titleScreen.show();
}

// ---------- fade transition ----------
const fade = document.getElementById("fade");
const hint = document.getElementById("hint");
const pin = document.getElementById("island-pin");
let transitioning = false;

function refreshOrbitHud() {
  hint.classList.toggle("hidden", current !== planetView);
  hint.textContent = level2Done
    ? "The launch window is open — the ship is asking for you. Click the pin to board"
    : level1Done
    ? "A new signal — the ship's drone bay just woke up. Click the pin to land"
    : "Drag to orbit · Scroll to zoom · Click the pin to land";
  pin?.classList.toggle("is-corrupted", level1Done && !level2Done);
}
refreshOrbitHud();

function switchTo(view) {
  if (transitioning || view === current) return;
  transitioning = true;
  fade.classList.add("show");
  setTimeout(() => {
    current.exit();
    current = view;
    current.enter();
    refreshOrbitHud();
    fade.classList.remove("show");
    transitioning = false;
  }, 650); // match #fade CSS transition
}

// ---------- resize ----------
window.addEventListener("resize", () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  // Resize only views that have actually been constructed — never force-build a
  // deferred view just to resize it.
  for (const view of [planetView, islandView, droneBayView, archiveView, launchView]) {
    view?.resize();
  }
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
