import { describe, expect, it } from "vitest";
import { axisLabels, chartScale, circlePoint, formatShare, pieSlices, plotPoints } from "@/lib/graphiques-geometrie";

describe("géométrie des graphiques", () => {
  it.each([0, 1, 18223, 28328, 581493])("donne 4 à 6 graduations rondes pour %d centimes", maximum => {
    const scale = chartScale([0, -maximum]);
    const step = scale.ticks[1];
    expect(scale.maximum).toBeGreaterThanOrEqual(maximum);
    expect(scale.ticks[0]).toBe(0);
    expect(scale.ticks.length).toBeGreaterThanOrEqual(4);
    expect(scale.ticks.length).toBeLessThanOrEqual(6);
    expect([1, 2, 5]).toContain(step / (10 ** Math.floor(Math.log10(step))));
  });

  it("répartit au plus douze étiquettes avec les extrémités", () => {
    const indexes = axisLabels(62);
    expect(indexes).toHaveLength(12);
    expect(new Set(indexes).size).toBe(12);
    expect(indexes[0]).toBe(0);
    expect(indexes.at(-1)).toBe(61);
    expect(axisLabels(1)).toEqual([0]);
    expect(axisLabels(0)).toEqual([]);
  });

  it("transforme les montants signés en positions au-dessus de l'axe", () => {
    expect(plotPoints([0, -200], 80, 40, 400)).toEqual([{ x: 20, y: 40 }, { x: 60, y: 20 }]);
  });

  it("trace un disque entier pour une part et ignore les zéros", () => {
    expect(pieSlices([0, -18223])).toEqual([{ index: 1, start: -Math.PI / 2, end: 3 * Math.PI / 2, ratio: 1, full: true }]);
    expect(pieSlices([0])).toEqual([]);
    expect(pieSlices([])).toEqual([]);
  });

  it("produit deux demi-cercles pour des montants égaux", () => {
    const slices = pieSlices([-100, -100]);
    expect(slices.map(part => part.ratio)).toEqual([0.5, 0.5]);
    expect(slices[0].end).toBe(slices[1].start);
    expect(slices[1].end - slices[0].start).toBe(2 * Math.PI);
    expect(circlePoint(10, 20, 5, 0)).toEqual({ x: 15, y: 20 });
    expect(formatShare(1 / 3)).toBe("33,3 %");
  });
});
