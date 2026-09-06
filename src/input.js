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
      this.keys.delete(e.code);
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
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
      if (e.button === 1) this.mouse.middle = false;
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

  /** True only on the frame the key went down. */
  hit(code) {
    return this.pressed.has(code);
  }

  /** Consume per-frame edge state. Call at the end of each simulation tick. */
  endFrame() {
    this.pressed.clear();
    this.mousePressed.left = this.mousePressed.right = this.mousePressed.middle = false;
    this.dx = 0;
    this.dy = 0;
  }

  /** Movement axes in local space: x = strafe (+right), z = forward (+forward). */
  axes() {
    let x = 0;
    let z = 0;
    if (this.down('KeyW') || this.down('ArrowUp')) z += 1;
    if (this.down('KeyS') || this.down('ArrowDown')) z -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
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
