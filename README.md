# Kill Team Score Tracker

A mobile-friendly, offline-capable score tracker for two-player Warhammer 40,000: Kill Team matches.
Plain HTML/CSS/JavaScript: no build step, no dependencies, no backend.

## Running it

**Quickest:** open `index.html` in a browser. Everything works except offline caching and
"install as app" (browsers only allow service workers over http/https).

**Full version (offline + installable)**, from this folder:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>. (`npx serve` works too.)

To use it on your phone at the table, host it on any static host and open it once while online.
After that it works offline, and you can use **Add to Home Screen** (iOS Safari) or
**Install app** (Chrome/Android).

## Deploying to Netlify Drop

```bash
./build.sh
```

This creates a `deploy/` folder containing only the files needed to run the app, plus a
`_redirects` file (`/*  /index.html  200`) so refreshing any URL never gives a 404. Drag the
`deploy` folder onto <https://app.netlify.com/drop>.

**After making changes:** run `./build.sh` again and drag the new `deploy` folder onto your
site's **Deploys** page in Netlify. Dropping it on the main Drop page instead creates a new site
with a new URL. The build stamps `sw.js` with a cache version based on the file contents, so
installed phones pick up the new version automatically the next time they open the app online.
You don't need to bump `CACHE_VERSION` by hand for deploys.

If you add a new file the app needs at runtime, add it to `FILES` in `build.sh` and `APP_SHELL`
in `sw.js`.

## Features

- Two players with editable name, colour and kill team. The kill team is picked from a grouped
  dropdown, with "Other (custom)…" for anything not listed. Panels sit side by side on wide or
  landscape screens and stack on narrow ones.
- Crit Op / Tac Op / Kill Op counters, each capped at 6 by default and never below 0.
  Crit Op and Tac Op are locked on Turning Point 1 (existing scores are kept if you go back to TP1).
- Total VP out of 21 (6 + 6 + 6 + up to 3 from the Primary Op bonus), with a progress bar and
  leader highlight.
- Command Points in a separate violet section above the VP counters. They never count towards VP.
- Turning point tracker, with an optional prompt to add CP when you advance.
- **End Game & Choose Primary Op** (final turning point only): each player picks Crit, Tac or
  Kill Op, with a live preview of the bonus and new total. Then an end-of-game summary shows the
  breakdown, the Primary Op bonus and the winner or a draw.
- Undo (last 20 changes, also Ctrl/Cmd+Z), and New Game with confirmation (optionally clear names).
- Dark theme by default, with a light theme in Settings.
- Everything is saved to localStorage, so a refresh or a locked phone never loses the game.

## Changing the defaults

Most things can be changed in the app under **Settings**: category caps, starting CP, CP cap,
the CP-on-advance prompt, number of turning points and theme. These are saved per device.

To change the defaults for a fresh install, edit `DEFAULT_SETTINGS` in [`js/store.js`](js/store.js):

```js
const DEFAULT_SETTINGS = {
  caps: { crit: 6, tac: 6, kill: 6 },
  startingCP: 2,
  cpCap: null,            // null = no cap
  turningPoints: 4,
  promptCPOnAdvance: true,
  cpPerTurningPoint: 1,
  theme: 'dark',
};
```

Default player names and colours are in `DEFAULT_PLAYERS` in the same file.

### Scoring rules

These are in the **Scoring rules** section near the top of [`js/store.js`](js/store.js):

- **Primary Op bonus:** `calculatePrimaryBonus(categoryVP)` (5–6 → +3, 3–4 → +2, 1–2 → +1,
  0 → +0). The score limit, the bonus help text in the chooser and the summary all follow this
  function, so changing it is a one-place edit.
- **Turning Point 1 lock:** `LOCKED_UNTIL_TP` (`{ crit: 2, tac: 2 }` means scoring opens at TP2).
- **End Game** is enabled on the final turning point (the "Turning points" setting, default 4).

### Updating the kill team list

Edit [`js/data/killTeams.js`](js/data/killTeams.js). Add the team name to the right alliance group
(or add a new group). Teams are sorted alphabetically automatically. It's a plain script rather than
JSON so the app still works when `index.html` is opened straight from disk. Rebuild with
`./build.sh` afterwards.

Saved settings take priority over these defaults. To see your new defaults, clear the site's data
(or run `localStorage.clear()` in the browser console).

## Project structure

```
index.html            App shell and dialogs
css/styles.css        Theme tokens (dark/light), layout, animations
js/data/killTeams.js  Kill team list for the dropdown, grouped by alliance
js/store.js           State, game rules, persistence, undo  ← start here
js/app.js             Builds the UI, renders state, handles taps
sw.js                 Service worker (offline cache)
manifest.webmanifest  PWA manifest
icons/                App icons
```

### How it fits together

- `store.js` owns all state (`settings`, `match`, `history`) and exposes actions such as
  `adjustVP`, `adjustCP`, `advanceTurningPoint`, `finishGame`, `resumeGame`, `newGame` and
  `undo`. Every change goes through `commit()`, which snapshots the match for undo, saves to
  localStorage and notifies the UI.
- Each player's Primary Op choice is stored as `primaryChoice` (`null` until the game ends).
  Going back to the game from the summary, or starting a new game, clears it.
- `app.js` builds the player panels once, then `render()` updates them from state after each change.
- Totals, the Primary Op bonus, the score limit and the leader are always calculated from state
  and never stored.

### Extending

- **Add a VP category:** add it to `CATEGORIES` and `DEFAULT_SETTINGS.caps` in `store.js`.
  The counters, totals, settings, Primary Op choices and summary all update automatically.
- **After changing any file**, rebuild with `./build.sh` (which updates the cache version for you).

## Storage keys

`ktst:settings`, `ktst:match`, `ktst:history`. Delete these to reset everything.
