import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeUsernameKey,
  shouldReplaceLeaderboardEntry,
} from "./leaderboard.js";

const personalBest = {
  score: 180,
  level: 3,
  completedGame: true,
  progressCompleted: 3,
  timeRemaining: 20,
  durationSeconds: 70,
};

test("normalizes username identity case-insensitively and trims repeated spaces", () => {
  assert.equal(normalizeUsernameKey("  Pilot   One  "), "pilot one");
  assert.equal(normalizeUsernameKey("PILOT.ONE"), "pilot.one");
});

test("does not replace a personal best with a lower score", () => {
  assert.equal(shouldReplaceLeaderboardEntry({
    ...personalBest,
    score: 120,
  }, personalBest), false);
});

test("replaces a personal best with a higher score", () => {
  assert.equal(shouldReplaceLeaderboardEntry({
    ...personalBest,
    score: 220,
  }, personalBest), true);
});

test("uses level and completion as score tie-breakers", () => {
  assert.equal(shouldReplaceLeaderboardEntry({
    ...personalBest,
    level: 2,
  }, personalBest), false);

  assert.equal(shouldReplaceLeaderboardEntry({
    ...personalBest,
    completedGame: false,
  }, personalBest), false);
});

test("uses progress, time remaining, and duration as later tie-breakers", () => {
  assert.equal(shouldReplaceLeaderboardEntry({
    ...personalBest,
    progressCompleted: 4,
  }, personalBest), true);

  assert.equal(shouldReplaceLeaderboardEntry({
    ...personalBest,
    timeRemaining: 25,
  }, personalBest), true);

  assert.equal(shouldReplaceLeaderboardEntry({
    ...personalBest,
    durationSeconds: 60,
  }, personalBest), true);

  assert.equal(shouldReplaceLeaderboardEntry({
    ...personalBest,
    durationSeconds: 75,
  }, personalBest), false);
});

test("does not replace an exactly tied personal best", () => {
  assert.equal(shouldReplaceLeaderboardEntry({ ...personalBest }, personalBest), false);
});
