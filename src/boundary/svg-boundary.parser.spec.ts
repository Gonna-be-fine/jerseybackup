import { readFileSync } from 'fs';
import { join } from 'path';
import { SvgBoundaryParser } from './svg-boundary.parser';

describe('SvgBoundaryParser', () => {
  it('extracts boundary metadata from the real basketball jersey template', () => {
    const svgPath = join(
      __dirname,
      '..',
      'sources',
      'boundry',
      'basketball-jersey.svg',
    );
    const svg = readFileSync(svgPath, 'utf8');
    const parser = new SvgBoundaryParser();

    const result = parser.parse(
      svg,
      'basketball',
      'basketball-jersey.svg',
    );

    expect(result.viewBox).toEqual({
      x: 0,
      y: 0,
      width: 4818,
      height: 4818,
    });

    expect(result.colorRegions.map((region) => region.id)).toEqual([
      'COLOUR_BASE',
      'COLOUR_PRIMARY',
      'COLOUR_SECONDARY',
      'COLOUR_TERTIARY',
    ]);

    expect(result.colorRegions.every((region) => region.geometryBounds)).toBe(true);
    const baseRegion = result.colorRegions.find((region) => region.id === 'COLOUR_BASE');
    expect(baseRegion?.geometryBounds?.width).toBeGreaterThan(2500);
    expect(baseRegion?.geometryBounds?.height).toBeGreaterThan(3000);

    expect(result.imageSlots).toHaveLength(5);
    expect(result.textPaths).toHaveLength(4);

    const bottomLogo = result.imageSlots.find(
      (slot) => slot.id === 'LOGO_BOTTOM',
    );
    expect(bottomLogo).toBeDefined();
    expect(bottomLogo!.bounds.x).toBeCloseTo(1334.6584, 3);
    expect(bottomLogo!.bounds.y).toBeCloseTo(3435.8538, 3);
    expect(bottomLogo!.bounds.width).toBeCloseTo(695.7, 1);
    expect(bottomLogo!.bounds.height).toBeCloseTo(347.85, 1);
  });

  it('calculates true cubic-curve bounds rather than using control-point bounds', () => {
    const parser = new SvgBoundaryParser();
    const result = parser.parse(
      '<svg viewBox="0 0 20 20"><path id="COLOUR_BASE" d="M0 0 C10 0 10 10 0 10 Z"/></svg>',
      'test',
      'test.svg',
    );

    const bounds = result.colorRegions[0].geometryBounds;
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeCloseTo(0);
    expect(bounds!.y).toBeCloseTo(0);
    expect(bounds!.width).toBeCloseTo(7.5);
    expect(bounds!.height).toBeCloseTo(10);
  });
});
