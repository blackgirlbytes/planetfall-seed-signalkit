import { neon } from "@neondatabase/serverless";

const MAX_LEVEL = 4;
const MAX_LIMIT = 10;
const DEFAULT_LIMIT = 10;
const OUTCOMES = new Set(["win", "loss"]);

const LEVEL_BASE = {
  1: 0,
  2: 50,
  3: 100,
  4: 150,
};

const LEVEL_LIMITS = {
  1: { totalTime: 48, progressTotal: 5, maxProgress: 30, maxMistakes: 40 },
  2: { totalTime: 195, progressTotal: 12, maxProgress: 12, maxMistakes: 60 },
  3: { totalTime: 90, progressTotal: 3, maxProgress: 3, maxMistakes: 40 },
  4: { totalTime: 120, progressTotal: 4, maxProgress: 4, maxMistakes: 40 },
};

const PROGRESS_POINTS = 10;
const EXTRA_PROGRESS_POINTS = 3;
const GAME_CLEAR_BONUS = 50;
const SPEED_POINTS = 1;
const MISTAKE_PENALTY = 5;
const DURATION_PENALTY_SECONDS = 10;

let sqlClient;
let schemaReady;

function getConnectionString() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
}

function getSql() {
  if (!sqlClient) {
    const connectionString = getConnectionString();
    if (!connectionString) {
      const err = new Error("Database connection is not configured");
      err.statusCode = 503;
      throw err;
    }
    sqlClient = neon(connectionString);
  }
  return sqlClient;
}

async function ensureSchema() {
  if (!schemaReady) {
    const sql = getSql();
    schemaReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS leaderboard_entries (
          id uuid PRIMARY KEY,
          username text NOT NULL CHECK (char_length(username) BETWEEN 2 AND 18),
          username_key text NOT NULL,
          level integer NOT NULL DEFAULT 3,
          outcome text NOT NULL CHECK (outcome IN ('win', 'loss')),
          completed_game boolean NOT NULL DEFAULT false,
          score integer NOT NULL CHECK (score >= 0),
          time_remaining integer NOT NULL DEFAULT 0 CHECK (time_remaining >= 0),
          duration_seconds integer NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
          progress_completed integer NOT NULL DEFAULT 0 CHECK (progress_completed >= 0),
          progress_total integer NOT NULL DEFAULT 1 CHECK (progress_total >= 1),
          mistakes integer NOT NULL DEFAULT 0 CHECK (mistakes >= 0),
          questions_completed integer NOT NULL DEFAULT 0 CHECK (questions_completed >= 0),
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `;
      await sql`ALTER TABLE leaderboard_entries ADD COLUMN IF NOT EXISTS username_key text`;
      await sql`ALTER TABLE leaderboard_entries ADD COLUMN IF NOT EXISTS completed_game boolean NOT NULL DEFAULT false`;
      await sql`ALTER TABLE leaderboard_entries ADD COLUMN IF NOT EXISTS progress_completed integer NOT NULL DEFAULT 0 CHECK (progress_completed >= 0)`;
      await sql`ALTER TABLE leaderboard_entries ADD COLUMN IF NOT EXISTS progress_total integer NOT NULL DEFAULT 1 CHECK (progress_total >= 1)`;
      await sql`ALTER TABLE leaderboard_entries ADD COLUMN IF NOT EXISTS mistakes integer NOT NULL DEFAULT 0 CHECK (mistakes >= 0)`;
      await sql`ALTER TABLE leaderboard_entries ADD COLUMN IF NOT EXISTS questions_completed integer NOT NULL DEFAULT 0 CHECK (questions_completed >= 0)`;
      await sql`ALTER TABLE leaderboard_entries DROP CONSTRAINT IF EXISTS leaderboard_entries_level_check`;
      await sql`ALTER TABLE leaderboard_entries DROP CONSTRAINT IF EXISTS leaderboard_entries_level_range_check`;
      await sql`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'leaderboard_entries_level_range_check'
              AND conrelid = 'leaderboard_entries'::regclass
          ) THEN
            ALTER TABLE leaderboard_entries
            ADD CONSTRAINT leaderboard_entries_level_range_check
            CHECK (level BETWEEN 1 AND 4);
          END IF;
        END
        $$;
      `;
      await sql`
        UPDATE leaderboard_entries
        SET
          username_key = lower(regexp_replace(btrim(username), '[[:space:]]+', ' ', 'g')),
          progress_completed = CASE
            WHEN progress_completed = 0 AND questions_completed > 0 THEN questions_completed
            ELSE progress_completed
          END,
          progress_total = CASE
            WHEN progress_total <= 1 AND level = 3 THEN 3
            ELSE GREATEST(progress_total, 1)
          END,
          completed_game = CASE
            WHEN outcome = 'win' AND level IN (3, 4) THEN true
            ELSE completed_game
          END
      `;
      await sql`
        DELETE FROM leaderboard_entries
        WHERE id IN (
          SELECT id
          FROM (
            SELECT
              id,
              row_number() OVER (
                PARTITION BY username_key
                ORDER BY
                  score DESC,
                  level DESC,
                  completed_game DESC,
                  progress_completed DESC,
                  time_remaining DESC,
                  duration_seconds ASC,
                  created_at ASC,
                  id ASC
              ) AS duplicate_rank
            FROM leaderboard_entries
          ) ranked_entries
          WHERE duplicate_rank > 1
        )
      `;
      await sql`ALTER TABLE leaderboard_entries ALTER COLUMN username_key SET NOT NULL`;
      await sql`
        CREATE UNIQUE INDEX IF NOT EXISTS leaderboard_entries_username_key_idx
        ON leaderboard_entries (username_key)
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS leaderboard_entries_rank_idx
        ON leaderboard_entries (
          completed_game DESC,
          level DESC,
          score DESC,
          progress_completed DESC,
          time_remaining DESC,
          duration_seconds ASC,
          created_at ASC
        )
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS leaderboard_entries_created_at_idx
        ON leaderboard_entries (created_at DESC)
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS leaderboard_entries_score_idx
        ON leaderboard_entries (
          score DESC,
          level DESC,
          completed_game DESC,
          progress_completed DESC,
          time_remaining DESC,
          duration_seconds ASC,
          created_at ASC
        )
      `;
    })();
  }
  return schemaReady;
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function normalizeUsername(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 18);
}

export function normalizeUsernameKey(value) {
  return normalizeUsername(value).toLowerCase();
}

function readInteger(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.round(n));
}

function readClampedInteger(value, max) {
  return Math.min(max, readInteger(value));
}

function readQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function readLimit(value) {
  const n = readInteger(readQueryValue(value), DEFAULT_LIMIT);
  return Math.min(MAX_LIMIT, Math.max(1, n || DEFAULT_LIMIT));
}

function readLevel(value) {
  const level = readInteger(value, MAX_LEVEL);
  if (level < 1 || level > MAX_LEVEL) {
    const err = new Error("Level must be 1, 2, 3, or 4");
    err.statusCode = 400;
    throw err;
  }
  return level;
}

function computeScore(entry) {
  const level = readLevel(entry.level);
  const completed = readInteger(entry.progressCompleted);
  const total = Math.max(1, readInteger(entry.progressTotal, 1));
  const requiredProgress = Math.min(completed, total);
  const extraProgress = Math.max(0, completed - total);
  const speedBonus = entry.completedGame ? readInteger(entry.timeRemaining) * SPEED_POINTS : 0;
  const clearBonus = entry.completedGame ? GAME_CLEAR_BONUS : 0;
  const mistakePenalty = readInteger(entry.mistakes) * MISTAKE_PENALTY;
  const durationPenalty = entry.completedGame || completed <= 0
    ? 0
    : Math.floor(readInteger(entry.durationSeconds) / DURATION_PENALTY_SECONDS);

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

export function shouldReplaceLeaderboardEntry(candidate, current) {
  if (!current) return true;

  const rankChecks = [
    ["score", "desc"],
    ["level", "desc"],
    ["completedGame", "desc"],
    ["progressCompleted", "desc"],
    ["timeRemaining", "desc"],
    ["durationSeconds", "asc"],
  ];

  for (const [field, direction] of rankChecks) {
    const candidateValue = field === "completedGame"
      ? Number(Boolean(candidate[field]))
      : readInteger(candidate[field]);
    const currentValue = field === "completedGame"
      ? Number(Boolean(current[field]))
      : readInteger(current[field]);

    if (candidateValue === currentValue) continue;
    return direction === "desc"
      ? candidateValue > currentValue
      : candidateValue < currentValue;
  }

  return false;
}

function validateEntry(body) {
  const username = normalizeUsername(body.username);
  if (!/^[a-zA-Z0-9 ._-]{2,18}$/.test(username)) {
    const err = new Error("Name must be 2-18 letters, numbers, spaces, dots, dashes, or underscores");
    err.statusCode = 400;
    throw err;
  }

  const outcome = String(body.outcome || "").toLowerCase();
  if (!OUTCOMES.has(outcome)) {
    const err = new Error("Outcome must be win or loss");
    err.statusCode = 400;
    throw err;
  }

  const level = readLevel(body.level ?? body.levelReached);
  if (outcome === "win" && level !== MAX_LEVEL) {
    const err = new Error("Only completing Level 4 is recorded as a win");
    err.statusCode = 400;
    throw err;
  }

  // Clamp inflated scores
  const limits = LEVEL_LIMITS[level];
  const completedGame = outcome === "win" && level === MAX_LEVEL;
  const progressCompleted = readClampedInteger(
    body.progressCompleted ?? body.questionsCompleted,
    limits.maxProgress
  );
  // progressTotal is fixed per level on the server so the client cannot shrink it to inflate the extra-progress bonus.
  const progressTotal = limits.progressTotal;
  const durationSeconds = readClampedInteger(body.durationSeconds, limits.totalTime);
  const mistakes = readClampedInteger(body.mistakes, limits.maxMistakes);
  const timeRemaining = completedGame
    ? readClampedInteger(body.timeRemaining, limits.totalTime)
    : 0;

  const entry = {
    id: crypto.randomUUID(),
    username,
    usernameKey: normalizeUsernameKey(username),
    level,
    outcome,
    completedGame,
    timeRemaining,
    durationSeconds,
    progressCompleted,
    progressTotal,
    mistakes,
  };

  return {
    ...entry,
    score: computeScore(entry),
  };
}

function readBody(req) {
  if (typeof req.body !== "string") return req.body || {};
  try {
    return req.body ? JSON.parse(req.body) : {};
  } catch {
    const err = new Error("Request body must be valid JSON");
    err.statusCode = 400;
    throw err;
  }
}

async function listEntries(sql, limit) {
  return sql`
    SELECT
      id,
      username,
      username_key AS "usernameKey",
      level,
      outcome,
      completed_game AS "completedGame",
      score,
      time_remaining AS "timeRemaining",
      duration_seconds AS "durationSeconds",
      progress_completed AS "progressCompleted",
      progress_total AS "progressTotal",
      mistakes,
      questions_completed AS "questionsCompleted",
      created_at AS "createdAt"
    FROM leaderboard_entries
    ORDER BY score DESC, level DESC, completed_game DESC, progress_completed DESC, time_remaining DESC, duration_seconds ASC, created_at ASC
    LIMIT ${limit}
  `;
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    await ensureSchema();
    const sql = getSql();

    if (req.method === "GET") {
      const query = req.query || {};
      const limit = readLimit(query.limit);
      const entries = await listEntries(sql, limit);
      sendJson(res, 200, { entries, source: "database" });
      return;
    }

    if (req.method === "POST") {
      const entry = validateEntry(readBody(req));
      const inserted = await sql`
        INSERT INTO leaderboard_entries (
          id,
          username,
          username_key,
          level,
          outcome,
          completed_game,
          score,
          time_remaining,
          duration_seconds,
          progress_completed,
          progress_total,
          mistakes,
          questions_completed
        )
        VALUES (
          ${entry.id},
          ${entry.username},
          ${entry.usernameKey},
          ${entry.level},
          ${entry.outcome},
          ${entry.completedGame},
          ${entry.score},
          ${entry.timeRemaining},
          ${entry.durationSeconds},
          ${entry.progressCompleted},
          ${entry.progressTotal},
          ${entry.mistakes},
          ${entry.level === 3 ? entry.progressCompleted : 0}
        )
        ON CONFLICT (username_key) DO UPDATE
        SET
          id = EXCLUDED.id,
          username = EXCLUDED.username,
          level = EXCLUDED.level,
          outcome = EXCLUDED.outcome,
          completed_game = EXCLUDED.completed_game,
          score = EXCLUDED.score,
          time_remaining = EXCLUDED.time_remaining,
          duration_seconds = EXCLUDED.duration_seconds,
          progress_completed = EXCLUDED.progress_completed,
          progress_total = EXCLUDED.progress_total,
          mistakes = EXCLUDED.mistakes,
          questions_completed = EXCLUDED.questions_completed,
          created_at = now()
        WHERE
          EXCLUDED.score > leaderboard_entries.score
          OR (EXCLUDED.score = leaderboard_entries.score AND EXCLUDED.level > leaderboard_entries.level)
          OR (EXCLUDED.score = leaderboard_entries.score AND EXCLUDED.level = leaderboard_entries.level AND EXCLUDED.completed_game AND NOT leaderboard_entries.completed_game)
          OR (EXCLUDED.score = leaderboard_entries.score AND EXCLUDED.level = leaderboard_entries.level AND EXCLUDED.completed_game = leaderboard_entries.completed_game AND EXCLUDED.progress_completed > leaderboard_entries.progress_completed)
          OR (EXCLUDED.score = leaderboard_entries.score AND EXCLUDED.level = leaderboard_entries.level AND EXCLUDED.completed_game = leaderboard_entries.completed_game AND EXCLUDED.progress_completed = leaderboard_entries.progress_completed AND EXCLUDED.time_remaining > leaderboard_entries.time_remaining)
          OR (EXCLUDED.score = leaderboard_entries.score AND EXCLUDED.level = leaderboard_entries.level AND EXCLUDED.completed_game = leaderboard_entries.completed_game AND EXCLUDED.progress_completed = leaderboard_entries.progress_completed AND EXCLUDED.time_remaining = leaderboard_entries.time_remaining AND EXCLUDED.duration_seconds < leaderboard_entries.duration_seconds)
        RETURNING
          id,
          username,
          username_key AS "usernameKey",
          level,
          outcome,
          completed_game AS "completedGame",
          score,
          time_remaining AS "timeRemaining",
          duration_seconds AS "durationSeconds",
          progress_completed AS "progressCompleted",
          progress_total AS "progressTotal",
          mistakes,
          questions_completed AS "questionsCompleted",
          created_at AS "createdAt"
      `;
      const savedEntry = inserted[0] || (await sql`
        SELECT
          id,
          username,
          username_key AS "usernameKey",
          level,
          outcome,
          completed_game AS "completedGame",
          score,
          time_remaining AS "timeRemaining",
          duration_seconds AS "durationSeconds",
          progress_completed AS "progressCompleted",
          progress_total AS "progressTotal",
          mistakes,
          questions_completed AS "questionsCompleted",
          created_at AS "createdAt"
        FROM leaderboard_entries
        WHERE username_key = ${entry.usernameKey}
        LIMIT 1
      `)[0];
      const entries = await listEntries(sql, DEFAULT_LIMIT);
      sendJson(res, inserted[0] ? 201 : 200, { entry: savedEntry, entries, source: "database" });
      return;
    }

    res.setHeader("Allow", "GET, POST, OPTIONS");
    sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    const status = error.statusCode || 500;
    const message = status === 500 ? "Leaderboard is unavailable" : error.message;
    console.error("leaderboard api error", error);
    sendJson(res, status, { error: message });
  }
}
