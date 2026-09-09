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

Works on desktop and on phones and tablets; the game picks the control scheme
from the device and switches live if you start tapping a touchscreen.

### Desktop

| Input | Action |
| --- | --- |
| `W` `A` `S` `D` | Walk and strafe |
| Mouse | Aim through a near-vertical arc; the frame turns to follow the camera |
| `Space` | Jump, hold to hover on thrusters |
| `Shift` | Quick-boost dash |
| Left mouse | Fire the right-hand weapon |
| Right mouse | Fire the left-hand weapon, swing a blade, or brace a shield |
| `F` | Fire backpack ordnance, or deploy/recall funnels |
| `R` | Reload both arms |
| `Esc` | Pause and release the mouse |

### Touch

| Input | Action |
| --- | --- |
| Left thumb | Drag anywhere on the left half; a stick appears where you touch |
| Right thumb | Drag anywhere on the right half to aim and turn |
| `FIRE` / `SUB` | Right-hand and left-hand weapons |
| `BOOST` | Hold to jump and hover on thrusters |
| `DASH` | Quick-boost in the direction you are moving |
| `R` / `F` | Reload / backpack ordnance or funnels |
| `II` | Pause |

Rapid tapping will not zoom the page: iOS has ignored `user-scalable=no` since
iOS 10, so double-tap and pinch gestures are cancelled directly on the surfaces
the game drives, while the garage panels keep normal touch scrolling.

On a phone the garage becomes a single column: the parts list and the status
panel slide up as bottom sheets from the bar along the bottom, and the frame
preview keeps the whole screen behind them. Deploying asks for fullscreen and a
landscape lock where the browser allows it, and a prompt appears if you are
holding the device in portrait. Touch devices also render at a lower pixel
ratio and shadow resolution to hold the frame rate.

Center an enemy in the reticle and it turns red: that is a soft lock. While it
holds, every shot is led onto where the target will actually be when it
arrives, solved separately for each weapon: a lobbed mortar shell gets far more
lead than a beam from the other hand, and the solver accounts for the arc, the
target's velocity and its fall. Energy powers thrusters and beam
weapons; ballistic weapons use magazines instead. A frame heavier than its legs'
load rating loses speed, thrust and turn rate, so the garage's weight bar is the
real constraint on a build.

Matches last three minutes. If neither frame is destroyed, the pilot with the
higher remaining armour percentage wins.

Look freely from 84 degrees down to 84 degrees up. Boost above an enemy and
you can aim straight down at it: the shoulder tracks the full arc, so the
weapon points where you are looking rather than stopping short.

### Firing models

Weapons do not all behave the same way, and the HUD tells you which one you are
holding:

- **Charge** — the Longbow rifle winds up while you hold the trigger and fires
  on release for up to 3.4x damage. The charge meter sits under your energy bar.
- **Sustained beam** — the Aurora laser is hitscan: it hits the instant you fire
  and bills your generator per second rather than per shot.
- **Spin-up** — the Gatling Driver starts at a third of its cadence and climbs
  to a wall of lead if you keep the trigger down.
- **Arcing** — the Arc Mortar lobs over cover; the launch angle is solved for
  the point under your reticle, so aim at the target, not above it.
- **Lunging melee** — the Assault Lance throws the whole frame forward behind
  the point, closing about twelve metres on its own.
- **Funnels** — the Vesper backpack carries four autonomous bits. `F` sends them
  out to orbit you and fire on their own; they drain energy while deployed and
  dock themselves when you run dry. The Sentry Deployer uses the same key for
  two gun platforms that plant themselves on the ground instead of orbiting, so
  they keep holding the position after you have left it.
- **Energy drain** — the EMP projector strips the target's generator rather than
  its armour. A frame with no charge cannot boost, jump, block or fire a beam,
  so draining one is how you stop it running away.
- **Proximity fuzes** — flak shells burst when they pass near a frame instead of
  needing a direct hit. Measured against a stationary target at 60 m, a shell
  that misses by 5 m still lands 137 damage over six rounds where an autocannon
  lands none; past about 12 m the burst envelope stops reaching. It is the
  answer to an opponent who lives in the air.
- **Multi-hit melee** — the chain whip resolves four separate links off one
  swing across a 170-degree sweep, so it catches anything that walks through the
  arc rather than only what was in front of you when it started.

## The ladder

You start with 12 parts and one opponent. Every frame you put down releases a
slice of the catalogue, the next opponent, and eventually three more
battlefields, so the roster doubles as the unlock ladder:

| Defeat | Releases |
| --- | --- |
| Trainer Mk-I | 5 parts, and Nemesis RX-7 |
| Nemesis RX-7 | 6 parts, Canyon Ruins, and Bastion HW-3 |
| Bastion HW-3 | 7 parts, and Wraith Spectre |
| Wraith Spectre | 6 parts, Neon City, and Siege Arbiter |
| Siege Arbiter | 8 parts, and Overlord ZX |
| Overlord ZX | 6 parts, and Vesper Twin |
| Vesper Twin | 3 parts, and Citadel Battery |
| Citadel Battery | 5 parts, Slag Foundry, and Revenant |
| Revenant | 3 parts, and Sovereign |
| Sovereign | the last 3 parts |

All 64 parts have exactly one unlock path. Locked entries stay visible in the
garage with the opponent that drops them, your record persists in
`localStorage`, and the pilot record panel can reset it. Picking a random
contract only ever draws from what you have earned.

## Building a mech

Seven slots and 64 parts, each changing the derived stats:

- **Head** (8) — sensor range, lock-on speed, reload assistance, and on the
  Oracle ECM a jamming array that adds to your stealth rating
- **Torso** (8) — the bulk of your armour, energy capacity, damage resistance,
  and on the Phantom and Revenant frames a stealth rating that degrades enemy
  fire control
- **Arms** (8) — weapon spread, melee power, reload speed, forearm guards
- **Legs** (8) — load capacity, walk speed, boost, turn rate, and locomotion
- **Backpack** (9) — thrusters, an auxiliary reactor, a missile rack, a radar
  array, an overdrive booster, a field repair unit, funnel bits, deployable
  sentry turrets, or slabs of bolt-on plating
- **Right / left hand** (23) — beam rifles, a railgun, a charge sniper, a
  gatling, a shotgun, a bazooka, an arcing mortar, a proximity-fuzed flak
  battery, an EMP projector, homing missiles, seeker orbs, a sustained laser, a
  plasma sprayer, five melee weapons and two shields

### Locomotion

Legs are not just a speed stat. Five of the eight move in fundamentally
different ways:

| Legs | Behaviour |
| --- | --- |
| Biped / reverse-joint | Walk, jump, hover on thrusters, quick-boost |
| Arachne quad | Four-legged; huge load budget, steady, poor vertical |
| Tripod siege | Three legs on a turret ring; enormous load, heavy recoil damping |
| Siege treads | Rolls; **cannot jump or hover at all**, but dashes 45% further |
| Glide hover | Permanently floats ~2m; low grip, so it drifts through corners |

Five armour channels are paintable, with eight preset schemes. The build, paint,
battlefield, opponent and difficulty all persist in `localStorage`.

## Battlefields and opponents

Four arenas, each with its own props, palette, lighting and ambient life:

- **Orbital Deck** — Federation test platform. Open sightlines, pillar cover.
- **Canyon Ruins** — sun-blasted rock spires and mesas under a hard warm sun.
- **Neon City** — a tower grid of tight lanes lit magenta and cyan.
- **Slag Foundry** — smelter drums round the rim, two gantry walls across the
  middle, embers drifting off a floor that still glows.

Ten opponents, from the Trainer Mk-I up to the Sovereign, each a full frame
built from the same catalogue you use. They do not just carry different guns —
each has a behaviour profile controlling its preferred engagement band,
aggression, dodging, strafing, airtime, trigger discipline and whether it holds
ground, so they fight differently as well as shooting differently:

| Opponent | How it fights | Measured average range |
| --- | --- | --- |
| Trainer Mk-I | Predictable mid-range sparring | 38 m |
| Nemesis RX-7 | Interceptor; closes hard for the saber | 16 m |
| Bastion HW-3 | Plants on its treads and suppresses; never leaves the ground | 55 m |
| Wraith Spectre | Drifts in to knife range and cuts | 29 m |
| Siege Arbiter | Refuses to be crowded; lobs from distance | 70 m |
| Overlord ZX | Adaptive ace, mixes every stance | 37 m |
| Vesper Twin | Jammer; flanks constantly and drains your generator | 43 m |
| Citadel Battery | Tripod gun platform; never closes, never leaves the ground | 70 m |
| Revenant | Chain-whip rusher that goes berserk when wounded | 23 m |
| Sovereign | Three-phase boss: ranged, then funnels, then the lance | 64 m |

The last two rungs change behaviour mid-match rather than just having more
armour. A preset can carry a list of phases keyed to armour thresholds; crossing
one rewrites the live behaviour profile, announces itself on the killfeed, and
can deploy the frame's funnels. The Revenant drops its limiters at 50% and stops
keeping its distance; the Sovereign opens at 46-88 m with a beam rifle, frees its
funnels at 66%, and commits to the lance inside 8-24 m at 33%.

## Project layout

```
index.html            Static markup for every screen and the HUD
vercel.json           Static deployment config
src/
  main.js             Entry point and the TITLE/GARAGE/ARENA/RESULT state machine
  garage.js           Build screen: preview, part browser, paint shop, stat panel
  arena.js            Combat sim: physics, weapons, projectiles, damage, enemy AI
  renderer.js         WebGL renderer, garage and arena environments, lighting, camera rigs
  mech.js             Procedural mech assembly and skeletal animation
  effects.js          Pooled particles, shockwaves, flashes and dynamic lights
  input.js            Keyboard, mouse and pointer-lock handling
  hud.js              Combat HUD bindings
  progress.js         Unlock ladder derived from the opponents you have beaten
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
  and shrinks with difficulty, and it holds charge weapons, deploys its own
  funnels and refuses to jump on legs that cannot. Multi-phase opponents swap
  that whole profile at fixed armour thresholds.
- Landed shots pulse a hit marker on the crosshair, throttled so a sustained
  laser reads as a pulse rather than a strobe, and incoming damage puts a wedge
  around the reticle pointing back along the line the shot came from, resolved
  into the chase camera's own frame.
- Arenas are built on first use and cached, each with its own effects pool and
  camera rig, so switching battlefields between matches is instant.
- Touch controls drive the same key and mouse state the keyboard and mouse
  would, so the simulation contains no touch-specific branches. Pointer lock is
  the desktop look gate; on touch the look pad stands in for it.
