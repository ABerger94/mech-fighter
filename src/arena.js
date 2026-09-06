/**
 * MECH FIGHTER - battle arena.
 *
 * Owns the combat simulation: mech physics against the arena colliders, the
 * weapon/projectile system, hit detection, the enemy AI and the match rules.
 * Scene construction and camera rigs come from renderer.js; the visual flourish
 * comes from effects.js; DOM readouts go through hud.js.
 */

import * as THREE from 'three';
import { createArenaEnvironment, ChaseCamera } from './renderer.js';
import { buildMech, disposeMech, updateMech, punchRecoil, playMelee, flashDamage } from './mech.js';
import { ENEMY_PRESETS, DIFFICULTIES } from './data/parts.js';
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
  }

  get usesAmmo() {
    return (this.part.mag || 0) > 0;
  }

  get interval() {
    return this.part.rpm > 0 ? 60 / this.part.rpm : 1;
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

    this.maxHp = this.stats.maxHp;
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

    const env = createArenaEnvironment();
    this.scene = env.scene;
    this.camera = env.camera;
    this.colliders = env.colliders;
    this.envUpdate = env.update;
    this.half = env.half;

    this.effects = new Effects(this.scene);
    this.effects.setCamera(this.camera);
    this.chase = new ChaseCamera(this.camera);

    this.projectiles = [];
    this.projPools = new Map();
    this.projGeo = new Map();
    this.projMat = new Map();

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
    this._lockTimer = 0;
    this._screenPos = new THREE.Vector3();
    this._lowHpWarned = false;
    this._aiAim = new THREE.Vector3();
    this._aiTmp = new THREE.Vector3();
    this._aiTmp2 = new THREE.Vector3();
    this._aiTmp3 = new THREE.Vector3();
  }

  /* ------------------------------------------------------------- setup */

  /**
   * Begin a match.
   * @param {object} playerLoadout
   * @param {string} difficultyId
   */
  start(playerLoadout, difficultyId = 'veteran') {
    this.reset();

    this.difficulty = DIFFICULTIES.find((d) => d.id === difficultyId) || DIFFICULTIES[1];
    const preset = ENEMY_PRESETS[this.difficulty.enemyIndex];

    this.player = new Fighter(playerLoadout, true, playerLoadout.name || 'PLAYER FRAME');
    this.enemy = new Fighter(preset, false, preset.name);
    this.enemy.skill = preset.skill;

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

    this._initAi();

    this.hud.reset();
    this.hud.setNames(this.player.name, this.enemy.name);
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
    if (this.player) {
      disposeMech(this.player.mech);
      this.player = null;
    }
    if (this.enemy) {
      disposeMech(this.enemy.mech);
      this.enemy = null;
    }
    this.running = false;
    this.finished = false;
    this.endTimer = 0;
    audio.setBoost(false);
  }

  dispose() {
    this.reset();
    this.effects.dispose();
    for (const g of this.projGeo.values()) g.dispose();
    for (const m of this.projMat.values()) m.dispose();
    this.projGeo.clear();
    this.projMat.clear();
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
      life: Math.max(0.6, part.range / Math.max(20, speed) + 0.4),
      damage: part.damage,
      owner,
      target: targetFighter,
      homing: part.homing || 0,
      blast: part.blast || 0,
      color: part.tracer.color,
      radius: part.tracer.radius * 1.4,
      kind: part.kind,
      armTime: part.kind === 'missile' ? 0.12 : 0
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
   * Attempt to fire one weapon slot.
   * @returns {boolean} true when a shot went out
   */
  fire(f, slotName, aimPoint) {
    const w = f.weapons[slotName];
    if (!w || !f.alive) return false;
    const part = w.part;
    if (part.kind === 'none' || part.kind === 'shield') return false;
    if (w.cooldown > 0 || w.reloading) return false;

    if (part.kind === 'melee') return this._startMelee(f, slotName);

    if (w.usesAmmo && w.ammo <= 0) {
      this.reload(f, slotName);
      return false;
    }
    const energyCost = part.energy || 0;
    if (energyCost > 0 && !f.spendEnergy(energyCost)) {
      if (f.isPlayer) this.hud.feed('ENERGY DEPLETED', 'bad');
      return false;
    }

    w.cooldown = w.interval;
    if (w.usesAmmo) w.ammo -= 1;
    f.shotsFired += 1;

    // muzzle position in world space
    const muzzle = w.muzzle;
    muzzle.getWorldPosition(_v4);

    const target = f === this.player ? this.enemy : this.player;
    const spread = (part.spread || 0) * f.stats.spreadMult;

    for (let i = 0; i < Math.max(1, part.pellets); i++) {
      const dir = _v.copy(aimPoint).sub(_v4);
      if (dir.lengthSq() < 0.0001) dir.set(0, 0, -1);
      dir.normalize();
      const d = dir.clone();
      scatter(d, spread);
      this._spawnProjectile(f, part, _v4.clone(), d, target);
    }

    // recoil + effects
    punchRecoil(f.mech, slotName === 'left' ? 'left' : 'right', part.kind === 'ballistic' ? 0.9 : 0.55);
    const fwd = _v2.copy(aimPoint).sub(_v4).normalize();
    this.effects.muzzleFlash(_v4, fwd, part.tracer.color, part.kind === 'missile' ? 0.9 : 1.15);

    const near = this._audibility(f);
    if (near > 0.02) {
      if (part.id === 'wp_railgun') audio.railShot();
      else if (part.kind === 'beam') (part.rpm > 200 ? audio.pulseShot() : audio.beamShot());
      else if (part.kind === 'missile') audio.missileLaunch();
      else audio.ballisticShot();
    }

    if (w.usesAmmo && w.ammo <= 0) this.reload(f, slotName);
    return true;
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

  _startMelee(f, slotName) {
    const w = f.weapons[slotName];
    if (!f.spendEnergy(w.part.energy || 0)) return false;
    w.cooldown = w.interval;
    playMelee(f.mech, slotName);
    f.meleePending = { slot: slotName, timer: 0.18 };
    if (this._audibility(f) > 0.02) audio.melee();
    return true;
  }

  _resolveMelee(f) {
    const pending = f.meleePending;
    f.meleePending = null;
    const w = f.weapons[pending.slot];
    const part = w.part;
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

    if (target.isPlayer) {
      this.hud.flashDamage(Math.min(0.85, dmg / 120 + 0.15));
      this.chase.addShake(Math.min(0.7, dmg / 200 + 0.08));
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
    if (input.locked) {
      this.chase.yaw -= input.dx * input.sensitivity;
      const dy = input.dy * input.sensitivity * (input.invertY ? -1 : 1);
      this.chase.pitch = THREE.MathUtils.clamp(this.chase.pitch - dy, -0.85, 0.72);
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
        const w = f.weapons.right.part;
        const lead = w.speed > 0 ? dist / w.speed : 0;
        this._aimPoint.copy(_v2).addScaledVector(this.enemy.vel, lead * 0.85);
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

    if (input.mouse.left) this.fire(f, 'right', this._aimPoint);
    if (input.mouse.right && leftPart.kind !== 'shield') this.fire(f, 'left', this._aimPoint);
    if (input.hit('KeyF') && f.weapons.shoulder) this.fire(f, 'shoulder', this._aimPoint);
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

    // vertical
    if (f.grounded) {
      if (cmd.jump && f.energy > JUMP_COST) {
        f.vel.y = JUMP_SPEED * stats.jumpPower;
        f.spendEnergy(JUMP_COST);
        f.grounded = false;
        boosting = true;
        if (this._audibility(f) > 0.05) audio.jump();
      }
    } else if (cmd.hover && f.energy > 0) {
      const drain = HOVER_DRAIN * stats.thrustEfficiency * dt;
      if (f.energy > drain) {
        f.energy -= drain;
        f.energyLock = ENERGY_DELAY;
        f.vel.y += HOVER_THRUST * stats.boostPower * dt;
        f.vel.y = Math.min(f.vel.y, 16 * stats.boostPower);
        boosting = true;
      }
    }

    // quick-boost dash
    f.dashCooldown = Math.max(0, f.dashCooldown - dt);
    if (cmd.dash && f.dashCooldown <= 0 && f.energy > DASH_COST) {
      const dir = moving ? _v4.copy(wish) : f.forward(_v4);
      f.vel.x += dir.x * DASH_SPEED * stats.boostPower;
      f.vel.z += dir.z * DASH_SPEED * stats.boostPower;
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
    const accel = (f.grounded ? GROUND_ACCEL : AIR_ACCEL) * dt;
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

    // ground contact
    const gy = this.groundHeightAt(f.pos.x, f.pos.z, f.radius);
    f.groundY = gy;
    if (f.pos.y <= gy + 0.001) {
      if (!f.grounded && f.vel.y < -6) {
        this.effects.landingDust(_v.set(f.pos.x, gy, f.pos.z), 1 + Math.min(1.4, -f.vel.y / 26));
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
    if (boosting || (!f.grounded && f.vel.y > -2)) {
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
    e.ai = {
      state: 'engage',
      stateTimer: 0,
      strafeDir: Math.random() > 0.5 ? 1 : -1,
      preferredRange: ranged.range > 0 ? THREE.MathUtils.clamp(ranged.range * 0.42, 16, 78) : 12,
      meleeSlot: rw.kind === 'melee' ? 'right' : lw.kind === 'melee' ? 'left' : null,
      reactionTimer: 0,
      aimError: new THREE.Vector3(),
      aimErrorTimer: 0,
      jumpTimer: 1 + Math.random() * 2,
      dodgeTimer: 0,
      burst: 0,
      burstOpen: true
    };
  }

  _updateAi(dt) {
    const e = this.enemy;
    const p = this.player;
    if (!e.alive || !p) return;
    const ai = e.ai;
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
    e.pitch = THREE.MathUtils.lerp(e.pitch, THREE.MathUtils.clamp(distY / Math.max(6, flatDist), -0.7, 0.7), dt * 5);

    // -------- pick a stance
    ai.stateTimer -= dt;
    if (ai.stateTimer <= 0) {
      ai.stateTimer = 0.9 + Math.random() * 1.4;
      if (Math.random() < 0.45) ai.strafeDir *= -1;

      const lowEnergy = e.energy < e.maxEnergy * 0.25;
      const reloading = e.weapons.right.reloading && (!e.weapons.left || e.weapons.left.reloading);
      if (ai.meleeSlot && dist < 34 && e.hp > e.maxHp * 0.3 && Math.random() < 0.35 + skill * 0.3) {
        ai.state = 'charge';
      } else if (!los) {
        ai.state = 'flank';
      } else if (lowEnergy || reloading) {
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
      wish.copy(fwdToPlayer).addScaledVector(strafe, 0.35);
    } else if (ai.state === 'withdraw') {
      wish.copy(fwdToPlayer).multiplyScalar(-1).addScaledVector(strafe, 0.7);
    } else if (ai.state === 'flank') {
      wish.copy(strafe).addScaledVector(fwdToPlayer, 0.55);
    } else {
      const err = flatDist - ai.preferredRange;
      const approach = THREE.MathUtils.clamp(err / 22, -1, 1);
      wish.copy(fwdToPlayer).multiplyScalar(approach).addScaledVector(strafe, 0.85);
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
          if (closing > 0.94 && Math.random() < 0.35 + skill * 0.5) {
            dash = true;
            ai.dodgeTimer = 0.8 - skill * 0.35;
            ai.strafeDir *= -1;
            break;
          }
        }
      }
    }

    ai.jumpTimer -= dt;
    if (ai.jumpTimer <= 0) {
      ai.jumpTimer = 2.4 + Math.random() * 3.5;
      if (e.grounded && e.energy > e.maxEnergy * 0.45 && Math.random() < 0.35 + skill * 0.35) jump = true;
    }
    const hover = !e.grounded && e.vel.y < 0 && e.energy > e.maxEnergy * 0.3 && distY > 3;

    this._applyMovement(e, wish, moving, dt, { jump, hover, dash });

    // -------- shooting
    if (los) {
      const aimAt = this._aiAim.copy(p.center(this._aiTmp));
      // lead the target so fast frames still get hit
      const rw = e.weapons.right.part;
      if (rw.speed > 0) aimAt.addScaledVector(p.vel, (dist / rw.speed) * (0.55 + skill * 0.5));
      aimAt.add(ai.aimError);

      const fwd = e.forward(this._aiTmp2);
      const toAim = this._aiTmp3.copy(aimAt).sub(e.center(this._aiTmp)).normalize();
      const facing = fwd.x * toAim.x + fwd.z * toAim.z;

      // trigger discipline: the AI does not hold the trigger down forever
      ai.burst -= dt;
      if (ai.burst <= 0) {
        ai.burst = 0.35 + Math.random() * (1.5 - skill);
        ai.burstOpen = Math.random() < 0.3 + skill * 0.4;
      }

      if (facing > 0.86 && ai.burstOpen) {
        if (dist < rw.range * 1.05 && rw.kind !== 'melee') this.fire(e, 'right', aimAt);
        const lw = e.weapons.left.part;
        if (lw.kind !== 'none' && lw.kind !== 'shield' && lw.kind !== 'melee' && dist < lw.range * 1.05) {
          if (Math.random() < 0.5 + skill * 0.4) this.fire(e, 'left', aimAt);
        }
        if (e.weapons.shoulder && dist < 120 && Math.random() < 0.012 + skill * 0.02) {
          this.fire(e, 'shoulder', aimAt);
        }
      }

      if (ai.meleeSlot && dist < e.weapons[ai.meleeSlot].part.range * 0.9 && facing > 0.8) {
        this.fire(e, ai.meleeSlot, aimAt);
      }
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
        const rad = f.radius + p.radius;
        if (res.distSq <= rad * rad) {
          const point = _pjHit.copy(hitB).lerp(hitA, 0.5);
          if (p.blast > 0) this._blast(p, point);
          else this.applyDamage(f, p.damage, point, p.owner);
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
      locked: this._locked
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
          enemy: this.enemy.name
        });
      }
    }
  }
}
