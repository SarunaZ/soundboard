/** Choose whichever of opaque black or white has the stronger WCAG contrast. */
export function contrastForeground(hex: string): string {
  const channels = hex.slice(1).match(/.{2}/g)?.map((value) => parseInt(value, 16) / 255) ?? [0, 0, 0];
  const [red, green, blue] = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
  const againstBlack = (luminance + 0.05) / 0.05;
  const againstWhite = 1.05 / (luminance + 0.05);
  return againstBlack >= againstWhite ? '#000000' : '#ffffff';
}
