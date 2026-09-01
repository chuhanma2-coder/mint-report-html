// Optional authoring helpers: no page layout, template or automatic font shrinking.
export function spreadPorts(box, side, count) {
  if (![box.x, box.y, box.width, box.height, count].every(Number.isFinite) || count < 1 || !Number.isInteger(count) || !['left', 'right', 'top', 'bottom'].includes(side)) throw new Error('Invalid port geometry');
  return Array.from({ length: count }, (_, i) => {
    const t = (i + 1) / (count + 1);
    return { x: box.x + (side === 'left' ? 0 : side === 'right' ? box.width : t * box.width), y: box.y + (side === 'top' ? 0 : side === 'bottom' ? box.height : t * box.height) };
  });
}
export function estimateCjkWidth(text, fontSize) {
  return [...text].reduce((sum, char) => sum + (/[^\u0000-\u00ff]/.test(char) ? 1 : 0.6), 0) * fontSize;
}
