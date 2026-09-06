/**
 * MECH FIGHTER - the garage.
 *
 * Owns the build screen: a lit 3D bay with an orbitable preview of the current
 * frame, the part browser, the paint shop and the derived stat readout. The
 * loadout it produces is the only thing the arena needs to spawn the player.
 */

import { createGarageEnvironment, OrbitCamera } from './renderer.js';
import { buildMech, disposeMech, applyColors, poseGarage } from './mech.js';
import {
  CATALOG,
  SLOT_ORDER,
  SLOT_LABELS,
  COMPARE_KEYS,
  PAINT_SLOTS,
  PAINT_PRESETS,
  DIFFICULTIES,
  DEFAULT_LOADOUT,
  computeStats,
  statRows,
  resolveLoadout
} from './data/parts.js';
import { audio } from './audio.js';

const STORAGE_KEY = 'mechfighter.build.v2';

export class Garage {
  /**
   * @param {object} opts { canvas, onDeploy }
   */
  constructor(opts) {
    this.canvas = opts.canvas;
    this.onDeploy = opts.onDeploy || (() => {});

    const env = createGarageEnvironment();
    this.scene = env.scene;
    this.camera = env.camera;
    this.envUpdate = env.update;

    this.orbit = new OrbitCamera(this.camera, this.canvas);
    this.orbit.enabled = false;

    this.loadout = this._load();
    this.difficulty = this.loadout.difficulty || 'veteran';
    this.activeSlot = 'torso';
    this.mech = null;
    this.time = 0;
    this.visible = false;

    this._cacheDom();
    this._buildTabs();
    this._buildSlotStrip();
    this._buildPaintUi();
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
      return out;
    } catch (err) {
      return base;
    }
  }

  save() {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ ...this.loadout, difficulty: this.difficulty })
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
        this.onDeploy(this.getLoadout(), this.difficulty);
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

    const h = this.mech.height;
    this.orbit.target.set(0, h * 0.5, 0);
    this.orbit.setDistance(h * 2.35);
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
  }

  _renderPartList() {
    const slot = this.activeSlot;
    const list = CATALOG[slot];
    const currentId = this.loadout[slot];
    const current = list.find((p) => p.id === currentId) || list[0];
    const keys = COMPARE_KEYS[slot] || [];

    this.dom.partList.innerHTML = '';
    for (const part of list) {
      const card = document.createElement('div');
      card.className = 'part-card' + (part.id === currentId ? ' is-selected' : '');

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

      card.append(head, desc, stats);
      card.addEventListener('click', () => this.selectPart(slot, part.id));
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
    this.loadout[slot] = id;
    audio.uiClick();
    this.rebuild();
    this.refreshUi();
    this.save();
  }

  randomize() {
    for (const slot of SLOT_ORDER) {
      const list = CATALOG[slot];
      this.loadout[slot] = list[Math.floor(Math.random() * list.length)].id;
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
    this.loadout = { ...DEFAULT_LOADOUT, colors: { ...DEFAULT_LOADOUT.colors } };
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
