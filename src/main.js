/**
 * MECH FIGHTER - entry point and game state machine.
 *
 * States: TITLE -> GARAGE -> ARENA -> RESULT (and a HELP overlay). The loop
 * lives here; each state decides which scene the renderer draws and which
 * subsystem receives the frame.
 */

import './style.css';
import { GameRenderer } from './renderer.js';
import { InputManager, TouchControls, isTouchDevice } from './input.js';
import { Hud } from './hud.js';
import { Garage } from './garage.js';
import { Arena } from './arena.js';
import { audio } from './audio.js';
import { recordVictory } from './progress.js';

const MOVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];

const STATES = {
  TITLE: 'title',
  GARAGE: 'garage',
  ARENA: 'arena',
  RESULT: 'result',
  HELP: 'help'
};

class Game {
  constructor() {
    this.canvas = document.getElementById('viewport');
    this.touch = isTouchDevice();
    document.body.classList.toggle('is-touch', this.touch);

    this.renderer = new GameRenderer(this.canvas, { touch: this.touch });
    this.input = new InputManager(this.canvas);
    this.input.touchMode = this.touch;
    this.hud = new Hud();

    this.touchControls = new TouchControls(this.input, this.canvas, document.getElementById('touch-layer'));
    this.touchControls.onPause = () => {
      if (this.state === STATES.ARENA) this.arena.setPaused(!this.arena.paused);
    };

    this.screens = {
      [STATES.TITLE]: document.getElementById('screen-title'),
      [STATES.GARAGE]: document.getElementById('screen-garage'),
      [STATES.ARENA]: document.getElementById('screen-hud'),
      [STATES.RESULT]: document.getElementById('screen-result'),
      [STATES.HELP]: document.getElementById('screen-help')
    };

    this.garage = new Garage({
      canvas: this.canvas,
      touch: this.touch,
      onDeploy: (loadout, settings) => this.deploy(loadout, settings)
    });

    this.arena = new Arena({
      renderer: this.renderer,
      input: this.input,
      hud: this.hud,
      onEnd: (result) => this.finishMatch(result)
    });

    this.state = null;
    this.previousState = STATES.TITLE;
    this.lastLoadout = null;
    this.lastSettings = { difficulty: 'veteran', opponent: 'nemesis', arena: 'orbital' };
    this.clock = { last: performance.now() / 1000 };

    // A hybrid device that starts on the mouse switches to touch controls the
    // first time someone actually touches the screen.
    this._onFirstTouch = (e) => {
      if (e.pointerType === 'touch' && !this.touch) this.setTouchMode(true);
    };
    window.addEventListener('pointerdown', this._onFirstTouch, { capture: true });

    this._bindGlobalActions();
    this._bindPointerLock();

    this.renderer.use(this.garage.scene, this.garage.camera);
    this.setState(STATES.TITLE);

    // first user gesture unlocks Web Audio
    const unlock = () => {
      audio.init();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);

    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);

    window.setTimeout(() => {
      document.getElementById('loading').classList.add('is-hidden');
    }, 260);
  }

  /** Switch the whole UI between mouse/keyboard and on-screen touch controls. */
  setTouchMode(on) {
    if (this.touch === on) return;
    this.touch = on;
    this.input.touchMode = on;
    this.garage.touch = on;
    document.body.classList.toggle('is-touch', on);
    this.touchControls.setEnabled(on && this.state === STATES.ARENA);
    if (on && this.state === STATES.ARENA) {
      this.input.releaseLock();
      this.arena.setPaused(false);
    }
  }

  /* -------------------------------------------------------------- state */

  setState(next) {
    if (this.state === next) return;
    this.previousState = this.state;
    this.state = next;

    for (const [name, el] of Object.entries(this.screens)) {
      el.classList.toggle('is-active', name === next);
    }

    const inArena = next === STATES.ARENA;
    this.input.enabled = inArena;
    this.garage.visible = next === STATES.GARAGE || next === STATES.TITLE;
    this.touchControls.setEnabled(this.touch && inArena);
    document.body.classList.toggle('in-arena', inArena);

    if (next === STATES.GARAGE || next === STATES.TITLE) {
      this.garage.show();
      this.renderer.use(this.garage.scene, this.garage.camera);
      this.hud.setPaused(false);
    } else {
      this.garage.hide();
    }

    if (inArena) {
      this.renderer.use(this.arena.scene, this.arena.camera);
      // Touch devices have no pointer lock; the on-screen look pad stands in.
      if (!this.touch) {
        this.input.requestLock();
        // If the browser refused the lock (it rate-limits re-entry after
        // Escape), hold the match on the pause card rather than running
        // without a mouse.
        window.clearTimeout(this._lockCheck);
        this._lockCheck = window.setTimeout(() => {
          if (this.state === STATES.ARENA && !this.input.locked) this.arena.setPaused(true);
        }, 500);
      }
    } else {
      this.input.releaseLock();
      audio.setBoost(false);
    }

    if (next === STATES.HELP || next === STATES.RESULT) {
      // keep whatever scene is already bound so the backdrop stays alive
    }
  }

  /* ------------------------------------------------------------ actions */

  deploy(loadout, settings) {
    this.lastLoadout = loadout;
    this.lastSettings = settings;
    audio.init();
    if (this.touch) this.goFullscreen();
    this.arena.start(loadout, settings);
    this.setState(STATES.ARENA);
  }

  rematch() {
    if (!this.lastLoadout) {
      this.setState(STATES.GARAGE);
      return;
    }
    this.deploy(this.lastLoadout, this.lastSettings);
  }

  abortMatch() {
    this.arena.reset();
    this.hud.reset();
    this.setState(STATES.GARAGE);
  }

  finishMatch(result) {
    const title = document.getElementById('result-title');
    const sub = document.getElementById('result-sub');
    const stats = document.getElementById('result-stats');

    title.textContent = result.win ? 'MISSION COMPLETE' : 'FRAME DESTROYED';
    title.classList.toggle('is-loss', !result.win);
    sub.textContent = result.win
      ? `${result.enemy} neutralised with ${result.hpLeft} armour left.`
      : `${result.reason}. ${result.enemy} still stands.`;

    const rows = [
      ['RESULT', result.win ? 'VICTORY' : 'DEFEAT'],
      ['ARMOUR LEFT', `${result.hpLeft} / ${result.hpMax}`],
      ['DAMAGE DEALT', String(result.damageDealt)],
      ['DAMAGE TAKEN', String(result.damageTaken)],
      ['ACCURACY', `${Math.round(result.accuracy * 100)}%`],
      ['TIME LEFT', formatTime(result.timeLeft)]
    ];
    stats.innerHTML = '';
    for (const [label, value] of rows) {
      const div = document.createElement('div');
      const s = document.createElement('span');
      s.textContent = label;
      const b = document.createElement('b');
      b.textContent = value;
      div.append(s, b);
      stats.appendChild(div);
    }

    // A win advances the ladder and releases the next slice of the catalogue.
    const unlocks = document.getElementById('result-unlocks');
    unlocks.innerHTML = '';
    if (result.win && result.opponentId) {
      const earned = recordVictory(this.garage.progress, result.opponentId);
      if (!earned.repeat) {
        this.garage.applyProgress(earned.progress);
        const rows = [
          ...earned.parts.map((p) => ({ label: p.name, major: false })),
          ...earned.arenas.map((a) => ({ label: `${a.toUpperCase()} BATTLEFIELD`, major: true })),
          ...(earned.opponent ? [{ label: `${earned.opponent.name} UNLOCKED`, major: true }] : [])
        ];
        if (rows.length) {
          const title = document.createElement('h3');
          title.textContent = 'SALVAGE RECOVERED';
          const list = document.createElement('div');
          list.className = 'unlock-list';
          rows.forEach((row, i) => {
            const el = document.createElement('span');
            el.textContent = row.label;
            if (row.major) el.className = 'is-major';
            el.style.animationDelay = `${i * 45}ms`;
            list.appendChild(el);
          });
          unlocks.append(title, list);
        }
      }
    }

    if (result.win) audio.victory();
    else audio.defeat();

    this.setState(STATES.RESULT);
  }

  /**
   * Best-effort fullscreen and landscape lock. Both are permission-gated and
   * unsupported on some browsers, so every step is optional.
   */
  goFullscreen() {
    const el = document.documentElement;
    try {
      if (!document.fullscreenElement) {
        const req = el.requestFullscreen || el.webkitRequestFullscreen;
        const p = req && req.call(el, { navigationUI: 'hide' });
        if (p && p.catch) p.catch(() => {});
      }
    } catch (err) {
      /* fullscreen unavailable */
    }
    try {
      const lock = window.screen && window.screen.orientation && window.screen.orientation.lock;
      if (lock) {
        const p = lock.call(window.screen.orientation, 'landscape');
        if (p && p.catch) p.catch(() => {});
      }
    } catch (err) {
      /* orientation lock unavailable */
    }
  }

  /* ------------------------------------------------------------- events */

  _bindGlobalActions() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      switch (action) {
        case 'start':
          audio.init();
          audio.uiConfirm();
          this.setState(STATES.GARAGE);
          break;
        case 'fullscreen':
          audio.init();
          audio.uiClick();
          this.goFullscreen();
          break;
        case 'how-to':
          audio.uiClick();
          this._helpReturn = this.state;
          this.setState(STATES.HELP);
          break;
        case 'close-help':
          audio.uiClick();
          this.setState(this._helpReturn || STATES.TITLE);
          break;
        case 'abort':
          audio.uiClick();
          this.abortMatch();
          break;
        case 'resume':
          audio.uiClick();
          this.resumeMatch();
          break;
        case 'rematch':
          audio.uiConfirm();
          this.rematch();
          break;
        case 'to-garage':
          audio.uiClick();
          this.setState(STATES.GARAGE);
          break;
        default:
          break;
      }
    });

    // clicking the arena re-acquires pointer lock
    this.canvas.addEventListener('click', () => {
      if (this.touch) return;
      if (this.state === STATES.ARENA && !this.input.locked) this.resumeMatch();
    });

    // If a keyboard turns up mid-match, this was never a phone: hand the
    // controls back to mouse and keyboard.
    window.addEventListener('keydown', (e) => {
      if (this.touch && this.state === STATES.ARENA && MOVE_KEYS.includes(e.code)) {
        this.setTouchMode(false);
        this.input.requestLock();
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Escape') return;
      if (this.state === STATES.HELP) {
        this.setState(this._helpReturn || STATES.TITLE);
      } else if (this.state === STATES.ARENA && this.arena.running && !this.arena.finished) {
        // Browsers also drop pointer lock on Escape; pausing here keeps the two
        // paths in step whether or not that fires.
        this.arena.setPaused(true);
        this.input.releaseLock();
      }
    });
  }

  _bindPointerLock() {
    this.input.onLockChange = (locked) => {
      if (this.touch || this.state !== STATES.ARENA) return;
      if (!locked && this.arena.running && !this.arena.finished) {
        this.arena.setPaused(true);
      } else if (locked) {
        this.arena.setPaused(false);
      }
    };
  }

  resumeMatch() {
    if (this.state !== STATES.ARENA) return;
    this.arena.setPaused(false);
    if (!this.touch) this.input.requestLock();
  }

  /* --------------------------------------------------------------- loop */

  _loop() {
    requestAnimationFrame(this._loop);
    const now = performance.now() / 1000;
    let dt = now - this.clock.last;
    this.clock.last = now;
    if (dt > 0.05) dt = 0.05; // never let a stall teleport anyone through a wall

    switch (this.state) {
      case STATES.TITLE:
      case STATES.GARAGE:
        this.garage.update(dt);
        break;
      case STATES.ARENA:
        this.arena.update(dt);
        break;
      case STATES.RESULT:
        this.arena.effects.update(dt);
        this.arena.envUpdate(dt, this.arena.elapsed);
        break;
      case STATES.HELP:
        if (this.previousState === STATES.ARENA) this.arena.effects.update(dt);
        else this.garage.update(dt);
        break;
      default:
        break;
    }

    this.renderer.render();
    this.input.endFrame();
  }
}

function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

window.addEventListener('DOMContentLoaded', () => {
  try {
    window.game = new Game();
  } catch (err) {
    console.error(err);
    const loading = document.getElementById('loading');
    if (loading) {
      loading.classList.remove('is-hidden');
      loading.innerHTML = `<span style="color:#ff4d5e">FRAME INITIALISATION FAILED — ${String(err.message || err)}</span>`;
    }
  }
});
