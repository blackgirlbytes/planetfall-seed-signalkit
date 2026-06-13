// Title screen — the arcade boot menu shown over the orbit view on first
// load. START GAME dismisses it; OPTIONS holds CONTROLS and SOUND. Sound
// drives the existing #audio-panel controls (the canonical music state) so
// this menu and the in-game panel can never disagree.
// The opening story — an unnamed storybook narrator (the Bug Bash register):
// third person about the world, then the last beat turns to the player with
// the goal. Plain words on purpose; no idioms, no jargon.
const STORY_BEATS = [
  "The old world was built for people who write code. It saved every line, forever.",
  "Then the way we build changed. Now humans and AI agents build together. You love working this way.",
  "But the old world was made for humans only. There was not enough space for everyone. So you left for a new world — in your own spaceship, with your five subagent friends.",
  "On the way, the ship broke down and crashed on a strange planet. The pieces that keep it running fell out, scattered across an island.",
  "Bring the pieces back. Wake your friends. Fix the ship — and fly again.",
];

export function createTitleScreen({ onStart } = {}) {
  const root = document.getElementById("title-screen");
  const screens = {
    main: document.getElementById("ts-main"),
    options: document.getElementById("ts-options"),
    controls: document.getElementById("ts-controls"),
    display: document.getElementById("ts-display"),
    sound: document.getElementById("ts-sound"),
  };
  const parentOf = {
    options: "main",
    controls: "options",
    display: "options",
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
  const tvState = document.getElementById("ts-tv-state");

  // The TV effect (scanlines + vignette) is on by default; the choice is
  // remembered between visits.
  const TV_KEY = "pf-tv-effect";
  document.body.classList.toggle("tv-on", localStorage.getItem(TV_KEY) !== "off");

  function syncDisplay() {
    const on = document.body.classList.contains("tv-on");
    tvState.textContent = on ? "ON" : "OFF";
    tvState.classList.toggle("is-off", !on);
  }

  function toggleTv() {
    const on = !document.body.classList.contains("tv-on");
    document.body.classList.toggle("tv-on", on);
    localStorage.setItem(TV_KEY, on ? "on" : "off");
    syncDisplay();
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
    if (name === "sound") syncSound();
    if (name === "display") syncDisplay();
  }

  function back() {
    if (parentOf[screenName]) setScreen(parentOf[screenName]);
  }

  function startStory() {
    storyBeat = -1;
    root.classList.add("is-story");
    for (const el of Object.values(screens)) el.classList.add("hidden");
    story.classList.remove("hidden");
    nextBeat();
  }

  function nextBeat() {
    storyBeat += 1;
    if (storyBeat >= STORY_BEATS.length) {
      finishStory();
      return;
    }
    storyText.textContent = STORY_BEATS[storyBeat];
    storyNext.textContent = storyBeat === STORY_BEATS.length - 1 ? "▸ BEGIN" : "▸";
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
      case "options": setScreen("options"); break;
      case "controls": setScreen("controls"); break;
      case "display": setScreen("display"); break;
      case "sound": setScreen("sound"); break;
      case "music-toggle": toggleMusic(); break;
      case "tv-toggle": toggleTv(); break;
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
    root.classList.remove("hidden", "is-leaving", "is-story");
    document.body.classList.add("title-up");
    setScreen("main");
    syncSound();
  }

  function hide() {
    active = false;
    document.body.classList.remove("title-up");
    root.classList.add("is-leaving");
    setTimeout(() => root.classList.add("hidden"), 650); // match the CSS fade
  }

  return { show };
}
