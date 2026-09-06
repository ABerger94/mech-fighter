/**
 * MECH FIGHTER - visual effects.
 *
 * A single pooled particle system (one THREE.Points draw call), plus pooled
 * shockwave rings, flash spheres and dynamic point lights. Everything is
 * recycled; nothing allocates GPU memory during combat.
 */

import * as THREE from 'three';

const MAX_PARTICLES = 1400;
const MAX_RINGS = 20;
const MAX_FLASHES = 26;
const MAX_LIGHTS = 6;

/* ---------------------------------------------------------- sprite sheet */

function makeParticleTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0.0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.22)');
  g.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const PARTICLE_VERT = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
attribute float aAlpha;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (420.0 / max(1.0, -mv.z));
  gl_Position = projectionMatrix * mv;
}
`;

const PARTICLE_FRAG = /* glsl */ `
uniform sampler2D uMap;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 tex = texture2D(uMap, gl_PointCoord);
  if (tex.a * vAlpha < 0.01) discard;
  gl_FragColor = vec4(vColor, tex.a * vAlpha);
}
`;

/* ==================================================================== */

export class Effects {
  /** @param {THREE.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    this.time = 0;

    // ---------------- particles
    this.pPos = new Float32Array(MAX_PARTICLES * 3);
    this.pVel = new Float32Array(MAX_PARTICLES * 3);
    this.pCol = new Float32Array(MAX_PARTICLES * 3);
    this.pSize = new Float32Array(MAX_PARTICLES);
    this.pAlpha = new Float32Array(MAX_PARTICLES);
    this.pLife = new Float32Array(MAX_PARTICLES);
    this.pMaxLife = new Float32Array(MAX_PARTICLES);
    this.pDrag = new Float32Array(MAX_PARTICLES);
    this.pGrav = new Float32Array(MAX_PARTICLES);
    this.pSize0 = new Float32Array(MAX_PARTICLES);
    this.pCursor = 0;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.pCol, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.pSize, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.pAlpha, 1));
    geo.setDrawRange(0, MAX_PARTICLES);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);

    this.particleTexture = makeParticleTexture();
    const mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: this.particleTexture } },
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
    this._pGeo = geo;
    this._pMat = mat;

    // ---------------- shockwave rings
    this.rings = [];
    const ringGeo = new THREE.RingGeometry(0.72, 1.0, 40);
    this._ringGeo = ringGeo;
    for (let i = 0; i < MAX_RINGS; i++) {
      const m = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      );
      m.visible = false;
      m.renderOrder = 4;
      scene.add(m);
      this.rings.push({ mesh: m, life: 0, maxLife: 1, from: 1, to: 4, billboard: true, alpha: 1 });
    }

    // ---------------- flash spheres
    this.flashes = [];
    const sphGeo = new THREE.SphereGeometry(1, 10, 8);
    this._sphGeo = sphGeo;
    for (let i = 0; i < MAX_FLASHES; i++) {
      const m = new THREE.Mesh(
        sphGeo,
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      m.visible = false;
      m.renderOrder = 4;
      scene.add(m);
      this.flashes.push({ mesh: m, life: 0, maxLife: 1, from: 1, to: 2 });
    }

    // ---------------- dynamic lights
    this.lights = [];
    for (let i = 0; i < MAX_LIGHTS; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 60, 2);
      l.visible = false;
      scene.add(l);
      this.lights.push({ light: l, life: 0, maxLife: 1, power: 0 });
    }
    this._lightCursor = 0;
  }

  /* ------------------------------------------------------------ spawns */

  _particle(x, y, z, vx, vy, vz, color, size, life, drag = 1.6, grav = 0) {
    const i = this.pCursor;
    this.pCursor = (this.pCursor + 1) % MAX_PARTICLES;
    const i3 = i * 3;
    this.pPos[i3] = x;
    this.pPos[i3 + 1] = y;
    this.pPos[i3 + 2] = z;
    this.pVel[i3] = vx;
    this.pVel[i3 + 1] = vy;
    this.pVel[i3 + 2] = vz;
    this.pCol[i3] = color.r;
    this.pCol[i3 + 1] = color.g;
    this.pCol[i3 + 2] = color.b;
    this.pSize[i] = size;
    this.pSize0[i] = size;
    this.pAlpha[i] = 1;
    this.pLife[i] = life;
    this.pMaxLife[i] = life;
    this.pDrag[i] = drag;
    this.pGrav[i] = grav;
  }

  _ring(pos, color, from, to, life, normal = null, alpha = 1) {
    let slot = this.rings.find((r) => r.life <= 0);
    if (!slot) slot = this.rings[0];
    slot.mesh.visible = true;
    slot.mesh.position.copy(pos);
    slot.mesh.material.color.copy(color);
    slot.mesh.material.opacity = alpha;
    slot.alpha = alpha;
    slot.life = life;
    slot.maxLife = life;
    slot.from = from;
    slot.to = to;
    slot.billboard = !normal;
    if (normal) {
      slot.mesh.lookAt(pos.x + normal.x, pos.y + normal.y, pos.z + normal.z);
    }
  }

  _flash(pos, color, from, to, life) {
    let slot = this.flashes.find((f) => f.life <= 0);
    if (!slot) slot = this.flashes[0];
    slot.mesh.visible = true;
    slot.mesh.position.copy(pos);
    slot.mesh.material.color.copy(color);
    slot.mesh.material.opacity = 1;
    slot.mesh.scale.setScalar(from);
    slot.life = life;
    slot.maxLife = life;
    slot.from = from;
    slot.to = to;
  }

  _light(pos, color, power, life, distance = 60) {
    const slot = this.lights[this._lightCursor];
    this._lightCursor = (this._lightCursor + 1) % MAX_LIGHTS;
    slot.light.visible = true;
    slot.light.position.copy(pos);
    slot.light.color.copy(color);
    slot.light.distance = distance;
    slot.light.intensity = power;
    slot.power = power;
    slot.life = life;
    slot.maxLife = life;
  }

  /* ----------------------------------------------------- public effects */

  /** Muzzle blast at a barrel tip. */
  muzzleFlash(pos, dir, colorHex, scale = 1) {
    const color = _c1.set(colorHex);
    this._flash(pos, color, 0.35 * scale, 1.5 * scale, 0.09);
    this._light(pos, color, 90 * scale, 0.1, 40 * scale);
    for (let i = 0; i < 6; i++) {
      const spread = 0.35;
      this._particle(
        pos.x, pos.y, pos.z,
        dir.x * (14 + Math.random() * 22) + (Math.random() - 0.5) * spread * 20,
        dir.y * (14 + Math.random() * 22) + (Math.random() - 0.5) * spread * 20,
        dir.z * (14 + Math.random() * 22) + (Math.random() - 0.5) * spread * 20,
        color,
        0.55 * scale + Math.random() * 0.35,
        0.14 + Math.random() * 0.1,
        5.5
      );
    }
  }

  /** Sparks and a small flash where a projectile lands. */
  impact(pos, normal, colorHex, scale = 1) {
    const color = _c1.set(colorHex);
    this._flash(pos, color, 0.3 * scale, 1.9 * scale, 0.13);
    this._ring(pos, color, 0.4 * scale, 3.0 * scale, 0.24, normal, 0.7);
    this._light(pos, color, 70 * scale, 0.16, 34 * scale);
    const n = normal || _v1.set(0, 1, 0);
    for (let i = 0; i < 12; i++) {
      const vx = n.x * 6 + (Math.random() - 0.5) * 20;
      const vy = n.y * 6 + Math.random() * 14;
      const vz = n.z * 6 + (Math.random() - 0.5) * 20;
      this._particle(
        pos.x, pos.y, pos.z,
        vx * scale, vy * scale, vz * scale,
        color,
        0.35 + Math.random() * 0.4,
        0.25 + Math.random() * 0.35,
        2.0,
        -14
      );
    }
  }

  /** Damage burst on a mech, tinted toward hot orange. */
  hitSpark(pos, colorHex, scale = 1) {
    const color = _c1.set(colorHex);
    this._flash(pos, color, 0.5 * scale, 2.4 * scale, 0.14);
    this._light(pos, color, 60 * scale, 0.14, 30);
    for (let i = 0; i < 14; i++) {
      this._particle(
        pos.x, pos.y, pos.z,
        (Math.random() - 0.5) * 26 * scale,
        Math.random() * 18 * scale,
        (Math.random() - 0.5) * 26 * scale,
        color,
        0.34 + Math.random() * 0.5,
        0.28 + Math.random() * 0.4,
        2.4,
        -16
      );
    }
    for (let i = 0; i < 6; i++) {
      this._particle(
        pos.x, pos.y, pos.z,
        (Math.random() - 0.5) * 6,
        2 + Math.random() * 5,
        (Math.random() - 0.5) * 6,
        _c2.set(0x2b2b30),
        1.6 + Math.random() * 1.6,
        0.8 + Math.random() * 0.7,
        0.9,
        2
      );
    }
  }

  /** Large explosion: shockwave, fireball, smoke, debris. */
  explosion(pos, colorHex = 0xff9a3d, scale = 1) {
    const hot = _c1.set(colorHex);
    this._flash(pos, hot, 0.6 * scale, 3.2 * scale, 0.2);
    this._ring(pos, hot, 0.9 * scale, 8 * scale, 0.38, null, 0.5);
    this._light(pos, hot, 150 * scale, 0.36, 80 * scale);

    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const b = Math.acos(2 * Math.random() - 1);
      const sp = (10 + Math.random() * 26) * scale;
      this._particle(
        pos.x, pos.y, pos.z,
        Math.sin(b) * Math.cos(a) * sp,
        Math.abs(Math.cos(b)) * sp * 0.8 + 4,
        Math.sin(b) * Math.sin(a) * sp,
        _c2.set(Math.random() > 0.4 ? colorHex : 0xffe08a),
        (0.9 + Math.random() * 1.5) * scale,
        0.4 + Math.random() * 0.5,
        1.9,
        -6
      );
    }
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (3 + Math.random() * 9) * scale;
      this._particle(
        pos.x, pos.y + 1, pos.z,
        Math.cos(a) * sp,
        3 + Math.random() * 7,
        Math.sin(a) * sp,
        _c2.set(0x3a3a42),
        (2.4 + Math.random() * 3) * scale,
        1.1 + Math.random() * 1.0,
        0.85,
        1.6
      );
    }
  }

  /** Thruster plume trailing a boosting mech. */
  thruster(pos, dir, colorHex, intensity = 1) {
    if (Math.random() > intensity * 0.9) return;
    const color = _c1.set(colorHex);
    this._particle(
      pos.x, pos.y, pos.z,
      dir.x * (6 + Math.random() * 10) + (Math.random() - 0.5) * 3,
      dir.y * (6 + Math.random() * 10) + (Math.random() - 0.5) * 3,
      dir.z * (6 + Math.random() * 10) + (Math.random() - 0.5) * 3,
      color,
      0.7 + Math.random() * 0.9,
      0.22 + Math.random() * 0.2,
      3.2,
      1.5
    );
  }

  /** Dust kicked up when a mech lands. */
  landingDust(pos, scale = 1) {
    this._ring(pos, _c1.set(0x9fb6c6), 0.6 * scale, 7 * scale, 0.4, _v1.set(0, 1, 0));
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (5 + Math.random() * 11) * scale;
      this._particle(
        pos.x, pos.y + 0.3, pos.z,
        Math.cos(a) * sp,
        1.4 + Math.random() * 3,
        Math.sin(a) * sp,
        _c2.set(0x5b6a78),
        1.5 + Math.random() * 2.2,
        0.6 + Math.random() * 0.6,
        1.5,
        1.0
      );
    }
  }

  /** Glowing arc left by a melee swing. */
  meleeArc(pos, colorHex, scale = 1) {
    const color = _c1.set(colorHex);
    this._ring(pos, color, 1.2 * scale, 6 * scale, 0.22, null, 0.6);
    this._light(pos, color, 120, 0.2, 50);
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2;
      this._particle(
        pos.x, pos.y, pos.z,
        Math.cos(a) * (8 + Math.random() * 16),
        (Math.random() - 0.3) * 10,
        Math.sin(a) * (8 + Math.random() * 16),
        color,
        0.5 + Math.random() * 0.7,
        0.22 + Math.random() * 0.25,
        3.0
      );
    }
  }

  /** Energy shield flare when a hit is blocked. */
  blockFlare(pos, colorHex) {
    const color = _c1.set(colorHex);
    this._ring(pos, color, 1.4, 4.4, 0.25);
    this._flash(pos, color, 0.8, 2.6, 0.16);
    this._light(pos, color, 80, 0.2, 34);
  }

  /* ------------------------------------------------------------ update */

  update(dt) {
    this.time += dt;

    // particles
    const pos = this.pPos;
    const vel = this.pVel;
    let anyAlive = false;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (this.pLife[i] <= 0) {
        if (this.pAlpha[i] !== 0) this.pAlpha[i] = 0;
        continue;
      }
      anyAlive = true;
      this.pLife[i] -= dt;
      const i3 = i * 3;
      const damp = Math.max(0, 1 - this.pDrag[i] * dt);
      vel[i3] *= damp;
      vel[i3 + 1] = vel[i3 + 1] * damp + this.pGrav[i] * dt;
      vel[i3 + 2] *= damp;
      pos[i3] += vel[i3] * dt;
      pos[i3 + 1] += vel[i3 + 1] * dt;
      pos[i3 + 2] += vel[i3 + 2] * dt;
      if (pos[i3 + 1] < 0.05) {
        pos[i3 + 1] = 0.05;
        vel[i3 + 1] *= -0.24;
      }
      const t = Math.max(0, this.pLife[i] / this.pMaxLife[i]);
      this.pAlpha[i] = t * t;
      this.pSize[i] = this.pSize0[i] * (0.55 + t * 0.75);
      if (this.pLife[i] <= 0) this.pAlpha[i] = 0;
    }
    if (anyAlive || this._wasAlive) {
      this._pGeo.attributes.position.needsUpdate = true;
      this._pGeo.attributes.aColor.needsUpdate = true;
      this._pGeo.attributes.aSize.needsUpdate = true;
      this._pGeo.attributes.aAlpha.needsUpdate = true;
    }
    this._wasAlive = anyAlive;

    // rings
    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      const t = 1 - Math.max(0, r.life / r.maxLife);
      const s = r.from + (r.to - r.from) * t;
      r.mesh.scale.setScalar(s);
      r.mesh.material.opacity = Math.max(0, 1 - t) * 0.9 * (r.alpha ?? 1);
      if (r.billboard && this._camera) r.mesh.quaternion.copy(this._camera.quaternion);
      if (r.life <= 0) r.mesh.visible = false;
    }

    // flashes
    for (const f of this.flashes) {
      if (f.life <= 0) continue;
      f.life -= dt;
      const t = 1 - Math.max(0, f.life / f.maxLife);
      f.mesh.scale.setScalar(f.from + (f.to - f.from) * t);
      f.mesh.material.opacity = Math.max(0, 1 - t);
      if (f.life <= 0) f.mesh.visible = false;
    }

    // lights
    for (const l of this.lights) {
      if (l.life <= 0) continue;
      l.life -= dt;
      const t = Math.max(0, l.life / l.maxLife);
      l.light.intensity = l.power * t;
      if (l.life <= 0) {
        l.light.visible = false;
        l.light.intensity = 0;
      }
    }
  }

  /** Rings billboard toward this camera. */
  setCamera(camera) {
    this._camera = camera;
  }

  /** Kill every live effect (used when leaving the arena). */
  clear() {
    this.pLife.fill(0);
    this.pAlpha.fill(0);
    this._pGeo.attributes.aAlpha.needsUpdate = true;
    for (const r of this.rings) { r.life = 0; r.mesh.visible = false; }
    for (const f of this.flashes) { f.life = 0; f.mesh.visible = false; }
    for (const l of this.lights) { l.life = 0; l.light.visible = false; l.light.intensity = 0; }
  }

  dispose() {
    this.scene.remove(this.points);
    this._pGeo.dispose();
    this._pMat.dispose();
    this.particleTexture.dispose();
    for (const r of this.rings) { this.scene.remove(r.mesh); r.mesh.material.dispose(); }
    for (const f of this.flashes) { this.scene.remove(f.mesh); f.mesh.material.dispose(); }
    for (const l of this.lights) this.scene.remove(l.light);
    this._ringGeo.dispose();
    this._sphGeo.dispose();
  }
}

const _c1 = new THREE.Color();
const _c2 = new THREE.Color();
const _v1 = new THREE.Vector3();
