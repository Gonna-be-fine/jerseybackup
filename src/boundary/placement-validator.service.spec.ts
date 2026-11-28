import { PlacementValidator } from './placement-validator.service';
import { ColorRegion } from './boundary.types';

const region = (geometry: string, bounds = { x: 0, y: 0, width: 100, height: 100 }): ColorRegion => ({
  id: 'COLOUR_BASE',
  name: 'Base',
  ename: 'Base',
  side: 'front',
  fill: '#000000',
  geometry,
  geometryBounds: bounds,
  matrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
});

describe('PlacementValidator', () => {
  const validator = new PlacementValidator();

  it('accepts an unrotated rectangle fully inside a rectangular SVG panel', () => {
    const result = validator.validate(
      region('M0 0 H100 V100 H0 Z'),
      { x: 20, y: 20, width: 30, height: 30 },
    );
    expect(result.valid).toBe(true);
    expect(result.reason).toBeNull();
    expect(result.placement.rotation).toBe(0);
  });

  it('accepts a rotated rectangle when all four rotated corners remain inside', () => {
    const result = validator.validate(
      region('M0 0 H100 V100 H0 Z'),
      { x: 35, y: 35, width: 30, height: 30, rotation: 45 },
    );
    expect(result.valid).toBe(true);
    expect(result.corners).toHaveLength(4);
  });

  it('rejects a rotated rectangle whose corner crosses the actual path outline', () => {
    const result = validator.validate(
      region('M0 0 H100 V100 H0 Z'),
      { x: 5, y: 35, width: 40, height: 30, rotation: 45 },
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('rectangle-crosses-or-exceeds-path-outline');
  });

  it('rejects a rectangle that crosses the real path outline even if its AABB contains it', () => {
    const result = validator.validate(
      region('M0 0 L100 0 L50 50 L0 100 Z'),
      { x: 65, y: 35, width: 20, height: 20 },
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('rectangle-crosses-or-exceeds-path-outline');
  });

  it('rejects a rotated rectangle whose rotated AABB exceeds the path bounds', () => {
    const result = validator.validate(
      region('M0 0 H100 V100 H0 Z'),
      { x: 5, y: 5, width: 40, height: 40, rotation: 45 },
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('outside-region-bounds');
  });

  it('rejects a rectangle outside the path bounding box without sampling the curve', () => {
    const result = validator.validate(
      region('M0 0 H100 V100 H0 Z'),
      { x: 90, y: 90, width: 20, height: 20 },
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('outside-region-bounds');
  });

  it('rejects non-positive dimensions', () => {
    expect(() =>
      validator.validate(region('M0 0 H100 V100 H0 Z'), {
        x: 10, y: 10, width: 0, height: 20,
      }),
    ).toThrow('width/height must be positive');
  });

  it('applies the SVG transform before checking placement coordinates', () => {
    const transformed = region('M0 0 H100 V100 H0 Z', {
      x: 50, y: 20, width: 100, height: 100,
    });
    transformed.matrix = { a: 1, b: 0, c: 0, d: 1, e: 50, f: 20 };
    const result = validator.validate(transformed, {
      x: 60, y: 30, width: 20, height: 20,
    });
    expect(result.valid).toBe(true);
  });
});
