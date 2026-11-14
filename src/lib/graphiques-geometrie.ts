export const MOTIF_COLORS = ["#17605d", "#24538b", "#71419a", "#a13457", "#a54319", "#806000", "#42692a", "#465466"];

export function chartScale(values: number[]) {
  const maximum = Math.max(0, ...values.map(Math.abs));
  // Une graduation vaut 1, 2 ou 5 fois une puissance de dix, au minimum un euro.
  const target = Math.max(100, maximum / 5);
  const power = 10 ** Math.floor(Math.log10(target));
  const step = ([1, 2, 5, 10].find(factor => factor * power >= target) ?? 10) * power;
  const intervals = Math.max(3, Math.ceil(maximum / step));
  return { maximum: intervals * step, ticks: Array.from({ length: intervals + 1 }, (_, index) => index * step) };
}

export function axisLabels(count: number) {
  const visibleCount = Math.min(count, 12);
  if (visibleCount < 2) return visibleCount ? [0] : [];
  return Array.from({ length: visibleCount }, (_, index) => Math.round(index * (count - 1) / (visibleCount - 1)));
}

export function pieSlices(values: number[]) {
  const total = values.reduce((sum, value) => sum + Math.abs(value), 0);
  let angle = -Math.PI / 2;
  return values.flatMap((value, index) => {
    if (value === 0) return [];
    const ratio = Math.abs(value) / total;
    const start = angle;
    angle += ratio * 2 * Math.PI;
    return [{ index, start, end: angle, ratio, full: ratio === 1 }];
  });
}

export function circlePoint(x: number, y: number, radius: number, angle: number) {
  return { x: x + radius * Math.cos(angle), y: y + radius * Math.sin(angle) };
}

export function motifColor(code: string) {
  return MOTIF_COLORS[Number(code) - 1] ?? MOTIF_COLORS[0];
}

export function formatShare(ratio: number) {
  return `${(ratio * 100).toFixed(1).replace(".", ",")} %`;
}

export function plotPoints(values: number[], width: number, height: number, maximum: number) {
  return values.map((value, index) => ({
    x: width * (index + 0.5) / values.length,
    y: height * (1 - Math.abs(value) / maximum),
  }));
}
