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
      roughness: 0.35
    })
  );

  return {
    primary: std(colors.primary, { metalness: 0.55, roughness: 0.45 }),
    secondary: std(colors.secondary, { metalness: 0.68, roughness: 0.38 }),
    accent: std(colors.accent, { metalness: 0.75, roughness: 0.3 }),
    frame: std(colors.frame, { metalness: 0.9, roughness: 0.35 }),
    dark: std(0x14181f, { metalness: 0.85, roughness: 0.5 }),
    rubber: std(0x191c22, { metalness: 0.2, roughness: 0.9 }),
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

  group.add(boxMesh(ctx, g.width, g.height, g.depth, M.primary));
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
  } else if (g.crest === 'vfin') {
    // the classic split V, plus a central sensor jewel
    for (const s of [-1, 1]) {
      group.add(boxMesh(ctx, 0.09, g.height * 0.95, 0.2, M.accent, {
        x: s * g.width * 0.3,
        y: g.height * 0.75,
        z: -g.depth * 0.15,
        rz: s * 34 * DEG
      }));
    }
    group.add(boxMesh(ctx, g.width * 0.34, g.height * 0.16, 0.14, M.accent, { y: g.height * 0.5, z: -g.depth * 0.48 }));
    group.add(sphMesh(ctx, 0.09, M.glow, { y: g.height * 0.52, z: -g.depth * 0.56 }));
  } else if (g.crest === 'array') {
    // fan of jamming rods, longest at the centre
    for (let i = -2; i <= 2; i++) {
      const len = g.height * (1.5 - Math.abs(i) * 0.28);
      group.add(cylMesh(ctx, 0.025, 0.04, len, 5, M.accent, {
        x: i * g.width * 0.19,
        y: g.height * 0.5 + len * 0.5,
        z: g.depth * 0.12,
        rz: i * 11 * DEG
      }));
      group.add(sphMesh(ctx, 0.05, M.glow, {
        x: i * g.width * 0.19 + Math.sin(i * 11 * DEG) * len,
        y: g.height * 0.5 + len,
        z: g.depth * 0.12
      }));
    }
    group.add(boxMesh(ctx, g.width * 1.05, 0.12, 0.22, M.frame, { y: g.height * 0.5, z: g.depth * 0.12 }));
  } else if (g.crest === 'horns') {
    for (const s of [-1, 1]) {
      group.add(boxMesh(ctx, 0.16, g.height * 0.8, 0.22, M.accent, {
        x: s * g.width * 0.42,
        y: g.height * 0.62,
        z: -g.depth * 0.05,
        rz: s * 26 * DEG
      }));
      group.add(boxMesh(ctx, 0.13, g.height * 0.34, 0.18, M.accent, {
        x: s * g.width * 0.62,
        y: g.height * 0.98,
        z: -g.depth * 0.05,
        rz: s * 52 * DEG
      }));
    }
    group.add(boxMesh(ctx, g.width * 0.44, g.height * 0.3, 0.16, M.accent, { y: g.height * 0.6, z: -g.depth * 0.46 }));
    group.add(sphMesh(ctx, 0.1, M.glow, { y: g.height * 0.66, z: -g.depth * 0.54 }));
  } else if (g.crest === 'scope') {
    group.add(cylMesh(ctx, 0.15, 0.17, g.depth * 1.7, 12, M.frame, { y: g.height * 0.5, z: -g.depth * 0.25, rx: Math.PI / 2 }));
    group.add(cylMesh(ctx, 0.13, 0.13, 0.1, 12, M.glass, { y: g.height * 0.5, z: -g.depth * 1.08, rx: Math.PI / 2 }));
    group.add(boxMesh(ctx, 0.08, 0.5, 0.1, M.accent, { x: g.width * 0.42, y: g.height * 0.75, rz: -14 * DEG }));
  } else {
    group.add(boxMesh(ctx, 0.12, g.height * 0.42, 0.5, M.accent, { x: -g.width * 0.4, y: g.height * 0.5, z: -0.05, rz: 18 * DEG }));
    group.add(boxMesh(ctx, 0.12, g.height * 0.42, 0.5, M.accent, { x: g.width * 0.4, y: g.height * 0.5, z: -0.05, rz: -18 * DEG }));
    group.add(boxMesh(ctx, g.width * 0.5, 0.14, 0.28, M.accent, { y: g.height * 0.42, z: -g.depth * 0.42 }));
  }

  group.add(cylMesh(ctx, 0.13, 0.13, 0.14, 8, M.secondary, { x: -g.width * 0.55, rz: Math.PI / 2 }));
  group.add(cylMesh(ctx, 0.13, 0.13, 0.14, 8, M.secondary, { x: g.width * 0.55, rz: Math.PI / 2 }));

  return group;
}

/* ----------------------------------------------------------------- torso */

function buildTorso(ctx, part, M, glowRefs) {
  const g = part.geo;
  const group = new THREE.Group();

  const chest = boxMesh(ctx, g.width, g.height * 0.62, g.depth, M.primary, { y: g.height * 0.2 });
  group.add(chest);
  group.add(boxMesh(ctx, g.width * 0.78, g.height * 0.3, g.depth * 0.3, M.secondary, { y: g.height * 0.3, z: -g.depth * 0.52 }));
  group.add(boxMesh(ctx, g.width * 0.34, g.height * 0.24, 0.2, M.glass, { y: g.height * 0.24, z: -g.depth * 0.62 }));
  group.add(boxMesh(ctx, g.width * 0.62, g.height * 0.24, g.depth * 0.78, M.frame, { y: -g.height * 0.2 }));

  if (g.faceted) {
    // stealth frame: angled radar-deflecting plates over the chest
    for (const s of [-1, 1]) {
      group.add(boxMesh(ctx, g.width * 0.46, g.height * 0.5, 0.14, M.secondary, {
        x: s * g.width * 0.3,
        y: g.height * 0.26,
        z: -g.depth * 0.55,
        ry: s * 26 * DEG
      }));
    }
  }

  const skirtY = -g.height * 0.4;
  group.add(boxMesh(ctx, g.width * 0.42, g.height * 0.34, g.depth * 0.32, M.primary, { x: -g.width * 0.32, y: skirtY, z: -g.depth * 0.24, rz: 6 * DEG }));
  group.add(boxMesh(ctx, g.width * 0.42, g.height * 0.34, g.depth * 0.32, M.primary, { x: g.width * 0.32, y: skirtY, z: -g.depth * 0.24, rz: -6 * DEG }));
  group.add(boxMesh(ctx, g.width * 0.5, g.height * 0.3, g.depth * 0.28, M.secondary, { y: skirtY, z: g.depth * 0.34 }));

  const shoulderY = g.height * 0.42;
  const shoulderX = g.width * 0.5 + g.shoulders * 0.32;
  for (const sx of [-1, 1]) {
    group.add(boxMesh(ctx, g.shoulders * 0.8, g.shoulders * 0.62, g.depth * 0.95, M.primary, {
      x: sx * shoulderX,
      y: shoulderY,
      rz: sx * -7 * DEG
    }));
    group.add(boxMesh(ctx, g.shoulders * 0.2, g.shoulders * 0.24, g.depth * 0.5, M.accent, {
      x: sx * (shoulderX + g.shoulders * 0.34),
      y: shoulderY + g.shoulders * 0.16,
      rz: sx * -7 * DEG
    }));
  }

  for (let i = 0; i < g.vents; i++) {
    const vy = g.height * 0.42 - i * (g.height * 0.16);
    const vent = boxMesh(ctx, g.width * 0.55, g.height * 0.05, 0.1, M.glow, { y: vy, z: g.depth * 0.51 });
    group.add(vent);
    glowRefs.push(vent);
  }

  group.add(cylMesh(ctx, 0.24, 0.28, g.height * 0.16, 10, M.frame, { y: g.height * 0.54 }));

  return { group, shoulderX, shoulderY, neckY: g.height * 0.6, height: g.height };
}

/* ------------------------------------------------------------------ arms */

function buildArm(ctx, part, M, side, glowRefs) {
  const g = part.geo;
  const shoulder = new THREE.Group();

  shoulder.add(sphMesh(ctx, g.thickness * 0.78, M.frame));
  shoulder.add(
    boxMesh(ctx, g.shoulderPad, g.shoulderPad * 0.82, g.shoulderPad * 1.05, M.primary, {
      x: side * g.shoulderPad * 0.34,
      y: g.shoulderPad * 0.16
    })
  );

  const upperLen = g.length * 0.46;
  shoulder.add(boxMesh(ctx, g.thickness, upperLen, g.thickness, M.secondary, { y: -upperLen * 0.5 }));

  const elbow = new THREE.Group();
  elbow.position.y = -upperLen;
  shoulder.add(elbow);
  elbow.add(cylMesh(ctx, g.thickness * 0.52, g.thickness * 0.52, g.thickness * 1.12, 10, M.frame, { rz: Math.PI / 2 }));

  const foreLen = g.length * 0.54;
  elbow.add(boxMesh(ctx, g.thickness * 1.06, foreLen, g.thickness * 1.02, M.primary, { y: -foreLen * 0.5 }));

  if (g.guard) {
    // forearm shield plate
    elbow.add(boxMesh(ctx, g.thickness * 0.3, foreLen * 1.15, g.thickness * 1.7, M.secondary, {
      x: side * g.thickness * 0.66,
      y: -foreLen * 0.5
    }));
    elbow.add(boxMesh(ctx, g.thickness * 0.16, foreLen * 0.4, g.thickness * 0.5, M.accent, {
      x: side * g.thickness * 0.82,
      y: -foreLen * 0.3
    }));
  }

  const vern = boxMesh(ctx, g.thickness * 0.4, foreLen * 0.3, 0.08, M.glow, { x: side * g.thickness * 0.56, y: -foreLen * 0.5 });
  elbow.add(vern);
  glowRefs.push(vern);

  const hand = new THREE.Group();
  hand.position.y = -foreLen;
  elbow.add(hand);
  hand.add(boxMesh(ctx, g.thickness * 0.9, g.thickness * 0.78, g.thickness * 0.9, M.frame));

  return { shoulder, elbow, hand, upperLen, foreLen };
}

/* ------------------------------------------------------------------ legs */

/** One articulated leg. Used for bipeds (2) and quadrupeds (4). */
function buildLeg(ctx, part, M, side, glowRefs, scale = 1) {
  const g = part.geo;
  const t = g.thickness * scale;
  const thighLen = g.height * 0.5 * scale;
  const shinLen = g.height * 0.56 * scale;
  const footH = 0.42 * scale;

  const hip = new THREE.Group();
  hip.add(sphMesh(ctx, t * 0.66, M.frame));
  hip.add(boxMesh(ctx, t, thighLen, t * 1.05, M.secondary, { y: -thighLen * 0.5 }));
  hip.add(boxMesh(ctx, t * 1.24, thighLen * 0.6, t * 0.5, M.primary, { y: -thighLen * 0.42, z: -t * 0.5 }));

  const knee = new THREE.Group();
  knee.position.y = -thighLen;
  hip.add(knee);
  knee.add(cylMesh(ctx, t * 0.56, t * 0.56, t * 1.2, 10, M.frame, { rz: Math.PI / 2 }));
  knee.add(boxMesh(ctx, t * 0.9, t * 0.7, t * 0.4, M.accent, { z: -t * 0.72 }));
  knee.add(boxMesh(ctx, t * 1.05, shinLen, t * 1.05, M.primary, { y: -shinLen * 0.5 }));

  if (g.style === 'heavy') {
    knee.add(boxMesh(ctx, t * 1.5, shinLen * 0.7, t * 0.55, M.secondary, { y: -shinLen * 0.45, z: t * 0.6 }));
    hip.add(boxMesh(ctx, t * 0.55, thighLen * 0.5, t * 0.55, M.primary, { x: side * t * 0.85, y: -thighLen * 0.3 }));
  } else if (g.style === 'reverse') {
    knee.add(boxMesh(ctx, t * 0.7, shinLen * 0.4, t * 0.7, M.secondary, { y: -shinLen * 0.25, z: t * 0.75 }));
  } else if (g.style === 'quad') {
    knee.add(boxMesh(ctx, t * 1.3, shinLen * 0.45, t * 0.5, M.secondary, { y: -shinLen * 0.3, z: t * 0.55 }));
  }

  const ankle = new THREE.Group();
  ankle.position.y = -shinLen;
  knee.add(ankle);
  ankle.add(cylMesh(ctx, t * 0.42, t * 0.42, t * 0.9, 8, M.frame, { rz: Math.PI / 2 }));

  const footLen = (g.style === 'reverse' ? g.footWidth * 1.65 : g.footWidth * 1.3) * scale;
  const footW = g.footWidth * scale;
  ankle.add(boxMesh(ctx, footW, footH, footLen, M.primary, { y: -footH * 0.5 - 0.05, z: -footLen * 0.16 }));
  ankle.add(boxMesh(ctx, footW * 0.7, footH * 0.6, footLen * 0.34, M.accent, { y: -footH * 0.5, z: -footLen * 0.52 }));

  const thruster = cylMesh(ctx, t * 0.3, t * 0.36, 0.28, 10, M.glow, { y: -0.05, z: footLen * 0.42, rx: 20 * DEG });
  ankle.add(thruster);
  glowRefs.push(thruster);

  const hipHeight = thighLen + shinLen + footH + 0.05;
  return { hip, knee, ankle, thighLen, shinLen, hipHeight, thruster, side };
}

/** Tracked carriage: no articulation, just rolling road wheels. */
function buildTreads(ctx, part, M, glowRefs, wheels) {
  const g = part.geo;
  const group = new THREE.Group();
  const trackLen = g.footWidth * 2.7;
  const trackH = g.height * 0.78;
  const trackW = g.thickness * 1.15;
  const hipHeight = trackH + 0.5;

  for (const side of [-1, 1]) {
    const track = new THREE.Group();
    track.position.set(side * (g.footWidth * 0.8), -hipHeight + trackH * 0.5, 0);
    group.add(track);

    // track body and side skirt
    track.add(boxMesh(ctx, trackW, trackH, trackLen, M.rubber));
    track.add(boxMesh(ctx, trackW * 1.12, trackH * 0.5, trackLen * 0.92, M.primary, { y: trackH * 0.3 }));
    track.add(boxMesh(ctx, trackW * 1.2, trackH * 0.18, trackLen * 0.5, M.accent, { y: trackH * 0.52 }));

    // road wheels, rotated by the animation step
    for (let i = 0; i < 4; i++) {
      const w = cylMesh(ctx, trackH * 0.3, trackH * 0.3, trackW * 1.25, 12, M.frame, {
        z: (i - 1.5) * (trackLen / 4.4),
        y: -trackH * 0.14,
        rz: Math.PI / 2
      });
      track.add(w);
      wheels.push(w);
      const spoke = boxMesh(ctx, trackW * 1.3, trackH * 0.08, trackH * 0.42, M.accent, {
        z: (i - 1.5) * (trackLen / 4.4),
        y: -trackH * 0.14,
        rz: Math.PI / 2
      });
      track.add(spoke);
      wheels.push(spoke);
    }

    const exhaust = cylMesh(ctx, trackW * 0.28, trackW * 0.32, 0.4, 10, M.glow, { y: trackH * 0.15, z: trackLen * 0.52, rx: Math.PI / 2 });
    track.add(exhaust);
    glowRefs.push(exhaust);
  }

  // chassis deck bridging the two tracks
  group.add(boxMesh(ctx, g.footWidth * 1.9, g.height * 0.36, trackLen * 0.66, M.secondary, { y: -hipHeight + trackH + 0.18 }));

  return { group, hipHeight };
}

/** Hover skirt: a floating platform on four vector nozzles. */
function buildHoverSkirt(ctx, part, M, glowRefs, thrusterRefs) {
  const g = part.geo;
  const group = new THREE.Group();
  const hipHeight = g.height * 0.95;
  const bodyY = -hipHeight + g.height * 0.45;

  group.add(cylMesh(ctx, g.footWidth * 1.35, g.footWidth * 1.05, g.height * 0.42, 8, M.primary, { y: bodyY }));
  group.add(cylMesh(ctx, g.footWidth * 1.42, g.footWidth * 1.42, g.height * 0.1, 8, M.accent, { y: bodyY + g.height * 0.2 }));

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const pod = new THREE.Group();
      pod.position.set(sx * g.footWidth * 1.02, bodyY - g.height * 0.12, sz * g.footWidth * 0.82);
      pod.rotation.z = sx * -12 * DEG;
      group.add(pod);
      pod.add(cylMesh(ctx, g.thickness * 0.46, g.thickness * 0.56, g.height * 0.38, 10, M.secondary));
      const nozzle = cylMesh(ctx, g.thickness * 0.38, g.thickness * 0.46, 0.32, 10, M.glow, { y: -g.height * 0.24 });
      pod.add(nozzle);
      glowRefs.push(nozzle);
      thrusterRefs.push(nozzle);
    }
  }

  // ventral glow strip so the float reads at a distance
  const strip = cylMesh(ctx, g.footWidth * 0.95, g.footWidth * 0.95, 0.12, 8, M.glow, { y: bodyY - g.height * 0.24 });
  group.add(strip);
  glowRefs.push(strip);

  return { group, hipHeight };
}

/* -------------------------------------------------------------- backpack */

function buildBackpack(ctx, part, M, glowRefs, thrusterRefs, funnelDocks) {
  const group = new THREE.Group();
  const style = part.geo.style;

  group.add(boxMesh(ctx, 1.5, 1.15, 0.62, M.secondary));

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
      group.add(boxMesh(ctx, 0.66, 0.9, 0.86, M.primary, { x: s * 0.92, y: 0.28, z: 0.12, rz: s * -8 * DEG }));
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 2; c++) {
          group.add(cylMesh(ctx, 0.09, 0.09, 0.12, 8, M.dark, {
            x: s * 0.92 + (c - 0.5) * 0.28, y: 0.62 - r * 0.24, z: 0.5, rx: Math.PI / 2
          }));
        }
      }
    }
    const n = cylMesh(ctx, 0.16, 0.2, 0.36, 10, M.glow, { y: -0.62, z: 0.1 });
    group.add(n);
    glowRefs.push(n);
    thrusterRefs.push(n);
  } else if (style === 'funnel') {
    // a rack of four docking cradles; the bits themselves live in the arena
    group.add(boxMesh(ctx, 1.9, 0.34, 0.7, M.primary, { y: 0.52 }));
    for (let i = 0; i < 4; i++) {
      const x = (i - 1.5) * 0.52;
      group.add(boxMesh(ctx, 0.3, 0.16, 0.62, M.frame, { x, y: 0.72 }));
      const dock = new THREE.Object3D();
      dock.position.set(x, 0.9, 0.1);
      group.add(dock);
      funnelDocks.push(dock);
    }
    const core = cylMesh(ctx, 0.3, 0.3, 0.2, 12, M.glow, { y: 0.05, z: 0.34, rx: Math.PI / 2 });
    group.add(core);
    glowRefs.push(core);
    const n = cylMesh(ctx, 0.17, 0.21, 0.38, 10, M.glow, { y: -0.62, z: 0.1 });
    group.add(n);
    glowRefs.push(n);
    thrusterRefs.push(n);
  } else if (style === 'sentry') {
    // two folded turret platforms in drop cradles, released in the arena
    group.add(boxMesh(ctx, 1.8, 0.5, 0.8, M.primary, { y: 0.42, z: 0.16 }));
    for (const s of [-1, 1]) {
      group.add(boxMesh(ctx, 0.7, 0.72, 0.78, M.frame, { x: s * 0.62, y: 0.06, z: 0.3 }));
      const lamp = cylMesh(ctx, 0.13, 0.13, 0.1, 10, M.glow, { x: s * 0.62, y: 0.06, z: 0.72, rx: Math.PI / 2 });
      group.add(lamp);
      glowRefs.push(lamp);
      const dock = new THREE.Object3D();
      dock.position.set(s * 0.62, 0.06, 0.3);
      group.add(dock);
      funnelDocks.push(dock);
    }
    const n = cylMesh(ctx, 0.17, 0.21, 0.38, 10, M.glow, { y: -0.62, z: 0.1 });
    group.add(n);
    glowRefs.push(n);
    thrusterRefs.push(n);
  } else if (style === 'plating') {
    // no thrusters at all - just layered slab armour over the core
    group.add(boxMesh(ctx, 1.95, 1.55, 0.6, M.primary, { y: 0.08, z: 0.28 }));
    group.add(boxMesh(ctx, 1.6, 1.2, 0.4, M.secondary, { y: 0.12, z: 0.62 }));
    for (const s of [-1, 1]) {
      group.add(boxMesh(ctx, 0.42, 1.9, 0.72, M.primary, { x: s * 1.05, y: 0.1, z: 0.18, rz: s * -7 * DEG }));
      group.add(boxMesh(ctx, 0.2, 0.5, 0.5, M.accent, { x: s * 1.24, y: 0.72, z: 0.18 }));
    }
    for (let i = 0; i < 3; i++) {
      const vent = boxMesh(ctx, 1.2, 0.1, 0.12, M.glow, { y: 0.62 - i * 0.34, z: 0.84 });
      group.add(vent);
      glowRefs.push(vent);
    }
  } else if (style === 'radar') {
    const mast = cylMesh(ctx, 0.09, 0.11, 1.1, 8, M.frame, { y: 0.85, z: 0.1 });
    group.add(mast);
    const dish = new THREE.Group();
    dish.position.set(0, 1.42, 0.1);
    group.add(dish);
    dish.add(boxMesh(ctx, 1.5, 0.09, 0.5, M.primary));
    dish.add(boxMesh(ctx, 1.55, 0.2, 0.1, M.accent, { z: -0.22 }));
    const blip = sphMesh(ctx, 0.11, M.glow, { z: 0.26 });
    dish.add(blip);
    glowRefs.push(blip);
    group.userData.spinner = dish;
    const n = cylMesh(ctx, 0.16, 0.2, 0.36, 10, M.glow, { y: -0.6, z: 0.1 });
    group.add(n);
    glowRefs.push(n);
    thrusterRefs.push(n);
  } else if (style === 'overdrive') {
    group.add(boxMesh(ctx, 1.8, 1.3, 0.9, M.primary, { y: 0.1, z: 0.3 }));
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const nozzle = cylMesh(ctx, 0.28, 0.38, 0.85, 12, M.frame, {
          x: sx * 0.62, y: 0.2 + sy * 0.46, z: 0.86, rx: Math.PI / 2
        });
        group.add(nozzle);
        const flame = cylMesh(ctx, 0.24, 0.3, 0.3, 12, M.glow, {
          x: sx * 0.62, y: 0.2 + sy * 0.46, z: 1.24, rx: Math.PI / 2
        });
        group.add(flame);
        glowRefs.push(flame);
        thrusterRefs.push(flame);
      }
    }
    group.add(boxMesh(ctx, 0.4, 1.5, 0.4, M.accent, { x: -1.0, y: 0.2, z: 0.3 }));
    group.add(boxMesh(ctx, 0.4, 1.5, 0.4, M.accent, { x: 1.0, y: 0.2, z: 0.3 }));
  } else if (style === 'repair') {
    group.add(boxMesh(ctx, 1.7, 1.2, 0.85, M.primary, { y: 0.15, z: 0.25 }));
    for (const s of [-1, 1]) {
      const tank = cylMesh(ctx, 0.3, 0.3, 1.3, 12, M.secondary, { x: s * 0.62, y: 0.2, z: 0.72 });
      group.add(tank);
      const band = cylMesh(ctx, 0.33, 0.33, 0.16, 12, M.glow, { x: s * 0.62, y: 0.55, z: 0.72 });
      group.add(band);
      glowRefs.push(band);
      // spray arm reaching over the shoulder
      group.add(boxMesh(ctx, 0.14, 0.14, 1.0, M.frame, { x: s * 0.62, y: 0.85, z: 0.1, rx: 32 * DEG }));
    }
    const cross = boxMesh(ctx, 0.5, 0.14, 0.1, M.glow, { y: 0.3, z: -0.32 });
    group.add(cross);
    glowRefs.push(cross);
    const cross2 = boxMesh(ctx, 0.14, 0.5, 0.1, M.glow, { y: 0.3, z: -0.32 });
    group.add(cross2);
    glowRefs.push(cross2);
    const n = cylMesh(ctx, 0.15, 0.19, 0.34, 10, M.glow, { y: -0.6, z: 0.1 });
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
 * @returns {{group: THREE.Group, muzzle: THREE.Object3D, blade: THREE.Object3D|null, spinner: THREE.Object3D|null}}
 */
function buildWeapon(ctx, part, M, glowRefs) {
  const group = new THREE.Group();
  const muzzle = new THREE.Object3D();
  const blades = [];
  let spinner = null;
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
    return { group, muzzle, blades, spinner };
  }

  /* ---------------------------------------------------------- melee */
  if (style === 'blade' || style === 'twinblade' || style === 'lance' || style === 'axe' || style === 'whip') {
    group.add(cylMesh(ctx, 0.11, 0.13, 0.7, 10, M.frame, { rx: Math.PI / 2 }));
    group.add(boxMesh(ctx, 0.42, 0.14, 0.16, M.accent, { z: -0.34 }));

    if (style === 'blade') {
      const b = mesh(ctx, new THREE.BoxGeometry(0.16, 0.05, g.length), beamMat, { z: -g.length * 0.5 - 0.4, shadow: false });
      const tip = mesh(ctx, new THREE.ConeGeometry(0.14, 0.5, 8), beamMat, { z: -g.length - 0.62, rx: -Math.PI / 2, shadow: false });
      group.add(b, tip);
      blades.push(b, tip);
    } else if (style === 'twinblade') {
      // two shorter blades splayed from a single grip
      for (const s of [-1, 1]) {
        const b = mesh(ctx, new THREE.BoxGeometry(0.13, 0.05, g.length), beamMat, {
          x: s * 0.16, z: -g.length * 0.5 - 0.35, ry: s * 7 * DEG, shadow: false
        });
        const tip = mesh(ctx, new THREE.ConeGeometry(0.12, 0.42, 8), beamMat, {
          x: s * 0.2, z: -g.length - 0.52, rx: -Math.PI / 2, shadow: false
        });
        group.add(b, tip);
        blades.push(b, tip);
      }
      group.add(boxMesh(ctx, 0.5, 0.12, 0.14, M.accent, { z: -0.2 }));
    } else if (style === 'axe') {
      group.add(cylMesh(ctx, 0.09, 0.09, g.length * 0.7, 8, M.frame, { z: -g.length * 0.35, rx: Math.PI / 2 }));
      const head = boxMesh(ctx, 0.2, 1.5, 0.9, M.secondary, { z: -g.length * 0.66 });
      group.add(head);
      const edge = mesh(ctx, new THREE.BoxGeometry(0.1, 1.7, 0.34), beamMat, { z: -g.length * 0.66 - 0.52, shadow: false });
      group.add(edge);
      blades.push(edge);
      group.add(boxMesh(ctx, 0.16, 0.5, 0.3, M.accent, { z: -g.length * 0.66 + 0.42 }));
    } else if (style === 'whip') {
      // segmented lash: a short haft, then a run of links that fall away in size
      group.add(cylMesh(ctx, 0.14, 0.16, 0.85, 10, M.primary, { z: -0.42, rx: Math.PI / 2 }));
      group.add(cylMesh(ctx, 0.22, 0.22, 0.2, 10, M.accent, { z: -0.9, rx: Math.PI / 2 }));
      const links = 9;
      for (let i = 0; i < links; i++) {
        const t = i / (links - 1);
        const seg = mesh(ctx, new THREE.BoxGeometry(0.16 - t * 0.07, 0.16 - t * 0.07, g.length / links * 0.72), beamMat, {
          x: Math.sin(t * 5.2) * 0.16,
          y: -t * t * 0.5,
          z: -1.05 - t * (g.length - 1.1),
          shadow: false
        });
        group.add(seg);
        blades.push(seg);
      }
      const barb = mesh(ctx, new THREE.ConeGeometry(0.12, 0.44, 8), beamMat, {
        y: -0.52, z: -g.length - 0.1, rx: -Math.PI / 2, shadow: false
      });
      group.add(barb);
      blades.push(barb);
    } else {
      // lance: long solid shaft with an energy spike
      group.add(cylMesh(ctx, 0.14, 0.2, g.length * 0.62, 10, M.primary, { z: -g.length * 0.3, rx: Math.PI / 2 }));
      group.add(cylMesh(ctx, 0.3, 0.3, 0.28, 10, M.accent, { z: -g.length * 0.16, rx: Math.PI / 2 }));
      const spike = mesh(ctx, new THREE.ConeGeometry(0.2, g.length * 0.45, 10), beamMat, {
        z: -g.length * 0.83, rx: -Math.PI / 2, shadow: false
      });
      group.add(spike);
      blades.push(spike);
    }

    for (const b of blades) glowRefs.push(b);
    muzzle.position.set(0, 0, -g.length * 0.55);
    group.add(muzzle);
    return { group, muzzle, blades, spinner };
  }

  /* --------------------------------------------------------- shields */
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
    return { group, muzzle, blades, spinner };
  }

  if (style === 'barrier') {
    // emitter frame projecting a translucent energy pane
    group.add(cylMesh(ctx, 0.12, 0.12, 0.55, 8, M.frame, { z: -0.16, rx: Math.PI / 2 }));
    group.add(boxMesh(ctx, 0.24, g.length * 0.95, 0.2, M.secondary, { z: -0.45, y: -0.2 }));
    for (const s of [-1, 1]) {
      group.add(boxMesh(ctx, 0.16, 0.5, 0.16, M.accent, { x: s * 0.6, z: -0.45, y: -0.2 + s * g.length * 0.3 }));
    }
    const pane = mesh(ctx, new THREE.BoxGeometry(1.7, g.length, 0.06), beamMat, { z: -0.62, y: -0.2, shadow: false });
    pane.material.opacity = 0.4;
    group.add(pane);
    blades.push(pane);
    glowRefs.push(pane);
    muzzle.position.set(0, -0.2, -0.7);
    group.add(muzzle);
    return { group, muzzle, blades, spinner };
  }

  /* -------------------------------------------------------- ordnance */
  if (style === 'pod') {
    group.add(boxMesh(ctx, 1.1, 0.95, 1.25, M.primary, { z: -0.4 }));
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 2; c++) {
        group.add(cylMesh(ctx, 0.16, 0.16, 0.16, 10, M.dark, {
          x: (c - 0.5) * 0.44, y: (r - 0.5) * 0.44, z: -1.02, rx: Math.PI / 2
        }));
      }
    }
    group.add(cylMesh(ctx, 0.1, 0.1, 0.5, 8, M.frame, { z: 0.16, rx: Math.PI / 2 }));
    muzzle.position.set(0, 0, -1.15);
    group.add(muzzle);
    return { group, muzzle, blades, spinner };
  }

  if (style === 'mortar') {
    group.add(boxMesh(ctx, 0.9, 0.5, 1.1, M.frame, { y: -0.3 }));
    group.add(cylMesh(ctx, 0.34, 0.38, g.length, 12, M.primary, { y: 0.42, z: -0.2, rx: -62 * DEG }));
    group.add(cylMesh(ctx, 0.42, 0.42, 0.18, 12, M.accent, { y: 1.32, z: -0.72, rx: -62 * DEG }));
    group.add(boxMesh(ctx, 0.5, 0.5, 0.5, M.secondary, { y: -0.1, z: 0.42 }));
    group.add(cylMesh(ctx, 0.1, 0.1, 0.5, 8, M.frame, { y: -0.55, z: 0.1, rx: Math.PI / 2 }));
    muzzle.position.set(0, 1.4, -0.8);
    group.add(muzzle);
    return { group, muzzle, blades, spinner };
  }

  if (style === 'bazooka') {
    group.add(cylMesh(ctx, 0.36, 0.36, g.length, 14, M.primary, { z: -g.length * 0.3, rx: Math.PI / 2 }));
    group.add(cylMesh(ctx, 0.46, 0.4, 0.5, 14, M.secondary, { z: -g.length * 0.78, rx: Math.PI / 2 }));
    group.add(cylMesh(ctx, 0.44, 0.5, 0.6, 14, M.frame, { z: g.length * 0.2, rx: Math.PI / 2 }));
    group.add(boxMesh(ctx, 0.2, 0.5, 0.7, M.accent, { y: 0.42, z: -g.length * 0.2 }));
    group.add(boxMesh(ctx, 0.3, 0.6, 0.34, M.frame, { y: -0.48, z: 0.05 }));
    const band = cylMesh(ctx, 0.38, 0.38, 0.12, 14, M.glow, { z: -g.length * 0.5, rx: Math.PI / 2 });
    group.add(band);
    glowRefs.push(band);
    muzzle.position.set(0, 0, -g.length * 0.9);
    group.add(muzzle);
    return { group, muzzle, blades, spinner };
  }

  /* ------------------------------------------------------------ guns */
  const len = g.length;
  const bulk = g.bulk;
  group.add(boxMesh(ctx, bulk * 1.5, bulk * 1.6, len * 0.52, M.secondary, { z: -len * 0.16 }));
  group.add(boxMesh(ctx, bulk * 1.1, bulk * 1.0, len * 0.28, M.frame, { z: len * 0.2 }));
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
    group.add(cylMesh(ctx, bulk * 0.78, bulk * 0.78, bulk * 0.7, 14, M.primary, { y: -bulk * 0.3, z: len * 0.06, rz: Math.PI / 2 }));
  } else if (style === 'gatling') {
    // rotating barrel cluster driven by the spin-up animation
    spinner = new THREE.Group();
    spinner.position.set(0, 0, -len * 0.5);
    group.add(spinner);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      spinner.add(cylMesh(ctx, bulk * 0.13, bulk * 0.13, len * 0.72, 8, M.frame, {
        x: Math.cos(a) * bulk * 0.42, y: Math.sin(a) * bulk * 0.42, rx: Math.PI / 2
      }));
    }
    spinner.add(cylMesh(ctx, bulk * 0.6, bulk * 0.6, 0.16, 12, M.accent, { z: -len * 0.34 }));
    group.add(cylMesh(ctx, bulk * 0.85, bulk * 0.85, bulk * 0.9, 14, M.primary, { y: -bulk * 0.5, z: len * 0.1, rz: Math.PI / 2 }));
    const heat = boxMesh(ctx, bulk * 1.2, 0.09, len * 0.3, M.glow, { y: bulk * 0.85, z: -len * 0.12 });
    group.add(heat);
    glowRefs.push(heat);
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
  } else if (style === 'laser') {
    // emitter with a stack of focusing lenses
    group.add(cylMesh(ctx, bulk * 0.5, bulk * 0.56, len * 0.5, 14, M.primary, { z: -len * 0.5, rx: Math.PI / 2 }));
    for (let i = 0; i < 3; i++) {
      const lens = cylMesh(ctx, bulk * (0.62 - i * 0.1), bulk * (0.62 - i * 0.1), 0.1, 14, M.glow, {
        z: -len * (0.42 + i * 0.16), rx: Math.PI / 2
      });
      group.add(lens);
      glowRefs.push(lens);
    }
    group.add(boxMesh(ctx, bulk * 1.3, bulk * 0.35, len * 0.34, M.secondary, { y: bulk * 0.85, z: -len * 0.16 }));
    group.add(boxMesh(ctx, bulk * 1.4, bulk * 0.2, len * 0.2, M.accent, { y: -bulk * 0.9, z: -len * 0.3 }));
  } else if (style === 'sprayer') {
    group.add(cylMesh(ctx, bulk * 0.62, bulk * 0.34, len * 0.42, 12, M.primary, { z: -len * 0.55, rx: Math.PI / 2 }));
    const ring = cylMesh(ctx, bulk * 0.7, bulk * 0.7, 0.12, 12, M.glow, { z: -len * 0.74, rx: Math.PI / 2 });
    group.add(ring);
    glowRefs.push(ring);
    for (const s of [-1, 1]) {
      group.add(cylMesh(ctx, bulk * 0.34, bulk * 0.34, len * 0.55, 10, M.secondary, { x: s * bulk * 0.8, z: len * 0.05 }));
    }
  } else if (style === 'orb') {
    group.add(cylMesh(ctx, bulk * 0.7, bulk * 0.7, len * 0.42, 6, M.primary, { z: -len * 0.5, rx: Math.PI / 2 }));
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const orb = sphMesh(ctx, bulk * 0.24, M.glow, {
        x: Math.cos(a) * bulk * 0.42, y: Math.sin(a) * bulk * 0.42, z: -len * 0.68
      });
      group.add(orb);
      glowRefs.push(orb);
    }
    group.add(boxMesh(ctx, bulk * 1.2, bulk * 0.3, len * 0.3, M.accent, { y: bulk * 0.8, z: -len * 0.2 }));
  }

  muzzle.position.set(0, 0, -len * 0.88);
  group.add(muzzle);
  return { group, muzzle, blades, spinner };
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
  const funnelDocks = [];
  const wheels = [];

  const parts = resolveLoadout(loadout);
  const stats = computeStats(loadout);
  const style = parts.legs.geo.style;
  const locomotion =
    style === 'tread' ? 'tread'
      : style === 'hover' ? 'hover'
        : style === 'quad' ? 'quad'
          : style === 'tripod' ? 'tripod' : 'biped';

  const root = new THREE.Group();
  root.name = 'mech';

  const pelvis = new THREE.Group();
  root.add(pelvis);

  // ---- lower body decides the hip height, everything else stacks on top
  const legs = [];
  let hipHeight;

  if (locomotion === 'tread') {
    const tread = buildTreads(ctx, parts.legs, M, glowRefs, wheels);
    hipHeight = tread.hipHeight;
    pelvis.add(tread.group);
  } else if (locomotion === 'hover') {
    const skirt = buildHoverSkirt(ctx, parts.legs, M, glowRefs, thrusterRefs);
    hipHeight = skirt.hipHeight;
    pelvis.add(skirt.group);
  } else {
    const scale = locomotion === 'quad' ? 0.86 : locomotion === 'tripod' ? 0.92 : 1;
    const count = locomotion === 'quad' ? 4 : locomotion === 'tripod' ? 3 : 2;
    const hipWidth = parts.torso.geo.width * 0.3 + parts.legs.geo.thickness * 0.45;
    for (let i = 0; i < count; i++) {
      if (locomotion === 'tripod') {
        // Two legs forward, one trailing spine. Even thirds of a circle, rotated
        // so the odd leg sits behind the hull rather than under the guns.
        const a = Math.PI + (i * 2 * Math.PI) / 3;
        const x = Math.sin(a) * hipWidth * 1.35;
        const z = Math.cos(a) * parts.torso.geo.depth * 0.95;
        const leg = buildLeg(ctx, parts.legs, M, x < 0 ? -1 : 1, glowRefs, scale);
        leg.hip.position.set(x, 0, z);
        leg.hip.rotation.y = -a + Math.PI;
        // even thirds of the gait cycle keeps two feet planted at all times
        leg.phase = (i * 2 * Math.PI) / 3;
        pelvis.add(leg.hip);
        legs.push(leg);
        continue;
      }
      const side = i % 2 === 0 ? -1 : 1;
      const row = i < 2 ? 1 : -1; // +1 = rear pair for quads
      const leg = buildLeg(ctx, parts.legs, M, side, glowRefs, scale);
      leg.hip.position.set(
        side * hipWidth * (locomotion === 'quad' ? 1.25 : 1),
        0,
        locomotion === 'quad' ? row * parts.torso.geo.depth * 0.8 : 0
      );
      // diagonal gait for four legs, alternating for two
      leg.phase = locomotion === 'quad' ? (i === 0 || i === 3 ? 0 : Math.PI) : side < 0 ? 0 : Math.PI;
      pelvis.add(leg.hip);
      legs.push(leg);
    }
    hipHeight = legs[0].hipHeight;
    pelvis.add(boxMesh(ctx, hipWidth * 2.0, 0.5, parts.torso.geo.depth * 0.7, M.frame, { y: 0.12 }));
    if (locomotion === 'quad') {
      pelvis.add(boxMesh(ctx, hipWidth * 1.4, 0.42, parts.torso.geo.depth * 2.0, M.secondary, { y: 0.05 }));
    } else if (locomotion === 'tripod') {
      pelvis.add(cylMesh(ctx, hipWidth * 1.5, hipWidth * 1.5, 0.46, 6, M.secondary, { y: 0.06 }));
      pelvis.add(cylMesh(ctx, hipWidth * 0.5, hipWidth * 0.72, 0.7, 6, M.glow, { y: -0.24 }));
    }
  }
  pelvis.position.y = hipHeight;

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
  const backpack = buildBackpack(ctx, parts.backpack, M, glowRefs, thrusterRefs, funnelDocks);
  backpack.position.set(0, parts.torso.geo.height * 0.28, parts.torso.geo.depth * 0.62);
  torso.add(backpack);

  // ---- weapons in hands
  const weaponR = buildWeapon(ctx, parts.rightWeapon, M, glowRefs);
  const weaponL = buildWeapon(ctx, parts.leftWeapon, M, glowRefs);
  weaponR.group.position.set(0, -parts.arms.geo.thickness * 0.2, -0.1);
  weaponL.group.position.set(0, -parts.arms.geo.thickness * 0.2, -0.1);
  // A weapon is gripped across the hand, so its barrel starts perpendicular to
  // the arm. Rolling it a quarter turn puts the barrel in line with the arm,
  // which lets a single shoulder angle aim both.
  for (const [part, built] of [[parts.rightWeapon, weaponR], [parts.leftWeapon, weaponL]]) {
    // A blade points down the hand's -Z; tilt it up so it reads as "held", not "dragged".
    built.group.rotation.x = part.kind === 'melee' ? 0.5 : -Math.PI / 2;
  }
  armR.hand.add(weaponR.group);
  armL.hand.add(weaponL.group);

  // ---- shoulder ordnance from the backpack
  let shoulderMuzzle = null;
  if (parts.backpack.shoulderWeapon) {
    shoulderMuzzle = new THREE.Object3D();
    shoulderMuzzle.position.set(0, parts.torso.geo.height * 0.55, -0.2);
    torso.add(shoulderMuzzle);
  }

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
    funnelDocks,
    colors,
    locomotion,
    bones: {
      pelvis,
      torso,
      neck,
      head: headGroup,
      armL,
      armR,
      legs,
      wheels,
      backpack,
      radar: backpack.userData.spinner || null
    },
    weapons: {
      right: { part: parts.rightWeapon, muzzle: weaponR.muzzle, blades: weaponR.blades, group: weaponR.group, spinner: weaponR.spinner },
      left: { part: parts.leftWeapon, muzzle: weaponL.muzzle, blades: weaponL.blades, group: weaponL.group, spinner: weaponL.spinner },
      shoulder: parts.backpack.shoulderWeapon
        ? { part: getPart(parts.backpack.shoulderWeapon), muzzle: shoulderMuzzle, blades: [], group: backpack, spinner: null }
        : null
    },
    hipHeight,
    height: totalHeight,
    radius,
    // animation state
    _phase: Math.random() * Math.PI * 2,
    _recoil: 0,
    _recoilL: 0,
    _meleeT: 0,
    _meleeSide: 'left',
    _flash: 0,
    _boost: 0,
    _spin: 0,
    _lean: 0
  };

  root.userData.mech = mech;
  return mech;
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
  const damped = amount * (1 - (mech.stats.recoilDamp || 0));
  if (side === 'left') mech._recoilL = Math.min(1.4, mech._recoilL + damped);
  else mech._recoil = Math.min(1.4, mech._recoil + damped);
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

/** Drive the gatling barrel spin from the arena's spin-up state. */
export function setSpin(mech, amount) {
  mech._spin = amount;
}

/**
 * Advance procedural animation.
 * @param {object} mech
 * @param {number} dt seconds
 * @param {object} s  { speed, grounded, boosting, aimPitch, strafe }
 */
export function updateMech(mech, dt, s) {
  const b = mech.bones;
  const speed = s.speed || 0;
  const grounded = s.grounded !== false;
  const boosting = !!s.boosting;
  const maxSpeed = Math.max(4, mech.stats.walkSpeed);
  const norm = Math.min(1.4, speed / maxSpeed);
  const loco = mech.locomotion;

  /* ---------------------------------------------------------- lower body */
  if (loco === 'tread') {
    // wheels roll at ground speed; the hull squats under acceleration
    const roll = (speed / 1.4) * dt;
    for (const w of b.wheels) w.rotation.y += roll;
    mech._lean = THREE.MathUtils.lerp(mech._lean, norm * 0.06, dt * 4);
    b.pelvis.position.y = mech.hipHeight;
    b.pelvis.rotation.x = -mech._lean;
    b.pelvis.rotation.z = THREE.MathUtils.lerp(b.pelvis.rotation.z, -(s.strafe || 0) * 0.05, dt * 4);
  } else if (loco === 'hover') {
    // constant float with a slow bob and a bank into the drift
    mech._phase += dt * (1.4 + norm * 1.6);
    b.pelvis.position.y = mech.hipHeight + Math.sin(mech._phase) * 0.16;
    b.pelvis.rotation.x = THREE.MathUtils.lerp(b.pelvis.rotation.x, -norm * 0.13, dt * 4);
    b.pelvis.rotation.z = THREE.MathUtils.lerp(b.pelvis.rotation.z, -(s.strafe || 0) * 0.22, dt * 4);
  } else {
    const stepRate = 2.1 + norm * 5.2;
    if (grounded) mech._phase += dt * stepRate * (0.35 + norm);
    else mech._phase += dt * 1.4;

    const amp = loco === 'quad' ? 0.45 : 0.62;
    for (const leg of b.legs) {
      const ph = mech._phase + leg.phase;
      if (grounded) {
        const swing = Math.sin(ph) * (0.12 + norm * amp);
        const lift = Math.max(0, Math.cos(ph)) * norm * 0.35;
        leg.hip.rotation.x = swing;
        leg.knee.rotation.x = lift * 1.5 + 0.06;
        leg.ankle.rotation.x = -swing * 0.35 - lift * 0.5;
      } else {
        leg.hip.rotation.x = THREE.MathUtils.lerp(leg.hip.rotation.x, -0.24, dt * 6);
        leg.knee.rotation.x = THREE.MathUtils.lerp(leg.knee.rotation.x, 0.55, dt * 6);
        leg.ankle.rotation.x = THREE.MathUtils.lerp(leg.ankle.rotation.x, -0.3, dt * 6);
      }
    }
    const bob = grounded ? Math.sin(mech._phase * 2) * norm * (loco === 'quad' ? 0.05 : 0.09) : 0;
    b.pelvis.position.y = mech.hipHeight + bob;
    b.pelvis.rotation.set(0, 0, 0);
  }

  /* -------------------------------------------------------------- torso */
  const aim = s.aimPitch || 0;
  const lean = THREE.MathUtils.clamp(norm * 0.16 + (boosting ? 0.14 : 0), 0, 0.34);
  b.torso.rotation.x = THREE.MathUtils.lerp(b.torso.rotation.x, loco === 'tread' ? lean * 0.4 : lean, dt * 5);
  b.torso.rotation.z = THREE.MathUtils.lerp(b.torso.rotation.z, -(s.strafe || 0) * 0.1, dt * 5);
  b.neck.rotation.x = THREE.MathUtils.lerp(b.neck.rotation.x, -lean * 0.7 + aim * 0.45, dt * 6);

  if (b.radar) b.radar.rotation.y += dt * 2.4;

  /* --------------------------------------------------------------- arms */
  mech._recoil = Math.max(0, mech._recoil - dt * 5.5);
  mech._recoilL = Math.max(0, mech._recoilL - dt * 5.5);

  const kindR = mech.weapons.right.part.kind;
  const kindL = mech.weapons.left.part.kind;
  const rIsMelee = kindR === 'melee';
  const lIsMelee = kindL === 'melee';
  const lIsShield = kindL === 'shield';
  const lIsNone = kindL === 'none';

  // Shoulder pitch convention: the arm hangs along -Y, so rotating +PI/2 about
  // X points it down the mech's forward axis. Adding the aim angle then tracks
  // the target through the full vertical range, straight down included.
  const aimed = Math.PI / 2 + aim;
  const targetR = rIsMelee ? -0.35 : aimed;
  let targetL;
  if (lIsMelee) targetL = -0.35;
  else if (lIsShield) targetL = Math.PI / 2 - 0.3;
  else if (lIsNone) targetL = -0.12 + Math.sin(mech._phase) * 0.3;
  else targetL = aimed;

  b.armR.shoulder.rotation.x = THREE.MathUtils.lerp(b.armR.shoulder.rotation.x, targetR - mech._recoil * 0.4, dt * 11);
  b.armR.shoulder.rotation.z = THREE.MathUtils.lerp(b.armR.shoulder.rotation.z, rIsMelee ? -0.18 : 0.1, dt * 9);
  b.armR.elbow.rotation.x = THREE.MathUtils.lerp(b.armR.elbow.rotation.x, rIsMelee ? -0.45 : -0.12 - mech._recoil * 0.3, dt * 11);

  b.armL.shoulder.rotation.x = THREE.MathUtils.lerp(b.armL.shoulder.rotation.x, targetL - mech._recoilL * 0.4, dt * 11);
  b.armL.shoulder.rotation.z = THREE.MathUtils.lerp(b.armL.shoulder.rotation.z, lIsShield ? 0.5 : -0.1, dt * 9);
  b.armL.elbow.rotation.x = THREE.MathUtils.lerp(
    b.armL.elbow.rotation.x,
    lIsShield ? -1.15 : lIsMelee ? -0.45 : -0.12 - mech._recoilL * 0.3,
    dt * 11
  );

  // melee swing overrides the arm pose while it plays
  if (mech._meleeT > 0) {
    mech._meleeT = Math.max(0, mech._meleeT - dt * 3.2);
    const t = 1 - mech._meleeT;
    const swingCurve = Math.sin(Math.min(1, t * 1.15) * Math.PI);
    const arm = mech._meleeSide === 'left' ? b.armL : b.armR;
    const dir = mech._meleeSide === 'left' ? 1 : -1;
    const part = mech.weapons[mech._meleeSide].part;
    if (part.geo && part.geo.style === 'lance') {
      // lances thrust rather than sweep
      arm.shoulder.rotation.x = -1.5 - swingCurve * 0.35;
      arm.shoulder.rotation.z = dir * 0.1;
      arm.elbow.rotation.x = -0.9 + swingCurve * 0.85;
      b.torso.rotation.y = dir * swingCurve * 0.12;
    } else {
      arm.shoulder.rotation.x = -2.5 * swingCurve + 0.4;
      arm.shoulder.rotation.z = dir * (1.5 - swingCurve * 2.6);
      arm.elbow.rotation.x = -0.5 - swingCurve * 0.5;
      b.torso.rotation.y = dir * swingCurve * 0.45;
    }
  } else {
    b.torso.rotation.y = THREE.MathUtils.lerp(b.torso.rotation.y, 0, dt * 8);
  }

  // gatling barrels
  for (const key of ['right', 'left']) {
    const w = mech.weapons[key];
    if (w.spinner) w.spinner.rotation.z += dt * (2 + mech._spin * 46);
  }

  /* ------------------------------------------------------ glow response */
  const targetBoost = boosting ? 1 : grounded ? 0.12 : 0.45;
  mech._boost = THREE.MathUtils.lerp(mech._boost, targetBoost, dt * 9);
  mech.materials.glow.emissiveIntensity = 1.1 + mech._boost * 3.4;
  const hoverIdle = loco === 'hover' ? 0.55 : 0;
  for (const t of mech.thrusterRefs) {
    t.scale.set(1, 0.75 + Math.max(mech._boost, hoverIdle) * 1.5, 1);
  }

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

  if (mech.locomotion === 'hover') {
    b.pelvis.position.y = mech.hipHeight + Math.sin(t * 1.3) * 0.12;
    b.pelvis.rotation.set(0, 0, Math.sin(t * 0.7) * 0.03);
  } else if (mech.locomotion === 'tread') {
    b.pelvis.position.y = mech.hipHeight;
    b.pelvis.rotation.set(0, 0, 0);
    for (const w of b.wheels) w.rotation.y += 0.0015;
  } else {
    b.pelvis.position.y = mech.hipHeight + idle * 0.6;
    b.pelvis.rotation.set(0, 0, 0);
    for (const leg of b.legs) {
      leg.hip.rotation.set(leg.side * 0.03, 0, leg.side * 0.02);
      leg.knee.rotation.x = 0.08;
      leg.ankle.rotation.x = -0.08;
    }
  }

  b.torso.rotation.set(idle * 0.4, 0, 0);
  b.neck.rotation.set(-idle, Math.sin(t * 0.42) * 0.14, 0);
  if (b.radar) b.radar.rotation.y += 0.012;

  // A gun's barrel now runs along the arm, so a fully lowered arm would point
  // it at the floor. Ranged hands rest a little forward instead.
  const lKind = mech.weapons.left.part.kind;
  const rKind = mech.weapons.right.part.kind;
  const restAngle = (kind) => (kind === 'melee' || kind === 'none' ? -0.12 : 0.6);
  b.armR.shoulder.rotation.set(restAngle(rKind) + idle * 0.5, 0, 0.13);
  b.armR.elbow.rotation.x = rKind === 'none' ? -0.1 : -0.32;
  b.armL.shoulder.rotation.set(restAngle(lKind) + idle * 0.5, 0, -0.13);
  b.armL.elbow.rotation.x = lKind === 'shield' ? -0.55 : lKind === 'none' ? -0.1 : -0.32;

  for (const key of ['right', 'left']) {
    const w = mech.weapons[key];
    if (w.spinner) w.spinner.rotation.z += 0.004;
  }

  mech.materials.glow.emissiveIntensity = 2.0 + Math.sin(t * 2.2) * 0.35;
}
