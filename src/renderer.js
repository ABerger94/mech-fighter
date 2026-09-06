/**
 * MECH FIGHTER - rendering layer.
 *
 * Owns the WebGL renderer, both environments (garage bay and battle arena),
 * all lighting/shadow setup, and the two camera rigs (orbit for the garage,
 * chase for combat). Gameplay code never touches renderer internals directly.
 */

import * as THREE from 'three';

/* ====================================================================== */
/*  Renderer                                                              */
/* ====================================================================== */

export class GameRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.width = window.innerWidth;
    this.height = window.innerHeight;

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(this.width, this.height, false);
    if (this.camera) {
      this.camera.aspect = this.width / this.height;
      this.camera.updateProjectionMatrix();
    }
  }

  /** Point the renderer at a scene/camera pair. */
  use(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    camera.aspect = this.width / this.height;
    camera.updateProjectionMatrix();
  }

  render() {
    if (this.scene && this.camera) this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    this.renderer.dispose();
  }
}

/* ====================================================================== */
/*  Shared visual helpers                                                 */
/* ====================================================================== */

const SKY_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const SKY_FRAG = /* glsl */ `
uniform vec3 topColor;
uniform vec3 midColor;
uniform vec3 bottomColor;
uniform float offset;
varying vec3 vWorld;
void main() {
  float h = normalize(vWorld + vec3(0.0, offset, 0.0)).y;
  vec3 col = h > 0.0
    ? mix(midColor, topColor, pow(clamp(h, 0.0, 1.0), 0.7))
    : mix(midColor, bottomColor, pow(clamp(-h, 0.0, 1.0), 0.55));
  gl_FragColor = vec4(col, 1.0);
}
`;

function makeSky(radius, top, mid, bottom) {
  const geo = new THREE.SphereGeometry(radius, 32, 20);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      topColor: { value: new THREE.Color(top) },
      midColor: { value: new THREE.Color(mid) },
      bottomColor: { value: new THREE.Color(bottom) },
      offset: { value: radius * 0.05 }
    },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false
  });
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  return m;
}

/** Emissive line material shared by grid trims. */
function neonMat(color, intensity = 2.0) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    emissive: new THREE.Color(color),
    emissiveIntensity: intensity,
    roughness: 0.4,
    metalness: 0.0
  });
}

/** Recursively free a subtree's GPU resources. */
export function disposeObject(obj) {
  obj.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    const mat = child.material;
    if (!mat) return;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat.dispose();
  });
  if (obj.parent) obj.parent.remove(obj);
}

/* ====================================================================== */
/*  Garage environment                                                    */
/* ====================================================================== */

export function createGarageEnvironment() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070c);
  scene.fog = new THREE.FogExp2(0x05070c, 0.014);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 500);

  // --- floor
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x0d1219, metalness: 0.75, roughness: 0.42 });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 48), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // --- deck plating rings
  const ringMat = neonMat(0x2ec2e6, 1.4);
  for (let i = 0; i < 3; i++) {
    const r = 6.2 + i * 3.4;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.045, 6, 96), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    scene.add(ring);
  }

  // --- hex platform the mech stands on
  const platMat = new THREE.MeshStandardMaterial({ color: 0x161d27, metalness: 0.8, roughness: 0.35 });
  const platform = new THREE.Mesh(new THREE.CylinderGeometry(5.4, 5.9, 0.55, 8), platMat);
  platform.position.y = -0.27;
  platform.receiveShadow = true;
  platform.castShadow = true;
  scene.add(platform);

  const platRim = new THREE.Mesh(
    new THREE.CylinderGeometry(5.45, 5.45, 0.16, 8, 1, true),
    neonMat(0x4de1ff, 2.2)
  );
  platRim.material.side = THREE.DoubleSide;
  platRim.position.y = 0.06;
  scene.add(platRim);

  // --- gantries / scaffolding around the bay
  const steel = new THREE.MeshStandardMaterial({ color: 0x1b232e, metalness: 0.85, roughness: 0.42 });
  const gantry = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    const r = 12.5;
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.7, 16, 0.7), steel);
    col.position.set(Math.cos(a) * r, 8, Math.sin(a) * r);
    col.castShadow = true;
    col.receiveShadow = true;
    gantry.add(col);

    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 5.5), steel);
    strut.position.set(Math.cos(a) * (r - 2.4), 9.5, Math.sin(a) * (r - 2.4));
    strut.lookAt(0, 9.5, 0);
    strut.castShadow = true;
    gantry.add(strut);

    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.3), neonMat(0xffdca8, 1.4));
    lamp.position.set(Math.cos(a) * (r - 4.6), 11.2, Math.sin(a) * (r - 4.6));
    lamp.lookAt(0, 0, 0);
    gantry.add(lamp);
  }
  // catwalk ring
  const walk = new THREE.Mesh(new THREE.TorusGeometry(12.5, 0.3, 6, 40), steel);
  walk.rotation.x = -Math.PI / 2;
  walk.position.y = 9.6;
  walk.castShadow = true;
  gantry.add(walk);
  scene.add(gantry);

  // --- back wall panels
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x0b1017, metalness: 0.6, roughness: 0.7 });
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(24, 24, 30, 24, 1, true), wallMat);
  wall.material.side = THREE.BackSide;
  wall.position.y = 12;
  scene.add(wall);

  // --- lighting
  scene.add(new THREE.HemisphereLight(0x3b5a72, 0x090c12, 0.55));

  const key = new THREE.SpotLight(0xd9f2ff, 260, 60, Math.PI / 5.2, 0.45, 1.6);
  key.position.set(9, 18, 12);
  key.target.position.set(0, 3.5, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0009;
  key.shadow.camera.near = 2;
  key.shadow.camera.far = 60;
  scene.add(key, key.target);

  const fill = new THREE.SpotLight(0x4da6ff, 120, 55, Math.PI / 4.6, 0.6, 1.5);
  fill.position.set(-13, 12, -7);
  fill.target.position.set(0, 3.5, 0);
  scene.add(fill, fill.target);

  const rim = new THREE.SpotLight(0xff9a52, 150, 55, Math.PI / 5, 0.5, 1.5);
  rim.position.set(-4, 10, -14);
  rim.target.position.set(0, 4, 0);
  scene.add(rim, rim.target);

  const under = new THREE.PointLight(0x4de1ff, 16, 18, 2);
  under.position.set(0, 0.6, 0);
  scene.add(under);

  // --- slow rotating holo rings for flavour
  const holo = new THREE.Group();
  const holoMat = new THREE.MeshBasicMaterial({ color: 0x4de1ff, transparent: true, opacity: 0.16, side: THREE.DoubleSide });
  for (let i = 0; i < 2; i++) {
    const r = new THREE.Mesh(new THREE.RingGeometry(6.4 + i * 0.5, 6.55 + i * 0.5, 64), holoMat);
    r.rotation.x = -Math.PI / 2;
    r.position.y = 0.05 + i * 0.02;
    holo.add(r);
  }
  scene.add(holo);

  const update = (dt) => {
    holo.rotation.y += dt * 0.25;
  };

  return { scene, camera, update, platformRadius: 5.4 };
}

/* ====================================================================== */
/*  Orbit camera (garage)                                                 */
/* ====================================================================== */

export class OrbitCamera {
  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {HTMLElement} domElement element that receives pointer events
   */
  constructor(camera, domElement) {
    this.camera = camera;
    this.dom = domElement;
    this.target = new THREE.Vector3(0, 3.4, 0);
    this.azimuth = Math.PI * 0.18;
    this.polar = Math.PI * 0.44;
    this.distance = 15;
    this.minDistance = 7;
    this.maxDistance = 30;
    this.autoRotate = true;
    this.autoRotateSpeed = 0.12;
    this.enabled = true;

    this._targetAzimuth = this.azimuth;
    this._targetPolar = this.polar;
    this._targetDistance = this.distance;
    this._dragging = false;
    this._lastX = 0;
    this._lastY = 0;
    this._pointerId = null;
    this._idleTimer = 0;

    this._onDown = (e) => {
      if (!this.enabled) return;
      if (e.target !== this.dom) return;
      this._dragging = true;
      this._pointerId = e.pointerId;
      this._lastX = e.clientX;
      this._lastY = e.clientY;
      this._idleTimer = 0;
      this.dom.setPointerCapture?.(e.pointerId);
    };
    this._onMove = (e) => {
      if (!this._dragging || e.pointerId !== this._pointerId) return;
      const dx = e.clientX - this._lastX;
      const dy = e.clientY - this._lastY;
      this._lastX = e.clientX;
      this._lastY = e.clientY;
      this._targetAzimuth -= dx * 0.006;
      this._targetPolar = THREE.MathUtils.clamp(this._targetPolar - dy * 0.005, 0.12, Math.PI * 0.62);
      this._idleTimer = 0;
    };
    this._onUp = (e) => {
      if (e.pointerId !== this._pointerId) return;
      this._dragging = false;
      this._pointerId = null;
    };
    this._onWheel = (e) => {
      if (!this.enabled) return;
      if (e.target !== this.dom) return;
      e.preventDefault();
      this._targetDistance = THREE.MathUtils.clamp(
        this._targetDistance * (1 + Math.sign(e.deltaY) * 0.12),
        this.minDistance,
        this.maxDistance
      );
    };

    window.addEventListener('pointerdown', this._onDown);
    window.addEventListener('pointermove', this._onMove);
    window.addEventListener('pointerup', this._onUp);
    window.addEventListener('pointercancel', this._onUp);
    this.dom.addEventListener('wheel', this._onWheel, { passive: false });
  }

  /** Snap instantly to the current smoothing targets. */
  snap() {
    this.azimuth = this._targetAzimuth;
    this.polar = this._targetPolar;
    this.distance = this._targetDistance;
    this.update(0);
  }

  setDistance(d) {
    this._targetDistance = THREE.MathUtils.clamp(d, this.minDistance, this.maxDistance);
  }

  update(dt) {
    if (this.autoRotate && !this._dragging) {
      this._idleTimer += dt;
      if (this._idleTimer > 2.5) this._targetAzimuth += dt * this.autoRotateSpeed;
    }
    const k = dt > 0 ? 1 - Math.pow(0.0012, dt) : 1;
    this.azimuth += (this._targetAzimuth - this.azimuth) * k;
    this.polar += (this._targetPolar - this.polar) * k;
    this.distance += (this._targetDistance - this.distance) * k;

    const sp = Math.sin(this.polar);
    this.camera.position.set(
      this.target.x + this.distance * sp * Math.sin(this.azimuth),
      this.target.y + this.distance * Math.cos(this.polar),
      this.target.z + this.distance * sp * Math.cos(this.azimuth)
    );
    this.camera.lookAt(this.target);
  }

  dispose() {
    window.removeEventListener('pointerdown', this._onDown);
    window.removeEventListener('pointermove', this._onMove);
    window.removeEventListener('pointerup', this._onUp);
    window.removeEventListener('pointercancel', this._onUp);
    this.dom.removeEventListener('wheel', this._onWheel);
  }
}

/* ====================================================================== */
/*  Arena environment                                                     */
/* ====================================================================== */

export const ARENA_HALF = 82;

/**
 * Build the battle arena: grid deck, boundary walls, cover pillars and blocks.
 * Returns collider descriptions the physics step consumes.
 */
export function createArenaEnvironment() {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0a1522, 90, 300);

  const camera = new THREE.PerspectiveCamera(62, 1, 0.35, 900);

  scene.add(makeSky(600, 0x0a1830, 0x123049, 0x03060b));

  /** @type {{type:string,x:number,z:number,hx?:number,hz?:number,r?:number,h:number}[]} */
  const colliders = [];

  // ------------------------------------------------ deck
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x223b52, metalness: 0.45, roughness: 0.78 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(ARENA_HALF * 2, 1.6, ARENA_HALF * 2), deckMat);
  deck.position.y = -0.8;
  deck.receiveShadow = true;
  scene.add(deck);

  const grid = new THREE.GridHelper(ARENA_HALF * 2, 48, 0x2f7f9c, 0x1b4457);
  grid.position.y = 0.02;
  grid.material.transparent = true;
  grid.material.opacity = 0.55;
  scene.add(grid);

  // glowing centre circle
  const centre = new THREE.Mesh(new THREE.RingGeometry(11.6, 12.2, 72), new THREE.MeshBasicMaterial({ color: 0x4de1ff, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
  centre.rotation.x = -Math.PI / 2;
  centre.position.y = 0.04;
  scene.add(centre);

  // ------------------------------------------------ boundary walls
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x2b3f52, metalness: 0.55, roughness: 0.6 });
  const wallTrim = neonMat(0x4de1ff, 2.2);
  const WALL_H = 26;
  const wallDefs = [
    { x: 0, z: -ARENA_HALF, hx: ARENA_HALF, hz: 2 },
    { x: 0, z: ARENA_HALF, hx: ARENA_HALF, hz: 2 },
    { x: -ARENA_HALF, z: 0, hx: 2, hz: ARENA_HALF },
    { x: ARENA_HALF, z: 0, hx: 2, hz: ARENA_HALF }
  ];
  for (const w of wallDefs) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w.hx * 2, WALL_H, w.hz * 2), wallMat);
    m.position.set(w.x, WALL_H / 2, w.z);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);

    const trim = new THREE.Mesh(new THREE.BoxGeometry(w.hx * 2 * 0.98, 0.5, w.hz * 2 * 0.98), wallTrim);
    trim.position.set(w.x, 4.5, w.z);
    scene.add(trim);
    const trim2 = trim.clone();
    trim2.position.y = WALL_H - 1.2;
    scene.add(trim2);

    colliders.push({ type: 'box', x: w.x, z: w.z, hx: w.hx, hz: w.hz, h: WALL_H });
  }

  // corner towers
  const towerMat = new THREE.MeshStandardMaterial({ color: 0x263646, metalness: 0.6, roughness: 0.55 });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 8, 34, 8), towerMat);
      t.position.set(sx * (ARENA_HALF - 4), 17, sz * (ARENA_HALF - 4));
      t.castShadow = true;
      t.receiveShadow = true;
      scene.add(t);
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.1, 12, 10), neonMat(0xff5e5e, 3.2));
      beacon.position.set(t.position.x, 35, t.position.z);
      scene.add(beacon);
      colliders.push({ type: 'cyl', x: t.position.x, z: t.position.z, r: 7.2, h: 34 });
    }
  }

  // ------------------------------------------------ cover: pillars
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x39506a, metalness: 0.45, roughness: 0.6 });
  const pillarTrim = neonMat(0x38d6ff, 1.8);
  const pillarSpots = [
    [-34, -34], [34, -34], [-34, 34], [34, 34],
    [0, -46], [0, 46], [-46, 0], [46, 0],
    [-20, 12], [20, -12]
  ];
  for (const [px, pz] of pillarSpots) {
    const h = 15 + ((px * 7 + pz * 13) % 9);
    const r = 3.1;
    const p = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.86, r, h, 10), pillarMat);
    p.position.set(px, h / 2, pz);
    p.castShadow = true;
    p.receiveShadow = true;
    scene.add(p);

    const band = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.92, r * 0.92, 0.42, 10), pillarTrim);
    band.position.set(px, h - 1.6, pz);
    scene.add(band);

    const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.25, r * 0.9, 1.1, 10), pillarMat);
    cap.position.set(px, h + 0.4, pz);
    cap.castShadow = true;
    scene.add(cap);

    colliders.push({ type: 'cyl', x: px, z: pz, r, h });
  }

  // ------------------------------------------------ cover: crates and blocks
  const blockMat = new THREE.MeshStandardMaterial({ color: 0x40566e, metalness: 0.4, roughness: 0.72 });
  const blockTrim = neonMat(0xffab4d, 1.5);
  const blockSpots = [
    [-14, -26, 7, 4, 6],
    [14, 26, 7, 4, 6],
    [-52, -18, 5, 9, 8],
    [52, 18, 5, 9, 8],
    [26, -50, 9, 5, 5.5],
    [-26, 50, 9, 5, 5.5],
    [-8, 8, 4, 4, 9],
    [8, -8, 4, 4, 9],
    [-60, 48, 6, 6, 11],
    [60, -48, 6, 6, 11]
  ];
  for (const [bx, bz, hx, hz, h] of blockSpots) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(hx * 2, h, hz * 2), blockMat);
    b.position.set(bx, h / 2, bz);
    b.castShadow = true;
    b.receiveShadow = true;
    scene.add(b);

    const stripe = new THREE.Mesh(new THREE.BoxGeometry(hx * 2 * 1.01, 0.35, hz * 2 * 0.4), blockTrim);
    stripe.position.set(bx, h - 0.9, bz);
    scene.add(stripe);

    colliders.push({ type: 'box', x: bx, z: bz, hx, hz, h });
  }

  // ------------------------------------------------ ambient detail
  // floor light strips running down the middle
  const stripMat = new THREE.MeshBasicMaterial({ color: 0x2ee6ff, transparent: true, opacity: 0.5 });
  for (let i = -3; i <= 3; i++) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.35, ARENA_HALF * 1.8), stripMat);
    s.rotation.x = -Math.PI / 2;
    s.position.set(i * 22, 0.03, 0);
    scene.add(s);
  }

  // hovering marker drones (pure decoration, animated in update)
  const drones = [];
  const droneMat = neonMat(0xffd166, 2.6);
  for (let i = 0; i < 8; i++) {
    const d = new THREE.Mesh(new THREE.OctahedronGeometry(0.85, 0), droneMat);
    d.position.set(Math.cos(i) * 55, 22 + (i % 3) * 6, Math.sin(i * 1.7) * 55);
    scene.add(d);
    drones.push({ mesh: d, phase: i * 0.9, radius: 40 + i * 4, y: d.position.y, speed: 0.12 + i * 0.015 });
  }

  // ------------------------------------------------ lighting
  scene.add(new THREE.HemisphereLight(0x8fc0e0, 0x1a2430, 1.5));
  scene.add(new THREE.AmbientLight(0x486a88, 0.55));

  const sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
  sun.position.set(70, 110, 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 20;
  sun.shadow.camera.far = 320;
  sun.shadow.camera.left = -110;
  sun.shadow.camera.right = 110;
  sun.shadow.camera.top = 110;
  sun.shadow.camera.bottom = -110;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);

  // cool counter-light so the shadowed side of every frame stays readable
  const bounce = new THREE.DirectionalLight(0x5f9dff, 1.25);
  bounce.position.set(-70, 55, -80);
  scene.add(bounce);

  const rimLight = new THREE.DirectionalLight(0xffb673, 0.85);
  rimLight.position.set(-40, 30, 90);
  scene.add(rimLight);

  const update = (dt, t) => {
    for (const d of drones) {
      d.phase += dt * d.speed;
      d.mesh.position.x = Math.cos(d.phase) * d.radius;
      d.mesh.position.z = Math.sin(d.phase) * d.radius;
      d.mesh.position.y = d.y + Math.sin(t * 1.2 + d.phase * 3) * 1.4;
      d.mesh.rotation.y += dt * 1.6;
      d.mesh.rotation.x += dt * 0.8;
    }
  };

  return { scene, camera, colliders, update, sun, half: ARENA_HALF };
}

/* ====================================================================== */
/*  Chase camera (arena)                                                  */
/* ====================================================================== */

const _desired = new THREE.Vector3();
const _shake = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();

export class ChaseCamera {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0;
    this.pitch = -0.08;
    this.distance = 15;
    this.height = 7.4;
    this.shoulder = 3.6;
    this.position = new THREE.Vector3(0, 10, 20);
    this.lookAt = new THREE.Vector3();
    this._shakeAmount = 0;
    this._shakeTime = 0;
    this._fov = camera.fov;
    this._targetFov = camera.fov;
  }

  addShake(amount) {
    this._shakeAmount = Math.min(1.6, this._shakeAmount + amount);
  }

  setFov(fov) {
    this._targetFov = fov;
  }

  /**
   * @param {number} dt
   * @param {THREE.Vector3} anchor world position of the pilot's torso
   * @param {(from:THREE.Vector3,to:THREE.Vector3)=>number} occlusionTest optional, returns allowed fraction
   */
  update(dt, anchor, occlusionTest) {
    const cp = Math.cos(this.pitch);
    const forward = _fwd.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
    const right = _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    _desired.copy(anchor)
      .addScaledVector(forward, -this.distance)
      .addScaledVector(right, this.shoulder);
    _desired.y += this.height;

    if (occlusionTest) {
      const frac = occlusionTest(anchor, _desired);
      if (frac < 1) _desired.lerpVectors(anchor, _desired, Math.max(0.28, frac));
    }
    _desired.y = Math.max(2.2, _desired.y);

    // Position eases; orientation does not. A smoothed look vector makes the
    // reticle lag the mouse, which ruins aiming.
    this.position.lerp(_desired, 1 - Math.exp(-dt / 0.075));

    // shake
    if (this._shakeAmount > 0.001) {
      this._shakeTime += dt * 32;
      this._shakeAmount = Math.max(0, this._shakeAmount - dt * 2.2);
      const a = this._shakeAmount * this._shakeAmount * 0.9;
      _shake.set(
        Math.sin(this._shakeTime * 1.7) * a,
        Math.cos(this._shakeTime * 2.3) * a,
        Math.sin(this._shakeTime * 1.1) * a * 0.5
      );
    } else {
      _shake.set(0, 0, 0);
    }

    this.camera.position.copy(this.position).add(_shake);
    this.lookAt.copy(this.camera.position).addScaledVector(forward, 120);
    this.camera.lookAt(this.lookAt);

    this._fov += (this._targetFov - this._fov) * (1 - Math.pow(0.005, dt));
    if (Math.abs(this.camera.fov - this._fov) > 0.01) {
      this.camera.fov = this._fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
