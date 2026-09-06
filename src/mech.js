/**
 * MECH FIGHTER - procedural mech construction.
 *
 * Every frame is assembled at runtime from primitives so that swapping a part
 * in the garage rebuilds only what changed conceptually (we rebuild the whole
 * model, which is cheap at this polygon count) and so the arena and the garage
 * share exactly one source of truth for what a build looks like.
 *
 * Convention: the mech faces -Z in its own local space, matching the direction
 * a THREE.Object3D looks by default. Yaw of 0 therefore faces -Z in world space.
 */

import * as THREE from 'three';
import { resolveLoadout, computeStats, getPart } from './data/parts.js';

const DEG = Math.PI / 180;

/* --------------------------------------------------------------- helpers */

class BuildContext {
  constructor() {
    this.geometries = [];
    this.materials = [];
  }

  geo(g) {
    this.geometries.push(g);
    return g;
  }

  mat(m) {
    this.materials.push(m);
    return m;
  }

  dispose() {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    this.geometries.length = 0;
    this.materials.length = 0;
  }
}

function mesh(ctx, geometry, material, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, shadow = true } = {}) {
  const m = new THREE.Mesh(ctx.geo(geometry), material);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = shadow;
  m.receiveShadow = shadow;
  return m;
}

const boxMesh = (ctx, w, h, d, material, opts) => mesh(ctx, new THREE.BoxGeometry(w, h, d), material, opts);
const cylMesh = (ctx, rt, rb, h, seg, material, opts) =>
  mesh(ctx, new THREE.CylinderGeometry(rt, rb, h, seg), material, opts);
const sphMesh = (ctx, r, material, opts) => mesh(ctx, new THREE.SphereGeometry(r, 14, 10), material, opts);
const coneMesh = (ctx, r, h, material, opts) => mesh(ctx, new THREE.ConeGeometry(r, h, 12), material, opts);

/** Small greeble strip used to break up flat armour panels. */
function greebleRow(ctx, count, spacing, size, material, { y = 0, z = 0, axis = 'x' } = {}) {
  const group = new THREE.Group();
  for (let i = 0; i < count; i++) {
    const off = (i - (count - 1) / 2) * spacing;
    const m = boxMesh(ctx, size, size * 0.55, size * 0.35, material, {
      x: axis === 'x' ? off : 0,
      y: axis === 'y' ? off + y : y,
      z
    });
    group.add(m);
  }
  return group;
}

/* -------------------------------------------------------------- materials */

function makeMaterials(ctx, colors) {
  const std = (hex, opts = {}) =>
    ctx.mat(
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(hex),
        metalness: opts.metalness ?? 0.62,
        roughness: opts.roughness ?? 0.42,
        flatShading: opts.flat ?? false,
        emissive: new THREE.Color(opts.emissive ?? 0x000000),
        emissiveIntensity: opts.emissiveIntensity ?? 1
      })
    );

  const glow = ctx.mat(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(colors.glow),
      emissive: new THREE.Color(colors.glow),
      emissiveIntensity: 2.2,
      metalness: 0.1,
      roughness: 0.35,
      toneMapped: true
    })
  );

  return {
    primary: std(colors.primary, { metalness: 0.55, roughness: 0.45 }),
    secondary: std(colors.secondary, { metalness: 0.68, roughness: 0.38 }),
    accent: std(colors.accent, { metalness: 0.75, roughness: 0.3 }),
    frame: std(colors.frame, { metalness: 0.9, roughness: 0.35 }),
    dark: std(0x14181f, { metalness: 0.85, roughness: 0.5 }),
    glass: ctx.mat(
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(colors.glow),
        emissive: new THREE.Color(colors.glow),
        emissiveIntensity: 1.4,
        metalness: 0.2,
        roughness: 0.12,
        transparent: true,
        opacity: 0.85
      })
    ),
    glow
  };
}

/* ------------------------------------------------------------------ head */

function buildHead(ctx, part, M) {
  const g = part.geo;
  const group = new THREE.Group();

  const skull = boxMesh(ctx, g.width, g.height, g.depth, M.primary);
  group.add(skull);

  // jaw / chin block
  group.add(boxMesh(ctx, g.width * 0.72, g.height * 0.34, g.depth * 0.8, M.frame, { y: -g.height * 0.52 }));

  // visor
  if (g.visor === 'wide') {
    group.add(boxMesh(ctx, g.width * 0.94, g.height * 0.24, 0.1, M.glass, { y: g.height * 0.06, z: -g.depth * 0.5 }));
  } else if (g.visor === 'twin') {
    group.add(boxMesh(ctx, g.width * 0.26, g.height * 0.2, 0.1, M.glass, { x: -g.width * 0.24, y: g.height * 0.08, z: -g.depth * 0.5 }));
    group.add(boxMesh(ctx, g.width * 0.26, g.height * 0.2, 0.1, M.glass, { x: g.width * 0.24, y: g.height * 0.08, z: -g.depth * 0.5 }));
  } else {
    group.add(cylMesh(ctx, g.width * 0.15, g.width * 0.15, 0.12, 12, M.glass, { y: g.height * 0.06, z: -g.depth * 0.5, rx: Math.PI / 2 }));
  }

  // crest
  if (g.crest === 'antenna') {
    group.add(cylMesh(ctx, 0.03, 0.05, g.height * 1.5, 6, M.accent, { y: g.height * 1.0, z: g.depth * 0.1 }));
    group.add(sphMesh(ctx, 0.07, M.glow, { y: g.height * 1.75, z: g.depth * 0.1 }));
  } else if (g.crest === 'fin') {
    group.add(boxMesh(ctx, 0.1, g.height * 0.5, g.depth * 0.75, M.accent, { y: g.height * 0.62 }));
    group.add(boxMesh(ctx, g.width * 0.9, 0.1, 0.16, M.accent, { y: g.height * 0.34, z: -g.depth * 0.46 }));
  } else {
    group.add(boxMesh(ctx, 0.12, g.height * 0.42, 0.5, M.accent, { x: -g.width * 0.4, y: g.height * 0.5, z: -0.05, rz: 18 * DEG }));
    group.add(boxMesh(ctx, 0.12, g.height * 0.42, 0.5, M.accent, { x: g.width * 0.4, y: g.height * 0.5, z: -0.05, rz: -18 * DEG }));
    group.add(boxMesh(ctx, g.width * 0.5, 0.14, 0.28, M.accent, { y: g.height * 0.42, z: -g.depth * 0.42 }));
  }

  // ear vents
  group.add(cylMesh(ctx, 0.13, 0.13, 0.14, 8, M.secondary, { x: -g.width * 0.55, rz: Math.PI / 2 }));
  group.add(cylMesh(ctx, 0.13, 0.13, 0.14, 8, M.secondary, { x: g.width * 0.55, rz: Math.PI / 2 }));

  return group;
}

/* ----------------------------------------------------------------- torso */

function buildTorso(ctx, part, M, glowRefs) {
  const g = part.geo;
  const group = new THREE.Group();

  // chest
  const chest = boxMesh(ctx, g.width, g.height * 0.62, g.depth, M.primary, { y: g.height * 0.2 });
  group.add(chest);

  // chest bevel plate
  group.add(boxMesh(ctx, g.width * 0.78, g.height * 0.3, g.depth * 0.3, M.secondary, { y: g.height * 0.3, z: -g.depth * 0.52 }));

  // cockpit block
  group.add(boxMesh(ctx, g.width * 0.34, g.height * 0.24, 0.2, M.glass, { y: g.height * 0.24, z: -g.depth * 0.62 }));

  // waist
  group.add(boxMesh(ctx, g.width * 0.62, g.height * 0.24, g.depth * 0.78, M.frame, { y: -g.height * 0.2 }));

  // hip skirt armour
  const skirtY = -g.height * 0.4;
  group.add(boxMesh(ctx, g.width * 0.42, g.height * 0.34, g.depth * 0.32, M.primary, { x: -g.width * 0.32, y: skirtY, z: -g.depth * 0.24, rz: 6 * DEG }));
  group.add(boxMesh(ctx, g.width * 0.42, g.height * 0.34, g.depth * 0.32, M.primary, { x: g.width * 0.32, y: skirtY, z: -g.depth * 0.24, rz: -6 * DEG }));
  group.add(boxMesh(ctx, g.width * 0.5, g.height * 0.3, g.depth * 0.28, M.secondary, { y: skirtY, z: g.depth * 0.34 }));

  // shoulder mounts
  const shoulderY = g.height * 0.42;
  const shoulderX = g.width * 0.5 + g.shoulders * 0.32;
  for (const sx of [-1, 1]) {
    const pad = boxMesh(ctx, g.shoulders * 0.8, g.shoulders * 0.62, g.depth * 0.95, M.primary, {
      x: sx * shoulderX,
      y: shoulderY,
      rz: sx * -7 * DEG
    });
    group.add(pad);
    group.add(boxMesh(ctx, g.shoulders * 0.2, g.shoulders * 0.24, g.depth * 0.5, M.accent, {
      x: sx * (shoulderX + g.shoulders * 0.34),
      y: shoulderY + g.shoulders * 0.16,
      rz: sx * -7 * DEG
    }));
  }

  // radiator vents on the back
  for (let i = 0; i < g.vents; i++) {
    const vy = g.height * 0.42 - i * (g.height * 0.16);
    const vent = boxMesh(ctx, g.width * 0.55, g.height * 0.05, 0.1, M.glow, { y: vy, z: g.depth * 0.51 });
    group.add(vent);
    glowRefs.push(vent);
  }

  // neck
  group.add(cylMesh(ctx, 0.24, 0.28, g.height * 0.16, 10, M.frame, { y: g.height * 0.54 }));

  return { group, shoulderX, shoulderY, neckY: g.height * 0.6, height: g.height };
}

/* ------------------------------------------------------------------ arms */

function buildArm(ctx, part, M, side, glowRefs) {
  const g = part.geo;
  const shoulder = new THREE.Group();

  // shoulder ball
  shoulder.add(sphMesh(ctx, g.thickness * 0.78, M.frame));
  // shoulder pad
  shoulder.add(
    boxMesh(ctx, g.shoulderPad, g.shoulderPad * 0.82, g.shoulderPad * 1.05, M.primary, {
      x: side * g.shoulderPad * 0.34,
      y: g.shoulderPad * 0.16
    })
  );

  const upperLen = g.length * 0.46;
  const upper = boxMesh(ctx, g.thickness, upperLen, g.thickness, M.secondary, { y: -upperLen * 0.5 });
  shoulder.add(upper);

  const elbow = new THREE.Group();
  elbow.position.y = -upperLen;
  shoulder.add(elbow);
  elbow.add(cylMesh(ctx, g.thickness * 0.52, g.thickness * 0.52, g.thickness * 1.12, 10, M.frame, { rz: Math.PI / 2 }));

  const foreLen = g.length * 0.54;
  elbow.add(boxMesh(ctx, g.thickness * 1.06, foreLen, g.thickness * 1.02, M.primary, { y: -foreLen * 0.5 }));
  // forearm vernier
  const vern = boxMesh(ctx, g.thickness * 0.4, foreLen * 0.3, 0.08, M.glow, { x: side * g.thickness * 0.56, y: -foreLen * 0.5, z: 0 });
  elbow.add(vern);
  glowRefs.push(vern);

  const hand = new THREE.Group();
  hand.position.y = -foreLen;
  elbow.add(hand);
  hand.add(boxMesh(ctx, g.thickness * 0.9, g.thickness * 0.78, g.thickness * 0.9, M.frame));

  return { shoulder, elbow, hand, upperLen, foreLen };
}

/* ------------------------------------------------------------------ legs */

function buildLeg(ctx, part, M, side, glowRefs) {
  const g = part.geo;
  const t = g.thickness;
  const thighLen = g.height * 0.5;
  const shinLen = g.height * 0.56;
  const footH = 0.42;

  const hip = new THREE.Group();
  hip.add(sphMesh(ctx, t * 0.66, M.frame));

  const thigh = boxMesh(ctx, t, thighLen, t * 1.05, M.secondary, { y: -thighLen * 0.5 });
  hip.add(thigh);

  // thigh armour plate
  hip.add(boxMesh(ctx, t * 1.24, thighLen * 0.6, t * 0.5, M.primary, { y: -thighLen * 0.42, z: -t * 0.5 }));

  const knee = new THREE.Group();
  knee.position.y = -thighLen;
  hip.add(knee);
  knee.add(cylMesh(ctx, t * 0.56, t * 0.56, t * 1.2, 10, M.frame, { rz: Math.PI / 2 }));
  knee.add(boxMesh(ctx, t * 0.9, t * 0.7, t * 0.4, M.accent, { z: -t * 0.72 }));

  const shin = boxMesh(ctx, t * 1.05, shinLen, t * 1.05, M.primary, { y: -shinLen * 0.5 });
  knee.add(shin);

  if (g.style === 'heavy') {
    // calf armour skirt + hip stabiliser
    knee.add(boxMesh(ctx, t * 1.5, shinLen * 0.7, t * 0.55, M.secondary, { y: -shinLen * 0.45, z: t * 0.6 }));
    hip.add(boxMesh(ctx, t * 0.55, thighLen * 0.5, t * 0.55, M.primary, { x: side * t * 0.85, y: -thighLen * 0.3 }));
  } else if (g.style === 'reverse') {
    // digitigrade: extra rear thruster shin pod
    const pod = boxMesh(ctx, t * 0.7, shinLen * 0.4, t * 0.7, M.secondary, { y: -shinLen * 0.25, z: t * 0.75 });
    knee.add(pod);
  }

  const ankle = new THREE.Group();
  ankle.position.y = -shinLen;
  knee.add(ankle);
  ankle.add(cylMesh(ctx, t * 0.42, t * 0.42, t * 0.9, 8, M.frame, { rz: Math.PI / 2 }));

  const footLen = g.style === 'reverse' ? g.footWidth * 1.65 : g.footWidth * 1.3;
  const foot = boxMesh(ctx, g.footWidth, footH, footLen, M.primary, { y: -footH * 0.5 - 0.05, z: -footLen * 0.16 });
  ankle.add(foot);
  ankle.add(boxMesh(ctx, g.footWidth * 0.7, footH * 0.6, footLen * 0.34, M.accent, { y: -footH * 0.5, z: -footLen * 0.52 }));

  // ankle thruster
  const thruster = cylMesh(ctx, t * 0.3, t * 0.36, 0.28, 10, M.glow, { y: -0.05, z: footLen * 0.42, rx: 20 * DEG });
  ankle.add(thruster);
  glowRefs.push(thruster);

  const hipHeight = thighLen + shinLen + footH + 0.05;
  return { hip, knee, ankle, thighLen, shinLen, hipHeight, thruster };
}

/* -------------------------------------------------------------- backpack */

function buildBackpack(ctx, part, M, glowRefs, thrusterRefs) {
  const group = new THREE.Group();
  const style = part.geo.style;

  const core = boxMesh(ctx, 1.5, 1.15, 0.62, M.secondary);
  group.add(core);

  if (style === 'wings') {
    for (const s of [-1, 1]) {
      const wing = new THREE.Group();
      wing.position.set(s * 0.78, 0.16, 0.1);
      wing.rotation.z = s * -22 * DEG;
      wing.rotation.y = s * 16 * DEG;
      wing.add(boxMesh(ctx, 0.34, 1.9, 0.42, M.primary, { y: 0.55 }));
      wing.add(boxMesh(ctx, 0.22, 1.0, 0.3, M.accent, { y: 1.45 }));
      const nozzle = cylMesh(ctx, 0.2, 0.26, 0.5, 10, M.glow, { y: -0.42, z: 0.12, rx: 12 * DEG });
      wing.add(nozzle);
      glowRefs.push(nozzle);
      thrusterRefs.push(nozzle);
      group.add(wing);
    }
  } else if (style === 'pod') {
    for (const s of [-1, 1]) {
      const pod = boxMesh(ctx, 0.66, 0.9, 0.86, M.primary, { x: s * 0.92, y: 0.28, z: 0.12, rz: s * -8 * DEG });
      group.add(pod);
      // launch tubes
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 2; c++) {
          group.add(
            cylMesh(ctx, 0.09, 0.09, 0.12, 8, M.dark, {
              x: s * 0.92 + (c - 0.5) * 0.28,
              y: 0.62 - r * 0.24,
              z: 0.5,
              rx: Math.PI / 2
            })
          );
        }
      }
    }
    const n = cylMesh(ctx, 0.16, 0.2, 0.36, 10, M.glow, { y: -0.62, z: 0.1 });
    group.add(n);
    glowRefs.push(n);
    thrusterRefs.push(n);
  } else {
    // reactor stack
    group.add(cylMesh(ctx, 0.42, 0.42, 1.35, 14, M.frame, { x: -0.62, z: 0.22 }));
    group.add(cylMesh(ctx, 0.42, 0.42, 1.35, 14, M.frame, { x: 0.62, z: 0.22 }));
    const ring1 = cylMesh(ctx, 0.46, 0.46, 0.14, 14, M.glow, { x: -0.62, y: 0.25, z: 0.22 });
    const ring2 = cylMesh(ctx, 0.46, 0.46, 0.14, 14, M.glow, { x: 0.62, y: 0.25, z: 0.22 });
    group.add(ring1, ring2);
    glowRefs.push(ring1, ring2);
    for (const s of [-1, 1]) {
      const n = cylMesh(ctx, 0.18, 0.24, 0.42, 10, M.glow, { x: s * 0.62, y: -0.82, z: 0.22 });
      group.add(n);
      glowRefs.push(n);
      thrusterRefs.push(n);
    }
  }

  return group;
}

/* --------------------------------------------------------------- weapons */

/**
 * Build a hand-held weapon. Barrel points along -Z; `muzzle` marks the tip.
 * @returns {{group: THREE.Group, muzzle: THREE.Object3D, blade: THREE.Object3D|null}}
 */
function buildWeapon(ctx, part, M, glowRefs) {
  const group = new THREE.Group();
  const muzzle = new THREE.Object3D();
  let blade = null;
  const g = part.geo;
  const style = g.style;

  const beamMat = ctx.mat(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(part.tracer.color),
      emissive: new THREE.Color(part.tracer.color),
      emissiveIntensity: 2.4,
      roughness: 0.25,
      metalness: 0.1,
      transparent: true,
      opacity: 0.92
    })
  );

  if (style === 'none') {
    return { group, muzzle, blade: null };
  }

  if (style === 'blade') {
    // hilt
    group.add(cylMesh(ctx, 0.11, 0.13, 0.7, 10, M.frame, { rx: Math.PI / 2 }));
    group.add(boxMesh(ctx, 0.42, 0.14, 0.16, M.accent, { z: -0.34 }));
    // energy blade
    blade = mesh(ctx, new THREE.BoxGeometry(0.16, 0.05, g.length), beamMat, { z: -g.length * 0.5 - 0.4, shadow: false });
    blade.castShadow = false;
    group.add(blade);
    const tip = mesh(ctx, new THREE.ConeGeometry(0.14, 0.5, 8), beamMat, { z: -g.length - 0.62, rx: -Math.PI / 2, shadow: false });
    group.add(tip);
    glowRefs.push(blade, tip);
    muzzle.position.set(0, 0, -g.length * 0.55);
    group.add(muzzle);
    return { group, muzzle, blade };
  }

  if (style === 'shield') {
    group.add(boxMesh(ctx, 1.5, g.length, 0.16, M.primary, { z: -0.42, y: -0.2 }));
    group.add(boxMesh(ctx, 1.0, g.length * 0.36, 0.1, M.accent, { z: -0.52, y: 0.5 }));
    group.add(boxMesh(ctx, 0.24, g.length * 0.9, 0.12, M.secondary, { z: -0.52, y: -0.2 }));
    const strip = boxMesh(ctx, 1.2, 0.09, 0.06, M.glow, { z: -0.55, y: -0.86 });
    group.add(strip);
    glowRefs.push(strip);
    group.add(cylMesh(ctx, 0.1, 0.1, 0.5, 8, M.frame, { z: -0.16, rx: Math.PI / 2 }));
    muzzle.position.set(0, -0.2, -0.6);
    group.add(muzzle);
    return { group, muzzle, blade: null };
  }

  if (style === 'pod') {
    group.add(boxMesh(ctx, 1.1, 0.95, 1.25, M.primary, { z: -0.4 }));
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 2; c++) {
        group.add(
          cylMesh(ctx, 0.16, 0.16, 0.16, 10, M.dark, {
            x: (c - 0.5) * 0.44,
            y: (r - 0.5) * 0.44,
            z: -1.02,
            rx: Math.PI / 2
          })
        );
      }
    }
    group.add(cylMesh(ctx, 0.1, 0.1, 0.5, 8, M.frame, { z: 0.16, rx: Math.PI / 2 }));
    muzzle.position.set(0, 0, -1.15);
    group.add(muzzle);
    return { group, muzzle, blade: null };
  }

  // generic gun body
  const len = g.length;
  const bulk = g.bulk;
  group.add(boxMesh(ctx, bulk * 1.5, bulk * 1.6, len * 0.52, M.secondary, { z: -len * 0.16 }));
  group.add(boxMesh(ctx, bulk * 1.1, bulk * 1.0, len * 0.28, M.frame, { z: len * 0.2 }));
  // grip
  group.add(boxMesh(ctx, bulk * 0.6, bulk * 1.2, bulk * 0.7, M.frame, { y: -bulk * 1.2, z: 0.02 }));

  if (style === 'rifle') {
    group.add(cylMesh(ctx, bulk * 0.34, bulk * 0.42, len * 0.62, 12, M.primary, { z: -len * 0.6, rx: Math.PI / 2 }));
    const coil = cylMesh(ctx, bulk * 0.5, bulk * 0.5, 0.14, 12, M.glow, { z: -len * 0.42, rx: Math.PI / 2 });
    group.add(coil);
    glowRefs.push(coil);
    group.add(boxMesh(ctx, bulk * 0.3, bulk * 0.5, len * 0.3, M.accent, { y: bulk * 0.9, z: -len * 0.2 }));
  } else if (style === 'smg') {
    group.add(boxMesh(ctx, bulk * 0.8, bulk * 0.8, len * 0.5, M.primary, { z: -len * 0.52 }));
    const coil = boxMesh(ctx, bulk * 0.9, 0.08, len * 0.34, M.glow, { y: bulk * 0.42, z: -len * 0.44 });
    group.add(coil);
    glowRefs.push(coil);
  } else if (style === 'cannon') {
    group.add(cylMesh(ctx, bulk * 0.4, bulk * 0.46, len * 0.66, 12, M.frame, { z: -len * 0.56, rx: Math.PI / 2 }));
    group.add(cylMesh(ctx, bulk * 0.56, bulk * 0.56, 0.22, 12, M.accent, { z: -len * 0.86, rx: Math.PI / 2 }));
    // ammo drum
    group.add(cylMesh(ctx, bulk * 0.78, bulk * 0.78, bulk * 0.7, 14, M.primary, { y: -bulk * 0.3, z: len * 0.06, rz: Math.PI / 2 }));
  } else if (style === 'rail') {
    group.add(boxMesh(ctx, bulk * 0.34, bulk * 0.34, len * 0.8, M.frame, { x: -bulk * 0.5, z: -len * 0.42 }));
    group.add(boxMesh(ctx, bulk * 0.34, bulk * 0.34, len * 0.8, M.frame, { x: bulk * 0.5, z: -len * 0.42 }));
    for (let i = 0; i < 4; i++) {
      const ring = boxMesh(ctx, bulk * 1.5, bulk * 0.22, 0.12, M.glow, { z: -len * 0.2 - i * len * 0.16 });
      group.add(ring);
      glowRefs.push(ring);
    }
    group.add(boxMesh(ctx, bulk * 0.5, bulk * 0.9, len * 0.24, M.accent, { y: bulk * 1.0, z: -len * 0.1 }));
  } else if (style === 'shotgun') {
    group.add(cylMesh(ctx, bulk * 0.5, bulk * 0.56, len * 0.5, 12, M.primary, { z: -len * 0.5, rx: Math.PI / 2 }));
    group.add(cylMesh(ctx, bulk * 0.66, bulk * 0.66, 0.2, 12, M.accent, { z: -len * 0.72, rx: Math.PI / 2 }));
    group.add(boxMesh(ctx, bulk * 0.9, bulk * 0.4, len * 0.3, M.frame, { y: -bulk * 0.7, z: -len * 0.36 }));
  }

  muzzle.position.set(0, 0, -len * 0.88);
  group.add(muzzle);
  return { group, muzzle, blade: null };
}

/* ------------------------------------------------------------ main build */

/**
 * Assemble a complete mech.
 * @param {object} loadout slot ids + colors
 * @returns {object} mech handle with animation + teardown helpers
 */
export function buildMech(loadout) {
  const ctx = new BuildContext();
  const colors = { ...loadout.colors };
  const M = makeMaterials(ctx, colors);
  const glowRefs = [];
  const thrusterRefs = [];

  const parts = resolveLoadout(loadout);
  const stats = computeStats(loadout);

  const root = new THREE.Group();
  root.name = 'mech';

  // ---- legs decide the hip height, everything else stacks on top
  const legL = buildLeg(ctx, parts.legs, M, -1, glowRefs);
  const legR = buildLeg(ctx, parts.legs, M, 1, glowRefs);
  const hipHeight = legL.hipHeight;

  const pelvis = new THREE.Group();
  pelvis.position.y = hipHeight;
  root.add(pelvis);

  const hipWidth = parts.torso.geo.width * 0.3 + parts.legs.geo.thickness * 0.45;
  legL.hip.position.set(-hipWidth, 0, 0);
  legR.hip.position.set(hipWidth, 0, 0);
  pelvis.add(legL.hip, legR.hip);

  // pelvis block
  pelvis.add(boxMesh(ctx, hipWidth * 2.0, 0.5, parts.torso.geo.depth * 0.7, M.frame, { y: 0.12 }));

  // ---- torso
  const torsoBuild = buildTorso(ctx, parts.torso, M, glowRefs);
  const torso = new THREE.Group();
  torso.position.y = parts.torso.geo.height * 0.5 + 0.18;
  torso.add(torsoBuild.group);
  pelvis.add(torso);

  // ---- head
  const headGroup = buildHead(ctx, parts.head, M);
  const neck = new THREE.Group();
  neck.position.y = torsoBuild.neckY + parts.head.geo.height * 0.42;
  neck.add(headGroup);
  torso.add(neck);

  // ---- arms
  const armL = buildArm(ctx, parts.arms, M, -1, glowRefs);
  const armR = buildArm(ctx, parts.arms, M, 1, glowRefs);
  armL.shoulder.position.set(-torsoBuild.shoulderX, torsoBuild.shoulderY, 0);
  armR.shoulder.position.set(torsoBuild.shoulderX, torsoBuild.shoulderY, 0);
  torso.add(armL.shoulder, armR.shoulder);

  // ---- backpack
  const backpack = buildBackpack(ctx, parts.backpack, M, glowRefs, thrusterRefs);
  backpack.position.set(0, parts.torso.geo.height * 0.28, parts.torso.geo.depth * 0.62);
  torso.add(backpack);

  // ---- weapons in hands
  const weaponR = buildWeapon(ctx, parts.rightWeapon, M, glowRefs);
  const weaponL = buildWeapon(ctx, parts.leftWeapon, M, glowRefs);
  weaponR.group.position.set(0, -parts.arms.geo.thickness * 0.2, -0.1);
  weaponL.group.position.set(0, -parts.arms.geo.thickness * 0.2, -0.1);
  // A blade points down the hand's -Z; tilt it up so it reads as "held", not "dragged".
  if (parts.rightWeapon.kind === 'melee') weaponR.group.rotation.x = 0.5;
  if (parts.leftWeapon.kind === 'melee') weaponL.group.rotation.x = 0.5;
  armR.hand.add(weaponR.group);
  armL.hand.add(weaponL.group);

  // ---- shoulder ordnance from the backpack
  let shoulderMuzzle = null;
  if (parts.backpack.shoulderWeapon) {
    shoulderMuzzle = new THREE.Object3D();
    shoulderMuzzle.position.set(0, parts.torso.geo.height * 0.55, -0.2);
    torso.add(shoulderMuzzle);
  }

  // measurements used by the simulation
  const totalHeight = hipHeight + parts.torso.geo.height * 1.05 + parts.head.geo.height * 1.4;
  const radius = Math.max(1.15, parts.torso.geo.width * 0.62);

  const mech = {
    root,
    ctx,
    parts,
    stats,
    materials: M,
    glowRefs,
    thrusterRefs,
    colors,
    bones: {
      pelvis,
      torso,
      neck,
      head: headGroup,
      armL,
      armR,
      legL,
      legR,
      backpack
    },
    weapons: {
      right: { part: parts.rightWeapon, muzzle: weaponR.muzzle, blade: weaponR.blade, group: weaponR.group },
      left: { part: parts.leftWeapon, muzzle: weaponL.muzzle, blade: weaponL.blade, group: weaponL.group },
      shoulder: parts.backpack.shoulderWeapon
        ? { part: getPart(parts.backpack.shoulderWeapon), muzzle: shoulderMuzzle, blade: null, group: backpack }
        : null
    },
    hipHeight,
    height: totalHeight,
    radius,
    // animation state
    _phase: Math.random() * Math.PI * 2,
    _armPitch: 0,
    _armPitchL: 0,
    _recoil: 0,
    _recoilL: 0,
    _meleeT: 0,
    _meleeSide: 'left',
    _flash: 0,
    _boost: 0
  };

  setBladeVisible(mech, 'left', parts.leftWeapon.kind === 'melee');
  setBladeVisible(mech, 'right', parts.rightWeapon.kind === 'melee');

  root.userData.mech = mech;
  return mech;
}

function setBladeVisible(mech, side, visible) {
  const w = mech.weapons[side];
  if (w && w.blade) w.blade.visible = visible;
}

/** Recolour an existing mech without rebuilding geometry. */
export function applyColors(mech, colors) {
  mech.colors = { ...colors };
  mech.materials.primary.color.set(colors.primary);
  mech.materials.secondary.color.set(colors.secondary);
  mech.materials.accent.color.set(colors.accent);
  mech.materials.frame.color.set(colors.frame);
  mech.materials.glow.color.set(colors.glow);
  mech.materials.glow.emissive.set(colors.glow);
  mech.materials.glass.color.set(colors.glow);
  mech.materials.glass.emissive.set(colors.glow);
}

/** Free every geometry and material this mech owns. */
export function disposeMech(mech) {
  if (!mech) return;
  if (mech.root.parent) mech.root.parent.remove(mech.root);
  mech.ctx.dispose();
}

/** Kick the recoil animation on one arm. */
export function punchRecoil(mech, side, amount = 1) {
  if (side === 'left') mech._recoilL = Math.min(1.4, mech._recoilL + amount);
  else mech._recoil = Math.min(1.4, mech._recoil + amount);
}

/** Start a melee swing animation. */
export function playMelee(mech, side = 'left') {
  mech._meleeT = 1;
  mech._meleeSide = side;
}

/** Flash the frame white briefly when hit. */
export function flashDamage(mech, amount = 1) {
  mech._flash = Math.min(1, mech._flash + amount);
}

/**
 * Advance procedural animation.
 * @param {object} mech
 * @param {number} dt seconds
 * @param {object} s  { speed, grounded, boosting, aimPitch, strafe, airborneT }
 */
export function updateMech(mech, dt, s) {
  const b = mech.bones;
  const speed = s.speed || 0;
  const grounded = s.grounded !== false;
  const boosting = !!s.boosting;
  const maxSpeed = Math.max(4, mech.stats.walkSpeed);
  const norm = Math.min(1.4, speed / maxSpeed);

  // ---- gait
  const stepRate = 2.1 + norm * 5.2;
  if (grounded) mech._phase += dt * stepRate * (0.35 + norm);
  else mech._phase += dt * 1.4;

  const swing = grounded ? Math.sin(mech._phase) * (0.12 + norm * 0.62) : 0;
  const lift = grounded ? Math.max(0, Math.cos(mech._phase)) * norm * 0.35 : 0;
  const liftB = grounded ? Math.max(0, -Math.cos(mech._phase)) * norm * 0.35 : 0;

  if (grounded) {
    b.legL.hip.rotation.x = swing;
    b.legR.hip.rotation.x = -swing;
    b.legL.knee.rotation.x = lift * 1.5 + 0.06;
    b.legR.knee.rotation.x = liftB * 1.5 + 0.06;
    b.legL.ankle.rotation.x = -swing * 0.35 - lift * 0.5;
    b.legR.ankle.rotation.x = swing * 0.35 - liftB * 0.5;
  } else {
    // airborne tuck
    const tuck = 0.55;
    b.legL.hip.rotation.x = THREE.MathUtils.lerp(b.legL.hip.rotation.x, -0.28, dt * 6);
    b.legR.hip.rotation.x = THREE.MathUtils.lerp(b.legR.hip.rotation.x, -0.18, dt * 6);
    b.legL.knee.rotation.x = THREE.MathUtils.lerp(b.legL.knee.rotation.x, tuck, dt * 6);
    b.legR.knee.rotation.x = THREE.MathUtils.lerp(b.legR.knee.rotation.x, tuck * 0.75, dt * 6);
    b.legL.ankle.rotation.x = THREE.MathUtils.lerp(b.legL.ankle.rotation.x, -0.3, dt * 6);
    b.legR.ankle.rotation.x = THREE.MathUtils.lerp(b.legR.ankle.rotation.x, -0.3, dt * 6);
  }

  // ---- body bob and lean
  const bob = grounded ? Math.sin(mech._phase * 2) * norm * 0.09 : 0;
  b.pelvis.position.y = mech.hipHeight + bob;
  const lean = THREE.MathUtils.clamp(norm * 0.16 + (boosting ? 0.14 : 0), 0, 0.34);
  b.torso.rotation.x = THREE.MathUtils.lerp(b.torso.rotation.x, lean, dt * 5);
  b.torso.rotation.z = THREE.MathUtils.lerp(b.torso.rotation.z, -(s.strafe || 0) * 0.1, dt * 5);
  b.neck.rotation.x = THREE.MathUtils.lerp(b.neck.rotation.x, -lean * 0.7 - (s.aimPitch || 0) * 0.35, dt * 6);

  // ---- arm aiming: shoulders raise toward the aim vector
  mech._recoil = Math.max(0, mech._recoil - dt * 5.5);
  mech._recoilL = Math.max(0, mech._recoilL - dt * 5.5);

  const aim = s.aimPitch || 0;
  const rIsMelee = mech.weapons.right.part.kind === 'melee';
  const lIsMelee = mech.weapons.left.part.kind === 'melee';
  const lIsShield = mech.weapons.left.part.kind === 'shield';
  const lIsNone = mech.weapons.left.part.kind === 'none';

  const targetR = rIsMelee ? -0.35 : -Math.PI / 2 + aim * 0.9;
  let targetL;
  if (lIsMelee) targetL = -0.35;
  else if (lIsShield) targetL = -0.95;
  else if (lIsNone) targetL = -0.12 + swing * 0.4;
  else targetL = -Math.PI / 2 + aim * 0.9;

  b.armR.shoulder.rotation.x = THREE.MathUtils.lerp(b.armR.shoulder.rotation.x, targetR + mech._recoil * 0.4, dt * 11);
  b.armR.shoulder.rotation.z = THREE.MathUtils.lerp(b.armR.shoulder.rotation.z, rIsMelee ? -0.18 : 0.1, dt * 9);
  b.armR.elbow.rotation.x = THREE.MathUtils.lerp(b.armR.elbow.rotation.x, rIsMelee ? -0.45 : -0.12 - mech._recoil * 0.3, dt * 11);

  b.armL.shoulder.rotation.x = THREE.MathUtils.lerp(b.armL.shoulder.rotation.x, targetL + mech._recoilL * 0.4, dt * 11);
  b.armL.shoulder.rotation.z = THREE.MathUtils.lerp(b.armL.shoulder.rotation.z, lIsShield ? 0.5 : -0.1, dt * 9);
  b.armL.elbow.rotation.x = THREE.MathUtils.lerp(
    b.armL.elbow.rotation.x,
    lIsShield ? -1.15 : lIsMelee ? -0.45 : -0.12 - mech._recoilL * 0.3,
    dt * 11
  );

  // ---- melee swing overrides the arm pose while it plays
  if (mech._meleeT > 0) {
    mech._meleeT = Math.max(0, mech._meleeT - dt * 3.2);
    const t = 1 - mech._meleeT; // 0 -> 1
    const swingCurve = Math.sin(Math.min(1, t * 1.15) * Math.PI);
    const arm = mech._meleeSide === 'left' ? b.armL : b.armR;
    const dir = mech._meleeSide === 'left' ? 1 : -1;
    arm.shoulder.rotation.x = -2.5 * swingCurve + 0.4;
    arm.shoulder.rotation.z = dir * (1.5 - swingCurve * 2.6);
    arm.elbow.rotation.x = -0.5 - swingCurve * 0.5;
    b.torso.rotation.y = dir * swingCurve * 0.45;
  } else {
    b.torso.rotation.y = THREE.MathUtils.lerp(b.torso.rotation.y, 0, dt * 8);
  }

  // ---- thruster / glow response
  const targetBoost = boosting ? 1 : grounded ? 0.12 : 0.45;
  mech._boost = THREE.MathUtils.lerp(mech._boost, targetBoost, dt * 9);
  const gi = 1.1 + mech._boost * 3.4;
  mech.materials.glow.emissiveIntensity = gi;
  for (const t of mech.thrusterRefs) {
    const sc = 0.75 + mech._boost * 1.5;
    t.scale.set(1, sc, 1);
  }

  // ---- damage flash
  if (mech._flash > 0) {
    mech._flash = Math.max(0, mech._flash - dt * 3.4);
    const f = mech._flash;
    mech.materials.primary.emissive.setRGB(f * 0.9, f * 0.35, f * 0.35);
    mech.materials.secondary.emissive.setRGB(f * 0.7, f * 0.25, f * 0.25);
  }
}

/** Reset the pose to a neutral garage stance. */
export function poseGarage(mech, t) {
  const b = mech.bones;
  const idle = Math.sin(t * 1.1) * 0.02;
  b.pelvis.position.y = mech.hipHeight + idle * 0.6;
  b.legL.hip.rotation.set(0.03, 0, 0.02);
  b.legR.hip.rotation.set(-0.03, 0, -0.02);
  b.legL.knee.rotation.x = 0.08;
  b.legR.knee.rotation.x = 0.08;
  b.legL.ankle.rotation.x = -0.08;
  b.legR.ankle.rotation.x = -0.08;
  b.torso.rotation.set(idle * 0.4, 0, 0);
  b.neck.rotation.set(-idle, Math.sin(t * 0.42) * 0.14, 0);

  const lKind = mech.weapons.left.part.kind;
  const rKind = mech.weapons.right.part.kind;
  b.armR.shoulder.rotation.set(-0.12 + idle * 0.5, 0, 0.13);
  b.armR.elbow.rotation.x = rKind === 'none' ? -0.1 : -0.32;
  b.armL.shoulder.rotation.set(-0.12 + idle * 0.5, 0, -0.13);
  b.armL.elbow.rotation.x = lKind === 'shield' ? -0.55 : lKind === 'none' ? -0.1 : -0.32;

  mech.materials.glow.emissiveIntensity = 2.0 + Math.sin(t * 2.2) * 0.35;
}
