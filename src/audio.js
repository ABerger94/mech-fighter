/**
 * MECH FIGHTER - procedural audio.
 *
 * Everything is synthesised with the Web Audio API so the build ships with no
 * binary assets. The context is created lazily on the first user gesture.
 */

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.volume = 0.55;
    this._noiseBuffer = null;
    this._boostNode = null;
  }

  /** Create (or resume) the audio context. Safe to call repeatedly. */
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) {
      this.enabled = false;
      return;
    }
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);

    // pre-render a second of white noise for reuse
    const len = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this._noiseBuffer = buf;
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  get t() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  _gain(value, attack = 0.005) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, this.t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, value), this.t + attack);
    g.connect(this.master);
    return g;
  }

  _noise(duration, volume, filterType = 'bandpass', freq = 900, q = 1) {
    if (!this.ctx) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer;
    src.loop = true;
    const filt = this.ctx.createBiquadFilter();
    filt.type = filterType;
    filt.frequency.value = freq;
    filt.Q.value = q;
    const g = this._gain(volume);
    src.connect(filt).connect(g);
    src.start();
    g.gain.exponentialRampToValueAtTime(0.0001, this.t + duration);
    src.stop(this.t + duration + 0.05);
    return { src, filt, gain: g };
  }

  _tone(type, f0, f1, duration, volume) {
    if (!this.ctx) return null;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, this.t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), this.t + duration);
    const g = this._gain(volume, 0.004);
    osc.connect(g);
    osc.start();
    g.gain.exponentialRampToValueAtTime(0.0001, this.t + duration);
    osc.stop(this.t + duration + 0.05);
    return { osc, gain: g };
  }

  /* ------------------------------------------------------------ sounds */

  beamShot(pitch = 1) {
    if (!this.ctx || !this.enabled) return;
    this._tone('sawtooth', 1400 * pitch, 220 * pitch, 0.18, 0.16);
    this._tone('sine', 620 * pitch, 90 * pitch, 0.22, 0.1);
    this._noise(0.1, 0.05, 'highpass', 2400);
  }

  pulseShot() {
    if (!this.ctx || !this.enabled) return;
    this._tone('square', 1900, 700, 0.06, 0.07);
    this._noise(0.05, 0.03, 'highpass', 3200);
  }

  ballisticShot() {
    if (!this.ctx || !this.enabled) return;
    this._noise(0.12, 0.2, 'lowpass', 1500, 0.8);
    this._tone('square', 220, 60, 0.1, 0.13);
  }

  railShot() {
    if (!this.ctx || !this.enabled) return;
    this._tone('sawtooth', 120, 2600, 0.12, 0.12);
    this._tone('sine', 2400, 180, 0.35, 0.14);
    this._noise(0.28, 0.12, 'bandpass', 1800, 2);
  }

  missileLaunch() {
    if (!this.ctx || !this.enabled) return;
    this._noise(0.5, 0.14, 'bandpass', 700, 0.9);
    this._tone('sawtooth', 300, 900, 0.4, 0.05);
  }

  melee() {
    if (!this.ctx || !this.enabled) return;
    this._tone('sawtooth', 900, 140, 0.28, 0.14);
    this._noise(0.3, 0.1, 'bandpass', 2200, 1.4);
  }

  impact(scale = 1) {
    if (!this.ctx || !this.enabled) return;
    this._noise(0.18 * scale, 0.14, 'lowpass', 900);
    this._tone('triangle', 180, 50, 0.16 * scale, 0.1);
  }

  explosion(scale = 1) {
    if (!this.ctx || !this.enabled) return;
    this._noise(0.9 * scale, 0.34, 'lowpass', 700, 0.6);
    this._tone('sine', 130, 28, 0.8 * scale, 0.28);
    this._tone('sawtooth', 300, 40, 0.4 * scale, 0.1);
  }

  hitTaken() {
    if (!this.ctx || !this.enabled) return;
    this._noise(0.25, 0.2, 'lowpass', 500);
    this._tone('square', 140, 44, 0.3, 0.14);
  }

  block() {
    if (!this.ctx || !this.enabled) return;
    this._tone('triangle', 1200, 500, 0.16, 0.1);
    this._noise(0.14, 0.08, 'bandpass', 3000, 2);
  }

  jump() {
    if (!this.ctx || !this.enabled) return;
    this._noise(0.35, 0.13, 'bandpass', 500, 0.7);
    this._tone('sine', 90, 240, 0.24, 0.08);
  }

  land(scale = 1) {
    if (!this.ctx || !this.enabled) return;
    this._noise(0.3 * scale, 0.2, 'lowpass', 380);
    this._tone('sine', 110, 34, 0.28 * scale, 0.18);
  }

  reload() {
    if (!this.ctx || !this.enabled) return;
    this._noise(0.07, 0.1, 'bandpass', 1600, 3);
    window.setTimeout(() => this._noise(0.09, 0.12, 'bandpass', 900, 3), 170);
  }

  uiClick() {
    if (!this.ctx || !this.enabled) return;
    this._tone('square', 1400, 900, 0.05, 0.05);
  }

  uiConfirm() {
    if (!this.ctx || !this.enabled) return;
    this._tone('sine', 700, 1300, 0.12, 0.08);
    window.setTimeout(() => this._tone('sine', 1300, 1700, 0.14, 0.06), 90);
  }

  alarm() {
    if (!this.ctx || !this.enabled) return;
    this._tone('square', 880, 880, 0.14, 0.07);
    window.setTimeout(() => this._tone('square', 660, 660, 0.16, 0.07), 170);
  }

  victory() {
    if (!this.ctx || !this.enabled) return;
    [523, 659, 784, 1047].forEach((f, i) =>
      window.setTimeout(() => this._tone('triangle', f, f, 0.32, 0.11), i * 130)
    );
  }

  defeat() {
    if (!this.ctx || !this.enabled) return;
    [392, 330, 262, 196].forEach((f, i) =>
      window.setTimeout(() => this._tone('sawtooth', f, f * 0.98, 0.42, 0.1), i * 190)
    );
  }

  /** Continuous thruster roar, gated by `on`. */
  setBoost(on, intensity = 1) {
    if (!this.ctx || !this.enabled) return;
    if (on && !this._boostNode) {
      const src = this.ctx.createBufferSource();
      src.buffer = this._noiseBuffer;
      src.loop = true;
      const filt = this.ctx.createBiquadFilter();
      filt.type = 'bandpass';
      filt.frequency.value = 420;
      filt.Q.value = 0.8;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, this.t);
      g.gain.linearRampToValueAtTime(0.09 * intensity, this.t + 0.08);
      src.connect(filt).connect(g).connect(this.master);
      src.start();
      this._boostNode = { src, gain: g, filt };
    } else if (!on && this._boostNode) {
      const node = this._boostNode;
      this._boostNode = null;
      node.gain.gain.cancelScheduledValues(this.t);
      node.gain.gain.setValueAtTime(node.gain.gain.value, this.t);
      node.gain.gain.linearRampToValueAtTime(0.0001, this.t + 0.14);
      node.src.stop(this.t + 0.2);
    } else if (on && this._boostNode) {
      this._boostNode.gain.gain.setTargetAtTime(0.09 * intensity, this.t, 0.08);
    }
  }

  stopAll() {
    this.setBoost(false);
  }
}

export const audio = new AudioEngine();
