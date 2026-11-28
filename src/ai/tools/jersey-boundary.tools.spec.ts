import { BadRequestException } from '@nestjs/common';
import { BoundaryService } from '../../boundary/boundary.service';
import { JerseyBoundaryTools } from './jersey-boundary.tools';

describe('JerseyBoundaryTools', () => {
  let boundaryService: jest.Mocked<Pick<BoundaryService, 'getBoundary' | 'validatePlacement'>>;
  let tools: JerseyBoundaryTools;

  beforeEach(() => {
    boundaryService = {
      getBoundary: jest.fn(),
      validatePlacement: jest.fn(),
    };
    tools = new JerseyBoundaryTools(boundaryService as unknown as BoundaryService);
  });

  it('publishes Gemini function declarations for boundary lookup and placement validation', () => {
    const declarations = tools.getFunctionDeclarations();
    expect(declarations.map((item) => item.name)).toEqual([
      'get_jersey_boundary',
      'validate_image_placement',
    ]);
    expect(declarations[1].parameters).toHaveProperty('required');
  });

  it('returns a compact boundary summary without raw SVG path data', async () => {
    boundaryService.getBoundary.mockResolvedValue({
      productType: 'basketball',
      sourceFile: 'basketball-jersey.svg',
      viewBox: { x: 0, y: 0, width: 4818, height: 4818 },
      colorRegions: [{
        id: 'COLOUR_BASE',
        name: '基础色',
        ename: 'Base Color',
        side: 'front',
        fill: '#ffffff',
        geometry: 'M0 0 H10 V10 Z',
        geometryBounds: { x: 0, y: 0, width: 10, height: 10 },
        matrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
      }],
      imageSlots: [],
      textPaths: [],
    });

    const result = await tools.execute('get_jersey_boundary', { productType: 'basketball' });
    expect(result).toMatchObject({
      productType: 'basketball',
      colorRegions: [{ id: 'COLOUR_BASE', bounds: { x: 0, y: 0, width: 10, height: 10 } }],
    });
    expect(JSON.stringify(result)).not.toContain('M0 0 H10');
  });

  it('dispatches placement validation to the shared boundary service', async () => {
    boundaryService.validatePlacement.mockResolvedValue({ valid: true } as any);
    await tools.execute('validate_image_placement', {
      productType: 'basketball',
      targetRegion: 'COLOUR_BASE',
      x: 10,
      y: 20,
      width: 30,
      height: 40,
      rotation: 15,
    });

    expect(boundaryService.validatePlacement).toHaveBeenCalledWith('basketball', {
      targetRegion: 'COLOUR_BASE',
      x: 10,
      y: 20,
      width: 30,
      height: 40,
      rotation: 15,
    });
  });

  it('rejects unknown tools and malformed arguments', async () => {
    await expect(tools.execute('missing_tool', {})).rejects.toBeInstanceOf(BadRequestException);
    await expect(tools.execute('get_jersey_boundary', { productType: '' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });
});
