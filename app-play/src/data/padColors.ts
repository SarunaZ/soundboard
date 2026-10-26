export type PadGradientStops = [string, string];

// Fifteen vivid sample gradients, followed by the prototype's sixteen pastels.
export const PAD_GRADIENTS: PadGradientStops[] = [
  ['#ff5e68', '#ff172c'], ['#ff8c58', '#ff4d43'], ['#ffda57', '#ffae22'], ['#95f46c', '#1bd48c'], ['#3af6d8', '#00b4d9'],
  ['#37c9ff', '#005aff'], ['#9b6aff', '#682bee'], ['#ff5db3', '#fa1583'], ['#ff69ef', '#e516cf'], ['#ff9d93', '#f5507d'],
  ['#65d9ff', '#00aaff'], ['#9ced4a', '#25d72c'], ['#b560ff', '#7433ef'], ['#4ee2f5', '#0475ee'], ['#fc6eb5', '#ee218a'],
  ['#ffc9a9', '#ff9eac'], ['#d3b6ff', '#af91ef'], ['#a4eefa', '#72cbef'], ['#fae5a5', '#f3c778'], ['#ffbedf', '#fca7d0'],
  ['#b7efc7', '#8ed9af'], ['#c1d4ff', '#a0b5fb'], ['#f8b9ea', '#d9b5ff'], ['#a6defd', '#80bee9'], ['#ffd6aa', '#ffb39e'],
  ['#b3ebd5', '#8ddecf'], ['#d6bdfb', '#b4a6f4'], ['#f3efa8', '#ddd48a'], ['#eac4dc', '#cbb0d0'], ['#ffbdc7', '#f29a9e'],
  ['#cbcef9', '#a9b4f6'],
];

function channel(value: number): string { return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0'); }
function hslHex(hue: number, saturation: number, lightness: number): string {
  const s = saturation / 100; const l = lightness / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s; const x = c * (1 - Math.abs((hue / 60) % 2 - 1)); const m = l - c / 2;
  const [r, g, b] = hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
  return `#${channel((r + m) * 255)}${channel((g + m) * 255)}${channel((b + m) * 255)}`;
}

export function padGradientStops(index: number): PadGradientStops {
  if (!Number.isSafeInteger(index) || index < 0) return PAD_GRADIENTS[6]!;
  if (index < PAD_GRADIENTS.length) return PAD_GRADIENTS[index]!;
  const hue = ((index - PAD_GRADIENTS.length) * 137.508 + 28) % 360;
  return [hslHex(hue, 78, 83), hslHex((hue + 13) % 360, 72, 68)];
}

/** Stable non-persisting fallback for clips created before pad colors were saved. */
export function padGradientForClipId(id: string): { color: string; colorEnd: string; colorIndex: number } {
  // FNV-1a keeps the identity tied to the persistent UUID, independent of list order,
  // theme, or the current allocation cursor.
  let hash = 0x811c9dc5;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  const colorIndex = hash % 1_000_001;
  const [color, colorEnd] = padGradientStops(colorIndex);
  return { color, colorEnd, colorIndex };
}
