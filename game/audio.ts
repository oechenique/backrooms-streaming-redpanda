// Todo el audio se sintetiza en vivo con WebAudio: zumbido de los tubos, pasos, respiración y la estática de
// La Interferencia. Ni un archivo de sonido. Diseño propio.

import { Scream, setPos } from './entity/scream';

export interface AudioFrame {
  /** Miedo 0..1 (acelera y sube la respiración). */
  fear: number;
  /** Cansancio 0..1 por correr. */
  exertion: number;
  /** La Interferencia: posición relativa al oyente (metros, ejes de la escena), volumen 0..1. */
  entity: { dx: number; dz: number; gain: number };
  /** Hacia dónde mira el oyente (yaw de la cámara). */
  yaw: number;
  /** Titileo de los tubos 0..1. */
  flicker: number;
  /** Corte de luz: los tubos (y su zumbido) se apagan. */
  blackout: boolean;
  /** Señal de La Interferencia (signal.ts): la misma que rompe la imagen. */
  signal: { threat: number; burst: number; cut: boolean };
}

export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noise!: AudioBuffer;
  private hum!: GainNode;
  private humOsc: Array<[OscillatorNode, number]> = [];
  private humLevel = { freq: 120, gain: 0.035 };
  private breath!: { gain: GainNode; filter: BiquadFilterNode };
  private staticOut!: { gain: GainNode; panner: PannerNode; filter: BiquadFilterNode };
  private nextBreath = 0;
  private scream: Scream | null = null;
  private inhale = true;

  /** Hay que llamarlo desde un gesto del usuario (click o toque): los navegadores lo exigen. */
  start(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(ctx.destination);

    // 2 s de ruido blanco, reutilizado por todo lo demás.
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    // Zumbido de balasto: 120 Hz con armónicos, filtrado.
    this.hum = ctx.createGain();
    this.hum.gain.value = this.humLevel.gain;
    const humFilter = ctx.createBiquadFilter();
    humFilter.type = 'lowpass';
    humFilter.frequency.value = 1400;
    humFilter.connect(this.hum).connect(this.master);
    for (const [type, ratio, level] of [
      ['sawtooth', 1, 0.5],
      ['sine', 0.5, 0.6],
      ['square', 2.003, 0.08],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = this.humLevel.freq * ratio;
      this.humOsc.push([osc, ratio]);
      const g = ctx.createGain();
      g.gain.value = level;
      osc.connect(g).connect(humFilter);
      osc.start();
    }

    // Respiración: ruido por un pasabanda, con envolventes que se programan en update().
    const breathFilter = ctx.createBiquadFilter();
    breathFilter.type = 'bandpass';
    breathFilter.Q.value = 0.8;
    const breathGain = ctx.createGain();
    breathGain.gain.value = 0;
    this.loopNoise().connect(breathFilter).connect(breathGain).connect(this.master);
    this.breath = { gain: breathGain, filter: breathFilter };

    // Estática de la entidad, ubicada en el espacio.
    const staticFilter = ctx.createBiquadFilter();
    staticFilter.type = 'bandpass';
    staticFilter.frequency.value = 2600;
    staticFilter.Q.value = 0.6;
    const staticGain = ctx.createGain();
    staticGain.gain.value = 0;
    const panner = ctx.createPanner();
    panner.panningModel = 'equalpower';
    panner.distanceModel = 'inverse';
    panner.refDistance = 2;
    panner.rolloffFactor = 1.2;
    this.loopNoise().connect(staticFilter).connect(staticGain).connect(panner).connect(this.master);
    this.staticOut = { gain: staticGain, panner, filter: staticFilter };
  }

  /** Un paso: golpe sordo en la alfombra, más fuerte cuanto más rápido. */
  step(speed: number): void {
    const ctx = this.ctx;
    if (!ctx || speed < 0.1) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 350 + speed * 120 + Math.random() * 80;
    const g = ctx.createGain();
    const level = Math.min(0.5, 0.06 + speed * 0.11);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t, Math.random() * 1.5, 0.15);
  }

  /** Zumbido de los tubos del nivel actual. */
  setHum(hum: { freq: number; gain: number }): void {
    this.humLevel = hum;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const [osc, ratio] of this.humOsc) osc.frequency.setTargetAtTime(hum.freq * ratio, t, 0.1);
  }

  /** Golpe metálico en las cañerías del techo, en una dirección al azar. */
  clank(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const ring = ctx.createBiquadFilter();
    ring.type = 'bandpass';
    ring.frequency.value = 180 + Math.random() * 420;
    ring.Q.value = 18;
    const g = ctx.createGain();
    const level = 0.25 + Math.random() * 0.35;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.2 + Math.random());
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 2 - 1;
    src.connect(ring).connect(g).connect(pan).connect(this.master);
    src.start(t, Math.random(), 2.4);
  }

  /** Golpe de estática al ser atrapado. */
  /** Pausa: congela todo el audio (start() lo reanuda). */
  pause(): void {
    void this.ctx?.suspend();
  }

  /** Empieza el grito (al iniciarse la persecución). */
  screamStart(): void {
    if (this.ctx && !this.scream) this.scream = new Scream(this.ctx, this.master, this.noise);
  }

  /** Termina el grito (escape o retirada). */
  screamStop(): void {
    this.scream?.stop();
    this.scream = null;
  }

  capture(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.scream?.peak();
    this.scream = null;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 2.5);
    src.connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 2.6);
    this.hum.gain.setTargetAtTime(0, t, 0.3);
  }

  update(f: AudioFrame): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;

    // Los tubos parpadean con la entidad cerca.
    const hum = f.blackout ? 0 : this.humLevel.gain * (1 - f.flicker * Math.random());
    this.hum.gain.setTargetAtTime(hum, t, f.blackout ? 0.05 : 0.02);

    // Estática: posición relativa rotada al marco del oyente (el oyente queda fijo en el origen mirando a -z).
    const cos = Math.cos(f.yaw);
    const sin = Math.sin(f.yaw);
    const lx = f.entity.dx * cos - f.entity.dz * sin;
    const lz = f.entity.dx * sin + f.entity.dz * cos;
    setPos(this.staticOut.panner, lx, 0, lz);
    const crackle = (0.6 + 0.4 * Math.random()) * (1 + 1.5 * f.signal.burst);
    this.staticOut.gain.gain.setTargetAtTime(f.signal.cut ? 0 : f.entity.gain * crackle * 0.6, t, 0.01);
    this.scream?.update({ ...f.signal, lx, lz });
    this.staticOut.filter.frequency.setTargetAtTime(1800 + Math.random() * 2400, t, 0.02);

    // Respiración: se oye con miedo o cansancio; más rápida y fuerte cuanto más.
    const level = Math.max(f.fear, f.exertion * 0.7);
    if (level > 0.12 && t >= this.nextBreath) {
      const period = 2.6 - 1.9 * level; // segundos por medio ciclo
      const len = period * 0.8;
      const g = this.breath.gain.gain;
      const peak = 0.05 + 0.2 * level;
      this.breath.filter.frequency.setValueAtTime(this.inhale ? 1500 + 600 * level : 900, t);
      g.cancelScheduledValues(t);
      g.setValueAtTime(0, t);
      g.linearRampToValueAtTime(peak * (this.inhale ? 0.8 : 1), t + len * 0.35);
      g.linearRampToValueAtTime(0, t + len);
      this.nextBreath = t + period;
      this.inhale = !this.inhale;
    }
  }

  private loopNoise(): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.start();
    return src;
  }
}
