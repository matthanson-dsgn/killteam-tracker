/*
 * killTeams.js — the kill teams offered in each player's dropdown.
 *
 * To add a new team, add its name to the right group below. Order doesn't
 * matter: teams are sorted alphabetically within each group at load time.
 * Groups appear in the dropdown in the order listed here.
 *
 * (A plain script rather than JSON so the app still works when index.html is
 * opened directly from disk, where fetch() isn't allowed.)
 */
(function () {
  'use strict';

  const GROUPS = [
    {
      label: 'Imperium',
      teams: [
        'Angels of Death', 'Battleclade', 'Death Korps', 'Deathwatch', 'Elucidian Starstriders',
        'Exaction Squad', 'Hunter Clade', 'Imperial Navy Breachers', 'Inquisitorial Agents',
        'Kasrkin', 'Novitiates', 'Phobos Strike Team', 'Sanctifiers', 'Scout Squad',
        'Spectre Squad', 'Tempestus Aquilons', 'Veteran Guardsmen', 'Wolf Scouts',
      ],
    },
    {
      label: 'Chaos',
      teams: [
        'Blooded', 'Chaos Cult', 'Fellgor Ravagers', 'Gellerpox Infected', 'Goremongers',
        'Legionaries', 'Nemesis Claw', 'Plague Marines', 'Warpcoven',
      ],
    },
    {
      label: 'Xenos',
      teams: [
        'Blades of Khaine', 'Brood Brothers', 'Canoptek Circle', 'Corsair Voidscarred',
        'Farstalker Kinband', 'Hand of the Archon', 'Hierotek Circle', 'Kommandos', 'Mandrakes',
        'Pathfinders', 'Ravener', 'Vespid Stingwings', 'Void-Dancer Troupe', 'Wrecka Krew',
        'Wyrmblade',
      ],
    },
    {
      label: 'Leagues of Votann',
      teams: ['Hearthkyn Salvagers', 'Hernkyn Yaegirs'],
    },
  ];

  GROUPS.forEach((g) => g.teams.sort((a, b) => a.localeCompare(b)));

  const ALL = new Set(GROUPS.flatMap((g) => g.teams));

  window.KillTeams = {
    GROUPS,
    // Select value meaning "Other (custom)…"; the name typed is stored separately.
    OTHER: '__other__',
    has: (name) => ALL.has(name),
  };
})();
