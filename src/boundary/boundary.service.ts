import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { BOUNDARY_TEMPLATE_FILES } from './boundary.constants';
import { BoundaryContext } from './boundary.types';
import { PlacementValidator, PlacementRectangle } from './placement-validator.service';
import { SvgBoundaryParser } from './svg-boundary.parser';

@Injectable()
export class BoundaryService {
  private readonly cache = new Map<string, BoundaryContext>();

  constructor(
    private readonly parser: SvgBoundaryParser,
    private readonly placementValidator: PlacementValidator,
  ) {}

  getSupportedProductTypes(): string[] {
    return Object.keys(BOUNDARY_TEMPLATE_FILES);
  }

  async getBoundary(productType: string): Promise<BoundaryContext> {
    const normalizedType = (productType || '').trim().toLowerCase();

    if (!/^[a-z0-9-]+$/.test(normalizedType)) {
      throw new BadRequestException('Invalid productType.');
    }

    const cached = this.cache.get(normalizedType);
    if (cached) return cached;

    const filename = BOUNDARY_TEMPLATE_FILES[normalizedType];
    if (!filename) {
      throw new NotFoundException(
        `No boundary template configured for productType "${normalizedType}".`,
      );
    }

    // Works in both src/boundary during development and dist/boundary after build.
    // nest-cli.json copies src/sources into dist/sources.
    const sourceFile = join(__dirname, '..', 'sources', 'boundry', filename);

    let svg: string;
    try {
      svg = await readFile(sourceFile, 'utf8');
    } catch {
      throw new NotFoundException(
        `Boundary SVG not found: ${filename}. Check the sources/boundry asset path.`,
      );
    }

    const context = this.parser.parse(svg, normalizedType, filename);
    this.cache.set(normalizedType, context);
    return context;
  }

  async validatePlacement(
    productType: string,
    input: PlacementRectangle & { targetRegion: string },
  ) {
    if (!input || typeof input.targetRegion !== 'string' || !input.targetRegion.trim()) {
      throw new BadRequestException('targetRegion is required.');
    }

    const context = await this.getBoundary(productType);
    const region = context.colorRegions.find((item) => item.id === input.targetRegion);
    if (!region) {
      throw new BadRequestException(
        `Color region "${input.targetRegion}" does not exist in this product template.`,
      );
    }

    return this.placementValidator.validate(region, {
      x: input.x,
      y: input.y,
      width: input.width,
      height: input.height,
    });
  }

  clearCache(productType?: string): void {
    if (productType) {
      this.cache.delete(productType.trim().toLowerCase());
      return;
    }
    this.cache.clear();
  }
}
