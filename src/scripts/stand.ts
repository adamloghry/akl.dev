// stand.ts: a resize-stable stand. forest.js stays byte-identical to the handoff (AC-REF-1), so this wraps it.
// buildForest draws every layer from one PRNG stream, so a different count in one layer shifts every later layer.
// Here each layer gets its own stream, seeded from (seed, layer index): element i of a layer comes out the same
// whatever that layer's count, so growing a count only appends and shrinking only drops from the end.
import { DEFAULT_CONFIG, buildForest } from './forest.js';

type Config = typeof DEFAULT_CONFIG;

// murmur3 fmix32: a bijective 32-bit avalanche, so nearby seeds and layers land on unrelated streams.
function mix(h: number): number {
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  return (h ^ h >>> 16) >>> 0;
}
export const layerSeed = (seed: number, li: number) => mix(mix(seed >>> 0) + Math.imul(li + 1, 0x9e3779b9));

/** Fill `stand` with one ridge plus every layer, back to front. Same contract as buildForest; returns element count. */
export function buildStand(stand: Element, seed: number, cfg: Config = DEFAULT_CONFIG): number {
  const out = document.createDocumentFragment();
  let count = 1;
  cfg.layers.forEach((_, li) => {
    // Every other layer at count 0: it consumes no random numbers, and this layer keeps its index (colour --l{li},
    // grow stagger li * layerStagger).
    const only = { ...cfg, layers: cfg.layers.map((L, j) => (j === li ? L : { ...L, count: 0 })) };
    const part = document.createDocumentFragment();
    count += buildForest(part, layerSeed(seed, li), only) - 1;
    if (li > 0) part.firstChild!.remove(); // each call draws a ridge; keep only the first, as the stand's first child
    out.appendChild(part);
  });
  stand.appendChild(out);
  return count;
}
