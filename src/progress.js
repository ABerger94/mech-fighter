/**
 * MECH FIGHTER - pilot progression.
 *
 * The catalogue starts mostly locked. Each opponent you defeat releases a
 * slice of it, so the roster doubles as the unlock ladder. Everything is
 * derived from the list of defeated opponents rather than stored twice, so
 * changing the unlock tables reshapes an existing save correctly.
 */

import { ENEMY_PRESETS, STARTER_PARTS, ARENA_UNLOCKS, SLOT_ORDER, CATALOG } from './data/parts.js';

const STORAGE_KEY = 'mechfighter.progress.v1';

/** @returns {{defeated: string[]}} */
export function loadProgress() {
  const empty = { defeated: [] };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty;
    const saved = JSON.parse(raw);
    const known = ENEMY_PRESETS.map((e) => e.id);
    return { defeated: (saved.defeated || []).filter((id) => known.includes(id)) };
  } catch (err) {
    return empty;
  }
}

export function saveProgress(progress) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ defeated: progress.defeated }));
  } catch (err) {
    /* storage unavailable (private mode) - progress simply is not kept */
  }
}

export function resetProgress() {
  const fresh = { defeated: [] };
  saveProgress(fresh);
  return fresh;
}

/** Every part id available at this point in the ladder. */
export function unlockedParts(progress) {
  const set = new Set(STARTER_PARTS);
  for (const foe of ENEMY_PRESETS) {
    if (!progress.defeated.includes(foe.id)) continue;
    for (const id of foe.unlocks) set.add(id);
  }
  return set;
}

/** Which opponent releases a given part, or null when it is a starter part. */
export function unlockSource(partId) {
  if (STARTER_PARTS.includes(partId)) return null;
  return ENEMY_PRESETS.find((foe) => foe.unlocks.includes(partId)) || null;
}

/**
 * Opponents you are allowed to deploy against: the first is always open, and
 * each further one opens when the previous is beaten. Beaten opponents stay
 * available so a build can be tested against them again.
 */
export function unlockedOpponents(progress) {
  const set = new Set([ENEMY_PRESETS[0].id]);
  for (let i = 0; i < ENEMY_PRESETS.length; i++) {
    if (progress.defeated.includes(ENEMY_PRESETS[i].id) && ENEMY_PRESETS[i + 1]) {
      set.add(ENEMY_PRESETS[i + 1].id);
    }
  }
  return set;
}

/** The opponent that must fall before `id` becomes available. */
export function opponentGate(id) {
  const index = ENEMY_PRESETS.findIndex((e) => e.id === id);
  return index > 0 ? ENEMY_PRESETS[index - 1] : null;
}

export function unlockedArenas(progress) {
  const set = new Set();
  for (const [arenaId, gate] of Object.entries(ARENA_UNLOCKS)) {
    if (!gate || progress.defeated.includes(gate)) set.add(arenaId);
  }
  return set;
}

export function arenaGate(arenaId) {
  const gate = ARENA_UNLOCKS[arenaId];
  return gate ? ENEMY_PRESETS.find((e) => e.id === gate) || null : null;
}

/**
 * Record a win.
 * @returns {{progress: object, parts: object[], arenas: string[], opponent: object|null}}
 *          the new state plus everything it just released, for the results screen
 */
export function recordVictory(progress, opponentId) {
  const foe = ENEMY_PRESETS.find((e) => e.id === opponentId);
  if (!foe || progress.defeated.includes(opponentId)) {
    return { progress, parts: [], arenas: [], opponent: null, repeat: true };
  }

  const before = { parts: unlockedParts(progress), arenas: unlockedArenas(progress) };
  const next = { defeated: [...progress.defeated, opponentId] };
  saveProgress(next);

  const parts = [];
  for (const slot of SLOT_ORDER) {
    for (const part of CATALOG[slot]) {
      if (foe.unlocks.includes(part.id) && !before.parts.has(part.id) && !parts.some((p) => p.id === part.id)) {
        parts.push(part);
      }
    }
  }
  const arenas = [...unlockedArenas(next)].filter((a) => !before.arenas.has(a));
  const nextFoe = [...unlockedOpponents(next)].find((id) => !unlockedOpponents(progress).has(id));

  return {
    progress: next,
    parts,
    arenas,
    opponent: nextFoe ? ENEMY_PRESETS.find((e) => e.id === nextFoe) : null,
    repeat: false
  };
}

/** Ladder position, for the garage readout. */
export function ladderStatus(progress) {
  return { defeated: progress.defeated.length, total: ENEMY_PRESETS.length };
}
