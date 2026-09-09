/**
 * MECH FIGHTER - combat HUD.
 *
 * Thin wrapper over the static markup in index.html. The arena pushes state
 * into it once per frame; nothing here knows about the simulation.
 */

export class Hud {
  constructor() {
    const $ = (id) => document.getElementById(id);
    this.root = $('screen-hud');
    this.playerName = $('hud-player-name');
    this.enemyName = $('hud-enemy-name');
    this.hpBar = $('bar-player-hp');
    this.hpTxt = $('txt-player-hp');
    this.enBar = $('bar-player-en');
    this.enTxt = $('txt-player-en');
    this.enemyBar = $('bar-enemy-hp');
    this.enemyTxt = $('txt-enemy-hp');
    this.chargeWrap = $('wrap-charge');
    this.chargeBar = $('bar-charge');
    this.chargeTxt = $('txt-charge');
    this.funnels = $('hud-funnels');
    this.ammoR = $('hud-ammo-r');
    this.ammoL = $('hud-ammo-l');
    this.distance = $('hud-distance');
    this.timer = $('hud-timer');
    this.crosshair = $('crosshair');
    this.hitmarker = $('hitmarker');
    this.damageArrows = $('damage-arrows');
    this.lock = $('lock-marker');
    this.vignette = $('damage-vignette');
    this.killfeed = $('killfeed');
    this.boost = $('hud-boost');
    this.pause = $('pause-overlay');
    this.hpWrap = this.hpBar.parentElement;
    this.enWrap = this.enBar.parentElement;

    this._vignetteTimer = 0;
    this._feed = [];

    // small pool of reusable damage wedges; four overlapping hits is plenty
    this._arrows = [];
    for (let i = 0; i < 4; i++) {
      const el = document.createElement('i');
      this.damageArrows.appendChild(el);
      this._arrows.push({ el, life: 0 });
    }
    this._arrowNext = 0;
  }

  setNames(player, enemy) {
    this.playerName.textContent = player;
    this.enemyName.textContent = enemy;
  }

  /**
   * @param {object} s {hp,maxHp,energy,maxEnergy,enemyHp,enemyMaxHp,distance,time,
   *                    ammoRight,ammoLeft,boosting,locked}
   */
  update(s) {
    const hpPct = Math.max(0, s.hp / s.maxHp);
    this.hpBar.style.width = `${hpPct * 100}%`;
    this.hpTxt.textContent = `${Math.max(0, Math.ceil(s.hp))} / ${s.maxHp}`;
    this.hpWrap.classList.toggle('is-low', hpPct < 0.3);

    const enPct = Math.max(0, s.energy / s.maxEnergy);
    this.enBar.style.width = `${enPct * 100}%`;
    this.enTxt.textContent = `EN ${Math.max(0, Math.round(s.energy))}`;
    this.enWrap.classList.toggle('is-empty', enPct < 0.18);

    const ePct = Math.max(0, s.enemyHp / s.enemyMaxHp);
    this.enemyBar.style.width = `${ePct * 100}%`;
    this.enemyTxt.textContent = `${Math.max(0, Math.ceil(s.enemyHp))} / ${s.enemyMaxHp}`;

    this.distance.textContent = Math.round(s.distance);
    this.ammoR.innerHTML = `R <b>${s.ammoRight}</b>`;
    this.ammoL.innerHTML = `L <b>${s.ammoLeft}</b>`;
    this.ammoR.classList.toggle('is-empty', s.ammoRightEmpty);
    this.ammoL.classList.toggle('is-empty', s.ammoLeftEmpty);

    const mm = Math.floor(Math.max(0, s.time) / 60);
    const ss = Math.floor(Math.max(0, s.time) % 60);
    this.timer.textContent = `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
    this.timer.classList.toggle('is-urgent', s.time < 30);

    const charging = s.charge > 0.001;
    this.chargeWrap.classList.toggle('is-on', charging);
    if (charging) {
      this.chargeBar.style.width = `${Math.min(1, s.charge) * 100}%`;
      this.chargeWrap.classList.toggle('is-full', s.charge >= 0.999);
      this.chargeTxt.textContent = s.charge >= 0.999 ? 'CHARGED' : 'CHARGING';
    }

    if (s.funnels) {
      this.funnels.innerHTML = `BITS <b>${s.funnels}</b>`;
      this.funnels.classList.toggle('is-active', s.funnels === 'OUT');
    } else {
      this.funnels.textContent = '';
      this.funnels.classList.remove('is-active');
    }

    this.boost.classList.toggle('is-on', !!s.boosting);
    this.crosshair.classList.toggle('is-locked', !!s.locked);
  }

  /** Position the enemy lock reticle, or hide it with `null`. */
  setLockMarker(screen) {
    if (!screen) {
      this.lock.classList.remove('is-visible');
      return;
    }
    this.lock.classList.add('is-visible');
    this.lock.style.left = `${screen.x}px`;
    this.lock.style.top = `${screen.y}px`;
  }

  /**
   * Confirm a landed shot. Fires on the frame the damage is applied, so the
   * feedback is immediate even when the impact effect is off screen.
   * @param {boolean} kill the hit finished the target
   */
  hitMarker(kill = false) {
    const el = this.hitmarker;
    el.classList.remove('is-hit', 'is-kill');
    // force a reflow so the animation restarts on rapid consecutive hits
    void el.offsetWidth;
    el.classList.add(kill ? 'is-kill' : 'is-hit');
  }

  /**
   * Show where a hit came from.
   * @param {number} angle radians, 0 = dead ahead, positive = to the right
   */
  damageFrom(angle) {
    const slot = this._arrows[this._arrowNext];
    this._arrowNext = (this._arrowNext + 1) % this._arrows.length;
    const el = slot.el;
    el.classList.remove('is-on');
    void el.offsetWidth;
    el.style.transform = `translate(-50%, -50%) rotate(${(angle * 180) / Math.PI}deg) translateY(-96px)`;
    el.classList.add('is-on');
  }

  flashDamage(intensity = 1) {
    this.vignette.style.opacity = String(Math.min(0.95, intensity));
    this._vignetteTimer = 0.35;
  }

  feed(text, cls = '') {
    const el = document.createElement('div');
    el.textContent = text;
    if (cls) el.className = cls;
    this.killfeed.appendChild(el);
    this._feed.push({ el, life: 4 });
    while (this._feed.length > 5) {
      const old = this._feed.shift();
      old.el.remove();
    }
  }

  tick(dt) {
    if (this._vignetteTimer > 0) {
      this._vignetteTimer -= dt;
      if (this._vignetteTimer <= 0) this.vignette.style.opacity = '0';
    }
    for (let i = this._feed.length - 1; i >= 0; i--) {
      this._feed[i].life -= dt;
      if (this._feed[i].life <= 0) {
        this._feed[i].el.remove();
        this._feed.splice(i, 1);
      }
    }
  }

  setPaused(on) {
    this.pause.classList.toggle('is-open', on);
  }

  reset() {
    this.hitmarker.classList.remove('is-hit', 'is-kill');
    for (const a of this._arrows) a.el.classList.remove('is-on');
    this.killfeed.innerHTML = '';
    this._feed.length = 0;
    this.vignette.style.opacity = '0';
    this.setLockMarker(null);
    this.setPaused(false);
  }
}
