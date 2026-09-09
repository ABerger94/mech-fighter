/**
 * MECH FIGHTER - battle arena.
 *
 * Owns the combat simulation: mech physics against the arena colliders, the
 * weapon/projectile system, hit detection, the enemy AI and the match rules.
 * Scene construction and camera rigs come from renderer.js; the visual flourish
 * comes from effects.js; DOM readouts go through hud.js.
 */

import * as THREE from 'three';
import { createArenaEnvironment, ChaseCamera, ARENAS, getArena } from './renderer.js';
import { buildMech, disposeMech, updateMech, punchRecoil, playMelee, flashDamage, setSpin } from './mech.js';
import { ENEMY_PRESETS, DIFFICULTIES, getPart } from './data/parts.js';
import { Effects } from './effects.js';
import { audio } from './audio.js';

const GRAVITY = 34;
const MATCH_TIME = 180;
const GROUND_ACCEL = 78;
const AIR_ACCEL = 30;
const JUMP_SPEED = 15.5;
const JUMP_COST = 10;
const HOVER_THRUST = 46;
const HOVER_DRAIN = 26;
const DASH_SPEED = 34;
const DASH_COST = 24;
const DASH_COOLDOWN = 0.42;
const ENERGY_DELAY = 0.35;
const DEG = Math.PI / 180;
/** Just short of straight up/down, so the camera's up vector never degenerates. */
const MAX_PITCH = 84 * DEG;

/* ====================================================================== */
/*  Geometry helpers                                                      */
/* ====================================================================== */

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();

// Dedicated scratch vectors for helpers that must never alias the callers'.
const _cs1 = new THREE.Vector3();
const _cs2 = new THREE.Vector3();
const _cs3 = new THREE.Vector3();
const _sc1 = new THREE.Vector3();
const _sc2 = new THREE.Vector3();
const _sc3 = new THREE.Vector3();
const _los = new THREE.Vector3();
const _pj1 = new THREE.Vector3();
const _pj2 = new THREE.Vector3();
const _pj3 = new THREE.Vector3();
const _pj4 = new THREE.Vector3();
const _pjA = new THREE.Vector3();
const _pjB = new THREE.Vector3();
const _pjHit = new THREE.Vector3();
const _lz1 = new THREE.Vector3();
const _lz2 = new THREE.Vector3();
const _lz3 = new THREE.Vector3();
const _lz4 = new THREE.Vector3();
const _lzA = new THREE.Vector3();
const _lzB = new THREE.Vector3();
const _lzC = new THREE.Vector3();
const _lzD = new THREE.Vector3();
const _fn1 = new THREE.Vector3();
const _fn2 = new THREE.Vector3();
const _fn3 = new THREE.Vector3();
const _fn4 = new THREE.Vector3();
const _fnQ = new THREE.Quaternion();
const _fnUp = new THREE.Vector3(0, 1, 0);
const _dmgDir = new THREE.Vector3();
/** Chain links drawn along a tether at full stretch. */
const TETHER_LINKS = 32;
const _th1 = new THREE.Vector3();
const _th2 = new THREE.Vector3();
const _th3 = new THREE.Vector3();
const _th4 = new THREE.Vector3();
const _thA = new THREE.Vector3();
const _thB = new THREE.Vector3();
const _ld1 = new THREE.Vector3();
const _ld2 = new THREE.Vector3();

/** Squared distance between two segments, with the closest points. */
function closestSegmentPoints(p1, q1, p2, q2, out1, out2) {
  const d1 = _cs1.subVectors(q1, p1);
  const d2 = _cs2.subVectors(q2, p2);
  const r = _cs3.subVectors(p1, p2);
  const a = d1.dot(d1);
  const e = d2.dot(d2);
  const f = d2.dot(r);
  let s;
  let t;
  const EPS = 1e-8;

  if (a <= EPS && e <= EPS) {
    s = 0;
    t = 0;
  } else if (a <= EPS) {
    s = 0;
    t = THREE.MathUtils.clamp(f / e, 0, 1);
  } else {
    const c = d1.dot(r);
    if (e <= EPS) {
      t = 0;
      s = THREE.MathUtils.clamp(-c / a, 0, 1);
    } else {
      const b = d1.dot(d2);
      const denom = a * e - b * b;
      s = denom !== 0 ? THREE.MathUtils.clamp((b * f - c * e) / denom, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = THREE.MathUtils.clamp(-c / a, 0, 1);
      } else if (t > 1) {
        t = 1;
        s = THREE.MathUtils.clamp((b - c) / a, 0, 1);
      }
    }
  }
  out1.copy(p1).addScaledVector(d1, s);
  out2.copy(p2).addScaledVector(d2, t);
  return { s, t, distSq: out1.distanceToSquared(out2) };
}

/** Rotate a unit vector inside a cone of `degrees`. */
function scatter(dir, degrees) {
  if (degrees <= 0) return dir;
  const rad = degrees * DEG;
  const ang = Math.random() * Math.PI * 2;
  const mag = Math.sqrt(Math.random()) * rad;
  // build an orthonormal basis around dir
  const up = Math.abs(dir.y) > 0.94 ? _sc3.set(1, 0, 0) : _sc3.set(0, 1, 0);
  const right = _sc1.crossVectors(dir, up).normalize();
  const realUp = _sc2.crossVectors(right, dir).normalize();
  dir
    .addScaledVector(right, Math.cos(ang) * Math.tan(mag))
    .addScaledVector(realUp, Math.sin(ang) * Math.tan(mag))
    .normalize();
  return dir;
}

/**
 * Elevation angle that lands a projectile of `speed` on a target `dx` metres
 * away horizontally and `dy` metres up, under gravity `g`.
 * @param {boolean} high pick the lobbed arc rather than the flat one
 * @returns {number|null} radians, or null when the shot cannot reach
 */
function ballisticAngle(dx, dy, speed, g, high) {
  if (g <= 0 || dx < 0.001) return null;
  const v2 = speed * speed;
  const disc = v2 * v2 - g * (g * dx * dx + 2 * dy * v2);
  if (disc < 0) return null;
  const root = Math.sqrt(disc);
  return Math.atan((v2 + (high ? root : -root)) / (g * dx));
}

/** Yaw that makes a fighter at `from` face `to` (local forward is -Z). */
function yawTowards(from, to) {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z));
}

/* ====================================================================== */
/*  Fighter                                                               */
/* ====================================================================== */

class WeaponSlot {
  constructor(part, muzzle, slotName) {
    this.part = part;
    this.muzzle = muzzle;
    this.slot = slotName;
    this.cooldown = 0;
    this.ammo = part.mag || 0;
    this.reloading = false;
    this.reloadTimer = 0;
    this.chargeT = 0;      // seconds held on a charge weapon
    this.spin = 0;         // 0..1 gatling spin-up
    this.beamMesh = null;  // continuous laser geometry
    this.beamActive = false;
  }

  get usesAmmo() {
    return (this.part.mag || 0) > 0;
  }

  get interval() {
    const base = this.part.rpm > 0 ? 60 / this.part.rpm : 1;
    if (!this.part.spinUp) return base;
    // barrels start slow and wind up to the rated cadence
    const floor = this.part.spinFloor ?? 0.35;
    return base / (floor + (1 - floor) * this.spin);
  }

  /** 0..1 charge progress for weapons with a capacitor. */
  get chargeFrac() {
    return this.part.charge ? Math.min(1, this.chargeT / this.part.charge) : 0;
  }

  /** Damage multiplier from the current charge. */
  get chargeMult() {
    if (!this.part.charge) return 1;
    return 1 + (this.part.chargeMult - 1) * this.chargeFrac;
  }
}

class Fighter {
  /**
   * @param {object} loadout part ids + colors
   * @param {boolean} isPlayer
   * @param {string} name
   */
  constructor(loadout, isPlayer, name) {
    this.name = name;
    this.isPlayer = isPlayer;
    this.mech = buildMech(loadout);
    this.root = this.mech.root;
    this.stats = this.mech.stats;

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.radius = this.mech.radius;
    this.height = this.mech.height;

    // Named opponents may carry reinforced armour beyond what their frame
    // parts alone provide; the player never gets a multiplier.
    this.maxHp = Math.round(this.stats.maxHp * (isPlayer ? 1 : loadout.hpMult || 1));
    this.hp = this.maxHp;
    this.maxEnergy = this.stats.maxEnergy;
    this.energy = this.maxEnergy;
    this.energyLock = 0;

    this.grounded = true;
    this.groundY = 0;
    this.dashCooldown = 0;
    this.boosting = false;
    this.blocking = false;
    this.alive = true;
    this.deadTimer = 0;

    this.weapons = {
      right: new WeaponSlot(this.mech.weapons.right.part, this.mech.weapons.right.muzzle, 'right'),
      left: new WeaponSlot(this.mech.weapons.left.part, this.mech.weapons.left.muzzle, 'left'),
      shoulder: this.mech.weapons.shoulder
        ? new WeaponSlot(this.mech.weapons.shoulder.part, this.mech.weapons.shoulder.muzzle, 'shoulder')
        : null
    };

    this.meleePending = null;
    this.tether = null;
    /** External per-frame velocity from a magnetic tether; the legs cannot fight it. */
    this.tetherPull = null;
    this.funnels = null;
    this.funnelPart = null;
    this.funnelsDeployed = false;
    this.damageDealt = 0;
    this.damageTaken = 0;
    this.shotsFired = 0;
    this.shotsHit = 0;
    this._wasGrounded = true;
    this._thrusterTick = 0;
  }

  /** Torso-height world position, used for aiming and camera anchoring. */
  center(out = new THREE.Vector3()) {
    return out.set(this.pos.x, this.pos.y + this.height * 0.62, this.pos.z);
  }

  /** Bottom and top of the collision capsule axis. */
  capsule(a, b) {
    a.set(this.pos.x, this.pos.y + this.radius, this.pos.z);
    b.set(this.pos.x, this.pos.y + Math.max(this.radius + 0.1, this.height - this.radius * 1.2), this.pos.z);
  }

  forward(out = new THREE.Vector3()) {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  spendEnergy(amount) {
    if (this.energy < amount) return false;
    this.energy -= amount;
    this.energyLock = ENERGY_DELAY;
    return true;
  }
}

/* ====================================================================== */
/*  Arena                                                                 */
/* ====================================================================== */

export class Arena {
  /**
   * @param {object} opts { renderer, input, hud, onEnd }
   */
  constructor(opts) {
    this.gameRenderer = opts.renderer;
    this.input = opts.input;
    this.hud = opts.hud;
    this.onEnd = opts.onEnd || (() => {});

    // Environments are built on demand and cached; each keeps its own effects
    // pool and camera rig so switching battlefields is instant.
    this.environments = new Map();
    this.arenaId = null;
    this._useEnvironment(ARENAS[0].id);

    this.projectiles = [];
    this.projPools = new Map();
    this.projGeo = new Map();
    this.projMat = new Map();
    this.beamMats = new Map();
    this.tetherMats = new Map();
    this.funnelMats = [];

    this.player = null;
    this.enemy = null;
    this.running = false;
    this.paused = false;
    this.time = MATCH_TIME;
    this.finished = false;
    this.endTimer = 0;
    this.elapsed = 0;
    this._aimPoint = new THREE.Vector3();
    this._locked = false;
    this._hitMarkTimer = 0;
    this._lockTimer = 0;
    this._screenPos = new THREE.Vector3();
    this._lowHpWarned = false;
    this._aiAim = new THREE.Vector3();
    this._aiTmp = new THREE.Vector3();
    this._aiTmp2 = new THREE.Vector3();
    this._aiTmp3 = new THREE.Vector3();
    this._leadPt = new THREE.Vector3();
  }

  /**
   * Bind the arena to a battlefield, building it the first time it is used.
   * @param {string} id one of ARENAS
   */
  _useEnvironment(id) {
    let entry = this.environments.get(id);
    if (!entry) {
      const env = createArenaEnvironment(id);
      const effects = new Effects(env.scene);
      effects.setCamera(env.camera);
      entry = { ...env, effects, chase: new ChaseCamera(env.camera) };
      this.environments.set(id, entry);
    }
    this.arenaId = id;
    this.scene = entry.scene;
    this.camera = entry.camera;
    this.colliders = entry.colliders;
    this.envUpdate = entry.update;
    this.half = entry.half;
    this.effects = entry.effects;
    this.chase = entry.chase;
    this.arenaDef = entry.def;
  }

  /* ------------------------------------------------------------- setup */

  /**
   * Begin a match.
   * @param {object} playerLoadout
   * @param {object} settings { difficulty, opponent, arena } - 'random' allowed
   *                          for opponent and arena
   */
  start(playerLoadout, settings = {}) {
    this.reset();

    const diffId = typeof settings === 'string' ? settings : settings.difficulty;
    this.difficulty = DIFFICULTIES.find((d) => d.id === diffId) || DIFFICULTIES[1];

    const oppId = settings.opponent;
    const preset =
      !oppId || oppId === 'random'
        ? ENEMY_PRESETS[Math.floor(Math.random() * ENEMY_PRESETS.length)]
        : ENEMY_PRESETS.find((e) => e.id === oppId) || ENEMY_PRESETS[0];

    const arenaId = settings.arena;
    const chosenArena =
      !arenaId || arenaId === 'random' ? ARENAS[Math.floor(Math.random() * ARENAS.length)].id : getArena(arenaId).id;
    this._useEnvironment(chosenArena);

    this.player = new Fighter(playerLoadout, true, playerLoadout.name || 'PLAYER FRAME');
    this.enemy = new Fighter(preset, false, preset.name);
    this.enemy.skill = preset.skill;
    this.enemy.profile = preset.ai || null;
    this.enemy.phases = preset.phases || null;
    this.enemy.presetId = preset.id;

    this.scene.add(this.player.root, this.enemy.root);

    // Spawn off the centre line so neither frame starts behind a pillar.
    this.player.pos.set(-16, 0, 58);
    this.enemy.pos.set(16, 0, -58);
    this.player.yaw = yawTowards(this.player.pos, this.enemy.pos);
    this.enemy.yaw = yawTowards(this.enemy.pos, this.player.pos);

    this.chase.yaw = this.player.yaw;
    this.chase.pitch = -0.06;
    this.chase.distance = 14 + this.player.height * 0.35;
    this.chase.height = this.player.height * 0.72;

    this._createFunnels(this.player);
    this._createFunnels(this.enemy);
    this._initAi();

    this.hud.reset();
    this.hud.setNames(this.player.name, this.enemy.name);
    this.hud.feed(`${this.arenaDef.name}`, 'warn');
    this.hud.feed('COMBAT START', 'warn');

    this.time = MATCH_TIME;
    this.running = true;
    this.finished = false;
    this.paused = false;
    this.elapsed = 0;
    this._lowHpWarned = false;

    // place both frames on the ground properly
    for (const f of [this.player, this.enemy]) {
      f.groundY = this.groundHeightAt(f.pos.x, f.pos.z, f.radius);
      f.pos.y = f.groundY;
      this.syncTransform(f);
    }
    this.chase.position.copy(this.player.center(_v)).add(_v2.set(0, 6, 16));
    this.chase.update(0.016, this.player.center(_v));
  }

  reset() {
    for (const p of this.projectiles) this._recycleProjectile(p);
    this.projectiles.length = 0;
    this.effects.clear();
    for (const f of [this.player, this.enemy]) {
      if (!f) continue;
      this._detachTether(f);
      this._disposeFunnels(f);
      for (const key of ['right', 'left', 'shoulder']) {
        const w = f.weapons[key];
        if (w && w.beamMesh) {
          this.scene.remove(w.beamMesh);
          w.beamMesh = null;
        }
      }
      disposeMech(f.mech);
    }
    for (const m of this.funnelMats) m.dispose();
    this.funnelMats.length = 0;
    this.player = null;
    this.enemy = null;
    this.running = false;
    this.finished = false;
    this.endTimer = 0;
    audio.setBoost(false);
  }

  dispose() {
    this.reset();
    for (const entry of this.environments.values()) entry.effects.dispose();
    this.environments.clear();
    for (const g of this.projGeo.values()) g.dispose();
    for (const m of this.projMat.values()) m.dispose();
    this.projGeo.clear();
    this.projMat.clear();
    for (const m of this.beamMats.values()) m.dispose();
    this.beamMats.clear();
    for (const m of this.tetherMats.values()) {
      m.steel.dispose();
      m.hot.dispose();
    }
    this.tetherMats.clear();
    if (this._beamGeo) this._beamGeo.dispose();
    if (this._funnelGeo) this._funnelGeo.dispose();
    if (this._tetherHeadGeo) this._tetherHeadGeo.dispose();
    if (this._tetherLinkGeo) this._tetherLinkGeo.dispose();
  }

  setPaused(on) {
    this.paused = on;
    this.hud.setPaused(on);
    if (on) audio.setBoost(false);
  }

  /* -------------------------------------------------------- collisions */

  /** Highest walkable surface directly under a point. */
  groundHeightAt(x, z, radius) {
    let best = 0;
    for (const c of this.colliders) {
      if (c.type === 'box') {
        if (Math.abs(x - c.x) < c.hx + radius * 0.35 && Math.abs(z - c.z) < c.hz + radius * 0.35) {
          if (c.h > best) best = c.h;
        }
      } else {
        const dx = x - c.x;
        const dz = z - c.z;
        if (dx * dx + dz * dz < (c.r + radius * 0.35) ** 2) {
          if (c.h > best) best = c.h;
        }
      }
    }
    return best;
  }

  /** Push a fighter out of any solid it is intersecting (XZ only). */
  resolveCollisions(f) {
    const feet = f.pos.y;
    for (const c of this.colliders) {
      // Standing on top of it? Then no lateral push.
      if (feet >= c.h - 0.35) continue;
      if (c.type === 'box') {
        const dx = f.pos.x - c.x;
        const dz = f.pos.z - c.z;
        const ox = c.hx + f.radius - Math.abs(dx);
        const oz = c.hz + f.radius - Math.abs(dz);
        if (ox > 0 && oz > 0) {
          if (ox < oz) {
            f.pos.x += Math.sign(dx || 1) * ox;
            f.vel.x *= 0.15;
          } else {
            f.pos.z += Math.sign(dz || 1) * oz;
            f.vel.z *= 0.15;
          }
        }
      } else {
        const dx = f.pos.x - c.x;
        const dz = f.pos.z - c.z;
        const d = Math.hypot(dx, dz);
        const minD = c.r + f.radius;
        if (d < minD) {
          const nx = d > 0.001 ? dx / d : 1;
          const nz = d > 0.001 ? dz / d : 0;
          f.pos.x = c.x + nx * minD;
          f.pos.z = c.z + nz * minD;
          const into = f.vel.x * nx + f.vel.z * nz;
          if (into < 0) {
            f.vel.x -= nx * into;
            f.vel.z -= nz * into;
          }
        }
      }
    }
    const lim = this.half - 3 - f.radius;
    f.pos.x = THREE.MathUtils.clamp(f.pos.x, -lim, lim);
    f.pos.z = THREE.MathUtils.clamp(f.pos.z, -lim, lim);

    // fighters cannot occupy the same space
    const other = f === this.player ? this.enemy : this.player;
    if (other && other.alive && f.alive) {
      const dx = f.pos.x - other.pos.x;
      const dz = f.pos.z - other.pos.z;
      const d = Math.hypot(dx, dz);
      const minD = f.radius + other.radius;
      if (d < minD && d > 0.0001 && Math.abs(f.pos.y - other.pos.y) < f.height * 0.7) {
        const push = (minD - d) * 0.5;
        f.pos.x += (dx / d) * push;
        f.pos.z += (dz / d) * push;
      }
    }
  }

  /**
   * Cast a ray against the arena solids and the ground plane.
   * @returns {{t:number, hit:boolean, normal:THREE.Vector3}}
   */
  castRay(origin, dir, maxDist, out = { t: 0, hit: false, normal: new THREE.Vector3() }) {
    let bestT = maxDist;
    let nx = 0;
    let ny = 1;
    let nz = 0;
    let hit = false;

    if (dir.y < -1e-6) {
      const t = -origin.y / dir.y;
      if (t > 0 && t < bestT) {
        bestT = t;
        nx = 0; ny = 1; nz = 0;
        hit = true;
      }
    }

    for (const c of this.colliders) {
      if (c.type === 'box') {
        const minX = c.x - c.hx;
        const maxX = c.x + c.hx;
        const minZ = c.z - c.hz;
        const maxZ = c.z + c.hz;
        let tmin = 0;
        let tmax = bestT;
        let axis = -1;
        let sign = 1;
        let ok = true;
        const bounds = [
          [origin.x, dir.x, minX, maxX, 0],
          [origin.y, dir.y, 0, c.h, 1],
          [origin.z, dir.z, minZ, maxZ, 2]
        ];
        for (const [o, d, lo, hi, ax] of bounds) {
          if (Math.abs(d) < 1e-8) {
            if (o < lo || o > hi) { ok = false; break; }
            continue;
          }
          let t1 = (lo - o) / d;
          let t2 = (hi - o) / d;
          let s = -1;
          if (t1 > t2) {
            const tmp = t1;
            t1 = t2;
            t2 = tmp;
            s = 1;
          }
          if (t1 > tmin) {
            tmin = t1;
            axis = ax;
            sign = s;
          }
          if (t2 < tmax) tmax = t2;
          if (tmin > tmax) { ok = false; break; }
        }
        if (ok && tmin > 0.0001 && tmin < bestT) {
          bestT = tmin;
          hit = true;
          nx = axis === 0 ? sign : 0;
          ny = axis === 1 ? sign : 0;
          nz = axis === 2 ? sign : 0;
          if (axis === -1) { nx = 0; ny = 1; nz = 0; }
        }
      } else {
        const ox = origin.x - c.x;
        const oz = origin.z - c.z;
        const a = dir.x * dir.x + dir.z * dir.z;
        if (a > 1e-9) {
          const b = 2 * (ox * dir.x + oz * dir.z);
          const cc = ox * ox + oz * oz - c.r * c.r;
          const disc = b * b - 4 * a * cc;
          if (disc >= 0) {
            const sq = Math.sqrt(disc);
            for (const t of [(-b - sq) / (2 * a), (-b + sq) / (2 * a)]) {
              if (t > 0.0001 && t < bestT) {
                const y = origin.y + dir.y * t;
                if (y >= 0 && y <= c.h) {
                  bestT = t;
                  hit = true;
                  const px = ox + dir.x * t;
                  const pz = oz + dir.z * t;
                  const len = Math.hypot(px, pz) || 1;
                  nx = px / len; ny = 0; nz = pz / len;
                  break;
                }
              }
            }
          }
        }
        // top cap
        if (dir.y < -1e-8) {
          const t = (c.h - origin.y) / dir.y;
          if (t > 0.0001 && t < bestT) {
            const px = origin.x + dir.x * t - c.x;
            const pz = origin.z + dir.z * t - c.z;
            if (px * px + pz * pz <= c.r * c.r) {
              bestT = t;
              hit = true;
              nx = 0; ny = 1; nz = 0;
            }
          }
        }
      }
    }

    out.t = bestT;
    out.hit = hit;
    out.normal.set(nx, ny, nz);
    return out;
  }

  /** True when nothing solid blocks the straight line between two points. */
  hasLineOfSight(from, to) {
    _los.subVectors(to, from);
    const dist = _los.length();
    if (dist < 0.001) return true;
    _los.divideScalar(dist);
    const r = this.castRay(from, _los, dist, this._losOut || (this._losOut = { t: 0, hit: false, normal: new THREE.Vector3() }));
    return !r.hit || r.t >= dist - 0.5;
  }

  /* -------------------------------------------------------- projectiles */

  _projectileAssets(part) {
    let geo = this.projGeo.get(part.id);
    if (!geo) {
      const t = part.tracer;
      geo = new THREE.CylinderGeometry(t.radius, t.radius * 0.7, t.length, 7, 1, true);
      geo.rotateX(-Math.PI / 2);
      this.projGeo.set(part.id, geo);
    }
    let mat = this.projMat.get(part.id);
    if (!mat) {
      mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(part.tracer.color),
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      this.projMat.set(part.id, mat);
    }
    return { geo, mat };
  }

  _spawnProjectile(owner, part, origin, dir, targetFighter) {
    const { geo, mat } = this._projectileAssets(part);
    let pool = this.projPools.get(part.id);
    if (!pool) {
      pool = [];
      this.projPools.set(part.id, pool);
    }
    let mesh = pool.pop();
    if (!mesh) {
      mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = 3;
    }
    mesh.visible = true;
    mesh.position.copy(origin);
    this.scene.add(mesh);

    const speed = part.speed;
    const p = {
      mesh,
      partId: part.id,
      pos: origin.clone(),
      prev: origin.clone(),
      vel: dir.clone().multiplyScalar(speed),
      life: Math.max(0.6, part.range / Math.max(20, speed) + (part.grav > 0 ? 3.2 : 0.4)),
      damage: part.damage,
      owner,
      target: targetFighter,
      homing: part.homing || 0,
      grav: part.grav || 0,
      blast: part.blast || 0,
      color: part.tracer.color,
      radius: part.tracer.radius * 1.4,
      kind: part.kind,
      energyDrain: part.energyDrain || 0,
      proximity: part.proximity || 0,
      armTime: part.kind === 'missile' ? 0.12 : part.proximity > 0 ? 0.1 : 0
    };
    this.projectiles.push(p);
    return p;
  }

  _recycleProjectile(p) {
    p.mesh.visible = false;
    if (p.mesh.parent) p.mesh.parent.remove(p.mesh);
    let pool = this.projPools.get(p.partId);
    if (!pool) {
      pool = [];
      this.projPools.set(p.partId, pool);
    }
    if (pool.length < 64) pool.push(p.mesh);
  }

  /* ------------------------------------------------------------ firing */

  /**
   * How long a shot from this weapon actually takes to cover the distance.
   *
   * For arcing ordnance the muzzle speed is split between the horizontal and
   * vertical axes, so a shell crosses the ground far slower than its speed
   * stat suggests; using the straight-line distance would under-lead badly.
   * @returns {number} seconds
   */
  _flightTime(from, to, part) {
    const dx = Math.hypot(to.x - from.x, to.z - from.z);
    const dy = to.y - from.y;
    if (!part.grav) return Math.hypot(dx, dy) / Math.max(1, part.speed);
    const angle = ballisticAngle(dx, dy, part.speed, part.grav, !!part.arcing);
    if (angle === null) return dx / Math.max(1, part.speed);
    const horizontal = part.speed * Math.cos(angle);
    return horizontal > 0.01 ? dx / horizontal : dx / Math.max(1, part.speed);
  }

  /** Where a fighter will be in `t` seconds, including its own fall. */
  _predictTarget(target, t, out) {
    out.set(
      target.pos.x + target.vel.x * t,
      target.pos.y + target.vel.y * t - 0.5 * GRAVITY * t * t,
      target.pos.z + target.vel.z * t
    );
    if (out.y < target.groundY) out.y = target.groundY;
    out.y += target.height * 0.62;
    return out;
  }

  /**
   * Aim point that puts the shot where the target will be when it lands.
   * Solved iteratively because the flight time depends on the lead itself.
   * @param {number} scale 1 leads perfectly; the AI under-leads by its skill
   * @param {THREE.Vector3|null} error deliberate aim wobble, applied last
   */
  _leadAim(muzzle, part, target, scale, error, out) {
    target.center(out);
    // Homing ordnance steers itself, and hitscan has no travel time at all.
    if (!part.speed || part.homing > 0) {
      if (error) out.add(error);
      return out;
    }
    for (let i = 0; i < 3; i++) {
      const t = this._flightTime(muzzle, out, part);
      this._predictTarget(target, t * scale, out);
    }
    if (error) out.add(error);
    return out;
  }

  /**
   * Attempt to fire one weapon slot.
   * @param {{target: object, scale?: number, error?: THREE.Vector3}|null} lead
   *        when set, the aim point is replaced by a solved intercept
   * @returns {boolean} true when a shot went out
   */
  fire(f, slotName, aimPoint, lead = null) {
    const w = f.weapons[slotName];
    if (!w || !f.alive) return false;
    const part = w.part;
    if (part.kind === 'none' || part.kind === 'shield') return false;
    if (w.cooldown > 0 || w.reloading) return false;

    if (part.kind === 'melee') return this._startMelee(f, slotName);
    if (part.kind === 'grapple') return this._startGrapple(f, slotName);

    if (w.usesAmmo && w.ammo <= 0) {
      this.reload(f, slotName);
      return false;
    }
    const energyCost = part.energy || 0;
    if (energyCost > 0 && !f.spendEnergy(energyCost)) {
      if (f.isPlayer) this.hud.feed('ENERGY DEPLETED', 'bad');
      return false;
    }

    const damageMult = w.chargeMult;
    const chargeFrac = w.chargeFrac;
    w.chargeT = 0;
    w.cooldown = w.interval;
    if (w.usesAmmo) w.ammo -= 1;
    f.shotsFired += 1;

    // muzzle position in world space
    const muzzle = w.muzzle;
    muzzle.getWorldPosition(_v4);

    const target = f === this.player ? this.enemy : this.player;
    const spread = (part.spread || 0) * f.stats.spreadMult;

    // Lead the shot onto where the target will be, per weapon: a slow shell
    // needs far more lead than a beam from the other hand.
    let aim = aimPoint;
    if (lead && lead.target && lead.target.alive) {
      aim = this._leadAim(_v4, part, lead.target, lead.scale ?? 1, lead.error || null, this._leadPt);
    }

    // Arcing ordnance solves its own launch angle so lobbed shells actually land.
    const base = _v3.copy(aim).sub(_v4);
    if (base.lengthSq() < 0.0001) base.set(0, 0, -1);
    if (part.grav > 0) {
      const flat = Math.hypot(base.x, base.z);
      const angle = ballisticAngle(flat, base.y, part.speed, part.grav, !!part.arcing);
      if (angle !== null) {
        const horiz = flat > 0.001 ? 1 / flat : 0;
        base.set(base.x * horiz * Math.cos(angle), Math.sin(angle), base.z * horiz * Math.cos(angle));
      }
    }
    base.normalize();

    for (let i = 0; i < Math.max(1, part.pellets); i++) {
      const d = base.clone();
      scatter(d, spread);
      const p = this._spawnProjectile(f, part, _v4.clone(), d, target);
      p.damage = part.damage * damageMult;
      if (chargeFrac > 0.55) p.mesh.scale.set(1 + chargeFrac, 1 + chargeFrac, 1);
      else p.mesh.scale.set(1, 1, 1);
    }

    // recoil + effects
    const kick = (part.kind === 'ballistic' ? 0.9 : 0.55) * (1 + chargeFrac * 0.8);
    punchRecoil(f.mech, slotName === 'left' ? 'left' : 'right', kick);
    const fwd = _v2.copy(aim).sub(_v4).normalize();
    this.effects.muzzleFlash(_v4, fwd, part.tracer.color, (part.kind === 'missile' ? 0.9 : 1.15) * (1 + chargeFrac));
    if (f === this.player && chargeFrac > 0.5) this.chase.addShake(0.25 * chargeFrac);

    const near = this._audibility(f);
    if (near > 0.02) {
      if (part.id === 'wp_railgun' || part.charge) audio.railShot();
      else if (part.kind === 'beam') (part.rpm > 200 ? audio.pulseShot() : audio.beamShot());
      else if (part.kind === 'missile') audio.missileLaunch();
      else audio.ballisticShot();
    }

    if (w.usesAmmo && w.ammo <= 0) this.reload(f, slotName);
    return true;
  }

  /**
   * Route a held trigger through the right firing model: charge capacitors,
   * spin-up cadence, continuous beams, or a plain shot.
   * @param {boolean} held is the trigger down this frame
   */
  _handleTrigger(f, slotName, held, aimPoint, dt, lead = null) {
    const w = f.weapons[slotName];
    if (!w || !f.alive) return;
    const part = w.part;

    // gatling barrels wind up while held and coast back down
    if (part.spinUp) {
      const rate = dt / part.spinUp;
      w.spin = THREE.MathUtils.clamp(w.spin + (held && !w.reloading ? rate : -rate * 1.4), 0, 1);
      if (f === this.player) setSpin(f.mech, w.spin);
    }

    if (part.kind === 'laser') {
      this._tickLaser(f, w, aimPoint, held, dt);
      return;
    }

    if (part.charge > 0) {
      if (held && !w.reloading && w.cooldown <= 0 && (!w.usesAmmo || w.ammo > 0)) {
        w.chargeT = Math.min(part.charge, w.chargeT + dt);
        if (f === this.player && w.chargeT >= part.charge && !w._chargeBeeped) {
          w._chargeBeeped = true;
          audio.uiConfirm();
        }
      } else if (!held && w.chargeT > 0.08) {
        w._chargeBeeped = false;
        this.fire(f, slotName, aimPoint, lead);
      } else if (!held) {
        w.chargeT = 0;
        w._chargeBeeped = false;
      }
      return;
    }

    if (held) this.fire(f, slotName, aimPoint, lead);
  }

  /** Continuous hitscan beam: damage per second along a ray from the muzzle. */
  _tickLaser(f, w, aimPoint, held, dt) {
    const part = w.part;
    const drain = part.energy * dt;
    const firing = held && f.alive && f.energy > drain;

    if (!firing) {
      if (w.beamMesh) w.beamMesh.visible = false;
      w.beamActive = false;
      return;
    }

    f.energy -= drain;
    f.energyLock = ENERGY_DELAY;
    w.beamActive = true;

    w.muzzle.getWorldPosition(_lz1);
    _lz2.copy(aimPoint).sub(_lz1);
    if (_lz2.lengthSq() < 0.0001) _lz2.set(0, 0, -1);
    _lz2.normalize();

    const target = f === this.player ? this.enemy : this.player;
    let dist = part.range;
    let hitTarget = false;

    const world = this.castRay(_lz1, _lz2, part.range, this._laserOut || (this._laserOut = { t: 0, hit: false, normal: new THREE.Vector3() }));
    if (world.hit) dist = Math.min(dist, world.t);

    if (target && target.alive) {
      const d = this._rayFighter(_lz1, _lz2, dist, target);
      if (d !== null) {
        dist = d;
        hitTarget = true;
      }
    }

    _lz3.copy(_lz1).addScaledVector(_lz2, dist);

    if (hitTarget) {
      this.applyDamage(target, part.damage * dt, _lz3, f, false);
      f.shotsFired += dt * 8;
      f.shotsHit += dt * 8;
      if (Math.random() < dt * 22) this.effects.hitSpark(_lz3, part.tracer.color, 0.5);
    } else {
      f.shotsFired += dt * 8;
      if (Math.random() < dt * 14) this.effects.impact(_lz3, world.hit ? world.normal : null, part.tracer.color, 0.35);
    }

    // beam body
    if (!w.beamMesh) {
      w.beamMesh = new THREE.Mesh(this._beamGeometry(), this._beamMaterial(part));
      w.beamMesh.frustumCulled = false;
      w.beamMesh.renderOrder = 3;
      this.scene.add(w.beamMesh);
    }
    const beam = w.beamMesh;
    beam.visible = true;
    beam.position.copy(_lz1).addScaledVector(_lz2, dist * 0.5);
    beam.lookAt(_lz3);
    const flicker = 0.85 + Math.random() * 0.3;
    beam.scale.set(part.beamWidth * flicker, part.beamWidth * flicker, dist);

    if (Math.random() < dt * 30) this.effects.muzzleFlash(_lz1, _lz2, part.tracer.color, 0.5);
    if (this._audibility(f) > 0.05 && Math.random() < dt * 6) audio.pulseShot();
  }

  _beamGeometry() {
    if (!this._beamGeo) {
      const g = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
      g.rotateX(-Math.PI / 2);
      this._beamGeo = g;
    }
    return this._beamGeo;
  }

  _beamMaterial(part) {
    let m = this.beamMats.get(part.id);
    if (!m) {
      m = new THREE.MeshBasicMaterial({
        color: new THREE.Color(part.tracer.color),
        transparent: true,
        opacity: 0.72,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      this.beamMats.set(part.id, m);
    }
    return m;
  }

  /**
   * Distance along a ray at which it enters a fighter's capsule.
   * @returns {number|null}
   */
  _rayFighter(origin, dir, maxDist, f) {
    _lz4.copy(origin).addScaledVector(dir, maxDist);
    f.capsule(_lzA, _lzB);
    const res = closestSegmentPoints(origin, _lz4, _lzA, _lzB, _lzC, _lzD);
    const rad = f.radius;
    if (res.distSq > rad * rad) return null;
    return res.s * maxDist;
  }

  /* ------------------------------------------------------------ funnels */

  _createFunnels(f) {
    const spec = f.stats.funnels;
    if (!spec) return;
    if (!this._funnelGeo) {
      const g = new THREE.ConeGeometry(0.36, 1.5, 4);
      g.rotateX(-Math.PI / 2);
      this._funnelGeo = g;
    }
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(f.mech.colors.glow),
      emissive: new THREE.Color(f.mech.colors.glow),
      emissiveIntensity: 2.4,
      metalness: 0.3,
      roughness: 0.3
    });
    this.funnelMats.push(mat);
    f.funnelPart = getPart(spec.weapon);
    f.funnels = [];
    for (let i = 0; i < spec.count; i++) {
      const m = new THREE.Mesh(this._funnelGeo, mat);
      m.castShadow = false;
      this.scene.add(m);
      f.funnels.push({
        mesh: m,
        dock: f.mech.funnelDocks[i] || f.mech.funnelDocks[0],
        angle: (i / spec.count) * Math.PI * 2,
        height: 3 + (i % 2) * 3.5,
        cooldown: 0.4 + i * 0.25,
        anchor: spec.stationary ? new THREE.Vector3() : null,
        planted: false
      });
    }
  }

  /** Toggle bit deployment; they cost energy to keep out. */
  setFunnels(f, deployed) {
    if (!f.funnels) return;
    if (f.funnelsDeployed === deployed) return;
    f.funnelsDeployed = deployed;
    const spec = f.stats.funnels;
    if (spec && spec.stationary) {
      if (deployed) {
        // plant the turrets on the ground around the frame, spread evenly, and
        // leave them there - the whole point is holding the ground you vacate
        f.center(_fn1);
        const spread = spec.radius;
        f.funnels.forEach((fn, i) => {
          const a = f.yaw + Math.PI + ((i + 0.5) / f.funnels.length - 0.5) * 1.9;
          fn.anchor.set(
            THREE.MathUtils.clamp(f.pos.x + Math.sin(a) * spread, -this.half + 4, this.half - 4),
            2.4,
            THREE.MathUtils.clamp(f.pos.z + Math.cos(a) * spread, -this.half + 4, this.half - 4)
          );
          fn.planted = false;
        });
      } else {
        for (const fn of f.funnels) fn.planted = false;
      }
    }
    if (f.isPlayer) {
      const noun = spec && spec.stationary ? 'SENTRIES' : 'FUNNELS';
      this.hud.feed(deployed ? `${noun} DEPLOYED` : `${noun} RECALLED`, deployed ? '' : 'warn');
      audio.uiConfirm();
    }
  }

  _updateFunnels(f, dt) {
    if (!f.funnels) return;
    const spec = f.stats.funnels;
    const target = f === this.player ? this.enemy : this.player;

    if (f.funnelsDeployed) {
      const drain = spec.drain * dt;
      if (f.energy <= drain || !f.alive) {
        this.setFunnels(f, false);
      } else {
        f.energy -= drain;
        f.energyLock = ENERGY_DELAY;
      }
    }

    f.center(_fn1);
    for (const fn of f.funnels) {
      if (f.funnelsDeployed && f.alive) {
        if (spec.stationary) {
          // travel to the drop point once, then hold station for good
          const rate = fn.planted ? 0.06 : 0.3;
          fn.mesh.position.lerp(fn.anchor, 1 - Math.exp(-dt / rate));
          if (!fn.planted && fn.mesh.position.distanceToSquared(fn.anchor) < 0.09) {
            fn.planted = true;
            this.effects.impact(fn.anchor, _fnUp, f.funnelPart.tracer.color, 0.7);
          }
        } else {
          fn.angle += dt * 1.15;
          _fn2.set(
            _fn1.x + Math.cos(fn.angle) * spec.radius,
            _fn1.y + fn.height + Math.sin(fn.angle * 2) * 0.9,
            _fn1.z + Math.sin(fn.angle) * spec.radius
          );
          fn.mesh.position.lerp(_fn2, 1 - Math.exp(-dt / 0.22));
        }

        if (target && target.alive && (!spec.stationary || fn.planted)) {
          target.center(_fn3);
          fn.mesh.lookAt(_fn3);
          fn.cooldown -= dt;
          if (fn.cooldown <= 0 && this.hasLineOfSight(fn.mesh.position, _fn3)) {
            fn.cooldown = 60 / f.funnelPart.rpm + Math.random() * 0.4;
            const dir = _fn4.subVectors(_fn3, fn.mesh.position).normalize().clone();
            scatter(dir, f.funnelPart.spread);
            this._spawnProjectile(f, f.funnelPart, fn.mesh.position.clone(), dir, target);
            this.effects.muzzleFlash(fn.mesh.position, dir, f.funnelPart.tracer.color, 0.55);
            f.shotsFired += 1;
          }
        }
      } else {
        // dock back onto the rack
        fn.dock.getWorldPosition(_fn2);
        fn.mesh.position.lerp(_fn2, 1 - Math.exp(-dt / 0.18));
        fn.dock.getWorldQuaternion(_fnQ);
        fn.mesh.quaternion.slerp(_fnQ, 1 - Math.exp(-dt / 0.18));
      }
    }
  }

  _disposeFunnels(f) {
    if (!f || !f.funnels) return;
    for (const fn of f.funnels) this.scene.remove(fn.mesh);
    f.funnels = null;
  }

  _audibility(f) {
    if (!this.player) return 0;
    if (f === this.player) return 1;
    const d = f.pos.distanceTo(this.player.pos);
    return THREE.MathUtils.clamp(1 - d / 150, 0, 1);
  }

  reload(f, slotName) {
    const w = f.weapons[slotName];
    if (!w || !w.usesAmmo || w.reloading || w.ammo === w.part.mag) return;
    w.reloading = true;
    w.reloadTimer = w.part.reload * f.stats.reloadMult;
    if (f.isPlayer) {
      this.hud.feed(`RELOADING ${slotName === 'right' ? 'R' : 'L'}-ARM`, 'warn');
      audio.reload();
    }
  }

  /* ------------------------------------------------------------ tether */

  /**
   * Launch a magnetic harpoon. It only acquires a frame that is inside the
   * launch cone, in range and in the open; from there the head steers itself
   * on, so a fair shot lands rather than needing to be threaded.
   */
  _startGrapple(f, slotName) {
    const w = f.weapons[slotName];
    const part = w.part;
    if (f.tether) return false;
    if (!f.spendEnergy(part.energy || 0)) {
      if (f.isPlayer) this.hud.feed('ENERGY DEPLETED', 'bad');
      return false;
    }
    w.cooldown = w.interval;
    f.shotsFired += 1;

    w.muzzle.getWorldPosition(_th1);
    _th2.copy(this._aimPointFor(f, slotName)).sub(_th1);
    if (_th2.lengthSq() < 0.0001) f.forward(_th2);
    _th2.normalize();

    // magnetic acquisition: cone + range + line of sight
    const other = f === this.player ? this.enemy : this.player;
    let target = null;
    if (other && other.alive) {
      other.center(_th3);
      const gap = _th3.distanceTo(_th1);
      if (gap <= part.range) {
        _th4.copy(_th3).sub(_th1).normalize();
        if (_th4.dot(_th2) >= Math.cos((part.arc || 60) * 0.5 * DEG) && this.hasLineOfSight(_th1, _th3)) {
          target = other;
        }
      }
    }

    f.tether = {
      slot: slotName,
      part,
      phase: 'out',
      target,
      tip: _th1.clone(),
      vel: _th2.clone().multiplyScalar(part.speed),
      travelled: 0,
      timer: 0,
      visual: null
    };
    this.effects.muzzleFlash(_th1, _th2, part.tracer.color, 0.7);
    if (this._audibility(f) > 0.02) audio.ballisticShot();
    return true;
  }

  /** The point a fighter is currently aiming at, for either side. */
  _aimPointFor(f, slotName) {
    if (f.isPlayer) return this._aimPoint;
    const other = this.player;
    if (other && other.alive) return other.center(this._aiAim);
    return f.center(this._aiAim).addScaledVector(f.forward(_th4), 20);
  }

  /**
   * Fly the head out, hold the bite, and reel. The reel is split by frame
   * weight, so harpooning something heavier drags you to it instead.
   */
  _updateTether(f, dt) {
    const t = f.tether;
    if (!t) return;
    const part = t.part;

    if (!f.alive) {
      this._detachTether(f);
      return;
    }

    f.weapons[t.slot].muzzle.getWorldPosition(_th1);

    if (t.phase === 'out') {
      // steer the head onto the acquired frame
      if (t.target && t.target.alive) {
        t.target.center(_th2);
        _th3.subVectors(_th2, t.tip);
        const d = _th3.length();
        if (d > 0.001) {
          _th3.divideScalar(d);
          const speed = t.vel.length();
          _th4.copy(t.vel).divideScalar(Math.max(0.0001, speed));
          _th4.addScaledVector(_th3, part.homing * dt).normalize();
          t.vel.copy(_th4).multiplyScalar(speed);
        }
      }

      _th2.copy(t.tip);
      t.tip.addScaledVector(t.vel, dt);
      const step = _th3.subVectors(t.tip, _th2).length();
      t.travelled += step;

      // bite: the head only sticks to a frame, never to the scenery
      if (t.target && t.target.alive) {
        t.target.capsule(_th3, _th4);
        const res = closestSegmentPoints(_th2, t.tip, _th3, _th4, _thA, _thB);
        const reach = t.target.radius + part.magnet;
        if (res.distSq <= reach * reach) {
          t.phase = 'attached';
          t.timer = 0;
          t.tip.copy(_thB);
          this.applyDamage(t.target, part.damage, _thB, f, false);
          this.effects.impact(_thB, null, part.tracer.color, 1.2);
          if (f.isPlayer) {
            this.hud.feed('TETHER LOCKED', 'good');
            this.chase.addShake(0.25);
          } else if (t.target.isPlayer) {
            this.hud.feed('TETHERED', 'bad');
            this.chase.addShake(0.4);
            audio.alarm();
          }
          if (this._audibility(f) > 0.02) audio.block();
        }
      }

      if (t.phase === 'out') {
        // snapped on the scenery, or simply ran out of chain
        const blocked = !this.hasLineOfSight(_th1, t.tip);
        if (blocked || t.travelled > part.range) {
          if (blocked) this.effects.impact(t.tip, null, part.tracer.color, 0.5);
          this._detachTether(f);
          return;
        }
      }
    }

    if (t.phase === 'attached') {
      const target = t.target;
      t.timer += dt;
      if (!target || !target.alive || t.timer > part.hold) {
        this._detachTether(f);
        return;
      }
      target.center(_th2);
      t.tip.copy(_th2);

      f.center(_th3);
      _th4.subVectors(_th2, _th3);
      const gap = _th4.length();
      // the chain parts on cover, and lets go once they are on top of you
      if (gap <= part.minGap) {
        if (f.isPlayer) this.hud.feed('TARGET REELED IN', 'good');
        this._detachTether(f);
        return;
      }
      if (!this.hasLineOfSight(_th3, _th2)) {
        this._detachTether(f);
        return;
      }
      _th4.divideScalar(gap);

      // split the closing speed by weight: light frames get yanked, heavy ones
      // stay put and drag the harpooner in instead
      const wf = Math.max(1, f.stats.weight);
      const wt = Math.max(1, target.stats.weight);
      const total = wf + wt;
      f.tetherPull = _th4.clone().multiplyScalar((part.pull * wt) / total);
      target.tetherPull = _th4.clone().multiplyScalar((-part.pull * wf) / total);
      target.energyLock = ENERGY_DELAY;

      if (Math.random() < dt * 12) this.effects.hitSpark(_th2, part.tracer.color, 0.4);
    }

    this._drawTether(f, _th1);
  }

  /**
   * Cable, interlocking links and a barbed head. The links are what make it
   * read as a chain from across the arena rather than as a beam, so they are
   * spaced by world distance and alternate their roll to interlock.
   */
  _drawTether(f, from) {
    const t = f.tether;
    if (!t.visual) {
      let mats = this.tetherMats.get(t.part.id);
      if (!mats) {
        const colour = new THREE.Color(t.part.tracer.color);
        mats = {
          // the links carry a little emission of their own so the chain still
          // reads in the darker arenas rather than going to silhouette
          steel: new THREE.MeshStandardMaterial({
            color: 0xc3d4e2, emissive: 0x35505f, emissiveIntensity: 1, metalness: 0.9, roughness: 0.34
          }),
          hot: new THREE.MeshStandardMaterial({
            color: colour, emissive: colour, emissiveIntensity: 2.4, metalness: 0.4, roughness: 0.3
          })
        };
        this.tetherMats.set(t.part.id, mats);
      }
      const cable = new THREE.Mesh(this._beamGeometry(), mats.hot);
      cable.frustumCulled = false;
      const head = new THREE.Mesh(this._tetherHeadGeometry(), mats.steel);
      head.frustumCulled = false;
      head.castShadow = true;
      const links = [];
      for (let i = 0; i < TETHER_LINKS; i++) {
        const link = new THREE.Mesh(this._tetherLinkGeometry(), mats.steel);
        link.frustumCulled = false;
        link.visible = false;
        links.push(link);
      }
      this.scene.add(cable, head, ...links);
      t.visual = { cable, head, links };
    }

    const { cable, head, links } = t.visual;
    const len = Math.max(0.01, from.distanceTo(t.tip));

    cable.visible = true;
    cable.position.copy(from).lerp(t.tip, 0.5);
    cable.lookAt(t.tip);
    const r = t.phase === 'attached' ? 0.17 : 0.12;
    cable.scale.set(r, r, len);

    head.visible = true;
    head.position.copy(t.tip);
    head.lookAt(from);

    // one link every 1.5 m, so a long throw does not thin out
    const used = Math.min(TETHER_LINKS, Math.max(2, Math.round(len / 1.5)));
    for (let i = 0; i < links.length; i++) {
      const link = links[i];
      if (i >= used) {
        link.visible = false;
        continue;
      }
      link.visible = true;
      link.position.copy(from).lerp(t.tip, (i + 0.5) / used);
      link.lookAt(t.tip);
      if (i % 2) link.rotateX(Math.PI / 2);
    }
  }

  _tetherHeadGeometry() {
    if (!this._tetherHeadGeo) {
      const g = new THREE.ConeGeometry(0.42, 1.5, 6);
      g.rotateX(Math.PI / 2);
      this._tetherHeadGeo = g;
    }
    return this._tetherHeadGeo;
  }

  _tetherLinkGeometry() {
    if (!this._tetherLinkGeo) this._tetherLinkGeo = new THREE.TorusGeometry(0.4, 0.13, 4, 8);
    return this._tetherLinkGeo;
  }

  _detachTether(f) {
    const t = f.tether;
    if (!t) return;
    if (t.visual) {
      for (const m of [t.visual.cable, t.visual.head, ...t.visual.links]) {
        if (m.parent) m.parent.remove(m);
      }
    }
    if (t.target) t.target.tetherPull = null;
    f.tetherPull = null;
    f.tether = null;
  }

  /** Recompute both tethers for the frame; pulls are consumed on the next one. */
  _updateTethers(dt) {
    for (const f of [this.player, this.enemy]) {
      if (f) f.tetherPull = null;
    }
    for (const f of [this.player, this.enemy]) {
      if (f) this._updateTether(f, dt);
    }
  }

  _startMelee(f, slotName) {
    const w = f.weapons[slotName];
    if (!f.spendEnergy(w.part.energy || 0)) return false;
    w.cooldown = w.interval;
    // lances throw the whole frame forward behind the point
    if (w.part.lunge) {
      f.forward(_v);
      f.vel.x += _v.x * w.part.lunge;
      f.vel.z += _v.z * w.part.lunge;
      if (f === this.player) this.chase.addShake(0.3);
    }
    playMelee(f.mech, slotName);
    f.meleePending = { slot: slotName, timer: 0.18, left: Math.max(1, w.part.hits || 1) };
    if (this._audibility(f) > 0.02) audio.melee();
    return true;
  }

  _resolveMelee(f) {
    const pending = f.meleePending;
    f.meleePending = null;
    const w = f.weapons[pending.slot];
    const part = w.part;
    // chain weapons land several links off one swing; re-arm before resolving
    // this one so a target walking into the sweep still gets caught
    const left = (pending.left || 1) - 1;
    if (left > 0 && f.alive) f.meleePending = { slot: pending.slot, timer: 0.11, left };
    const target = f === this.player ? this.enemy : this.player;
    if (!target || !target.alive) return;

    f.center(_v);
    target.center(_v2);
    const to = _v3.subVectors(_v2, _v);
    const dist = to.length();
    const arcPos = _v4.copy(_v).addScaledVector(f.forward(_v2), part.range * 0.55);
    this.effects.meleeArc(arcPos, part.tracer.color, 1.1);

    if (dist > part.range + target.radius) return;
    to.divideScalar(Math.max(0.001, dist));
    const fwd = f.forward(_v2);
    const cosAngle = fwd.x * to.x + fwd.z * to.z;
    const arc = Math.cos((part.arc || 70) * 0.5 * DEG);
    if (cosAngle < arc) return;

    const dmg = part.damage * f.stats.meleeMult;
    this.applyDamage(target, dmg, target.center(_v4), f, true);
    this.effects.explosion(_v4, part.tracer.color, 0.65);
    if (f === this.player) this.chase.addShake(0.5);
  }

  /**
   * Strip generator charge off a target. Cutting the reserve is what stops a
   * light frame from simply boosting out of the fight.
   */
  drainEnergy(target, amount, source) {
    if (!target.alive || amount <= 0) return;
    const before = target.energy;
    target.energy = Math.max(0, target.energy - amount);
    target.energyLock = ENERGY_DELAY;
    if (target.energy <= 0 && before > 0) {
      if (target.isPlayer) {
        this.hud.feed('GENERATOR OFFLINE', 'bad');
        audio.alarm();
      } else if (source && source.isPlayer) {
        this.hud.feed('ENEMY GENERATOR DOWN', 'good');
      }
    }
  }

  /* ------------------------------------------------------------ damage */

  /**
   * @param {Fighter} target
   * @param {number} amount
   * @param {THREE.Vector3} at world hit position
   * @param {Fighter} source
   * @param {boolean} melee
   */
  applyDamage(target, amount, at, source, melee = false) {
    if (!target.alive) return;
    let dmg = amount;

    // shield block: frontal hits only
    const shieldSlot = target.weapons.left.part.kind === 'shield' ? target.weapons.left : null;
    if (shieldSlot && target.blocking && target.energy > 0) {
      target.center(_v2);
      const toHit = _v3.subVectors(at, _v2).setY(0).normalize();
      const fwd = target.forward(_v);
      if (fwd.dot(toHit) > 0.25) {
        dmg *= 1 - (shieldSlot.part.block || 0.7);
        this.effects.blockFlare(at, shieldSlot.part.tracer.color);
        if (this._audibility(target) > 0.02) audio.block();
      }
    }

    dmg *= 1 - target.stats.damageResist;
    if (target.isPlayer) dmg *= this.difficulty.damageTaken;

    target.hp -= dmg;
    target.damageTaken += dmg;
    if (source) {
      source.damageDealt += dmg;
      source.shotsHit += 1;
    }

    flashDamage(target.mech, 0.8);
    this.effects.hitSpark(at, melee ? 0xffd0f0 : 0xffb45e, melee ? 1.5 : 1);
    if (source && source.isPlayer && !target.isPlayer && this._hitMarkTimer <= 0) {
      // beams tick every frame; throttle so the marker reads as a pulse
      this._hitMarkTimer = target.hp <= 0 ? 0 : 0.07;
      this.hud.hitMarker(target.hp <= 0);
    }

    if (target.isPlayer) {
      this.hud.flashDamage(Math.min(0.85, dmg / 120 + 0.15));
      this.chase.addShake(Math.min(0.7, dmg / 200 + 0.08));
      // point a wedge back along the incoming line, in camera-relative terms
      _dmgDir.subVectors(at, target.pos).setY(0);
      if (_dmgDir.lengthSq() > 0.0001) {
        // resolve into the chase camera's own frame: forward is -Z at yaw 0
        const yaw = this.chase.yaw;
        const sin = Math.sin(yaw);
        const cos = Math.cos(yaw);
        const ahead = _dmgDir.x * -sin + _dmgDir.z * -cos;
        const right = _dmgDir.x * cos + _dmgDir.z * -sin;
        this.hud.damageFrom(Math.atan2(right, ahead));
      }
      audio.hitTaken();
      if (!this._lowHpWarned && target.hp / target.maxHp < 0.28) {
        this._lowHpWarned = true;
        this.hud.feed('ARMOUR CRITICAL', 'bad');
        audio.alarm();
      }
    } else if (this._audibility(target) > 0.05) {
      audio.impact(0.7);
    }

    if (target.hp <= 0) {
      target.hp = 0;
      this._destroy(target);
    }
  }

  _destroy(f) {
    f.alive = false;
    f.deadTimer = 0;
    this._detachTether(f);
    // whoever had this frame on a chain loses it
    for (const other of [this.player, this.enemy]) {
      if (other && other.tether && other.tether.target === f) this._detachTether(other);
    }
    f.tetherPull = null;
    this.setFunnels(f, false);
    for (const key of ['right', 'left']) {
      const w = f.weapons[key];
      if (w && w.beamMesh) w.beamMesh.visible = false;
    }
    f.center(_v);
    this.effects.explosion(_v, 0xffb45e, 2.4);
    this.effects.explosion(f.pos, 0xff6a3d, 1.8);
    audio.explosion(1.4);
    this.chase.addShake(1.2);
    this.hud.feed(`${f.name} DESTROYED`, f.isPlayer ? 'bad' : '');
    this._finish(!f.isPlayer, f.isPlayer ? 'FRAME LOST' : 'ENEMY FRAME DESTROYED');
  }

  _finish(win, reason) {
    if (this.finished) return;
    // the result screen stops stepping the sim, so let go of any live chain
    for (const f of [this.player, this.enemy]) {
      if (f) this._detachTether(f);
    }
    this.finished = true;
    this.endTimer = 2.1;
    this._result = { win, reason };
  }

  /* ------------------------------------------------------------- input */

  _updatePlayer(dt) {
    const f = this.player;
    const input = this.input;
    if (!f.alive) return;

    // ---- look
    if (input.canLook()) {
      this.chase.yaw -= input.dx * input.sensitivity;
      const dy = input.dy * input.sensitivity * (input.invertY ? -1 : 1);
      this.chase.pitch = THREE.MathUtils.clamp(this.chase.pitch - dy, -MAX_PITCH, MAX_PITCH);
    }

    // ---- aim target: ray from the camera through the crosshair
    this.camera.getWorldDirection(_v);
    const hit = this.castRay(this.camera.position, _v, 400, this._aimOut || (this._aimOut = { t: 0, hit: false, normal: new THREE.Vector3() }));
    this._aimPoint.copy(this.camera.position).addScaledVector(_v, hit.hit ? hit.t : 300);

    // ---- soft lock-on toward the enemy when the reticle is close
    this._locked = false;
    if (this.enemy && this.enemy.alive) {
      this.enemy.center(_v2);
      const toEnemy = _v3.subVectors(_v2, this.camera.position);
      const dist = toEnemy.length();
      toEnemy.divideScalar(Math.max(0.0001, dist));
      const cos = toEnemy.dot(_v);
      const withinCone = cos > Math.cos(7 * DEG * f.stats.lockSpeed);
      if (withinCone && dist < f.stats.scanRange * 2.2 && this.hasLineOfSight(f.center(_v4), _v2)) {
        this._locked = true;
        // Aim at the frame itself; fire() solves the intercept per weapon, so
        // a mortar and a beam rifle in the same build each lead correctly.
        this._aimPoint.copy(_v2);
      }
    }

    // ---- movement
    const axes = input.axes();
    const cy = this.chase.yaw;
    const fwd = _v.set(-Math.sin(cy), 0, -Math.cos(cy));
    const right = _v2.set(Math.cos(cy), 0, -Math.sin(cy));
    const wish = _v3.set(0, 0, 0).addScaledVector(fwd, axes.z).addScaledVector(right, axes.x);
    const moving = wish.lengthSq() > 0.0001;
    if (moving) wish.normalize();

    // face where the camera looks
    let dy = cy - f.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    f.yaw += THREE.MathUtils.clamp(dy, -f.stats.turnRate * dt * 2.4, f.stats.turnRate * dt * 2.4);
    f.pitch = THREE.MathUtils.lerp(f.pitch, this.chase.pitch, dt * 8);

    this._applyMovement(f, wish, moving, dt, {
      jump: input.hit('Space'),
      hover: input.down('Space'),
      dash: input.hit('ShiftLeft') || input.hit('ShiftRight')
    });

    // ---- weapons
    const leftPart = f.weapons.left.part;
    f.blocking = leftPart.kind === 'shield' && input.mouse.right;
    if (f.blocking) {
      f.energy = Math.max(0, f.energy - leftPart.blockDrain * dt);
      f.energyLock = ENERGY_DELAY;
      if (f.energy <= 0) f.blocking = false;
    }

    const lead = this._locked && this.enemy.alive ? { target: this.enemy, scale: 1 } : null;
    this._handleTrigger(f, 'right', input.mouse.left, this._aimPoint, dt, lead);
    this._handleTrigger(f, 'left', input.mouse.right && leftPart.kind !== 'shield', this._aimPoint, dt, lead);

    if (input.hit('KeyF')) {
      if (f.weapons.shoulder) this.fire(f, 'shoulder', this._aimPoint, lead);
      else if (f.funnels) this.setFunnels(f, !f.funnelsDeployed);
    }
    if (input.hit('KeyR')) {
      this.reload(f, 'right');
      this.reload(f, 'left');
    }
  }

  /* ---------------------------------------------------------- movement */

  _applyMovement(f, wish, moving, dt, cmd) {
    const stats = f.stats;
    const speed = stats.walkSpeed;
    let boosting = false;

    // vertical: treads cannot leave the ground at all, hover skirts can rise
    // from their float height without a jump
    const hovering = stats.hoverHeight > 0;
    if (f.grounded && cmd.jump && stats.canJump && f.energy > JUMP_COST) {
      f.vel.y = JUMP_SPEED * stats.jumpPower;
      f.spendEnergy(JUMP_COST);
      f.grounded = false;
      boosting = true;
      if (this._audibility(f) > 0.05) audio.jump();
    } else if (cmd.hover && stats.canThrust && (!f.grounded || hovering) && f.energy > 0) {
      const drain = HOVER_DRAIN * stats.thrustEfficiency * dt;
      if (f.energy > drain) {
        f.energy -= drain;
        f.energyLock = ENERGY_DELAY;
        f.vel.y += HOVER_THRUST * stats.boostPower * dt;
        f.vel.y = Math.min(f.vel.y, 16 * stats.boostPower);
        f.grounded = false;
        boosting = true;
      }
    }

    // quick-boost dash
    f.dashCooldown = Math.max(0, f.dashCooldown - dt);
    if (cmd.dash && f.dashCooldown <= 0 && f.energy > DASH_COST) {
      const dir = moving ? _v4.copy(wish) : f.forward(_v4);
      const power = DASH_SPEED * stats.boostPower * stats.dashBonus;
      f.vel.x += dir.x * power;
      f.vel.z += dir.z * power;
      if (!f.grounded) f.vel.y += 3;
      f.spendEnergy(DASH_COST);
      f.dashCooldown = DASH_COOLDOWN;
      boosting = true;
      f.center(_v);
      this.effects.thruster(_v, _v2.copy(dir).negate(), f.mech.colors.glow, 1);
      if (this._audibility(f) > 0.05) audio.jump();
    }

    f.boosting = boosting;

    // horizontal steering
    // hover skirts have little grip, so they drift through direction changes
    const accel = (f.grounded ? GROUND_ACCEL * stats.groundGrip : AIR_ACCEL) * dt;
    const targetX = moving ? wish.x * speed : 0;
    const targetZ = moving ? wish.z * speed : 0;
    const dvx = targetX - f.vel.x;
    const dvz = targetZ - f.vel.z;
    const dvLen = Math.hypot(dvx, dvz);
    if (dvLen > 0.0001) {
      const step = Math.min(dvLen, accel);
      f.vel.x += (dvx / dvLen) * step;
      f.vel.z += (dvz / dvLen) * step;
    }

    // gravity + integrate
    f.vel.y -= GRAVITY * dt;
    f.pos.addScaledVector(f.vel, dt);
    // A tether drags the frame on top of whatever the legs are doing. It is
    // applied here rather than folded into `vel` so the steering controller
    // above cannot immediately damp it back out, but still ahead of the ground
    // contact and collision passes below.
    if (f.tetherPull) f.pos.addScaledVector(f.tetherPull, dt);

    // ground contact
    const gy = this.groundHeightAt(f.pos.x, f.pos.z, f.radius) + stats.hoverHeight;
    f.groundY = gy;
    if (f.pos.y <= gy + 0.001) {
      if (!f.grounded && f.vel.y < -6 && !hovering) {
        this.effects.landingDust(_v.set(f.pos.x, gy - stats.hoverHeight, f.pos.z), 1 + Math.min(1.4, -f.vel.y / 26));
        if (this._audibility(f) > 0.05) audio.land(Math.min(1.5, -f.vel.y / 20));
        if (f.isPlayer) this.chase.addShake(Math.min(0.45, -f.vel.y / 60));
      }
      f.pos.y = gy;
      f.vel.y = 0;
      f.grounded = true;
    } else {
      f.grounded = false;
    }

    this.resolveCollisions(f);

    // energy regeneration
    f.energyLock = Math.max(0, f.energyLock - dt);
    if (f.energyLock <= 0 && f.energy < f.maxEnergy) {
      f.energy = Math.min(f.maxEnergy, f.energy + stats.energyRegen * dt);
    }

    // thruster particles
    if (boosting || (!f.grounded && f.vel.y > -2) || (hovering && Math.random() < 0.25)) {
      f._thrusterTick += dt;
      if (f._thrusterTick > 0.02) {
        f._thrusterTick = 0;
        for (const t of f.mech.thrusterRefs) {
          t.getWorldPosition(_v);
          this.effects.thruster(_v, _v2.set(0, -1, 0), f.mech.colors.glow, boosting ? 1 : 0.4);
        }
      }
    }

    audio.setBoost(f.isPlayer && boosting, 1);
  }

  /* ---------------------------------------------------------------- AI */

  _initAi() {
    const e = this.enemy;
    const rw = e.weapons.right.part;
    const lw = e.weapons.left.part;
    const ranged = rw.kind !== 'melee' && rw.kind !== 'none' ? rw : lw;

    // Each opponent carries its own behaviour profile; anything missing falls
    // back to a balanced mid-range fighter derived from its weapons.
    const fallbackRange = ranged.range > 0 ? THREE.MathUtils.clamp(ranged.range * 0.42, 16, 78) : 12;
    const profile = {
      band: [fallbackRange * 0.7, fallbackRange * 1.3],
      aggression: 0.5,
      dodge: 0.5,
      strafe: 0.7,
      jumpiness: 0.5,
      discipline: 0.6,
      flank: 0.4,
      holdGround: false,
      ...(e.profile || {})
    };
    // A frame that cannot leave the ground never tries to.
    if (!e.stats.canJump && !e.stats.canThrust) profile.jumpiness = 0;

    e.ai = {
      profile,
      state: 'engage',
      stateTimer: 0,
      strafeDir: Math.random() > 0.5 ? 1 : -1,
      preferredRange: (profile.band[0] + profile.band[1]) * 0.5,
      meleeSlot: rw.kind === 'melee' ? 'right' : lw.kind === 'melee' ? 'left' : null,
      grappleSlot: rw.kind === 'grapple' ? 'right' : lw.kind === 'grapple' ? 'left' : null,
      reactionTimer: 0,
      aimError: new THREE.Vector3(),
      aimErrorTimer: 0,
      jumpTimer: 1 + Math.random() * 2,
      dodgeTimer: 0,
      burst: 0,
      burstOpen: true,
      leftOpen: true,
      phase: -1,
      // when a phase list says anything about funnels, it decides when they fly
      phaseOwnsFunnels: !!(e.phases || []).some((p) => p.funnels !== undefined),
      funnelsFreed: false
    };
  }

  /**
   * Multi-phase opponents rewrite their own behaviour profile as their armour
   * falls away. Phases are listed high-HP first and are entered once each.
   */
  _checkPhases(e) {
    const list = e.phases;
    if (!list || !list.length) return;
    const frac = e.hp / e.maxHp;
    let next = e.ai.phase + 1;
    let entered = null;
    while (next < list.length && frac <= list[next].at) {
      entered = list[next];
      e.ai.phase = next;
      next++;
    }
    if (!entered) return;

    Object.assign(e.ai.profile, entered.ai || {});
    e.ai.preferredRange = (e.ai.profile.band[0] + e.ai.profile.band[1]) * 0.5;
    e.ai.state = 'engage';
    e.ai.stateTimer = 0;
    if (!e.stats.canJump && !e.stats.canThrust) e.ai.profile.jumpiness = 0;
    if (entered.funnels !== undefined) {
      e.ai.funnelsFreed = entered.funnels;
      if (e.funnels) this.setFunnels(e, entered.funnels);
    }

    e.center(_v);
    this.effects.explosion(_v, 0xffd06a, 1.1);
    flashDamage(e.mech, 1);
    this.chase.addShake(0.35);
    this.hud.feed(entered.say || `${e.name} SHIFTS STANCE`, 'warn');
    audio.alarm();
  }

  _updateAi(dt) {
    const e = this.enemy;
    const p = this.player;
    if (!e.alive || !p) return;
    const ai = e.ai;
    this._checkPhases(e);
    const skill = (e.skill || 0.8) * this.difficulty.aiSpeed;

    e.center(_v);
    p.center(_v2);
    const toPlayer = _v3.subVectors(_v2, _v);
    const distY = toPlayer.y;
    const dist = toPlayer.length();
    const flatDist = Math.hypot(toPlayer.x, toPlayer.z);
    const los = this.hasLineOfSight(_v, _v2);

    // -------- face the player, with a skill-scaled aim wobble
    ai.aimErrorTimer -= dt;
    if (ai.aimErrorTimer <= 0) {
      ai.aimErrorTimer = 0.28 + Math.random() * 0.4;
      // Error grows with range, so long-distance duels stay survivable.
      const mag = (1.15 - skill) * (3 + dist * 0.1);
      ai.aimError.set(
        (Math.random() - 0.5) * mag,
        (Math.random() - 0.5) * mag * 0.6,
        (Math.random() - 0.5) * mag
      );
    }

    const desiredYaw = Math.atan2(-toPlayer.x, -toPlayer.z);
    let dy = desiredYaw - e.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    const turn = e.stats.turnRate * dt * (1.2 + skill);
    e.yaw += THREE.MathUtils.clamp(dy, -turn, turn);
    e.pitch = THREE.MathUtils.lerp(e.pitch, THREE.MathUtils.clamp(Math.atan2(distY, Math.max(2, flatDist)), -MAX_PITCH, MAX_PITCH), dt * 5);

    // -------- pick a stance, weighted by this opponent's profile
    const prof = ai.profile;
    ai.stateTimer -= dt;
    if (ai.stateTimer <= 0) {
      // Aggressive frames re-decide quickly; ground-holders commit for longer.
      ai.stateTimer = (prof.holdGround ? 1.6 : 0.8) + Math.random() * (0.6 + prof.aggression * 1.4);
      if (Math.random() < 0.2 + prof.strafe * 0.4) ai.strafeDir *= -1;

      const lowEnergy = e.energy < e.maxEnergy * 0.25;
      const reloading = e.weapons.right.reloading && (!e.weapons.left || e.weapons.left.reloading);
      const chargeReach = prof.band[1] * 0.9;
      if (ai.meleeSlot && dist < chargeReach && e.hp > e.maxHp * 0.3 && Math.random() < prof.aggression * (0.5 + skill * 0.5)) {
        ai.state = 'charge';
      } else if (!los) {
        ai.state = Math.random() < prof.flank ? 'flank' : 'engage';
      } else if (lowEnergy || reloading) {
        ai.state = 'withdraw';
      } else if (dist < prof.band[0] * 0.75 && prof.holdGround) {
        // artillery and gun platforms back off when crowded
        ai.state = 'withdraw';
      } else {
        ai.state = 'engage';
      }
    }

    // -------- movement command
    const fwdToPlayer = _v.set(toPlayer.x, 0, toPlayer.z);
    if (fwdToPlayer.lengthSq() > 0.0001) fwdToPlayer.normalize();
    const strafe = _v2.set(-fwdToPlayer.z, 0, fwdToPlayer.x).multiplyScalar(ai.strafeDir);
    const wish = _v4.set(0, 0, 0);

    if (ai.state === 'charge') {
      wish.copy(fwdToPlayer).addScaledVector(strafe, 0.35 * prof.strafe);
    } else if (ai.state === 'withdraw') {
      wish.copy(fwdToPlayer).multiplyScalar(-1).addScaledVector(strafe, 0.7 * prof.strafe);
    } else if (ai.state === 'flank') {
      wish.copy(strafe).addScaledVector(fwdToPlayer, 0.55);
    } else if (flatDist < prof.band[0]) {
      // inside the band: back out, harder for frames that want distance
      const urgency = prof.holdGround ? 1 : 0.55 * (1 - prof.aggression);
      wish.copy(fwdToPlayer).multiplyScalar(-urgency).addScaledVector(strafe, prof.strafe);
    } else if (flatDist > prof.band[1]) {
      // outside the band: close, harder for aggressive frames
      const urgency = 0.5 + prof.aggression * 0.5;
      wish.copy(fwdToPlayer).multiplyScalar(urgency).addScaledVector(strafe, prof.strafe * 0.6);
    } else {
      // in the band: hold and circle rather than drift in and out
      wish.copy(strafe).multiplyScalar(prof.holdGround ? prof.strafe * 0.45 : prof.strafe);
    }

    // keep away from the arena edge
    const edge = this.half - 16;
    if (Math.abs(e.pos.x) > edge) wish.x -= Math.sign(e.pos.x) * 1.2;
    if (Math.abs(e.pos.z) > edge) wish.z -= Math.sign(e.pos.z) * 1.2;

    const moving = wish.lengthSq() > 0.001;
    if (moving) wish.normalize();

    // -------- evasion: hop when a projectile is inbound
    ai.dodgeTimer -= dt;
    let dash = false;
    let jump = false;
    if (ai.dodgeTimer <= 0) {
      for (const proj of this.projectiles) {
        if (proj.owner === e) continue;
        this._aiTmp.subVectors(e.pos, proj.pos);
        const d = this._aiTmp.length();
        if (d < 46) {
          this._aiTmp.divideScalar(Math.max(0.0001, d));
          this._aiTmp2.copy(proj.vel).normalize();
          const closing = this._aiTmp2.dot(this._aiTmp);
          if (closing > 0.94 && Math.random() < prof.dodge * (0.5 + skill * 0.6)) {
            dash = true;
            ai.dodgeTimer = 1.1 - prof.dodge * 0.5 - skill * 0.2;
            ai.strafeDir *= -1;
            break;
          }
        }
      }
    }

    ai.jumpTimer -= dt;
    if (ai.jumpTimer <= 0) {
      ai.jumpTimer = 1.4 + (1 - prof.jumpiness) * 4 + Math.random() * 2.5;
      if (e.grounded && e.stats.canJump && e.energy > e.maxEnergy * 0.45 && Math.random() < prof.jumpiness * (0.5 + skill * 0.6)) {
        jump = true;
      }
    }
    const hover = e.stats.canThrust && !e.grounded && e.vel.y < 0 && e.energy > e.maxEnergy * 0.3 && distY > 3;

    this._applyMovement(e, wish, moving, dt, { jump, hover, dash });

    // -------- shooting
    if (los) {
      const aimAt = this._aiAim.copy(p.center(this._aiTmp));
      const rw = e.weapons.right.part;
      // The solver does the leading; skill decides how well, and the wobble
      // is applied on top of the intercept.
      const aiLead = { target: p, scale: 0.55 + skill * 0.5, error: ai.aimError };

      const fwd = e.forward(this._aiTmp2);
      const toAim = this._aiTmp3.copy(aimAt).sub(e.center(this._aiTmp)).normalize();
      const facing = fwd.x * toAim.x + fwd.z * toAim.z;

      // trigger discipline: the AI does not hold the trigger down forever
      ai.burst -= dt;
      if (ai.burst <= 0) {
        // Disciplined frames hold longer bursts and waste fewer of them.
        ai.burst = 0.3 + prof.discipline * 0.6 + Math.random() * (1.4 - skill * 0.6);
        ai.burstOpen = Math.random() < 0.2 + prof.discipline * 0.5 + skill * 0.3;
        ai.leftOpen = Math.random() < 0.35 + prof.discipline * 0.4 + skill * 0.3;
      }

      const facingGate = 0.82 + prof.discipline * 0.1;
      const wantRight =
        facing > facingGate && ai.burstOpen && dist < rw.range * 1.05 && rw.kind !== 'melee' && rw.kind !== 'grapple';
      const lw = e.weapons.left.part;
      const wantLeft =
        facing > facingGate && ai.burstOpen && lw.kind !== 'none' && lw.kind !== 'shield' &&
        lw.kind !== 'melee' && lw.kind !== 'grapple' && dist < lw.range * 1.05;

      // charge weapons need the trigger held, so the AI commits for a beat
      this._handleTrigger(e, 'right', wantRight, aimAt, dt, aiLead);
      this._handleTrigger(e, 'left', wantLeft && ai.leftOpen, aimAt, dt, aiLead);

      if (e.weapons.shoulder && dist < 120 && Math.random() < 0.012 + skill * 0.02) {
        this.fire(e, 'shoulder', aimAt, aiLead);
      }

      // The tether is how a brawler closes: throw it as soon as the player is
      // out past the reach of whatever it wants to hit them with.
      if (ai.grappleSlot && !e.tether) {
        const gp = e.weapons[ai.grappleSlot].part;
        const reach = ai.meleeSlot ? e.weapons[ai.meleeSlot].part.range : gp.minGap * 1.6;
        if (dist > reach * 0.8 && dist < gp.range * 0.92 && facing > 0.9) {
          this.fire(e, ai.grappleSlot, aimAt);
        }
      }

      if (ai.meleeSlot && dist < e.weapons[ai.meleeSlot].part.range * 0.9 && facing > 0.8) {
        this.fire(e, ai.meleeSlot, aimAt);
      }
    } else {
      // no line of sight: release triggers so charges do not fire into cover
      this._handleTrigger(e, 'right', false, e.center(this._aiAim), dt);
      this._handleTrigger(e, 'left', false, this._aiAim, dt);
    }

    // Bits stay out while the AI has the energy to run them - unless this
    // opponent's phase list owns the decision, in which case they stay docked
    // until the phase that frees them.
    if (e.funnels && !(ai.phaseOwnsFunnels && !ai.funnelsFreed)) {
      const wantOut = e.alive && los && dist < 130 && e.energy > e.maxEnergy * 0.4;
      const pullIn = e.energy < e.maxEnergy * 0.18;
      if (wantOut && !e.funnelsDeployed) this.setFunnels(e, true);
      else if (pullIn && e.funnelsDeployed) this.setFunnels(e, false);
    }

    // blocking with a shield when hurt
    e.blocking = e.weapons.left.part.kind === 'shield' && e.energy > 10 && (ai.state === 'withdraw' || e.hp < e.maxHp * 0.4);
    if (e.blocking) {
      e.energy = Math.max(0, e.energy - e.weapons.left.part.blockDrain * dt);
      e.energyLock = ENERGY_DELAY;
    }
  }

  /* --------------------------------------------------------- simulation */

  _updateWeapons(f, dt) {
    for (const key of ['right', 'left', 'shoulder']) {
      const w = f.weapons[key];
      if (!w) continue;
      if (w.cooldown > 0) w.cooldown -= dt;
      if (w.reloading) {
        w.reloadTimer -= dt;
        if (w.reloadTimer <= 0) {
          w.reloading = false;
          w.ammo = w.part.mag;
        }
      }
    }
    if (f.meleePending) {
      f.meleePending.timer -= dt;
      if (f.meleePending.timer <= 0) this._resolveMelee(f);
    }
  }

  _updateProjectiles(dt) {
    const hitA = _pjA;
    const hitB = _pjB;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      if (p.armTime > 0) p.armTime -= dt;

      // homing steer
      if (p.homing > 0 && p.target && p.target.alive) {
        p.target.center(_pj1);
        const desired = _pj2.subVectors(_pj1, p.pos).normalize();
        const speed = p.vel.length();
        const cur = _pj3.copy(p.vel).divideScalar(Math.max(0.0001, speed));
        cur.addScaledVector(desired, p.homing * dt).normalize();
        p.vel.copy(cur).multiplyScalar(speed);
      }

      if (p.grav > 0) p.vel.y -= p.grav * dt;

      p.prev.copy(p.pos);
      p.pos.addScaledVector(p.vel, dt);

      // trail for missiles
      if (p.kind === 'missile' && Math.random() < 0.8) {
        this.effects.thruster(p.pos, _pj1.copy(p.vel).normalize().negate(), p.color, 0.8);
      }

      // orient the tracer along travel
      p.mesh.position.copy(p.pos);
      _pj1.copy(p.pos).add(p.vel);
      p.mesh.lookAt(_pj1);

      let consumed = false;

      // --- fighters
      for (const f of [this.player, this.enemy]) {
        if (!f || !f.alive || f === p.owner) continue;
        if (p.armTime > 0) continue;
        f.capsule(_pj1, _pj2);
        const res = closestSegmentPoints(p.prev, p.pos, _pj1, _pj2, hitA, hitB);
        // a proximity fuze bursts as soon as the shell passes near the frame
        const rad = f.radius + p.radius + p.proximity;
        if (res.distSq <= rad * rad) {
          const point = _pjHit.copy(hitB).lerp(hitA, 0.5);
          if (p.blast > 0) this._blast(p, point);
          else {
            this.applyDamage(f, p.damage, point, p.owner);
            if (p.energyDrain > 0) this.drainEnergy(f, p.energyDrain, p.owner);
          }
          this.effects.impact(point, null, p.color, p.kind === 'missile' ? 1.6 : 0.9);
          consumed = true;
          break;
        }
      }

      // --- world
      if (!consumed) {
        _pj3.subVectors(p.pos, p.prev);
        const segLen = _pj3.length();
        if (segLen > 0.0001) {
          _pj3.divideScalar(segLen);
          const r = this.castRay(p.prev, _pj3, segLen, this._projOut || (this._projOut = { t: 0, hit: false, normal: new THREE.Vector3() }));
          if (r.hit && r.t <= segLen) {
            const point = _pj4.copy(p.prev).addScaledVector(_pj3, r.t);
            if (p.blast > 0) this._blast(p, point);
            this.effects.impact(point, r.normal, p.color, p.kind === 'missile' ? 1.5 : 0.8);
            if (this.player && point.distanceTo(this.player.pos) < 70) audio.impact(0.5);
            consumed = true;
          }
        }
      }

      if (consumed || p.life <= 0 || Math.abs(p.pos.x) > this.half + 12 || Math.abs(p.pos.z) > this.half + 12 || p.pos.y > 220) {
        this._recycleProjectile(p);
        this.projectiles.splice(i, 1);
      }
    }
  }

  _blast(p, point) {
    this.effects.explosion(point, p.color, 0.85);
    if (this.player && point.distanceTo(this.player.pos) < 90) audio.explosion(0.8);
    for (const f of [this.player, this.enemy]) {
      if (!f || !f.alive) continue;
      f.center(_v4);
      const d = _v4.distanceTo(point);
      if (d < p.blast + f.radius) {
        const falloff = THREE.MathUtils.clamp(1 - d / (p.blast + f.radius), 0.25, 1);
        this.applyDamage(f, p.damage * falloff, _v4, p.owner === f ? null : p.owner);
        if (p.energyDrain > 0 && p.owner !== f) this.drainEnergy(f, p.energyDrain * falloff, p.owner);
      }
    }
    if (this.player && point.distanceTo(this.player.pos) < 40) this.chase.addShake(0.4);
  }

  syncTransform(f) {
    f.root.position.copy(f.pos);
    f.root.rotation.y = f.yaw;
  }

  /* -------------------------------------------------------------- frame */

  update(dt) {
    if (!this.running) return;
    if (this.paused) {
      this.hud.tick(dt);
      return;
    }

    this.elapsed += dt;
    if (this._hitMarkTimer > 0) this._hitMarkTimer -= dt;
    this.envUpdate(dt, this.elapsed);

    if (!this.finished) {
      this.time -= dt;
      if (this.time <= 0) {
        this.time = 0;
        const pPct = this.player.hp / this.player.maxHp;
        const ePct = this.enemy.hp / this.enemy.maxHp;
        this._finish(pPct >= ePct, 'TIME OVER');
      }
    }

    if (this.player.alive) this._updatePlayer(dt);
    if (this.enemy.alive) this._updateAi(dt);

    for (const f of [this.player, this.enemy]) {
      this._updateWeapons(f, dt);
      this._updateFunnels(f, dt);
      if (!f.alive) {
        f.deadTimer += dt;
        // wreck settles onto the deck
        f.vel.y -= GRAVITY * dt;
        f.pos.y = Math.max(this.groundHeightAt(f.pos.x, f.pos.z, f.radius), f.pos.y + f.vel.y * dt);
        f.root.rotation.z = THREE.MathUtils.lerp(f.root.rotation.z, 1.35, dt * 1.6);
        f.root.rotation.x = THREE.MathUtils.lerp(f.root.rotation.x, 0.25, dt * 1.2);
        if (f.deadTimer < 2.4 && Math.random() < dt * 4) {
          f.center(_v);
          _v.x += (Math.random() - 0.5) * 3;
          _v.z += (Math.random() - 0.5) * 3;
          this.effects.explosion(_v, 0xff8a3d, 0.5);
        }
      }
      const speed = Math.hypot(f.vel.x, f.vel.z);
      updateMech(f.mech, dt, {
        speed,
        grounded: f.grounded,
        boosting: f.boosting,
        aimPitch: f.pitch,
        strafe: 0
      });
      if (f.alive) this.syncTransform(f);
      else f.root.position.copy(f.pos);
    }

    this._updateTethers(dt);
    this._updateProjectiles(dt);
    this.effects.update(dt);

    // ---- camera
    this.player.center(_v);
    const occl = (from, to) => {
      _v2.subVectors(to, from);
      const len = _v2.length();
      if (len < 0.001) return 1;
      _v2.divideScalar(len);
      const r = this.castRay(from, _v2, len, this._camOut || (this._camOut = { t: 0, hit: false, normal: new THREE.Vector3() }));
      if (r.hit && r.t < len) return Math.max(0.15, (r.t - 1.2) / len);
      return 1;
    };
    this.chase.setFov(this.player.boosting ? 70 : 62);
    this.chase.update(dt, _v, occl);

    // ---- HUD
    const distance = this.player.pos.distanceTo(this.enemy.pos);
    const rw = this.player.weapons.right;
    const lw = this.player.weapons.left;
    const ammoText = (w) => {
      if (w.part.kind === 'none') return '--';
      if (w.reloading) return 'RELOAD';
      if (w.part.kind === 'melee') return 'BLADE';
      if (w.part.kind === 'grapple') return 'TETHER';
      if (w.part.kind === 'shield') return 'GUARD';
      if (!w.usesAmmo) return 'ENERGY';
      return `${w.ammo}/${w.part.mag}`;
    };
    this.hud.update({
      hp: this.player.hp,
      maxHp: this.player.maxHp,
      energy: this.player.energy,
      maxEnergy: this.player.maxEnergy,
      enemyHp: this.enemy.hp,
      enemyMaxHp: this.enemy.maxHp,
      distance,
      time: this.time,
      ammoRight: ammoText(rw),
      ammoLeft: ammoText(lw),
      ammoRightEmpty: rw.usesAmmo && rw.ammo === 0,
      ammoLeftEmpty: lw.usesAmmo && lw.ammo === 0,
      boosting: this.player.boosting,
      locked: this._locked,
      charge: Math.max(rw.chargeFrac, lw.chargeFrac),
      funnels: this.player.funnels ? (this.player.funnelsDeployed ? 'OUT' : 'DOCKED') : null
    });
    this.hud.tick(dt);

    // enemy lock marker projected to screen space
    if (this.enemy.alive) {
      this.enemy.center(_v3);
      this._screenPos.copy(_v3).project(this.camera);
      if (this._screenPos.z < 1) {
        this.hud.setLockMarker({
          x: (this._screenPos.x * 0.5 + 0.5) * window.innerWidth,
          y: (-this._screenPos.y * 0.5 + 0.5) * window.innerHeight
        });
      } else {
        this.hud.setLockMarker(null);
      }
    } else {
      this.hud.setLockMarker(null);
    }

    // ---- match end
    if (this.finished) {
      this.endTimer -= dt;
      if (this.endTimer <= 0) {
        this.running = false;
        audio.setBoost(false);
        const r = this._result;
        this.onEnd({
          win: r.win,
          reason: r.reason,
          timeLeft: this.time,
          damageDealt: Math.round(this.player.damageDealt),
          damageTaken: Math.round(this.player.damageTaken),
          accuracy: this.player.shotsFired > 0 ? this.player.shotsHit / this.player.shotsFired : 0,
          hpLeft: Math.max(0, Math.round(this.player.hp)),
          hpMax: this.player.maxHp,
          enemy: this.enemy.name,
          opponentId: this.enemy.presetId
        });
      }
    }
  }
}
