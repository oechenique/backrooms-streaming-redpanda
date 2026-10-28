import { describe, expect, it } from 'vitest';
import type { GameEvent } from './events';
import { Outbox, type OutboxDeps } from './outbox';

function event(i: number, pad = 0): GameEvent {
  return { event_id: `e${i}`, data: { relleno: 'x'.repeat(pad) } } as unknown as GameEvent;
}

// Collector de mentira: responde lo que diga `status` (null = no responde) y registra lo que recibe.
function fake(storage = new Map<string, string>()) {
  const state = {
    status: 200 as number | null,
    now: 0,
    posts: [] as GameEvent[][],
    beacons: [] as GameEvent[][],
    beaconOk: true,
  };
  const deps: OutboxDeps = {
    send: async (body) => {
      if (state.status === null) throw new TypeError('Failed to fetch');
      state.posts.push(JSON.parse(body));
      return { ok: state.status < 300, status: state.status };
    },
    beacon: (body) => {
      state.beacons.push(JSON.parse(body));
      return state.beaconOk;
    },
    storage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => void storage.set(k, v) },
    now: () => state.now,
  };
  return { state, deps, storage };
}

describe('cola de eventos', () => {
  it('manda en lotes y vacía la cola cuando el collector confirma', async () => {
    const { state, deps } = fake();
    const outbox = new Outbox(deps);
    for (let i = 0; i < 250; i++) outbox.push(event(i));
    await outbox.flush();
    await outbox.flush();
    expect(state.posts.map((p) => p.length)).toEqual([200, 50]);
    expect(outbox.size).toBe(0);
  });

  it('si el collector no responde, no pierde nada y reintenta con espera creciente', async () => {
    const { state, deps } = fake();
    const outbox = new Outbox(deps);
    outbox.push(event(1));
    outbox.push(event(2));
    state.status = null;
    await outbox.flush();
    expect(outbox.size).toBe(2);
    expect(outbox.waitMs).toBe(2000);
    state.now = 1000;
    await outbox.flush(); // todavía no toca
    expect(state.posts).toHaveLength(0);
    state.now = 2000;
    await outbox.flush(); // falla de nuevo: espera el doble
    expect(outbox.waitMs).toBe(4000);
    state.status = 503; // responde, pero Redpanda no confirmó: también se reintenta
    state.now = 6000;
    await outbox.flush();
    expect(outbox.size).toBe(2);
    state.status = 200;
    state.now = 20_000;
    await outbox.flush();
    expect(outbox.size).toBe(0);
    expect(outbox.waitMs).toBe(0);
  });

  it('lo que llega mientras un envío está en curso no se pierde ni se manda dos veces', async () => {
    const { state, deps } = fake();
    const outbox = new Outbox(deps);
    outbox.push(event(1));
    const pending = outbox.flush();
    outbox.push(event(2));
    await pending;
    expect(state.posts).toEqual([[event(1)]]);
    await outbox.flush();
    expect(state.posts[1]).toEqual([event(2)]);
    expect(outbox.size).toBe(0);
  });

  it('un lote que el collector no puede leer (400) se descarta para no trabar la cola', async () => {
    const { state, deps } = fake();
    const outbox = new Outbox(deps);
    outbox.push(event(1));
    state.status = 400;
    await outbox.flush();
    expect(outbox.size).toBe(0);
  });

  it('la cola sobrevive a una recarga (localStorage)', async () => {
    const { state, deps, storage } = fake();
    const outbox = new Outbox(deps);
    state.status = null;
    outbox.push(event(1));
    await outbox.flush();
    const again = fake(storage);
    const restored = new Outbox(again.deps);
    expect(restored.size).toBe(1);
    await restored.flush();
    expect(again.state.posts).toEqual([[event(1)]]);
  });

  it('al cerrar usa sendBeacon en partes de menos de 60 KB', () => {
    const { state, deps } = fake();
    const outbox = new Outbox(deps);
    for (let i = 0; i < 40; i++) outbox.push(event(i, 4000)); // ~160 KB
    outbox.flushOnExit();
    expect(state.beacons.length).toBeGreaterThanOrEqual(3);
    expect(state.beacons.every((b) => JSON.stringify(b).length < 60_000)).toBe(true);
    expect(state.beacons.flat().map((e) => e.event_id)).toEqual([...Array(40).keys()].map((i) => `e${i}`));
    expect(outbox.size).toBe(0); // el collector venía respondiendo: se dan por entregados
  });

  it('al cerrar con el collector caído, manda el beacon pero guarda todo para la próxima partida', async () => {
    const { state, deps, storage } = fake();
    const outbox = new Outbox(deps);
    outbox.push(event(1));
    state.status = null;
    await outbox.flush();
    outbox.flushOnExit();
    expect(state.beacons).toHaveLength(1);
    expect(JSON.parse(storage.get('backrooms.outbox')!)).toEqual([event(1)]);
  });
});
