const API_PATH = "/api/leaderboard";
const DISPLAY_LIMIT = 10;
const MAX_LEVEL = 4;

const LEVEL_BASE = {
  1: 0,
  2: 50,
  3: 100,
  4: 150,
};
const PROGRESS_POINTS = 10;
const EXTRA_PROGRESS_POINTS = 3;
const GAME_CLEAR_BONUS = 50;
const SPEED_POINTS = 1;
const MISTAKE_PENALTY = 5;
const DURATION_PENALTY_SECONDS = 10;

function canUseRemoteApi() {
  return !import.meta.env?.DEV || import.meta.env?.VITE_USE_REMOTE_LEADERBOARD === "1";
}

function clampInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.round(n));
}

function clampLevel(value) {
  const level = clampInt(value, MAX_LEVEL);
  return Math.min(MAX_LEVEL, Math.max(1, level));
}

export function computeLeaderboardScore(entry) {
  const level = clampLevel(entry.level ?? entry.levelReached);
  const completed = clampInt(entry.progressCompleted ?? entry.questionsCompleted);
  const total = Math.max(1, clampInt(entry.progressTotal, level === MAX_LEVEL ? 3 : 1));
  const requiredProgress = Math.min(completed, total);
  const extraProgress = Math.max(0, completed - total);
  const completedGame = Boolean(entry.completedGame) || (entry.outcome === "win" && level === MAX_LEVEL);
  const speedBonus = completedGame ? clampInt(entry.timeRemaining) * SPEED_POINTS : 0;
  const clearBonus = completedGame ? GAME_CLEAR_BONUS : 0;
  const mistakePenalty = clampInt(entry.mistakes) * MISTAKE_PENALTY;
  const durationPenalty = completedGame || completed <= 0
    ? 0
    : Math.floor(clampInt(entry.durationSeconds) / DURATION_PENALTY_SECONDS);

  return Math.max(
    0,
    LEVEL_BASE[level] +
      clearBonus +
      requiredProgress * PROGRESS_POINTS +
      extraProgress * EXTRA_PROGRESS_POINTS +
      speedBonus -
      mistakePenalty -
      durationPenalty
  );
}

function normalizeEntry(entry) {
  const level = clampLevel(entry.level ?? entry.levelReached);
  const outcome = entry.outcome === "win" ? "win" : "loss";
  const completedGame = Boolean(entry.completedGame) || (outcome === "win" && level === MAX_LEVEL);
  const progressCompleted = clampInt(entry.progressCompleted ?? entry.questionsCompleted);
  const progressTotal = Math.max(1, clampInt(entry.progressTotal, level === MAX_LEVEL ? 3 : 1));
  const normalized = {
    id: entry.id || crypto.randomUUID(),
    username: String(entry.username || "Player").trim().slice(0, 18),
    level,
    outcome,
    completedGame,
    score: clampInt(entry.score),
    timeRemaining: completedGame ? clampInt(entry.timeRemaining) : 0,
    durationSeconds: clampInt(entry.durationSeconds),
    progressCompleted,
    progressTotal,
    mistakes: clampInt(entry.mistakes),
    createdAt: entry.createdAt || new Date().toISOString(),
  };

  if (!normalized.score) normalized.score = computeLeaderboardScore(normalized);
  return normalized;
}

async function requestJson(path, options) {
  if (!canUseRemoteApi()) {
    const err = new Error("Leaderboard API is disabled in Vite-only dev");
    err.status = 0;
    throw err;
  }
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const err = new Error("Leaderboard API did not return JSON");
    err.status = res.status;
    throw err;
  }
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(payload.error || "Leaderboard request failed");
    err.status = res.status;
    throw err;
  }
  return payload;
}

export function createLeaderboardEntry({
  level,
  outcome,
  totalTime,
  timeLeft,
  durationSeconds,
  progressCompleted,
  progressTotal,
  mistakes,
}) {
  const normalizedLevel = clampLevel(level);
  const normalizedOutcome = outcome === "win" ? "win" : "loss";
  const completedGame = normalizedOutcome === "win" && normalizedLevel === MAX_LEVEL;
  const remaining = completedGame ? clampInt(timeLeft) : 0;
  const fallbackDuration = Math.max(0, clampInt(totalTime) - remaining);
  const entry = {
    level: normalizedLevel,
    outcome: normalizedOutcome,
    completedGame,
    timeRemaining: remaining,
    durationSeconds: clampInt(durationSeconds, fallbackDuration),
    progressCompleted: clampInt(progressCompleted),
    progressTotal: Math.max(1, clampInt(progressTotal, normalizedLevel === MAX_LEVEL ? 3 : 1)),
    mistakes: clampInt(mistakes),
  };

  return {
    ...entry,
    score: computeLeaderboardScore(entry),
  };
}

export async function loadLeaderboard() {
  try {
    const payload = await requestJson(`${API_PATH}?limit=${DISPLAY_LIMIT}`);
    return { entries: payload.entries.map(normalizeEntry), source: payload.source || "database" };
  } catch (error) {
    return {
      entries: [],
      error: error.message,
      source: "unavailable",
    };
  }
}

export async function saveLeaderboardEntry(entry) {
  const normalized = normalizeEntry(entry);

  const payload = await requestJson(API_PATH, {
    method: "POST",
    body: JSON.stringify(normalized),
  });
  return {
    entry: normalizeEntry(payload.entry),
    entries: payload.entries.map(normalizeEntry),
    source: payload.source || "database",
  };
}
