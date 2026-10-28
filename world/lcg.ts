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

// Portado de TediusTimmy/BackRooms: la clase JAVA de JAVA.h ("No rights applicable") y `Rand` de MazeGen8.cpp.
// Cambio: el estado de 48 bits se guarda en dos mitades de 24 bits para operar con `number` sin BigInt
// (el generador llama a `rand` cientos de miles de veces por zona). Resultados idénticos bit a bit.

const TWO24 = 0x1000000;
// Multiplicador 0x5DEECE66D de java.util.Random, partido en 24 + 24 bits.
const M_HI = 0x5de;
const M_LO = 0xece66d;

/** LCG de 48 bits de java.util.Random. */
export class Lcg {
  private hi: number;
  private lo: number;

  constructor(seed: bigint) {
    this.lo = Number(seed & 0xffffffn);
    this.hi = Number((seed >> 24n) & 0xffffffn);
  }

  /** Avanza el estado y lo devuelve como entero de 48 bits (exacto en un double). */
  next(): number {
    const { hi, lo } = this;
    const p = lo * M_LO + 0xb; // < 2^48
    const carry = Math.floor(p / TWO24);
    this.lo = p - carry * TWO24;
    this.hi = (hi * M_LO + lo * M_HI + carry) % TWO24; // < 2^49 antes del módulo
    return this.hi * TWO24 + this.lo;
  }

  /**
   * Entero en [0, max) usando los bits altos del estado: `(next() * max) >> 48`.
   * Se calcula como floor((hi*max + floor(lo*max / 2^24)) / 2^24), que da lo mismo sin pasar de 2^53.
   */
  rand(max: number): number {
    this.next();
    return Math.floor((this.hi * max + Math.floor((this.lo * max) / TWO24)) / TWO24);
  }
}
