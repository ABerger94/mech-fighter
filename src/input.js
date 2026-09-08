/**
 * MECH FIGHTER - input handling.
 *
 * Wraps keyboard, mouse buttons and pointer-lock mouse deltas behind a small
 * polled interface so the simulation never listens to DOM events directly.
 */

export class InputManager {
  /** @param {HTMLElement} element element used for pointer lock */
  constructor(element) {
    this.element = element;
    this.keys = new Set();
    this.pressed = new Set(); // edge-triggered, cleared each frame
    this.mouse = { left: false, right: false, middle: false };
    this.mousePressed = { left: false, right: false, middle: false };
    this.dx = 0;
    this.dy = 0;
    this.locked = false;
    this.enabled = false;
    this.touchMode = false;
    this.touchAxes = { x: 0, z: 0, active: false };
    this._pendingReleases = [];
    this.sensitivity = 0.0022;
    this.invertY = false;
    this.onLockChange = null;

    this._onKeyDown = (e) => {
      if (!this.enabled) return;
      const code = e.code;
      if (!this.keys.has(code)) this.pressed.add(code);
      this.keys.add(code);
      if (['Space', 'Tab', 'KeyR', 'KeyF', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) {
        e.preventDefault();
      }
    };
    this._onKeyUp = (e) => {
      const code = e.code;
      this.deferRelease(() => this.keys.delete(code));
    };
    this._onBlur = () => {
      this.keys.clear();
      this.mouse.left = this.mouse.right = this.mouse.middle = false;
    };
    this._onMouseDown = (e) => {
      if (!this.enabled || !this.locked) return;
      if (e.button === 0) { this.mouse.left = true; this.mousePressed.left = true; }
      if (e.button === 2) { this.mouse.right = true; this.mousePressed.right = true; }
      if (e.button === 1) { this.mouse.middle = true; this.mousePressed.middle = true; }
    };
    this._onMouseUp = (e) => {
      // Deferred so a click that starts and ends inside one frame is still
      // seen as held by the simulation.
      if (e.button === 0) this.deferRelease(() => { this.mouse.left = false; });
      if (e.button === 2) this.deferRelease(() => { this.mouse.right = false; });
      if (e.button === 1) this.deferRelease(() => { this.mouse.middle = false; });
    };
    this._onMouseMove = (e) => {
      if (!this.locked) return;
      this.dx += e.movementX || 0;
      this.dy += e.movementY || 0;
    };
    this._onContext = (e) => {
      if (this.enabled) e.preventDefault();
    };
    this._onLockChange = () => {
      this.locked = document.pointerLockElement === this.element;
      if (!this.locked) {
        this.mouse.left = this.mouse.right = this.mouse.middle = false;
      }
      if (this.onLockChange) this.onLockChange(this.locked);
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('contextmenu', this._onContext);
    document.addEventListener('pointerlockchange', this._onLockChange);
  }

  requestLock() {
    if (this.locked) return;
    const p = this.element.requestPointerLock?.();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  }

  releaseLock() {
    if (document.pointerLockElement === this.element) document.exitPointerLock();
  }

  down(code) {
    return this.keys.has(code);
  }

  /**
   * Whether look input should be read this frame. Pointer lock is the desktop
   * gate; on touch there is no lock, the look pad stands in for it.
   */
  canLook() {
    return this.locked || this.touchMode;
  }

  /** Press a key as if it came from the keyboard (used by touch buttons). */
  pressKey(code) {
    if (!this.keys.has(code)) this.pressed.add(code);
    this.keys.add(code);
  }

  releaseKey(code) {
    this.keys.delete(code);
  }

  /** True only on the frame the key went down. */
  hit(code) {
    return this.pressed.has(code);
  }

  /**
   * Hold a button release until the current frame has been read.
   *
   * A fast tap can press and release between two simulation ticks, which would
   * otherwise be invisible: the trigger would read as never held and the shot
   * would never go out.
   */
  deferRelease(fn) {
    this._pendingReleases.push(fn);
  }

  /** Consume per-frame edge state. Call at the end of each simulation tick. */
  endFrame() {
    this.pressed.clear();
    this.mousePressed.left = this.mousePressed.right = this.mousePressed.middle = false;
    this.dx = 0;
    this.dy = 0;
    if (this._pendingReleases.length) {
      for (const fn of this._pendingReleases) fn();
      this._pendingReleases.length = 0;
    }
  }

  /** Movement axes in local space: x = strafe (+right), z = forward (+forward). */
  axes() {
    let x = 0;
    let z = 0;
    if (this.down('KeyW') || this.down('ArrowUp')) z += 1;
    if (this.down('KeyS') || this.down('ArrowDown')) z -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.touchAxes.active) {
      x += this.touchAxes.x;
      z += this.touchAxes.z;
    }
    const len = Math.hypot(x, z);
    if (len > 1) {
      x /= len;
      z /= len;
    }
    return { x, z };
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    window.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('contextmenu', this._onContext);
    document.removeEventListener('pointerlockchange', this._onLockChange);
  }
}


/**
 * True when the primary input is a finger rather than a mouse.
 *
 * `maxTouchPoints` alone is wrong: a touchscreen laptop reports touch points
 * but its primary pointer is still a fine, hovering mouse. Requiring a coarse
 * primary pointer with no hover keeps those on the desktop control scheme,
 * and `Game` upgrades to touch later if a real touch actually arrives.
 */
export function isTouchDevice() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const noHover = window.matchMedia('(hover: none)').matches;
  return coarse && (noHover || navigator.maxTouchPoints > 0);
}

/**
 * On-screen controls for touch devices.
 *
 * The left half of the canvas is a floating movement stick, the right half is
 * a look pad, and the overlay buttons drive the same key/mouse state the
 * keyboard and mouse would, so the simulation needs no touch-specific code.
 */
export class TouchControls {
  /**
   * @param {InputManager} input
   * @param {HTMLElement} canvas surface used for the stick and look pad
   * @param {HTMLElement} layer  container holding the on-screen buttons
   */
  constructor(input, canvas, layer) {
    this.input = input;
    this.canvas = canvas;
    this.layer = layer;
    this.enabled = false;
    this.lookSensitivity = 0.0062;
    this.onPause = null;

    this.stick = layer.querySelector('#touch-stick');
    this.knob = layer.querySelector('#touch-stick-knob');
    this.radius = 62;

    this._moveId = null;
    this._lookId = null;
    this._moveOrigin = { x: 0, y: 0 };
    this._lookLast = { x: 0, y: 0 };

    // Buttons map straight onto keyboard/mouse state.
    this.buttons = new Map();
    for (const el of layer.querySelectorAll('[data-touch]')) {
      const action = el.dataset.touch;
      this.buttons.set(el, action);
      el.addEventListener('pointerdown', (e) => this._buttonDown(e, el, action));
      el.addEventListener('pointerup', (e) => this._buttonUp(e, el, action));
      el.addEventListener('pointercancel', (e) => this._buttonUp(e, el, action));
      el.addEventListener('pointerleave', (e) => this._buttonUp(e, el, action));
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    this._onDown = (e) => this._surfaceDown(e);
    this._onMove = (e) => this._surfaceMove(e);
    this._onUp = (e) => this._surfaceUp(e);

    canvas.addEventListener('pointerdown', this._onDown);
    window.addEventListener('pointermove', this._onMove, { passive: false });
    window.addEventListener('pointerup', this._onUp);
    window.addEventListener('pointercancel', this._onUp);

    this._bindGestureSuppression();
  }

  /**
   * Stop the browser turning rapid taps and two-finger drags into page zoom.
   *
   * iOS has ignored `user-scalable=no` since iOS 10, and `touch-action` alone
   * does not reliably suppress WebKit's double-tap zoom once taps come fast,
   * so the touch defaults are cancelled directly on the surfaces the game
   * drives with pointer events. Those never rely on a synthesized click, so
   * cancelling costs nothing; the rest of the UI is left alone.
   */
  _bindGestureSuppression() {
    const cancel = (e) => {
      if (e.cancelable) e.preventDefault();
    };
    this._cancelTouch = cancel;

    for (const el of [this.canvas, ...this.buttons.keys()]) {
      el.addEventListener('touchstart', cancel, { passive: false });
      el.addEventListener('touchend', cancel, { passive: false });
    }

    // Safari-only pinch gesture events, which bypass touch-action entirely.
    this._onGesture = (e) => {
      if (e.cancelable) e.preventDefault();
    };
    for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
      document.addEventListener(type, this._onGesture, { passive: false });
    }

    // Pinch on engines that report it as a multi-touch move.
    this._onMultiTouch = (e) => {
      if (e.touches && e.touches.length > 1 && e.cancelable) e.preventDefault();
    };
    document.addEventListener('touchmove', this._onMultiTouch, { passive: false });

    // Double-tap zoom fallback, minus real text fields where it selects words.
    this._onDoubleTap = (e) => {
      if (e.target && e.target.closest && e.target.closest('input, textarea')) return;
      if (e.cancelable) e.preventDefault();
    };
    document.addEventListener('dblclick', this._onDoubleTap, { passive: false });
  }

  setEnabled(on) {
    this.enabled = on;
    this.layer.classList.toggle('is-active', on);
    if (!on) this._reset();
  }

  _reset() {
    this._moveId = null;
    this._lookId = null;
    this.input.touchAxes.active = false;
    this.input.touchAxes.x = 0;
    this.input.touchAxes.z = 0;
    this.stick.classList.remove('is-active');
    this.knob.style.transform = 'translate(-50%, -50%)';
    for (const [el, action] of this.buttons) {
      el.classList.remove('is-down');
      this._releaseAction(action);
    }
  }

  _actionDown(action) {
    const input = this.input;
    switch (action) {
      case 'fire': input.mouse.left = true; input.mousePressed.left = true; break;
      case 'sub': input.mouse.right = true; input.mousePressed.right = true; break;
      case 'boost': input.pressKey('Space'); break;
      case 'dash': input.pressKey('ShiftLeft'); break;
      case 'reload': input.pressKey('KeyR'); break;
      case 'funnel': input.pressKey('KeyF'); break;
      case 'pause': if (this.onPause) this.onPause(); break;
      default: break;
    }
  }

  _releaseAction(action) {
    const input = this.input;
    switch (action) {
      case 'fire': input.mouse.left = false; break;
      case 'sub': input.mouse.right = false; break;
      case 'boost': input.releaseKey('Space'); break;
      case 'dash': input.releaseKey('ShiftLeft'); break;
      case 'reload': input.releaseKey('KeyR'); break;
      case 'funnel': input.releaseKey('KeyF'); break;
      default: break;
    }
  }

  _buttonDown(e, el, action) {
    if (!this.enabled) return;
    e.preventDefault();
    e.stopPropagation();
    el.classList.add('is-down');
    // Fire first: pointer capture is a nicety (it keeps the button held when a
    // finger slides off the edge) and throws for pointers the browser has
    // already released, which must never swallow the action.
    this._actionDown(action);
    try {
      el.setPointerCapture?.(e.pointerId);
    } catch (err) {
      /* capture unavailable for this pointer */
    }
  }

  _buttonUp(e, el, action) {
    if (!el.classList.contains('is-down')) return;
    el.classList.remove('is-down');
    // A tap can begin and end within a single frame; hold the release so the
    // simulation still sees one frame of the button being down.
    this.input.deferRelease(() => this._releaseAction(action));
  }

  _surfaceDown(e) {
    if (!this.enabled || !this.input.enabled) return;
    e.preventDefault();
    const half = window.innerWidth * 0.45;
    if (e.clientX < half && this._moveId === null) {
      this._moveId = e.pointerId;
      this._moveOrigin.x = e.clientX;
      this._moveOrigin.y = e.clientY;
      this.stick.style.left = `${e.clientX}px`;
      this.stick.style.top = `${e.clientY}px`;
      this.stick.classList.add('is-active');
    } else if (this._lookId === null) {
      this._lookId = e.pointerId;
      this._lookLast.x = e.clientX;
      this._lookLast.y = e.clientY;
    }
  }

  _surfaceMove(e) {
    if (!this.enabled) return;
    if (e.pointerId === this._moveId) {
      e.preventDefault();
      let dx = e.clientX - this._moveOrigin.x;
      let dy = e.clientY - this._moveOrigin.y;
      const len = Math.hypot(dx, dy);
      if (len > this.radius) {
        dx = (dx / len) * this.radius;
        dy = (dy / len) * this.radius;
      }
      this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      const dead = 8;
      if (len < dead) {
        this.input.touchAxes.x = 0;
        this.input.touchAxes.z = 0;
        this.input.touchAxes.active = false;
      } else {
        this.input.touchAxes.x = dx / this.radius;
        this.input.touchAxes.z = -dy / this.radius;
        this.input.touchAxes.active = true;
      }
    } else if (e.pointerId === this._lookId) {
      e.preventDefault();
      // The arena multiplies dx by input.sensitivity, so convert pixels of
      // drag into the equivalent mouse delta for the touch look speed.
      const scale = this.lookSensitivity / this.input.sensitivity;
      this.input.dx += (e.clientX - this._lookLast.x) * scale;
      this.input.dy += (e.clientY - this._lookLast.y) * scale;
      this._lookLast.x = e.clientX;
      this._lookLast.y = e.clientY;
    }
  }

  _surfaceUp(e) {
    if (e.pointerId === this._moveId) {
      this._moveId = null;
      this.input.touchAxes.active = false;
      this.input.touchAxes.x = 0;
      this.input.touchAxes.z = 0;
      this.stick.classList.remove('is-active');
      this.knob.style.transform = 'translate(-50%, -50%)';
    } else if (e.pointerId === this._lookId) {
      this._lookId = null;
    }
  }

  dispose() {
    this.canvas.removeEventListener('pointerdown', this._onDown);
    window.removeEventListener('pointermove', this._onMove);
    window.removeEventListener('pointerup', this._onUp);
    window.removeEventListener('pointercancel', this._onUp);

    for (const el of [this.canvas, ...this.buttons.keys()]) {
      el.removeEventListener('touchstart', this._cancelTouch);
      el.removeEventListener('touchend', this._cancelTouch);
    }
    for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
      document.removeEventListener(type, this._onGesture);
    }
    document.removeEventListener('touchmove', this._onMultiTouch);
    document.removeEventListener('dblclick', this._onDoubleTap);
  }
}
