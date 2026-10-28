/// <reference types="vite/client" />
// El contrato visto desde el juego: lo que emite Events tiene que pasar contracts/event.schema.json, y los ejemplos
// compartidos con el collector (contracts/examples) tienen que dar lo mismo acá que en Python.

import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import invalid from '../contracts/examples/invalid.json';
import valid from '../contracts/examples/valid.json';
import schema from '../contracts/event.schema.json';
import { Events, type EventData, type EventType, type GameEvent } from './events';

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);
const check = (e: unknown) => (validate(e) ? [] : (validate.errors ?? []).map((x) => `${x.instancePath} ${x.message}`));

// Un `data` realista por tipo, con la forma exacta que arma main.ts (EventData lo hace cumplir al compilar).
const CHASE = '3c59dc04-8f5e-4c3b-a1d2-77b5f0e3a9c4';
const SAMPLE: { [T in EventType]: Array<EventData[T]> } = {
  sesion_inicio: [{ zona: '1678276017,1102950239,1119679029' }],
  sesion_fin: [{ motivo: 'salida' }, { motivo: 'captura' }],
  posicion: [{ velocidad: 3.4, humor: 'hunt' }],
  zona_cambio: [
    { zona: '1,2,3', via: 'caminando' },
    { zona: '1,2,4', via: 'puerta' },
    { zona: '1,2,3', via: 'noclip' },
  ],
  laberinto_cambio: [{ bloque_x: 429638660480, bloque_y: 282355261232, bloque_lado: 16, capa_antes: 1119679029, capa_despues: 1119679028 }],
  aparicion: [{ distancia_m: 9.5 }, { distancia_m: null }],
  deteccion: [{ distancia_m: 17.1 }],
  persecucion_inicio: [{ persecucion_id: CHASE, distancia_m: 11 }],
  escape: [
    { persecucion_id: CHASE, duracion_s: 30.1, via: 'retirada' },
    { persecucion_id: CHASE, duracion_s: 4.2, via: 'noclip' },
  ],
  captura: [
    { persecucion_id: CHASE, duracion_s: 12.3, humor: 'hunt' },
    { persecucion_id: null, duracion_s: 0, humor: 'stalk' },
  ],
  noclip: [{ nivel_origen: 0, nivel_destino: 1 }],
};

describe('contrato de eventos', () => {
  it('el schema y el juego conocen los mismos tipos', () => {
    expect([...schema.properties.type.enum].sort()).toEqual(Object.keys(SAMPLE).sort());
  });

  it('todo lo que emite el juego cumple el contrato (todos los tipos, nivel 0 y 1, con y sin debug)', () => {
    const out: GameEvent[] = [];
    for (const debug of [false, true]) {
      const events = new Events(4294967295, debug ? 'touch' : 'desktop', debug, (e) => out.push(e), false);
      for (const level of [0, 1]) {
        events.level = level;
        for (const type of Object.keys(SAMPLE) as EventType[])
          for (const data of SAMPLE[type]) events.emit(type, { x: 1099511627775.99, y: 0, z: 4294967295 }, data as never);
      }
    }
    expect(out.length).toBeGreaterThan(50);
    for (const e of out) expect(check(e), JSON.stringify(e)).toEqual([]);
  });

  it('los ejemplos válidos compartidos con el collector pasan', () => {
    for (const e of valid) expect(check(e), e.type).toEqual([]);
  });

  it('los ejemplos inválidos compartidos con el collector fallan', () => {
    for (const c of invalid) expect(check(c.evento), c.caso).not.toEqual([]);
  });
});
