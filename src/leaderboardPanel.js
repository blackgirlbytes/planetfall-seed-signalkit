import { saveLeaderboardEntry } from "./leaderboard.js";

let panelCount = 0;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[ch]);
}

export function createLeaderboardPanel({ mount, onClose } = {}) {
  const id = `leaderboard-${++panelCount}`;
  const panel = document.createElement("div");
  panel.className = "leaderboard hidden";
  panel.innerHTML = `
    <div class="lb-head">
      <div>
        <div class="lb-kicker" data-lb-kicker>Your result</div>
        <div class="lb-title" data-lb-title>Game over</div>
      </div>
      <div class="lb-score" data-lb-score>Score 0</div>
    </div>
    <div class="lb-entry" data-lb-entry>
      <p class="lb-copy">Enter a username to save your score.</p>
      <form class="lb-form" data-lb-form>
        <label for="${id}-name">Username</label>
        <div class="lb-submit-row">
          <input id="${id}-name" name="username" type="text" maxlength="18" autocomplete="nickname" spellcheck="false" placeholder="username" />
          <button type="submit">Save score</button>
        </div>
      </form>
    </div>
    <div class="lb-board hidden" data-lb-board>
      <div class="lb-board-label">Top 10 overall</div>
      <div class="lb-table-head" aria-hidden="true">
        <span>#</span><span>Name</span><span>Score</span>
        <span>#</span><span>Name</span><span>Score</span>
      </div>
      <ol class="lb-list" data-lb-list></ol>
      <button class="lb-back" type="button" data-lb-back>Back</button>
    </div>
    <div class="lb-status" data-lb-status></div>
  `;
  mount?.appendChild(panel);

  const kickerEl = panel.querySelector("[data-lb-kicker]");
  const titleEl = panel.querySelector("[data-lb-title]");
  const scoreEl = panel.querySelector("[data-lb-score]");
  const entryEl = panel.querySelector("[data-lb-entry]");
  const boardEl = panel.querySelector("[data-lb-board]");
  const boardLabelEl = panel.querySelector(".lb-board-label");
  const formEl = panel.querySelector("[data-lb-form]");
  const inputEl = panel.querySelector("input");
  const submitEl = panel.querySelector("button[type='submit']");
  const backEl = panel.querySelector("[data-lb-back]");
  const statusEl = panel.querySelector("[data-lb-status]");
  const listEl = panel.querySelector("[data-lb-list]");

  let currentRun = null;
  let saved = false;

  function setStatus(text, tone = "") {
    statusEl.textContent = text;
    statusEl.classList.toggle("is-error", tone === "error");
  }

  function renderRows(entries, emptyText = "No scores yet") {
    boardEl.classList.toggle("is-short", entries.length <= 5);
    if (!entries.length) {
      listEl.innerHTML = `<li class="lb-empty">${escapeHtml(emptyText)}</li>`;
      return;
    }
    listEl.innerHTML = entries.map((entry, i) => {
      const scoreText = entry.score.toLocaleString();
      const scoreClass = scoreText.length > 10 ? " is-huge-score"
        : scoreText.length > 7 ? " is-long-score" : "";
      return `<li class="lb-row">` +
        `<span class="lb-rank">${String(i + 1).padStart(2, "0")}</span>` +
        `<span class="lb-player">` +
          `<span class="lb-name">${escapeHtml(entry.username)}</span>` +
        `</span>` +
        `<span class="lb-points${scoreClass}">${scoreText}</span>` +
      `</li>`;
    }).join("");
  }

  function showEntryPage() {
    entryEl.classList.remove("hidden");
    boardEl.classList.add("hidden");
    panel.classList.add("is-entry");
    panel.classList.remove("is-board");
  }

  function showBoardPage() {
    entryEl.classList.add("hidden");
    boardEl.classList.remove("hidden");
    panel.classList.add("is-board");
    panel.classList.remove("is-entry");
  }

  function show(run, { title } = {}) {
    currentRun = run;
    saved = false;
    kickerEl.textContent = run.completedGame ? "Final score" : `Level ${run.level}`;
    titleEl.textContent = title || (run.completedGame ? "Game complete" : "Game over");
    scoreEl.textContent = `Score ${run.score.toLocaleString()}`;
    inputEl.disabled = false;
    inputEl.value = localStorage.getItem("planetfall:lastName") || "";
    submitEl.disabled = false;
    submitEl.textContent = "Save score";
    formEl.classList.remove("is-saved");
    panel.classList.remove("hidden");
    showEntryPage();
    setStatus("");
    requestAnimationFrame(() => inputEl.focus({ preventScroll: true }));
  }

  function showBoard(entries = [], { title = "Leaderboard", label = "Top 10 overall", emptyText } = {}) {
    currentRun = null;
    saved = false;
    titleEl.textContent = title;
    boardLabelEl.textContent = label;
    scoreEl.textContent = "";
    formEl.classList.remove("is-saved");
    panel.classList.remove("hidden");
    showBoardPage();
    renderRows(entries, emptyText);
    setStatus("");
    requestAnimationFrame(() => backEl.focus({ preventScroll: true }));
  }

  function hide() {
    currentRun = null;
    saved = false;
    panel.classList.add("hidden");
    showEntryPage();
    setStatus("");
    boardLabelEl.textContent = "Top 10 overall";
    boardEl.classList.remove("is-short");
    listEl.innerHTML = "";
  }

  formEl.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentRun || saved) return;
    const username = inputEl.value.trim();
    if (!/^[a-zA-Z0-9 ._-]{2,18}$/.test(username)) {
      setStatus("Enter a name using 2-18 letters, numbers, spaces, dots, dashes, or underscores.", "error");
      inputEl.focus();
      return;
    }

    saved = true;
    localStorage.setItem("planetfall:lastName", username);
    submitEl.disabled = true;
    submitEl.textContent = "Saving...";
    setStatus("Saving score...");
    try {
      const result = await saveLeaderboardEntry({ ...currentRun, username });
      showBoardPage();
      kickerEl.textContent = "Score saved";
      titleEl.textContent = "Leaderboard";
      renderRows(result.entries);
      setStatus("Score saved.");
      formEl.classList.add("is-saved");
      inputEl.disabled = true;
      submitEl.textContent = "Saved";
      requestAnimationFrame(() => backEl.focus({ preventScroll: true }));
    } catch {
      saved = false;
      submitEl.disabled = false;
      submitEl.textContent = "Save score";
      setStatus("Leaderboard unavailable. Run npm run dev:vercel locally to use the database.", "error");
      inputEl.focus();
    }
  });

  backEl.addEventListener("click", () => {
    if (onClose) onClose();
    else hide();
  });

  return {
    focusInput: () => (inputEl.disabled ? backEl : inputEl).focus({ preventScroll: true }),
    hide,
    isVisible: () => !panel.classList.contains("hidden"),
    show,
    showBoard,
    containsTarget: target => panel.contains(target),
  };
}
