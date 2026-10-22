/** Converts a CSS color ("#abc", "#aabbcc", "rgb(1 2 3 / 0.5)") to Monaco's hex form. */
export function toHexColor(value: string): string | null {
  const color = value.trim();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(color);
  if (short)
    return `#${short
      .slice(1)
      .map((part) => part + part)
      .join('')}`;
  if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(color)) return color.toLowerCase();
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:\s*[/,]\s*([\d.]+%?))?\s*\)$/i.exec(color);
  if (!rgb) return null;
  const hex = (part: number) => Math.round(part).toString(16).padStart(2, '0');
  const [r, g, b] = [rgb[1], rgb[2], rgb[3]].map(Number) as [number, number, number];
  const alphaText = rgb[4];
  let alpha = '';
  if (alphaText !== undefined) {
    const fraction = alphaText.endsWith('%') ? parseFloat(alphaText) / 100 : parseFloat(alphaText);
    alpha = hex(fraction * 255);
  }
  return `#${hex(r)}${hex(g)}${hex(b)}${alpha}`;
}
