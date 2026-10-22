/*
 * store.js — all match state and game rules live here.
 *
 * The UI (app.js) never mutates state directly; it calls the actions below,
 * which enforce the rules (no negatives, caps, TP1 lock), record undo history,
 * save to localStorage and notify subscribers to re-render.
 *
 * Data model (each persisted under its own localStorage key):
 *
 *   settings = {
 *     caps: { crit, tac, kill },           // max VP per category
 *     startingCP: number,                  // CP each player starts a new game with
 *     cpCap: number | null,                // null = no upper limit
 *     turningPoints: number,               // number of TPs in a match
 *     promptCPOnAdvance: boolean,          // ask to add CP when advancing a TP
 *     cpPerTurningPoint: number,           // CP offered per player in that prompt
 *     theme: 'dark' | 'light',
 *   }
 *
 *   match = {
 *     turningPoint: number,                // 1..settings.turningPoints
 *     ended: boolean,                      // true once Primary Ops are confirmed
 *     players: [                           // always exactly two
 *       { name, color,
 *         faction,                         // kill team name from killTeams.js,
 *                                          // '' (none) or KillTeams.OTHER
 *         customFaction,                   // typed name when faction is OTHER
 *         vp: { crit, tac, kill },
 *         primaryChoice,                   // null, or 'crit' | 'tac' | 'kill'
 *                                          // (chosen at the end of the game)
 *         cp: number },                    // command points — NEVER part of VP
 *     ],
 *   }
 *
 *   history = [match, ...]                 // snapshots for undo, newest last
 *
 * Derived values (totals, Primary Op bonus, score limit, leader) are
 * computed, never stored.
 */
(function () {
  'use strict';

  const KEYS = {
    settings: 'ktst:settings',
    match: 'ktst:match',
    history: 'ktst:history',
  };

  const HISTORY_LIMIT = 20;

  // The scored VP categories, in display order. Add a category here (plus a
  // default cap below) and the UI, totals, Primary Op choice and summary
  // pick it up automatically.
  const CATEGORIES = [
    { key: 'crit', label: 'Crit Op' },
    { key: 'tac', label: 'Tac Op' },
    { key: 'kill', label: 'Kill Op' },
  ];

  // Categories that can't be scored until this turning point.
  const LOCKED_UNTIL_TP = { crit: 2, tac: 2 };

  // Defaults used on first launch (or after clearing site data).
  const DEFAULT_SETTINGS = {
    caps: { crit: 6, tac: 6, kill: 6 },
    startingCP: 2,
    cpCap: null,
    turningPoints: 4,
    promptCPOnAdvance: true,
    cpPerTurningPoint: 1,
    theme: 'dark',
  };

  const DEFAULT_PLAYERS = [
    { name: 'Player 1', faction: '', customFaction: '', color: '#e4572e' },
    { name: 'Player 2', faction: '', customFaction: '', color: '#2e86de' },
  ];

  // Player details carried over to a new game (unless names are cleared).
  const IDENTITY_FIELDS = ['name', 'faction', 'customFaction', 'color'];

  /* ---------- Scoring rules ---------- */

  // Primary Op bonus, based on the final VP in the category the player chose.
  // Change the thresholds here; the score limit and UI follow automatically.
  function calculatePrimaryBonus(categoryVP) {
    if (categoryVP >= 5) return 3;
    if (categoryVP >= 3) return 2;
    if (categoryVP >= 1) return 1;
    return 0;
  }

  /* ---------- Helpers ---------- */

  const clone = (obj) => JSON.parse(JSON.stringify(obj));
  const clamp = (n, min, max) => Math.min(Math.max(n, min), max);

  // localStorage can throw (private mode, quota, disabled), so wrap it.
  function read(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      // Storage unavailable: the app keeps working in memory.
    }
  }

  // Merge saved settings over the defaults so new settings added in later
  // versions always have a value. Caps are limited to the current categories.
  function mergeSettings(saved) {
    const s = clone(DEFAULT_SETTINGS);
    if (saved && typeof saved === 'object') {
      Object.assign(s, saved);
      s.caps = {};
      CATEGORIES.forEach((c) => {
        const v = saved.caps && saved.caps[c.key];
        s.caps[c.key] = typeof v === 'number' ? v : DEFAULT_SETTINGS.caps[c.key];
      });
    }
    return s;
  }

  function createPlayer(identity, settings) {
    const vp = {};
    CATEGORIES.forEach((c) => { vp[c.key] = 0; });
    const player = { vp, primaryChoice: null, cp: settings.startingCP };
    IDENTITY_FIELDS.forEach((f) => { player[f] = identity[f]; });
    return player;
  }

  function createMatch(settings, identities) {
    return {
      turningPoint: 1,
      ended: false,
      players: identities.map((p) => createPlayer(p, settings)),
    };
  }

  // Loose shape check so corrupt or old saved data can't break the app.
  function isValidMatch(m) {
    return m && Array.isArray(m.players) && m.players.length === 2 &&
      m.players.every((p) => p && p.vp && typeof p.cp === 'number');
  }

  // Bring saves from older versions up to the current data model.
  function migrateMatch(m) {
    m.players.forEach((p) => {
      // Kill team used to be free text: keep listed teams, move anything
      // else into the "Other (custom)" name.
      if (typeof p.customFaction !== 'string') {
        p.customFaction = '';
        if (p.faction && !window.KillTeams.has(p.faction)) {
          p.customFaction = p.faction;
          p.faction = window.KillTeams.OTHER;
        }
        if (!p.faction) p.faction = '';
      }
      // Primary Op used to be a manual counter; it's now chosen at game end.
      delete p.vp.primary;
      CATEGORIES.forEach((c) => { if (typeof p.vp[c.key] !== 'number') p.vp[c.key] = 0; });
      if (!CATEGORIES.some((c) => c.key === p.primaryChoice)) p.primaryChoice = null;
    });
    // A game "ended" without Primary Op choices goes back to being in play.
    if (m.ended && m.players.some((p) => !p.primaryChoice)) m.ended = false;
    return m;
  }

  /* ---------- State ---------- */

  const state = {
    settings: mergeSettings(read(KEYS.settings)),
    match: null,
    history: [],
  };

  const savedMatch = read(KEYS.match);
  state.match = isValidMatch(savedMatch) ? migrateMatch(savedMatch) : createMatch(state.settings, DEFAULT_PLAYERS);
  const savedHistory = read(KEYS.history);
  state.history = Array.isArray(savedHistory) ? savedHistory.filter(isValidMatch).map(migrateMatch) : [];

  const listeners = [];

  function save() {
    write(KEYS.settings, state.settings);
    write(KEYS.match, state.match);
    write(KEYS.history, state.history);
  }

  function notify() {
    save();
    listeners.forEach((fn) => fn(state));
  }

  // Apply a change to the match as one undoable step. The mutator edits the
  // match in place and returns false if nothing actually changed (so no-op
  // taps don't fill the undo history).
  function commit(mutator) {
    const before = clone(state.match);
    if (mutator(state.match) === false) return false;
    state.history.push(before);
    if (state.history.length > HISTORY_LIMIT) state.history.shift();
    notify();
    return true;
  }

  /* ---------- Derived values ---------- */

  // VP from the scored categories only (what's shown during the game).
  const baseTotal = (player) => CATEGORIES.reduce((sum, c) => sum + player.vp[c.key], 0);

  // Bonus for a given (possibly hypothetical) Primary Op choice.
  const primaryBonusFor = (player, key) => (key ? calculatePrimaryBonus(player.vp[key]) : 0);

  // Final VP: categories plus the Primary Op bonus once one is chosen.
  const total = (player) => baseTotal(player) + primaryBonusFor(player, player.primaryChoice);

  // Largest possible Primary Op bonus with the current caps (3 by default).
  const maxPrimaryBonus = () =>
    Math.max(0, ...CATEGORIES.map((c) => calculatePrimaryBonus(state.settings.caps[c.key])));

  // Overall limit: category caps + max Primary bonus (6 + 6 + 6 + 3 = 21).
  const scoreLimit = () =>
    CATEGORIES.reduce((sum, c) => sum + state.settings.caps[c.key], 0) + maxPrimaryBonus();

  // True while a category can't be scored yet (Crit/Tac Op on TP1).
  const isCategoryLocked = (key) => state.match.turningPoint < (LOCKED_UNTIL_TP[key] || 1);

  // The game can only be ended on the final turning point.
  const canEndGame = () => state.match.turningPoint >= state.settings.turningPoints;

  // The kill team name to display ('' if none chosen).
  const killTeamName = (player) => (
    player.faction === window.KillTeams.OTHER ? player.customFaction.trim() : player.faction
  );

  const categoryLabel = (key) => (CATEGORIES.find((c) => c.key === key) || {}).label || '';

  const cpMax = () => (state.settings.cpCap == null ? Infinity : state.settings.cpCap);

  // Index of the leading player, or -1 for a tie.
  function leader() {
    const [a, b] = state.match.players.map(total);
    if (a === b) return -1;
    return a > b ? 0 : 1;
  }

  /* ---------- Actions ---------- */

  function adjustVP(i, key, delta) {
    if (isCategoryLocked(key)) return false;
    return commit((m) => {
      const p = m.players[i];
      const next = clamp(p.vp[key] + delta, 0, state.settings.caps[key]);
      if (next === p.vp[key]) return false;
      p.vp[key] = next;
    });
  }

  function adjustCP(i, delta) {
    return commit((m) => {
      const p = m.players[i];
      const next = clamp(p.cp + delta, 0, cpMax());
      if (next === p.cp) return false;
      p.cp = next;
    });
  }

  // field is 'name' | 'faction' | 'customFaction' | 'color'
  function setPlayerInfo(i, field, value) {
    return commit((m) => {
      if (m.players[i][field] === value) return false;
      m.players[i][field] = value;
    });
  }

  // cpGains: [p1, p2] CP to add, or null to just advance.
  // Advancing and adding CP is a single undo step.
  function advanceTurningPoint(cpGains) {
    return commit((m) => {
      if (m.turningPoint >= state.settings.turningPoints) return false;
      m.turningPoint += 1;
      if (cpGains) {
        m.players.forEach((p, i) => {
          p.cp = clamp(p.cp + (cpGains[i] || 0), 0, cpMax());
        });
      }
    });
  }

  function previousTurningPoint() {
    return commit((m) => {
      if (m.turningPoint <= 1) return false;
      m.turningPoint -= 1;
    });
  }

  // End the game with each player's Primary Op choice: [key, key].
  function finishGame(choices) {
    if (!canEndGame()) return false;
    return commit((m) => {
      m.players.forEach((p, i) => { p.primaryChoice = choices[i]; });
      m.ended = true;
    });
  }

  // Go back to the game from the summary. Choices are cleared so totals
  // return to category VP only; they're picked again when the game ends.
  function resumeGame() {
    return commit((m) => {
      if (!m.ended) return false;
      m.ended = false;
      m.players.forEach((p) => { p.primaryChoice = null; });
    });
  }

  // Reset all counters and Primary Op choices. Names/factions/colours are
  // kept unless clearNames. Undoable, in case it was tapped by mistake.
  function newGame(clearNames) {
    const identities = clearNames
      ? DEFAULT_PLAYERS
      : state.match.players.map((p) => {
        const identity = {};
        IDENTITY_FIELDS.forEach((f) => { identity[f] = p[f]; });
        return identity;
      });
    return commit((m) => {
      Object.assign(m, createMatch(state.settings, identities));
    });
  }

  function undo() {
    if (!state.history.length) return false;
    state.match = state.history.pop();
    notify();
    return true;
  }

  // Save new settings and pull the current match back inside any lowered
  // limits (as an undoable step, if anything had to change).
  function updateSettings(patch) {
    state.settings = mergeSettings(Object.assign({}, state.settings, patch));
    const clamped = commit((m) => {
      let changed = false;
      m.players.forEach((p) => {
        CATEGORIES.forEach((c) => {
          const v = Math.min(p.vp[c.key], state.settings.caps[c.key]);
          if (v !== p.vp[c.key]) { p.vp[c.key] = v; changed = true; }
        });
        const cp = Math.min(p.cp, cpMax());
        if (cp !== p.cp) { p.cp = cp; changed = true; }
      });
      const tp = Math.min(m.turningPoint, state.settings.turningPoints);
      if (tp !== m.turningPoint) { m.turningPoint = tp; changed = true; }
      return changed;
    });
    if (!clamped) notify();
  }

  function subscribe(fn) {
    listeners.push(fn);
  }

  window.Store = {
    CATEGORIES,
    LOCKED_UNTIL_TP,
    DEFAULT_SETTINGS,
    state,
    calculatePrimaryBonus,
    primaryBonusFor,
    baseTotal,
    total,
    scoreLimit,
    isCategoryLocked,
    canEndGame,
    killTeamName,
    categoryLabel,
    cpMax,
    leader,
    adjustVP,
    adjustCP,
    setPlayerInfo,
    advanceTurningPoint,
    previousTurningPoint,
    finishGame,
    resumeGame,
    newGame,
    undo,
    updateSettings,
    subscribe,
  };
})();
