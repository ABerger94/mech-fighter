/**
 * MECH FIGHTER - part catalogue and stat derivation.
 *
 * Every part contributes raw stats. `computeStats()` folds a loadout into the
 * derived numbers the garage displays and the arena simulation actually uses.
 *
 * Units:
 *   weight   arbitrary mass units (legs provide a load capacity budget)
 *   armor    hit points contributed to the frame
 *   energy   thruster / beam-weapon reservoir
 *   speed    metres per second of ground movement
 */

export const SLOT_ORDER = ['head', 'torso', 'arms', 'legs', 'backpack', 'rightWeapon', 'leftWeapon'];

export const SLOT_LABELS = {
  head: 'HEAD',
  torso: 'TORSO',
  arms: 'ARMS',
  legs: 'LEGS',
  backpack: 'BACK',
  rightWeapon: 'R-ARM',
  leftWeapon: 'L-ARM'
};

/* ------------------------------------------------------------------ HEADS */
export const HEADS = [
  {
    id: 'head_scout',
    name: 'RECON VISOR',
    class: 'LIGHT',
    desc: 'Wide-band optics. Minimal plating, fastest target acquisition.',
    weight: 60, armor: 45, energyCap: 15, energyRegen: 5,
    lockSpeed: 1.35, scanRange: 130,
    geo: { width: 0.62, height: 0.52, depth: 0.68, crest: 'antenna', visor: 'wide' }
  },
  {
    id: 'head_standard',
    name: 'MK-II SENSOR',
    class: 'MID',
    desc: 'General purpose sensor head. Balanced plating and optics.',
    weight: 95, armor: 85, energyCap: 10, energyRegen: 3,
    lockSpeed: 1.0, scanRange: 110,
    geo: { width: 0.72, height: 0.58, depth: 0.72, crest: 'fin', visor: 'twin' }
  },
  {
    id: 'head_command',
    name: 'BASTION COMMAND',
    class: 'HEAVY',
    desc: 'Armoured command module. Slow optics, survives direct hits.',
    weight: 145, armor: 165, energyCap: 5, energyRegen: 1,
    lockSpeed: 0.8, scanRange: 95,
    geo: { width: 0.88, height: 0.64, depth: 0.8, crest: 'horns', visor: 'mono' }
  }
];

/* ----------------------------------------------------------------- TORSOS */
export const TORSOS = [
  {
    id: 'torso_wraith',
    name: 'WRAITH FRAME',
    class: 'LIGHT',
    desc: 'Skeletal core built around an oversized generator. Fragile but tireless.',
    weight: 340, armor: 360, energyCap: 240, energyRegen: 36, damageResist: 0.0,
    geo: { width: 1.5, height: 1.9, depth: 1.05, shoulders: 0.95, vents: 4 }
  },
  {
    id: 'torso_sentinel',
    name: 'SENTINEL FRAME',
    class: 'MID',
    desc: 'Standard-issue combat chassis. No weakness, no specialism.',
    weight: 500, armor: 560, energyCap: 190, energyRegen: 28, damageResist: 0.05,
    geo: { width: 1.75, height: 2.0, depth: 1.2, shoulders: 1.15, vents: 3 }
  },
  {
    id: 'torso_bulwark',
    name: 'BULWARK FRAME',
    class: 'HEAVY',
    desc: 'Layered composite slabs over a compact reactor. Walking fortress.',
    weight: 760, armor: 880, energyCap: 155, energyRegen: 21, damageResist: 0.12,
    geo: { width: 2.05, height: 2.1, depth: 1.42, shoulders: 1.4, vents: 2 }
  }
];

/* ------------------------------------------------------------------- ARMS */
export const ARMS = [
  {
    id: 'arms_stiletto',
    name: 'STILETTO ARMS',
    class: 'LIGHT',
    desc: 'Gyro-stabilised limbs. Tightest weapon grouping, thin plating.',
    weight: 190, armor: 130, energyCap: 10, energyRegen: 3,
    spreadMult: 0.68, meleeMult: 0.85, reloadMult: 0.8,
    geo: { thickness: 0.36, length: 1.75, shoulderPad: 0.42 }
  },
  {
    id: 'arms_vanguard',
    name: 'VANGUARD ARMS',
    class: 'MID',
    desc: 'Reliable actuators with modular hardpoints. The default choice.',
    weight: 275, armor: 210, energyCap: 5, energyRegen: 1,
    spreadMult: 1.0, meleeMult: 1.0, reloadMult: 1.0,
    geo: { thickness: 0.46, length: 1.85, shoulderPad: 0.58 }
  },
  {
    id: 'arms_titan',
    name: 'TITAN ARMS',
    class: 'HEAVY',
    desc: 'Hydraulic siege limbs. Brutal melee, sloppy at range.',
    weight: 430, armor: 350, energyCap: 0, energyRegen: 0,
    spreadMult: 1.35, meleeMult: 1.55, reloadMult: 1.25,
    geo: { thickness: 0.62, length: 1.95, shoulderPad: 0.8 }
  }
];

/* ------------------------------------------------------------------- LEGS */
export const LEGS = [
  {
    id: 'legs_skimmer',
    name: 'SKIMMER BIPED',
    class: 'HIGH-MOBILITY',
    desc: 'Reverse-joint sprinters with oversized ankle thrusters.',
    weight: 360, armor: 240, energyCap: 20, energyRegen: 4,
    load: 1650, walkSpeed: 21.5, boostMult: 1.3, jumpMult: 1.28, turnRate: 4.2,
    geo: { style: 'reverse', height: 2.5, thickness: 0.5, footWidth: 0.95 }
  },
  {
    id: 'legs_strider',
    name: 'STRIDER BIPED',
    class: 'STANDARD',
    desc: 'Conventional bipedal legs. Solid footing, decent thrust.',
    weight: 545, armor: 400, energyCap: 10, energyRegen: 2,
    load: 2250, walkSpeed: 16.5, boostMult: 1.0, jumpMult: 1.0, turnRate: 3.4,
    geo: { style: 'biped', height: 2.7, thickness: 0.66, footWidth: 1.15 }
  },
  {
    id: 'legs_juggernaut',
    name: 'JUGGERNAUT LEGS',
    class: 'HEAVY',
    desc: 'Braced siege limbs. Enormous load budget, glacial pace.',
    weight: 900, armor: 700, energyCap: 0, energyRegen: 0,
    load: 3300, walkSpeed: 11.8, boostMult: 0.72, jumpMult: 0.72, turnRate: 2.5,
    geo: { style: 'heavy', height: 2.6, thickness: 0.92, footWidth: 1.5 }
  }
];

/* --------------------------------------------------------------- BACKPACK */
export const BACKPACKS = [
  {
    id: 'back_seraph',
    name: 'SERAPH WINGS',
    class: 'BOOSTER',
    desc: 'Deployable thruster vanes. Maximum airtime and dash range.',
    weight: 170, armor: 70, energyCap: 45, energyRegen: 6,
    boostBonus: 0.38, thrustEfficiency: 0.78,
    geo: { style: 'wings' }
  },
  {
    id: 'back_hornet',
    name: 'HORNET POD',
    class: 'ORDNANCE',
    desc: 'Shoulder-mounted micro-missile rack. Fire with [F].',
    weight: 310, armor: 140, energyCap: 0, energyRegen: 0,
    boostBonus: 0.0, thrustEfficiency: 1.05,
    shoulderWeapon: 'wp_micro_missile',
    geo: { style: 'pod' }
  },
  {
    id: 'back_aegis',
    name: 'AEGIS CORE',
    class: 'SUPPORT',
    desc: 'Auxiliary reactor and radiator stack. Energy never runs dry.',
    weight: 255, armor: 250, energyCap: 60, energyRegen: 16,
    boostBonus: 0.05, thrustEfficiency: 1.0, damageResist: 0.06,
    geo: { style: 'reactor' }
  }
];

/* ---------------------------------------------------------------- WEAPONS */
/**
 * kind:        'beam' | 'ballistic' | 'missile' | 'melee' | 'shield'
 * damage:      per projectile
 * rpm:         rounds per minute (fire cadence)
 * pellets:     projectiles per trigger pull
 * speed:       projectile m/s
 * spread:      degrees of cone at base
 * mag/reload:  ballistic ammunition (0 mag = energy only)
 * energy:      energy drawn per shot
 */
export const WEAPONS = [
  {
    id: 'wp_beam_rifle',
    name: 'LANCER BEAM RIFLE',
    class: 'BEAM',
    kind: 'beam',
    desc: 'Long-range particle lance. Draws heavily on the generator.',
    slots: ['right', 'left'],
    weight: 260, armor: 20,
    damage: 82, rpm: 84, pellets: 1, speed: 260, spread: 0.35,
    mag: 0, reload: 0, energy: 30, range: 220,
    tracer: { color: 0x7fe9ff, radius: 0.16, length: 5.2, glow: 1.6 },
    geo: { style: 'rifle', length: 3.1, bulk: 0.34 }
  },
  {
    id: 'wp_pulse_smg',
    name: 'STINGER PULSE SMG',
    class: 'BEAM',
    kind: 'beam',
    desc: 'Rapid low-yield bolts. Shreds light frames at close range.',
    slots: ['right', 'left'],
    weight: 150, armor: 12,
    damage: 15, rpm: 460, pellets: 1, speed: 195, spread: 2.4,
    mag: 0, reload: 0, energy: 5.2, range: 130,
    tracer: { color: 0x9dffd0, radius: 0.11, length: 2.4, glow: 1.3 },
    geo: { style: 'smg', length: 1.9, bulk: 0.3 }
  },
  {
    id: 'wp_autocannon',
    name: 'HAMMER AUTOCANNON',
    class: 'BALLISTIC',
    kind: 'ballistic',
    desc: 'Belt-fed kinetic slugs. No energy cost, plenty of noise.',
    slots: ['right', 'left'],
    weight: 340, armor: 30,
    damage: 27, rpm: 240, pellets: 1, speed: 185, spread: 1.5,
    mag: 45, reload: 2.3, energy: 0, range: 170,
    tracer: { color: 0xffce6a, radius: 0.13, length: 2.8, glow: 1.0 },
    geo: { style: 'cannon', length: 2.7, bulk: 0.46 }
  },
  {
    id: 'wp_railgun',
    name: 'PIERCER RAILGUN',
    class: 'BALLISTIC',
    kind: 'ballistic',
    desc: 'Hypersonic slug. One shot decides the duel, if it connects.',
    slots: ['right', 'left'],
    weight: 480, armor: 25,
    damage: 210, rpm: 32, pellets: 1, speed: 430, spread: 0.15,
    mag: 5, reload: 3.4, energy: 12, range: 320,
    tracer: { color: 0xff9de0, radius: 0.18, length: 8.0, glow: 2.0 },
    geo: { style: 'rail', length: 3.9, bulk: 0.42 }
  },
  {
    id: 'wp_shotgun',
    name: 'SCATTER BREACHER',
    class: 'BALLISTIC',
    kind: 'ballistic',
    desc: 'Eight-pellet spread. Devastating inside twenty metres.',
    slots: ['right', 'left'],
    weight: 300, armor: 26,
    damage: 19, rpm: 72, pellets: 8, speed: 150, spread: 6.5,
    mag: 6, reload: 2.7, energy: 0, range: 60,
    tracer: { color: 0xffb066, radius: 0.12, length: 1.8, glow: 1.0 },
    geo: { style: 'shotgun', length: 2.3, bulk: 0.52 }
  },
  {
    id: 'wp_missile_pod',
    name: 'SWARM MISSILE POD',
    class: 'ORDNANCE',
    kind: 'missile',
    desc: 'Four-tube homing salvo. Ignores cover the enemy trusts.',
    slots: ['right', 'left'],
    weight: 420, armor: 40,
    damage: 46, rpm: 30, pellets: 4, speed: 78, spread: 5.0,
    mag: 12, reload: 3.2, energy: 6, range: 200,
    homing: 2.9, blast: 6.0,
    tracer: { color: 0xff7a4d, radius: 0.2, length: 1.4, glow: 1.2 },
    geo: { style: 'pod', length: 1.6, bulk: 0.7 }
  },
  {
    id: 'wp_plasma_blade',
    name: 'PLASMA EDGE',
    class: 'MELEE',
    kind: 'melee',
    desc: 'Superheated blade. Closes duels in a single committed swing.',
    slots: ['left', 'right'],
    weight: 180, armor: 18,
    damage: 265, rpm: 62, pellets: 1, speed: 0, spread: 0,
    mag: 0, reload: 0, energy: 24, range: 11.5,
    arc: 70,
    tracer: { color: 0xff5fa8, radius: 0.2, length: 4.4, glow: 2.4 },
    geo: { style: 'blade', length: 4.4, bulk: 0.24 }
  },
  {
    id: 'wp_tower_shield',
    name: 'AEGIS TOWER SHIELD',
    class: 'DEFENCE',
    kind: 'shield',
    desc: 'Hold to brace. Cuts frontal damage while energy holds out.',
    slots: ['left'],
    weight: 350, armor: 180,
    damage: 60, rpm: 45, pellets: 1, speed: 0, spread: 0,
    mag: 0, reload: 0, energy: 0, range: 8,
    block: 0.72, blockDrain: 26,
    tracer: { color: 0x8fd8ff, radius: 0.2, length: 1, glow: 1 },
    geo: { style: 'shield', length: 2.6, bulk: 0.9 }
  },
  {
    id: 'wp_none',
    name: 'EMPTY HARDPOINT',
    class: 'NONE',
    kind: 'none',
    desc: 'Nothing mounted. Saves weight, contributes nothing.',
    slots: ['right', 'left'],
    weight: 0, armor: 0,
    damage: 0, rpm: 0, pellets: 0, speed: 0, spread: 0,
    mag: 0, reload: 0, energy: 0, range: 0,
    tracer: { color: 0xffffff, radius: 0.1, length: 1, glow: 1 },
    geo: { style: 'none', length: 0, bulk: 0 }
  }
];

/** Shoulder ordnance granted by the HORNET POD backpack. Not player-selectable. */
export const SHOULDER_WEAPONS = [
  {
    id: 'wp_micro_missile',
    name: 'MICRO MISSILE RACK',
    class: 'ORDNANCE',
    kind: 'missile',
    desc: 'Backpack salvo, fired with [F].',
    slots: [],
    weight: 0, armor: 0,
    damage: 30, rpm: 22, pellets: 6, speed: 70, spread: 7,
    mag: 18, reload: 4.5, energy: 4, range: 180,
    homing: 3.4, blast: 5.0,
    tracer: { color: 0xffd06a, radius: 0.16, length: 1.2, glow: 1.1 },
    geo: { style: 'none', length: 0, bulk: 0 }
  }
];

export const CATALOG = {
  head: HEADS,
  torso: TORSOS,
  arms: ARMS,
  legs: LEGS,
  backpack: BACKPACKS,
  rightWeapon: WEAPONS.filter((w) => w.slots.includes('right')),
  leftWeapon: WEAPONS.filter((w) => w.slots.includes('left'))
};

const ALL_PARTS = [...HEADS, ...TORSOS, ...ARMS, ...LEGS, ...BACKPACKS, ...WEAPONS, ...SHOULDER_WEAPONS];

/** Look a part up by id across every catalogue. */
export function getPart(id) {
  return ALL_PARTS.find((p) => p.id === id) || null;
}

/** Resolve a loadout of ids into the actual part objects. */
export function resolveLoadout(loadout) {
  const out = {};
  for (const slot of SLOT_ORDER) {
    const list = CATALOG[slot];
    const found = list.find((p) => p.id === loadout[slot]);
    out[slot] = found || list[0];
  }
  return out;
}

export const PAINT_SLOTS = [
  { key: 'primary', label: 'PRIMARY ARMOUR' },
  { key: 'secondary', label: 'SECONDARY PANELS' },
  { key: 'accent', label: 'ACCENT TRIM' },
  { key: 'frame', label: 'INNER FRAME' },
  { key: 'glow', label: 'ENERGY GLOW' }
];

export const PAINT_PRESETS = [
  { name: 'FEDERATION', colors: { primary: '#e8eef5', secondary: '#2f6fd0', accent: '#e0b23a', frame: '#26303c', glow: '#4de1ff' } },
  { name: 'ZAKU GREEN', colors: { primary: '#4f7a48', secondary: '#2f4a2c', accent: '#b8c24a', frame: '#20281f', glow: '#ff5e5e' } },
  { name: 'CRIMSON ACE', colors: { primary: '#b5202e', secondary: '#6d1520', accent: '#e8c15a', frame: '#241017', glow: '#ffb347' } },
  { name: 'MIDNIGHT', colors: { primary: '#1d2733', secondary: '#0f151d', accent: '#4de1ff', frame: '#0a0e14', glow: '#7ef0ff' } },
  { name: 'DESERT', colors: { primary: '#c2a878', secondary: '#7d6a48', accent: '#3f4a3a', frame: '#2b2419', glow: '#ffd58a' } },
  { name: 'VOID PURPLE', colors: { primary: '#4a3170', secondary: '#2a1a44', accent: '#c07df0', frame: '#171024', glow: '#d18cff' } }
];

export const DEFAULT_COLORS = { ...PAINT_PRESETS[0].colors };

export const DEFAULT_LOADOUT = {
  name: 'GX-01 VANGUARD',
  head: 'head_standard',
  torso: 'torso_sentinel',
  arms: 'arms_vanguard',
  legs: 'legs_strider',
  backpack: 'back_seraph',
  rightWeapon: 'wp_beam_rifle',
  leftWeapon: 'wp_plasma_blade',
  colors: { ...DEFAULT_COLORS }
};

/** Enemy frames, unlocked in difficulty order. */
export const ENEMY_PRESETS = [
  {
    name: 'TRAINER MK-I',
    skill: 0.55,
    head: 'head_standard',
    torso: 'torso_sentinel',
    arms: 'arms_vanguard',
    legs: 'legs_strider',
    backpack: 'back_aegis',
    rightWeapon: 'wp_autocannon',
    leftWeapon: 'wp_none',
    colors: { primary: '#6b7480', secondary: '#39414c', accent: '#ff8a3d', frame: '#1c2129', glow: '#ff7043' }
  },
  {
    name: 'NEMESIS RX-7',
    skill: 0.78,
    head: 'head_scout',
    torso: 'torso_wraith',
    arms: 'arms_stiletto',
    legs: 'legs_skimmer',
    backpack: 'back_seraph',
    rightWeapon: 'wp_beam_rifle',
    leftWeapon: 'wp_plasma_blade',
    colors: { primary: '#8e1f3d', secondary: '#3d0f1d', accent: '#ffd166', frame: '#1a0a11', glow: '#ff3d6e' }
  },
  {
    name: 'OVERLORD ZX',
    skill: 1.0,
    head: 'head_command',
    torso: 'torso_bulwark',
    arms: 'arms_titan',
    legs: 'legs_juggernaut',
    backpack: 'back_hornet',
    rightWeapon: 'wp_railgun',
    leftWeapon: 'wp_missile_pod',
    colors: { primary: '#2b2f38', secondary: '#15181e', accent: '#c9ff3d', frame: '#0a0c10', glow: '#c9ff3d' }
  }
];

export const DIFFICULTIES = [
  { id: 'cadet', label: 'CADET', enemyIndex: 0, damageTaken: 0.55, aiSpeed: 0.72 },
  { id: 'veteran', label: 'VETERAN', enemyIndex: 1, damageTaken: 0.85, aiSpeed: 0.95 },
  { id: 'ace', label: 'ACE', enemyIndex: 2, damageTaken: 1.15, aiSpeed: 1.15 }
];

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/**
 * Fold a loadout into derived combat stats.
 * @param {object} loadout ids per slot
 * @returns {object} derived stat block
 */
export function computeStats(loadout) {
  const p = resolveLoadout(loadout);
  const parts = [p.head, p.torso, p.arms, p.legs, p.backpack, p.rightWeapon, p.leftWeapon];

  const sum = (key) => parts.reduce((acc, part) => acc + (part[key] || 0), 0);

  const weight = sum('weight');
  const armor = sum('armor');
  const energyCap = sum('energyCap');
  const energyRegenBase = sum('energyRegen');
  const load = p.legs.load;

  // Load ratio drives the mobility penalty. At/under capacity you keep full
  // speed; above it the frame bogs down hard.
  const ratio = weight / load;
  const mobilityFactor = ratio <= 1 ? clamp(1.12 - ratio * 0.22, 0.9, 1.12) : clamp(1 - (ratio - 1) * 1.15, 0.32, 0.9);

  const walkSpeed = p.legs.walkSpeed * mobilityFactor;
  const boostPower = (p.legs.boostMult + (p.backpack.boostBonus || 0)) * clamp(1.05 - ratio * 0.18, 0.5, 1.05);
  const jumpPower = p.legs.jumpMult * clamp(1.08 - ratio * 0.24, 0.45, 1.08);
  const turnRate = p.legs.turnRate * clamp(1.1 - ratio * 0.22, 0.55, 1.1);
  const thrustEfficiency = p.backpack.thrustEfficiency || 1.0;
  const damageResist = clamp((p.torso.damageResist || 0) + (p.backpack.damageResist || 0), 0, 0.45);

  return {
    weight,
    load,
    overweight: weight > load,
    loadRatio: ratio,
    maxHp: Math.round(armor),
    maxEnergy: Math.round(energyCap),
    energyRegen: energyRegenBase,
    walkSpeed,
    boostPower,
    jumpPower,
    turnRate,
    thrustEfficiency,
    damageResist,
    spreadMult: p.arms.spreadMult,
    meleeMult: p.arms.meleeMult,
    reloadMult: p.arms.reloadMult,
    lockSpeed: p.head.lockSpeed,
    scanRange: p.head.scanRange,
    mobilityFactor,
    parts: p
  };
}

/**
 * Display rows for the garage stat panel.
 * @param {object} stats output of computeStats
 */
export function statRows(stats) {
  return [
    { label: 'ARMOUR', value: stats.maxHp, max: 3200, text: String(stats.maxHp) },
    { label: 'ENERGY', value: stats.maxEnergy, max: 420, text: String(stats.maxEnergy) },
    { label: 'EN REGEN', value: stats.energyRegen, max: 70, text: `${stats.energyRegen.toFixed(0)}/s` },
    { label: 'SPEED', value: stats.walkSpeed, max: 26, text: `${stats.walkSpeed.toFixed(1)} m/s` },
    { label: 'BOOST', value: stats.boostPower, max: 1.9, text: stats.boostPower.toFixed(2) },
    { label: 'TURN', value: stats.turnRate, max: 5.0, text: stats.turnRate.toFixed(2) },
    { label: 'RESIST', value: stats.damageResist, max: 0.45, text: `${Math.round(stats.damageResist * 100)}%` },
    {
      label: 'WEIGHT',
      value: stats.weight,
      max: stats.load,
      text: `${stats.weight}`,
      sub: `/${stats.load}`,
      invert: true
    }
  ];
}

/** Compare two parts on the stat keys worth surfacing in the browser list. */
export const COMPARE_KEYS = {
  head: [['weight', 'WT', false], ['armor', 'AR', true], ['energyRegen', 'EN+', true]],
  torso: [['weight', 'WT', false], ['armor', 'AR', true], ['energyCap', 'EN', true], ['energyRegen', 'EN+', true]],
  arms: [['weight', 'WT', false], ['armor', 'AR', true], ['spreadMult', 'SPRD', false], ['meleeMult', 'MEL', true]],
  legs: [['weight', 'WT', false], ['armor', 'AR', true], ['load', 'LOAD', true], ['walkSpeed', 'SPD', true], ['boostMult', 'BST', true]],
  backpack: [['weight', 'WT', false], ['armor', 'AR', true], ['energyRegen', 'EN+', true], ['boostBonus', 'BST', true]],
  rightWeapon: [['weight', 'WT', false], ['damage', 'DMG', true], ['rpm', 'RPM', true], ['range', 'RNG', true], ['energy', 'EN', false]],
  leftWeapon: [['weight', 'WT', false], ['damage', 'DMG', true], ['rpm', 'RPM', true], ['range', 'RNG', true], ['energy', 'EN', false]]
};
