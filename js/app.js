/*
 * app.js — builds the UI, wires up events, and re-renders whenever the store
 * changes. All game rules (clamping, caps, TP1 lock, Primary Op bonus, undo)
 * live in store.js; this file only displays state and forwards taps to
 * Store actions.
 */
(function () {
  'use strict';

  const S = window.Store;
  const $ = (sel, root = document) => root.querySelector(sel);

  const playersEl = $('#players');
  let hasRendered = false; // no pulse animations on first paint

  const escapeHtml = (str) => String(str).replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));

  // Display name for a player, falling back to "Player N" if left blank.
  const playerLabel = (p, i) => p.name.trim() || `Player ${i + 1}`;

  /* ---------- Player panels (built once, updated by render) ---------- */

  function stepButton(action, delta, key) {
    const keyAttr = key ? ` data-key="${key}"` : '';
    return `<button type="button" class="step" data-action="${action}" data-delta="${delta}"${keyAttr}>${delta > 0 ? '+' : '−'}</button>`;
  }

  function buildPlayerPanel(i) {
    const el = document.createElement('section');
    el.className = 'player';
    el.dataset.player = i;
    el.setAttribute('aria-label', `Player ${i + 1}`);
    el.innerHTML = `
      <div class="player-head">
        <input type="color" class="player-color" data-field="color" aria-label="Player ${i + 1} colour">
        <div class="player-ids">
          <input class="player-name" data-field="name" maxlength="30" autocomplete="off" spellcheck="false"
                 placeholder="Player ${i + 1}" aria-label="Player ${i + 1} name">
          <select class="player-faction" data-field="faction" aria-label="Player ${i + 1} kill team">
            ${killTeamOptions()}
          </select>
          <input class="player-faction-custom" data-field="customFaction" maxlength="40" autocomplete="off"
                 placeholder="Type kill team name" aria-label="Player ${i + 1} custom kill team" hidden>
        </div>
        <span class="lead-badge" hidden>Leading</span>
      </div>

      <div class="total-block">
        <div class="total">
          <span class="total-value">0</span><span class="total-limit">/ 0</span>
        </div>
        <div class="total-caption">Victory Points</div>
        <div class="progress" role="progressbar" aria-valuemin="0"><span class="progress-fill"></span></div>
      </div>

      <div class="counter cp-block">
        <span class="counter-label">Command Points</span>
        ${stepButton('cp', -1)}
        <span class="counter-value"><b>0</b><small></small></span>
        ${stepButton('cp', 1)}
      </div>

      <ul class="vp-list">
        ${S.CATEGORIES.map((c) => `
          <li class="counter" data-key="${c.key}">
            <span class="counter-label">${c.label}</span>
            ${stepButton('vp', -1, c.key)}
            <span class="counter-value"><b>0</b><small></small></span>
            ${stepButton('vp', 1, c.key)}
            ${S.LOCKED_UNTIL_TP[c.key]
              ? `<span class="counter-hint" hidden>Scoring from TP${S.LOCKED_UNTIL_TP[c.key]}</span>` : ''}
          </li>`).join('')}
      </ul>`;
    return el;
  }

  // <option>s for the kill team dropdown, grouped by alliance (see js/data/killTeams.js).
  function killTeamOptions() {
    const groups = window.KillTeams.GROUPS.map((g) => `
      <optgroup label="${escapeHtml(g.label)}">
        ${g.teams.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('')}
      </optgroup>`).join('');
    return `<option value="">Select kill team…</option>${groups}
      <option value="${window.KillTeams.OTHER}">Other (custom)…</option>`;
  }

  const panels = [0, 1].map((i) => {
    const el = buildPlayerPanel(i);
    playersEl.appendChild(el);
    return el;
  });

  /* ---------- Rendering ---------- */

  // Update a number and briefly pulse it if the value changed.
  function setNumber(el, value) {
    const text = String(value);
    if (el.textContent === text) return;
    el.textContent = text;
    if (hasRendered) {
      el.classList.remove('pulse');
      void el.offsetWidth; // restart the animation
      el.classList.add('pulse');
    }
  }

  // Don't overwrite a field while the user is typing in it.
  function setInput(el, value) {
    if (document.activeElement !== el && el.value !== value) el.value = value;
  }

  function renderPlayer(p, i, lead, limit) {
    const { settings } = S.state;
    const el = panels[i];
    const label = playerLabel(p, i);

    el.style.setProperty('--player', p.color);
    setInput($('[data-field="name"]', el), p.name);
    setInput($('[data-field="faction"]', el), p.faction);
    const custom = $('[data-field="customFaction"]', el);
    setInput(custom, p.customFaction);
    custom.hidden = p.faction !== window.KillTeams.OTHER;
    setInput($('[data-field="color"]', el), p.color);

    el.classList.toggle('is-leading', lead === i);
    $('.lead-badge', el).hidden = lead !== i;

    // Total and progress toward the score limit
    const total = S.total(p);
    setNumber($('.total-value', el), total);
    $('.total-limit', el).textContent = `/ ${limit}`;
    const bar = $('.progress', el);
    bar.setAttribute('aria-valuemax', limit);
    bar.setAttribute('aria-valuenow', total);
    bar.setAttribute('aria-label', `${label} victory points: ${total} of ${limit}`);
    $('.progress-fill', el).style.width = `${limit ? (total / limit) * 100 : 0}%`;

    // VP categories
    S.CATEGORIES.forEach((c) => {
      const row = $(`.counter[data-key="${c.key}"]`, el);
      const value = p.vp[c.key];
      const cap = settings.caps[c.key];
      const locked = S.isCategoryLocked(c.key);
      const [minus, plus] = row.querySelectorAll('button');
      setNumber($('.counter-value b', row), value);
      $('.counter-value small', row).textContent = `/ ${cap}`;
      // Locked (Crit/Tac Op on TP1): keep the score, disable both buttons.
      row.classList.toggle('is-locked', locked);
      const hint = $('.counter-hint', row);
      if (hint) hint.hidden = !locked;
      minus.disabled = locked || value <= 0;
      plus.disabled = locked || value >= cap;
      const lockNote = locked ? `, scoring from turning point ${S.LOCKED_UNTIL_TP[c.key]}` : '';
      minus.setAttribute('aria-label', `Decrease ${label} ${c.label} (currently ${value}${lockNote})`);
      plus.setAttribute('aria-label', `Increase ${label} ${c.label} (currently ${value}${lockNote})`);
    });

    // Command points
    const cpRow = $('.cp-block', el);
    const [cpMinus, cpPlus] = cpRow.querySelectorAll('button');
    setNumber($('.counter-value b', cpRow), p.cp);
    $('.counter-value small', cpRow).textContent = settings.cpCap == null ? '' : `/ ${settings.cpCap}`;
    cpMinus.disabled = p.cp <= 0;
    cpPlus.disabled = p.cp >= S.cpMax();
    cpMinus.setAttribute('aria-label', `Decrease ${label} Command Points (currently ${p.cp})`);
    cpPlus.setAttribute('aria-label', `Increase ${label} Command Points (currently ${p.cp})`);
  }

  function render() {
    const { settings, match, history } = S.state;
    const limit = S.scoreLimit();
    const lead = S.leader();

    match.players.forEach((p, i) => renderPlayer(p, i, lead, limit));

    // Turning point
    const tp = match.turningPoint;
    const lastTp = tp >= settings.turningPoints;
    setNumber($('#tp-value'), tp);
    $('#tp-max').textContent = `/ ${settings.turningPoints}`;
    $('#tp-prev').disabled = tp <= 1;
    const next = $('#tp-next');
    next.textContent = lastTp ? 'End' : '›';
    next.classList.toggle('is-end', lastTp);
    next.setAttribute('aria-label', lastTp ? 'End game and choose Primary Op' : `Advance to turning point ${tp + 1}`);

    // End game: only on the final turning point (or to reopen the summary)
    const canEnd = S.canEndGame() || match.ended;
    $('#btn-end').disabled = !canEnd;
    const endHint = $('#end-hint');
    endHint.textContent = `Available in Turning Point ${settings.turningPoints}`;
    endHint.hidden = canEnd;

    // Who's leading
    const status = $('#status');
    if (lead === -1) {
      status.textContent = 'Scores level';
    } else {
      const [a, b] = match.players.map(S.total);
      status.textContent = `${playerLabel(match.players[lead], lead)} leads by ${Math.abs(a - b)}`;
    }
    status.classList.toggle('has-leader', lead !== -1);

    // Undo
    const undo = $('#btn-undo');
    undo.disabled = history.length === 0;
    undo.setAttribute('aria-label', `Undo last change (${history.length} available)`);

    applyTheme(settings.theme);
    hasRendered = true;
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    $('meta[name="theme-color"]').setAttribute('content', theme === 'light' ? '#eef0f4' : '#0f1115');
  }

  /* ---------- Dialog helper ---------- */

  // Open a <dialog> and call onClose with the value of the button that closed
  // it ('' if dismissed with Escape). Uses the form's submit event rather than
  // the dialog's close event, which some embedded browsers don't fire.
  function openDialog(dlg, onClose) {
    const form = dlg.querySelector('form');
    const finish = (value) => {
      form.removeEventListener('submit', onSubmit);
      dlg.removeEventListener('cancel', onCancel);
      // Let the dialog finish closing before the callback (which may open another).
      setTimeout(() => onClose(value), 0);
    };
    const onSubmit = (e) => finish(e.submitter ? e.submitter.value : '');
    const onCancel = () => finish('');
    form.addEventListener('submit', onSubmit);
    dlg.addEventListener('cancel', onCancel);
    dlg.showModal();
  }

  /* ---------- New game ---------- */

  function openNewGame() {
    const dlg = $('#dlg-new');
    const clearNames = dlg.querySelector('[name="clearNames"]');
    clearNames.checked = false;
    openDialog(dlg, (result) => {
      if (result === 'confirm') S.newGame(clearNames.checked);
      else if (S.state.match.ended) showSummary(); // backed out from the summary screen
    });
  }

  /* ---------- Turning points ---------- */

  function advanceTurningPoint() {
    const { match, settings } = S.state;
    if (match.turningPoint >= settings.turningPoints) return openPrimaryChooser();
    if (!settings.promptCPOnAdvance) return S.advanceTurningPoint(null);

    // Pick who has the initiative; that decides each player's CP gain.
    // The choice stays local to the dialog until Continue.
    let initiative = null;
    const picks = $('#initiative-picks');
    const cont = $('#initiative-continue');

    $('#dlg-tp-title').textContent = `Start turning point ${match.turningPoint + 1}`;
    $('#initiative-rule').textContent = 'Who has the initiative? ' +
      `They gain +${S.INITIATIVE_CP} CP; the other player gains +${S.NON_INITIATIVE_CP} CP.`;
    picks.innerHTML = match.players.map((p, i) => `
      <section class="init-pick" data-player="${i}">
        <h3><span class="swatch" style="background:${escapeHtml(p.color)}"></span>${escapeHtml(playerLabel(p, i))}</h3>
        <button type="button" class="init-btn" aria-pressed="false"
                aria-label="${escapeHtml(playerLabel(p, i))} has initiative">Has initiative</button>
        <p class="init-preview" aria-live="polite"></p>
      </section>`).join('');

    function update() {
      const gains = initiative === null ? null : S.initiativeGains(initiative);
      match.players.forEach((p, i) => {
        const section = $(`.init-pick[data-player="${i}"]`, picks);
        $('.init-btn', section).setAttribute('aria-pressed', String(initiative === i));
        section.classList.toggle('has-initiative', initiative === i);
        $('.init-preview', section).textContent = gains
          ? `+${gains[i]} CP${initiative === i ? ' (initiative)' : ''}`
          : '';
      });
      cont.disabled = initiative === null;
    }

    picks.onclick = (e) => {
      const btn = e.target.closest('.init-btn');
      if (!btn) return;
      initiative = Number(btn.closest('.init-pick').dataset.player);
      update();
    };
    update();

    openDialog($('#dlg-tp'), (result) => {
      // CP and turning point change together, as a single undo step.
      if (result === 'continue' && initiative !== null) S.advanceWithInitiative(initiative);
    });
  }

  /* ---------- End of game ---------- */

  // Describe the Primary Op bonus bands from calculatePrimaryBonus itself,
  // e.g. "5–6 VP → +3 · 3–4 VP → +2 · 1–2 VP → +1 · 0 VP → +0", so the
  // help text can never disagree with the rule.
  function describeBonusBands() {
    const maxCap = Math.max(...S.CATEGORIES.map((c) => S.state.settings.caps[c.key]));
    const bands = [];
    for (let vp = maxCap; vp >= 0; vp--) {
      const bonus = S.calculatePrimaryBonus(vp);
      const band = bands[bands.length - 1];
      if (band && band.bonus === bonus) band.low = vp;
      else bands.push({ bonus, low: vp, high: vp });
    }
    return bands.map((b) => `${b.low === b.high ? b.low : `${b.low}–${b.high}`} VP → +${b.bonus}`).join(' · ');
  }

  // Each player picks the category their Primary Op bonus is based on.
  // Choices stay local to the dialog until both are confirmed.
  function openPrimaryChooser() {
    if (!S.canEndGame()) return;
    const players = S.state.match.players;
    const choices = players.map(() => null);
    const picks = $('#primary-picks');
    const confirm = $('#primary-confirm');

    $('#primary-rules').textContent = `Bonus from the chosen category's final score: ${describeBonusBands()}.`;
    picks.innerHTML = players.map((p, i) => {
      const name = escapeHtml(playerLabel(p, i));
      return `
        <section class="pick" data-player="${i}">
          <h3><span class="swatch" style="background:${escapeHtml(p.color)}"></span>${name}</h3>
          <div class="pick-options" role="radiogroup" aria-label="${name} Primary Op">
            ${S.CATEGORIES.map((c) => `
              <button type="button" class="pick-option" role="radio" aria-checked="false"
                      data-key="${c.key}" aria-label="${c.label}: ${p.vp[c.key]} VP">
                <span>${c.label}</span><b>${p.vp[c.key]} VP</b>
              </button>`).join('')}
          </div>
          <p class="pick-preview" aria-live="polite"></p>
        </section>`;
    }).join('');

    // Refresh selection state, bonus preview and the Confirm button.
    function update() {
      players.forEach((p, i) => {
        const section = $(`.pick[data-player="${i}"]`, picks);
        section.querySelectorAll('.pick-option').forEach((btn) => {
          btn.setAttribute('aria-checked', String(btn.dataset.key === choices[i]));
        });
        const preview = $('.pick-preview', section);
        const choice = choices[i];
        if (choice) {
          const bonus = S.primaryBonusFor(p, choice);
          preview.textContent = `${S.categoryLabel(choice)} chosen: +${bonus} VP → Total ${S.baseTotal(p) + bonus}`;
        } else {
          preview.textContent = `Not chosen yet · ${S.baseTotal(p)} VP so far`;
        }
        preview.classList.toggle('is-chosen', Boolean(choice));
      });
      confirm.disabled = choices.includes(null);
    }

    picks.onclick = (e) => {
      const btn = e.target.closest('.pick-option');
      if (!btn) return;
      choices[Number(btn.closest('.pick').dataset.player)] = btn.dataset.key;
      update();
    };
    update();

    openDialog($('#dlg-primary'), (result) => {
      if (result === 'confirm' && !choices.includes(null)) {
        S.finishGame(choices);
        showSummary();
      }
      // Back / Escape: return to the game without ending it.
    });
  }

  function showSummary() {
    const { match } = S.state;
    const players = match.players;
    const totals = players.map(S.total);
    const lead = S.leader();
    const names = players.map((p, i) => escapeHtml(playerLabel(p, i)));
    const win = (i) => (lead === i ? ' class="winner"' : '');

    $('#summary-result').textContent = lead === -1
      ? `Draw — ${totals[0]} VP each`
      : `${playerLabel(players[lead], lead)} wins ${totals[lead]}–${totals[1 - lead]}`;

    const primaryCell = (p) => (p.primaryChoice
      ? `<td>${S.categoryLabel(p.primaryChoice)}<span class="summary-bonus">+${S.primaryBonusFor(p, p.primaryChoice)}</span></td>`
      : '<td>—</td>');

    $('#summary-table').innerHTML = `
      <thead><tr><th></th>${players.map((p, i) =>
        `<th scope="col"${win(i)}><span class="swatch" style="background:${escapeHtml(p.color)}"></span>${names[i]}` +
        `<span class="summary-team">${escapeHtml(S.killTeamName(p) || 'No kill team')}</span></th>`).join('')}</tr></thead>
      <tbody>
        ${S.CATEGORIES.map((c) =>
          `<tr><th scope="row">${c.label}</th><td>${players[0].vp[c.key]}</td><td>${players[1].vp[c.key]}</td></tr>`).join('')}
        <tr class="primary-row"><th scope="row">Primary Op</th>${primaryCell(players[0])}${primaryCell(players[1])}</tr>
        <tr class="total-row"><th scope="row">Final total</th><td${win(0)}>${totals[0]}</td><td${win(1)}>${totals[1]}</td></tr>
        <tr class="cp-row"><th scope="row">CP remaining</th><td>${players[0].cp}</td><td>${players[1].cp}</td></tr>
      </tbody>`;

    openDialog($('#dlg-summary'), (result) => {
      if (result === 'new') openNewGame();
      else S.resumeGame(); // "Back to Game" or Escape: clears the Primary Op choices
    });
  }

  /* ---------- How to play ---------- */

  // Built once from js/data/howToPlay.js.
  function renderHowToPlay() {
    const item = (it) => `
      <li>${it.term ? `<strong>${escapeHtml(it.term)}:</strong> ` : ''}${escapeHtml(it.text)}
        ${it.children && it.children.length
          ? `<ul>${it.children.map((c) => `<li>${escapeHtml(c)}</li>`).join('')}</ul>` : ''}
      </li>`;
    $('#howto-content').innerHTML = window.HowToPlay.sections.map((s) => {
      const list = s.ordered ? 'ol' : 'ul';
      return `
        <section>
          <h3>${escapeHtml(s.title)}</h3>
          ${s.intro ? `<p>${escapeHtml(s.intro)}</p>` : ''}
          <${list}>${s.items.map(item).join('')}</${list}>
        </section>`;
    }).join('');
  }
  renderHowToPlay();

  const howto = $('#dlg-howto');
  function openHowToPlay() {
    howto.showModal();
    $('.howto-inner', howto).scrollTop = 0;
  }
  // Close when tapping the backdrop (outside the content). The close button
  // and Escape are handled natively by the dialog form.
  howto.addEventListener('click', (e) => {
    if (e.target === howto) howto.close();
  });

  /* ---------- Settings ---------- */

  // Cap inputs are generated from the category list so adding a category
  // needs no HTML changes.
  $('#cap-fields').innerHTML = S.CATEGORIES.map((c) => `
    <label>${c.label}
      <input name="cap-${c.key}" type="number" inputmode="numeric" min="0" max="99" required></label>`).join('');

  function openSettings() {
    const form = $('#settings-form');
    const f = form.elements;
    const s = S.state.settings;

    S.CATEGORIES.forEach((c) => { f[`cap-${c.key}`].value = s.caps[c.key]; });
    f.startingCP.value = s.startingCP;
    f.cpCap.value = s.cpCap == null ? '' : s.cpCap;
    f.promptCPOnAdvance.checked = s.promptCPOnAdvance;
    f.turningPoints.value = s.turningPoints;
    f.theme.value = s.theme;

    openDialog($('#dlg-settings'), (result) => {
      if (result !== 'save') return;
      const int = (name, fallback) => {
        const n = parseInt(f[name].value, 10);
        return Number.isFinite(n) && n >= 0 ? n : fallback;
      };
      const caps = {};
      S.CATEGORIES.forEach((c) => { caps[c.key] = int(`cap-${c.key}`, s.caps[c.key]); });
      S.updateSettings({
        caps,
        startingCP: int('startingCP', s.startingCP),
        cpCap: f.cpCap.value.trim() === '' ? null : int('cpCap', null),
        promptCPOnAdvance: f.promptCPOnAdvance.checked,
        turningPoints: Math.max(1, int('turningPoints', s.turningPoints)),
        theme: f.theme.value === 'light' ? 'light' : 'dark',
      });
    });
  }

  /* ---------- Events ---------- */

  // − / + buttons (event delegation over both panels)
  playersEl.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn || btn.disabled) return;
    const i = Number(btn.closest('.player').dataset.player);
    const delta = Number(btn.dataset.delta);
    if (btn.dataset.action === 'vp') S.adjustVP(i, btn.dataset.key, delta);
    else S.adjustCP(i, delta);
  });

  // Name / faction / colour: committed when editing finishes, so each edit
  // is a single undo step rather than one per keystroke.
  playersEl.addEventListener('change', (e) => {
    const field = e.target.dataset.field;
    if (!field) return;
    const i = Number(e.target.closest('.player').dataset.player);
    S.setPlayerInfo(i, field, field === 'color' ? e.target.value : e.target.value.trim());
    // Picking "Other (custom)…" reveals the name box; jump straight into it.
    if (field === 'faction' && e.target.value === window.KillTeams.OTHER) {
      $('[data-field="customFaction"]', e.target.closest('.player')).focus();
    }
  });

  // Live colour preview while the picker is open
  playersEl.addEventListener('input', (e) => {
    if (e.target.dataset.field === 'color') {
      e.target.closest('.player').style.setProperty('--player', e.target.value);
    }
  });

  // Enter finishes editing a text field
  playersEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('input[data-field]')) e.target.blur();
  });

  $('#tp-prev').addEventListener('click', () => S.previousTurningPoint());
  $('#tp-next').addEventListener('click', advanceTurningPoint);
  // Undo; if that steps back into a finished game, show its summary again.
  function undo() {
    if (S.undo() && S.state.match.ended) showSummary();
  }

  $('#btn-undo').addEventListener('click', undo);
  $('#btn-howto').addEventListener('click', openHowToPlay);
  $('#btn-new').addEventListener('click', openNewGame);
  $('#btn-settings').addEventListener('click', openSettings);
  $('#btn-end').addEventListener('click', () => (S.state.match.ended ? showSummary() : openPrimaryChooser()));

  // Ctrl/Cmd+Z for undo when not typing
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.target.matches('input, select')) {
      e.preventDefault();
      undo();
    }
  });

  /* ---------- Start up ---------- */

  S.subscribe(render);
  render();
  if (S.state.match.ended) showSummary();

  // Offline support. Service workers need http(s), so skip when opened as a file.
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* offline mode unavailable */ });
    });
  }
})();
