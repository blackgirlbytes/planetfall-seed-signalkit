import * as THREE from "three";
import { createPlanetView } from "./planetView.js";
import { createIslandView } from "./islandView.js";

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

// ---------- views ----------
const planetView = createPlanetView(renderer, {
  onIslandClick: () => switchTo(islandView),
});
const islandView = createIslandView(renderer, {
  onExit: () => switchTo(planetView),
});

// Default to the orbit view; ?view=island jumps straight onto the island
// (handy for development — pointer-lock still needs a real click).
let current = new URLSearchParams(location.search).get("view") === "island"
  ? islandView : planetView;
current.enter();

// ---------- fade transition ----------
const fade = document.getElementById("fade");
const hint = document.getElementById("hint");
let transitioning = false;
hint.classList.toggle("hidden", current !== planetView);

function switchTo(view) {
  if (transitioning || view === current) return;
  transitioning = true;
  fade.classList.add("show");
  setTimeout(() => {
    current.exit();
    current = view;
    current.enter();
    hint.classList.toggle("hidden", current !== planetView);
    fade.classList.remove("show");
    transitioning = false;
  }, 650); // match #fade CSS transition
}

// ---------- resize ----------
window.addEventListener("resize", () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  planetView.resize();
  islandView.resize();
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
