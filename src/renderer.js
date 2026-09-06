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
 * Battlefield definitions. Each entry drives sky, fog, deck, lighting, prop
 * layout and ambient decoration; the construction code below is shared.
 */
export const ARENAS = [
  {
    id: 'orbital',
    name: 'ORBITAL DECK',
    blurb: 'Federation testing platform. Open sightlines, pillars for cover.',
    sky: [0x0a1830, 0x123049, 0x03060b],
    fog: { color: 0x0a1522, near: 90, far: 300 },
    deck: { color: 0x223b52, grid: [0x2f7f9c, 0x1b4457], gridOpacity: 0.55, strips: 0x2ee6ff },
    wall: { color: 0x2b3f52, trim: 0x4de1ff, height: 26 },
    tower: { color: 0x263646, beacon: 0xff5e5e },
    light: {
      hemi: [0x8fc0e0, 0x1a2430, 1.5], ambient: [0x486a88, 0.55],
      sun: [0xfff0d8, 2.6, [70, 110, 40]],
      bounce: [0x5f9dff, 1.25, [-70, 55, -80]],
      rim: [0xffb673, 0.85, [-40, 30, 90]]
    },
    decor: 'drones',
    props: orbitalProps
  },
  {
    id: 'canyon',
    name: 'CANYON RUINS',
    blurb: 'Sun-blasted rock spires. Broken ground, long shadows, hot light.',
    sky: [0x4a6b96, 0xd9a06a, 0x2b1d16],
    fog: { color: 0xc79a68, near: 110, far: 340 },
    deck: { color: 0x8a6b46, grid: [0x6d5236, 0x5c4630], gridOpacity: 0.18, strips: 0 },
    wall: { color: 0x77593a, trim: 0xd9a45c, height: 34 },
    tower: { color: 0x6b4f34, beacon: 0xffd08a },
    light: {
      hemi: [0xffdcb4, 0x5a4530, 1.0], ambient: [0xe8d8c8, 0.35],
      sun: [0xfff2d8, 2.9, [90, 80, -60]],
      bounce: [0xd88f4a, 0.9, [-80, 40, 70]],
      rim: [0x7fb0ff, 0.5, [-30, 60, -90]]
    },
    decor: 'dust',
    props: canyonProps
  },
  {
    id: 'city',
    name: 'NEON CITY',
    blurb: 'Flooded downtown grid. Tight lanes between towers, neon everywhere.',
    sky: [0x140a24, 0x2a1140, 0x05030a],
    fog: { color: 0x160a26, near: 60, far: 230 },
    deck: { color: 0x2b2542, grid: [0x8b5fc0, 0x43306d], gridOpacity: 0.45, strips: 0xff4dd2 },
    wall: { color: 0x3a2c58, trim: 0xff4dd2, height: 40 },
    tower: { color: 0x322852, beacon: 0x4de1ff },
    light: {
      hemi: [0xa98fe0, 0x241a38, 1.7], ambient: [0x8d6fc0, 0.85],
      sun: [0xd9c8ff, 2.4, [-60, 100, 70]],
      bounce: [0xff7ad8, 1.5, [70, 40, -60]],
      rim: [0x6ee8ff, 1.3, [-70, 35, -70]]
    },
    decor: 'signs',
    props: cityProps
  }
];

export function getArena(id) {
  return ARENAS.find((a) => a.id === id) || ARENAS[0];
}

/* ---------------------------------------------------------- prop layouts */

/** @returns {{kind:string,x:number,z:number,r?:number,hx?:number,hz?:number,h:number,style?:string}[]} */
function orbitalProps() {
  const props = [];
  const pillars = [
    [-34, -34], [34, -34], [-34, 34], [34, 34],
    [0, -46], [0, 46], [-46, 0], [46, 0],
    [-20, 12], [20, -12]
  ];
  for (const [x, z] of pillars) {
    props.push({ kind: 'cyl', x, z, r: 3.1, h: 15 + ((x * 7 + z * 13) % 9), style: 'pillar' });
  }
  const blocks = [
    [-14, -26, 7, 4, 6], [14, 26, 7, 4, 6],
    [-52, -18, 5, 9, 8], [52, 18, 5, 9, 8],
    [26, -50, 9, 5, 5.5], [-26, 50, 9, 5, 5.5],
    [-8, 8, 4, 4, 9], [8, -8, 4, 4, 9],
    [-60, 48, 6, 6, 11], [60, -48, 6, 6, 11]
  ];
  for (const [x, z, hx, hz, h] of blocks) props.push({ kind: 'box', x, z, hx, hz, h, style: 'crate' });
  return props;
}

function canyonProps() {
  const props = [];
  // rock spires ringing the bowl, tapering toward the top
  const spires = [
    [-40, -30, 5.5, 26], [38, -36, 4.4, 21], [-44, 30, 6.2, 30], [44, 34, 5.0, 24],
    [0, -52, 4.8, 23], [-6, 52, 5.6, 27], [-56, 4, 5.2, 25], [56, -6, 4.6, 22],
    [-18, -8, 3.4, 15], [20, 10, 3.8, 17], [-26, 40, 3.2, 13], [30, -44, 3.6, 16]
  ];
  for (const [x, z, r, h] of spires) props.push({ kind: 'cyl', x, z, r, h, style: 'spire' });
  // fallen slabs and mesas
  const slabs = [
    [-12, 24, 9, 5, 4.5], [16, -22, 8, 6, 5.5],
    [-50, -50, 11, 7, 9], [50, 50, 10, 8, 8],
    [34, 4, 5, 11, 6.5], [-34, -4, 5, 11, 6.5],
    [0, 0, 7, 7, 3.4], [-60, 26, 6, 9, 12], [60, -26, 6, 9, 12]
  ];
  for (const [x, z, hx, hz, h] of slabs) props.push({ kind: 'box', x, z, hx, hz, h, style: 'mesa' });
  return props;
}

function cityProps() {
  const props = [];
  // a lane grid of towers, with gaps that form shooting corridors
  const coords = [-56, -34, -12, 12, 34, 56];
  for (const x of coords) {
    for (const z of coords) {
      if (Math.abs(x) < 14 && Math.abs(z) < 14) continue; // keep the centre open
      const seed = Math.abs(x * 31 + z * 17);
      if (seed % 7 === 0) continue; // knocked-down block
      const hx = 6 + (seed % 3);
      const hz = 6 + ((seed >> 2) % 3);
      const h = 16 + (seed % 5) * 6;
      props.push({ kind: 'box', x, z, hx, hz, h, style: 'tower' });
    }
  }
  // low barricades in the open middle
  const bars = [[-6, -20, 6, 2, 3.5], [6, 20, 6, 2, 3.5], [-20, 6, 2, 6, 3.5], [20, -6, 2, 6, 3.5]];
  for (const [x, z, hx, hz, h] of bars) props.push({ kind: 'box', x, z, hx, hz, h, style: 'barricade' });
  return props;
}

/* ====================================================================== */
/*  Arena environment                                                     */
/* ====================================================================== */

/**
 * Build a battle arena from its definition: deck, boundary, cover and lights.
 * Returns collider descriptions the physics step consumes.
 * @param {string} arenaId
 */
export function createArenaEnvironment(arenaId = 'orbital') {
  const def = getArena(arenaId);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(def.fog.color, def.fog.near, def.fog.far);

  const camera = new THREE.PerspectiveCamera(62, 1, 0.35, 900);
  scene.add(makeSky(600, def.sky[0], def.sky[1], def.sky[2]));

  /** @type {{type:string,x:number,z:number,hx?:number,hz?:number,r?:number,h:number}[]} */
  const colliders = [];

  // ------------------------------------------------ deck
  const deckMat = new THREE.MeshStandardMaterial({ color: def.deck.color, metalness: 0.35, roughness: 0.82 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(ARENA_HALF * 2, 1.6, ARENA_HALF * 2), deckMat);
  deck.position.y = -0.8;
  deck.receiveShadow = true;
  scene.add(deck);

  const grid = new THREE.GridHelper(ARENA_HALF * 2, 48, def.deck.grid[0], def.deck.grid[1]);
  grid.position.y = 0.02;
  grid.material.transparent = true;
  grid.material.opacity = def.deck.gridOpacity;
  scene.add(grid);

  const centre = new THREE.Mesh(
    new THREE.RingGeometry(11.6, 12.2, 72),
    new THREE.MeshBasicMaterial({ color: def.wall.trim, transparent: true, opacity: 0.32, side: THREE.DoubleSide })
  );
  centre.rotation.x = -Math.PI / 2;
  centre.position.y = 0.04;
  scene.add(centre);

  if (def.deck.strips) {
    const stripMat = new THREE.MeshBasicMaterial({ color: def.deck.strips, transparent: true, opacity: 0.45 });
    for (let i = -3; i <= 3; i++) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.35, ARENA_HALF * 1.8), stripMat);
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(i * 22, 0.03, 0);
      scene.add(strip);
    }
  }

  // ------------------------------------------------ boundary
  const wallMat = new THREE.MeshStandardMaterial({ color: def.wall.color, metalness: 0.45, roughness: 0.65 });
  const wallTrim = neonMat(def.wall.trim, 2.0);
  const WALL_H = def.wall.height;
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

  const towerMat = new THREE.MeshStandardMaterial({ color: def.tower.color, metalness: 0.5, roughness: 0.6 });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 8, 34, 8), towerMat);
      t.position.set(sx * (ARENA_HALF - 4), 17, sz * (ARENA_HALF - 4));
      t.castShadow = true;
      t.receiveShadow = true;
      scene.add(t);
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.1, 12, 10), neonMat(def.tower.beacon, 3.2));
      beacon.position.set(t.position.x, 35, t.position.z);
      scene.add(beacon);
      colliders.push({ type: 'cyl', x: t.position.x, z: t.position.z, r: 7.2, h: 34 });
    }
  }

  // ------------------------------------------------ cover
  const pillarMat = new THREE.MeshStandardMaterial({
    color: def.id === 'canyon' ? 0x9d7448 : def.id === 'city' ? 0x483a70 : 0x39506a,
    metalness: def.id === 'canyon' ? 0.05 : 0.4,
    roughness: def.id === 'canyon' ? 0.95 : 0.6,
    flatShading: def.id === 'canyon'
  });
  const blockMat = new THREE.MeshStandardMaterial({
    color: def.id === 'canyon' ? 0xb08a5c : def.id === 'city' ? 0x53437f : 0x40566e,
    metalness: def.id === 'canyon' ? 0.05 : 0.35,
    roughness: def.id === 'canyon' ? 0.95 : 0.72,
    flatShading: def.id === 'canyon'
  });
  const trimMat = neonMat(def.id === 'city' ? 0xff4dd2 : def.id === 'canyon' ? 0xffd08a : 0xffab4d, def.id === 'canyon' ? 0.6 : 1.6);
  const trimMat2 = neonMat(def.id === 'city' ? 0x4de1ff : def.wall.trim, 1.8);

  for (const p of def.props()) {
    if (p.kind === 'cyl') {
      const segs = p.style === 'spire' ? 7 : 10;
      const taper = p.style === 'spire' ? 0.45 : 0.86;
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(p.r * taper, p.r, p.h, segs), pillarMat);
      mesh.position.set(p.x, p.h / 2, p.z);
      mesh.rotation.y = (p.x + p.z) * 0.1;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);

      if (p.style === 'pillar') {
        const band = new THREE.Mesh(new THREE.CylinderGeometry(p.r * 0.92, p.r * 0.92, 0.42, segs), trimMat2);
        band.position.set(p.x, p.h - 1.6, p.z);
        scene.add(band);
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(p.r * 1.25, p.r * 0.9, 1.1, segs), pillarMat);
        cap.position.set(p.x, p.h + 0.4, p.z);
        cap.castShadow = true;
        scene.add(cap);
      } else {
        // a smaller boulder at the base to break the silhouette
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(p.r * 0.7, 0), blockMat);
        rock.position.set(p.x + p.r * 1.2, p.r * 0.35, p.z - p.r * 0.8);
        rock.rotation.set(p.x, p.z, 0.4);
        rock.castShadow = true;
        rock.receiveShadow = true;
        scene.add(rock);
      }
      colliders.push({ type: 'cyl', x: p.x, z: p.z, r: p.r, h: p.h });
    } else {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(p.hx * 2, p.h, p.hz * 2), blockMat);
      mesh.position.set(p.x, p.h / 2, p.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);

      if (p.style === 'tower') {
        // neon window bands up the face
        for (let i = 1; i < Math.floor(p.h / 6); i++) {
          const band = new THREE.Mesh(
            new THREE.BoxGeometry(p.hx * 2 * 1.02, 0.5, p.hz * 2 * 0.5),
            i % 2 ? trimMat : trimMat2
          );
          band.position.set(p.x, i * 6, p.z);
          scene.add(band);
        }
        const crown = new THREE.Mesh(new THREE.BoxGeometry(p.hx * 0.7, 1.2, p.hz * 0.7), trimMat2);
        crown.position.set(p.x, p.h + 0.6, p.z);
        scene.add(crown);
      } else if (p.style !== 'mesa') {
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(p.hx * 2 * 1.01, 0.35, p.hz * 2 * 0.4), trimMat);
        stripe.position.set(p.x, p.h - 0.9, p.z);
        scene.add(stripe);
      }
      colliders.push({ type: 'box', x: p.x, z: p.z, hx: p.hx, hz: p.hz, h: p.h });
    }
  }

  // ------------------------------------------------ ambient decoration
  const movers = [];
  if (def.decor === 'drones') {
    const droneMat = neonMat(0xffd166, 2.6);
    for (let i = 0; i < 8; i++) {
      const d = new THREE.Mesh(new THREE.OctahedronGeometry(0.85, 0), droneMat);
      d.position.set(Math.cos(i) * 55, 22 + (i % 3) * 6, Math.sin(i * 1.7) * 55);
      scene.add(d);
      movers.push({ mesh: d, phase: i * 0.9, radius: 40 + i * 4, y: d.position.y, speed: 0.12 + i * 0.015, spin: 1.6 });
    }
  } else if (def.decor === 'dust') {
    const dustMat = new THREE.MeshBasicMaterial({ color: 0xe8c79a, transparent: true, opacity: 0.28 });
    for (let i = 0; i < 26; i++) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), dustMat);
      d.position.set((Math.random() - 0.5) * 150, 3 + Math.random() * 26, (Math.random() - 0.5) * 150);
      scene.add(d);
      movers.push({ mesh: d, phase: Math.random() * 6.3, radius: 30 + Math.random() * 40, y: d.position.y, speed: 0.05 + Math.random() * 0.06, spin: 0.2, billboard: true });
    }
  } else {
    // hovering holo-signs drifting between the towers
    const signColors = [0xff4dd2, 0x4de1ff, 0xffd166];
    for (let i = 0; i < 10; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: signColors[i % 3], transparent: true, opacity: 0.34, side: THREE.DoubleSide });
      const d = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 0.85), mat);
      d.position.set((Math.random() - 0.5) * 130, 26 + Math.random() * 22, (Math.random() - 0.5) * 130);
      d.rotation.y = Math.random() * Math.PI;
      scene.add(d);
      movers.push({ mesh: d, phase: i, radius: 35 + i * 5, y: d.position.y, speed: 0.04 + i * 0.006, spin: 0.12 });
    }
  }

  // ------------------------------------------------ lighting
  const L = def.light;
  scene.add(new THREE.HemisphereLight(L.hemi[0], L.hemi[1], L.hemi[2]));
  scene.add(new THREE.AmbientLight(L.ambient[0], L.ambient[1]));

  const sun = new THREE.DirectionalLight(L.sun[0], L.sun[1]);
  sun.position.set(...L.sun[2]);
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

  const bounce = new THREE.DirectionalLight(L.bounce[0], L.bounce[1]);
  bounce.position.set(...L.bounce[2]);
  scene.add(bounce);

  const rimLight = new THREE.DirectionalLight(L.rim[0], L.rim[1]);
  rimLight.position.set(...L.rim[2]);
  scene.add(rimLight);

  const update = (dt, t) => {
    for (const d of movers) {
      d.phase += dt * d.speed;
      d.mesh.position.x = Math.cos(d.phase) * d.radius;
      d.mesh.position.z = Math.sin(d.phase) * d.radius;
      d.mesh.position.y = d.y + Math.sin(t * 1.2 + d.phase * 3) * 1.4;
      if (d.billboard) {
        d.mesh.rotation.y = -d.phase;
      } else {
        d.mesh.rotation.y += dt * d.spin;
        d.mesh.rotation.x += dt * d.spin * 0.5;
      }
    }
  };

  return { scene, camera, colliders, update, sun, half: ARENA_HALF, def };
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
