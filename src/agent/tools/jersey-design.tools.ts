import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { tool } from 'langchain';
import { z } from 'zod';
import { ResourcesService } from '../../resources/resources.service';
import { ImageGenerationService } from '../../image-generation/image-generation.service';

export interface GeneratedDesignAsset {
  id: string;
  dataUrl: string;
  mimeType: string;
  prompt: string;
}

@Injectable()
export class JerseyDesignTools {
  private readonly logger = new Logger(JerseyDesignTools.name);
  private readonly generatedAssets = new Map<string, GeneratedDesignAsset>();
  private readonly maxStoredAssets = 20;

  constructor(
    private readonly resourcesService: ResourcesService,
    private readonly imageGenerationService: ImageGenerationService,
  ) {}

  getLangChainTools() {
    const searchAssets = tool(
      async ({ keyword, limit }) => {
        const result = await this.resourcesService.searchResources(
          keyword.trim(),
          1,
          limit,
        );
        return JSON.stringify({
          query: keyword,
          total: result.total,
          items: result.items.map((item) => ({
            id: item.id,
            name: item.name,
            category: item.category?.name || '',
            tags: item.tags || '',
            hasPng: item.hasPng,
            svgUrl: `${process.env.RESOURCE_BASE_URL || 'http://localhost:3000'}/resources/${item.relativePath}`,
          })),
        });
      },
      {
        name: 'search_jersey_assets',
        description:
          'Search the existing reusable SVG decal/emblem library by keyword. Use this before generating a new badge when a suitable existing asset may already exist. Returns asset IDs, names, categories, tags and URLs; it does not return SVG source.',
        schema: z.object({
          keyword: z.string().min(1).max(80),
          limit: z.number().int().min(1).max(8).default(5),
        }),
      },
    );

    const generateBadge = tool(
      async ({ prompt, aspectRatio }) => {
        const safePrompt = [
          'Create a premium sportswear jersey badge/decal graphic.',
          'Isolated centered artwork, clean silhouette, strong contrast, print-ready.',
          'No jersey mockup, no garment, no surrounding scene, no watermark.',
          prompt,
        ].join(' ');
        const dataUrl = await this.imageGenerationService.generateImage(
          safePrompt,
          aspectRatio,
        );
        const id = randomUUID();
        const mimeType = dataUrl.match(/^data:([^;]+);base64,/)?.[1] || 'image/png';
        this.generatedAssets.set(id, { id, dataUrl, mimeType, prompt: safePrompt });
        this.trimGeneratedAssets();
        this.logger.log(`Generated jersey badge asset ${id}`);
        return JSON.stringify({
          assetId: id,
          mimeType,
          aspectRatio,
          status: 'generated',
          note: 'The image is attached to the design result by the backend. Do not reproduce its binary data.',
        });
      },
      {
        name: 'generate_jersey_badge',
        description:
          'Generate a new raster sportswear badge/decal image using the configured image provider (Gemini or ComfyUI). Only call when the user asks for a custom generated badge/decal or the design request explicitly requires one. Return an asset ID; the backend attaches the actual image to the final result.',
        schema: z.object({
          prompt: z.string().min(10).max(1200),
          aspectRatio: z.enum(['1:1', '3:2', '2:3']).default('1:1'),
        }),
      },
    );

    return [searchAssets, generateBadge];
  }

  consumeGeneratedAsset(id: string): GeneratedDesignAsset | undefined {
    const asset = this.generatedAssets.get(id);
    if (asset) this.generatedAssets.delete(id);
    return asset;
  }

  private trimGeneratedAssets() {
    while (this.generatedAssets.size > this.maxStoredAssets) {
      const oldestId = this.generatedAssets.keys().next().value;
      if (!oldestId) return;
      this.generatedAssets.delete(oldestId);
    }
  }
}
