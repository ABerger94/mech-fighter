# MECH FIGHTER

A complete 3D browser game where you design, build, paint and fight with custom
mech suits. Built with Vite, vanilla JavaScript modules and Three.js. No art
assets: every mech, weapon and arena prop is generated procedurally from
primitives at runtime, and all sound is synthesised with the Web Audio API.

![screens](https://img.shields.io/badge/stack-Vite%20%2B%20Three.js-4de1ff)

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
```

```bash
npm run build      # production bundle in dist/
npm run preview    # serve the production build on :4173
```

## Deploy to Vercel

The repository ships a `vercel.json` configured for a static Vite build.

```bash
npx vercel          # preview deployment
npx vercel --prod   # production deployment
```

Importing the repository from the Vercel dashboard also works with no extra
configuration: the framework is detected as Vite, the build command is
`npm run build` and the output directory is `dist`.

## How to play

| Input | Action |
| --- | --- |
| `W` `A` `S` `D` | Walk and strafe |
| Mouse | Aim; the frame turns to follow the camera |
| `Space` | Jump, hold to hover on thrusters |
| `Shift` | Quick-boost dash |
| Left mouse | Fire the right-hand weapon |
| Right mouse | Fire the left-hand weapon, swing a blade, or brace a shield |
| `F` | Fire backpack ordnance (Hornet Pod only) |
| `R` | Reload both arms |
| `Esc` | Pause and release the mouse |

Center an enemy in the reticle and it turns red: that is a soft lock, and shots
are led onto the target while it holds. Energy powers thrusters and beam
weapons; ballistic weapons use magazines instead. A frame heavier than its legs'
load rating loses speed, thrust and turn rate, so the garage's weight bar is the
real constraint on a build.

Matches last three minutes. If neither frame is destroyed, the pilot with the
higher remaining armour percentage wins.

## Building a mech

Seven slots, each changing the derived stats:

- **Head** — sensor range and lock-on speed
- **Torso** — the bulk of your armour, energy capacity and damage resistance
- **Arms** — weapon spread, melee power and reload speed
- **Legs** — load capacity, walk speed, boost and turn rate
- **Backpack** — thrusters, an auxiliary reactor, or a missile rack
- **Right / left hand** — nine weapons including beam rifles, a railgun, a
  shotgun, homing missile pods, a plasma blade and a tower shield

Five armour channels are paintable, with six preset schemes. The build, its
paint and the chosen difficulty persist in `localStorage`.

## Project layout

```
index.html            Static markup for every screen and the HUD
vercel.json           Static deployment config
src/
  main.js             Entry point and the TITLE/GARAGE/ARENA/RESULT state machine
  garage.js           Build screen: preview, part browser, paint shop, stat panel
  arena.js            Combat sim: physics, weapons, projectiles, damage, enemy AI
  renderer.js         WebGL renderer, both environments, lighting, camera rigs
  mech.js             Procedural mech assembly and skeletal animation
  effects.js          Pooled particles, shockwaves, flashes and dynamic lights
  input.js            Keyboard, mouse and pointer-lock handling
  hud.js              Combat HUD bindings
  audio.js            Procedural Web Audio sound effects
  data/parts.js       Part catalogue, stat derivation, enemy presets
  style.css           All styling
```

### Notes on the simulation

- Mechs are vertical capsules resolved against axis-aligned boxes and cylinders,
  and can stand on top of any cover in the arena.
- Projectiles sweep as segments and are tested against both the world (analytic
  ray/box and ray/cylinder) and enemy capsules, so nothing tunnels at railgun
  speeds.
- The enemy AI cycles between engaging at its weapon's preferred range,
  flanking when line of sight is broken, withdrawing while reloading or out of
  energy, and charging when it carries a blade. Its aim error grows with range
  and shrinks with difficulty.
