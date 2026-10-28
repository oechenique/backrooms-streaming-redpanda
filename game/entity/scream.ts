// El grito de La Interferencia. Todo procedural con WebAudio: ni grabaciones ni muestras. Diseño propio.
//
// Firma (lo que lo hace reconocible siempre igual):
// - dos voces en tritono (1 : √2) filtradas por formantes que no son de garganta humana;
// - arranque: un alarido que sube desde abajo en 0,35 s y se corta dos veces seguidas;
// - quiebres de voz: saltos de tono cortos hacia intervalos fijos;
// - debajo, un gruñido sub modulado a 37 Hz; encima, feedback de radio, zumbido eléctrico y bitcrush.
//
// La proximidad (threat, 0..1, de signal.ts) cambia el timbre, no solo el volumen: sube el tono y lo desafina, abre
// los formantes, suma armónicos inarmónicos, satura y cuantiza la señal, acelera el vibrato y el tremolo, y hace más
// frecuentes los quiebres. Las ráfagas y cortes de la señal (los mismos que rompen la imagen) entran acá también.

const BREAK_RATIOS = [0.71, 1.26, 1.5, 0.84, 1.68];
const TRITONE = Math.SQRT2;

export interface ScreamInput {
  threat: number;
  burst: number;
  cut: boolean;
  /** Posición de la entidad en el marco del oyente (metros; -z = adelante). */
  lx: number;
  lz: number;
}

export class Scream {
  private readonly sources: AudioScheduledSourceNode[] = [];
  private readonly all: AudioNode[] = [];
  private readonly pitch: ConstantSourceNode;
  private readonly oscs: Array<{ osc: OscillatorNode; spread: number }> = [];
  private readonly formants: BiquadFilterNode[] = [];
  private readonly rasp: BiquadFilterNode;
  private readonly raspGain: GainNode;
  private readonly harm: GainNode;
  private readonly sub: GainNode;
  private readonly drive: GainNode;
  private readonly clean: GainNode;
  private readonly crush: GainNode;
  private readonly fb: OscillatorNode;
  private readonly fbGain: GainNode;
  private readonly radio: BiquadFilterNode;
  private readonly radioGain: GainNode;
  private readonly elecGain: GainNode;
  private readonly vibRate: OscillatorNode;
  private readonly vibDepth: GainNode;
  private readonly tremRate: OscillatorNode;
  private readonly tremDepth: GainNode;
  private readonly trem: GainNode;
  private readonly gate: GainNode;
  private readonly env: GainNode;
  private readonly panner: PannerNode;
  private breakUntil = 0;
  private onsetUntil = 0;
  private stopped = false;

  constructor(
    private readonly ctx: AudioContext,
    destination: AudioNode,
    noise: AudioBuffer,
  ) {
    const t = ctx.currentTime;
    const node = <T extends AudioNode>(n: T): T => (this.all.push(n), n);
    const gain = (v: number) => {
      const g = node(ctx.createGain());
      g.gain.value = v;
      return g;
    };
    const filter = (type: BiquadFilterType, freq: number, q: number) => {
      const f = node(ctx.createBiquadFilter());
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      return f;
    };
    const osc = (type: OscillatorType, freq: number) => {
      const o = node(ctx.createOscillator());
      o.type = type;
      o.frequency.value = freq;
      this.sources.push(o);
      return o;
    };

    // Salida: tremolo → corte → envolvente → espacio.
    this.panner = node(ctx.createPanner());
    this.panner.panningModel = 'equalpower';
    this.panner.distanceModel = 'inverse';
    this.panner.refDistance = 3;
    this.panner.rolloffFactor = 0.6; // el volumen sube poco con la cercanía: lo que cambia es el timbre
    const level = gain(0.55);
    this.panner.connect(level).connect(destination);
    this.env = gain(0);
    this.gate = gain(1);
    this.trem = gain(1);
    this.trem.connect(this.gate).connect(this.env).connect(this.panner);
    const post = gain(0.32);
    post.connect(this.trem);

    // Tono: una constante que mueve la frecuencia de todos los osciladores con su relación fija.
    this.pitch = node(ctx.createConstantSource());
    this.pitch.offset.value = 400;
    this.sources.push(this.pitch);
    const voiced = (type: OscillatorType, ratio: number, spread: number) => {
      const o = osc(type, 0);
      const r = gain(ratio);
      this.pitch.connect(r).connect(o.frequency);
      this.oscs.push({ osc: o, spread });
      return o;
    };

    // Vibrato compartido (en cents) y tremolo de amplitud.
    this.vibRate = osc('sine', 7);
    this.vibDepth = gain(30);
    this.vibRate.connect(this.vibDepth);
    this.tremRate = osc('sine', 5);
    this.tremDepth = gain(0.2);
    this.tremRate.connect(this.tremDepth).connect(this.trem.gain);

    // Saturación + cuantización.
    this.drive = gain(1);
    const shaper = node(ctx.createWaveShaper());
    shaper.curve = curve((x) => Math.tanh(3 * x) / Math.tanh(3));
    const crusher = node(ctx.createWaveShaper());
    crusher.curve = curve((x) => Math.round(x * 6) / 6);
    this.clean = gain(1);
    this.crush = gain(0);
    this.drive.connect(shaper);
    shaper.connect(this.clean).connect(post);
    shaper.connect(crusher).connect(this.crush).connect(post);

    // Voz: dos sierras en tritono por tres formantes en paralelo.
    const voice = gain(0.5);
    voiced('sawtooth', 1, 1).connect(voice);
    voiced('sawtooth', TRITONE, -1).connect(voice);
    for (const [f, q, g] of [
      [800, 7, 1],
      [1500, 7, 0.7],
      [3000, 6, 0.4],
    ]) {
      const bp = filter('bandpass', f, q);
      this.formants.push(bp);
      voice.connect(bp).connect(gain(g)).connect(this.drive);
    }

    // Armónicos inarmónicos, más fuertes cuanto más cerca.
    this.harm = gain(0);
    voiced('square', 3, 3).connect(this.harm);
    voiced('sawtooth', 4.73, -4).connect(this.harm);
    this.harm.connect(this.drive);

    // Gruñido: sub una octava abajo, modulado en amplitud a 37 Hz.
    const growl = gain(0.5);
    const growlLfo = osc('square', 37);
    growlLfo.connect(gain(0.5)).connect(growl.gain);
    this.sub = gain(0.3);
    voiced('square', 0.5, 0.5).connect(growl).connect(this.sub).connect(this.drive);
    for (const { osc: o } of this.oscs) this.vibDepth.connect(o.detune);

    // Ruido: aspereza de garganta, radio mal sintonizada y zumbido eléctrico a 60 Hz.
    const src = node(ctx.createBufferSource());
    src.buffer = noise;
    src.loop = true;
    this.sources.push(src);
    this.rasp = filter('bandpass', 800, 2.5);
    this.raspGain = gain(0.25);
    src.connect(this.rasp).connect(this.raspGain).connect(this.drive);
    this.radio = filter('bandpass', 2000, 30);
    this.radioGain = gain(0);
    src.connect(this.radio).connect(this.radioGain).connect(post);
    const elecAm = gain(0.5);
    osc('square', 60).connect(gain(0.5)).connect(elecAm.gain);
    this.elecGain = gain(0);
    src.connect(filter('highpass', 2500, 0.7)).connect(elecAm).connect(this.elecGain).connect(post);

    // Feedback de radio: un pito agudo que se desliza.
    this.fb = osc('sine', 2600);
    this.fbGain = gain(0);
    this.fb.connect(this.fbGain).connect(post);

    for (const s of this.sources) s.start(t);
    this.onset(t);
  }

  // La firma del arranque: alarido que sube desde abajo, con dos cortes seguidos.
  private onset(t: number): void {
    const f0 = 400;
    this.pitch.offset.setValueAtTime(f0 * 0.55, t);
    this.pitch.offset.exponentialRampToValueAtTime(f0 * 1.35, t + 0.35);
    this.breakUntil = t + 0.6;
    this.onsetUntil = t + 0.6;
    this.env.gain.setValueAtTime(0, t);
    this.env.gain.linearRampToValueAtTime(1, t + 0.06);
    for (const at of [0.4, 0.55]) {
      this.gate.gain.setValueAtTime(0, t + at);
      this.gate.gain.setValueAtTime(1, t + at + 0.045);
    }
  }

  update(s: ScreamInput): void {
    if (this.stopped) return;
    const t = this.ctx.currentTime;
    const th = s.threat;
    const r = Math.random;
    const set = (p: AudioParam, v: number, tc = 0.05) => p.setTargetAtTime(v, t, tc);

    // Tono base: sube con la cercanía. Quiebres de voz cada vez más seguidos.
    const f0 = 380 + 520 * th;
    if (t >= this.breakUntil) {
      if (r() < (1.5 + 6 * th) / 60) {
        const ratio = BREAK_RATIOS[Math.floor(r() * BREAK_RATIOS.length)];
        this.pitch.offset.cancelScheduledValues(t);
        this.pitch.offset.setValueAtTime(f0 * ratio, t);
        this.breakUntil = t + 0.06 + 0.1 * r();
      } else set(this.pitch.offset, f0, 0.08);
    }

    // Desafinación: cada voz se va para su lado, más cuanto más cerca.
    for (const { osc, spread } of this.oscs) set(osc.detune, spread * (5 + 60 * th) * (0.5 + r()), 0.1);
    set(this.vibRate.frequency, 6 + 8 * th);
    set(this.vibDepth.gain, 20 + 120 * th);

    // Formantes que se abren y tiemblan.
    const wob = () => 0.92 + 0.16 * r();
    set(this.formants[0].frequency, (650 + 500 * th) * wob());
    set(this.formants[1].frequency, (1100 + 1500 * th) * wob());
    set(this.formants[2].frequency, (2700 + 1200 * th) * wob());
    set(this.rasp.frequency, f0 * 2);
    set(this.raspGain.gain, 0.25 + 0.4 * th);

    // Armónicos, sub, saturación y cuantización.
    set(this.harm.gain, 0.02 + 0.5 * th * th);
    set(this.sub.gain, 0.3 + 0.2 * th);
    set(this.drive.gain, 1 + 14 * th + 8 * s.burst, 0.03);
    set(this.clean.gain, 1 - 0.6 * th);
    set(this.crush.gain, 0.6 * th + 0.3 * s.burst, 0.02);

    // Radio y electricidad: siguen a las ráfagas de la señal.
    if (s.burst > 0.6) this.radio.frequency.setValueAtTime(800 + 4200 * r(), t);
    set(this.radioGain.gain, 0.05 + 0.3 * s.burst, 0.02);
    set(this.fb.frequency, (2400 + 1800 * th) * (0.97 + 0.06 * r()), 0.2);
    set(this.fbGain.gain, 0.02 + 0.18 * th * th + 0.2 * s.burst, 0.03);
    set(this.elecGain.gain, 0.03 + 0.15 * th + 0.3 * s.burst, 0.02);

    // Pulsaciones y cortes abruptos (los mismos de la imagen).
    set(this.tremRate.frequency, 5 + 10 * th);
    set(this.tremDepth.gain, 0.2 + 0.6 * th);
    set(this.trem.gain, 1 - (0.2 + 0.6 * th) / 2);
    if (t >= this.onsetUntil) set(this.gate.gain, s.cut ? 0 : 1, 0.003); // no pisa los cortes del arranque

    setPos(this.panner, s.lx, 0, s.lz);
  }

  /** Clímax al atrapar: todo al máximo y se apaga. */
  peak(): void {
    const t = this.ctx.currentTime;
    this.drive.gain.setTargetAtTime(30, t, 0.02);
    this.crush.gain.setTargetAtTime(1, t, 0.02);
    this.pitch.offset.setTargetAtTime(1400, t, 0.1);
    this.stop(1.4);
  }

  /** Se apaga cayendo de tono y libera los nodos. */
  stop(after = 0): void {
    if (this.stopped) return;
    this.stopped = true;
    const t = this.ctx.currentTime + after;
    this.env.gain.cancelScheduledValues(t);
    this.env.gain.setTargetAtTime(0, t, 0.15);
    this.pitch.offset.setTargetAtTime(150, t, 0.25);
    for (const s of this.sources) s.stop(t + 1.2);
    setTimeout(() => this.all.forEach((n) => n.disconnect()), (after + 1.5) * 1000);
  }
}

function curve(f: (x: number) => number): Float32Array<ArrayBuffer> {
  const c = new Float32Array(2048);
  for (let i = 0; i < c.length; i++) c[i] = f((i / (c.length - 1)) * 2 - 1);
  return c;
}

// Safari viejo no tiene positionX/Y/Z como AudioParam.
export function setPos(p: PannerNode, x: number, y: number, z: number): void {
  if (p.positionX) {
    p.positionX.value = x;
    p.positionY.value = y;
    p.positionZ.value = z;
  } else {
    p.setPosition(x, y, z);
  }
}
