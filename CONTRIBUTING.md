# Contributing to Planetfall

Thanks for helping with Planetfall. This guide is meant to answer the basics:
how to get a change onto GitHub, how to run the game, how to run the
leaderboard path, and what story the game is trying to tell.

## How To Contribute

If you do not have write access to this repo, fork it first on GitHub. Your fork
will live under your own GitHub username, and your pull request will ask to merge
your branch back into `blackgirlbytes/planetfall-seed-signalkit`.

```bash
git clone https://github.com/YOUR-USERNAME/planetfall-seed-signalkit.git
cd planetfall-seed-signalkit
git remote add upstream https://github.com/blackgirlbytes/planetfall-seed-signalkit.git
```

If you do have write access, you can clone this repo directly and create a
branch:

```bash
git clone https://github.com/blackgirlbytes/planetfall-seed-signalkit.git
cd planetfall-seed-signalkit
```

Before you start work from a fork, make sure your local `main` matches the
original repo:

```bash
git fetch upstream
git checkout main
git rebase upstream/main
git checkout -b your-change-name
```

Before you start work directly in this repo, make sure your local `main` is
current:

```bash
git checkout main
git pull --rebase origin main
git checkout -b your-change-name
```

Make your changes, then check what changed:

```bash
git status
git diff
```

Commit your work:

```bash
git add path/to/file
git commit -m "Describe the change"
```

If you are working from a fork, sync with the original repo before pushing:

```bash
git fetch upstream
git rebase upstream/main
git push -u origin your-change-name
```

If you are working directly in this repo, push your branch:

```bash
git push -u origin your-change-name
```

Then open a pull request on GitHub. Include what changed, how you tested it, and
anything you are unsure about.

This is an Entire-enabled repo, so some commits have recorded agent sessions
and checkpoints attached to them. You can browse the project sessions at
<https://entire.io/gh/blackgirlbytes/planetfall-seed-signalkit/sessions>.

Please do not commit secrets, `.env*` files, `.vercel/`, `dist/`,
`node_modules/`, or other generated/local files.

## How To Run The Game

Install dependencies:

```bash
npm install
```

Start the local Vite server:

```bash
npm run dev
```

Open <http://localhost:5173>.

Useful shortcuts:

```text
?view=island
?view=level2
?view=level3
?view=archive
?level=1&end=success
?level=1&end=fail
?level=2&end=success
?level=2&end=fail
?level=3&end=success
?level=3&end=fail
```

Before opening a pull request, run:

```bash
npm run build
```

There is no separate test command yet, so also play through the part of the game
you changed.

## How To Run The Leaderboard

Plain `npm run dev` runs the game but does not write to the remote leaderboard.
Use the Vercel dev path when improving leaderboard behavior:

```bash
npm run dev:vercel
```

The leaderboard API is in `api/leaderboard.js`. It needs a Neon-compatible
Postgres URL in one of these environment variables:

```bash
DATABASE_URL=...
POSTGRES_URL=...
```

Put local values in `.env.local` and do not commit them. When `vercel dev`
starts, use the local URL it prints in the terminal.

## What Is The Story Supposed To Be?

Planetfall is about a downed pilot on a lavender ocean planet. The ship
survived, but its records were scattered. To get home, the player recovers and
reviews those records.

The game is also teaching the real Entire checkpoint workflow:

- Level 1: recover your own records, then bank them with `git add`,
  `git commit`, and a checkpoint link.
- Level 2: send drones/subagents to do work you do not personally watch, then
  use `entire checkpoint explain` and `entire dispatch` to understand and file
  that work.
- Level 3: answer launch-clearance questions from the record, not from memory.

The core idea is: you were not there; the record was.

A few story guardrails:

- The player is not an amnesiac.
- The intro speaker is the rebellion.
- Use "records" more than "memory" when describing what the player recovers.
- The clock is the main pressure. Wrong actions usually cost time or score
  rather than ending the run immediately.
