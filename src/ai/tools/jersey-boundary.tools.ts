import { BadRequestException, Injectable } from '@nestjs/common';
import { BoundaryService } from '../../boundary/boundary.service';
import { tool } from 'langchain';
import { z } from 'zod';

type JsonSchema = Record<string, unknown>;

export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: JsonSchema;
}

/**
 * Agent-facing tool adapter for jersey SVG boundary operations.
 *
 * The geometry implementation stays in BoundaryService/PlacementValidator.
 * This class only publishes model-readable schemas and dispatches tool calls.
 */
@Injectable()
export class JerseyBoundaryTools {
  constructor(private readonly boundaryService: BoundaryService) {}

  /**
   * LangChain-native tools. Zod is the single source of truth for argument
   * validation. The legacy Gemini declaration adapter remains available for
   * compatibility, but the LangGraph design agent uses these Zod tools.
   */
  getLangChainTools() {
    const getBoundary = tool(
      async ({ productType }) =>
        JSON.stringify(await this.getJerseyBoundary({ productType })),
      {
        name: 'get_jersey_boundary',
        description:
          'Read the actual jersey SVG template. Returns existing editable color-region IDs, image slots, text groups, and their bounds in root SVG viewBox coordinates. Always call this before planning placements. Never assume a semantic color ID exists.',
        schema: z.object({
          productType: z.string().min(1).max(100),
        }),
      },
    );

    const validatePlacement = tool(
      async ({ productType, targetRegion, x, y, width, height, rotation }) =>
        JSON.stringify(
          await this.validateImagePlacement({
            productType,
            targetRegion,
            x,
            y,
            width,
            height,
            rotation,
          }),
        ),
      {
        name: 'validate_image_placement',
        description:
          'Validate whether a rectangular decal/image placement fits completely inside an actual editable SVG color region. Coordinates use root SVG viewBox units. Call this after reading the template boundary; if invalid, adjust the rectangle and retry.',
        schema: z.object({
          productType: z.string().min(1).max(100),
          targetRegion: z.string().min(1).max(128),
          x: z.number(),
          y: z.number(),
          width: z.number().positive(),
          height: z.number().positive(),
          rotation: z.number().optional(),
        }),
      },
    );

    return [getBoundary, validatePlacement];
  }

  getFunctionDeclarations(): GeminiFunctionDeclaration[] {
    return [
      {
        name: 'get_jersey_boundary',
        description:
          'Get the editable color regions and image slots of a jersey SVG template. Use this before planning image placement. Returns root-SVG-coordinate bounds; it does not return raw SVG path data.',
        parameters: {
          type: 'OBJECT',
          properties: {
            productType: {
              type: 'STRING',
              description: 'Jersey template type, for example basketball.',
            },
          },
          required: ['productType'],
        },
      },
      {
        name: 'validate_image_placement',
        description:
          'Check whether an image rectangle, optionally rotated around its center, fits inside one editable jersey color region. Coordinates and dimensions use root SVG viewBox units.',
        parameters: {
          type: 'OBJECT',
          properties: {
            productType: { type: 'STRING' },
            targetRegion: {
              type: 'STRING',
              description: 'An actual editable SVG color-region ID, such as COLOUR_BASE.',
            },
            x: { type: 'NUMBER', description: 'Unrotated rectangle top-left X.' },
            y: { type: 'NUMBER', description: 'Unrotated rectangle top-left Y.' },
            width: { type: 'NUMBER' },
            height: { type: 'NUMBER' },
            rotation: {
              type: 'NUMBER',
              description: 'Optional clockwise rotation in degrees around the rectangle center.',
            },
          },
          required: ['productType', 'targetRegion', 'x', 'y', 'width', 'height'],
        },
      },
    ];
  }

  async execute(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!args || typeof args !== 'object' || Array.isArray(args)) {
      throw new BadRequestException('Tool arguments must be an object.');
    }

    switch (name) {
      case 'get_jersey_boundary':
        return this.getJerseyBoundary(args);
      case 'validate_image_placement':
        return this.validateImagePlacement(args);
      default:
        throw new BadRequestException(`Unknown jersey boundary tool: ${name}`);
    }
  }

  async getJerseyBoundary(args: Record<string, unknown>) {
    const productType = this.requiredString(args.productType, 'productType');
    const context = await this.boundaryService.getBoundary(productType);

    return {
      productType: context.productType,
      viewBox: context.viewBox,
      colorRegions: context.colorRegions.map((region) => ({
        id: region.id,
        name: region.name,
        englishName: region.ename,
        side: region.side,
        fill: region.fill,
        bounds: region.geometryBounds,
      })),
      imageSlots: context.imageSlots.map((slot) => ({
        id: slot.id,
        x: slot.x,
        y: slot.y,
        width: slot.width,
        height: slot.height,
        bounds: slot.bounds,
      })),
      textPathGroups: context.textPaths.map((item) => ({
        groupId: item.groupId,
        purpose: item.purpose,
      })),
      coordinateSystem:
        'All coordinates and bounds are in root SVG viewBox units, not CSS pixels.',
    };
  }

  async validateImagePlacement(args: Record<string, unknown>) {
    const productType = this.requiredString(args.productType, 'productType');
    const targetRegion = this.requiredString(args.targetRegion, 'targetRegion');

    return this.boundaryService.validatePlacement(productType, {
      targetRegion,
      x: this.requiredNumber(args.x, 'x'),
      y: this.requiredNumber(args.y, 'y'),
      width: this.requiredNumber(args.width, 'width'),
      height: this.requiredNumber(args.height, 'height'),
      rotation:
        args.rotation === undefined ? 0 : this.requiredNumber(args.rotation, 'rotation'),
    });
  }

  private requiredString(value: unknown, field: string): string {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException(`Tool argument "${field}" must be a non-empty string.`);
    }
    return value.trim();
  }

  private requiredNumber(value: unknown, field: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new BadRequestException(`Tool argument "${field}" must be a finite number.`);
    }
    return value;
  }
}
