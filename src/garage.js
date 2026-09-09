/**
 * MECH FIGHTER - the garage.
 *
 * Owns the build screen: a lit 3D bay with an orbitable preview of the current
 * frame, the part browser, the paint shop and the derived stat readout. The
 * loadout it produces is the only thing the arena needs to spawn the player.
 */

import { createGarageEnvironment, OrbitCamera } from './renderer.js';
import { buildMech, disposeMech, applyColors, poseGarage } from './mech.js';
import { ARENAS } from './renderer.js';
import {
  CATALOG,
  SLOT_ORDER,
  SLOT_LABELS,
  COMPARE_KEYS,
  PAINT_SLOTS,
  PAINT_PRESETS,
  DIFFICULTIES,
  ENEMY_PRESETS,
  DEFAULT_LOADOUT,
  TOTAL_PARTS,
  weaponDps,
  getPart,
  computeStats,
  statRows,
  resolveLoadout
} from './data/parts.js';
import { audio } from './audio.js';
import {
  loadProgress,
  resetProgress,
  unlockedParts,
  unlockedOpponents,
  unlockedArenas,
  unlockSource,
  opponentGate,
  arenaGate,
  ladderStatus,
  survivalBest
} from './progress.js';

const STORAGE_KEY = 'mechfighter.build.v2';

/** The two ways to deploy. Survival keeps its own record and its own roster. */
const MODES = [
  { id: 'campaign', label: 'CAMPAIGN', blurb: 'One contract against the opponent you pick. Wins advance the ladder.' },
  {
    id: 'survival',
    label: 'SURVIVAL',
    blurb: 'Endless waves. Every frame you down calls in the next one; the run ends when yours does.'
  }
];

export class Garage {
  /**
   * @param {object} opts { canvas, onDeploy }
   */
  constructor(opts) {
    this.canvas = opts.canvas;
    this.touch = !!opts.touch;
    this.onDeploy = opts.onDeploy || (() => {});

    const env = createGarageEnvironment();
    this.scene = env.scene;
    this.camera = env.camera;
    this.envUpdate = env.update;

    this.orbit = new OrbitCamera(this.camera, this.canvas);
    this.orbit.enabled = false;

    this.progress = loadProgress();
    this._refreshUnlocks();
    this.loadout = this._sanitize(this._load());
    this.difficulty = this.loadout.difficulty || 'veteran';
    this.arena = this.loadout.arena || 'orbital';
    this.opponent = this.loadout.opponent || 'nemesis';
    this.mode = this.loadout.mode === 'survival' ? 'survival' : 'campaign';
    this.activeSlot = 'torso';
    this.mech = null;
    this.time = 0;
    this.visible = false;

    this._cacheDom();
    this._buildTabs();
    this._buildSlotStrip();
    this._buildPaintUi();
    this._buildLadder();
    this._buildMobileBar();
    this._buildDeploymentUi();
    this._buildDifficultyUi();
    this._bindActions();

    this.rebuild();
    this.refreshUi();
  }

  /* ------------------------------------------------------------- state */

  _load() {
    const base = { ...DEFAULT_LOADOUT, colors: { ...DEFAULT_LOADOUT.colors } };
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return base;
      const saved = JSON.parse(raw);
      const out = { ...base, ...saved, colors: { ...base.colors, ...(saved.colors || {}) } };
      // guard against ids removed from the catalogue
      for (const slot of SLOT_ORDER) {
        if (!CATALOG[slot].some((p) => p.id === out[slot])) out[slot] = base[slot];
      }
      if (out.arena !== 'random' && !ARENAS.some((a) => a.id === out.arena)) out.arena = 'orbital';
      if (out.opponent !== 'random' && !ENEMY_PRESETS.some((e) => e.id === out.opponent)) out.opponent = 'nemesis';
      if (!DIFFICULTIES.some((d) => d.id === out.difficulty)) out.difficulty = 'veteran';
      if (out.mode !== 'survival') out.mode = 'campaign';
      return out;
    } catch (err) {
      return base;
    }
  }

  save() {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          ...this.loadout,
          mode: this.mode,
          difficulty: this.difficulty,
          arena: this.arena,
          opponent: this.opponent
        })
      );
    } catch (err) {
      /* storage unavailable (private mode) - the build simply is not persisted */
    }
  }

  getLoadout() {
    return { ...this.loadout, colors: { ...this.loadout.colors } };
  }

  getDifficulty() {
    return this.difficulty;
  }

  /**
   * Everything the arena needs to stage a match. "Random" is resolved here so
   * it can only ever draw from what the pilot has actually earned; the arena
   * itself stages whatever it is told.
   */
  getSettings() {
    const pick = (set, fallback) => {
      const list = [...set];
      return list.length ? list[Math.floor(Math.random() * list.length)] : fallback;
    };
    return {
      mode: this.mode,
      difficulty: this.difficulty,
      arena: this.arena === 'random' ? pick(this.unlockedArenas, 'orbital') : this.arena,
      opponent: this.opponent === 'random' ? pick(this.unlockedOpponents, ENEMY_PRESETS[0].id) : this.opponent
    };
  }

  /** Recompute what the current record makes available. */
  _refreshUnlocks() {
    this.unlockedParts = unlockedParts(this.progress);
    this.unlockedOpponents = unlockedOpponents(this.progress);
    this.unlockedArenas = unlockedArenas(this.progress);
  }

  /** Swap any locked selection back to something the pilot actually owns. */
  _sanitize(loadout) {
    const out = { ...loadout, colors: { ...loadout.colors } };
    for (const slot of SLOT_ORDER) {
      if (this.unlockedParts.has(out[slot])) continue;
      const fallback = CATALOG[slot].find((p) => this.unlockedParts.has(p.id));
      if (fallback) out[slot] = fallback.id;
    }
    if (!this.unlockedArenas.has(this.arena) && this.arena !== 'random') this.arena = 'orbital';
    if (!this.unlockedOpponents.has(this.opponent) && this.opponent !== 'random') {
      this.opponent = ENEMY_PRESETS[0].id;
    }
    return out;
  }

  /**
   * Fold a victory into the record and rebuild everything it opened up.
   * @param {object} progress new state from recordVictory
   */
  applyProgress(progress) {
    this.progress = progress;
    this._refreshUnlocks();
    this.loadout = this._sanitize(this.loadout);
    this._syncLadder();
    this._syncDeployment();
    this.rebuild();
    this.refreshUi();
    this.save();
  }

  _buildLadder() {
    this.dom.ladder.innerHTML = '';
    const bar = document.createElement('div');
    bar.className = 'ladder-bar';
    for (let i = 0; i < ENEMY_PRESETS.length; i++) bar.appendChild(document.createElement('i'));

    const line = document.createElement('div');
    line.className = 'ladder-line';
    const label = document.createElement('span');
    const reset = document.createElement('button');
    reset.className = 'ladder-reset';
    reset.textContent = 'RESET';
    reset.addEventListener('click', () => {
      if (!window.confirm('Erase your record and re-lock every part?')) return;
      audio.uiClick();
      this.applyProgress(resetProgress());
    });
    line.append(label, reset);

    const next = document.createElement('p');
    next.className = 'ladder-next';

    this.dom.ladder.append(bar, line, next);
    this.ladderDom = { bar, label, next };
    this._syncLadder();
  }

  _syncLadder() {
    if (!this.ladderDom) return;
    const status = ladderStatus(this.progress);
    const pips = this.ladderDom.bar.children;
    for (let i = 0; i < ENEMY_PRESETS.length; i++) {
      pips[i].className = this.progress.defeated.includes(ENEMY_PRESETS[i].id) ? 'on' : '';
      pips[i].title = ENEMY_PRESETS[i].name;
    }
    this.ladderDom.label.innerHTML =
      `<b>${status.defeated}/${status.total}</b> FRAMES &middot; <b>${this.unlockedParts.size}/${TOTAL_PARTS}</b> PARTS`;

    const nextFoe = ENEMY_PRESETS.find((e) => !this.progress.defeated.includes(e.id));
    this.ladderDom.next.textContent = nextFoe
      ? `Next: defeat ${nextFoe.name} to unlock ${nextFoe.unlocks.length} more parts.`
      : 'Every frame downed. The whole catalogue is yours.';
  }

  /* --------------------------------------------------------------- DOM */

  _cacheDom() {
    const $ = (id) => document.getElementById(id);
    this.dom = {
      screen: $('screen-garage'),
      tabs: $('garage-tabs'),
      partList: $('part-list'),
      slotStrip: $('slot-strip'),
      statList: $('stat-list'),
      paintList: $('paint-list'),
      presets: $('paint-presets'),
      difficulty: $('difficulty-seg'),
      ladder: $('ladder'),
      mobileBar: $('mobile-bar'),
      leftPanel: document.querySelector('.panel--left'),
      rightPanel: document.querySelector('.panel--right'),
      modeSeg: $('mode-seg'),
      modeNote: $('mode-note'),
      arenaSeg: $('arena-seg'),
      arenaNote: $('arena-note'),
      opponentList: $('opponent-list'),
      nameInput: $('mech-name')
    };
    this.dom.nameInput.value = this.loadout.name;
    this.dom.nameInput.addEventListener('input', () => {
      this.loadout.name = this.dom.nameInput.value.toUpperCase().slice(0, 18) || 'UNNAMED FRAME';
      this.save();
    });
  }

  _buildTabs() {
    this.dom.tabs.innerHTML = '';
    for (const slot of SLOT_ORDER) {
      const b = document.createElement('button');
      b.className = 'tab';
      b.textContent = SLOT_LABELS[slot];
      b.dataset.slot = slot;
      b.addEventListener('click', () => {
        this.activeSlot = slot;
        audio.uiClick();
        this.refreshUi();
      });
      this.dom.tabs.appendChild(b);
    }
  }

  _buildSlotStrip() {
    this.dom.slotStrip.innerHTML = '';
    this.slotChips = {};
    for (const slot of SLOT_ORDER) {
      const chip = document.createElement('button');
      chip.className = 'slot-chip';
      chip.dataset.slot = slot;
      chip.addEventListener('click', () => {
        this.activeSlot = slot;
        audio.uiClick();
        this.refreshUi();
        if (this.touch) this.setSheet('left');
      });
      this.dom.slotStrip.appendChild(chip);
      this.slotChips[slot] = chip;
    }
  }

  _buildPaintUi() {
    this.dom.paintList.innerHTML = '';
    this.paintInputs = {};
    for (const { key, label } of PAINT_SLOTS) {
      const row = document.createElement('div');
      row.className = 'paint-row';

      const lab = document.createElement('label');
      lab.textContent = label;
      lab.htmlFor = `paint-${key}`;

      const input = document.createElement('input');
      input.type = 'color';
      input.id = `paint-${key}`;
      input.value = this.loadout.colors[key];

      const code = document.createElement('span');
      code.className = 'swatch-code';
      code.textContent = this.loadout.colors[key].toUpperCase();

      input.addEventListener('input', () => {
        this.loadout.colors[key] = input.value;
        code.textContent = input.value.toUpperCase();
        if (this.mech) applyColors(this.mech, this.loadout.colors);
        this.save();
      });

      row.append(lab, input, code);
      this.dom.paintList.appendChild(row);
      this.paintInputs[key] = { input, code };
    }

    this.dom.presets.innerHTML = '';
    for (const preset of PAINT_PRESETS) {
      const b = document.createElement('button');
      b.className = 'preset';
      b.title = preset.name;
      for (const key of ['primary', 'secondary', 'accent', 'glow']) {
        const i = document.createElement('i');
        i.style.background = preset.colors[key];
        b.appendChild(i);
      }
      b.addEventListener('click', () => {
        this.loadout.colors = { ...preset.colors };
        if (this.mech) applyColors(this.mech, this.loadout.colors);
        this._syncPaintInputs();
        audio.uiClick();
        this.save();
      });
      this.dom.presets.appendChild(b);
    }
  }

  _syncPaintInputs() {
    for (const { key } of PAINT_SLOTS) {
      const entry = this.paintInputs[key];
      entry.input.value = this.loadout.colors[key];
      entry.code.textContent = this.loadout.colors[key].toUpperCase();
    }
  }

  /**
   * Narrow screens show the two side panels as bottom sheets, one at a time,
   * driven by this bar. On desktop the bar is hidden by CSS and unused.
   */
  _buildMobileBar() {
    this.openSheet = null;
    for (const btn of this.dom.mobileBar.querySelectorAll('button')) {
      btn.addEventListener('click', () => {
        const sheet = btn.dataset.sheet;
        if (sheet === 'deploy') {
          audio.uiConfirm();
          this.setSheet(null);
          this.onDeploy(this.getLoadout(), this.getSettings());
          return;
        }
        audio.uiClick();
        this.setSheet(this.openSheet === sheet ? null : sheet);
      });
    }

    // Tapping or dragging the viewport dismisses an open sheet.
    this.canvas.addEventListener('pointerdown', () => {
      if (this.visible && this.openSheet) this.setSheet(null);
    });
  }

  /** @param {'left'|'right'|null} sheet */
  setSheet(sheet) {
    this.openSheet = sheet;
    this.dom.leftPanel.classList.toggle('is-open', sheet === 'left');
    this.dom.rightPanel.classList.toggle('is-open', sheet === 'right');
    for (const btn of this.dom.mobileBar.querySelectorAll('button')) {
      btn.classList.toggle('is-active', btn.dataset.sheet === sheet);
    }
  }

  _buildDeploymentUi() {
    // mission mode
    this.dom.modeSeg.innerHTML = '';
    this.modeButtons = [];
    for (const opt of MODES) {
      const b = document.createElement('button');
      b.textContent = opt.label;
      b.dataset.id = opt.id;
      b.addEventListener('click', () => {
        audio.uiClick();
        this.mode = opt.id;
        this._syncDeployment();
        this.save();
      });
      this.dom.modeSeg.appendChild(b);
      this.modeButtons.push({ button: b, blurb: opt.blurb });
    }

    // battlefield picker
    this.dom.arenaSeg.innerHTML = '';
    this.arenaButtons = [];
    const arenaOptions = [...ARENAS.map((a) => ({ id: a.id, label: a.name, blurb: a.blurb })),
      { id: 'random', label: 'RANDOM', blurb: 'A battlefield is drawn at deployment.' }];
    for (const opt of arenaOptions) {
      const b = document.createElement('button');
      b.textContent = opt.label;
      b.dataset.id = opt.id;
      b.addEventListener('click', () => {
        audio.uiClick();
        if (opt.id !== 'random' && !this.unlockedArenas.has(opt.id)) {
          const gate = arenaGate(opt.id);
          this.dom.arenaNote.textContent = gate ? `Locked. Defeat ${gate.name} to open this battlefield.` : 'Locked.';
          return;
        }
        this.arena = opt.id;
        this._syncDeployment();
        this.save();
      });
      this.dom.arenaSeg.appendChild(b);
      this.arenaButtons.push({ button: b, blurb: opt.blurb });
    }

    // opponent roster
    this.dom.opponentList.innerHTML = '';
    this.opponentButtons = [];
    const roster = [...ENEMY_PRESETS, {
      id: 'random', name: 'RANDOM CONTRACT', threat: 0,
      blurb: 'An unknown frame is assigned when you deploy.'
    }];
    for (const foe of roster) {
      const b = document.createElement('button');
      b.className = 'opponent';
      b.dataset.id = foe.id;

      const head = document.createElement('div');
      head.className = 'opponent-head';
      const name = document.createElement('span');
      name.className = 'opponent-name';
      name.textContent = foe.name;
      name.dataset.name = foe.name;
      const threat = document.createElement('span');
      threat.className = 'threat';
      for (let i = 1; i <= 6; i++) {
        const pip = document.createElement('i');
        if (i <= foe.threat) pip.className = 'on';
        threat.appendChild(pip);
      }
      head.append(name, threat);

      const blurb = document.createElement('p');
      blurb.className = 'opponent-blurb';
      blurb.textContent = foe.blurb;
      b.append(head, blurb);

      if (foe.id !== 'random') {
        const stats = computeStats(foe);
        const kit = document.createElement('div');
        kit.className = 'opponent-kit';
        const rw = getPart(foe.rightWeapon);
        const lw = getPart(foe.leftWeapon);
        const guns = [rw, lw].filter((w) => w && w.kind !== 'none').map((w) => w.name).join(' / ');
        const armour = Math.round(stats.maxHp * (foe.hpMult || 1));
        kit.textContent = `AR ${armour} · SPD ${stats.walkSpeed.toFixed(1)} · ${guns || 'UNARMED'}`;
        b.appendChild(kit);
      }

      b.addEventListener('click', () => {
        audio.uiClick();
        if (foe.id !== 'random' && !this.unlockedOpponents.has(foe.id)) {
          const gate = opponentGate(foe.id);
          if (gate) blurb.textContent = `Locked. Defeat ${gate.name} first.`;
          return;
        }
        this.opponent = foe.id;
        this._syncDeployment();
        this.save();
      });
      this.dom.opponentList.appendChild(b);
      this.opponentButtons.push(b);
    }

    this._syncDeployment();
  }

  _syncDeployment() {
    const survival = this.mode === 'survival';
    for (const { button, blurb } of this.modeButtons) {
      const active = button.dataset.id === this.mode;
      button.classList.toggle('is-active', active);
      if (active) {
        const best = survivalBest(this.progress, this.difficulty);
        const label = DIFFICULTIES.find((d) => d.id === this.difficulty);
        this.dom.modeNote.textContent = survival && best > 0
          ? `${blurb} Best on ${label ? label.label : this.difficulty}: ${best} ${best === 1 ? 'wave' : 'waves'}.`
          : blurb;
      }
    }
    this.dom.opponentList.classList.toggle('is-disabled', survival);

    for (const { button, blurb } of this.arenaButtons) {
      const id = button.dataset.id;
      const locked = id !== 'random' && !this.unlockedArenas.has(id);
      button.classList.toggle('is-locked', locked);
      const active = id === this.arena;
      button.classList.toggle('is-active', active && !locked);
      if (active && !locked) this.dom.arenaNote.textContent = blurb;
    }
    for (const b of this.opponentButtons) {
      const id = b.dataset.id;
      const locked = id !== 'random' && !this.unlockedOpponents.has(id);
      b.classList.toggle('is-locked', locked && !survival);
      b.classList.toggle('is-active', !survival && id === this.opponent && !locked);
      const beaten = this.progress.defeated.includes(id);
      const mark = b.querySelector('.opponent-name');
      if (mark) mark.textContent = beaten ? `${mark.dataset.name} \u2713` : mark.dataset.name;
    }
  }

  _buildDifficultyUi() {
    this.dom.difficulty.innerHTML = '';
    this.diffButtons = [];
    for (const d of DIFFICULTIES) {
      const b = document.createElement('button');
      b.textContent = d.label;
      b.dataset.id = d.id;
      b.addEventListener('click', () => {
        this.difficulty = d.id;
        audio.uiClick();
        this._syncDifficulty();
        this.save();
      });
      this.dom.difficulty.appendChild(b);
      this.diffButtons.push(b);
    }
    this._syncDifficulty();
  }

  _syncDifficulty() {
    for (const b of this.diffButtons) {
      b.classList.toggle('is-active', b.dataset.id === this.difficulty);
    }
    // the survival record is per difficulty, so the note follows this picker
    if (this.modeButtons) this._syncDeployment();
  }

  _bindActions() {
    this.dom.screen.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === 'randomize') this.randomize();
      else if (action === 'reset-build') this.resetBuild();
      else if (action === 'deploy') {
        audio.uiConfirm();
        this.onDeploy(this.getLoadout(), this.getSettings());
      }
    });
  }

  /* ---------------------------------------------------------- 3D model */

  rebuild() {
    if (this.mech) {
      disposeMech(this.mech);
      this.mech = null;
    }
    this.mech = buildMech(this.loadout);
    this.mech.root.position.set(0, 0, 0);
    this.mech.root.rotation.y = Math.PI;
    this.scene.add(this.mech.root);

    // Frame the whole build with headroom; heavy frames are much taller.
    const h = this.mech.height;
    this.orbit.target.set(0, h * 0.52, 0);
    this.orbit.maxDistance = Math.max(30, h * 4);
    this.orbit.setDistance(h * 2.95);
  }

  /* ---------------------------------------------------------------- UI */

  refreshUi() {
    // tabs
    for (const b of this.dom.tabs.children) {
      b.classList.toggle('is-active', b.dataset.slot === this.activeSlot);
    }

    // slot chips
    const parts = resolveLoadout(this.loadout);
    for (const slot of SLOT_ORDER) {
      const chip = this.slotChips[slot];
      chip.innerHTML = `${SLOT_LABELS[slot]} <b>${parts[slot].name}</b>`;
      chip.classList.toggle('is-active', slot === this.activeSlot);
    }

    this._renderPartList();
    this._renderStats();
    this._syncLadder();
  }

  _renderPartList() {
    const slot = this.activeSlot;
    const list = CATALOG[slot];
    const currentId = this.loadout[slot];
    const current = list.find((p) => p.id === currentId) || list[0];
    const keys = COMPARE_KEYS[slot] || [];

    this.dom.partList.innerHTML = '';
    for (const part of list) {
      const locked = !this.unlockedParts.has(part.id);
      const card = document.createElement('div');
      card.className =
        'part-card' + (part.id === currentId ? ' is-selected' : '') + (locked ? ' is-locked' : '');

      const head = document.createElement('div');
      head.className = 'part-card-head';
      const name = document.createElement('span');
      name.className = 'part-name';
      name.textContent = part.name;
      const cls = document.createElement('span');
      cls.className = 'part-class';
      cls.textContent = part.class;
      head.append(name, cls);

      const desc = document.createElement('p');
      desc.className = 'part-desc';
      desc.textContent = part.desc;

      const stats = document.createElement('div');
      stats.className = 'part-stats';
      for (const [key, label, higherBetter] of keys) {
        const val = part[key] ?? 0;
        const cur = current[key] ?? 0;
        const span = document.createElement('span');
        const b = document.createElement('b');
        b.textContent = formatStat(key, val);
        if (part.id !== currentId && val !== cur) {
          const better = higherBetter ? val > cur : val < cur;
          b.className = better ? 'up' : 'down';
        }
        span.append(`${label} `, b);
        stats.appendChild(span);
      }

      // sustained damage per second, so weapon numbers are comparable at a glance
      if ((slot === 'rightWeapon' || slot === 'leftWeapon') && part.kind !== 'none') {
        const dps = weaponDps(part);
        const span = document.createElement('span');
        const b = document.createElement('b');
        if (part.kind === 'shield') {
          b.textContent = `${Math.round((part.block || 0) * 100)}%`;
          span.append('BLOCK ', b);
        } else {
          b.textContent = String(Math.round(dps));
          span.append('DPS ', b);
        }
        stats.appendChild(span);
      }

      card.append(head, desc, stats);

      if (locked) {
        const gate = unlockSource(part.id);
        const note = document.createElement('div');
        note.className = 'lock-note';
        note.textContent = gate ? `DEFEAT ${gate.name}` : 'LOCKED';
        card.appendChild(note);
        card.addEventListener('click', () => {
          audio.uiClick();
          if (gate) this.dom.arenaNote.textContent = `${part.name} is locked. Defeat ${gate.name} to earn it.`;
        });
      } else {
        card.addEventListener('click', () => this.selectPart(slot, part.id));
      }
      this.dom.partList.appendChild(card);
    }
  }

  _renderStats() {
    const stats = computeStats(this.loadout);
    this.dom.statList.innerHTML = '';

    for (const row of statRows(stats)) {
      const el = document.createElement('div');
      el.className = 'stat-row';

      const label = document.createElement('span');
      label.className = 'stat-label';
      label.textContent = row.label;

      const track = document.createElement('div');
      track.className = 'stat-track';
      const fill = document.createElement('i');
      fill.className = 'stat-fill';
      const pct = Math.min(1, row.max > 0 ? row.value / row.max : 0);
      fill.style.width = `${pct * 100}%`;
      if (row.invert) {
        if (pct > 1 - 1e-6) fill.classList.add('is-bad');
        else if (pct > 0.85) fill.classList.add('is-warn');
      }
      track.appendChild(fill);

      const value = document.createElement('span');
      value.className = 'stat-value';
      value.textContent = row.text;
      if (row.sub) {
        const small = document.createElement('small');
        small.textContent = row.sub;
        value.appendChild(small);
      }

      el.append(label, track, value);
      this.dom.statList.appendChild(el);
    }

    const warn = document.createElement('div');
    warn.className = 'overweight-warn' + (stats.overweight ? '' : ' is-ok');
    warn.textContent = stats.overweight
      ? `OVERWEIGHT by ${stats.weight - stats.load}. Mobility cut to ${Math.round(stats.mobilityFactor * 100)}%. Fit lighter parts or heavier legs.`
      : '';
    this.dom.statList.appendChild(warn);
  }

  /* ------------------------------------------------------------ actions */

  selectPart(slot, id) {
    if (this.loadout[slot] === id) return;
    if (!this.unlockedParts.has(id)) return;
    this.loadout[slot] = id;
    audio.uiClick();
    this.rebuild();
    this.refreshUi();
    this.save();
  }

  randomize() {
    for (const slot of SLOT_ORDER) {
      const list = CATALOG[slot].filter((p) => this.unlockedParts.has(p.id));
      if (list.length) this.loadout[slot] = list[Math.floor(Math.random() * list.length)].id;
    }
    // an empty right hand makes for a dull match
    if (this.loadout.rightWeapon === 'wp_none') this.loadout.rightWeapon = 'wp_beam_rifle';
    const preset = PAINT_PRESETS[Math.floor(Math.random() * PAINT_PRESETS.length)];
    this.loadout.colors = { ...preset.colors };
    this._syncPaintInputs();
    audio.uiConfirm();
    this.rebuild();
    this.refreshUi();
    this.save();
  }

  resetBuild() {
    this.loadout = this._sanitize({ ...DEFAULT_LOADOUT, colors: { ...DEFAULT_LOADOUT.colors } });
    this.dom.nameInput.value = this.loadout.name;
    this._syncPaintInputs();
    audio.uiClick();
    this.rebuild();
    this.refreshUi();
    this.save();
  }

  /* ------------------------------------------------------------- frame */

  show() {
    this.visible = true;
    this.orbit.enabled = true;
    this.orbit.snap();
  }

  hide() {
    this.visible = false;
    this.orbit.enabled = false;
    this.setSheet(null);
  }

  update(dt) {
    this.time += dt;
    this.envUpdate(dt);
    this.orbit.update(dt);
    if (this.mech) poseGarage(this.mech, this.time);
  }

  dispose() {
    this.orbit.dispose();
    if (this.mech) disposeMech(this.mech);
  }
}

function formatStat(key, value) {
  if (key === 'spreadMult' || key === 'meleeMult' || key === 'boostMult' || key === 'boostBonus') {
    return Number(value).toFixed(2);
  }
  if (key === 'walkSpeed') return Number(value).toFixed(1);
  return String(Math.round(value));
}
