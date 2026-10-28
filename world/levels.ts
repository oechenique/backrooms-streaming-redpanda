// Qué distingue a cada nivel de los Backrooms: una fila por nivel.
// El Nivel 0 usa el laberinto de TediusTimmy con sus valores originales; cambiarlos cambia el mundo (golden).

/** Estacionamiento: todo abierto, con líneas de pared cada `lineEvery` celdas que existen con probabilidad
 *  `lineChance` y alternan tramos de pared y huecos (largos en celdas: rand(span) + min). */
export interface GarageParams {
  lineEvery: number;
  lineChance: number;
  wall: { min: number; span: number };
  gap: { min: number; span: number };
}

export interface LevelParams {
  /** Nombre según la wiki. */
  name: string;
  /** Cómo se arma la zona: el laberinto del original o un estacionamiento abierto (propio). */
  layout: 'maze' | 'garage';
  garage?: GarageParams;
  /** Puertas de capa: rand(span) + base. null = el nivel no tiene. */
  doors: { base: number; span: number } | null;
  /** Oficinas / salones: cantidad rand(span) + base, lado rand(span) + min celdas. */
  offices: { base: number; span: number; min: number; sizeSpan: number };
  /** Paredes extra abiertas al final (bucles): rand(span) + base. */
  extraOpenings: { base: number; span: number };
  /** Fracción de paredes por las que se hace noclip (al nivel `noclipTo`). 0 = ninguna. */
  noclipRate: number;
  noclipTo: number | null;
  /** Fracción de esquinas abiertas, sobre una grilla de `pillarEvery` celdas, con un pilar de concreto. */
  pillarRate: number;
  pillarEvery: number;
}

export const LEVELS: readonly LevelParams[] = [
  {
    name: 'Nivel 0 — The Lobby',
    layout: 'maze',
    doors: { base: 1024, span: 1024 },
    offices: { base: 128, span: 96, min: 8, sizeSpan: 16 },
    extraOpenings: { base: 1024, span: 2048 },
    noclipRate: 1 / 300,
    noclipTo: 1,
    pillarRate: 0,
    pillarEvery: 3,
  },
  {
    // https://backrooms-wiki.wikidot.com/level-1 (CC BY-SA 3.0): según la wiki, el sector por donde se suele entrar
    // desde el Nivel 0 parece un estacionamiento. Acá es un estacionamiento subterráneo infinito: abierto, con una
    // grilla regular de pilares y muy pocas paredes.
    name: 'Nivel 1 — Habitable Zone',
    layout: 'garage',
    garage: { lineEvery: 32, lineChance: 0.5, wall: { min: 6, span: 15 }, gap: { min: 3, span: 6 } },
    doors: null,
    offices: { base: 0, span: 1, min: 8, sizeSpan: 1 },
    extraOpenings: { base: 0, span: 1 },
    noclipRate: 0,
    noclipTo: null,
    pillarRate: 1,
    pillarEvery: 4,
  },
];

export function levelParams(level: number): LevelParams {
  const p = LEVELS[level];
  if (!p) throw new Error(`nivel desconocido: ${level}`);
  return p;
}
