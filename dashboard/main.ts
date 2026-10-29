// El mapa de los perdidos: elegís seed, nivel y capa; el laberinto se reconstruye con world/ (si el world_v de los
// datos es el de este generador) y encima van los rastros, las capturas, los escapes y los noclips del Gold.

import { daySeed, getStart, LEVELS, World, WORLD_V } from '../world';
import { loadIndex, loadMapa, type Capa, type Index, type Mapa, type Resumen } from './gold';
import { drawMap, MARK, MARK_SIZE, RAMP_CSS, shape, SURFACE } from './render';
import { fit, toScreen, zoomAt, type View } from './view';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('map');
const ctx = canvas.getContext('2d')!;
const seedSel = $<HTMLSelectElement>('seed');
const seedInput = $<HTMLInputElement>('seed-custom');
const levelSel = $<HTMLSelectElement>('level');
const zSel = $<HTMLSelectElement>('z');
const tooltip = $('tooltip');
const status = $('status');
const warn = $('warn');

const TODAY = daySeed(new Date());

interface State {
  index: Index | null;
  seed: number;
  worldV: number;
  level: number;
  z: number;
  mapa: Mapa | null;
  world: World | null;
  view: View;
}

const url = new URL(location.href);
const num = (k: string) => (/^\d{1,10}$/.test(url.searchParams.get(k) ?? '') ? Number(url.searchParams.get(k)) : null);
const state: State = {
  index: null,
  seed: num('seed') ?? TODAY,
  worldV: num('v') ?? WORLD_V,
  level: Math.min(num('nivel') ?? 0, LEVELS.length - 1),
  z: num('capa') ?? -1,
  mapa: null,
  world: null,
  view: { cx: 0, cy: 0, scale: 10 },
};

const dpr = () => Math.min(2, devicePixelRatio || 1);
const mundo = (): Resumen | undefined => state.index?.mundos.find((m) => m.seed === state.seed && m.world_v === state.worldV);
const capa = (): Capa | null => state.mapa?.capas.find((c) => c.level === state.level && c.z === state.z) ?? null;

// ---------- Dibujo ----------

let queued = false;
function redraw(): void {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    const { walls } = drawMap(ctx, state.view, { world: state.world, level: state.level, z: state.z, capa: capa() });
    status.textContent = state.world && !walls ? 'Acercate para ver el laberinto.' : '';
  });
}

function resize(): void {
  const r = dpr();
  canvas.width = Math.round(innerWidth * r);
  canvas.height = Math.round(innerHeight * r);
  redraw();
}

function frame(): void {
  const c = capa();
  const pts: [number, number][] = c ? [...c.rastros.map(([x, y]) => [x, y] as [number, number]), ...c.marcas.map((m) => [m.x, m.y] as [number, number])] : [];
  const start = getStart(state.seed);
  // En pantallas anchas el panel tapa la izquierda: se encuadra en lo que queda libre a su derecha.
  const panel = $('panel').getBoundingClientRect();
  const left = innerWidth > 560 ? (panel.right + 12) * dpr() : 0;
  const v = fit(pts, canvas.width - left, canvas.height, [start.gx + 0.5, start.gy + 0.5]);
  state.view = { ...v, cx: v.cx - left / 2 / v.scale };
  redraw();
}

// ---------- Panel ----------

const fmtDur = (s: number | null) => (s === null ? '—' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`);
const fmtDate = (iso: string) => iso.slice(0, 16).replace('T', ' ');

function fillSeeds(): void {
  const opts: { value: string; label: string }[] = [];
  const mundos = state.index?.mundos ?? [];
  const today = mundos.find((m) => m.seed === TODAY && m.world_v === WORLD_V);
  opts.push({ value: `${TODAY}:${WORLD_V}`, label: `Hoy · ${TODAY}${today ? ` · ${today.sesiones} ses.` : ''}` });
  for (const m of mundos) {
    if (m === today) continue;
    opts.push({ value: `${m.seed}:${m.world_v}`, label: `${m.seed}${m.world_v !== WORLD_V ? ` (v${m.world_v})` : ''} · ${m.sesiones} ses. · ${fmtDate(m.ultima)}` });
  }
  const cur = `${state.seed}:${state.worldV}`;
  if (!opts.some((o) => o.value === cur)) opts.push({ value: cur, label: `${state.seed} · sin partidas` });
  seedSel.replaceChildren(...opts.map((o) => new Option(o.label, o.value, false, o.value === cur)));
}

function fillLevels(): void {
  levelSel.replaceChildren(...LEVELS.map((l, i) => new Option(l.name, String(i), false, i === state.level)));
}

function fillCapas(): void {
  const start = getStart(state.seed).z;
  const capas = (state.mapa?.capas ?? []).filter((c) => c.level === state.level).sort((a, b) => b.rastros.length - a.rastros.length);
  const opts = capas.map((c) => ({ z: c.z, label: `${c.z}${c.z === start ? ' (arranque)' : ''} · ${c.rastros.length} celdas` }));
  if (!capas.some((c) => c.z === start)) opts.push({ z: start, label: `${start} (arranque) · sin rastros` });
  if (!opts.some((o) => o.z === state.z)) state.z = opts[0].z;
  zSel.replaceChildren(...opts.map((o) => new Option(o.label, String(o.z), false, o.z === state.z)));
}

function fillStats(): void {
  const m = mundo();
  const set = (id: string, v: string) => ($(id).textContent = v);
  set('s-sesiones', m ? String(m.sesiones) : '0');
  set('s-persecuciones', m ? String(m.persecuciones) : '0');
  set('s-captura', m?.pct_captura == null ? '—' : `${Math.round(m.pct_captura)}%`);
  set('s-duracion', fmtDur(m?.duracion_media_s ?? null));
  $('s-detalle').textContent = m
    ? `${m.capturas} capturas · ${m.escapes} escapes · ${m.perdidas} rastros perdidos · ${m.en_curso} en curso` +
      (m.duracion_media_persecucion_s == null ? '' : ` · persecución media ${m.duracion_media_persecucion_s} s`)
    : state.index
      ? 'Nadie se perdió todavía en esta seed.'
      : '';
}

function fillLegend(): void {
  const c = capa();
  const count = (t: keyof typeof MARK) => c?.marcas.filter((m) => m.tipo === t).length ?? 0;
  const items: HTMLElement[] = [];
  const ramp = document.createElement('li');
  ramp.innerHTML = `<span class="ramp" style="background:${RAMP_CSS}"></span> rastros`;
  items.push(ramp);
  for (const [tipo, spec] of Object.entries(MARK) as [keyof typeof MARK, (typeof MARK)[keyof typeof MARK]][]) {
    const li = document.createElement('li');
    const icon = document.createElement('canvas');
    icon.width = icon.height = 28;
    const g = icon.getContext('2d')!;
    g.fillStyle = SURFACE;
    g.fillRect(0, 0, 28, 28);
    shape(g, spec.shape, 14, 14, 18, spec.color);
    li.append(icon, `${spec.label} ${count(tipo)}`);
    items.push(li);
  }
  $('legend').replaceChildren(...items);

  const rows = (c?.marcas ?? []).map((m) => {
    const tr = document.createElement('tr');
    for (const v of [MARK[m.tipo].label, m.detalle ?? '—', fmtDate(m.ts), m.session]) {
      const td = document.createElement('td');
      td.textContent = v;
      tr.append(td);
    }
    return tr;
  });
  if (rows.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="4">Sin marcas en esta capa.</td>';
    rows.push(tr);
  }
  $('table').querySelector('tbody')!.replaceChildren(...rows);
}

// % de captura por versión del cliente: una fila por versión, con una barra (escala fija 0–100 %) para comparar.
function fillVersions(): void {
  const vs = state.index?.versiones ?? [];
  const rows = vs.map((v) => {
    const tr = document.createElement('tr');
    const pct = v.pct_captura;
    const cells = [
      v.client_version,
      String(v.persecuciones),
      null,
      v.distancia_inicial_media_m == null ? '—' : `${v.distancia_inicial_media_m} m`,
    ];
    for (const c of cells) {
      const td = document.createElement('td');
      if (c === null) {
        const wrap = document.createElement('div');
        wrap.className = 'pct';
        const bar = document.createElement('span');
        bar.className = 'bar';
        bar.style.width = `${Math.round((pct ?? 0) * 0.5)}px`;
        wrap.append(bar, pct == null ? '—' : `${Math.round(pct)}%`);
        td.append(wrap);
      } else td.textContent = c;
      tr.append(td);
    }
    tr.title = `${v.capturas} capturas · ${v.escapes} escapes · ${v.perdidas} rastros perdidos · ${v.en_curso} en curso · ${v.sesiones} sesiones`;
    return tr;
  });
  if (rows.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="4">Sin datos todavía.</td>';
    rows.push(tr);
  }
  $('versions').querySelector('tbody')!.replaceChildren(...rows);
}

function fillWarn(): void {
  const msgs: string[] = [];
  if (state.worldV !== WORLD_V)
    msgs.push(`Estos datos son del generador world_v ${state.worldV} y este es el ${WORLD_V}: el laberinto no se puede reconstruir, solo se ven los rastros.`);
  if (!state.index) msgs.push('Todavía no hay Gold (data/gold): levantá docker compose y jugá un rato.');
  warn.hidden = msgs.length === 0;
  warn.textContent = msgs.join(' ');
}

function syncUrl(): void {
  const u = new URL(location.href);
  u.search = '';
  if (state.seed !== TODAY) u.searchParams.set('seed', String(state.seed));
  if (state.worldV !== WORLD_V) u.searchParams.set('v', String(state.worldV));
  if (state.level) u.searchParams.set('nivel', String(state.level));
  u.searchParams.set('capa', String(state.z));
  history.replaceState(null, '', u);
}

/** Después de cambiar seed o world_v: trae el mapa y rearma todo. */
async function loadWorld(): Promise<void> {
  state.world = state.worldV === WORLD_V ? new World(state.seed, 64) : null;
  state.mapa = mundo() ? await loadMapa(state.seed, state.worldV) : null;
  fillSeeds();
  fillStats();
  fillVersions();
  fillWarn();
  changeLayer();
}

function changeLayer(): void {
  fillCapas();
  fillLegend();
  syncUrl();
  frame();
}

seedSel.addEventListener('change', () => {
  const [s, v] = seedSel.value.split(':').map(Number);
  state.seed = s;
  state.worldV = v;
  state.z = -1;
  seedInput.value = '';
  void loadWorld();
});
seedInput.addEventListener('change', () => {
  const raw = seedInput.value.trim();
  if (!/^\d{1,10}$/.test(raw) || Number(raw) > 0xffffffff) return;
  state.seed = Number(raw);
  const known = state.index?.mundos.filter((m) => m.seed === state.seed) ?? [];
  state.worldV = (known.find((m) => m.world_v === WORLD_V) ?? known[0])?.world_v ?? WORLD_V;
  state.z = -1;
  void loadWorld();
});
levelSel.addEventListener('change', () => {
  state.level = Number(levelSel.value);
  state.z = -1;
  changeLayer();
});
zSel.addEventListener('change', () => {
  state.z = Number(zSel.value);
  changeLayer();
});

// ---------- Interacción: arrastrar, rueda, pellizco y tooltip ----------

const pointers = new Map<number, { x: number; y: number }>();
let pinch: { dist: number } | null = null;

const devPos = (e: { clientX: number; clientY: number }) => ({ x: e.clientX * dpr(), y: e.clientY * dpr() });

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, devPos(e));
  canvas.classList.add('dragging');
  tooltip.hidden = true;
});
canvas.addEventListener('pointermove', (e) => {
  const p = devPos(e);
  const prev = pointers.get(e.pointerId);
  if (!prev) return hover(e);
  pointers.set(e.pointerId, p);
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinch) state.view = zoomAt(state.view, canvas.width, canvas.height, (a.x + b.x) / 2, (a.y + b.y) / 2, dist / pinch.dist);
    pinch = { dist };
  } else {
    state.view = { ...state.view, cx: state.view.cx - (p.x - prev.x) / state.view.scale, cy: state.view.cy - (p.y - prev.y) / state.view.scale };
  }
  redraw();
});
const up = (e: PointerEvent) => {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
  if (pointers.size === 0) canvas.classList.remove('dragging');
};
canvas.addEventListener('pointerup', up);
canvas.addEventListener('pointercancel', up);
canvas.addEventListener('pointerleave', () => (tooltip.hidden = true));
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const p = devPos(e);
    state.view = zoomAt(state.view, canvas.width, canvas.height, p.x, p.y, Math.exp(-e.deltaY * 0.0015));
    redraw();
  },
  { passive: false },
);

const zoomBy = (f: number) => {
  state.view = zoomAt(state.view, canvas.width, canvas.height, canvas.width / 2, canvas.height / 2, f);
  redraw();
};
$('zoom-in').addEventListener('click', () => zoomBy(1.5));
$('zoom-out').addEventListener('click', () => zoomBy(1 / 1.5));
$('zoom-fit').addEventListener('click', frame);

// Tooltip: la marca más cercana al cursor, con un área de toque más grande que la marca.
function hover(e: PointerEvent): void {
  const c = capa();
  const p = devPos(e);
  const hit = (MARK_SIZE + 8) * dpr();
  let best: { d: number; m: Capa['marcas'][number] } | null = null;
  for (const m of c?.marcas ?? []) {
    const [x, y] = toScreen(state.view, canvas.width, canvas.height, m.x, m.y);
    const d = Math.hypot(x - p.x, y - p.y);
    if (d < hit && (!best || d < best.d)) best = { d, m };
  }
  if (!best) {
    tooltip.hidden = true;
    return;
  }
  const m = best.m;
  tooltip.textContent = `${MARK[m.tipo].label}${m.detalle ? ` · ${m.detalle}` : ''}\n${fmtDate(m.ts)} UTC\nsesión ${m.session}\ncelda ${Math.floor(m.x)}, ${Math.floor(m.y)}`;
  tooltip.style.left = `${Math.min(e.clientX + 14, innerWidth - 220)}px`;
  tooltip.style.top = `${e.clientY + 14}px`;
  tooltip.hidden = false;
}

addEventListener('resize', resize);

// ---------- Arranque ----------

resize();
fillLevels();
status.textContent = 'Cargando…';
void (async () => {
  try {
    state.index = await loadIndex();
  } catch {
    state.index = null;
  }
  // Sin seed en la URL: la del día si tiene partidas; si no, el mundo con la partida más reciente.
  if (!url.searchParams.has('seed') && state.index && !mundo() && state.index.mundos.length) {
    state.seed = state.index.mundos[0].seed;
    state.worldV = state.index.mundos[0].world_v;
  }
  await loadWorld();
})();
