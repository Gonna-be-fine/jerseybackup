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

  it('repairs an invalid SVG and validates the second generation', async () => {
    const invalidSvg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><path d="M 10 10 L 40 10 L 40 40 Z" fill="var(--pattern-color, #ffffff)"/></svg>';
    const validSvg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><path d="M 10 10 L 40 10 L 40 40 Z" fill="var(--pattern-color, #ffffff)"/></svg>';
    const model = {
      invoke: jest
        .fn()
        .mockResolvedValueOnce({ content: invalidSvg })
        .mockResolvedValueOnce({ content: validSvg }),
    };
    const pipeline = new SvgPatternPipelineService({
      createChatModel: () => model,
    } as any);

    const result = await pipeline.generate({ brief: 'Diagonal speed lines' });

    expect(result.attempts).toBe(2);
    expect(result.validation.valid).toBe(true);
    expect(model.invoke).toHaveBeenCalledTimes(2);
  });
});
