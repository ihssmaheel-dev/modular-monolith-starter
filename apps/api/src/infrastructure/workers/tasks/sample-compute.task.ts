/**
 * Sample worker task for CPU-bound computations offloaded via Piscina.
 * Worker tasks must be pure functions with no NestJS or database imports.
 */

export interface SumNumbersPayload {
  numbers: number[];
}

export interface ChunkProcessPayload {
  items: Array<{ id: string; value: number }>;
  multiplier: number;
}

export function sumNumbers(payload: SumNumbersPayload): number {
  return payload.numbers.reduce((acc, curr) => acc + curr, 0);
}

export function processChunk(payload: ChunkProcessPayload): Array<{ id: string; result: number }> {
  return payload.items.map((item) => ({
    id: item.id,
    result: item.value * payload.multiplier,
  }));
}

export default function defaultCompute(numbers: number[]): number {
  return numbers.reduce((acc, curr) => acc + curr, 0);
}
