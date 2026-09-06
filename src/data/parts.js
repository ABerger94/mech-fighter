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
    desc: 'Wide-band optics. Minimal plating, fast target acquisition.',
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
  },
  {
    id: 'head_duel',
    name: 'DUEL V-FIN',
    class: 'MID',
    desc: 'Ace-pilot head with a split V-fin array. Sharp lock, sharp profile.',
    weight: 110, armor: 100, energyCap: 15, energyRegen: 4,
    lockSpeed: 1.25, scanRange: 125, reloadBonus: 0.06,
    geo: { width: 0.7, height: 0.6, depth: 0.74, crest: 'vfin', visor: 'twin' }
  },
  {
    id: 'head_hawkeye',
    name: 'HAWKEYE OPTICS',
    class: 'SNIPER',
    desc: 'Long-baseline scope assembly. Sees everything, stops nothing.',
    weight: 130, armor: 55, energyCap: 20, energyRegen: 5,
    lockSpeed: 1.55, scanRange: 220,
    geo: { width: 0.66, height: 0.54, depth: 0.9, crest: 'scope', visor: 'mono' }
  },
  {
    id: 'head_gunner',
    name: 'GUNNER TWIN-EYE',
    class: 'SUPPORT',
    desc: 'Fire-control computer wired straight to the arms. Faster reloads.',
    weight: 120, armor: 120, energyCap: 8, energyRegen: 2,
    lockSpeed: 1.05, scanRange: 115, reloadBonus: 0.18,
    geo: { width: 0.8, height: 0.56, depth: 0.78, crest: 'fin', visor: 'wide' }
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
  },
  {
    id: 'torso_striker',
    name: 'STRIKER FRAME',
    class: 'ASSAULT',
    desc: 'Duelling chassis with reinforced shoulder anchors and a hot core.',
    weight: 430, armor: 470, energyCap: 215, energyRegen: 32, damageResist: 0.03,
    meleeBonus: 0.15,
    geo: { width: 1.62, height: 1.98, depth: 1.12, shoulders: 1.28, vents: 4 }
  },
  {
    id: 'torso_ogre',
    name: 'OGRE FRAME',
    class: 'SIEGE',
    desc: 'Absurd slab of armour with a reactor as an afterthought. Barely moves.',
    weight: 1080, armor: 1320, energyCap: 120, energyRegen: 16, damageResist: 0.18,
    geo: { width: 2.35, height: 2.2, depth: 1.6, shoulders: 1.62, vents: 2 }
  },
  {
    id: 'torso_phantom',
    name: 'PHANTOM FRAME',
    class: 'STEALTH',
    desc: 'Radar-absorbent facets. Enemy fire control never quite settles on you.',
    weight: 465, armor: 425, energyCap: 205, energyRegen: 30, damageResist: 0.04,
    stealth: 0.55,
    geo: { width: 1.66, height: 1.94, depth: 1.1, shoulders: 1.05, vents: 3, faceted: true }
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
  },
  {
    id: 'arms_gunslinger',
    name: 'GUNSLINGER ARMS',
    class: 'MARKSMAN',
    desc: 'Recoil-cancelling wrists and autoloaders. Built for magazines.',
    weight: 300, armor: 195, energyCap: 5, energyRegen: 2,
    spreadMult: 0.74, meleeMult: 0.8, reloadMult: 0.62,
    geo: { thickness: 0.44, length: 1.88, shoulderPad: 0.52 }
  },
  {
    id: 'arms_aegis',
    name: 'AEGIS ARMS',
    class: 'GUARD',
    desc: 'Forearm shield plates rated for direct hits. Heavy but stubborn.',
    weight: 480, armor: 430, energyCap: 0, energyRegen: 0,
    spreadMult: 1.15, meleeMult: 1.1, reloadMult: 1.1, damageResist: 0.05,
    geo: { thickness: 0.58, length: 1.9, shoulderPad: 0.86, guard: true }
  },
  {
    id: 'arms_duelist',
    name: 'DUELIST ARMS',
    class: 'MELEE',
    desc: 'High-torque elbows tuned for the swing. Poor at holding a rifle steady.',
    weight: 330, armor: 250, energyCap: 15, energyRegen: 3,
    spreadMult: 1.22, meleeMult: 1.42, reloadMult: 0.95,
    geo: { thickness: 0.5, length: 1.98, shoulderPad: 0.62 }
  }
];

/* ------------------------------------------------------------------- LEGS */
export const LEGS = [
  {
    id: 'legs_raptor',
    name: 'RAPTOR LIGHT',
    class: 'ULTRALIGHT',
    desc: 'Barely-there sprinting frame. Fastest thing on the deck, made of foil.',
    weight: 285, armor: 175, energyCap: 25, energyRegen: 6,
    load: 1650, walkSpeed: 24.5, boostMult: 1.45, jumpMult: 1.42, turnRate: 4.6,
    geo: { style: 'reverse', height: 2.35, thickness: 0.4, footWidth: 0.82 }
  },
  {
    id: 'legs_skimmer',
    name: 'SKIMMER BIPED',
    class: 'HIGH-MOBILITY',
    desc: 'Reverse-joint sprinters with oversized ankle thrusters.',
    weight: 360, armor: 240, energyCap: 20, energyRegen: 4,
    load: 1980, walkSpeed: 21.5, boostMult: 1.3, jumpMult: 1.28, turnRate: 4.2,
    geo: { style: 'reverse', height: 2.5, thickness: 0.5, footWidth: 0.95 }
  },
  {
    id: 'legs_strider',
    name: 'STRIDER BIPED',
    class: 'STANDARD',
    desc: 'Conventional bipedal legs. Solid footing, decent thrust.',
    weight: 545, armor: 400, energyCap: 10, energyRegen: 2,
    load: 2500, walkSpeed: 16.5, boostMult: 1.0, jumpMult: 1.0, turnRate: 3.4,
    geo: { style: 'biped', height: 2.7, thickness: 0.66, footWidth: 1.15 }
  },
  {
    id: 'legs_juggernaut',
    name: 'JUGGERNAUT LEGS',
    class: 'HEAVY',
    desc: 'Braced siege limbs. Enormous load budget, glacial pace.',
    weight: 900, armor: 700, energyCap: 0, energyRegen: 0,
    load: 3450, walkSpeed: 11.8, boostMult: 0.72, jumpMult: 0.72, turnRate: 2.5,
    geo: { style: 'heavy', height: 2.6, thickness: 0.92, footWidth: 1.5 }
  },
  {
    id: 'legs_quad',
    name: 'ARACHNE QUAD',
    class: 'FOUR-LEGGED',
    desc: 'Four splayed limbs. Rock-steady weapon platform with a huge budget.',
    weight: 985, armor: 780, energyCap: 10, energyRegen: 2,
    load: 4050, walkSpeed: 14.5, boostMult: 0.88, jumpMult: 0.85, turnRate: 3.0,
    recoilDamp: 0.4,
    geo: { style: 'quad', height: 2.3, thickness: 0.56, footWidth: 0.9 }
  },
  {
    id: 'legs_tread',
    name: 'SIEGE TREADS',
    class: 'TRACKED',
    desc: 'Tracked carriage. No thrusters at all - it simply never stops rolling.',
    weight: 1080, armor: 860, energyCap: 0, energyRegen: 4,
    load: 4600, walkSpeed: 18.0, boostMult: 1.0, jumpMult: 0, turnRate: 2.2,
    canJump: false, canThrust: false, dashBonus: 1.45, recoilDamp: 0.55,
    geo: { style: 'tread', height: 1.9, thickness: 0.9, footWidth: 1.7 }
  },
  {
    id: 'legs_hover',
    name: 'GLIDE HOVER',
    class: 'HOVER',
    desc: 'Never touches the deck. Drifts through corners, hates stopping.',
    weight: 430, armor: 265, energyCap: 35, energyRegen: 5,
    load: 2150, walkSpeed: 23.0, boostMult: 1.18, jumpMult: 0, turnRate: 3.9,
    canJump: false, hoverHeight: 1.9, groundGrip: 0.42,
    geo: { style: 'hover', height: 2.1, thickness: 0.7, footWidth: 1.25 }
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
  },
  {
    id: 'back_vesper',
    name: 'VESPER FUNNELS',
    class: 'REMOTE',
    desc: 'Four autonomous bits. Deploy with [F]; they orbit and fire on their own.',
    weight: 340, armor: 110, energyCap: 30, energyRegen: 4,
    boostBonus: 0.08, thrustEfficiency: 1.0,
    funnels: { count: 4, weapon: 'wp_funnel_beam', radius: 11, drain: 5 },
    geo: { style: 'funnel' }
  },
  {
    id: 'back_omni',
    name: 'OMNI RADAR',
    class: 'SENSOR',
    desc: 'Rotating phased array. Widens the lock cone and sees across the arena.',
    weight: 195, armor: 90, energyCap: 25, energyRegen: 8,
    boostBonus: 0.1, thrustEfficiency: 0.95,
    lockBonus: 0.45, scanBonus: 70, reloadBonus: 0.1,
    geo: { style: 'radar' }
  },
  {
    id: 'back_overdrive',
    name: 'OVERDRIVE THRUSTERS',
    class: 'BOOSTER',
    desc: 'Four oversized nozzles bolted to a fuel bladder. Enormous thrust, enormous thirst.',
    weight: 520, armor: 180, energyCap: 55, energyRegen: 2,
    boostBonus: 0.72, thrustEfficiency: 1.5,
    geo: { style: 'overdrive' }
  },
  {
    id: 'back_medic',
    name: 'FIELD REPAIR UNIT',
    class: 'SUPPORT',
    desc: 'Nanolaminate sprayers slowly re-plate the frame mid-fight.',
    weight: 395, armor: 210, energyCap: 15, energyRegen: 5,
    boostBonus: 0.0, thrustEfficiency: 1.1, hpRegen: 14,
    geo: { style: 'repair' }
  }
];

/* ---------------------------------------------------------------- WEAPONS */
/**
 * kind:        'beam' | 'ballistic' | 'missile' | 'melee' | 'shield' | 'laser' | 'none'
 * damage:      per projectile (per second for 'laser')
 * rpm:         rounds per minute (fire cadence)
 * pellets:     projectiles per trigger pull
 * speed:       projectile m/s
 * spread:      degrees of cone at base
 * mag/reload:  ballistic ammunition (0 mag = energy only)
 * energy:      energy drawn per shot (per second for 'laser')
 * charge:      seconds to full charge; damage scales to chargeMult
 * spinUp:      seconds to reach full cadence from spinFloor
 * grav:        m/s^2 applied to the projectile, for arcing ordnance
 * lunge:       melee only - forward impulse on the swing
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
    id: 'wp_gatling',
    name: 'GATLING DRIVER',
    class: 'BALLISTIC',
    kind: 'ballistic',
    desc: 'Six rotating barrels. Spins up to a wall of lead, then eats the magazine.',
    slots: ['right', 'left'],
    weight: 520, armor: 45,
    damage: 11, rpm: 900, pellets: 1, speed: 200, spread: 3.4,
    mag: 200, reload: 4.2, energy: 0, range: 125,
    spinUp: 1.15, spinFloor: 0.32,
    tracer: { color: 0xffd98a, radius: 0.1, length: 2.2, glow: 1.0 },
    geo: { style: 'gatling', length: 3.0, bulk: 0.52 }
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
    id: 'wp_sniper',
    name: 'LONGBOW CHARGE RIFLE',
    class: 'BEAM',
    kind: 'ballistic',
    desc: 'Hold to charge the capacitor. A full charge punches through anything.',
    slots: ['right', 'left'],
    weight: 455, armor: 25,
    damage: 88, rpm: 42, pellets: 1, speed: 500, spread: 0.1,
    mag: 4, reload: 3.6, energy: 18, range: 400,
    charge: 1.3, chargeMult: 3.4,
    tracer: { color: 0xc9a4ff, radius: 0.16, length: 9.5, glow: 2.2 },
    geo: { style: 'rail', length: 4.2, bulk: 0.36 }
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
    id: 'wp_bazooka',
    name: 'HYPER BAZOOKA',
    class: 'ORDNANCE',
    kind: 'ballistic',
    desc: 'Slow unguided shell with a very large radius of regret.',
    slots: ['right', 'left'],
    weight: 500, armor: 40,
    damage: 175, rpm: 36, pellets: 1, speed: 95, spread: 1.6,
    mag: 4, reload: 3.4, energy: 0, range: 200,
    grav: 7, blast: 11,
    tracer: { color: 0xffa04d, radius: 0.24, length: 2.2, glow: 1.3 },
    geo: { style: 'bazooka', length: 3.6, bulk: 0.58 }
  },
  {
    id: 'wp_mortar',
    name: 'ARC MORTAR',
    class: 'ORDNANCE',
    kind: 'ballistic',
    desc: 'Lobs shells over cover. The firing solution is computed for you.',
    slots: ['right', 'left'],
    weight: 385, armor: 35,
    damage: 98, rpm: 50, pellets: 1, speed: 68, spread: 1.2,
    mag: 6, reload: 2.9, energy: 0, range: 165,
    grav: 30, blast: 9, arcing: true,
    tracer: { color: 0xb6ff7a, radius: 0.2, length: 1.6, glow: 1.1 },
    geo: { style: 'mortar', length: 2.2, bulk: 0.6 }
  },
  {
    id: 'wp_missile_pod',
    name: 'SWARM MISSILE POD',
    class: 'ORDNANCE',
    kind: 'missile',
    desc: 'Four-tube homing salvo. Ignores cover the enemy trusts.',
    slots: ['right', 'left'],
    weight: 420, armor: 40,
    damage: 50, rpm: 30, pellets: 4, speed: 78, spread: 5.0,
    mag: 6, reload: 3.2, energy: 6, range: 200,
    homing: 2.9, blast: 6.0,
    tracer: { color: 0xff7a4d, radius: 0.2, length: 1.4, glow: 1.2 },
    geo: { style: 'pod', length: 1.6, bulk: 0.7 }
  },
  {
    id: 'wp_seeker',
    name: 'SEEKER BEAM',
    class: 'BEAM',
    kind: 'beam',
    desc: 'Three slow plasma spheres that steer themselves onto the target.',
    slots: ['right', 'left'],
    weight: 330, armor: 22,
    damage: 40, rpm: 45, pellets: 3, speed: 72, spread: 4.5,
    mag: 0, reload: 0, energy: 24, range: 180,
    homing: 2.2,
    tracer: { color: 0xff8ae0, radius: 0.26, length: 1.1, glow: 1.8 },
    geo: { style: 'orb', length: 1.7, bulk: 0.46 }
  },
  {
    id: 'wp_laser',
    name: 'AURORA LASER',
    class: 'BEAM',
    kind: 'laser',
    desc: 'Sustained cutting beam. Hits instantly, drains the core continuously.',
    slots: ['right', 'left'],
    weight: 405, armor: 28,
    damage: 108, rpm: 0, pellets: 1, speed: 0, spread: 0,
    mag: 0, reload: 0, energy: 34, range: 145,
    beamWidth: 0.34,
    tracer: { color: 0x8affe4, radius: 0.3, length: 1, glow: 2.4 },
    geo: { style: 'laser', length: 3.2, bulk: 0.4 }
  },
  {
    id: 'wp_sprayer',
    name: 'PLASMA SPRAYER',
    class: 'BEAM',
    kind: 'beam',
    desc: 'Vents raw plasma in a short cone. Terrifying inside knife range.',
    slots: ['right', 'left'],
    weight: 265, armor: 24,
    damage: 8, rpm: 420, pellets: 3, speed: 56, spread: 11,
    mag: 0, reload: 0, energy: 2.6, range: 30,
    tracer: { color: 0xff9b3d, radius: 0.34, length: 1.0, glow: 1.6 },
    geo: { style: 'sprayer', length: 2.1, bulk: 0.46 }
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
    id: 'wp_twin_saber',
    name: 'TWIN BEAM SABERS',
    class: 'MELEE',
    kind: 'melee',
    desc: 'Paired short sabers. Lower yield per cut, far more cuts.',
    slots: ['left', 'right'],
    weight: 205, armor: 20,
    damage: 132, rpm: 108, pellets: 1, speed: 0, spread: 0,
    mag: 0, reload: 0, energy: 15, range: 9.5,
    arc: 110,
    tracer: { color: 0x7dffb4, radius: 0.16, length: 3.1, glow: 2.4 },
    geo: { style: 'twinblade', length: 3.1, bulk: 0.22 }
  },
  {
    id: 'wp_axe',
    name: 'SUNDER AXE',
    class: 'MELEE',
    kind: 'melee',
    desc: 'Two tonnes of powered axe head. Slow, wide, final.',
    slots: ['left', 'right'],
    weight: 430, armor: 60,
    damage: 480, rpm: 34, pellets: 1, speed: 0, spread: 0,
    mag: 0, reload: 0, energy: 34, range: 12.5,
    arc: 105,
    tracer: { color: 0xffb03d, radius: 0.26, length: 3.4, glow: 2.0 },
    geo: { style: 'axe', length: 3.4, bulk: 0.5 }
  },
  {
    id: 'wp_lance',
    name: 'ASSAULT LANCE',
    class: 'MELEE',
    kind: 'melee',
    desc: 'Thrusts forward on its own boost. Enormous reach, total commitment.',
    slots: ['left', 'right'],
    weight: 355, armor: 45,
    damage: 330, rpm: 40, pellets: 1, speed: 0, spread: 0,
    mag: 0, reload: 0, energy: 30, range: 17,
    arc: 44, lunge: 44,
    tracer: { color: 0x9ecbff, radius: 0.22, length: 5.6, glow: 2.0 },
    geo: { style: 'lance', length: 5.6, bulk: 0.3 }
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
    id: 'wp_barrier',
    name: 'PHASE BARRIER',
    class: 'DEFENCE',
    kind: 'shield',
    desc: 'Projected energy wall. Near-total protection, ruinous drain.',
    slots: ['left'],
    weight: 215, armor: 80,
    damage: 40, rpm: 45, pellets: 1, speed: 0, spread: 0,
    mag: 0, reload: 0, energy: 0, range: 8,
    block: 0.88, blockDrain: 46,
    tracer: { color: 0xc8a4ff, radius: 0.2, length: 1, glow: 1 },
    geo: { style: 'barrier', length: 2.9, bulk: 0.8 }
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

/** Ordnance granted by backpacks. Not directly selectable. */
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
    mag: 5, reload: 4.5, energy: 4, range: 180,
    homing: 3.4, blast: 5.0,
    tracer: { color: 0xffd06a, radius: 0.16, length: 1.2, glow: 1.1 },
    geo: { style: 'none', length: 0, bulk: 0 }
  },
  {
    id: 'wp_funnel_beam',
    name: 'FUNNEL BEAM',
    class: 'REMOTE',
    kind: 'beam',
    desc: 'Autonomous bit fire.',
    slots: [],
    weight: 0, armor: 0,
    damage: 26, rpm: 40, pellets: 1, speed: 190, spread: 1.6,
    mag: 0, reload: 0, energy: 0, range: 120,
    tracer: { color: 0xa8f0ff, radius: 0.12, length: 3.0, glow: 1.8 },
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
  { name: 'VOID PURPLE', colors: { primary: '#4a3170', secondary: '#2a1a44', accent: '#c07df0', frame: '#171024', glow: '#d18cff' } },
  { name: 'SNOW WOLF', colors: { primary: '#dfe7ee', secondary: '#8a9aa8', accent: '#d94f4f', frame: '#2a3239', glow: '#9fe8ff' } },
  { name: 'TIGER', colors: { primary: '#e0912a', secondary: '#2b2019', accent: '#f2e2c0', frame: '#1a1411', glow: '#ffd166' } }
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

/* ------------------------------------------------------------- OPPONENTS */

export const ENEMY_PRESETS = [
  {
    id: 'trainer',
    name: 'TRAINER MK-I',
    threat: 1,
    blurb: 'Academy sparring frame. Predictable and patient.',
    skill: 0.5,
    head: 'head_standard', torso: 'torso_sentinel', arms: 'arms_vanguard',
    legs: 'legs_strider', backpack: 'back_aegis',
    rightWeapon: 'wp_autocannon', leftWeapon: 'wp_none',
    colors: { primary: '#6b7480', secondary: '#39414c', accent: '#ff8a3d', frame: '#1c2129', glow: '#ff7043' }
  },
  {
    id: 'nemesis',
    name: 'NEMESIS RX-7',
    threat: 2,
    blurb: 'Light interceptor. Beam rifle at range, saber when it smells blood.',
    skill: 0.75,
    head: 'head_scout', torso: 'torso_wraith', arms: 'arms_stiletto',
    legs: 'legs_skimmer', backpack: 'back_seraph',
    rightWeapon: 'wp_beam_rifle', leftWeapon: 'wp_plasma_blade',
    colors: { primary: '#8e1f3d', secondary: '#3d0f1d', accent: '#ffd166', frame: '#1a0a11', glow: '#ff3d6e' }
  },
  {
    id: 'bastion',
    name: 'BASTION HW-3',
    threat: 3,
    blurb: 'Tracked gun platform. Spins up a gatling and simply does not stop.',
    skill: 0.8,
    head: 'head_gunner', torso: 'torso_bulwark', arms: 'arms_gunslinger',
    legs: 'legs_tread', backpack: 'back_medic',
    rightWeapon: 'wp_gatling', leftWeapon: 'wp_tower_shield',
    colors: { primary: '#4a5b47', secondary: '#2a352a', accent: '#c9d94f', frame: '#161c15', glow: '#b6ff7a' }
  },
  {
    id: 'wraith',
    name: 'WRAITH SPECTRE',
    threat: 4,
    blurb: 'Stealth frame on hover skirts. Drifts, cuts, and is gone.',
    skill: 0.88,
    head: 'head_duel', torso: 'torso_phantom', arms: 'arms_duelist',
    legs: 'legs_hover', backpack: 'back_seraph',
    rightWeapon: 'wp_sprayer', leftWeapon: 'wp_twin_saber',
    colors: { primary: '#2c2f4a', secondary: '#15172a', accent: '#8f7dff', frame: '#0d0e1a', glow: '#b39cff' }
  },
  {
    id: 'artillery',
    name: 'SIEGE ARBITER',
    threat: 5,
    blurb: 'Quadruped artillery. Mortars over your cover, bazooka through it.',
    skill: 0.9,
    head: 'head_hawkeye', torso: 'torso_ogre', arms: 'arms_aegis',
    legs: 'legs_quad', backpack: 'back_hornet',
    rightWeapon: 'wp_bazooka', leftWeapon: 'wp_mortar',
    colors: { primary: '#5c4a2e', secondary: '#33291a', accent: '#ffb347', frame: '#191309', glow: '#ffcf7a' }
  },
  {
    id: 'overlord',
    name: 'OVERLORD ZX',
    threat: 6,
    blurb: 'Ace frame with funnels. Charged railgun fire from four angles at once.',
    skill: 1.0,
    head: 'head_command', torso: 'torso_striker', arms: 'arms_duelist',
    legs: 'legs_strider', backpack: 'back_vesper',
    rightWeapon: 'wp_sniper', leftWeapon: 'wp_twin_saber',
    colors: { primary: '#2b2f38', secondary: '#15181e', accent: '#c9ff3d', frame: '#0a0c10', glow: '#c9ff3d' }
  }
];

export const DIFFICULTIES = [
  { id: 'cadet', label: 'CADET', damageTaken: 0.55, aiSpeed: 0.72 },
  { id: 'veteran', label: 'VETERAN', damageTaken: 0.85, aiSpeed: 0.95 },
  { id: 'ace', label: 'ACE', damageTaken: 1.15, aiSpeed: 1.15 }
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

  // Load ratio drives the mobility penalty. At or under capacity you keep full
  // speed; above it the frame bogs down hard.
  const ratio = weight / load;
  const mobilityFactor = ratio <= 1 ? clamp(1.12 - ratio * 0.22, 0.9, 1.12) : clamp(1 - (ratio - 1) * 1.15, 0.32, 0.9);

  const walkSpeed = p.legs.walkSpeed * mobilityFactor;
  const boostPower = (p.legs.boostMult + (p.backpack.boostBonus || 0)) * clamp(1.05 - ratio * 0.18, 0.5, 1.05);
  const jumpPower = p.legs.jumpMult * clamp(1.08 - ratio * 0.24, 0.45, 1.08);
  const turnRate = p.legs.turnRate * clamp(1.1 - ratio * 0.22, 0.55, 1.1);
  const thrustEfficiency = p.backpack.thrustEfficiency || 1.0;
  const damageResist = clamp(
    (p.torso.damageResist || 0) + (p.backpack.damageResist || 0) + (p.arms.damageResist || 0),
    0,
    0.45
  );
  const reloadMult = clamp(
    p.arms.reloadMult * (1 - (p.head.reloadBonus || 0)) * (1 - (p.backpack.reloadBonus || 0)),
    0.35,
    2
  );

  return {
    weight,
    load,
    overweight: weight > load,
    loadRatio: ratio,
    maxHp: Math.round(armor),
    maxEnergy: Math.round(energyCap),
    energyRegen: energyRegenBase,
    hpRegen: p.backpack.hpRegen || 0,
    walkSpeed,
    boostPower,
    jumpPower,
    turnRate,
    thrustEfficiency,
    damageResist,
    spreadMult: p.arms.spreadMult,
    meleeMult: p.arms.meleeMult * (1 + (p.torso.meleeBonus || 0)),
    reloadMult,
    lockSpeed: p.head.lockSpeed + (p.backpack.lockBonus || 0),
    scanRange: p.head.scanRange + (p.backpack.scanBonus || 0),
    stealth: p.torso.stealth || 0,
    recoilDamp: p.legs.recoilDamp || 0,
    canJump: p.legs.canJump !== false,
    canThrust: p.legs.canThrust !== false,
    hoverHeight: p.legs.hoverHeight || 0,
    groundGrip: p.legs.groundGrip || 1,
    dashBonus: p.legs.dashBonus || 1,
    funnels: p.backpack.funnels || null,
    mobilityFactor,
    parts: p
  };
}

/**
 * Display rows for the garage stat panel.
 * @param {object} stats output of computeStats
 */
export function statRows(stats) {
  const rows = [
    { label: 'ARMOUR', value: stats.maxHp, max: 3600, text: String(stats.maxHp) },
    { label: 'ENERGY', value: stats.maxEnergy, max: 440, text: String(stats.maxEnergy) },
    { label: 'EN REGEN', value: stats.energyRegen, max: 70, text: `${stats.energyRegen.toFixed(0)}/s` },
    { label: 'SPEED', value: stats.walkSpeed, max: 28, text: `${stats.walkSpeed.toFixed(1)} m/s` },
    { label: 'BOOST', value: stats.boostPower, max: 2.2, text: stats.boostPower.toFixed(2) },
    { label: 'TURN', value: stats.turnRate, max: 5.0, text: stats.turnRate.toFixed(2) },
    { label: 'RESIST', value: stats.damageResist, max: 0.45, text: `${Math.round(stats.damageResist * 100)}%` },
    { label: 'LOCK', value: stats.lockSpeed, max: 2.2, text: stats.lockSpeed.toFixed(2) }
  ];
  if (stats.hpRegen > 0) {
    rows.push({ label: 'REPAIR', value: stats.hpRegen, max: 20, text: `${stats.hpRegen}/s` });
  }
  if (stats.stealth > 0) {
    rows.push({ label: 'STEALTH', value: stats.stealth, max: 1, text: `${Math.round(stats.stealth * 100)}%` });
  }
  rows.push({
    label: 'WEIGHT',
    value: stats.weight,
    max: stats.load,
    text: `${stats.weight}`,
    sub: `/${stats.load}`,
    invert: true
  });
  return rows;
}

/** Stat keys worth surfacing on each browser card. */
export const COMPARE_KEYS = {
  head: [['weight', 'WT', false], ['armor', 'AR', true], ['lockSpeed', 'LOCK', true], ['scanRange', 'SCAN', true]],
  torso: [['weight', 'WT', false], ['armor', 'AR', true], ['energyCap', 'EN', true], ['energyRegen', 'EN+', true], ['damageResist', 'RES', true]],
  arms: [['weight', 'WT', false], ['armor', 'AR', true], ['spreadMult', 'SPRD', false], ['meleeMult', 'MEL', true], ['reloadMult', 'RLD', false]],
  legs: [['weight', 'WT', false], ['armor', 'AR', true], ['load', 'LOAD', true], ['walkSpeed', 'SPD', true], ['boostMult', 'BST', true], ['jumpMult', 'JMP', true]],
  backpack: [['weight', 'WT', false], ['armor', 'AR', true], ['energyRegen', 'EN+', true], ['boostBonus', 'BST', true]],
  rightWeapon: [['weight', 'WT', false], ['damage', 'DMG', true], ['rpm', 'RPM', true], ['range', 'RNG', true], ['energy', 'EN', false]],
  leftWeapon: [['weight', 'WT', false], ['damage', 'DMG', true], ['rpm', 'RPM', true], ['range', 'RNG', true], ['energy', 'EN', false]]
};

/**
 * Rough sustained damage per second, shown on weapon cards so the browser
 * numbers mean something without a spreadsheet.
 */
export function weaponDps(part) {
  if (!part || part.kind === 'none' || part.kind === 'shield') return 0;
  if (part.kind === 'laser') return part.damage;
  const shots = part.rpm / 60;
  const perShot = part.damage * Math.max(1, part.pellets) * (part.chargeMult ? (1 + part.chargeMult) / 2 : 1);
  if (part.mag > 0) {
    // One trigger pull consumes one round regardless of how many pellets it throws.
    const cycle = part.mag / shots + part.reload;
    return (part.mag * perShot) / cycle;
  }
  return perShot * shots;
}
