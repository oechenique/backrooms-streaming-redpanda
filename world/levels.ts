// Qué distingue a cada nivel de los Backrooms dentro del mismo generador: una fila por nivel.
// El Nivel 0 tiene los valores del original de TediusTimmy; cambiarlos cambia el mundo (golden).

export interface LevelParams {
  /** Nombre según la wiki. */
  name: string;
  /** Puertas de capa: rand(span) + base. null = el nivel no tiene. */
  doors: { base: number; span: number } | null;
  /** Oficinas / salones: cantidad rand(span) + base, lado rand(span) + min celdas. */
  offices: { base: number; span: number; min: number; sizeSpan: number };
  /** Paredes extra abiertas al final (bucles): rand(span) + base. */
  extraOpenings: { base: number; span: number };
  /** Fracción de paredes por las que se hace noclip (al nivel `noclipTo`). 0 = ninguna. */
  noclipRate: number;
  noclipTo: number | null;
  /** Fracción de esquinas abiertas, sobre una grilla de 3 celdas, con un pilar de concreto. */
  pillarRate: number;
}

export const LEVELS: readonly LevelParams[] = [
  {
    name: 'Nivel 0 — The Lobby',
    doors: { base: 1024, span: 1024 },
    offices: { base: 128, span: 96, min: 8, sizeSpan: 16 },
    extraOpenings: { base: 1024, span: 2048 },
    noclipRate: 1 / 300,
    noclipTo: 1,
    pillarRate: 0,
  },
  {
    // https://backrooms-wiki.wikidot.com/level-1 (CC BY-SA 3.0): salones amplios de concreto con pilares,
    // unidos por pasillos estrechos y laberínticos.
    name: 'Nivel 1 — Habitable Zone',
    doors: null,
    offices: { base: 40, span: 24, min: 16, sizeSpan: 24 },
    extraOpenings: { base: 4096, span: 2048 },
    noclipRate: 0,
    noclipTo: null,
    pillarRate: 0.7,
  },
];

export function levelParams(level: number): LevelParams {
  const p = LEVELS[level];
  if (!p) throw new Error(`nivel desconocido: ${level}`);
  return p;
}
