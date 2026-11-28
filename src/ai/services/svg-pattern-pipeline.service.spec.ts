import { SvgPatternPipelineService } from './svg-pattern-pipeline.service';

describe('SvgPatternPipelineService SVG validation', () => {
  const service = new SvgPatternPipelineService({} as any);
  const validate = (svg: string) =>
    (service as any).validateAndNormalizeSvg(svg, '#ffffff');

  it('accepts a valid editable vector tile', () => {
    const result = validate(
      '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><path d="M 10 10 L 40 10 L 40 40 Z" fill="var(--pattern-color, #ffffff)"/></svg>',
    );

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('rejects scripts and linked resources', () => {
    const result = validate(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><script>alert(1)</script><path d="M 10 10 L 40 10 L 40 40 Z" fill="var(--pattern-color, #ffffff)" href="https://example.com/a.svg"/></svg>',
    );

    expect(result.valid).toBe(false);
    expect(result.issues.join(' ')).toContain('Forbidden SVG element');
    expect(result.issues.join(' ')).toContain('External or linked resources');
  });

  it('rejects paths that exceed the tile safety bounds', () => {
    const result = validate(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><path d="M 0 0 L 400 0 L 400 20 Z" fill="var(--pattern-color, #ffffff)"/></svg>',
    );

    expect(result.valid).toBe(false);
    expect(result.issues.join(' ')).toContain('extends more than 32 units');
  });
});
