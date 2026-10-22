/*
 * howToPlay.js — content for the "How to play" modal.
 *
 * Edit the text here; app.js turns it into headings and (nested) lists.
 *
 *   sections: [{
 *     title,                 // section heading
 *     intro,                 // optional paragraph under the heading
 *     ordered,               // true = numbered list, false = bullets
 *     items: [{
 *       term,                // optional bold lead-in, e.g. "Initiative"
 *       text,                // the explanation
 *       children: [string],  // optional bulleted sub-list
 *     }],
 *   }]
 *
 * (A plain script rather than JSON so the app still works when index.html
 * is opened directly from disk, where fetch() isn't allowed.)
 */
(function () {
  'use strict';

  window.HowToPlay = {
    sections: [
      {
        title: '1. Strategy Phase',
        intro: 'In this phase, players handle pre-turn resources, initiative, and tactical ploys:',
        ordered: true,
        items: [
          {
            term: 'Initiative',
            text: 'Roll off (or use previous turn rules) to see who has the initiative for the Turning Point.',
          },
          {
            term: 'Ready',
            text: 'All friendly operatives are readied for activation.',
          },
          {
            term: 'Strategic Gambits / Ploys',
            text: 'Starting with the initiative player, players alternate using or passing on strategic ploys and rules. Players also collect Command Points (CP).',
          },
        ],
      },
      {
        title: '2. Firefight Phase',
        intro: 'In this phase, players alternate activating their operatives to move, shoot, and fight.',
        ordered: false,
        items: [
          {
            term: 'Determine Order',
            text: 'When an operative activates, you can choose to keep its current order or flip it between Conceal and Engage.',
          },
          {
            term: 'Perform Actions',
            text: "Spend Action Points (AP) up to the operative's Action Point Limit (APL) to execute actions like:",
            children: [
              'Reposition / Dash / Fall Back / Charge',
              'Shoot (select weapon, target, roll attack and defence dice)',
              'Fight (melee combat with chosen weapons)',
              'Universal / Mission Actions (pick up marker, place marker, etc.)',
            ],
          },
        ],
      },
    ],
  };
})();
