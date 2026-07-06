// Title screen — the arcade boot menu shown over the orbit view on first
// load. START GAME dismisses it; OPTIONS holds CONTROLS and SOUND. Sound
// drives the existing #audio-panel controls (the canonical music state) so
// this menu and the in-game panel can never disagree.
// The opening story — a transmission from the rebellion, addressed to the
// downed pilot (the player). It hands the player a mission without naming any
// gameplay so the levels can change underneath it. In three beats, it explains
// the crash, gives the mission, and ends by promoting "Pilot" to "rebel".
const STORY_BEATS = [
  "Pilot, if you can read this, your ship survived the crash, but it needs repairs.",
  "Your ship's records are scattered across the planet. Your mission: recover the records and repair the ship.",
  "Click the landing marker to begin. See you soon, rebel.",
];

import { sfx } from "./sfx.js";

export function createTitleScreen({ onLeaderboard, onStoryStart, onStart } = {}) {
  const root = document.getElementById("title-screen");
  const screens = {
    main: document.getElementById("ts-main"),
    options: document.getElementById("ts-options"),
    controls: document.getElementById("ts-controls"),
    sound: document.getElementById("ts-sound"),
  };
  const parentOf = {
    options: "main",
    controls: "options",
    sound: "options",
  };
  const story = document.getElementById("ts-story");
  const storyText = document.getElementById("ts-story-text");
  const storyNext = document.getElementById("ts-story-next");

  const bgm = document.getElementById("bgm");
  const audioToggle = document.getElementById("audio-toggle");
  const audioVolume = document.getElementById("audio-volume");
  const musicState = document.getElementById("ts-music-state");
  const volume = document.getElementById("ts-volume");
  const volumePct = document.getElementById("ts-volume-pct");
  const sfxState = document.getElementById("ts-sfx-state");

  // Sound effects are on by default; the choice is remembered between visits.
  const SFX_KEY = "pf-sfx";
  let sfxOn = localStorage.getItem(SFX_KEY) !== "off";
  sfx.setMuted(!sfxOn);

  function syncSfx() {
    if (!sfxState) return;
    sfxState.textContent = sfxOn ? "ON" : "OFF";
    sfxState.classList.toggle("is-off", !sfxOn);
  }

  function toggleSfx() {
    sfxOn = !sfxOn;
    localStorage.setItem(SFX_KEY, sfxOn ? "on" : "off");
    sfx.setMuted(!sfxOn);
    syncSfx();
  }

  let active = false;
  let screenName = "main";
  let items = [];
  let sel = 0;
  let storyBeat = -1; // -1 = not in the story; otherwise index into STORY_BEATS

  function syncSound() {
    if (!bgm) return;
    const playing = !bgm.paused;
    musicState.textContent = playing ? "ON" : "OFF";
    musicState.classList.toggle("is-off", !playing);
    volume.value = String(bgm.volume);
    volumePct.textContent = `${Math.round(bgm.volume * 100)}%`;
  }
  bgm?.addEventListener("play", syncSound);
  bgm?.addEventListener("pause", syncSound);
  bgm?.addEventListener("volumechange", syncSound);

  function setVolume(v) {
    const clamped = Math.min(1, Math.max(0, v));
    // reflect immediately — the bgm volumechange event arrives async, too
    // late for a rapid second keypress to read the fresh value
    volume.value = String(clamped);
    volumePct.textContent = `${Math.round(clamped * 100)}%`;
    if (audioVolume) {
      // route through the in-game slider so its handler applies + reflects it
      audioVolume.value = String(clamped);
      audioVolume.dispatchEvent(new Event("input"));
    } else if (bgm) {
      bgm.volume = clamped;
    }
  }

  function toggleMusic() {
    if (audioToggle) audioToggle.click();
    else if (bgm) bgm.paused ? bgm.play().catch(() => {}) : bgm.pause();
  }

  function setSel(i) {
    if (!items.length) return;
    sel = (i + items.length) % items.length;
    items.forEach((el, idx) => el.classList.toggle("is-selected", idx === sel));
  }

  function setScreen(name) {
    screenName = name;
    for (const [key, el] of Object.entries(screens)) {
      el.classList.toggle("hidden", key !== name);
    }
    items = [...screens[name].querySelectorAll(".ts-item")];
    setSel(0);
    if (name === "sound") { syncSound(); syncSfx(); }
  }

  function back() {
    if (parentOf[screenName]) setScreen(parentOf[screenName]);
  }

  function startStory() {
    storyBeat = -1;
    root.classList.add("is-story");
    for (const el of Object.values(screens)) el.classList.add("hidden");
    story.classList.remove("hidden");
    onStoryStart?.();
    nextBeat();
  }

  function nextBeat() {
    storyBeat += 1;
    if (storyBeat >= STORY_BEATS.length) {
      finishStory();
      return;
    }
    storyText.textContent = STORY_BEATS[storyBeat];
    storyNext.textContent = storyBeat === STORY_BEATS.length - 1 ? "to begin" : "to continue";
    // retrigger the fade-in for each beat
    storyText.classList.remove("beat-in");
    void storyText.offsetWidth;
    storyText.classList.add("beat-in");
  }

  function finishStory() {
    storyBeat = -1;
    story.classList.add("hidden");
    // keep .is-story on through the leaving fade so the logo/tagline stay
    // hidden — otherwise they flash back in during the 650ms fade-out.
    // show() clears it on the next boot.
    hide();
    onStart?.();
  }

  function activate(el) {
    switch (el?.dataset.action) {
      case "start": startStory(); break;
      case "leaderboard":
        if (onLeaderboard) {
          root.classList.add("is-leaderboard-open");
          active = false;
          onLeaderboard(() => {
            root.classList.remove("is-leaderboard-open");
            active = true;
            setScreen("main");
          });
        }
        break;
      case "options": setScreen("options"); break;
      case "controls": setScreen("controls"); break;
      case "sound": setScreen("sound"); break;
      case "music-toggle": toggleMusic(); break;
      case "sfx-toggle": toggleSfx(); break;
      case "back": back(); break;
    }
  }

  function onKey(e) {
    if (!active) return;
    if (storyBeat >= 0) {
      // in the story: Space/Enter advance, Esc skips straight to the game
      if (e.key === " " || e.key === "Enter") nextBeat();
      else if (e.key === "Escape") finishStory();
      else return;
      e.preventDefault();
      return;
    }
    const item = items[sel];
    const onVolume = item?.dataset.action === "volume";
    switch (e.key) {
      case "ArrowUp": case "w": case "W": setSel(sel - 1); break;
      case "ArrowDown": case "s": case "S": setSel(sel + 1); break;
      case "Enter": case " ": activate(item); break;
      case "Escape": back(); break;
      case "ArrowLeft":
        if (!onVolume) return;
        setVolume(Number(volume.value) - 0.05);
        break;
      case "ArrowRight":
        if (!onVolume) return;
        setVolume(Number(volume.value) + 0.05);
        break;
      default: return;
    }
    e.preventDefault();
  }
  window.addEventListener("keydown", onKey);

  for (const el of root.querySelectorAll(".ts-item")) {
    el.addEventListener("mouseenter", () => {
      const idx = items.indexOf(el);
      if (idx >= 0) setSel(idx);
    });
    el.addEventListener("click", (e) => {
      if (e.target === volume) return; // slider drag, not a menu pick
      const idx = items.indexOf(el);
      if (idx >= 0) setSel(idx);
      activate(el);
    });
  }
  volume?.addEventListener("input", () => setVolume(Number(volume.value)));
  story.addEventListener("click", () => {
    if (storyBeat >= 0) nextBeat();
  });

  function show() {
    active = true;
    storyBeat = -1;
    story.classList.add("hidden");
    root.classList.remove("hidden", "is-leaving", "is-story", "is-leaderboard-open");
    document.body.classList.add("title-up");
    setScreen("main");
    syncSound();
  }

  function hide() {
    active = false;
    document.body.classList.remove("title-up");
    root.classList.remove("is-leaderboard-open");
    root.classList.add("is-leaving");
    setTimeout(() => root.classList.add("hidden"), 650); // match the CSS fade
  }

  return { show };
}
