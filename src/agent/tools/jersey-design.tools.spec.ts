import { JerseyDesignTools } from './jersey-design.tools';
import { ResourcesService } from '../../resources/resources.service';
import { ImageGenerationService } from '../../image-generation/image-generation.service';

describe('JerseyDesignTools', () => {
  const resources = {
    searchResources: jest.fn().mockResolvedValue({
      total: 1,
      items: [
        {
          id: 12,
          name: 'Falcon Crest',
          category: { name: 'Mascot' },
          tags: 'falcon,bird',
          hasPng: true,
          relativePath: 'mascot/falcon.svg',
        },
      ],
    }),
  };
  const imageGeneration = {
    generateImage: jest.fn().mockResolvedValue('data:image/png;base64,generated'),
  };

  let service: JerseyDesignTools;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new JerseyDesignTools(
      resources as unknown as ResourcesService,
      imageGeneration as unknown as ImageGenerationService,
    );
  });

  it('searches the reusable asset library and returns compact metadata', async () => {
    const [searchAssets] = service.getLangChainTools();
    const searchTool = searchAssets as any;
    const result = JSON.parse(
      String(await searchTool.invoke({ keyword: 'falcon', limit: 3 })),
    );

    expect(resources.searchResources).toHaveBeenCalledWith('falcon', 1, 3);
    expect(result.items[0]).toMatchObject({
      id: 12,
      name: 'Falcon Crest',
      category: 'Mascot',
      hasPng: true,
    });
    expect(result.items[0].svgUrl).toContain('/resources/mascot/falcon.svg');
  });

  it('generates a badge without returning image bytes to the model', async () => {
    const [, generateBadge] = service.getLangChainTools();
    const generateBadgeTool = generateBadge as any;
    const result = JSON.parse(
      String(
        await generateBadgeTool.invoke({
          prompt: 'A fierce falcon crest with angular wings',
          aspectRatio: '1:1',
        }),
      ),
    );

    expect(imageGeneration.generateImage).toHaveBeenCalledWith(
      expect.stringContaining('A fierce falcon crest'),
      '1:1',
    );
    expect(result).toMatchObject({
      mimeType: 'image/png',
      status: 'generated',
    });
    expect(result.assetId).toBeTruthy();
    expect(JSON.stringify(result)).not.toContain('base64');

    const asset = service.consumeGeneratedAsset(result.assetId);
    expect(asset?.dataUrl).toBe('data:image/png;base64,generated');
    expect(service.consumeGeneratedAsset(result.assetId)).toBeUndefined();
  });
});
