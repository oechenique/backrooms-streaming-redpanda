/*
 * MIT License
 *
 * Copyright (c) 2026 Liminal contributors
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

// Portado de yerdaulet-damir/liminal, shared/src/director.ts (commit ff9ee5b).
// El "cerebro grande" estilo Alien: Isolation: (estado, sentidos, rng) → estado. El "cerebro chico" (moverse por
// el laberinto) es nuestro, en interferencia.ts.
// Cambios: constantes inline con los valores de liminal; comentarios en español; los umbrales de micrófono pasan a
// ser umbrales de ruido (acá solo hay pasos); un jugador en vez del más cercano de varios.

export type Mood = 'calm' | 'stalk' | 'hunt' | 'retreat';

export const HUNT_MAX_S = 30;
const STALK_TIMEOUT_S = 45;
const CALM_MIN_S = 40;
const CALM_MAX_S = 70;
const RETREAT_MIN_S = 25;
const RETREAT_MAX_S = 40;
const MENACE_NEAR_PER_S = 2; // cerca del jugador
const MENACE_SEEN_PER_S = 4; // cerca y sin paredes en medio
const MENACE_DECAY_PER_S = 1.5;
const MENACE_RETREAT_AT = 70; // válvula de presión
const SUSPICION_HUNT_AT = 9;
const SUSPICION_DECAY_EVERY_S = 4;
/** Debajo de esto el ruido no cuenta. */
export const NOISE_GATE = 0.25;
const NOISE_LOUD = 0.6;
const NOISE_SCREAM = 0.85;

export interface Rng {
  next(): number;
}

export interface Director {
  mood: Mood;
  menace: number; // 0..100
  suspicion: number; // acumulador de ruido
  inStateS: number;
  stateBudgetS: number; // se sortea al entrar a cada estado
  decayAccS: number;
}

export interface Senses {
  /** Distancia de la entidad al jugador, en metros. */
  distM: number;
  /** Lo más fuerte que oye ahora, 0..1, ya atenuado por distancia y paredes. */
  noise: number;
  /** El jugador está cerca y no hay nada sólido en medio. La entidad es ciega: es presencia, no vista. */
  exposed: boolean;
  dtS: number;
}

export function makeDirector(): Director {
  return { mood: 'calm', menace: 0, suspicion: 0, inStateS: 0, stateBudgetS: CALM_MIN_S, decayAccS: 0 };
}

function enter(d: Director, mood: Mood, rng: Rng): void {
  d.mood = mood;
  d.inStateS = 0;
  if (mood === 'calm') d.stateBudgetS = CALM_MIN_S + rng.next() * (CALM_MAX_S - CALM_MIN_S);
  if (mood === 'retreat') d.stateBudgetS = RETREAT_MIN_S + rng.next() * (RETREAT_MAX_S - RETREAT_MIN_S);
  if (mood === 'hunt') d.menace = 0;
  if (mood === 'retreat') d.suspicion = 0; // una corrida no encadena dos cacerías
}

export function tickDirector(d: Director, s: Senses, rng: Rng): void {
  d.inStateS += s.dtS;

  // amenaza: sube cuando está cerca, baja si no
  const near = s.distM < 10;
  const seen = s.exposed;
  d.menace += (near ? MENACE_NEAR_PER_S : 0) * s.dtS + (seen ? MENACE_SEEN_PER_S : 0) * s.dtS;
  if (!near) d.menace -= MENACE_DECAY_PER_S * s.dtS;
  d.menace = Math.max(0, Math.min(100, d.menace));

  // sospecha por ruido: el silencio es seguro
  if (d.mood !== 'retreat') {
    if (s.noise >= NOISE_SCREAM) d.suspicion = SUSPICION_HUNT_AT;
    else if (s.noise >= NOISE_LOUD) d.suspicion += 3 * s.dtS;
    else if (s.noise >= NOISE_GATE) d.suspicion += s.dtS;
  }
  d.decayAccS += s.dtS;
  if (d.decayAccS >= SUSPICION_DECAY_EVERY_S) {
    d.decayAccS = 0;
    d.suspicion = Math.max(0, d.suspicion - 1);
  }

  switch (d.mood) {
    case 'calm':
      if (d.suspicion >= SUSPICION_HUNT_AT) enter(d, 'hunt', rng);
      else if (d.inStateS >= d.stateBudgetS) enter(d, 'stalk', rng);
      break;
    case 'stalk':
      if (d.suspicion >= SUSPICION_HUNT_AT || (seen && d.inStateS > 1)) enter(d, 'hunt', rng);
      else if (d.menace >= MENACE_RETREAT_AT) enter(d, 'retreat', rng);
      else if (d.inStateS >= STALK_TIMEOUT_S) enter(d, 'calm', rng);
      break;
    case 'hunt':
      if (d.inStateS >= HUNT_MAX_S) enter(d, 'retreat', rng);
      break;
    case 'retreat':
      if (d.inStateS >= d.stateBudgetS) enter(d, 'calm', rng);
      break;
  }
}
