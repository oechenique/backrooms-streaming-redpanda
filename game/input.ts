// Teclado + mouse (pointer lock) en desktop; joystick virtual y arrastre para mirar en pantallas táctiles.

const MOUSE_SENS = 0.0022;
const TOUCH_SENS = 0.006;
const KEY_TURN = 2.2; // rad/s con las flechas
const STICK_R = 60; // px de recorrido del joystick

export class Input {
  /** Avance (-1..1, + adelante) y desplazamiento lateral (-1..1, + derecha). */
  forward = 0;
  strafe = 0;
  running = false;
  private keys = new Set<string>();
  private lookX = 0;
  private lookY = 0;
  private stick: { id: number; x0: number; y0: number; dx: number; dy: number } | null = null;
  private look: { id: number; x: number; y: number } | null = null;

  constructor(
    el: HTMLElement,
    private readonly base: HTMLElement,
    private readonly knob: HTMLElement,
  ) {
    addEventListener('keydown', (e) => this.keys.add(e.code));
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== el) return;
      this.lookX += e.movementX * MOUSE_SENS;
      this.lookY += e.movementY * MOUSE_SENS;
    });
    el.addEventListener('pointerdown', (e) => this.down(e));
    el.addEventListener('pointermove', (e) => this.move(e));
    el.addEventListener('pointerup', (e) => this.up(e));
    el.addEventListener('pointercancel', (e) => this.up(e));
  }

  /** Devuelve (y pone en cero) cuánto girar en yaw y pitch desde la última llamada. */
  takeLook(dt: number): { yaw: number; pitch: number } {
    let yaw = this.lookX;
    if (this.keys.has('ArrowLeft')) yaw -= KEY_TURN * dt;
    if (this.keys.has('ArrowRight')) yaw += KEY_TURN * dt;
    const out = { yaw, pitch: this.lookY };
    this.lookX = 0;
    this.lookY = 0;
    return out;
  }

  /** Lee teclado y joystick y actualiza forward / strafe / running. */
  poll(): void {
    const k = (code: string) => (this.keys.has(code) ? 1 : 0);
    let f = k('KeyW') + k('ArrowUp') - k('KeyS') - k('ArrowDown');
    let s = k('KeyD') - k('KeyA');
    let run = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    if (this.stick) {
      const mag = Math.hypot(this.stick.dx, this.stick.dy) / STICK_R;
      f = -this.stick.dy / STICK_R;
      s = this.stick.dx / STICK_R;
      run = mag > 0.9; // joystick a fondo = correr
    }
    const len = Math.hypot(f, s);
    this.forward = len > 1 ? f / len : f;
    this.strafe = len > 1 ? s / len : s;
    this.running = run;
  }

  private down(e: PointerEvent): void {
    if (e.pointerType !== 'touch') return;
    if (e.clientX < innerWidth / 2 && !this.stick) {
      this.stick = { id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0 };
      this.place(this.base, e.clientX, e.clientY);
      this.place(this.knob, e.clientX, e.clientY);
    } else if (!this.look) {
      this.look = { id: e.pointerId, x: e.clientX, y: e.clientY };
    }
  }

  private move(e: PointerEvent): void {
    if (this.stick?.id === e.pointerId) {
      let dx = e.clientX - this.stick.x0;
      let dy = e.clientY - this.stick.y0;
      const len = Math.hypot(dx, dy);
      if (len > STICK_R) {
        dx *= STICK_R / len;
        dy *= STICK_R / len;
      }
      this.stick.dx = dx;
      this.stick.dy = dy;
      this.place(this.knob, this.stick.x0 + dx, this.stick.y0 + dy);
    } else if (this.look?.id === e.pointerId) {
      this.lookX += (e.clientX - this.look.x) * TOUCH_SENS;
      this.lookY += (e.clientY - this.look.y) * TOUCH_SENS;
      this.look.x = e.clientX;
      this.look.y = e.clientY;
    }
  }

  private up(e: PointerEvent): void {
    if (this.stick?.id === e.pointerId) {
      this.stick = null;
      this.base.hidden = true;
      this.knob.hidden = true;
    }
    if (this.look?.id === e.pointerId) this.look = null;
  }

  private place(node: HTMLElement, x: number, y: number): void {
    node.hidden = false;
    node.style.left = `${x}px`;
    node.style.top = `${y}px`;
  }
}
