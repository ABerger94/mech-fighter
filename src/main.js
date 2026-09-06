/**
 * MECH FIGHTER - entry point and game state machine.
 *
 * States: TITLE -> GARAGE -> ARENA -> RESULT (and a HELP overlay). The loop
 * lives here; each state decides which scene the renderer draws and which
 * subsystem receives the frame.
 */

import './style.css';
import { GameRenderer } from './renderer.js';
import { InputManager } from './input.js';
import { Hud } from './hud.js';
import { Garage } from './garage.js';
import { Arena } from './arena.js';
import { audio } from './audio.js';

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
    this.renderer = new GameRenderer(this.canvas);
    this.input = new InputManager(this.canvas);
    this.hud = new Hud();

    this.screens = {
      [STATES.TITLE]: document.getElementById('screen-title'),
      [STATES.GARAGE]: document.getElementById('screen-garage'),
      [STATES.ARENA]: document.getElementById('screen-hud'),
      [STATES.RESULT]: document.getElementById('screen-result'),
      [STATES.HELP]: document.getElementById('screen-help')
    };

    this.garage = new Garage({
      canvas: this.canvas,
      onDeploy: (loadout, difficulty) => this.deploy(loadout, difficulty)
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
    this.lastDifficulty = 'veteran';
    this.clock = { last: performance.now() / 1000 };

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

    if (next === STATES.GARAGE || next === STATES.TITLE) {
      this.garage.show();
      this.renderer.use(this.garage.scene, this.garage.camera);
      this.hud.setPaused(false);
    } else {
      this.garage.hide();
    }

    if (inArena) {
      this.renderer.use(this.arena.scene, this.arena.camera);
      this.input.requestLock();
      // If the browser refused the lock (it rate-limits re-entry after Escape),
      // hold the match on the pause card rather than running without a mouse.
      window.clearTimeout(this._lockCheck);
      this._lockCheck = window.setTimeout(() => {
        if (this.state === STATES.ARENA && !this.input.locked) this.arena.setPaused(true);
      }, 500);
    } else {
      this.input.releaseLock();
      audio.setBoost(false);
    }

    if (next === STATES.HELP || next === STATES.RESULT) {
      // keep whatever scene is already bound so the backdrop stays alive
    }
  }

  /* ------------------------------------------------------------ actions */

  deploy(loadout, difficulty) {
    this.lastLoadout = loadout;
    this.lastDifficulty = difficulty;
    audio.init();
    this.arena.start(loadout, difficulty);
    this.setState(STATES.ARENA);
  }

  rematch() {
    if (!this.lastLoadout) {
      this.setState(STATES.GARAGE);
      return;
    }
    this.deploy(this.lastLoadout, this.lastDifficulty);
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

    if (result.win) audio.victory();
    else audio.defeat();

    this.setState(STATES.RESULT);
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
      if (this.state === STATES.ARENA && !this.input.locked) this.resumeMatch();
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
      if (this.state !== STATES.ARENA) return;
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
    this.input.requestLock();
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
