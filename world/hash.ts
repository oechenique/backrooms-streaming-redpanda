/*
Copyright (c) 2022 Thomas DiModica.
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions
are met:
1. Redistributions of source code must retain the above copyright
   notice, this list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright
   notice, this list of conditions and the following disclaimer in the
   documentation and/or other materials provided with the distribution.
3. Neither the name of Thomas DiModica nor the names of other contributors
   may be used to endorse or promote products derived from this software
   without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THOMAS DIMODICA AND CONTRIBUTORS ``AS IS'' AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
ARE DISCLAIMED.  IN NO EVENT SHALL THOMAS DIMODICA OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS
OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT
LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY
OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF
SUCH DAMAGE.
*/

// Portado de TediusTimmy/BackRooms: `harden` de StaffordMix.h ("No rights applicable") y `Mix` de MazeGen8.cpp.
// Cambios: de C++ a TypeScript con BigInt; `mix` recibe la seed y un tipo de RNG (ver abajo).

const MASK64 = (1n << 64n) - 1n;

/**
 * Finalizador de David Stafford, variante 13 (el de SplittableRandom de Java).
 * https://zimbry.blogspot.com/2011/09/better-bit-mixing-improving-on.html
 */
export function harden(z: bigint): bigint {
  z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK64;
  z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK64;
  return z ^ (z >> 31n);
}

/** El `Mix` original: cuatro enteros sin signo de 32 bits → 64 bits, combinados por restas. */
function mix4(a: number, b: number, c: number, d: number): bigint {
  const ha = harden(BigInt(a >>> 0));
  const hb = harden(BigInt(b >>> 0));
  const hc = harden(BigInt(c >>> 0));
  const hd = harden(BigInt(d >>> 0));
  const sub = (x: bigint, y: bigint) => (x - y) & MASK64;
  return harden(sub(sub(harden(sub(ha, hb)), harden(sub(hb, hc))), harden(sub(hc, hd))));
}

/**
 * Tipo de RNG. Cambio respecto del original: separar las costuras horizontales de las verticales evita que
 * `Mix(x, x+1, y, z)` (borde derecho) coincida con `Mix(x, y, y+1, z)` (borde de abajo) cuando y = x + 2,
 * el "poor side behavior" que el autor deja anotado.
 */
export const RngKind = {
  SEAM_X: 1,
  SEAM_Y: 2,
  DOORS: 3,
  INTERIOR: 4,
  START: 5,
} as const;
export type RngKind = (typeof RngKind)[keyof typeof RngKind];

/**
 * `Mix` con seed: el resultado original se sala con la seed y el tipo de RNG. En TediusTimmy la seed solo elegía la
 * zona inicial; acá cambia el mundo entero.
 */
export function mix(seed: number, kind: RngKind, a: number, b: number, c: number, d: number): bigint {
  const salt = harden((harden(BigInt(seed >>> 0)) + BigInt(kind)) & MASK64);
  return harden(mix4(a, b, c, d) ^ salt);
}
